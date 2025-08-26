# StateCanvas

StateCanvas는 대화형 챗봇 시나리오를 시각적으로 설계하고 관리할 수 있는 도구입니다.

## 주요 기능

- **시나리오 관리**: 대화 흐름을 시각적으로 설계하고 관리
- **외부 연동**: Webhook과 API Call을 통한 외부 시스템 연동
- **API Call 관리**: 외부 API 호출 설정 및 응답 처리

## API Call Specification

StateCanvas는 외부 API 호출을 위한 표준화된 설정을 지원합니다. 자세한 스펙은 [docs/apicall_spec.md](docs/apicall_spec.md)를 참조하세요.

### JSON Schema

```json
{
  "type": "apicall",
  "name": "(external_api)search-json",
  "url": "http://localhost:8000/api/v1/apicall",
  "timeoutInMilliSecond": 5000,
  "retry": 3,
  "headers": {
    "Authorization": "Bearer {$accessToken}",
    "Content-Type": "application/json"
  },
  "queryParams": [
    { "name": "keyword", "value": "{$keyword}" },
    { "name": "page", "value": "{$page}" },
    { "name": "size", "value": "20" }
  ],
  "formats": {
    "method": "POST",
    "contentType": "application/json",
    "requestTemplate": "{\"sessionId\":\"{$sessionId}\",\"requestId\":\"{$requestId}\"}",
    "responseProcessing": {},
    "responseMappings": [
      { "type": "memory", "map": { "NLU_INTENT": "$.NLU_INTENT.value" } }
    ]
  }
}
```

### 주요 필드 설명

- **type**: "apicall" (고정값)
- **name**: API Call의 고유 이름
- **url**: API 엔드포인트 URL
- **timeoutInMilliSecond**: 타임아웃 (밀리초)
- **retry**: 재시도 횟수
- **headers**: HTTP 헤더 (key-value 매핑, {$var} 치환 가능)
- **queryParams**: URL 쿼리 파라미터 (name/value 구조, {$var} 치환 가능)
- **formats.method**: HTTP 메서드 (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
- **formats.contentType**: Content-Type (application/json, text/plain, application/x-www-form-urlencoded)
- **formats.requestTemplate**: 요청 본문 템플릿 ({$var} 치환 가능)
- **formats.responseProcessing**: 응답 검증/가공/분기 정의
- **formats.responseMappings**: 응답 데이터를 메모리로 매핑하는 규칙

### 변수 치환

`{$var}` 형식의 변수를 사용하여 동적 값을 설정할 수 있습니다:

- **URL**: `http://api.example.com/users/{$userId}`
- **Headers**: `Authorization: Bearer {$accessToken}`
- **Query Parameters**: `page={$page}&size={$size}`
- **Request Template**: `{"userId": "{$userId}", "query": "{$searchQuery}"}`

### 응답 매핑

JSONPath를 사용하여 API 응답의 특정 값을 메모리나 지시사항으로 매핑할 수 있습니다:

```json
"responseMappings": [
  {
    "type": "memory",
    "map": {
      "USER_NAME": "$.user.name",
      "USER_EMAIL": "$.user.email"
    }
  },
  {
    "type": "directive",
    "map": {
      "NEXT_ACTION": "$.nextAction"
    }
  }
]
```

## 설치 및 실행

### 백엔드 실행
```bash
cd backend
pip install -r requirements.txt
python main.py
```

### 프론트엔드 실행
```bash
cd frontend
npm install
npm start
```

## 사용법

1. **시나리오 생성**: 새로운 대화 시나리오를 생성합니다.
2. **상태 추가**: 대화의 각 단계를 나타내는 상태를 추가합니다.
3. **API Call 설정**: 외부 API 호출을 위한 설정을 구성합니다.
4. **응답 처리**: API 응답을 메모리나 지시사항으로 매핑합니다.
5. **테스트**: API Call 테스트 패널에서 설정을 검증합니다.

## 라이선스

MIT License 