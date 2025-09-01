import requests
import json
import time


def test_sts_router_wait():
    """sts_router에서 사용자 입력 대기 기능을 테스트합니다."""
    base_url = "http://localhost:8000"
    session_id = f"test-sts-router-wait-{int(time.time())}"
    
    print(f"🔍 Testing sts_router wait functionality")
    print(f"📋 Session ID: {session_id}")
    
    # 테스트 1: 빈 입력으로 요청 (사용자 입력 대기 상태 확인)
    print("\n--- Test 1: Empty input ---")
    payload1 = {
        "sessionId": session_id,
        "requestId": "test-request-1",
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
        "currentState": "sts_router",
        "botId": "9000",
        "botVersion": "0002"
    }
    
    print(f"📤 Payload 1: {json.dumps(payload1, indent=2, ensure_ascii=False)}")
    
    try:
        response1 = requests.post(
            f"{base_url}/api/v1/execute",
            headers={"Content-Type": "application/json"},
            json=payload1,
            timeout=10
        )
        
        if response1.status_code == 200:
            result1 = response1.json()
            new_state1 = result1.get("meta", {}).get("dialogState", "unknown")
            
            print(f"✅ Response 1: {json.dumps(result1, indent=2, ensure_ascii=False)}")
            print(f"📍 New State 1: {new_state1}")
            
            if new_state1 == "sts_router":
                print("✅ Empty input correctly stayed in sts_router")
            else:
                print(f"⚠️  Empty input caused transition to: {new_state1}")
        else:
            print(f"❌ Error 1: {response1.status_code} - {response1.text}")
            return False
    except Exception as e:
        print(f"❌ Exception 1: {e}")
        return False
    
    # 테스트 2: 실제 입력으로 요청
    print("\n--- Test 2: With input ---")
    payload2 = {
        "sessionId": session_id,
        "requestId": "test-request-2",
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
        "currentState": "sts_router",
        "botId": "9000",
        "botVersion": "0002"
    }
    
    print(f"📤 Payload 2: {json.dumps(payload2, indent=2, ensure_ascii=False)}")
    
    try:
        response2 = requests.post(
            f"{base_url}/api/v1/execute",
            headers={"Content-Type": "application/json"},
            json=payload2,
            timeout=10
        )
        
        if response2.status_code == 200:
            result2 = response2.json()
            new_state2 = result2.get("meta", {}).get("dialogState", "unknown")
            
            print(f"✅ Response 2: {json.dumps(result2, indent=2, ensure_ascii=False)}")
            print(f"📍 New State 2: {new_state2}")
            
            if new_state2 == "sts_webhook_test":
                print("🎉 Successfully transitioned to sts_webhook_test!")
                return True
            else:
                print(f"❌ Failed to transition. Expected: sts_webhook_test, Got: {new_state2}")
                return False
        else:
            print(f"❌ Error 2: {response2.status_code} - {response2.text}")
            return False
    except Exception as e:
        print(f"❌ Exception 2: {e}")
        return False

if __name__ == "__main__":
    success = test_sts_router_wait()
    if success:
        print("\n🎉 Test passed!")
    else:
        print("\n💥 Test failed!")
        exit(1)
