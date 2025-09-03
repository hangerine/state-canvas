from typing import Dict, Any, Optional, Union, List
import logging
from . import utils

logger = logging.getLogger(__name__)

class ScenarioManager:
    """시나리오 로딩/저장/조회 담당 매니저"""
    def __init__(self):
        # self.scenarios[session_id][scenario_name] = scenario_data
        self.scenarios: Dict[str, Dict[str, Dict[str, Any]]] = {}

    def load_scenario(self, session_id: str, scenario_data: Union[Dict[str, Any], List[Dict[str, Any]]]):
        """두 가지 시나리오 구조를 모두 지원하는 로더"""
        
        # 구조 1: scenario_fixed.json 형태 (배열 + 래퍼)
        if isinstance(scenario_data, list):
            return self._load_wrapped_scenarios(session_id, scenario_data)
        
        # 구조 2: scenario_modified.json 형태 (직접 plan)
        elif isinstance(scenario_data, dict) and "plan" in scenario_data:
            return self._load_direct_scenario(session_id, scenario_data)
        
        else:
            logger.error(f"[SCENARIO LOAD ERROR] 지원하지 않는 시나리오 구조입니다: {type(scenario_data)}")
            return

    def _load_wrapped_scenarios(self, session_id: str, scenarios_list: List[Dict[str, Any]]):
        """기존 구조: id, name, scenario 래퍼가 있는 형태"""
        if session_id not in self.scenarios:
            self.scenarios[session_id] = {}
        
        for scenario_wrapper in scenarios_list:
            scenario_id = scenario_wrapper.get("id")
            scenario_name = scenario_wrapper.get("name")
            scenario_content = scenario_wrapper.get("scenario", {})
            
            if not scenario_name:
                logger.error(f"[SCENARIO LOAD ERROR] 시나리오 이름이 없습니다: {scenario_wrapper}")
                continue
            
            # 시나리오 저장
            self.scenarios[session_id][scenario_name] = scenario_content
            
            # webhooks 및 apicallHandlers 처리
            self._process_scenario_components(session_id, scenario_name, scenario_content)
            
            logger.info(f"📋 Loaded wrapped scenario: {scenario_name} (ID: {scenario_id}) for session: {session_id}")

    def _load_direct_scenario(self, session_id: str, scenario_data: Dict[str, Any]):
        """새로운 구조: 직접 plan으로 시작하는 형태"""
        if session_id not in self.scenarios:
            self.scenarios[session_id] = {}
        
        # 시나리오 이름 추출 (plan[0].name 또는 기본값)
        plan = scenario_data.get("plan", [])
        scenario_name = plan[0].get("name") if plan and len(plan) > 0 else "Main"
        
        if not scenario_name:
            logger.error(f"[SCENARIO LOAD ERROR] 시나리오 이름이 없습니다: {scenario_data}")
            return
        
        # 시나리오 저장
        self.scenarios[session_id][scenario_name] = scenario_data
        
        # webhooks 및 apicallHandlers 처리
        self._process_scenario_components(session_id, scenario_name, scenario_data)
        
        logger.info(f"📋 Loaded direct scenario: {scenario_name} for session: {session_id}")

    def _process_scenario_components(self, session_id: str, scenario_name: str, scenario_data: Dict[str, Any]):
        """시나리오의 webhooks, apicallHandlers 등을 처리"""
        
        # webhooks 처리 (type 필드 지원)
        webhooks = scenario_data.get("webhooks", [])
        webhook_count = 0
        apicall_count = 0
        
        for webhook in webhooks:
            webhook_type = str(webhook.get("type", "WEBHOOK")).upper()
            if webhook_type == "APICALL":
                apicall_count += 1
                logger.info(f"🔗 Apicall: {webhook.get('name', 'Unknown')} -> {webhook.get('url', 'Unknown URL')}")
            else:
                webhook_count += 1
                logger.info(f"🔗 Webhook: {webhook.get('name', 'Unknown')} -> {webhook.get('url', 'Unknown URL')}")
        
        logger.info(f"📋 Loaded {webhook_count} webhooks and {apicall_count} apicalls for session: {session_id}")
        
        # plan에서 apicallHandlers 추출
        plan = scenario_data.get("plan", [])
        if plan and len(plan) > 0:
            dialog_states = plan[0].get("dialogState", [])
            
            # webhookActions 처리 (support entryAction.webhookActions)
            webhook_states = []
            for state in dialog_states:
                webhook_actions = state.get("webhookActions", [])
                if not webhook_actions:
                    entry_action = state.get("entryAction") or {}
                    if isinstance(entry_action, dict):
                        webhook_actions = entry_action.get("webhookActions", []) or []
                if webhook_actions:
                    webhook_states.append({
                        "state": state.get("name", "Unknown"),
                        "actions": [action.get("name", "Unknown") for action in webhook_actions]
                    })
            
            if webhook_states:
                logger.info(f"🔗 Found {len(webhook_states)} states with webhook actions:")
                for ws in webhook_states:
                    logger.info(f"   - {ws['state']}: {ws['actions']}")
            else:
                logger.info("🔗 No states with webhook actions found")
            
            # apicallHandlers 처리
            apicall_states = []
            for state in dialog_states:
                apicall_handlers = state.get("apicallHandlers", [])
                if apicall_handlers:
                    apicall_states.append({
                        "state": state.get("name", "Unknown"),
                        "handlers": [handler.get("name", "Unknown") for handler in apicall_handlers]
                    })
            
            if apicall_states:
                logger.info(f"🚀 Found {len(apicall_states)} states with apicall handlers:")
                for as_state in apicall_states:
                    logger.info(f"   - {as_state['state']}: {as_state['handlers']}")
            else:
                logger.info("🚀 No states with apicall handlers found")

    def get_scenario(self, session_id: str, scenario_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        시나리오 이름이 주어지면 해당 세션에서 해당 시나리오 반환, 없으면 첫 번째 시나리오 반환
        """
        session_scenarios = self.scenarios.get(session_id)
        if not session_scenarios:
            return None
        if scenario_name:
            return session_scenarios.get(scenario_name)
        # scenario_name이 없으면 첫 번째 시나리오 반환
        for s in session_scenarios.values():
            return s
        return None

    def get_scenario_by_name(self, scenario_name: str) -> Optional[Dict[str, Any]]:
        """
        시나리오 이름(plan[0].name)으로 모든 세션에서 시나리오를 찾습니다.
        """
        for session_id, session_scenarios in self.scenarios.items():
            for name, scenario in session_scenarios.items():
                plans = scenario.get("plan", [])
                if plans and plans[0].get("name") == scenario_name:
                    return scenario
        return None

    def find_dialog_state(self, scenario: Dict[str, Any], state_name: str, current_plan: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        시나리오에서 특정 상태를 찾습니다.
        current_plan이 지정되면 해당 플랜에서 우선적으로 검색합니다.
        """
        # 현재 활성 플랜에서 우선적으로 검색
        if current_plan:
            for plan in scenario.get("plan", []):
                if plan.get("name") == current_plan:
                    for dialog_state in plan.get("dialogState", []):
                        if dialog_state.get("name") == state_name:
                            return dialog_state
                    # 현재 플랜에서 찾지 못했으면 다른 플랜에서 검색하지 않음
                    return None
        
        # current_plan이 없거나 현재 플랜에서 찾지 못한 경우 모든 플랜에서 검색
        for plan in scenario.get("plan", []):
            for dialog_state in plan.get("dialogState", []):
                if dialog_state.get("name") == state_name:
                    return dialog_state
        return None

    def get_apicall_handlers(self, scenario: Dict[str, Any], state_name: str) -> List[Dict[str, Any]]:
        """
        특정 상태의 apicallHandlers를 반환합니다.
        """
        dialog_state = self.find_dialog_state(scenario, state_name)
        if dialog_state:
            return dialog_state.get("apicallHandlers", [])
        return [] 
