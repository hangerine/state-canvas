# JSON Server Webhook

이 프로젝트는 json-server를 사용하여 webhook response를 동적으로 처리합니다.

## 설치 및 실행

```bash
# 의존성 설치
npm install

# 서버 실행
npm start
```

서버는 http://localhost:3001 에서 실행됩니다.

## Webhook 엔드포인트

- **URL**: `POST http://localhost:3001/webhook`
- **Request Body**: 
  ```json
  {
    "sessionId": "session-123",
    "requestId": "request-456",
    // 기타 필드들...
  }
  ```

- **Response**:
  ```json
  {
    "sessionId": "session-123",
    "requestId": "request-456",
    "NLU_INTENT": {
      "ACT_01_0235": {}
    }
  }
  ```

## 테스트 방법

### curl을 사용한 테스트:

```bash
curl -X POST http://localhost:3001/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-session-123",
    "requestId": "test-request-456",
    "otherField": "this will be ignored"
  }'
```

### 예상 응답:

```json
{
  "sessionId": "test-session-123",
  "requestId": "test-request-456",
  "NLU_INTENT": {
    "ACT_01_0235": {}
  }
}
```

## 특징

- Request에서 받은 `sessionId`와 `requestId`를 그대로 Response에 복사
- `NLU_INTENT` 필드에 `ACT_01_0235` 객체 자동 추가
- 콘솔에 요청/응답 로깅

## 포트 변경

기본 포트는 3001입니다. 변경하려면 `server.js`의 `PORT` 변수를 수정하세요. 