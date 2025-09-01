#!/usr/bin/env python3
"""
STS Webhook Flow 디버깅 테스트
"""

import asyncio
import json
import sys
import os

# 현재 디렉토리를 Python 경로에 추가
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from services.state_engine_adapter import StateEngineAdapter
from services.state_engine import StateEngine
from services.scenario_manager import ScenarioManager

async def test_sts_webhook_flow():
    print('🧪 STS Webhook Flow 테스트 시작')
    
    # 시나리오 로드
    with open('../tmp/9000-0002.json', 'r', encoding='utf-8') as f:
        scenario = json.load(f)
    
    # StateEngine 초기화
    scenario_manager = ScenarioManager()
    state_engine = StateEngine(scenario_manager)
    adapter = StateEngineAdapter(state_engine)
    
    # 세션 초기화
    session_id = 'test-session-sts-webhook'
    scenario_manager.load_scenario(session_id, scenario)
    
    # 메모리 초기화
    memory = {
        'sessionId': session_id,
        'requestId': 'test-request',
        'USER_TEXT_INPUT': '아들'
    }
    
    print('\n🔍 Step 0: Start 상태에서 P111로 전이 (실제 서버의 초기 동작)')
    result0 = await adapter.process_input(
        session_id=session_id,
        user_input='',
        current_state='Start',
        scenario=scenario,
        memory=memory
    )
    print(f'Result 0: {result0}')
    
    print('\n🔍 Step 1: sts_router 상태에서 unknown 인텐트로 sts_webhook_test로 전이')
    result1 = await adapter.process_input(
        session_id=session_id,
        user_input='아들',
        current_state='sts_router',
        scenario=scenario,
        memory=memory
    )
    print(f'Result 1: {result1}')
    
    print('\n🔍 Step 2: sts_webhook_test 상태에서 API 호출 후 act_01_0235로 전이')
    # NLU_INTENT를 메모리에 설정
    memory['NLU_INTENT'] = 'ACT_01_0235'
    
    result2 = await adapter.process_input(
        session_id=session_id,
        user_input='',
        current_state='sts_webhook_test',
        scenario=scenario,
        memory=memory
    )
    print(f'Result 2: {result2}')
    
    print('\n🔍 Step 3: Scene1의 Start 상태에서 State_1753341866684로 전이')
    # Scene1 플랜으로 전환
    memory['_CURRENT_PLAN'] = 'Scene1'
    
    result3 = await adapter.process_input(
        session_id=session_id,
        user_input='',
        current_state='Start',
        scenario=scenario,
        memory=memory
    )
    print(f'Result 3: {result3}')

if __name__ == '__main__':
    asyncio.run(test_sts_webhook_flow())
