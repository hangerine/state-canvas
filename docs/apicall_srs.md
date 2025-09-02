## API Call SRS (rev. JSON_PATH groups)

### 목적 Purpose
- 한글: 시나리오의 특정 상태에서 외부 HTTP API를 호출해 응답을 메모리에 매핑하고, 조건에 따라 다음 상태로 전이합니다.
- English: From a dialog state, call an external HTTP API, map the response into memory, and transition to the next state based on conditions.

### 범위 Scope
- 한글: 백엔드 `StateEngine`의 `apicallHandlers` 실행 및 `apicall` 정의, 요청 템플릿/헤더 치환, 재시도/타임아웃, 응답 매핑과 상태 전이.
- English: Execution of `apicallHandlers` in the backend `StateEngine`, `apicall` definitions, request templating/headers, retry/timeout, response mapping and state transition.

### 용어 Definitions
- 한글:
  - 시나리오: `plan[0].dialogState[]`로 구성된 상태 그래프
  - 메모리: 세션 범위의 key-value 저장소
  - 응답 매핑: JSONPath를 이용해 응답 값을 메모리로 투영
- English:
  - Scenario: State graph under `plan[0].dialogState[]`
  - Memory: Session-scoped key-value store
  - Response mapping: Project response fields into memory via JSONPath

### 관련 구현 Files and Components
- `backend/services/state_engine.py`: `_handle_apicall_handlers`, 입력 처리 플로우, 자동 전이
- `backend/services/apicall_handler.py`: 실제 API 호출 `execute_api_call`
- `backend/services/utils.py`: 템플릿 처리, JSONPath 매핑 유틸
- `backend/models/scenario.py`: 시나리오 및 `ApiCall`, `ApiCallHandler` 모델
- `backend/main.py`: 시나리오 업/다운로드 시 `apicall.url` 제거 로직, Mock API

### 데이터 모델 Data Model
#### 시나리오의 API 정의 Scenario-level API definitions
- 위치 Location: `scenario.webhooks[]` (통합 저장). APICALL 항목은 `type: "APICALL"`을 사용.
- 스키마 Schema (요약):
  - `type: "APICALL" | "WEBHOOK"`
  - `name: string`, `url: string`, `timeoutInMilliSecond: number`, `retry: number`
  - (APICALL만) `method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS"`
  - (APICALL만) `formats: { contentType: string, requestTemplate: string, responseProcessing?: object, responseMappings: ResponseMappingGroup[], headers?: object, queryParams?: Array<{name,value}> }`
  - `ResponseMappingGroup = { expressionType: "JSON_PATH" | "XPATH" | "REGEX", targetType: "MEMORY" | "DIRECTIVE", mappings: Record<string, string> }`

#### 상태의 API 콜 핸들러 Dialog state API call handlers
- 위치 Location: `dialogState.apicallHandlers: ApiCallHandler[]`
- 스키마 Schema (요약):
  - `name: string` (반드시 `scenario.apicalls[].name`와 일치해야 함)
  - `transitionTarget: { dialogState: string }` (조건 핸들러 부재 시 기본 전이)
  - `action?: { ... }` (현재 apicall 흐름에서는 미사용)
  - `apicall?: ApiCall` (UI 편집용, 런타임은 `name` 기반으로 `scenario.apicalls`를 조회)

#### 템플릿 치환 Template variables (요청 본문/헤더)
- 한글: `{$sessionId}`, `{$requestId}`(없으면 생성/메모리 저장), `{$USER_TEXT_INPUT.[i]}`, `{$memorySlots.KEY.value.[i]}`, `{$임의메모리키}`
- English: `{$sessionId}`, `{$requestId}` (generated if missing), `{$USER_TEXT_INPUT.[i]}`, `{$memorySlots.KEY.value.[i]}`, `{$anyMemoryKey}`

### 동작 흐름 Behavior
#### 트리거 Triggers
- 한글:
  - 입력 처리 중 웹훅 실패 시 폴백으로 apicall 실행
  - 웹훅이 없고 apicallHandlers만 있는 상태에서 자동 실행
- English:
  - As a fallback when webhook fails during input processing
  - Automatically if the state has only apicallHandlers (no webhook)

#### 요청 생성 Request building
- 한글:
  - 메서드: `method` (APICALL 루트, 기본 POST)
  - 본문: POST/PUT/PATCH인 경우 `formats.requestTemplate` 템플릿 치환 후 JSON 파싱(실패 시 호출 중단)
  - 헤더: 기본 `Content-Type: application/json` + `formats.headers` 템플릿 치환 병합
- English:
  - Method: `formats.method` (default POST)
  - Body: For POST/PUT/PATCH, process `formats.requestTemplate` and parse as JSON; abort on parse errors
  - Headers: `Content-Type: application/json` + processed `formats.headers`

#### 호출/재시도/타임아웃 HTTP call, retries, timeout
- 한글: `timeout(ms)/1000`로 설정, `retry` 값 기준 (총 `retry+1`회), 시도 간 1초 대기.
  - 성공 기준: GET=200, POST/PUT/PATCH=200/201, DELETE=200/204
  - 성공 시 응답 JSON만 처리 (비-JSON 응답은 미지원)
- English: Timeout in seconds, total attempts `retry+1` with 1s backoff.
  - Success: GET=200, POST/PUT/PATCH=200/201, DELETE=200/204
  - JSON response only; others unsupported

- 한글:
  - `formats.responseMappings: ResponseMappingGroup[]`를 순회하여 각 그룹의 `mappings`를 적용
  - `expressionType = JSON_PATH`는 jsonpath_ng를 사용하여 추출
  - `targetType = MEMORY`는 세션 메모리에 저장, `DIRECTIVE`는 지시사항 큐 또는 `DIRECTIVE_*` 메모리로 저장
  - (하위호환) 기존 object/old-array 형태도 지원하며 JSON_PATH/MEMORY 그룹으로 변환 적용
  - 값 정규화: 단일 요소 배열·단일 키 객체·`{value: ...}` 구조 평탄화
- English:
  - Use `formats.responseMappings` (JSONPath) if provided
  - Otherwise, if response has `memorySlots` with `NLU_INTENT`, apply default mappings above
  - Value normalization flattens single-element arrays, single-key objects, and `{value: ...}`

#### 상태 전이 State transition
- 한글:
  - 현재 상태의 `conditionHandlers` 평가:
    - `"True"`가 아닌 조건 먼저 검사하여 최초 매칭 시 그 타깃으로 전이
    - 매칭이 없으면 `"True"` 조건(폴백) 전이
  - `conditionHandlers`가 없으면 핸들러의 `transitionTarget.dialogState`로 전이
  - 전이 시 엔트리 액션 실행, 이후 자동 전이 확인
- English:
  - Evaluate current state’s `conditionHandlers`:
    - Try all non-`"True"` conditions first; on first match, transition
    - If none matches, use `"True"` fallback
  - If no `conditionHandlers`, use `handler.transitionTarget.dialogState`
  - Execute entry action on transition, then check auto transitions

#### 메모리 Memory
- 한글: `sessionId`가 없으면 생성하여 저장, 템플릿 치환 시 `requestId`가 필요하면 생성·저장
- English: Generate and store `sessionId` if missing; generate/store `requestId` on demand during templating

### 기능 요구사항 Functional Requirements
- AP-01: 시스템은 `scenario.apicalls[].name`로 핸들러와 API 정의를 매칭해야 한다.
- AP-02: 시스템은 `formats.method`에 따라 HTTP 요청을 생성해야 한다. 미지정 시 POST를 사용한다.
- AP-03: 시스템은 POST/PUT/PATCH에서만 `requestTemplate`를 본문으로 사용하며, 템플릿 치환 후 JSON 파싱이 유효해야 한다.
- AP-04: 시스템은 `formats.headers`를 템플릿 치환하여 기본 헤더에 병합해야 한다.
- AP-05: 시스템은 `retry+1`회 시도하고, 시도 간 1초 대기해야 한다.
- AP-06: 성공 응답은 JSON인 경우에만 처리하며, 상태 코드는 메서드별 성공 범위를 따른다.
- AP-07: 시스템은 `responseMappings`(JSONPath)로 응답을 메모리에 반영해야 한다.
- AP-08: `responseMappings`가 없고 표준 `memorySlots` 구조를 감지하면 기본 매핑을 적용해야 한다.
- AP-09: 응답 매핑 시 값 정규화를 수행해야 한다.
- AP-10: 시스템은 조건 핸들러를 평가해 전이를 결정하고, 없으면 핸들러의 기본 타깃으로 전이해야 한다.
- AP-11: 전이 시 엔트리 액션을 실행하고, 후속 자동 전이를 확인해야 한다.
- AP-12: `sessionId`/`requestId`는 필요 시 생성·메모리에 저장되어야 한다.
- AP-13: 실패(타임아웃/오류/비성공 코드/비-JSON) 시 해당 핸들러 처리를 중단하고 다음 로직으로 진행해야 한다.

### 비기능 요구사항 Non-functional Requirements
#### 성능 Performance
- 한글: 단일 호출 내 시퀀셜 재시도(최대 `retry+1`회), 연결 풀 미사용; 고부하에서는 주의 필요
- English: Sequential retry per call (up to `retry+1`), no connection pooling; beware under high load

#### 신뢰성 Reliability
- 한글: 타임아웃·재시도·폴백(`"True"`) 제공
- English: Timeout, retry, and fallback (`"True"`) are in place

#### 로깅 Logging
- 한글: URL/메서드/헤더(치환 후)/본문/상태코드/응답/매핑 결과/조건 평가 로그
- English: Logs URL/method/headers(after templating)/body/status/response/mapping results/condition evaluation

#### 보안 Security
- 한글: 인증/서명 미포함, 필요 시 헤더 템플릿에 토큰 삽입 가능; 시나리오 다운로드 시 `apicall.url` 제거 처리 존재
- English: No auth/signing baked in; inject tokens via header templates; download path strips `apicall.url`

### 제약 및 한계 Constraints and Limitations
- 한글:
  - 응답은 JSON만 지원
  - GET 쿼리 파라미터 템플릿은 별도 지원 없음(필요 시 URL에 직접 포함)
  - `responseSchema`는 현재 검증에 사용되지 않음
  - 상태코드 성공 범위 고정(구성 불가)
- English:
  - JSON responses only
  - No explicit templating for GET query (embed in URL)
  - `responseSchema` unused for validation
  - Success codes are fixed, not configurable

### 예시 구성 Example configuration
```json
{
  "webhooks": [
    {
      "type": "APICALL",
      "name": "DetectNLU",
      "url": "http://localhost:8000/mock/nlu",
      "timeoutInMilliSecond": 5000,
      "retry": 3,
      "method": "POST",
      "formats": {
        "contentType": "application/json",
        "requestTemplate": "{\"text\":\"{$USER_TEXT_INPUT.[0]}\",\"sessionId\":\"{$sessionId}\",\"requestId\":\"{$requestId}\"}",
        "headers": { "X-Trace-Id": "{$requestId}" },
        "responseMappings": [
          { "expressionType": "JSON_PATH", "targetType": "MEMORY", "mappings": { "NLU_INTENT": "$.nlu.intent", "STS_CONFIDENCE": "$.nlu.confidence" } }
        ]
      }
    }
  ],
  "plan": [
    {
      "name": "Main",
      "dialogState": [
        {
          "name": "Start",
          "apicallHandlers": [
            {
              "name": "DetectNLU",
              "transitionTarget": { "dialogState": "NextState" }
            }
          ],
          "conditionHandlers": [
            {
              "conditionStatement": "{NLU_INTENT} == \"Greeting.Hello\"",
              "transitionTarget": { "dialogState": "HelloState" }
            },
            {
              "conditionStatement": "True",
              "transitionTarget": { "dialogState": "FallbackState" }
            }
          ]
        }
      ]
    }
  ]
}
```

### 오류 처리 Error Handling
- 한글: JSON 파싱 실패/타임아웃/네트워크 예외/비성공 코드 시 시도 로그 남기고 재시도, 모두 실패 시 None 반환. 이후 조건 전이는 생략되며, 상위 흐름에서 다른 핸들러나 기본 응답으로 진행.
- English: On JSON parse failure/timeout/network exceptions/non-success codes, log and retry; return None after exhausting attempts. No condition evaluation; control returns to higher-level flow.

### 테스트 Test Considerations
- 현재 포함 테스트: 핸들러 목록이 없을 때 None 반환 확인 (`backend/tests/test_apicall_handler.py`).
- 권장 추가 케이스:
  - 메서드별 성공 코드 처리, 타임아웃/재시도
  - 템플릿 치환(본문/헤더)
  - 기본 응답 매핑(memorySlots)
  - JSONPath 매핑 실패/성공
  - 조건 매칭/폴백, 엔트리 액션 호출/자동 전이 연쇄

### 마이그레이션/호환성 Notes
- 한글: 프론트는 핸들러에 `apicall` 객체를 보관하지만, 런타임은 `name`으로 `scenario.apicalls`를 참조. 시나리오 저장 시 `apicall.url`은 다운로드 단계에서 제거됨.
- English: Frontend keeps `apicall` on the handler, while runtime looks up by `name` in `scenario.apicalls`. `apicall.url` is removed on scenario download.

### 향후 확장 Future Work
- 한글: 응답 스키마 검증 적용, 성공 코드/재시도 정책 구성화, 쿼리 파라미터 템플릿 지원, 연결 풀/백오프 전략 개선, 비-JSON 응답 처리 옵션
- English: Apply response schema validation, configurable success codes/retry policy, query param templating, connection pooling/backoff strategy, optional non-JSON handling

