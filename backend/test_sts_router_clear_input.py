#!/usr/bin/env python3
"""
sts_router 상태에서 __ANY_INTENT__ 처리 후 user input 정리 테스트

이 테스트는 sts_router 상태에서 __ANY_INTENT__로 전이한 후,
다음 요청에서 이전 user input이 정리되는지 확인합니다.
"""

import asyncio
import json
import logging
import sys
import os

# 프로젝트 루트를 Python 경로에 추가
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.state_engine_adapter import StateEngineAdapter
from services.state_engine import StateEngine
from services.scenario_manager import ScenarioManager
from services.action_executor import ActionExecutor

# 로깅 설정
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

async def test_sts_router_clear_input():
    """sts_router 상태에서 __ANY_INTENT__ 처리 후 user input 정리 테스트"""
    
    print("🧪 sts_router 상태에서 __ANY_INTENT__ 처리 후 user input 정리 테스트 시작")
    
    try:
        # 시나리오 파일 로드
        with open("test_scenario.json", "r", encoding="utf-8") as f:
            scenario = json.load(f)
        print("✅ 시나리오 파일 로드 성공")
        
        # 의존성 객체들 생성
        scenario_manager = ScenarioManager()
        action_executor = ActionExecutor(scenario_manager)
        
        # StateEngine과 StateEngineAdapter 생성
        state_engine = StateEngine(scenario_manager, nlu_processor=None)  # nlu_processor를 None으로 설정하여 자동 생성되도록 함
        adapter = StateEngineAdapter(state_engine)
        
        # sts_router 상태 찾기
        sts_router_state = None
        for plan in scenario.get("plan", []):
            for dialog_state in plan.get("dialogState", []):
                if dialog_state.get("name") == "sts_router":
                    sts_router_state = dialog_state
                    break
            if sts_router_state:
                break
        
        if not sts_router_state:
            print("❌ sts_router 상태를 찾을 수 없음")
            return
        
        print(f"📍 sts_router 상태: {sts_router_state.get('name')}")
        print(f"📍 intentHandlers: {len(sts_router_state.get('intentHandlers', []))}")
        
        # 테스트 1: 첫 번째 요청 - 사용자 입력으로 __ANY_INTENT__ 처리
        print("\n🔍 테스트 1: 첫 번째 요청 - 사용자 입력으로 __ANY_INTENT__ 처리")
        
        # 메모리 초기화
        memory = {
            "USER_TEXT_INPUT": ["안녕하세요"],
            "NLU_RESULT": {
                "results": [{
                    "nluNbest": [{"intent": "greeting"}]
                }]
            }
        }
        
        print(f"📍 초기 메모리: {memory}")
        
        # StateEngineAdapter를 통해 처리
        result = await adapter.process_input(
            session_id="test_session",
            user_input="안녕하세요",
            current_state="sts_router",
            scenario=scenario,
            memory=memory
        )
        
        print(f"📍 처리 결과: {result}")
        
        if result.get("new_state") != "sts_router":
            print(f"📍 전이: sts_router -> {result.get('new_state')}")
            print(f"📍 메모리 플래그: _CLEAR_USER_INPUT_ON_NEXT_REQUEST = {result.get('memory', {}).get('_CLEAR_USER_INPUT_ON_NEXT_REQUEST')}")
            print(f"📍 메모리 플래그: _PREVIOUS_STATE = {result.get('memory', {}).get('_PREVIOUS_STATE')}")
            print(f"📍 메모리 플래그: _PREVIOUS_INTENT = {result.get('memory', {}).get('_PREVIOUS_INTENT')}")
            
            # 메모리에서 USER_TEXT_INPUT과 NLU_RESULT 확인
            updated_memory = result.get("memory", {})
            print(f"📍 업데이트된 메모리:")
            print(f"  - USER_TEXT_INPUT: {updated_memory.get('USER_TEXT_INPUT')}")
            print(f"  - NLU_RESULT: {updated_memory.get('NLU_RESULT')}")
            
            # USER_TEXT_INPUT과 NLU_RESULT가 정리되었는지 확인
            if not updated_memory.get("USER_TEXT_INPUT") and not updated_memory.get("NLU_RESULT"):
                print("✅ USER_TEXT_INPUT과 NLU_RESULT가 정상적으로 정리됨")
            else:
                print("❌ USER_TEXT_INPUT 또는 NLU_RESULT가 정리되지 않음")
            
            print("✅ 첫 번째 요청에서 __ANY_INTENT__ 처리 및 전이 성공")
        else:
            print("❌ 첫 번째 요청에서 전이 실패")
            return
        
        # 테스트 2: 두 번째 요청 - 새로운 상태에서 이전 user input 정리 확인
        print("\n🔍 테스트 2: 두 번째 요청 - 새로운 상태에서 이전 user input 정리 확인")
        
        # 새로운 상태로 두 번째 요청
        new_state = result.get("new_state")
        new_memory = result.get("memory", {}).copy()
        
        # 두 번째 요청 (사용자 입력 없음)
        second_result = await adapter.process_input(
            session_id="test_session",
            user_input="",  # 사용자 입력 없음
            current_state=new_state,
            scenario=scenario,
            memory=new_memory
        )
        
        print(f"📍 두 번째 요청 결과: {second_result}")
        
        # 두 번째 요청에서도 전이가 발생하지 않아야 함 (사용자 입력 대기)
        if second_result.get("new_state") == new_state:
            print("✅ 두 번째 요청에서 전이가 발생하지 않음 (사용자 입력 대기)")
        else:
            print(f"❌ 두 번째 요청에서 예상치 못한 전이 발생: {new_state} -> {second_result.get('new_state')}")
        
        print("\n✅ sts_router 상태에서 __ANY_INTENT__ 처리 후 user input 정리 테스트 완료")
        
    except Exception as e:
        print(f"❌ 테스트 실행 중 오류 발생: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_sts_router_clear_input())
