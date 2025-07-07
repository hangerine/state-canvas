#!/bin/bash

echo "Testing webhook endpoint..."
echo ""

# 테스트 요청 전송
response=$(curl -s -X POST http://localhost:3001/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-session-123",
    "requestId": "test-request-456",
    "otherField": "this will be ignored",
    "anotherField": "also ignored"
  }')

# 응답 출력
echo "Response:"
echo "$response" | jq .

# jq가 없는 경우 일반 출력
if [ $? -ne 0 ]; then
  echo "$response"
fi 