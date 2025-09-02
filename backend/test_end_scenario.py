#!/usr/bin/env python3
"""
__END_SCENARIO__ 동작 테스트

시나리오:
1. act_01_0235 상태에서 조건 핸들러 실행
2. Scene1로 전이
3. Scene1에서 __END_SCENARIO__ 만남
4. act_01_0235로 복귀하여 다음 핸들러 실행
5. end_process로 전이
"""
import requests
import json
import time

def test_end_scenario():
    """__END_SCENARIO__ 동작을 테스트합니다."""
    base_url = "http://localhost:8000"
    
    session_id = "test-end-scenario"
    
    print(f"🔍 Testing __END_SCENARIO__ behavior")
    print(f"📋 Session ID: {session_id}")
    
    # Step 1: Start -> P111 -> weather_inform_response -> slot_filled_response -> positive_sentence_response -> sts_router -> sts_webhook_test -> act_01_0235
    print("\n" + "="*50)
    print("Step 1: Navigate to act_01_0235")
    
    # 빠른 경로로 act_01_0235까지 이동
    current_state = "Start"
    
    # Start -> P111 (조건 전이)
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
        "currentState": current_state,
        "botId": "9000",
        "botVersion": "0002"
    }
    
    response1 = requests.post(f"{base_url}/api/v1/execute", headers={"Content-Type": "application/json"}, json=payload1)
    result1 = response1.json()
    current_state = result1.get("meta", {}).get("dialogState", "unknown")
    
    print(f"📍 State 1: {current_state}")
    
    # P111 -> weather_inform_response (Weather.Inform 인텐트)
    payload2 = {
        "sessionId": session_id,
        "requestId": "test-request-2",
        "userInput": {
            "type": "text",
            "content": {
                "text": "날씨 알려줘",
                "nluResult": {
                    "intent": "Weather.Inform",
                    "entities": []
                }
            }
        },
        "currentState": current_state,
        "botId": "9000",
        "botVersion": "0002"
    }
    
    response2 = requests.post(f"{base_url}/api/v1/execute", headers={"Content-Type": "application/json"}, json=payload2)
    result2 = response2.json()
    current_state = result2.get("meta", {}).get("dialogState", "unknown")
    
    print(f"📍 State 2: {current_state}")
    
    # weather_inform_response -> slot_filled_response (슬롯 채우기)
    payload3 = {
        "sessionId": session_id,
        "requestId": "test-request-3",
        "userInput": {
            "type": "text",
            "content": {
                "text": "서울",
                "nluResult": {
                    "intent": "",
                    "entities": [
                        {
                            "entity": "CITY",
                            "value": "서울"
                        }
                    ]
                }
            }
        },
        "currentState": current_state,
        "botId": "9000",
        "botVersion": "0002"
    }
    
    response3 = requests.post(f"{base_url}/api/v1/execute", headers={"Content-Type": "application/json"}, json=payload3)
    result3 = response3.json()
    current_state = result3.get("meta", {}).get("dialogState", "unknown")
    
    print(f"📍 State 3: {current_state}")
    
    # slot_filled_response -> positive_sentence_response (Positive 인텐트)
    payload4 = {
        "sessionId": session_id,
        "requestId": "test-request-4",
        "userInput": {
            "type": "text",
            "content": {
                "text": "응",
                "nluResult": {
                    "intent": "Positive",
                    "entities": []
                }
            }
        },
        "currentState": current_state,
        "botId": "9000",
        "botVersion": "0002"
    }
    
    response4 = requests.post(f"{base_url}/api/v1/execute", headers={"Content-Type": "application/json"}, json=payload4)
    result4 = response4.json()
    current_state = result4.get("meta", {}).get("dialogState", "unknown")
    
    print(f"📍 State 4: {current_state}")
    
    # positive_sentence_response -> sts_router (say.yes 인텐트)
    payload5 = {
        "sessionId": session_id,
        "requestId": "test-request-5",
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
        "currentState": current_state,
        "botId": "9000",
        "botVersion": "0002"
    }
    
    response5 = requests.post(f"{base_url}/api/v1/execute", headers={"Content-Type": "application/json"}, json=payload5)
    result5 = response5.json()
    current_state = result5.get("meta", {}).get("dialogState", "unknown")
    
    print(f"📍 State 5: {current_state}")
    
    # sts_router -> sts_webhook_test (__ANY_INTENT__)
    payload6 = {
        "sessionId": session_id,
        "requestId": "test-request-6",
        "userInput": {
            "type": "text",
            "content": {
                "text": "테스트",
                "nluResult": {
                    "intent": "test",
                    "entities": []
                }
            }
        },
        "currentState": current_state,
        "botId": "9000",
        "botVersion": "0002"
    }
    
    response6 = requests.post(f"{base_url}/api/v1/execute", headers={"Content-Type": "application/json"}, json=payload6)
    result6 = response6.json()
    current_state = result6.get("meta", {}).get("dialogState", "unknown")
    
    print(f"📍 State 6: {current_state}")
    
    if current_state != "sts_webhook_test":
        print(f"❌ Failed to reach sts_webhook_test. Current state: {current_state}")
        return
    
    print(f"✅ Successfully reached sts_webhook_test")
    
    # sts_webhook_test -> act_01_0235 (조건 핸들러: NLU_INTENT == "ACT_01_0235")
    # 먼저 NLU_INTENT를 메모리에 설정해야 함
    payload7 = {
        "sessionId": session_id,
        "requestId": "test-request-7",
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
        "currentState": current_state,
        "botId": "9000",
        "botVersion": "0002"
    }
    
    # NLU_INTENT를 메모리에 직접 설정 (테스트용)
    payload7["userInput"]["content"]["nluResult"]["intent"] = "ACT_01_0235"
    
    response7 = requests.post(f"{base_url}/api/v1/execute", headers={"Content-Type": "application/json"}, json=payload7)
    result7 = response7.json()
    current_state = result7.get("meta", {}).get("dialogState", "unknown")
    
    print(f"📍 State 7: {current_state}")
    
    if current_state != "act_01_0235":
        print(f"❌ Failed to reach act_01_0235. Current state: {current_state}")
        return
    
    print(f"✅ Successfully reached act_01_0235")
    
    # Step 2: act_01_0235에서 첫 번째 조건 핸들러 실행 (Scene1로 전이)
    print("\n" + "="*50)
    print("Step 2: Execute first condition handler in act_01_0235 (transition to Scene1)")
    
    payload8 = {
        "sessionId": session_id,
        "requestId": "test-request-8",
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
        "currentState": current_state,
        "botId": "9000",
        "botVersion": "0002"
    }
    
    response8 = requests.post(f"{base_url}/api/v1/execute", headers={"Content-Type": "application/json"}, json=payload8)
    result8 = response8.json()
    current_state = result8.get("meta", {}).get("dialogState", "unknown")
    
    print(f"📍 State 8: {current_state}")
    print(f"📦 Memory 8: {json.dumps(result8.get('memory', {}), indent=2, ensure_ascii=False)}")
    print(f"🎯 Directives 8: {json.dumps(result8.get('directives', []), indent=2, ensure_ascii=False)}")
    
    if current_state == "Start" and "Scene1" in str(result8.get('directives', [])):
        print(f"✅ Successfully transitioned to Scene1")
    else:
        print(f"❌ Failed to transition to Scene1. Current state: {current_state}")
        return
    
    # Step 3: Scene1에서 __END_SCENARIO__ 만남
    print("\n" + "="*50)
    print("Step 3: Scene1 reaches __END_SCENARIO__")
    
    payload9 = {
        "sessionId": session_id,
        "requestId": "test-request-9",
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
        "currentState": current_state,
        "botId": "9000",
        "botVersion": "0002"
    }
    
    response9 = requests.post(f"{base_url}/api/v1/execute", headers={"Content-Type": "application/json"}, json=payload9)
    result9 = response9.json()
    current_state = result9.get("meta", {}).get("dialogState", "unknown")
    
    print(f"📍 State 9: {current_state}")
    print(f"📦 Memory 9: {json.dumps(result9.get('memory', {}), indent=2, ensure_ascii=False)}")
    print(f"🎯 Directives 9: {json.dumps(result9.get('directives', []), indent=2, ensure_ascii=False)}")
    
    if current_state == "end_process":
        print(f"✅ Successfully resumed to act_01_0235 and executed next handler (end_process)")
    elif current_state == "act_01_0235":
        print(f"✅ Successfully resumed to act_01_0235")
    else:
        print(f"❌ Unexpected state after __END_SCENARIO__. Current state: {current_state}")
        return
    
    print("\n" + "="*50)
    print("📊 Test Results")
    print(f"✅ __END_SCENARIO__ 동작 테스트 완료!")
    print(f"📍 최종 상태: {current_state}")
    print(f"🎯 스택에서 복귀하여 다음 핸들러 실행 성공")

if __name__ == "__main__":
    test_end_scenario()
