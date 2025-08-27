#!/usr/bin/env python3
"""시나리오 로딩 테스트 스크립트"""

import json
import sys
import os

# 백엔드 서비스 경로 추가
sys.path.append(os.path.join(os.path.dirname(__file__), 'services'))

from scenario_manager import ScenarioManager
from state_engine import StateEngine

def test_scenario_loading():
    """두 가지 시나리오 구조를 모두 테스트"""
    
    # ScenarioManager 테스트
    scenario_manager = ScenarioManager()
    
    # 1. scenario_modified.json 구조 테스트 (직접 plan)
    print("=== Testing scenario_modified.json structure ===")
    with open('tmp/scenario_modified.json', 'r', encoding='utf-8') as f:
        scenario_modified = json.load(f)
    
    scenario_manager.load_scenario("test_session_1", scenario_modified)
    
    # 2. scenario_fixed.json 구조 테스트 (배열 + 래퍼)
    print("\n=== Testing scenario_fixed.json structure ===")
    with open('tmp/scenario_fixed.json', 'r', encoding='utf-8') as f:
        scenario_fixed = json.load(f)
    
    scenario_manager.load_scenario("test_session_2", scenario_fixed)
    
    # 결과 확인
    print("\n=== Loading Results ===")
    for session_id in ["test_session_1", "test_session_2"]:
        scenario = scenario_manager.get_scenario(session_id)
        if scenario:
            print(f"Session {session_id}: {len(scenario.get('plan', []))} plans loaded")
            
            # apicallHandlers 확인
            for plan in scenario.get("plan", []):
                for dialog_state in plan.get("dialogState", []):
                    apicall_handlers = dialog_state.get("apicallHandlers", [])
                    if apicall_handlers:
                        print(f"  State {dialog_state.get('name')}: {len(apicall_handlers)} apicall handlers")
    
    # StateEngine 테스트
    print("\n=== Testing StateEngine ===")
    state_engine = StateEngine(scenario_manager)
    
    # 두 구조 모두 로드
    state_engine.load_scenario("test_session_3", scenario_modified)
    state_engine.load_scenario("test_session_4", scenario_fixed)
    
    print("✅ All scenarios loaded successfully!")

if __name__ == "__main__":
    test_scenario_loading()
