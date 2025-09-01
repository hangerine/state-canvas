#!/usr/bin/env python3
"""
sts_router 상태에서 __ANY_INTENT__가 사용자 입력을 기다리는지 테스트하는 스크립트
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

async def test_sts_router_any_intent():
    """sts_router 상태에서 __ANY_INTENT__ 처리 테스트"""
    
    print("🧪 sts_router 상태에서 __ANY_INTENT__ 처리 테스트 시작")
    
    # 의존성 객체들 생성
    scenario_manager = ScenarioManager()
    transition_manager = TransitionManager(scenario_manager)
    nlu_processor = NLUProcessor(scenario_manager, transition_manager)
    memory_manager = MemoryManager(scenario_manager)
    
    # IntentHandlerV2 생성
    intent_handler = IntentHandlerV2(
        transition_manager=transition_manager,
        nlu_processor=nlu_processor,
        memory_manager=memory_manager
    )
    
    # sts_router 상태 정의 (테스트용)
    sts_router_state = {
        "name": "sts_router",
        "entryAction": {
            "directives": [
                {
                    "content": {
                        "text": "Now you are in STS router."
                    }
                }
            ]
        },
        "intentHandlers": [
            {
                "intent": "__ANY_INTENT__",
                "action": {},
                "transitionTarget": {
                    "scenario": "Main",
                    "dialogState": "sts_webhook_test"
                }
            }
        ]
    }
    
    # 메모리 초기화
    memory = {
        "sessionId": "test-session-sts-router",
        "requestId": "test-request-sts-router"
    }
    
    print(f"📍 sts_router 상태: {sts_router_state.get('name')}")
    print(f"📍 intentHandlers: {len(sts_router_state.get('intentHandlers', []))}")
    
    # 1. 사용자 입력 없음 테스트
    print("\n🔍 1. 사용자 입력 없음 테스트")
    context_no_input = ExecutionContext(
        session_id="test-session",
        current_state="sts_router",
        user_input="",
        memory=memory,
        scenario={"name": "Main"},
        current_dialog_state=sts_router_state
    )
    
    can_handle_no_input = await intent_handler.can_handle(context_no_input)
    print(f"📍 can_handle (사용자 입력 없음): {can_handle_no_input}")
    
    # 2. 사용자 입력 있음, __ANY_INTENT__ 매칭 테스트
    print("\n🔍 2. 사용자 입력 있음, __ANY_INTENT__ 매칭 테스트")
    memory_with_input = memory.copy()
    memory_with_input["NLU_RESULT"] = {
        "type": "custom.nlu",
        "results": [{
            "nluNbest": [{
                "intent": "say.yes",
                "confidenceScore": 1.0,
                "status": "accept",
                "entities": [],
                "extra": {}
            }],
            "text": "좋아",
            "extra": {}
        }]
    }
    
    context_with_input = ExecutionContext(
        session_id="test-session",
        current_state="sts_router",
        user_input="좋아",
        memory=memory_with_input,
        scenario={"name": "Main"},
        current_dialog_state=sts_router_state
    )
    
    can_handle_with_input = await intent_handler.can_handle(context_with_input)
    print(f"📍 can_handle (사용자 입력 있음): {can_handle_with_input}")
    
    # 3. execute 테스트 - __ANY_INTENT__ 처리
    print("\n🔍 3. execute 테스트 (__ANY_INTENT__ 처리)")
    if can_handle_with_input:
        result = await intent_handler.execute(context_with_input)
        print(f"📍 execute 결과: {result}")
        if result.transitions:
            for transition in result.transitions:
                print(f"📍 전이: {transition.fromState} -> {transition.toState}")
                print(f"📍 이유: {transition.reason}")
    else:
        print("📍 __ANY_INTENT__가 can_handle에서 False를 반환하므로 execute가 호출되지 않음")
    
    # 4. transition_manager 직접 테스트
    print("\n🔍 4. transition_manager 직접 테스트")
    intent_transition = transition_manager.check_intent_handlers(
        sts_router_state, "say.yes", memory_with_input
    )
    if intent_transition:
        print(f"📍 transition_manager 결과: {intent_transition.fromState} -> {intent_transition.toState}")
        print(f"📍 이유: {intent_transition.reason}")
    else:
        print("📍 transition_manager에서 전이를 찾을 수 없음")
    
    print("\n✅ sts_router 상태에서 __ANY_INTENT__ 처리 테스트 완료")

if __name__ == "__main__":
    asyncio.run(test_sts_router_any_intent())

