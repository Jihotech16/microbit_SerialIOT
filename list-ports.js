import { SerialPort } from 'serialport';

function describePort(port) {
  return [
    port.path,
    port.friendlyName,
    port.manufacturer,
    port.pnpId,
    port.vendorId ? `VID:${port.vendorId}` : '',
    port.productId ? `PID:${port.productId}` : ''
  ]
    .filter(Boolean)
    .join(' - ');
}

async function main() {
  try {
    const ports = await SerialPort.list();

    if (ports.length === 0) {
      console.log('연결된 시리얼 포트가 없습니다.');
      console.log('micro:bit USB 연결 상태와 케이블을 확인하세요.');
      return;
    }

    console.log('연결 가능한 포트\n');
    console.table(
      ports.map((port, index) => ({
        번호: index + 1,
        포트: port.path,
        이름: port.friendlyName || '',
        제조사: port.manufacturer || '',
        PNP_ID: port.pnpId || ''
      }))
    );

    console.log('\n상세 정보');
    ports.forEach((port, index) => {
      console.log(`${index + 1}. ${describePort(port)}`);
    });
  } catch (error) {
    console.error('시리얼 포트 목록을 읽을 수 없습니다.');
    console.error(error.message);
    process.exitCode = 1;
  }
}

main();
