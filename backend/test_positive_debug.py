import requests
import json
import time


def test_sts_router_wait_debug():
    """sts_router에서 사용자 입력 대기 기능을 디버깅합니다."""
    base_url = "http://localhost:8000"
    session_id = f"test-sts-router-wait-debug-{int(time.time())}"
    
    print(f"🔍 Testing sts_router wait functionality")
    print(f"📋 Session ID: {session_id}")
    
    # Step 1: sts_router로 직접 이동
    print("\n" + "="*50)
    print("Step 1: sts_router 상태로 이동")
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
    
    # Step 2: sts_router에서 빈 입력으로 요청
    print("\n" + "="*50)
    print("Step 2: sts_router -> 빈 입력으로 요청")
    payload2 = {
        "sessionId": session_id,
        "requestId": "test-request-2",
        "userInput": {
            "type": "text",
            "content": {
                "text": "",
                "nluResult": {
                    "intent": "",
                    "entities": []
                }
            }
        },
        "currentState": state1,
        "botId": "9000",
        "botVersion": "0002"
    }
    
    response2 = requests.post(f"{base_url}/api/v1/execute", headers={"Content-Type": "application/json"}, json=payload2)
    result2 = response2.json()
    state2 = result2.get("meta", {}).get("dialogState", "unknown")
    memory2 = result2.get("memory", {})
    
    print(f"📍 State 2: {state2}")
    print(f"📦 Memory 2: {json.dumps(memory2, indent=2, ensure_ascii=False)}")
    
    # Step 3: sts_router에서 실제 입력으로 요청
    print("\n" + "="*50)
    print("Step 3: sts_router -> 실제 입력으로 요청")
    payload3 = {
        "sessionId": session_id,
        "requestId": "test-request-3",
        "userInput": {
            "type": "text",
            "content": {
                "text": "계속 진행",
                "nluResult": {
                    "intent": "say.yes",
                    "entities": []
                }
            }
        },
        "currentState": state2,
        "botId": "9000",
        "botVersion": "0002"
    }
    
    response3 = requests.post(f"{base_url}/api/v1/execute", headers={"Content-Type": "application/json"}, json=payload3)
    result3 = response3.json()
    state3 = result3.get("meta", {}).get("dialogState", "unknown")
    memory3 = result3.get("memory", {})
    
    print(f"📍 State 3: {state3}")
    print(f"📦 Memory 3: {json.dumps(memory3, indent=2, ensure_ascii=False)}")
    
    # 결과 분석
    print("\n" + "="*50)
    print("📊 결과 분석")
    print(f"Step 2 상태: {state2}")
    print(f"Step 3 상태: {state3}")
    
    if state2 == "sts_router" and state3 == "sts_webhook_test":
        print("✅ sts_router에서 사용자 입력을 기다리고 정상적으로 전이됨!")
        return True
    else:
        print(f"❌ sts_router에서 제대로 작동하지 않음")
        print(f"   Step 2: {state2} (expected: sts_router)")
        print(f"   Step 3: {state3} (expected: sts_webhook_test)")
        return False

if __name__ == "__main__":
    success = test_sts_router_wait_debug()
    if success:
        print("\n🎉 Test passed!")
    else:
        print("\n💥 Test failed!")
        exit(1)
