#!/usr/bin/env python3
"""
__ANY_INTENT__ 처리 테스트 스크립트
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

async def test_any_intent():
    """__ANY_INTENT__ 처리 테스트"""
    
    print("🧪 __ANY_INTENT__ 처리 테스트 시작")
    
    # 의존성 객체들 생성
    scenario_manager = ScenarioManager()
    transition_manager = TransitionManager(scenario_manager)
    nlu_processor = NLUProcessor(scenario_manager, transition_manager)
    memory_manager = MemoryManager(scenario_manager)
    
    # IntentHandlerV2 생성
    intent_handler = IntentHandlerV2(transition_manager, nlu_processor, memory_manager)
    
    # 테스트 시나리오 데이터
    test_scenario = {
        "plan": [{
            "name": "TestPlan",
            "dialogState": [{
                "name": "TestState",
                "intentHandlers": [
                    {
                        "intent": "__ANY_INTENT__",
                        "transitionTarget": {
                            "dialogState": "NextState"
                        },
                        "action": {
                            "memoryActions": [
                                {
                                    "actionType": "ADD",
                                    "memorySlotKey": "TEST_KEY",
                                    "memorySlotValue": "TEST_VALUE"
                                }
                            ]
                        }
                    }
                ]
            }]
        }]
    }
    
    # 테스트 메모리
    test_memory = {
        "NLU_RESULT": {
            "results": [{
                "nluNbest": [{
                    "intent": "UNKNOWN_INTENT"
                }]
            }]
        }
    }
    
    # ExecutionContext 생성
    context = ExecutionContext(
        session_id="test_session",
        current_state="TestState",
        scenario=test_scenario,
        memory=test_memory,
        user_input="테스트 입력",
        current_dialog_state=test_scenario["plan"][0]["dialogState"][0]
    )
    
    print(f"📋 테스트 컨텍스트 생성됨:")
    print(f"  - 현재 상태: {context.current_state}")
    print(f"  - 사용자 입력: '{context.user_input}'")
    print(f"  - Intent Handlers: {len(context.current_dialog_state.get('intentHandlers', []))}")
    
    # can_handle 테스트
    print("\n🔍 can_handle 테스트:")
    can_handle_result = await intent_handler.can_handle(context)
    print(f"  - can_handle 결과: {can_handle_result}")
    
    if can_handle_result:
        # execute 테스트
        print("\n🚀 execute 테스트:")
        try:
            result = await intent_handler.execute(context)
            print(f"  - 실행 결과: {result}")
            print(f"  - 새 상태: {result.new_state}")
            print(f"  - 메시지: {result.messages}")
            print(f"  - 메모리 업데이트: {result.updated_memory}")
        except Exception as e:
            print(f"  - 실행 중 오류: {e}")
            import traceback
            traceback.print_exc()
    else:
        print("❌ Handler가 실행되지 않음")
    
    print("\n✅ 테스트 완료")

if __name__ == "__main__":
    asyncio.run(test_any_intent())

