# micro:bit 식물 키우기 — 데이터 흐름 정리

이 문서는 micro:bit 연결 웹앱의 동작 방식을 정리한 것입니다.  
Firebase에서 데이터를 읽고 쓰는 **식물 화면 웹앱**을 만들 때 참고하세요.

---

## 1. 전체 구조

```
micro:bit (센서 + 버튼)
    ↓ USB 시리얼 (JSON 한 줄)
브릿지 (웹앱 app.js 또는 Node bridge.js)
    ↓ Firebase REST PUT
Firebase Realtime Database  →  plants/{deviceId}
    ↓ 읽기/쓰기
식물 화면 웹앱 (새로 만들 예정)
```

| 역할 | 파일 | 하는 일 |
|------|------|---------|
| micro:bit | `microbit-code.ts` | 밝기 측정, 버튼 감지, JSON 전송 |
| 브릿지 (웹) | `public/app.js` | Web Serial로 수신 → 상태 계산 → Firebase 저장 |
| 브릿지 (Node) | `bridge.js` | COM 포트로 수신 → 동일 로직 |
| 식물 화면 (예정) | 새 웹앱 | Firebase만 읽기/쓰기 |

식물 화면은 micro:bit에 직접 연결하지 않습니다. Firebase `plants/{deviceId}` 경로만 다루면 됩니다.

---

## 2. micro:bit 동작

### 자동 전송 (5초마다)

`basic.forever` 루프에서 버튼 입력이 없으면 `action: "auto"`로 전송합니다.

- `input.lightLevel()`로 밝기 측정 (0~255)
- 밝기에 따라 `status` 계산
- JSON 한 줄을 `serial.writeLine()`으로 전송

### 버튼 A / B

| 버튼 | `action` 값 | micro:bit 화면 |
|------|-------------|----------------|
| **A** | `"water"` | 물방울 LED 패턴 0.5초 |
| **B** | `"fertilizer"` | 다이아몬드 아이콘 0.5초 |

버튼을 누르면 `nextAction` 변수에 값이 들어가고, **다음 루프에서 즉시** 해당 action으로 전송됩니다. auto의 5초 대기는 건너뜁니다.

### 밝기 → status 변환 (micro:bit에서 계산)

| `light` 값 | `status` | LED 아이콘 |
|------------|----------|------------|
| 0 ~ 59 | `"dark"` | Sad (어두움) |
| 60 ~ 179 | `"good"` | Happy (적정) |
| 180 ~ 255 | `"bright"` | Surprised (밝음) |

### 전송 JSON 형식

한 줄 JSON입니다. 줄바꿈(`\n`)으로 구분됩니다.

```json
{"device":"device01","light":151,"status":"good","action":"auto"}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `device` | string | 장치 ID. 기본값 `"device01"` (`DEVICE_ID` 상수로 변경 가능) |
| `light` | number | 밝기 센서 값 (0~255) |
| `status` | string | `"dark"` \| `"good"` \| `"bright"` |
| `action` | string | `"auto"` \| `"water"` \| `"fertilizer"` |

### 전송 예시

```json
{"device":"device01","light":45,"status":"dark","action":"auto"}
{"device":"device01","light":151,"status":"good","action":"water"}
{"device":"device01","light":200,"status":"bright","action":"fertilizer"}
```

---

## 3. 브릿지(웹앱 / Node) 처리 로직

핵심 함수: `public/app.js`의 `handleLine()`, `bridge.js`의 `handleIncomingLine()`  
두 파일의 로직은 동일합니다.

### 초기 상태

브릿지가 메모리(웹앱은 localStorage도 사용)에서 관리하는 값입니다.

| 필드 | 초기값 |
|------|--------|
| `water` | 50 |
| `nutrition` | 50 |
| `light` | 0 |
| `status` | `-` (또는 `unknown`) |

**중요:** 수분·영양 숫자는 micro:bit가 보내지 않습니다. 브릿지가 누적 관리합니다.

### action별 처리

| `action` | 동작 |
|----------|------|
| **`auto`** | `light`, `status`만 갱신 → Firebase PUT. (옵션) 밝기·상태가 이전과 같으면 저장 생략 |
| **`water`** | `water += 20` → Firebase PUT |
| **`fertilizer`** | `nutrition += 15` → Firebase PUT |

버튼 action이 와도 **그 순간의 밝기·status는 함께** 갱신됩니다.

### 수분·영양 판정 (화면 표시용)

| 구분 | 부족 | 적정 | 과다/과습 |
|------|------|------|-----------|
| 수분 (`water`) | &lt; 40 | 40 ~ 80 | &gt; 80 |
| 영양 (`nutrition`) | &lt; 30 | 30 ~ 70 | &gt; 70 |

### 상수 (웹앱 / bridge.js 공통)

```
WATER_PER_PRESS = 20      // A 버튼 1회
NUTRITION_PER_PRESS = 15  // B 버튼 1회
DEFAULT_WATER = 50
DEFAULT_NUTRITION = 50
```

---

## 4. Firebase 저장 형식

### 경로

```
https://{프로젝트ID}-default-rtdb.firebaseio.com/plants/{deviceId}.json
```

예시:

```
https://test1-724ff-default-rtdb.firebaseio.com/plants/device01.json
```

장치 ID가 `device02`이면 `plants/device02`에 저장됩니다.

### 저장 방식

- HTTP 메서드: **PUT** (객체 전체 덮어쓰기)
- 인증: 없음 (연수용 공개 규칙 전제)

### 저장되는 JSON

```json
{
  "device": "device01",
  "light": 151,
  "status": "good",
  "water": 70,
  "nutrition": 50,
  "updatedAt": 1718691234567
}
```

| 필드 | 출처 | 설명 |
|------|------|------|
| `device` | micro:bit JSON | 장치 ID |
| `light` | micro:bit 센서 | 0~255 |
| `status` | micro:bit 계산 | `dark` / `good` / `bright` |
| `water` | **브릿지 누적** | A 버튼마다 +20 |
| `nutrition` | **브릿지 누적** | B 버튼마다 +15 |
| `updatedAt` | 브릿지 | `Date.now()` 밀리초 타임스탬프 |

`action` 필드는 Firebase에 **저장되지 않습니다**. 수신 시 처리에만 사용됩니다.

---

## 5. 식물 화면 웹앱 연동 가이드

### 읽기 (권장)

```http
GET /plants/device01.json
```

Firebase SDK 사용 시:

```javascript
import { getDatabase, ref, onValue } from 'firebase/database';

const db = getDatabase(app);
onValue(ref(db, 'plants/device01'), (snapshot) => {
  const data = snapshot.val();
  // data.light, data.status, data.water, data.nutrition, data.updatedAt
});
```

표시 예:

- `light` / `status` → 햇빛 충분 여부
- `water` / `nutrition` → 게이지, 아이콘
- `updatedAt` → 마지막 갱신 시각

### 쓰기 시 주의

브릿지도 같은 경로에 **PUT으로 전체 객체를 덮어씁니다.**

- 식물 화면에서 `water`만 수정해 PUT하면, 브릿지가 다시 PUT할 때 **덮어써질 수 있음**
- 안전한 패턴:
  1. **읽기 전용** 화면 (micro:bit + 브릿지가 유일한 쓰기 주체)
  2. 필드 분리 — 예: `plants/device01/sensors` vs `plants/device01/game`
  3. Firebase 규칙으로 역할 분리

### 브릿지 없이 테스트

현재 웹앱의 **「Firebase 테스트」** 버튼이 `buildFirebasePayload()`로 위 JSON을 PUT합니다.  
micro:bit 없이도 식물 화면 연동을 확인할 수 있습니다.

---

## 6. 시나리오 예시

### 시나리오 A: 평소 (버튼 안 누름)

1. micro:bit가 5초마다 `action: "auto"` 전송
2. 브릿지가 `light`, `status` 갱신
3. Firebase PUT (`water`, `nutrition`은 이전 값 유지)

### 시나리오 B: A 버튼 (물 주기)

1. micro:bit A 버튼 → `action: "water"` 전송
2. 브릿지: `water` 50 → 70 (+20), `light`/`status`도 현재값으로 갱신
3. Firebase PUT

### 시나리오 C: B 버튼 (영양제)

1. micro:bit B 버튼 → `action: "fertilizer"` 전송
2. 브릿지: `nutrition` 50 → 65 (+15)
3. Firebase PUT

---

## 7. 한 줄 요약

1. micro:bit는 **밝기 + action**만 보냄 (`auto` / `water` / `fertilizer`)
2. **수분·영양 숫자는 브릿지가 관리** (A +20, B +15, 초기 50)
3. Firebase `plants/{deviceId}`에 6개 필드가 주기적으로 갱신됨
4. 식물 화면은 **이 경로를 읽어서 UI**를 그리면 됨
