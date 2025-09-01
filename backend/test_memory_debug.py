#!/usr/bin/env python3
"""
메모리 디버깅 테스트
"""

import requests
import json
import time

def test_memory_debug():
    """메모리가 어떻게 처리되는지 디버깅합니다."""
    base_url = "http://localhost:8000"
    session_id = f"test-memory-debug-{int(time.time())}"
    
    print(f"🔍 Testing memory handling")
    print(f"📋 Session ID: {session_id}")
    
    # Step 1: Start -> P111
    print("\n" + "="*50)
    print("Step 1: Start -> P111")
    payload1 = {
        "sessionId": session_id,
        "requestId": "test-request-1",
        "userInput": {
            "type": "text",
            "content": {
                "text": "USER_DIALOG_START",
                "nluResult": {
                    "intent": "USER_DIALOG_START",
                    "entities": []
                }
            }
        },
        "currentState": "Start",
        "botId": "9000",
        "botVersion": "0002"
    }
    
    response1 = requests.post(f"{base_url}/api/v1/execute", headers={"Content-Type": "application/json"}, json=payload1)
    result1 = response1.json()
    
    print(f"📍 State: {result1.get('meta', {}).get('dialogState', 'unknown')}")
    print(f"📦 Memory: {json.dumps(result1.get('memory', {}), indent=2, ensure_ascii=False)}")
    print(f"📦 Directives: {json.dumps(result1.get('directives', []), indent=2, ensure_ascii=False)}")
    print(f"📦 Meta: {json.dumps(result1.get('meta', {}), indent=2, ensure_ascii=False)}")
    
    # Step 2: P111 -> weather_inform_response
    print("\n" + "="*50)
    print("Step 2: P111 -> weather_inform_response")
    payload2 = {
        "sessionId": session_id,
        "requestId": "test-request-2",
        "userInput": {
            "type": "text",
            "content": {
                "text": "날씨",
                "nluResult": {
                    "intent": "Weather.Inform",
                    "entities": []
                }
            }
        },
        "currentState": "P111",
        "botId": "9000",
        "botVersion": "0002"
    }
    
    response2 = requests.post(f"{base_url}/api/v1/execute", headers={"Content-Type": "application/json"}, json=payload2)
    result2 = response2.json()
    
    print(f"📍 State: {result2.get('meta', {}).get('dialogState', 'unknown')}")
    print(f"📦 Memory: {json.dumps(result2.get('memory', {}), indent=2, ensure_ascii=False)}")
    print(f"📦 Directives: {json.dumps(result2.get('directives', []), indent=2, ensure_ascii=False)}")
    print(f"📦 Meta: {json.dumps(result2.get('meta', {}), indent=2, ensure_ascii=False)}")

if __name__ == "__main__":
    test_memory_debug()
