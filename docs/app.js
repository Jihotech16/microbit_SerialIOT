const WATER_MIN = 40;
const WATER_MAX = 80;
const NUTRITION_MIN = 30;
const NUTRITION_MAX = 70;
const WATER_PER_PRESS = 20;
const NUTRITION_PER_PRESS = 15;
const DEFAULT_WATER = 50;
const DEFAULT_NUTRITION = 50;

const elements = {
  browserSupport: document.querySelector('#browserSupport'),
  connectionState: document.querySelector('#connectionState'),
  saveState: document.querySelector('#saveState'),
  connectButton: document.querySelector('#connectButton'),
  disconnectButton: document.querySelector('#disconnectButton'),
  testFirebaseButton: document.querySelector('#testFirebaseButton'),
  clearLogButton: document.querySelector('#clearLogButton'),
  firebaseBaseUrl: document.querySelector('#firebaseBaseUrl'),
  defaultDeviceId: document.querySelector('#defaultDeviceId'),
  baudRate: document.querySelector('#baudRate'),
  skipDuplicate: document.querySelector('#skipDuplicate'),
  deviceValue: document.querySelector('#deviceValue'),
  lightValue: document.querySelector('#lightValue'),
  statusValue: document.querySelector('#statusValue'),
  waterValue: document.querySelector('#waterValue'),
  nutritionValue: document.querySelector('#nutritionValue'),
  lastEventValue: document.querySelector('#lastEventValue'),
  logList: document.querySelector('#logList'),
  liveRegion: document.querySelector('#liveRegion')
};

const validStatuses = new Set(['dark', 'good', 'bright']);
const validActions = new Set(['auto', 'water', 'fertilizer']);

let port = null;
let reader = null;
let keepReading = false;
let lastUploadedSignature = '';
let plantState = createPlantState(getSettings().defaultDeviceId);

function createPlantState(deviceId) {
  return {
    device: deviceId,
    light: 0,
    status: '-',
    water: DEFAULT_WATER,
    nutrition: DEFAULT_NUTRITION,
    lastEvent: '-'
  };
}

function initialize() {
  loadSettings();
  loadPlantState();
  bindEvents();
  updateBrowserSupport();
  updateReadout();
  addLog('앱이 준비되었습니다.', 'info');
}

function bindEvents() {
  elements.connectButton.addEventListener('click', connectSerial);
  elements.disconnectButton.addEventListener('click', disconnectSerial);
  elements.testFirebaseButton.addEventListener('click', testFirebase);
  elements.clearLogButton.addEventListener('click', () => {
    elements.logList.innerHTML = '';
    addLog('로그를 지웠습니다.', 'info');
  });

  for (const input of [elements.firebaseBaseUrl, elements.defaultDeviceId, elements.baudRate, elements.skipDuplicate]) {
    input.addEventListener('change', saveSettings);
  }
}

function updateBrowserSupport() {
  if ('serial' in navigator) {
    elements.browserSupport.textContent = 'Web Serial 지원';
    return;
  }

  elements.browserSupport.textContent = 'Chrome/Edge 필요';
  elements.connectButton.disabled = true;
  setState(elements.connectionState, '지원 안 됨', 'error');
  addLog('이 브라우저는 Web Serial API를 지원하지 않습니다. Chrome 또는 Edge에서 HTTPS 또는 localhost로 접속하세요.', 'error');
}

function loadSettings() {
  const saved = JSON.parse(localStorage.getItem('microbitFirebaseSettings') || '{}');

  if (saved.firebaseBaseUrl) {
    elements.firebaseBaseUrl.value = saved.firebaseBaseUrl;
  }

  if (saved.defaultDeviceId) {
    elements.defaultDeviceId.value = saved.defaultDeviceId;
  }

  if (saved.baudRate) {
    elements.baudRate.value = String(saved.baudRate);
  }

  elements.skipDuplicate.checked = Boolean(saved.skipDuplicate);
}

function saveSettings() {
  localStorage.setItem('microbitFirebaseSettings', JSON.stringify(getSettings()));
  addLog('설정을 브라우저에 저장했습니다.', 'info');
}

function getSettings() {
  return {
    firebaseBaseUrl: elements.firebaseBaseUrl.value.trim().replace(/\/+$/, ''),
    defaultDeviceId: elements.defaultDeviceId.value.trim() || 'device01',
    baudRate: Number(elements.baudRate.value) || 115200,
    skipDuplicate: elements.skipDuplicate.checked
  };
}

function getPlantStateKey(deviceId) {
  return `microbitPlantState:${deviceId}`;
}

function loadPlantState() {
  const deviceId = getSettings().defaultDeviceId;
  const saved = JSON.parse(localStorage.getItem(getPlantStateKey(deviceId)) || '{}');

  plantState = {
    device: deviceId,
    light: Number(saved.light) || 0,
    status: saved.status || '-',
    water: Number.isFinite(Number(saved.water)) ? Number(saved.water) : DEFAULT_WATER,
    nutrition: Number.isFinite(Number(saved.nutrition)) ? Number(saved.nutrition) : DEFAULT_NUTRITION,
    lastEvent: saved.lastEvent || '-'
  };
}

function savePlantState() {
  localStorage.setItem(getPlantStateKey(plantState.device), JSON.stringify(plantState));
}

function getWaterLabel(value) {
  if (value < WATER_MIN) {
    return '부족';
  }

  if (value > WATER_MAX) {
    return '과습';
  }

  return '적정';
}

function getNutritionLabel(value) {
  if (value < NUTRITION_MIN) {
    return '부족';
  }

  if (value > NUTRITION_MAX) {
    return '과다';
  }

  return '적정';
}

async function connectSerial() {
  const settings = getSettings();

  try {
    setState(elements.connectionState, '포트 선택 중', 'warn');
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: settings.baudRate });

    keepReading = true;
    elements.connectButton.disabled = true;
    elements.disconnectButton.disabled = false;
    setState(elements.connectionState, '연결됨', 'good');
    addLog(`micro:bit 연결 완료. 속도: ${settings.baudRate}`, 'success');
    readSerialLoop();
  } catch (error) {
    setState(elements.connectionState, '연결 실패', 'error');
    addLog(`연결 실패: ${error.message}`, 'error');
    await safeClosePort();
  }
}

async function readSerialLoop() {
  const textDecoder = new TextDecoderStream();
  const readableClosed = port.readable.pipeTo(textDecoder.writable);
  reader = textDecoder.readable.getReader();
  let buffer = '';

  try {
    while (keepReading) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      buffer += value;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';

      for (const line of lines) {
        await handleLine(line.trim());
      }
    }
  } catch (error) {
    if (keepReading) {
      addLog(`수신 오류: ${error.message}`, 'error');
    }
  } finally {
    reader?.releaseLock();
    reader = null;
    await readableClosed.catch(() => {});

    if (keepReading) {
      setState(elements.connectionState, '연결 끊김', 'error');
      addLog('micro:bit 연결이 끊어졌습니다.', 'error');
      await safeClosePort();
    }
  }
}

async function handleLine(line) {
  if (!line) {
    return;
  }

  addLog(`수신: ${line}`, 'info');

  const result = validateData(line);

  if (!result.ok) {
    addLog(`JSON 처리 실패: ${result.reason}`, 'error');
    return;
  }

  const { action, device, light, status } = result.data;
  plantState.device = device;

  if (action === 'auto') {
    plantState.light = light;
    plantState.status = status;
    updateReadout();

    const signature = `${plantState.light}|${plantState.status}`;
    if (getSettings().skipDuplicate && signature === lastUploadedSignature) {
      addLog('밝기 변화 없음. Firebase 저장을 생략했습니다.', 'info');
      savePlantState();
      return;
    }

    const uploaded = await uploadToFirebase(buildFirebasePayload());
    if (uploaded) {
      lastUploadedSignature = signature;
    }
    savePlantState();
    return;
  }

  plantState.light = light;
  plantState.status = status;

  if (action === 'water') {
    plantState.water += WATER_PER_PRESS;
    plantState.lastEvent = '물 주기';
    addLog(`수분 +${WATER_PER_PRESS} → ${plantState.water} (${getWaterLabel(plantState.water)})`, 'success');
  } else if (action === 'fertilizer') {
    plantState.nutrition += NUTRITION_PER_PRESS;
    plantState.lastEvent = '영양제';
    addLog(`영양 +${NUTRITION_PER_PRESS} → ${plantState.nutrition} (${getNutritionLabel(plantState.nutrition)})`, 'success');
  }

  updateReadout();
  await uploadToFirebase(buildFirebasePayload());
  savePlantState();
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

function validateData(line) {
  let parsed;

  try {
    parsed = JSON.parse(line);
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
  if (parsed.status !== undefined && !validStatuses.has(status)) {
    return { ok: false, reason: 'status 값은 dark, good, bright 중 하나여야 합니다.' };
  }

  const action = parsed.action ?? 'auto';
  if (!validActions.has(action)) {
    return { ok: false, reason: 'action 값은 auto, water, fertilizer 중 하나여야 합니다.' };
  }

  return {
    ok: true,
    data: {
      device: String(parsed.device || getSettings().defaultDeviceId),
      light,
      status,
      action
    }
  };
}

async function uploadToFirebase(payload) {
  const settings = getSettings();
  const url = `${settings.firebaseBaseUrl}/plants/${encodeURIComponent(payload.device)}.json`;

  setState(elements.saveState, '저장 중', 'warn');

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();

    if (!response.ok) {
      setState(elements.saveState, '저장 실패', 'error');
      addLog(`Firebase 저장 실패 ${response.status}: ${text}`, 'error');
      return false;
    }

    setState(elements.saveState, '저장 완료', 'good');
    addLog(`Firebase 저장 완료: plants/${payload.device}`, 'success');
    return true;
  } catch (error) {
    setState(elements.saveState, '저장 실패', 'error');
    addLog(`Firebase 저장 실패: ${error.message}`, 'error');
    return false;
  }
}

async function testFirebase() {
  loadPlantState();
  const payload = buildFirebasePayload();
  payload.updatedAt = Date.now();
  updateReadout();
  await uploadToFirebase(payload);
}

async function disconnectSerial() {
  keepReading = false;
  await reader?.cancel().catch(() => {});
  await safeClosePort();
  setState(elements.connectionState, '대기', 'idle');
  elements.connectButton.disabled = false;
  elements.disconnectButton.disabled = true;
  addLog('연결을 끊었습니다.', 'info');
}

async function safeClosePort() {
  try {
    if (port) {
      await port.close();
    }
  } catch {
    // 이미 닫힌 포트는 무시한다.
  } finally {
    port = null;
  }
}

function updateReadout() {
  elements.deviceValue.textContent = plantState.device;
  elements.lightValue.textContent = plantState.light;
  elements.statusValue.textContent = plantState.status;
  elements.waterValue.textContent = `${plantState.water} (${getWaterLabel(plantState.water)})`;
  elements.nutritionValue.textContent = `${plantState.nutrition} (${getNutritionLabel(plantState.nutrition)})`;
  elements.lastEventValue.textContent = plantState.lastEvent;
}

function setState(element, text, kind) {
  element.textContent = text;
  element.className = `state state-${kind}`;
}

function addLog(message, kind) {
  const item = document.createElement('li');
  const time = new Date().toLocaleTimeString('ko-KR', { hour12: false });

  item.className = 'log-entry';
  item.dataset.kind = kind;
  item.innerHTML = `
    <span class="log-time">${time}</span>
    <span class="log-message"></span>
  `;
  item.querySelector('.log-message').textContent = message;

  elements.logList.prepend(item);
  elements.liveRegion.textContent = message;

  while (elements.logList.children.length > 80) {
    elements.logList.lastElementChild?.remove();
  }
}

initialize();
