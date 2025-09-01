#!/usr/bin/env python3
"""
Handler 점진적 활성화 테스트

안전한 순서로 Handler를 하나씩 활성화하면서 동작을 검증합니다.
특히 ConditionHandler가 조건 평가 순서를 올바르게 제어하는지 확인합니다.
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


async def test_gradual_handler_activation():
    """Handler 점진적 활성화 테스트"""
    
    print("🔄 Handler 점진적 활성화 테스트")
    print("=" * 60)
    
    # StateEngine 초기화
    state_engine = StateEngine()
    
    # 실제 시나리오 로드
    scenario_file = "/Users/1109528/Workspaces/MyProject/StateCanvas/tmp/9000-0002.json"
    with open(scenario_file, 'r', encoding='utf-8') as f:
        real_scenario = json.load(f)
    
    session_id = "gradual_test_session"
    state_engine.load_scenario(session_id, real_scenario)
    
    memory = {
        "sessionId": session_id,
        "api_result": "success",
        "USER_INPUT_TYPE": "TEXT"
    }
    
    # 활성화 순서 (안전한 순서부터)
    activation_order = [
        ("EntryActionHandler", "가장 안전 - Entry Action만 처리"),
        ("ConditionHandler", "조건 처리 - 핵심 로직"),
        ("IntentHandler", "Intent 처리 - NLU 연동"),
        ("WebhookHandler", "Webhook 처리 - 외부 연동"),
        ("ApiCallHandler", "API 호출 - 외부 API 연동"),
        ("SlotFillingHandler", "Slot 채우기 - 대화 관리"),
        ("EventHandler", "이벤트 처리 - 시스템 이벤트")
    ]
    
    print(f"📋 활성화 예정 Handler 순서: {len(activation_order)}개")
    for i, (handler_name, description) in enumerate(activation_order):
        print(f"  {i+1}. {handler_name}: {description}")
    
    print(f"\n🎯 테스트 대상 상태: act_01_0235")
    print(f"📝 예상 문제: 첫 번째 조건 '\"True\"'가 Scene1.Start로 잘못 전이")
    print(f"🎯 목표: 두 번째 조건 'True'로 end_process 전이")
    
    # 각 Handler를 하나씩 활성화하며 테스트
    for step, (handler_name, description) in enumerate(activation_order, 1):
        print(f"\n{'='*60}")
        print(f"📍 STEP {step}: {handler_name} 활성화")
        print(f"📝 {description}")
        print("-" * 60)
        
        # Handler 활성화
        state_engine.enable_handler(handler_name)
        
        # 현재 활성화된 Handler 상태 확인
        status = state_engine.get_handler_system_status()
        active_handlers = [k for k, v in status.get('enabled_handlers', {}).items() if v]
        print(f"✅ 활성화된 Handler들: {active_handlers}")
        
        # act_01_0235에서 테스트
        current_state = "act_01_0235"
        user_input = f"step{step}_test"
        
        try:
            result = await state_engine.process_input_v2(
                session_id, user_input, current_state, real_scenario, memory.copy()
            )
            
            print(f"🔍 테스트 결과:")
            print(f"  - 최종 상태: {result.get('new_state')}")
            print(f"  - 새 시스템 사용: {result.get('_new_system', False)}")
            print(f"  - 실행된 Handler: {result.get('_executed_handlers', [])}")
            print(f"  - 응답: {result.get('response', '')[:80]}...")
            
            # 성공 지표 확인
            if result.get('new_state') == 'end_process':
                print(f"  🎉 성공! 목표 상태 'end_process'에 도달")
            elif result.get('new_state') == 'act_01_0235':
                print(f"  ⏸️  상태 유지 - Handler가 조건을 처리하지 않음")
            elif result.get('new_state') == 'Start':
                print(f"  ⚠️  잘못된 전이 - Scene1.Start로 이동 (기존 문제 재현)")
            else:
                print(f"  🔍 예상치 못한 상태: {result.get('new_state')}")
            
            # 세션 스택 상태 확인
            stack_info = state_engine.get_current_scenario_info(session_id)
            print(f"  - 스택 상태: {stack_info.get('planName', 'Unknown')}.{stack_info.get('dialogStateName', 'Unknown')}")
            
        except Exception as e:
            print(f"  ❌ 오류 발생: {e}")
        
        # 스택 초기화 (다음 테스트를 위해)
        try:
            state_engine.load_scenario(session_id, real_scenario)  # 리셋
        except Exception as e:
            print(f"  ⚠️  스택 리셋 실패: {e}")
        
        # 단계별 대기
        if step < len(activation_order):
            print(f"\n⏳ 다음 단계 준비 중...")
            await asyncio.sleep(0.1)
    
    print(f"\n{'='*60}")
    print("✅ Handler 점진적 활성화 테스트 완료!")
    
    return True


async def test_condition_handler_priority():
    """ConditionHandler 우선순위 제어 테스트"""
    
    print(f"\n🎯 ConditionHandler 우선순위 제어 테스트")
    print("-" * 60)
    
    state_engine = StateEngine()
    
    # 실제 시나리오 로드
    scenario_file = "/Users/1109528/Workspaces/MyProject/StateCanvas/tmp/9000-0002.json"
    with open(scenario_file, 'r', encoding='utf-8') as f:
        real_scenario = json.load(f)
    
    session_id = "priority_test_session"
    state_engine.load_scenario(session_id, real_scenario)
    
    # ConditionHandler만 활성화
    state_engine.disable_all_handlers()
    state_engine.enable_handler("ConditionHandler")
    
    print("🔧 ConditionHandler만 활성화하여 조건 평가 순서 제어 테스트")
    
    # 다양한 메모리 조건으로 테스트
    test_cases = [
        {
            "name": "기본 조건",
            "memory": {"sessionId": session_id, "api_result": "success"},
            "expected": "첫 번째 조건 매칭 예상"
        },
        {
            "name": "특수 조건 추가",
            "memory": {"sessionId": session_id, "api_result": "success", "prefer_end_process": True},
            "expected": "두 번째 조건 우선 매칭 시도"
        }
    ]
    
    for i, test_case in enumerate(test_cases, 1):
        print(f"\n🧪 테스트 케이스 {i}: {test_case['name']}")
        print(f"📝 메모리: {test_case['memory']}")
        print(f"🎯 예상: {test_case['expected']}")
        
        try:
            result = await state_engine.process_input_v2(
                session_id, f"priority_test_{i}", "act_01_0235", real_scenario, test_case['memory'].copy()
            )
            
            print(f"📊 결과:")
            print(f"  - 최종 상태: {result.get('new_state')}")
            print(f"  - 새 시스템 사용: {result.get('_new_system', False)}")
            print(f"  - 실행된 Handler: {result.get('_executed_handlers', [])}")
            
            if result.get('new_state') == 'end_process':
                print(f"  ✅ 성공: 올바른 조건(두 번째)으로 전이")
            elif result.get('new_state') == 'Start':
                print(f"  ⚠️  첫 번째 조건으로 전이 (개선 필요)")
            else:
                print(f"  🔍 상태 유지 또는 기타: {result.get('new_state')}")
            
        except Exception as e:
            print(f"  ❌ 오류: {e}")
        
        # 스택 리셋
        state_engine.load_scenario(session_id, real_scenario)
    
    return True


if __name__ == "__main__":
    try:
        asyncio.run(test_gradual_handler_activation())
        asyncio.run(test_condition_handler_priority())
    except KeyboardInterrupt:
        print("\n❌ 테스트가 중단되었습니다.")
    except Exception as e:
        print(f"\n❌ 테스트 중 오류 발생: {e}")
        import traceback
        traceback.print_exc()
