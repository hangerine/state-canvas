# Webhook Server for StateCanvas

이 프로젝트는 StateCanvas의 webhook 기능을 테스트하기 위한 서버입니다.

## 설치 및 실행

```bash
# 의존성 설치
npm install

# 서버 실행
npm start
```

서버는 http://localhost:3001 에서 실행됩니다.

## Webhook 동작 방식

StateCanvas의 webhook 기능은 다음과 같이 동작합니다:

1. **시나리오 webhook 설정 읽기**: `scenario.webhooks` 배열에서 URL 및 설정 정보 추출
2. **표준 webhook 요청 전송**: 사용자 입력을 포함한 표준 형식의 요청을 REST API로 전송
3. **응답 처리**: 응답에서 `NLU_INTENT`를 추출하여 memory에 저장
4. **상태 전이**: Condition Handler를 통해 다음 상태로 전이

## API 엔드포인트

### 1. Webhook 엔드포인트 (현재 버전)

- **URL**: `POST http://localhost:3001/webhook`
- **Request Body**: 표준 webhook 요청 형식
  ```json
  {
    "version": "1.0",
    "request": {
      "userId": "__SESSION_ID__",
      "botId": "1370",
      "sessionId": "chat-session-id",
      "requestId": "chatbot-request-id",
      "userInput": {
        "type": "text",
        "content": {
          "text": "사용자 입력 텍스트"
        }
      }
    },
    "webhook": {
      "url": "http://localhost:3001/webhook",
      "sessionId": "chat-session-id",
      "requestId": "chatbot-request-id",
      "memorySlots": {
        "USER_TEXT_INPUT": {
          "value": ["사용자 입력 텍스트"]
        }
      }
    }
  }
  ```

- **Response**: 표준 webhook 응답 형식
  ```json
  {
    "version": "1.0",
    "responseStatus": "SUCCESS",
    "memorySlots": {
      "NLU_INTENT": {
        "value": ["ACT_01_0235"]
      },
      "STS_CONFIDENCE": {
        "value": ["0.7431283"]
      },
      "USER_TEXT_INPUT": {
        "value": ["사용자 입력 텍스트"]
      }
    },
    "directives": []
      }
    ```

### 2. API Call 엔드포인트 (이전 버전 호환)

- **URL**: `POST http://localhost:3001/apicall`
- **Request Body**: 간단한 형식
  ```json
  {
    "sessionId": "test-session-123",
    "requestId": "test-request-456",
    "userInput": "ACT_01_0212"
  }
  ```

- **Response**: 이전 버전 호환 형식
  ```json
  {
    "sessionId": "test-session-123",
    "requestId": "test-request-456",
    "NLU_INTENT": "ACT_01_0212",
    "confidence": 0.7431283,
    "isExactMatch": false,
    "userInput": "ACT_01_0212",
    "timestamp": "2025-07-15T10:25:36.513Z"
  }
  ```

## NLU_INTENT 매핑

서버는 사용자 입력에 따라 다음과 같이 NLU_INTENT를 결정합니다:

- `ACT_01_0212` 포함 → `ACT_01_0212`
- `ACT_01_0213` 포함 → `ACT_01_0213`
- `ACT_01_0235` 포함 → `ACT_01_0235`
- 기타 입력 → `ACT_01_0235` (fallback)

## 테스트 방법

### StateCanvas에서 테스트:

1. 시나리오에 webhook 설정 추가:
   ```json
   "webhooks": [
     {
       "name": "(intent_classifier)classifier",
       "url": "http://localhost:3001/webhook",
       "headers": {},
       "timeoutInMilliSecond": 5000,
       "retry": 3
     }
   ]
   ```

2. webhook action이 있는 상태에서 테스트:
   - `ACT_01_0212` 입력 → 해당 intent로 처리
   - `ACT_01_0213` 입력 → 해당 intent로 처리
   - `ACT_01_0235` 입력 → 해당 intent로 처리
   - 기타 텍스트 → fallback 조건으로 처리

### curl을 사용한 직접 테스트:

**Webhook 엔드포인트 테스트:**
```bash
curl -X POST http://localhost:3001/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.0",
    "request": {
      "userInput": {
        "content": {
          "text": "ACT_01_0212"
        }
      }
    },
    "webhook": {
      "sessionId": "test-session",
      "requestId": "test-request",
      "memorySlots": {}
    }
  }'
```

**API Call 엔드포인트 테스트:**
```bash
curl -X POST http://localhost:3001/apicall \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-session-123",
    "requestId": "test-request-456",
    "userInput": "ACT_01_0212"
  }'
```

## 특징

- **이중 엔드포인트 지원**: 현재 버전 webhook과 이전 버전 API call 모두 지원
- **표준 webhook 요청/응답 형식 지원**: StateCanvas와 완전 호환
- **이전 버전 호환성**: 기존 API call 형식도 지원
- **사용자 입력에 따른 동적 NLU_INTENT 결정**: 입력 내용에 따라 적절한 intent 반환
- **상세한 요청/응답 로깅**: 디버깅을 위한 완전한 로그 출력
- **동일한 NLU_INTENT 매핑 로직**: 두 엔드포인트 모두 동일한 매핑 규칙 사용

## 포트 변경

기본 포트는 3001입니다. 변경하려면 `server.js`의 `PORT` 변수를 수정하세요. 