#!/usr/bin/env python3
"""
수정된 새 시스템 전체 플로우 테스트

예상 플로우:
1. act_01_0235 → 조건 평가 순서 개선으로 True(불린) 우선 → end_process
2. 만약 Scene1으로 가면 → __END_SCENARIO__ → act_01_0235 복귀 → 다음 핸들러(True) → end_process
3. end_process → __END_SESSION__ 완료
"""

import asyncio
import json
import logging
import sys
import os

# 프로젝트 루트를 Python path에 추가
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from services.state_engine import StateEngine

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def test_fixed_flow():
    """수정된 새 시스템 전체 플로우 테스트"""
    
    print("🔧 수정된 새 시스템 전체 플로우 테스트")
    print("=" * 70)
    
    # StateEngine 초기화
    state_engine = StateEngine()
    
    # 실제 시나리오 로드
    scenario_file = "/Users/1109528/Workspaces/MyProject/StateCanvas/tmp/9000-0002.json"
    with open(scenario_file, 'r', encoding='utf-8') as f:
        real_scenario = json.load(f)
    
    session_id = "fixed_flow_test"
    state_engine.load_scenario(session_id, real_scenario)
    
    memory = {
        "sessionId": session_id,
        "api_result": "success",
        "USER_INPUT_TYPE": "TEXT"
    }
    
    print("\n📋 예상 플로우:")
    print("1. act_01_0235 → 조건 평가 순서 개선으로 True(불린) 우선 → end_process")
    print("2. 만약 Scene1으로 가면 → __END_SCENARIO__ → act_01_0235 복귀 → 다음 핸들러(True) → end_process")
    print("3. end_process → __END_SESSION__ 완료")
    
    # 새 시스템만 활성화 (모든 Handler 활성화)
    state_engine.enable_handler("EntryActionHandler")
    state_engine.enable_handler("ConditionHandler")
    
    status = state_engine.get_handler_system_status()
    print(f"\n🔧 활성화된 Handler들: {[k for k, v in status.get('enabled_handlers', {}).items() if v]}")
    
    print(f"\n🎯 시작 상태: act_01_0235")
    print(f"📝 사용자 입력: 전체 플로우 테스트")
    
    try:
        result = await state_engine.process_input_v2(
            session_id, "전체 플로우 테스트", "act_01_0235", real_scenario, memory.copy()
        )
        
        print(f"\n📊 테스트 결과:")
        print(f"  - 최종 상태: {result.get('new_state')}")
        print(f"  - 새 시스템 사용: {result.get('_new_system', False)}")
        print(f"  - 실행된 Handler: {result.get('_executed_handlers', [])}")
        print(f"  - 응답 메시지:")
        for i, msg in enumerate(result.get('messages', []), 1):
            print(f"    {i}. {msg}")
        
        # 스택 상태 확인
        stack_info = state_engine.get_current_scenario_info(session_id)
        print(f"  - 최종 스택 상태: {stack_info.get('planName', 'Unknown')}.{stack_info.get('dialogStateName', 'Unknown')}")
        
        # 성공 여부 판단
        final_state = result.get('new_state')
        if final_state == 'end_process':
            print(f"\n✅ 1차 목표 달성: end_process 상태 도달!")
            
            # end_process에서 다음 조건 확인
            print(f"\n🔍 end_process에서 다음 전이 테스트...")
            
            # end_process 상태에서 한 번 더 실행
            final_result = await state_engine.process_input_v2(
                session_id, "최종 완료 테스트", "end_process", real_scenario, memory.copy()
            )
            
            final_final_state = final_result.get('new_state')
            print(f"  - 최종 상태: {final_final_state}")
            
            if final_final_state == '__END_SESSION__':
                print(f"\n🎉 완전 성공! 전체 플로우 완료: act_01_0235 → end_process → __END_SESSION__")
            else:
                print(f"\n⚠️  부분 성공: end_process 도달했지만 __END_SESSION__으로 가지 못함")
                
        elif final_state == '__END_SCENARIO__':
            print(f"\n⚠️  Scene1으로 갔다가 __END_SCENARIO__에서 멈춤 - 복귀 로직 확인 필요")
            
        elif final_state == '__END_SESSION__':
            print(f"\n🎉 바로 완료! 직접 __END_SESSION__으로 완료")
            
        else:
            print(f"\n❌ 예상치 못한 결과: {final_state}")
        
        return result
        
    except Exception as e:
        print(f"\n❌ 테스트 중 오류 발생: {e}")
        import traceback
        traceback.print_exc()
        return None


async def test_condition_evaluation_order():
    """조건 평가 순서 개선 테스트"""
    
    print(f"\n" + "="*70)
    print("🧪 조건 평가 순서 개선 테스트")
    print("-" * 70)
    
    state_engine = StateEngine()
    
    # 실제 시나리오 로드
    scenario_file = "/Users/1109528/Workspaces/MyProject/StateCanvas/tmp/9000-0002.json"
    with open(scenario_file, 'r', encoding='utf-8') as f:
        real_scenario = json.load(f)
    
    session_id = "condition_order_test"
    state_engine.load_scenario(session_id, real_scenario)
    
    # act_01_0235 상태의 조건들 확인
    for plan in real_scenario.get("plan", []):
        for dialog_state in plan.get("dialogState", []):
            if dialog_state.get("name") == "act_01_0235":
                condition_handlers = dialog_state.get("conditionHandlers", [])
                print(f"📋 act_01_0235의 원본 조건 순서:")
                
                for i, handler in enumerate(condition_handlers):
                    condition = handler.get("conditionStatement", "")
                    target = handler.get("transitionTarget", {})
                    target_info = f"{target.get('scenario', '')}.{target.get('dialogState', '')}"
                    print(f"  {i+1}. 조건: {condition} → {target_info}")
                
                print(f"\n🔧 새 시스템에서의 예상 평가 순서:")
                print(f"  1. 조건: True → Main.end_process (불린 True 우선)")
                print(f"  2. 조건: \"True\" → Scene1.Start (문자열 \"True\" 후순위)")
                
                break
    
    # ConditionHandler만 활성화해서 테스트
    state_engine.enable_handler("ConditionHandler")
    
    memory = {
        "sessionId": session_id,
        "api_result": "success",
        "USER_INPUT_TYPE": "TEXT"
    }
    
    print(f"\n🎯 조건 평가 순서 테스트 실행...")
    
    try:
        result = await state_engine.process_input_v2(
            session_id, "조건 순서 테스트", "act_01_0235", real_scenario, memory.copy()
        )
        
        final_state = result.get('new_state')
        executed_handlers = result.get('_executed_handlers', [])
        
        print(f"\n📊 조건 평가 결과:")
        print(f"  - 최종 상태: {final_state}")
        print(f"  - 실행된 Handler: {executed_handlers}")
        
        if final_state == 'end_process':
            print(f"  ✅ 성공: True(불린) 조건이 우선 평가되어 end_process로 전이!")
        elif final_state == 'Start':
            print(f"  ❌ 실패: \"True\"(문자열) 조건이 먼저 평가되어 Scene1.Start로 전이")
        else:
            print(f"  🔍 기타 결과: {final_state}")
        
        return result
        
    except Exception as e:
        print(f"\n❌ 조건 평가 테스트 중 오류: {e}")
        return None


if __name__ == "__main__":
    try:
        asyncio.run(test_condition_evaluation_order())
        asyncio.run(test_fixed_flow())
    except KeyboardInterrupt:
        print("\n❌ 테스트가 중단되었습니다.")
    except Exception as e:
        print(f"\n❌ 테스트 중 오류 발생: {e}")
        import traceback
        traceback.print_exc()
