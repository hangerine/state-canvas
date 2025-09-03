# API Call Specification

StateCanvas에서 외부 API 호출을 위한 표준화된 설정 스펙입니다.

Note (Spec update):
- APICALL: method, headers, queryParams are at the root (not in formats).
- formats only contains requestTemplate, responseProcessing (optional), responseMappings.
- Content-Type is defined in root headers; default is application/json.
- Only entryAction.webhookActions is supported for triggering (root-level webhookActions is deprecated and removed).

## JSON Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.com/schemas/api-config.schema.json",
  "title": "External API or Webhook Config",
  "type": "object",
  "oneOf": [
    {
      "title": "API Call Config",
      "type": "object",
      "required": ["type", "name", "url", "timeoutInMilliSecond", "formats"],
      "additionalProperties": false,
      "properties": {
        "type": { "const": "apicall" },
        "name": { "type": "string", "minLength": 1 },
        "url": { "type": "string", "format": "uri" },
        "timeoutInMilliSecond": { "type": "integer", "minimum": 1 },
        "retry": { "type": "integer", "minimum": 0, "default": 0 },
        "headers": {
          "type": "object",
          "description": "HTTP 헤더 key-value 매핑 (값은 문자열, {$var} 치환 가능)",
          "additionalProperties": {
            "type": "string",
            "pattern": "^(.*\\{\\$[A-Za-z_][A-Za-z0-9_]*\\}.*|[\\s\\S]*)$",
            "description": "예: \"application/json\", \"Bearer {$token}\""
          }
        },
        "queryParams": {
          "type": "array",
          "description": "URL 쿼리 파라미터 리스트",
          "items": {
            "type": "object",
            "required": ["name", "value"],
            "additionalProperties": false,
            "properties": {
              "name": { "type": "string", "minLength": 1 },
              "value": {
                "type": "string",
                "description": "정적 문자열 또는 {$var} 치환 포함 가능",
                "pattern": "^(.*\\{\\$[A-Za-z_][A-Za-z0-9_]*\\}.*|[^{}]*)$"
              }
            }
          }
        },
        "formats": {
          "type": "object",
          "required": ["method", "contentType", "requestTemplate", "responseMappings"],
          "additionalProperties": false,
          "properties": {
            "method": {
              "type": "string",
              "enum": ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]
            },
            "contentType": {
              "type": "string",
              "enum": [
                "application/json",
                "text/plain",
                "application/x-www-form-urlencoded"
              ]
            },
            "requestTemplate": {
              "type": "string",
              "minLength": 1,
              "description": "본문 템플릿(모든 contentType에서 사용). {$var} 치환 가능",
              "pattern": "^(.*\\{\\$[A-Za-z_][A-Za-z0-9_]*\\}.*|[\\s\\S]*)$"
            },
            "responseProcessing": {
              "type": "object",
              "description": "응답 검증/가공/분기 정의 (확장 가능)"
            },
            "responseMappings": {
              "type": "array",
              "minItems": 1,
              "items": {
                "type": "object",
                "required": ["type", "map"],
                "additionalProperties": false,
                "properties": {
                  "type": { "type": "string", "enum": ["memory", "directive"] },
                  "map": {
                    "type": "object",
                    "minProperties": 1,
                    "additionalProperties": {
                      "type": "string",
                      "pattern": "^\\$\\..+",
                      "description": "JSONPath (예: $.NLU_INTENT.value)"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    {
      "title": "Webhook Config",
      "type": "object",
      "required": ["type", "name", "url", "timeoutInMilliSecond", "retry"],
      "additionalProperties": false,
      "properties": {
        "type": { "const": "webhook" },
        "name": { "type": "string", "minLength": 1 },
        "url": { "type": "string", "format": "uri" },
        "timeoutInMilliSecond": { "type": "integer", "minimum": 1 },
        "retry": { "type": "integer", "minimum": 0, "default": 0 },
        "headers": {
          "type": "object",
          "description": "Webhook 헤더 key-value 매핑 (값은 문자열, {$var} 치환 가능)",
          "additionalProperties": {
            "type": "string",
            "pattern": "^(.*\\{\\$[A-Za-z_][A-Za-z0-9_]*\\}.*|[\\s\\S]*)$"
          }
        }
      }
    }
  ]
}
```

## 예제

### API Call 예제 (JSON_PATH → MEMORY)

```json
{
  "type": "APICALL",
  "name": "(external_api)search-json",
  "url": "http://localhost:8000/api/v1/apicall",
  "timeoutInMilliSecond": 5000,
  "retry": 3,
  "method": "POST",
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
    "contentType": "application/json",
    "requestTemplate": "{\"sessionId\":\"{$sessionId}\",\"requestId\":\"{$requestId}\"}",
    "responseProcessing": {},
    "responseMappings": [
      { "expressionType": "JSON_PATH", "targetType": "MEMORY", "mappings": { "NLU_INTENT": "$.NLU_INTENT.value" } }
    ]
  }
}
```

### Webhook 예제

```json
{
  "type": "WEBHOOK",
  "name": "(intent_classifier)classifier",
  "url": "http://localhost:8000/api/v1/webhook",
  "timeoutInMilliSecond": 1000,
  "retry": 3,
  "headers": { "Content-Type": "application/json" }
}
```

## 필드 상세 설명

### 공통 필드

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `type` | string | ✅ | "apicall" 또는 "webhook" |
| `name` | string | ✅ | 고유 이름 (최소 1자) |
| `url` | string | ✅ | API 엔드포인트 URL |
| `timeoutInMilliSecond` | integer | ✅ | 타임아웃 (밀리초, 최소 1) |
| `retry` | integer | ❌ | 재시도 횟수 (기본값: 0) |
| `headers` | object | ❌ | HTTP 헤더 (key-value 매핑) |

### API Call 전용 필드

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `queryParams` | array | ❌ | URL 쿼리 파라미터 리스트 |
| `formats.method` | string | ✅ | HTTP 메서드 |
| `formats.contentType` | string | ✅ | Content-Type |
| `formats.requestTemplate` | string | ✅ | 요청 본문 템플릿 |
| `formats.responseProcessing` | object | ❌ | 응답 처리 로직 |
| `formats.responseMappings` | array | ✅ | 응답 매핑 규칙 |

### HTTP 메서드

- `GET`: 데이터 조회
- `POST`: 데이터 생성
- `PUT`: 데이터 전체 교체
- `PATCH`: 데이터 부분 수정
- `DELETE`: 데이터 삭제
- `HEAD`: 헤더만 조회
- `OPTIONS`: 지원 메서드 조회

### Content-Type

- `application/json`: JSON 형식
- `text/plain`: 일반 텍스트
- `application/x-www-form-urlencoded`: 폼 데이터

## 변수 치환

`{$var}` 형식의 변수를 사용하여 동적 값을 설정할 수 있습니다.

### 지원되는 변수

- **시스템 변수**: `{$sessionId}`, `{$requestId}`
- **사용자 입력**: `{$USER_TEXT_INPUT.[0]}`
- **메모리 슬롯**: `{$memorySlots.KEY.value.[0]}`
- **사용자 정의**: `{$customKey}`

### 사용 예시

```json
{
  "url": "http://api.example.com/users/{$userId}",
  "headers": {
    "Authorization": "Bearer {$accessToken}"
  },
  "queryParams": [
    { "name": "page", "value": "{$page}" }
  ],
  "requestTemplate": "{\"userId\": \"{$userId}\", \"query\": \"{$searchQuery}\"}"
}
```

## 응답 매핑

JSONPath를 사용하여 API 응답의 특정 값을 메모리나 지시사항으로 매핑할 수 있습니다.

### 매핑 타입

- **`memory`**: 응답 값을 메모리에 저장
- **`directive`**: 응답 값을 지시사항으로 사용

### JSONPath 예시

```json
"responseMappings": [
  {
    "type": "memory",
    "map": {
      "USER_NAME": "$.user.name",
      "USER_EMAIL": "$.user.email",
      "SEARCH_RESULTS": "$.results"
    }
  },
  {
    "type": "directive",
    "map": {
      "NEXT_ACTION": "$.nextAction",
      "INTENT": "$.intent.value"
    }
  }
]
```

### JSONPath 문법

- `$.` : 루트 객체
- `$.key` : 객체의 특정 키
- `$.array[0]` : 배열의 첫 번째 요소
- `$.nested.key` : 중첩된 객체의 키
- `$.array[*].key` : 배열의 모든 요소의 특정 키

## 구현 세부사항

### 1. 변수 치환 처리

- `{$var}` 패턴을 정규식으로 찾아서 메모리 값으로 치환
- 치환 실패 시 원본 텍스트 유지
- URL, 헤더, 쿼리 파라미터, 요청 본문에 모두 적용

### 2. 응답 처리

- HTTP 상태 코드 확인
- 응답 본문을 JSON으로 파싱
- JSONPath를 사용하여 값 추출
- 메모리 또는 지시사항으로 매핑

### 3. 에러 처리

- 타임아웃 발생 시 재시도
- 네트워크 오류 시 재시도
- 재시도 횟수 초과 시 실패 처리
- 로그에 상세한 에러 정보 기록

### 4. 성능 최적화

- 연결 풀링 사용
- 비동기 처리
- 응답 캐싱 (필요시)
- 로드 밸런싱 지원

## 마이그레이션 가이드

### 기존 형식에서 새 형식으로

1. **timeout → timeoutInMilliSecond**
   ```json
   // 기존
   "timeout": 5000
   
   // 새로운
   "timeoutInMilliSecond": 5000
   ```

2. **headers 배열 → 객체**
   ```json
   // 기존
   "headers": [
     { "name": "Authorization", "value": "Bearer {$token}" }
   ]
   
   // 새로운
   "headers": {
     "Authorization": "Bearer {$token}"
   }
   ```

3. **formFields 제거**
   ```json
   // 기존 (제거됨)
   "formFields": { "key": "value" }
   
   // 새로운 (requestTemplate 사용)
   "requestTemplate": "{\"key\": \"{$value}\"}"
   ```

4. **responseSchema 제거**
   ```json
   // 기존 (제거됨)
   "responseSchema": { ... }
   
   // 새로운 (responseMappings 사용)
   "responseMappings": [ ... ]
   ```

## 제한사항

1. **Content-Type**: `multipart/form-data`는 지원하지 않음
2. **파일 업로드**: 현재 버전에서는 지원하지 않음
3. **스트리밍**: 실시간 스트리밍 응답은 지원하지 않음
4. **웹소켓**: 웹소켓 연결은 별도로 처리

## 향후 계획

1. **파일 업로드 지원**: multipart/form-data 지원
2. **스트리밍 응답**: 청크 응답 처리
3. **캐싱**: 응답 캐싱 메커니즘
4. **모니터링**: API 호출 성능 모니터링
5. **Rate Limiting**: API 호출 제한 기능

---

이 문서는 StateCanvas의 API Call 기능에 대한 공식 스펙입니다. 
최신 업데이트는 [GitHub 저장소](https://github.com/your-repo/StateCanvas)를 참조하세요.
