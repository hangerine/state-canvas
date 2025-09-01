#!/usr/bin/env python3
"""
Intent Handler 실행 테스트
사용자 입력이 있을 때 Intent Handler가 제대로 실행되는지 확인
"""

import asyncio
import json
import sys
import os

# 프로젝트 루트를 Python 경로에 추가
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from services.state_engine import StateEngine

async def test_intent_handler():
    """Intent Handler 실행 테스트"""
    
    print("=" * 70)
    print("🧪 Intent Handler 실행 테스트")
    print("=" * 70)
    
    # StateEngine 초기화
    state_engine = StateEngine()
    
    # 테스트 시나리오 로드
    scenario_file = "../tmp/9000-0002.json"
    try:
        with open(scenario_file, 'r', encoding='utf-8') as f:
            scenario = json.load(f)
        print(f"📋 시나리오 로드 완료: {scenario_file}")
    except Exception as e:
        print(f"❌ 시나리오 로드 실패: {e}")
        return
    
    # 테스트 세션 설정
    session_id = "intent_test_session"
    current_state = "P111"  # Intent Handler가 있는 상태
    memory = {
        "sessionId": session_id,
        "USER_INPUT_TYPE": "text"
    }
    
    print(f"\n🎯 테스트 설정:")
    print(f"  - 세션: {session_id}")
    print(f"  - 현재 상태: {current_state}")
    print(f"  - 시나리오: {scenario.get('name', 'Unknown')}")
    
    # 시나리오 로드
    state_engine.load_scenario(session_id, scenario)
    
    # P111 상태 정보 확인
    p111_state = None
    for plan in scenario.get("plan", []):
        for dialog_state in plan.get("dialogState", []):
            if dialog_state.get("name") == "P111":
                p111_state = dialog_state
                break
        if p111_state:
            break
    
    if not p111_state:
        print("❌ P111 상태를 찾을 수 없습니다")
        return
    
    print(f"\n📝 P111 상태 정보:")
    print(f"  - Entry Action: {'있음' if p111_state.get('entryAction') else '없음'}")
    print(f"  - Intent Handlers: {len(p111_state.get('intentHandlers', []))}개")
    print(f"  - Condition Handlers: {len(p111_state.get('conditionHandlers', []))}개")
    
    for i, intent_handler in enumerate(p111_state.get('intentHandlers', [])):
        print(f"    {i+1}. {intent_handler.get('intent')} → {intent_handler.get('transitionTarget', {}).get('dialogState', 'Unknown')}")
    
    # 테스트 1: 사용자 입력 없이 실행
    print(f"\n🔍 테스트 1: 사용자 입력 없이 실행")
    print(f"  - 예상 결과: Intent Handler 실행 안됨, Entry Action만 실행")
    
    try:
        result1 = await state_engine.process_input(
            session_id, "", current_state, scenario, memory.copy()
        )
        
        print(f"  ✅ 결과:")
        print(f"    - 최종 상태: {result1.get('new_state')}")
        print(f"    - 응답: {result1.get('response', '')[:100]}...")
        print(f"    - Intent: {result1.get('intent')}")
        
    except Exception as e:
        print(f"  ❌ 오류: {e}")
        import traceback
        traceback.print_exc()
    
    # 테스트 2: 사용자 입력과 함께 실행
    print(f"\n🔍 테스트 2: 사용자 입력 '날씨'와 함께 실행")
    print(f"  - 예상 결과: Intent Handler 실행되어 weather_inform_response로 전이")
    
    try:
        # 테스트용 NLU 결과를 memory에 설정
        test_memory = memory.copy()
        test_memory["NLU_RESULT"] = {
            "results": [{
                "nluNbest": [{
                    "intent": "Weather.Inform",
                    "entities": []
                }]
            }]
        }
        
        # 세션 스택 상태 확인
        print(f"  📋 실행 전 세션 스택:")
        stack = state_engine.get_scenario_stack(session_id)
        for i, frame in enumerate(stack):
            print(f"    {i}: {frame}")
        
        # 현재 상태 확인
        current_info = state_engine.get_current_scenario_info(session_id)
        print(f"  🎯 현재 시나리오 정보: {current_info}")
        
        result2 = await state_engine.process_input(
            session_id, "날씨", current_state, scenario, test_memory
        )
        
        # 실행 후 세션 스택 상태 확인
        print(f"  📋 실행 후 세션 스택:")
        stack_after = state_engine.get_scenario_stack(session_id)
        for i, frame in enumerate(stack_after):
            print(f"    {i}: {frame}")
        
        print(f"  ✅ 결과:")
        print(f"    - 최종 상태: {result2.get('new_state')}")
        print(f"    - 응답: {result2.get('response', '')[:100]}...")
        print(f"    - Intent: {result2.get('intent')}")
        
        # Intent Handler가 실행되었는지 확인
        if result2.get('new_state') == 'weather_inform_response':
            print(f"  🎯 Intent Handler 실행 성공! P111 → weather_inform_response")
        else:
            print(f"  ⚠️ Intent Handler 실행 실패 - 상태 전이 안됨")
            print(f"    - 예상: weather_inform_response")
            print(f"    - 실제: {result2.get('new_state')}")
        
    except Exception as e:
        print(f"  ❌ 오류: {e}")
        import traceback
        traceback.print_exc()
    
    # 테스트 3: 다른 intent로 테스트
    print(f"\n🔍 테스트 3: 다른 사용자 입력 '안녕'과 함께 실행")
    print(f"  - 예상 결과: NO_INTENT_FOUND, 상태 전이 안됨")
    
    try:
        result3 = await state_engine.process_input(
            session_id, "안녕", current_state, scenario, memory.copy()
        )
        
        print(f"  ✅ 결과:")
        print(f"    - 최종 상태: {result3.get('new_state')}")
        print(f"    - 응답: {result3.get('response', '')[:100]}...")
        print(f"    - Intent: {result3.get('intent')}")
        
    except Exception as e:
        print(f"  ❌ 오류: {e}")
        import traceback
        traceback.print_exc()
    
    print(f"\n" + "=" * 70)
    print("🧪 Intent Handler 실행 테스트 완료")
    print("=" * 70)

if __name__ == "__main__":
    asyncio.run(test_intent_handler())
