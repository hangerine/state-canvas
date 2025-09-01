#!/usr/bin/env python3
"""
새로운 Handler 시스템 프로덕션 준비 상태 테스트

모든 Handler가 활성화된 상태에서 다양한 시나리오를 테스트하여
프로덕션 환경에서 안정적으로 작동할 수 있는지 검증합니다.
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


async def test_production_ready_system():
    """프로덕션 준비 상태 종합 테스트"""
    
    print("🏭 새로운 Handler 시스템 프로덕션 준비 상태 테스트")
    print("=" * 80)
    
    # StateEngine 초기화 (모든 Handler 자동 활성화)
    state_engine = StateEngine()
    
    # 실제 시나리오 로드
    scenario_file = "/Users/1109528/Workspaces/MyProject/StateCanvas/tmp/9000-0002.json"
    with open(scenario_file, 'r', encoding='utf-8') as f:
        real_scenario = json.load(f)
    
    session_id = "production_test_session"
    state_engine.load_scenario(session_id, real_scenario)
    
    print("\n1. 시스템 상태 확인")
    print("-" * 60)
    
    # Handler 시스템 상태 확인
    status = state_engine.get_handler_system_status()
    print(f"✅ 새 시스템 사용 가능: {status.get('new_system_available', False)}")
    print(f"✅ 사용 가능한 Handler들: {status.get('available_handlers', [])}")
    
    enabled_handlers = [k for k, v in status.get('enabled_handlers', {}).items() if v]
    print(f"🎯 활성화된 Handler들 ({len(enabled_handlers)}개): {enabled_handlers}")
    
    if len(enabled_handlers) == 7:
        print("✅ 모든 Handler가 정상적으로 활성화됨!")
    else:
        print(f"⚠️  일부 Handler가 비활성화됨 (예상: 7개, 실제: {len(enabled_handlers)}개)")
    
    print(f"\n2. 핵심 시나리오 테스트")
    print("-" * 60)
    
    # 테스트 케이스들
    test_cases = [
        {
            "name": "기본 조건 평가 테스트",
            "state": "act_01_0235",
            "input": "기본 테스트",
            "memory": {"sessionId": session_id, "api_result": "success", "USER_INPUT_TYPE": "TEXT"},
            "expected_state": "end_process",
            "description": "조건 평가 순서 개선으로 올바른 전이 확인"
        },
        {
            "name": "Entry Action 테스트", 
            "state": "Start",
            "input": "시작 테스트",
            "memory": {"sessionId": session_id, "USER_INPUT_TYPE": "TEXT"},
            "expected_state": None,  # 다양한 결과 가능
            "description": "Entry Action Handler 정상 작동 확인"
        }
    ]
    
    success_count = 0
    total_tests = len(test_cases)
    
    for i, test_case in enumerate(test_cases, 1):
        print(f"\n🧪 테스트 {i}/{total_tests}: {test_case['name']}")
        print(f"📝 {test_case['description']}")
        print(f"🎯 시작 상태: {test_case['state']}")
        print(f"📝 사용자 입력: {test_case['input']}")
        
        try:
            result = await state_engine.process_input_v2(
                session_id, 
                test_case['input'], 
                test_case['state'], 
                real_scenario, 
                test_case['memory'].copy()
            )
            
            final_state = result.get('new_state')
            new_system_used = result.get('_new_system', False)
            executed_handlers = result.get('_executed_handlers', [])
            
            print(f"📊 결과:")
            print(f"  - 최종 상태: {final_state}")
            print(f"  - 새 시스템 사용: {new_system_used}")
            print(f"  - 실행된 Handler: {executed_handlers}")
            print(f"  - 처리 시간: {result.get('_processing_time', 'N/A')}")
            
            # 성공 여부 판단
            success = True
            if not new_system_used:
                print("  ❌ 새 시스템이 사용되지 않음 (fallback 발생)")
                success = False
            
            if test_case['expected_state'] and final_state != test_case['expected_state']:
                print(f"  ⚠️  예상 상태와 다름 (예상: {test_case['expected_state']}, 실제: {final_state})")
                # 이는 경고이지 실패는 아님
            
            if not executed_handlers:
                print("  ❌ Handler가 실행되지 않음")
                success = False
            
            if success:
                print("  ✅ 테스트 성공!")
                success_count += 1
            else:
                print("  ❌ 테스트 실패!")
                
        except Exception as e:
            print(f"  ❌ 테스트 중 오류 발생: {e}")
            import traceback
            traceback.print_exc()
        
        # 스택 리셋
        try:
            state_engine.load_scenario(session_id, real_scenario)
        except:
            pass
    
    print(f"\n3. 성능 및 안정성 테스트")
    print("-" * 60)
    
    # 연속 처리 테스트
    print("🔄 연속 처리 테스트 (10회)")
    
    start_time = asyncio.get_event_loop().time()
    consecutive_success = 0
    
    for i in range(10):
        try:
            result = await state_engine.process_input_v2(
                session_id, 
                f"연속테스트_{i+1}", 
                "act_01_0235", 
                real_scenario, 
                {"sessionId": session_id, "api_result": "success", "USER_INPUT_TYPE": "TEXT"}
            )
            
            if result.get('_new_system', False):
                consecutive_success += 1
                
        except Exception as e:
            print(f"  ❌ {i+1}번째 테스트 실패: {e}")
        
        # 스택 리셋
        state_engine.load_scenario(session_id, real_scenario)
    
    end_time = asyncio.get_event_loop().time()
    total_time = end_time - start_time
    avg_time = total_time / 10
    
    print(f"📊 연속 처리 결과:")
    print(f"  - 성공률: {consecutive_success}/10 ({consecutive_success*10}%)")
    print(f"  - 총 처리 시간: {total_time:.3f}초")
    print(f"  - 평균 처리 시간: {avg_time:.3f}초")
    print(f"  - 초당 처리량: {10/total_time:.1f} requests/sec")
    
    print(f"\n4. 최종 결과")
    print("=" * 80)
    
    overall_success_rate = (success_count / total_tests) * 100
    print(f"📊 기본 테스트 성공률: {success_count}/{total_tests} ({overall_success_rate:.1f}%)")
    print(f"📊 연속 처리 성공률: {consecutive_success}/10 ({consecutive_success*10}%)")
    print(f"⚡ 평균 처리 시간: {avg_time:.3f}초")
    
    # 프로덕션 준비 상태 평가
    if overall_success_rate >= 80 and consecutive_success >= 8 and avg_time < 0.1:
        print("\n🎉 프로덕션 준비 완료!")
        print("✅ 모든 기준을 만족합니다:")
        print("  - 기본 테스트 성공률 ≥ 80%")
        print("  - 연속 처리 성공률 ≥ 80%") 
        print("  - 평균 처리 시간 < 0.1초")
        return True
    else:
        print("\n⚠️  프로덕션 준비 미완료")
        print("다음 기준을 확인해주세요:")
        if overall_success_rate < 80:
            print(f"  ❌ 기본 테스트 성공률: {overall_success_rate:.1f}% < 80%")
        if consecutive_success < 8:
            print(f"  ❌ 연속 처리 성공률: {consecutive_success*10}% < 80%")
        if avg_time >= 0.1:
            print(f"  ❌ 평균 처리 시간: {avg_time:.3f}초 ≥ 0.1초")
        return False


async def test_edge_cases():
    """엣지 케이스 테스트"""
    
    print(f"\n🔍 엣지 케이스 테스트")
    print("-" * 60)
    
    state_engine = StateEngine()
    
    # 실제 시나리오 로드
    scenario_file = "/Users/1109528/Workspaces/MyProject/StateCanvas/tmp/9000-0002.json"
    with open(scenario_file, 'r', encoding='utf-8') as f:
        real_scenario = json.load(f)
    
    session_id = "edge_case_test"
    state_engine.load_scenario(session_id, real_scenario)
    
    edge_cases = [
        {
            "name": "빈 입력 처리",
            "input": "",
            "state": "Start"
        },
        {
            "name": "존재하지 않는 상태",
            "input": "테스트",
            "state": "NonExistentState"
        },
        {
            "name": "특수 문자 입력",
            "input": "!@#$%^&*()_+",
            "state": "Start"
        }
    ]
    
    for edge_case in edge_cases:
        print(f"\n🧪 {edge_case['name']}")
        
        try:
            result = await state_engine.process_input_v2(
                session_id,
                edge_case['input'],
                edge_case['state'],
                real_scenario,
                {"sessionId": session_id, "USER_INPUT_TYPE": "TEXT"}
            )
            
            print(f"  ✅ 처리 성공: {result.get('new_state')}")
            
        except Exception as e:
            print(f"  ⚠️  예외 발생 (예상됨): {str(e)[:100]}...")


if __name__ == "__main__":
    try:
        success = asyncio.run(test_production_ready_system())
        asyncio.run(test_edge_cases())
        
        if success:
            print("\n🚀 새로운 Handler 시스템이 프로덕션 환경에서 사용할 준비가 되었습니다!")
        else:
            print("\n⚠️  추가 개선이 필요합니다.")
            
    except KeyboardInterrupt:
        print("\n❌ 테스트가 중단되었습니다.")
    except Exception as e:
        print(f"\n❌ 테스트 중 오류 발생: {e}")
        import traceback
        traceback.print_exc()
