import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { SerialPort, ReadlineParser } from 'serialport';

const DEFAULT_CONFIG = {
  firebaseBaseUrl: 'https://test1-724ff-default-rtdb.firebaseio.com',
  defaultDeviceId: 'device01',
  baudRate: 115200,
  manualPort: '',
  skipDuplicate: false,
  logToFile: false,
  reconnectDelayMs: 5000,
  firebaseTimeoutMs: 8000
};

const MICROBIT_KEYWORDS = ['micro:bit', 'microbit', 'mbed', 'DAPLink', 'ARM'];
const VALID_STATUSES = new Set(['dark', 'good', 'bright']);
const VALID_ACTIONS = new Set(['auto', 'water', 'fertilizer']);
const WATER_MIN = 40;
const WATER_MAX = 80;
const NUTRITION_MIN = 30;
const NUTRITION_MAX = 70;
const WATER_PER_PRESS = 20;
const NUTRITION_PER_PRESS = 15;
const DEFAULT_WATER = 50;
const DEFAULT_NUTRITION = 50;

let isShuttingDown = false;
let activePort = null;
let readlineInterface = null;
let lastUploadedSignature = '';
let config = DEFAULT_CONFIG;
let plantState = createPlantState(DEFAULT_CONFIG.defaultDeviceId);

function createPlantState(deviceId) {
  return {
    device: deviceId,
    light: 0,
    status: 'unknown',
    water: DEFAULT_WATER,
    nutrition: DEFAULT_NUTRITION
  };
}

async function main() {
  config = await loadConfig();
  readlineInterface = createInterface({ input, output });

  printBanner();
  setupShutdownHandlers();

  while (!isShuttingDown) {
    try {
      const selectedPath = await selectSerialPort(config);

      if (!selectedPath) {
        await waitBeforeReconnect(config.reconnectDelayMs);
        continue;
      }

      await runBridgeSession(selectedPath);
    } catch (error) {
      if (!isShuttingDown) {
        await logMessage(`오류: ${error.message}`);
        console.error(error.message);
        await waitBeforeReconnect(config.reconnectDelayMs);
      }
    }
  }
}

async function loadConfig() {
  try {
    const raw = await fs.readFile('config.json', 'utf8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('config.json을 읽는 중 문제가 발생했습니다. 기본값으로 실행합니다.');
      console.warn(error.message);
      return DEFAULT_CONFIG;
    }

    try {
      await fs.writeFile('config.json', JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n', 'utf8');
      console.log('config.json이 없어 기본 설정 파일을 자동 생성했습니다.');
    } catch {
      console.log('config.json이 없어 기본 설정으로 실행합니다.');
      console.log('필요하면 config.example.json을 config.json으로 복사해 수정하세요.');
    }

    return DEFAULT_CONFIG;
  }
}

function printBanner() {
  console.log('====================================');
  console.log(' micro:bit Firebase Bridge');
  console.log('====================================\n');
  console.log('Firebase:');
  console.log(config.firebaseBaseUrl);
  console.log('\nmicro:bit를 검색하는 중...');
}

async function selectSerialPort(currentConfig) {
  if (currentConfig.manualPort) {
    console.log(`config.json의 manualPort를 사용합니다: ${currentConfig.manualPort}`);
    return currentConfig.manualPort;
  }

  const ports = await SerialPort.list();

  if (ports.length === 0) {
    console.log('\n연결된 시리얼 포트가 없습니다.');
    console.log('micro:bit를 USB로 연결한 뒤 기다려 주세요.');
    return askManualPort();
  }

  const microbitPorts = ports.filter(isLikelyMicrobitPort);

  if (microbitPorts.length === 1) {
    console.log(`micro:bit 포트를 찾았습니다: ${describePort(microbitPorts[0])}`);
    return microbitPorts[0].path;
  }

  if (ports.length === 1) {
    console.log(`사용 가능한 포트가 하나뿐이어서 자동 선택합니다: ${describePort(ports[0])}`);
    return ports[0].path;
  }

  return askPortFromList(ports);
}

function isLikelyMicrobitPort(port) {
  const text = describePort(port).toLowerCase();
  return MICROBIT_KEYWORDS.some((keyword) => text.includes(keyword.toLowerCase()));
}

function describePort(port) {
  return [
    port.path,
    port.friendlyName,
    port.manufacturer,
    port.pnpId
  ]
    .filter(Boolean)
    .join(' - ');
}

async function askPortFromList(ports) {
  console.log('\n연결 가능한 포트\n');
  ports.forEach((port, index) => {
    console.log(`${index + 1}. ${describePort(port)}`);
  });

  const answer = await readlineInterface.question('\n사용할 포트 번호를 입력하세요: ');
  const selectedIndex = Number.parseInt(answer.trim(), 10) - 1;

  if (selectedIndex >= 0 && selectedIndex < ports.length) {
    return ports[selectedIndex].path;
  }

  console.log('올바른 번호가 아닙니다.');
  return null;
}

async function askManualPort() {
  if (!readlineInterface || !process.stdin.isTTY) {
    return null;
  }

  try {
    const answer = await readlineInterface.question('직접 COM 포트를 입력하세요. 다시 검색하려면 Enter를 누르세요: ');
    const manualPort = answer.trim();
    return manualPort || null;
  } catch (error) {
    if (error?.code === 'ERR_USE_AFTER_CLOSE') {
      return null;
    }

    throw error;
  }
}

async function runBridgeSession(portPath) {
  const port = new SerialPort({
    path: portPath,
    baudRate: Number(config.baudRate) || DEFAULT_CONFIG.baudRate,
    autoOpen: false
  });

  activePort = port;

  try {
    await openSerialPort(port);
  } catch (error) {
    activePort = null;
    printPortOpenHelp(error);
    return;
  }

  console.log('\n✓ micro:bit 연결 완료');
  console.log(`포트: ${portPath}`);
  console.log(`속도: ${config.baudRate}\n`);
  console.log('micro:bit 데이터를 기다리는 중...');
  await logMessage(`micro:bit 연결 완료: ${portPath}`);

  const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

  parser.on('data', async (line) => {
    await handleIncomingLine(line);
  });

  await waitForPortCloseOrError(port);

  activePort = null;

  if (!isShuttingDown) {
    console.log('\nmicro:bit 연결이 끊어졌습니다.');
    console.log(`${Math.round(config.reconnectDelayMs / 1000)}초 후 다시 검색합니다.`);
    await logMessage('micro:bit 연결 끊김');
  }
}

function openSerialPort(port) {
  return new Promise((resolve, reject) => {
    port.open((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function waitForPortCloseOrError(port) {
  return new Promise((resolve) => {
    port.once('close', resolve);
    port.once('error', async (error) => {
      await logMessage(`시리얼 오류: ${error.message}`);
      console.error(`\n시리얼 오류: ${error.message}`);
      resolve();
    });
  });
}

function printPortOpenHelp(error) {
  console.log('\n포트를 열 수 없습니다.\n');
  console.log('다음을 확인하세요.');
  console.log('1. micro:bit가 USB로 연결되어 있는지');
  console.log('2. USB 케이블이 데이터 전송을 지원하는지');
  console.log('3. MakeCode 콘솔이나 다른 시리얼 모니터가 실행 중인지');
  console.log('4. 올바른 COM 포트를 선택했는지');
  console.log(`\n원인: ${error.message}`);
}

async function handleIncomingLine(line) {
  const receivedText = line.trim();

  if (!receivedText) {
    return;
  }

  console.log(`\n수신: ${receivedText}`);
  await logMessage(`수신: ${receivedText}`);

  const validation = validateIncomingData(receivedText);

  if (!validation.ok) {
    console.log('✗ JSON 처리 실패');
    console.log(`수신 데이터: ${receivedText}`);
    console.log(`원인: ${validation.reason}`);
    await logMessage(`JSON 처리 실패: ${validation.reason}`);
    return;
  }

  const { action, device, light, status } = validation.data;
  plantState.device = device;

  if (action === 'auto') {
    plantState.light = light;
    plantState.status = status;

    const duplicateSignature = `${plantState.light}|${plantState.status}`;
    if (config.skipDuplicate && duplicateSignature === lastUploadedSignature) {
      console.log('밝기 변화 없음. Firebase 저장을 생략했습니다.');
      await logMessage('밝기 변화 없음. 저장 생략');
      return;
    }

    const uploaded = await uploadToFirebase(buildFirebasePayload());
    if (uploaded) {
      lastUploadedSignature = duplicateSignature;
    }
    return;
  }

  plantState.light = light;
  plantState.status = status;

  if (action === 'water') {
    plantState.water += WATER_PER_PRESS;
    console.log(`수분 +${WATER_PER_PRESS} → ${plantState.water}`);
    await logMessage(`수분 +${WATER_PER_PRESS} → ${plantState.water}`);
  } else if (action === 'fertilizer') {
    plantState.nutrition += NUTRITION_PER_PRESS;
    console.log(`영양 +${NUTRITION_PER_PRESS} → ${plantState.nutrition}`);
    await logMessage(`영양 +${NUTRITION_PER_PRESS} → ${plantState.nutrition}`);
  }

  await uploadToFirebase(buildFirebasePayload());
}

function buildFirebasePayload() {
  return {
    device: plantState.device,
    light: plantState.light,
    status: plantState.status,
    water: plantState.water,
    nutrition: plantState.nutrition,
    updatedAt: Date.now()
  };
}

function validateIncomingData(receivedText) {
  let parsed;

  try {
    parsed = JSON.parse(receivedText);
  } catch {
    return { ok: false, reason: '올바른 JSON 형식이 아닙니다.' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'JSON 객체가 아닙니다.' };
  }

  const light = Number(parsed.light);

  if (!Number.isFinite(light)) {
    return { ok: false, reason: 'light 값이 없거나 숫자가 아닙니다.' };
  }

  if (light < 0 || light > 255) {
    return { ok: false, reason: 'light 값은 0부터 255 사이여야 합니다.' };
  }

  const status = parsed.status ?? 'unknown';
  if (parsed.status !== undefined && !VALID_STATUSES.has(status)) {
    return { ok: false, reason: 'status 값은 dark, good, bright 중 하나여야 합니다.' };
  }

  const action = parsed.action ?? 'auto';
  if (!VALID_ACTIONS.has(action)) {
    return { ok: false, reason: 'action 값은 auto, water, fertilizer 중 하나여야 합니다.' };
  }

  return {
    ok: true,
    data: {
      device: String(parsed.device || config.defaultDeviceId || DEFAULT_CONFIG.defaultDeviceId),
      light,
      status,
      action
    }
  };
}

async function uploadToFirebase(payload) {
  const devicePath = encodeURIComponent(payload.device);
  const baseUrl = config.firebaseBaseUrl.replace(/\/+$/, '');
  const url = `${baseUrl}/plants/${devicePath}.json`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(config.firebaseTimeoutMs) || DEFAULT_CONFIG.firebaseTimeoutMs);

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.log('✗ Firebase 저장 실패');
      console.log(`상태 코드: ${response.status}`);
      console.log(`내용: ${responseText}`);
      await logMessage(`Firebase 저장 실패: ${response.status} ${responseText}`);
      return false;
    }

    console.log('✓ Firebase 저장 완료\n');
    console.log(`장치: ${payload.device}`);
    console.log(`밝기: ${payload.light}`);
    console.log(`상태: ${payload.status}`);
    console.log(`동작: ${payload.action}`);
    console.log(`저장 위치: plants/${payload.device}`);
    await logMessage(`Firebase 저장 완료: plants/${payload.device}`);
    return true;
  } catch (error) {
    const message = error.name === 'AbortError'
      ? 'Firebase 요청 시간이 초과되었습니다.'
      : error.message;

    console.log('✗ Firebase 저장 실패');
    console.log(`내용: ${message}`);
    await logMessage(`Firebase 저장 실패: ${message}`);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function waitBeforeReconnect(delayMs) {
  if (isShuttingDown) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, Number(delayMs) || DEFAULT_CONFIG.reconnectDelayMs));
}

async function logMessage(message) {
  if (!config.logToFile) {
    return;
  }

  try {
    const now = new Date();
    const yyyyMmDd = now.toISOString().slice(0, 10);
    const logDir = path.join(process.cwd(), 'logs');
    const logPath = path.join(logDir, `${yyyyMmDd}.log`);
    await fs.mkdir(logDir, { recursive: true });
    await fs.appendFile(logPath, `[${now.toISOString()}] ${message}\n`, 'utf8');
  } catch {
    // 로그 저장 실패가 수업 진행을 막지 않도록 무시한다.
  }
}

function setupShutdownHandlers() {
  process.on('SIGINT', async () => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    console.log('\n프로그램을 종료합니다.');
    await closeActivePort();
    readlineInterface?.close();
    process.exit(0);
  });
}

async function closeActivePort() {
  if (!activePort || !activePort.isOpen) {
    return;
  }

  await new Promise((resolve) => {
    activePort.close(() => resolve());
  });

  await logMessage('시리얼 포트 닫힘');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
