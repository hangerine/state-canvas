#!/usr/bin/env python3
"""
복잡한 __ANY_INTENT__ 처리 테스트 스크립트
"""

import asyncio
import sys
import os

# 현재 디렉토리를 Python 경로에 추가
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from services.concrete_handlers import IntentHandlerV2
from services.transition_manager import TransitionManager
from services.nlu_processor import NLUProcessor
from services.memory_manager import MemoryManager
from services.scenario_manager import ScenarioManager
from services.base_handler import ExecutionContext

async def test_complex_any_intent():
    """복잡한 __ANY_INTENT__ 처리 테스트"""
    
    print("🧪 복잡한 __ANY_INTENT__ 처리 테스트 시작")
    
    # 의존성 객체들 생성
    scenario_manager = ScenarioManager()
    transition_manager = TransitionManager(scenario_manager)
    nlu_processor = NLUProcessor(scenario_manager, transition_manager)
    memory_manager = MemoryManager(scenario_manager)
    
    # IntentHandlerV2 생성
    intent_handler = IntentHandlerV2(transition_manager, nlu_processor, memory_manager)
    
    # 복잡한 테스트 시나리오 데이터
    test_scenario = {
        "plan": [{
            "name": "TestPlan",
            "dialogState": [{
                "name": "TestState",
                "intentHandlers": [
                    {
                        "intent": "greeting",
                        "transitionTarget": {
                            "dialogState": "GreetingState"
                        },
                        "action": {
                            "memoryActions": [
                                {
                                    "actionType": "ADD",
                                    "memorySlotKey": "GREETING_COUNT",
                                    "memorySlotValue": "1"
                                }
                            ]
                        }
                    },
                    {
                        "intent": "__ANY_INTENT__",
                        "transitionTarget": {
                            "dialogState": "FallbackState"
                        },
                        "action": {
                            "memoryActions": [
                                {
                                    "actionType": "ADD",
                                    "memorySlotKey": "FALLBACK_COUNT",
                                    "memorySlotValue": "1"
                                }
                            ]
                        }
                    },
                    {
                        "intent": "goodbye",
                        "transitionTarget": {
                            "dialogState": "GoodbyeState"
                        },
                        "action": {
                            "memoryActions": [
                                {
                                    "actionType": "ADD",
                                    "memorySlotKey": "GOODBYE_COUNT",
                                    "memorySlotValue": "1"
                                }
                            ]
                        }
                    }
                ]
            }]
        }]
    }
    
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
            "name": "정확한 인텐트 매칭 (goodbye)",
            "intent": "goodbye",
            "expected_state": "GoodbyeState",
            "expected_memory_key": "GOODBYE_COUNT"
        }
    ]
    
    for i, test_case in enumerate(test_cases, 1):
        print(f"\n🔍 테스트 케이스 {i}: {test_case['name']}")
        print(f"  - 테스트 인텐트: {test_case['intent']}")
        print(f"  - 예상 상태: {test_case['expected_state']}")
        print(f"  - 예상 메모리 키: {test_case['expected_memory_key']}")
        
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
            current_state="TestState",
            scenario=test_scenario,
            memory=test_memory,
            user_input=f"테스트 입력 {i}",
            current_dialog_state=test_scenario["plan"][0]["dialogState"][0]
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
                
                if test_case["expected_memory_key"] in result.updated_memory:
                    print(f"  ✅ 메모리 업데이트 성공: {test_case['expected_memory_key']}")
                else:
                    print(f"  ❌ 메모리 업데이트 실패: {test_case['expected_memory_key']} 없음")
                
            except Exception as e:
                print(f"  ❌ 실행 중 오류: {e}")
                import traceback
                traceback.print_exc()
        else:
            print("  ❌ Handler가 실행되지 않음")
    
    print("\n✅ 모든 테스트 완료")

if __name__ == "__main__":
    asyncio.run(test_complex_any_intent())

