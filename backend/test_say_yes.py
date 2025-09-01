#!/usr/bin/env python3
"""
positive_sentence_response에서 say.yes 인텐트 처리 테스트
"""

import requests
import json
import time

def test_say_yes_in_positive_sentence():
    """positive_sentence_response에서 say.yes 인텐트가 제대로 처리되는지 테스트합니다."""
    base_url = "http://localhost:8000"
    session_id = f"test-say-yes-{int(time.time())}"
    
    print(f"🔍 Testing say.yes intent in positive_sentence_response")
    print(f"📋 Session ID: {session_id}")
    
    # Step 1: positive_sentence_response로 직접 이동
    print("\n" + "="*50)
    print("Step 1: positive_sentence_response에서 say.yes 인텐트")
    payload1 = {
        "sessionId": session_id,
        "requestId": "test-request-1",
        "userInput": {
            "type": "text",
            "content": {
                "text": "좋아",
                "nluResult": {
                    "intent": "say.yes",
                    "entities": []
                }
            }
        },
        "currentState": "positive_sentence_response",
        "botId": "9000",
        "botVersion": "0002"
    }
    
    response1 = requests.post(f"{base_url}/api/v1/execute", headers={"Content-Type": "application/json"}, json=payload1)
    result1 = response1.json()
    state1 = result1.get("meta", {}).get("dialogState", "unknown")
    memory1 = result1.get("memory", {})
    
    print(f"📍 State 1: {state1}")
    print(f"📦 Memory 1: {json.dumps(memory1, indent=2, ensure_ascii=False)}")
    
    # 결과 분석
    print("\n" + "="*50)
    print("📊 결과 분석")
    print(f"최종 상태: {state1}")
    
    if state1 == "sts_router":
        print("✅ Successfully transitioned to sts_router!")
        return True
    else:
        print(f"❌ Failed to transition. Expected: sts_router, Got: {state1}")
        return False

if __name__ == "__main__":
    success = test_say_yes_in_positive_sentence()
    if success:
        print("\n🎉 Test passed!")
    else:
        print("\n💥 Test failed!")
        exit(1)
