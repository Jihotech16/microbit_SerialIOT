# micro:bit Firebase Bridge

micro:bit에서 USB 시리얼로 받은 밝기 데이터를 Windows PC에서 Firebase Realtime Database로 업로드하는 중계 프로그램입니다. 교사 대상 IoT 연수에서 복잡한 설정 없이 `npm start`로 실행하는 것을 목표로 만들었습니다.

## 준비물

* micro:bit
* USB 데이터 케이블
* Windows 10 또는 Windows 11 PC
* Node.js 20 LTS 이상
* Firebase Realtime Database

## 파일 구성

```text
microbit-firebase-bridge/
├─ bridge.js
├─ list-ports.js
├─ microbit-code.ts
├─ package.json
├─ .gitignore
├─ README.md
└─ config.example.json
```

## 설치 및 실행

1. 이 폴더에서 터미널을 엽니다.
2. 패키지를 설치합니다.

```bash
npm install
```

3. 프로그램을 실행합니다.

```bash
npm start
```

실행하면 `config.json`이 없을 때 기본 설정 파일을 자동으로 만듭니다. 직접 수정하고 싶다면 `config.example.json`을 참고하세요.

## 설정 파일

`config.json`에서 다음 값을 바꿀 수 있습니다.

```json
{
  "firebaseBaseUrl": "https://test1-724ff-default-rtdb.firebaseio.com",
  "defaultDeviceId": "device01",
  "baudRate": 115200,
  "manualPort": "",
  "skipDuplicate": false,
  "logToFile": false,
  "reconnectDelayMs": 5000,
  "firebaseTimeoutMs": 8000
}
```

* `firebaseBaseUrl`: Firebase Realtime Database 주소입니다.
* `defaultDeviceId`: micro:bit 데이터에 `device`가 없을 때 사용할 기본 장치 이름입니다.
* `baudRate`: micro:bit 시리얼 통신 속도입니다. 기본값은 `115200`입니다.
* `manualPort`: 자동 검색 대신 특정 포트를 쓰고 싶을 때 `COM5`처럼 적습니다.
* `skipDuplicate`: `true`이면 같은 밝기값과 상태가 연속으로 들어올 때 저장을 생략합니다.
* `logToFile`: `true`이면 `logs` 폴더에 날짜별 로그를 저장합니다.
* `reconnectDelayMs`: 연결이 끊긴 뒤 다시 검색하기까지 기다릴 시간입니다.
* `firebaseTimeoutMs`: Firebase 요청 제한 시간입니다.

## micro:bit 코드 업로드 방법

1. [MakeCode](https://makecode.microbit.org/)에 접속합니다.
2. 새 프로젝트를 만듭니다.
3. JavaScript 탭을 선택합니다.
4. `microbit-code.ts` 내용을 붙여 넣습니다.
5. 다운로드 버튼을 눌러 micro:bit에 넣습니다.

micro:bit 코드는 5초마다 밝기값을 보내고, A 버튼은 `water`, B 버튼은 `check` 동작을 보냅니다.

## 포트 확인

현재 연결된 시리얼 포트 목록을 보려면 다음 명령을 실행합니다.

```bash
npm run ports
```

프로그램은 포트 정보에 `micro:bit`, `microbit`, `mbed`, `DAPLink`, `ARM` 같은 문자열이 있으면 micro:bit로 우선 인식합니다. 자동 검색이 실패하면 터미널에서 사용할 COM 포트 번호를 직접 고를 수 있습니다.

## 정상 실행 예시

```text
====================================
 micro:bit Firebase Bridge
====================================

Firebase:
https://test1-724ff-default-rtdb.firebaseio.com

micro:bit를 검색하는 중...
✓ micro:bit 연결 완료
포트: COM5
속도: 115200

micro:bit 데이터를 기다리는 중...

수신: {"device":"device01","light":151,"status":"good","action":"auto"}
✓ Firebase 저장 완료

장치: device01
밝기: 151
상태: good
동작: auto
저장 위치: plants/device01
```

Firebase에는 다음 주소로 저장됩니다.

```text
https://test1-724ff-default-rtdb.firebaseio.com/plants/device01.json
```

저장 데이터 예시는 다음과 같습니다.

```json
{
  "device": "device01",
  "light": 151,
  "status": "good",
  "action": "auto",
  "updatedAt": 1781740000000
}
```

## 오류 해결

### Node.js 명령을 찾을 수 없음

Node.js가 설치되어 있지 않거나 PATH에 등록되지 않은 상태입니다. Node.js 20 LTS 이상을 설치한 뒤 터미널을 새로 열고 `node -v`와 `npm -v`를 확인하세요.

### npm install 실패

인터넷 연결을 확인하고 다시 실행하세요. 회사나 학교 네트워크에서 npm 접속이 막혀 있다면 다른 네트워크를 사용하거나 관리자에게 npm 레지스트리 접근 허용을 요청해야 합니다.

### COM 포트가 보이지 않음

micro:bit가 USB로 연결되어 있는지 확인하세요. 케이블을 뺐다가 다시 꽂고 `npm run ports`를 실행해 목록을 확인합니다.

### 포트를 열 수 없음

MakeCode 시리얼 콘솔, 다른 시리얼 모니터, 이전에 실행한 중계 프로그램이 같은 포트를 사용 중일 수 있습니다. 해당 프로그램을 종료한 뒤 다시 실행하세요.

### Firebase Permission denied

Firebase Realtime Database 규칙에서 쓰기가 막힌 상태입니다. 연수 테스트 중에는 아래 규칙을 사용할 수 있습니다.

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

중요: 이 규칙은 누구나 데이터베이스를 읽고 쓸 수 있게 합니다. 실습이 끝나면 반드시 인증 기반 규칙으로 변경하세요.

### JSON 처리 실패

micro:bit에서 한 줄 JSON 형식이 아닌 데이터가 들어온 상태입니다. MakeCode 코드가 `serial.writeLine()`으로 아래 형태를 보내는지 확인하세요.

```json
{"device":"device01","light":151,"status":"good","action":"auto"}
```

### micro:bit 데이터가 들어오지 않음

micro:bit에 `microbit-code.ts`가 제대로 업로드되었는지 확인하세요. 자동 측정은 5초마다 전송되므로 잠시 기다려 보세요. A 버튼이나 B 버튼을 눌러 즉시 데이터가 들어오는지도 확인할 수 있습니다.

### MakeCode 시리얼 콘솔과 충돌

MakeCode에서 시리얼 콘솔을 열어 둔 상태면 Windows 중계 프로그램이 같은 COM 포트를 열 수 없습니다. MakeCode 콘솔을 닫고 다시 실행하세요.

### USB 충전 전용 케이블 사용 문제

충전 전용 케이블은 데이터 통신이 되지 않아 COM 포트가 나타나지 않습니다. 데이터 전송을 지원하는 USB 케이블로 바꿔 사용하세요.

## 종료와 재연결

Ctrl+C를 누르면 프로그램이 시리얼 포트를 닫고 종료합니다. micro:bit USB가 빠지면 프로그램은 종료되지 않고 일정 시간 후 포트를 다시 검색합니다.

## 마지막 요약

```bash
npm install
npm start
```

micro:bit에는 `microbit-code.ts`를 MakeCode JavaScript에 붙여 넣고 다운로드하면 됩니다. Firebase 기본 저장 위치는 `plants/device01`이며, 장치 ID가 바뀌면 `plants/{device}` 위치에 저장됩니다.
