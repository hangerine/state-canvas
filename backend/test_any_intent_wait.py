#!/usr/bin/env python3
"""
__ANY_INTENT__가 사용자 입력을 기다리는지 테스트하는 스크립트
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

async def test_any_intent_wait():
    """__ANY_INTENT__가 사용자 입력을 기다리는지 테스트"""
    
    print("🧪 __ANY_INTENT__ 사용자 입력 대기 테스트 시작")
    
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
    
    # 시나리오 로드
    try:
        with open("test_scenario.json", "r", encoding="utf-8") as f:
            import json
            scenario = json.load(f)
        print("✅ 시나리오 파일 로드 성공")
    except Exception as e:
        print(f"❌ 시나리오 파일 로드 실패: {e}")
        return
    
    # 메모리 초기화
    memory = {
        "sessionId": "test-session-any-intent-wait",
        "requestId": "test-request-any-intent-wait"
    }
    
    # NLU 결과 설정 (테스트용)
    def set_nlu_result(text, intent):
        return {
            "type": "custom.nlu",
            "results": [{
                "nluNbest": [{
                    "intent": intent,
                    "confidenceScore": 1.0,
                    "status": "accept",
                    "entities": [],
                    "extra": {}
                }],
                "text": text,
                "extra": {}
            }]
        }
    
    # Start 상태에서 테스트
    start_state = None
    for plan in scenario.get("plan", []):
        for dialog_state in plan.get("dialogState", []):
            if dialog_state.get("name") == "Start":
                start_state = dialog_state
                break
        if start_state:
            break
    
    if not start_state:
        print("❌ Start 상태를 찾을 수 없습니다")
        return
    
    print(f"📍 Start 상태: {start_state.get('name')}")
    print(f"📍 intentHandlers: {len(start_state.get('intentHandlers', []))}")
    
    # 1. can_handle 테스트 - 사용자 입력 없음
    print("\n🔍 1. can_handle 테스트 (사용자 입력 없음)")
    memory_no_input = memory.copy()
    context_no_input = ExecutionContext(
        session_id="test-session",
        current_state="Start",
        user_input="",
        memory=memory_no_input,
        scenario=scenario,
        current_dialog_state=start_state
    )
    
    can_handle_no_input = await intent_handler.can_handle(context_no_input)
    print(f"📍 can_handle (사용자 입력 없음): {can_handle_no_input}")
    
    # 2. can_handle 테스트 - 사용자 입력 있음, 정확한 매칭
    print("\n🔍 2. can_handle 테스트 (사용자 입력 있음, 정확한 매칭)")
    memory_greeting = memory.copy()
    memory_greeting["NLU_RESULT"] = set_nlu_result("안녕하세요", "greeting")
    context_greeting = ExecutionContext(
        session_id="test-session",
        current_state="Start",
        user_input="안녕하세요",
        memory=memory_greeting,
        scenario=scenario,
        current_dialog_state=start_state
    )
    
    can_handle_greeting = await intent_handler.can_handle(context_greeting)
    print(f"📍 can_handle (greeting): {can_handle_greeting}")
    
    # 3. can_handle 테스트 - 사용자 입력 있음, __ANY_INTENT__ 매칭
    print("\n🔍 3. can_handle 테스트 (사용자 입력 있음, __ANY_INTENT__ 매칭)")
    memory_unknown = memory.copy()
    memory_unknown["NLU_RESULT"] = set_nlu_result("알 수 없는 말", "unknown")
    context_unknown = ExecutionContext(
        session_id="test-session",
        current_state="Start",
        user_input="알 수 없는 말",
        memory=memory_unknown,
        scenario=scenario,
        current_dialog_state=start_state
    )
    
    can_handle_unknown = await intent_handler.can_handle(context_unknown)
    print(f"📍 can_handle (unknown): {can_handle_unknown}")
    
    # 4. execute 테스트 - __ANY_INTENT__ 처리
    print("\n🔍 4. execute 테스트 (__ANY_INTENT__ 처리)")
    if can_handle_unknown:
        result = await intent_handler.execute(context_unknown)
        print(f"📍 execute 결과: {result}")
        if result.transitions:
            for transition in result.transitions:
                print(f"📍 전이: {transition.fromState} -> {transition.toState}")
                print(f"📍 이유: {transition.reason}")
    else:
        print("📍 __ANY_INTENT__가 can_handle에서 False를 반환하므로 execute가 호출되지 않음")
    
    print("\n✅ __ANY_INTENT__ 사용자 입력 대기 테스트 완료")

if __name__ == "__main__":
    asyncio.run(test_any_intent_wait())
