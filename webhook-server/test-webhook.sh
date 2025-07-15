#!/bin/bash

echo "Testing StateCanvas webhook and API endpoints..."
echo ""

# 테스트 1: ACT_01_0212 입력
echo "=== Test 1: ACT_01_0212 입력 ==="
response1=$(curl -s -X POST http://localhost:3001/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.0",
    "request": {
      "userId": "__SESSION_ID__",
      "botId": "1370",
      "sessionId": "test-session-123",
      "requestId": "test-request-456",
      "userInput": {
        "type": "text",
        "content": {
          "text": "ACT_01_0212"
        }
      }
    },
    "webhook": {
      "url": "http://localhost:3001/webhook",
      "sessionId": "test-session-123",
      "requestId": "test-request-456",
      "memorySlots": {
        "USER_TEXT_INPUT": {
          "value": ["ACT_01_0212"]
        }
      }
    }
  }')

echo "Response:"
echo "$response1" | jq . 2>/dev/null || echo "$response1"
echo ""

# 테스트 2: 일반 텍스트 입력 (fallback)
echo "=== Test 2: 일반 텍스트 입력 (fallback) ==="
response2=$(curl -s -X POST http://localhost:3001/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.0",
    "request": {
      "userId": "__SESSION_ID__",
      "botId": "1370",
      "sessionId": "test-session-123",
      "requestId": "test-request-789",
      "userInput": {
        "type": "text",
        "content": {
          "text": "아들 계좌를 하나 만들고 싶어요."
        }
      }
    },
    "webhook": {
      "url": "http://localhost:3001/webhook",
      "sessionId": "test-session-123",
      "requestId": "test-request-789",
      "memorySlots": {
        "USER_TEXT_INPUT": {
          "value": ["아들 계좌를 하나 만들고 싶어요."]
        }
      }
    }
  }')

echo "Response:"
echo "$response2" | jq . 2>/dev/null || echo "$response2"
echo ""

echo "테스트 완료!"
echo ""

# 테스트 3: API Call 엔드포인트 테스트
echo "=== Test 3: API Call 엔드포인트 (이전 버전 호환) ==="
response3=$(curl -s -X POST http://localhost:3001/apicall \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-session-apicall",
    "requestId": "test-request-apicall",
    "userInput": "ACT_01_0213"
  }')

echo "Response:"
echo "$response3" | jq . 2>/dev/null || echo "$response3"
echo ""

# 테스트 4: API Call 엔드포인트 fallback 테스트
echo "=== Test 4: API Call 엔드포인트 fallback ==="
response4=$(curl -s -X POST http://localhost:3001/apicall \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-session-apicall-2",
    "requestId": "test-request-apicall-2",
    "userInput": "일반 텍스트 입력"
  }')

echo "Response:"
echo "$response4" | jq . 2>/dev/null || echo "$response4"
echo ""

echo "모든 테스트 완료!" 