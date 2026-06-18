# micro:bit Firebase Web Bridge

micro:bit에서 USB 시리얼로 받은 밝기 데이터를 브라우저에서 바로 읽고 Firebase Realtime Database에 저장하는 웹앱입니다. Chrome 또는 Edge에서 실행하면 별도의 데스크톱 프로그램 없이 “micro:bit 연결” 버튼으로 사용할 수 있습니다.

기존 Windows용 Node 중계 프로그램도 함께 남겨 두었습니다. 연수 현장에서는 웹앱 방식을 먼저 권장합니다.

## 준비물

* micro:bit
* USB 데이터 케이블
* Windows 10 또는 Windows 11 PC
* Chrome 또는 Edge
* Node.js 20 LTS 이상
* Firebase Realtime Database

## 파일 구성

```text
microbit-firebase-bridge/
├─ public/
│  ├─ index.html
│  ├─ styles.css
│  └─ app.js
├─ web-server.js
├─ bridge.js
├─ list-ports.js
├─ microbit-code.ts
├─ package.json
├─ config.example.json
└─ README.md
```

## 웹앱 실행 방법

1. 이 폴더에서 터미널을 엽니다.
2. 패키지를 설치합니다.

```bash
npm install
```

PowerShell 실행 정책 때문에 `npm`이 막히면 Windows에서 아래처럼 실행하세요.

```bash
npm.cmd install
```

3. 웹앱 서버를 실행합니다.

```bash
npm run web
```

또는:

```bash
npm.cmd run web
```

4. Chrome 또는 Edge에서 아래 주소를 엽니다.

```text
http://localhost:5173
```

5. `micro:bit 연결` 버튼을 누르고 micro:bit 포트를 선택합니다.

## 웹앱에서 하는 일

* 브라우저 Web Serial API로 micro:bit USB 시리얼 연결
* `serial.writeLine()`으로 들어오는 한 줄 JSON 수신
* `device`, `light`, `status`, `action` 값 검증
* Firebase REST API에 `PUT` 방식으로 저장
* 최신 수신값과 저장 로그 표시
* Firebase URL, 기본 장치 ID, baud rate, 중복 저장 생략 설정 지원

Firebase 기본 저장 주소:

```text
https://test1-724ff-default-rtdb.firebaseio.com/plants/device01.json
```

장치 ID가 `device02`라면 `plants/device02`에 저장됩니다.

## micro:bit 코드 업로드 방법

1. [MakeCode](https://makecode.microbit.org/)에 접속합니다.
2. 새 프로젝트를 만듭니다.
3. JavaScript 탭을 선택합니다.
4. `microbit-code.ts` 내용을 붙여 넣습니다.
5. 다운로드 버튼을 눌러 micro:bit에 넣습니다.

micro:bit 코드는 5초마다 밝기값을 보내고, A 버튼은 `water`, B 버튼은 `check` 동작을 보냅니다.

전송 예시:

```json
{"device":"device01","light":151,"status":"good","action":"auto"}
```

## Firebase 테스트

웹앱에서 `Firebase 테스트` 버튼을 누르면 현재 설정된 Firebase URL과 기본 장치 ID로 테스트 데이터를 저장합니다. micro:bit 연결 전에 Firebase 규칙이나 주소가 맞는지 빠르게 확인할 수 있습니다.

## 정상 실행 예시

웹앱 로그에 다음과 비슷하게 표시됩니다.

```text
micro:bit 연결 완료. 속도: 115200
수신: {"device":"device01","light":151,"status":"good","action":"auto"}
Firebase 저장 완료: plants/device01
```

## Windows용 Node 중계 프로그램

브라우저 대신 터미널 프로그램으로 실행하고 싶다면 기존 중계 프로그램을 사용할 수 있습니다.

```bash
npm start
```

또는:

```bash
npm.cmd start
```

현재 연결된 시리얼 포트 목록은 아래 명령으로 확인합니다.

```bash
npm run ports
```

## 오류 해결

### Chrome 또는 Edge가 아닌 브라우저에서 연결 버튼이 비활성화됨

Web Serial API는 Chrome 또는 Edge에서 지원됩니다. Firefox, Safari에서는 micro:bit USB 시리얼 연결이 동작하지 않을 수 있습니다.

### `localhost`가 아닌 파일 열기로 실행했을 때 연결이 안 됨

Web Serial API는 보안 컨텍스트에서만 동작합니다. `public/index.html` 파일을 직접 열지 말고 `npm run web`으로 서버를 실행한 뒤 `http://localhost:5173`으로 접속하세요.

### Node.js 명령을 찾을 수 없음

Node.js 20 LTS 이상을 설치한 뒤 터미널을 새로 열고 `node -v`, `npm -v`를 확인하세요.

### npm install 실패

인터넷 연결을 확인하고 다시 실행하세요. 학교 네트워크에서 npm 접속이 막혀 있다면 다른 네트워크를 사용하거나 관리자에게 npm 레지스트리 접근 허용을 요청해야 합니다.

### micro:bit 포트가 보이지 않음

micro:bit가 USB로 연결되어 있는지 확인하세요. 충전 전용 케이블은 데이터 통신이 되지 않으므로 데이터 전송을 지원하는 USB 케이블이 필요합니다.

### 포트를 열 수 없음

MakeCode 시리얼 콘솔, 다른 시리얼 모니터, 기존 Node 중계 프로그램이 같은 포트를 사용 중일 수 있습니다. 해당 프로그램을 종료한 뒤 다시 연결하세요.

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

micro:bit에서 한 줄 JSON 형식이 아닌 데이터가 들어온 상태입니다. `microbit-code.ts`가 MakeCode에 제대로 들어갔는지 확인하세요.

## 보안 안내

이 예제는 연수 실습을 위해 공개 쓰기 규칙을 전제로 합니다. Firebase 비밀키나 비밀번호를 코드에 넣지 않습니다. 실제 서비스나 공개 배포에는 인증 기반 Firebase 규칙을 사용해야 합니다.
