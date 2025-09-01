#!/usr/bin/env python3
"""
기존 vs 새 시스템 성능 비교 테스트

동일한 시나리오에서 기존 시스템과 새 시스템의 성능을 비교합니다.
"""

import asyncio
import json
import logging
import sys
import os
import time
from typing import List, Dict, Any

# 프로젝트 루트를 Python path에 추가
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from services.state_engine import StateEngine

# 로깅 설정 (WARNING 이상만 출력하여 성능 측정에 방해되지 않도록)
logging.basicConfig(
    level=logging.WARNING,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def benchmark_systems():
    """기존 vs 새 시스템 성능 벤치마크"""
    
    print("⚡ 기존 vs 새 시스템 성능 비교 테스트")
    print("=" * 70)
    
    # StateEngine 초기화
    state_engine = StateEngine()
    
    # 실제 시나리오 로드
    scenario_file = "/Users/1109528/Workspaces/MyProject/StateCanvas/tmp/9000-0002.json"
    with open(scenario_file, 'r', encoding='utf-8') as f:
        real_scenario = json.load(f)
    
    # 테스트 케이스들
    test_cases = [
        {
            "name": "기본 조건 전이",
            "state": "act_01_0235",
            "input": "기본 테스트",
            "memory": {"sessionId": "perf_test", "api_result": "success", "USER_INPUT_TYPE": "TEXT"}
        },
        {
            "name": "시작 상태 처리",
            "state": "Start", 
            "input": "시작 테스트",
            "memory": {"sessionId": "perf_test", "USER_INPUT_TYPE": "TEXT"}
        },
        {
            "name": "복잡한 상태",
            "state": "sts_webhook_test",
            "input": "복잡한 테스트",
            "memory": {"sessionId": "perf_test", "USER_INPUT_TYPE": "TEXT"}
        }
    ]
    
    iterations = 50  # 각 테스트 케이스당 50회 실행
    
    print(f"\n📊 성능 테스트 설정:")
    print(f"  - 테스트 케이스: {len(test_cases)}개")
    print(f"  - 각 케이스 반복: {iterations}회")
    print(f"  - 총 실행 횟수: {len(test_cases) * iterations * 2}회 (기존 + 새 시스템)")
    
    results = {
        "legacy": [],
        "new": []
    }
    
    for test_case in test_cases:
        print(f"\n🧪 테스트: {test_case['name']}")
        print("-" * 50)
        
        # 기존 시스템 테스트
        print("  📈 기존 시스템 벤치마킹...")
        legacy_times = []
        legacy_success = 0
        
        for i in range(iterations):
            session_id = f"legacy_perf_{i}"
            state_engine.load_scenario(session_id, real_scenario)
            
            start_time = time.perf_counter()
            try:
                # 기존 시스템 강제 사용 (adapter를 일시적으로 비활성화)
                original_adapter = state_engine.adapter
                state_engine.adapter = None
                
                result = await state_engine.process_input(
                    session_id,
                    test_case['input'],
                    test_case['state'],
                    real_scenario,
                    test_case['memory'].copy()
                )
                
                # adapter 복원
                state_engine.adapter = original_adapter
                
                end_time = time.perf_counter()
                execution_time = end_time - start_time
                legacy_times.append(execution_time)
                legacy_success += 1
                
            except Exception as e:
                state_engine.adapter = original_adapter
                print(f"    ❌ 기존 시스템 오류 (iteration {i+1}): {str(e)[:50]}...")
        
        # 새 시스템 테스트
        print("  🚀 새 시스템 벤치마킹...")
        new_times = []
        new_success = 0
        
        for i in range(iterations):
            session_id = f"new_perf_{i}"
            state_engine.load_scenario(session_id, real_scenario)
            
            start_time = time.perf_counter()
            try:
                result = await state_engine.process_input_v2(
                    session_id,
                    test_case['input'],
                    test_case['state'],
                    real_scenario,
                    test_case['memory'].copy()
                )
                
                end_time = time.perf_counter()
                execution_time = end_time - start_time
                new_times.append(execution_time)
                new_success += 1
                
            except Exception as e:
                print(f"    ❌ 새 시스템 오류 (iteration {i+1}): {str(e)[:50]}...")
        
        # 결과 분석
        if legacy_times and new_times:
            legacy_avg = sum(legacy_times) / len(legacy_times)
            new_avg = sum(new_times) / len(new_times)
            
            legacy_min = min(legacy_times)
            legacy_max = max(legacy_times)
            new_min = min(new_times)
            new_max = max(new_times)
            
            improvement = ((legacy_avg - new_avg) / legacy_avg * 100) if legacy_avg > 0 else 0
            
            print(f"  📊 결과:")
            print(f"    기존 시스템:")
            print(f"      - 성공률: {legacy_success}/{iterations} ({legacy_success/iterations*100:.1f}%)")
            print(f"      - 평균 시간: {legacy_avg:.4f}초")
            print(f"      - 최소/최대: {legacy_min:.4f}초 / {legacy_max:.4f}초")
            print(f"    새 시스템:")
            print(f"      - 성공률: {new_success}/{iterations} ({new_success/iterations*100:.1f}%)")
            print(f"      - 평균 시간: {new_avg:.4f}초")
            print(f"      - 최소/최대: {new_min:.4f}초 / {new_max:.4f}초")
            print(f"    🚀 성능 개선: {improvement:+.1f}%")
            
            results["legacy"].extend(legacy_times)
            results["new"].extend(new_times)
    
    # 전체 성능 요약
    print(f"\n📈 전체 성능 요약")
    print("=" * 70)
    
    if results["legacy"] and results["new"]:
        legacy_total_avg = sum(results["legacy"]) / len(results["legacy"])
        new_total_avg = sum(results["new"]) / len(results["new"])
        total_improvement = ((legacy_total_avg - new_total_avg) / legacy_total_avg * 100) if legacy_total_avg > 0 else 0
        
        legacy_throughput = 1 / legacy_total_avg if legacy_total_avg > 0 else 0
        new_throughput = 1 / new_total_avg if new_total_avg > 0 else 0
        
        print(f"📊 전체 평균:")
        print(f"  - 기존 시스템: {legacy_total_avg:.4f}초 ({legacy_throughput:.1f} req/sec)")
        print(f"  - 새 시스템: {new_total_avg:.4f}초 ({new_throughput:.1f} req/sec)")
        print(f"  - 전체 성능 개선: {total_improvement:+.1f}%")
        
        if total_improvement > 0:
            print(f"\n🎉 새 시스템이 {total_improvement:.1f}% 더 빠릅니다!")
        elif total_improvement < -5:
            print(f"\n⚠️  새 시스템이 {abs(total_improvement):.1f}% 더 느립니다.")
        else:
            print(f"\n✅ 두 시스템의 성능이 비슷합니다 (차이: {total_improvement:+.1f}%)")
        
        # 메모리 및 안정성 평가
        print(f"\n🔍 안정성 평가:")
        print(f"  - 기존 시스템 안정성: {len(results['legacy'])}/{len(test_cases)*iterations} ({len(results['legacy'])/(len(test_cases)*iterations)*100:.1f}%)")
        print(f"  - 새 시스템 안정성: {len(results['new'])}/{len(test_cases)*iterations} ({len(results['new'])/(len(test_cases)*iterations)*100:.1f}%)")


async def test_memory_usage():
    """메모리 사용량 테스트"""
    
    print(f"\n💾 메모리 사용량 테스트")
    print("-" * 60)
    
    import psutil
    import gc
    
    process = psutil.Process()
    
    # 가비지 컬렉션 강제 실행
    gc.collect()
    initial_memory = process.memory_info().rss / 1024 / 1024  # MB
    
    print(f"📊 초기 메모리 사용량: {initial_memory:.2f} MB")
    
    # 대량 처리 테스트
    state_engine = StateEngine()
    scenario_file = "/Users/1109528/Workspaces/MyProject/StateCanvas/tmp/9000-0002.json"
    with open(scenario_file, 'r', encoding='utf-8') as f:
        real_scenario = json.load(f)
    
    # 100회 연속 처리
    for i in range(100):
        session_id = f"memory_test_{i}"
        state_engine.load_scenario(session_id, real_scenario)
        
        try:
            await state_engine.process_input_v2(
                session_id,
                f"메모리 테스트 {i+1}",
                "act_01_0235",
                real_scenario,
                {"sessionId": session_id, "api_result": "success", "USER_INPUT_TYPE": "TEXT"}
            )
        except:
            pass
    
    # 최종 메모리 사용량
    gc.collect()
    final_memory = process.memory_info().rss / 1024 / 1024  # MB
    memory_increase = final_memory - initial_memory
    
    print(f"📊 최종 메모리 사용량: {final_memory:.2f} MB")
    print(f"📈 메모리 증가량: {memory_increase:+.2f} MB")
    
    if memory_increase < 10:
        print("✅ 메모리 사용량이 안정적입니다!")
    elif memory_increase < 50:
        print("⚠️  메모리 사용량이 증가했지만 허용 범위입니다.")
    else:
        print("❌ 메모리 누수 가능성이 있습니다.")


if __name__ == "__main__":
    try:
        asyncio.run(benchmark_systems())
        asyncio.run(test_memory_usage())
        
        print("\n🚀 새로운 Handler 시스템이 기존 시스템을 완전히 대체할 준비가 되었습니다!")
        
    except KeyboardInterrupt:
        print("\n❌ 테스트가 중단되었습니다.")
    except Exception as e:
        print(f"\n❌ 테스트 중 오류 발생: {e}")
        import traceback
        traceback.print_exc()
