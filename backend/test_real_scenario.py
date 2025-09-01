#!/usr/bin/env python3
"""
실제 시나리오 파일을 사용한 __ANY_INTENT__ 처리 테스트
"""

import asyncio
import sys
import os
import json

# 현재 디렉토리를 Python 경로에 추가
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from services.concrete_handlers import IntentHandlerV2
from services.transition_manager import TransitionManager
from services.nlu_processor import NLUProcessor
from services.memory_manager import MemoryManager
from services.scenario_manager import ScenarioManager
from services.base_handler import ExecutionContext

async def test_real_scenario():
    """실제 시나리오 파일을 사용한 테스트"""
    
    print("🧪 실제 시나리오 파일을 사용한 __ANY_INTENT__ 처리 테스트")
    
    # 시나리오 파일 로드
    try:
        with open("test_scenario.json", "r", encoding="utf-8") as f:
            scenario = json.load(f)
        print("✅ 시나리오 파일 로드 성공")
    except Exception as e:
        print(f"❌ 시나리오 파일 로드 실패: {e}")
        return
    
    # 의존성 객체들 생성
    scenario_manager = ScenarioManager()
    transition_manager = TransitionManager(scenario_manager)
    nlu_processor = NLUProcessor(scenario_manager, transition_manager)
    memory_manager = MemoryManager(scenario_manager)
    
    # IntentHandlerV2 생성
    intent_handler = IntentHandlerV2(transition_manager, nlu_processor, memory_manager)
    
    # 테스트 케이스들
    test_cases = [
        {
            "name": "정확한 인텐트 매칭 (greeting)",
            "intent": "greeting",
            "expected_state": "GreetingState",
            "expected_memory_key": "GREETING_COUNT"
        },
        {
            "name": "__ANY_INTENT__ 매칭 (unknown_intent)",
            "intent": "unknown_intent",
            "expected_state": "FallbackState",
            "expected_memory_key": "FALLBACK_COUNT"
        },
        {
            "name": "__ANY_INTENT__ 매칭 (random_text)",
            "intent": "random_text",
            "expected_state": "FallbackState",
            "expected_memory_key": "FALLBACK_COUNT"
        },
        {
            "name": "GreetingState에서 help 인텐트",
            "intent": "help",
            "current_state": "GreetingState",
            "expected_state": "HelpState",
            "expected_memory_key": None
        },
        {
            "name": "GreetingState에서 __ANY_INTENT__ 매칭",
            "intent": "unknown_command",
            "current_state": "GreetingState",
            "expected_state": "FallbackState",
            "expected_memory_key": None
        }
    ]
    
    for i, test_case in enumerate(test_cases, 1):
        print(f"\n🔍 테스트 케이스 {i}: {test_case['name']}")
        print(f"  - 테스트 인텐트: {test_case['intent']}")
        print(f"  - 현재 상태: {test_case.get('current_state', 'Start')}")
        print(f"  - 예상 상태: {test_case['expected_state']}")
        print(f"  - 예상 메모리 키: {test_case['expected_memory_key']}")
        
        # 현재 상태의 dialog state 찾기
        current_state = test_case.get('current_state', 'Start')
        current_dialog_state = None
        
        for plan in scenario["plan"]:
            for dialog_state in plan["dialogState"]:
                if dialog_state["name"] == current_state:
                    current_dialog_state = dialog_state
                    break
            if current_dialog_state:
                break
        
        if not current_dialog_state:
            print(f"  ❌ 현재 상태를 찾을 수 없음: {current_state}")
            continue
        
        # 테스트 메모리
        test_memory = {
            "NLU_RESULT": {
                "results": [{
                    "nluNbest": [{
                        "intent": test_case["intent"]
                    }]
                }]
            }
        }
        
        # ExecutionContext 생성
        context = ExecutionContext(
            session_id=f"test_session_{i}",
            current_state=current_state,
            scenario=scenario,
            memory=test_memory,
            user_input=f"테스트 입력 {i}",
            current_dialog_state=current_dialog_state
        )
        
        # can_handle 테스트
        can_handle_result = await intent_handler.can_handle(context)
        print(f"  - can_handle 결과: {can_handle_result}")
        
        if can_handle_result:
            # execute 테스트
            try:
                result = await intent_handler.execute(context)
                print(f"  - 실행 결과:")
                print(f"    - 새 상태: {result.new_state}")
                print(f"    - 메시지: {result.messages}")
                print(f"    - 메모리 업데이트: {result.updated_memory}")
                
                # 검증
                if result.new_state == test_case["expected_state"]:
                    print(f"  ✅ 상태 전이 성공: {test_case['expected_state']}")
                else:
                    print(f"  ❌ 상태 전이 실패: 예상={test_case['expected_state']}, 실제={result.new_state}")
                
                if test_case["expected_memory_key"]:
                    if test_case["expected_memory_key"] in result.updated_memory:
                        print(f"  ✅ 메모리 업데이트 성공: {test_case['expected_memory_key']}")
                    else:
                        print(f"  ❌ 메모리 업데이트 실패: {test_case['expected_memory_key']} 없음")
                else:
                    print(f"  ℹ️ 메모리 업데이트 검증 생략")
                
            except Exception as e:
                print(f"  ❌ 실행 중 오류: {e}")
                import traceback
                traceback.print_exc()
        else:
            print("  ❌ Handler가 실행되지 않음")
    
    print("\n✅ 모든 테스트 완료")

if __name__ == "__main__":
    asyncio.run(test_real_scenario())
