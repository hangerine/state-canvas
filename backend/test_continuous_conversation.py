#!/usr/bin/env python3
"""
연속적인 대화 플로우 테스트 (Frontend 시뮬레이션)
"""
import requests
import json
import time

def test_continuous_conversation():
    """연속적인 대화 플로우를 테스트합니다."""
    base_url = "http://localhost:8000"
    
    # 🚀 세션 ID를 고정값으로 설정 (메모리 병합 문제 해결)
    session_id = "test-continuous-conversation-fixed"
    
    print(f"🔍 Testing continuous conversation flow (Frontend simulation)")
    print(f"📋 Session ID: {session_id}")
    
    # 🚀 Frontend와 동일한 방식으로 currentState 관리
    current_state = "Start"  # Frontend의 setCurrentState와 동일
    
    # Step 1: Start -> P111
    print("\n" + "="*50)
    print("Step 1: Start -> P111")
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
        "currentState": current_state,  # Frontend의 currentState 사용
        "botId": "9000",
        "botVersion": "0002"
    }
    
    response1 = requests.post(f"{base_url}/api/v1/execute", headers={"Content-Type": "application/json"}, json=payload1)
    result1 = response1.json()
    state1 = result1.get("meta", {}).get("dialogState", "unknown")
    memory1 = result1.get("memory", {})
    
    # 🚀 Frontend의 onStateChange와 동일한 방식으로 상태 업데이트
    current_state = state1  # Frontend: onStateChange(response.meta.dialogState)
    
    print(f"📍 State 1: {state1}")
    print(f"📦 Memory 1: {json.dumps(memory1, indent=2, ensure_ascii=False)}")
    print(f"🎯 Directives 1: {json.dumps(result1.get('directives', []), indent=2, ensure_ascii=False)}")
    
    # Step 2: P111 -> weather_inform_response
    print("\n" + "="*50)
    print("Step 2: P111 -> weather_inform_response")
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
        "currentState": current_state,  # Frontend의 currentState 사용
        "botId": "9000",
        "botVersion": "0002"
    }
    
    response2 = requests.post(f"{base_url}/api/v1/execute", headers={"Content-Type": "application/json"}, json=payload2)
    result2 = response2.json()
    state2 = result2.get("meta", {}).get("dialogState", "unknown")
    memory2 = result2.get("memory", {})
    
    # 🚀 Frontend의 onStateChange와 동일한 방식으로 상태 업데이트
    current_state = state2  # Frontend: onStateChange(response.meta.dialogState)
    
    print(f"📍 State 2: {state2}")
    print(f"📦 Memory 2: {json.dumps(memory2, indent=2, ensure_ascii=False)}")
    print(f"🎯 Directives 2: {json.dumps(result2.get('directives', []), indent=2, ensure_ascii=False)}")
    
    # Step 3: weather_inform_response -> slot filling (CITY: 서울)
    print("\n" + "="*50)
    print("Step 3: weather_inform_response -> slot filling (CITY: 서울)")
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
        "currentState": current_state,  # Frontend의 currentState 사용
        "botId": "9000",
        "botVersion": "0002"
    }
    
    response3 = requests.post(f"{base_url}/api/v1/execute", headers={"Content-Type": "application/json"}, json=payload3)
    result3 = response3.json()
    state3 = result3.get("meta", {}).get("dialogState", "unknown")
    memory3 = result3.get("memory", {})
    
    # 🚀 Frontend의 onStateChange와 동일한 방식으로 상태 업데이트
    current_state = state3  # Frontend: onStateChange(response.meta.dialogState)
    
    print(f"📍 State 3: {state3}")
    print(f"📦 Memory 3: {json.dumps(memory3, indent=2, ensure_ascii=False)}")
    print(f"🎯 Directives 3: {json.dumps(result3.get('directives', []), indent=2, ensure_ascii=False)}")
    
    # Step 4: slot_filled_response -> positive_sentence_response
    print("\n" + "="*50)
    print("Step 4: slot_filled_response -> positive_sentence_response")
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
        "currentState": current_state,  # Frontend의 currentState 사용
        "botId": "9000",
        "botVersion": "0002"
    }
    
    response4 = requests.post(f"{base_url}/api/v1/execute", headers={"Content-Type": "application/json"}, json=payload4)
    result4 = response4.json()
    state4 = result4.get("meta", {}).get("dialogState", "unknown")
    memory4 = result4.get("memory", {})
    
    # 🚀 Frontend의 onStateChange와 동일한 방식으로 상태 업데이트
    current_state = state4  # Frontend: onStateChange(response.meta.dialogState)
    
    print(f"📍 State 4: {state4}")
    print(f"📦 Memory 4: {json.dumps(memory4, indent=2, ensure_ascii=False)}")
    print(f"🎯 Directives 4: {json.dumps(result4.get('directives', []), indent=2, ensure_ascii=False)}")
    
    # Step 5: positive_sentence_response -> sts_router
    print("\n" + "="*50)
    print("Step 5: positive_sentence_response -> sts_router")
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
        "currentState": current_state,  # Frontend의 currentState 사용
        "botId": "9000",
        "botVersion": "0002"
    }
    
    response5 = requests.post(f"{base_url}/api/v1/execute", headers={"Content-Type": "application/json"}, json=payload5)
    result5 = response5.json()
    state5 = result5.get("meta", {}).get("dialogState", "unknown")
    memory5 = result5.get("memory", {})
    
    # 🚀 Frontend의 onStateChange와 동일한 방식으로 상태 업데이트
    current_state = state5  # Frontend: onStateChange(response.meta.dialogState)
    
    print(f"📍 State 5: {state5}")
    print(f"📦 Memory 5: {json.dumps(memory5, indent=2, ensure_ascii=False)}")
    print(f"🎯 Directives 5: {json.dumps(result5.get('directives', []), indent=2, ensure_ascii=False)}")
    
    # Step 6: sts_router -> 사용자 입력 대기 테스트
    print("\n" + "="*50)
    print("Step 6: sts_router -> 사용자 입력 대기 테스트")
    payload6 = {
        "sessionId": session_id,
        "requestId": "test-request-6",
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
        "currentState": current_state,  # Frontend의 currentState 사용
        "botId": "9000",
        "botVersion": "0002"
    }
    
    response6 = requests.post(f"{base_url}/api/v1/execute", headers={"Content-Type": "application/json"}, json=payload6)
    result6 = response6.json()
    state6 = result6.get("meta", {}).get("dialogState", "unknown")
    memory6 = result6.get("memory", {})
    
    # 🚀 Frontend의 onStateChange와 동일한 방식으로 상태 업데이트
    current_state = state6  # Frontend: onStateChange(response.meta.dialogState)
    
    print(f"📍 State 6: {state6}")
    print(f"📦 Memory 6: {json.dumps(memory6, indent=2, ensure_ascii=False)}")
    print(f"🎯 Directives 6: {json.dumps(result6.get('directives', []), indent=2, ensure_ascii=False)}")
    
    # 결과 분석
    print("\n" + "="*50)
    print("📊 결과 분석")
    print(f"최종 상태: {state6}")
    print(f"누적 메모리: {json.dumps(memory6, indent=2, ensure_ascii=False)}")
    
    if state6 == "sts_router":
        print("✅ sts_router에서 사용자 입력을 기다리고 있음")
        return True
    else:
        print(f"❌ sts_router에서 멈추지 않음. 최종 상태: {state6}")
        return False

if __name__ == "__main__":
    success = test_continuous_conversation()
    if success:
        print("\n🎉 Continuous conversation test passed!")
    else:
        print("\n💥 Continuous conversation test failed!")
        exit(1)
