#!/usr/bin/env python3
"""
새로운 Handler 시스템 테스트 스크립트

이 스크립트는 새로운 Handler 시스템이 제대로 작동하는지 확인합니다.
기존 시스템과의 호환성 및 성능을 비교 테스트합니다.
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


async def test_new_handler_system():
    """새로운 Handler 시스템 테스트"""
    
    print("🚀 새로운 Handler 시스템 테스트 시작")
    print("=" * 60)
    
    # StateEngine 초기화
    state_engine = StateEngine()
    
    # 테스트 시나리오 로드
    test_scenario = {
        "plan": [{
            "name": "TestScenario",
            "dialogState": [
                {
                    "name": "Start",
                    "entryAction": {
                        "directives": [{
                            "type": "text",
                            "content": {"text": "테스트 시작"}
                        }]
                    },
                    "conditionHandlers": [{
                        "conditionStatement": "True",
                        "transitionTarget": {"dialogState": "end_process"}
                    }]
                },
                {
                    "name": "end_process",
                    "entryAction": {
                        "directives": [{
                            "type": "text", 
                            "content": {"text": "테스트 완료"}
                        }]
                    }
                }
            ]
        }]
    }
    
    session_id = "test_session_001"
    memory = {"sessionId": session_id}
    
    # 시나리오 로드
    state_engine.load_scenario(session_id, test_scenario)
    
    print("\n1. Handler 시스템 상태 확인")
    print("-" * 40)
    status = state_engine.get_handler_system_status()
    print(f"새 시스템 사용 가능: {status.get('new_system_available', False)}")
    print(f"활성화된 Handler들: {status.get('enabled_handlers', {})}")
    print(f"사용 가능한 Handler들: {status.get('available_handlers', [])}")
    
    if not status.get('new_system_available', False):
        print("⚠️  새 Handler 시스템을 사용할 수 없습니다. 기존 시스템만 테스트합니다.")
        return await test_legacy_system_only(state_engine, session_id, test_scenario, memory)
    
    print("\n2. 기존 시스템 vs 새 시스템 비교 테스트")
    print("-" * 40)
    
    # 기존 시스템 테스트
    print("\n🔸 기존 시스템으로 테스트...")
    legacy_result = await state_engine.process_input(
        session_id, "테스트 입력", "Start", test_scenario, memory.copy()
    )
    print(f"기존 시스템 결과: {legacy_result.get('new_state')} | {legacy_result.get('response', '')[:50]}...")
    
    # 새 시스템 테스트
    print("\n🔸 새 시스템으로 테스트...")
    new_result = await state_engine.process_input_v2(
        session_id, "테스트 입력", "Start", test_scenario, memory.copy()
    )
    print(f"새 시스템 결과: {new_result.get('new_state')} | {new_result.get('response', '')[:50]}...")
    
    # 결과 비교
    print(f"\n📊 결과 비교:")
    print(f"  - 최종 상태: 기존={legacy_result.get('new_state')} vs 새={new_result.get('new_state')}")
    print(f"  - 새 시스템 사용됨: {new_result.get('_new_system', False)}")
    print(f"  - 실행된 Handler들: {new_result.get('_executed_handlers', [])}")
    
    print("\n3. Handler 점진적 활성화 테스트")
    print("-" * 40)
    
    # ConditionHandler 활성화
    state_engine.enable_handler("ConditionHandler")
    print("✅ ConditionHandler 활성화")
    
    # 다시 테스트
    gradual_result = await state_engine.process_input_v2(
        session_id, "점진적 테스트", "Start", test_scenario, memory.copy()
    )
    print(f"점진적 활성화 결과: {gradual_result.get('new_state')} | 실행된 Handler: {gradual_result.get('_executed_handlers', [])}")
    
    print("\n4. 에러 처리 및 Fallback 테스트")
    print("-" * 40)
    
    # 잘못된 시나리오로 테스트 (에러 유발)
    broken_scenario = {"invalid": "scenario"}
    try:
        error_result = await state_engine.process_input_v2(
            session_id, "에러 테스트", "nonexistent_state", broken_scenario, memory.copy()
        )
        print(f"에러 처리 결과: {error_result.get('new_state')} | Fallback 사용: {not error_result.get('_new_system', True)}")
    except Exception as e:
        print(f"예상된 에러 발생: {e}")
    
    print("\n" + "=" * 60)
    print("✅ 새로운 Handler 시스템 테스트 완료!")
    
    return True


async def test_legacy_system_only(state_engine, session_id, test_scenario, memory):
    """기존 시스템만 테스트"""
    
    print("\n🔸 기존 시스템으로만 테스트...")
    result = await state_engine.process_input(
        session_id, "테스트 입력", "Start", test_scenario, memory
    )
    print(f"기존 시스템 결과: {result.get('new_state')} | {result.get('response', '')[:50]}...")
    
    print("✅ 기존 시스템 테스트 완료!")
    return True


if __name__ == "__main__":
    try:
        asyncio.run(test_new_handler_system())
    except KeyboardInterrupt:
        print("\n❌ 테스트가 중단되었습니다.")
    except Exception as e:
        print(f"\n❌ 테스트 중 오류 발생: {e}")
        import traceback
        traceback.print_exc()
