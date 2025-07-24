from typing import Dict, Any, Optional
import logging
from . import utils

logger = logging.getLogger(__name__)

class ScenarioManager:
    """시나리오 로딩/저장/조회 담당 매니저"""
    def __init__(self):
        self.scenarios: Dict[str, Dict[str, Any]] = {}

    def load_scenario(self, session_id: str, scenario_data: Dict[str, Any]):
        self.scenarios[session_id] = scenario_data
        webhooks = scenario_data.get("webhooks", [])
        logger.info(f"📋 Loaded {len(webhooks)} webhooks for session: {session_id}")
        for webhook in webhooks:
            logger.info(f"🔗 Webhook: {webhook.get('name', 'Unknown')} -> {webhook.get('url', 'Unknown URL')}")
        plan = scenario_data.get("plan", [])
        if plan and len(plan) > 0:
            dialog_states = plan[0].get("dialogState", [])
            webhook_states = []
            for state in dialog_states:
                webhook_actions = state.get("webhookActions", [])
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
        logger.info(f"Scenario loaded for session: {session_id}")

    def get_scenario(self, session_id: str) -> Optional[Dict[str, Any]]:
        return self.scenarios.get(session_id)

    def get_scenario_by_name(self, scenario_name: str) -> Optional[Dict[str, Any]]:
        """
        시나리오 이름(plan[0].name)으로 시나리오를 찾습니다.
        """
        for scenario in self.scenarios.values():
            plans = scenario.get("plan", [])
            if plans and plans[0].get("name") == scenario_name:
                return scenario
        return None

    def find_dialog_state(self, scenario: Dict[str, Any], state_name: str) -> Optional[Dict[str, Any]]:
        """
        시나리오에서 특정 상태를 찾습니다.
        """
        for plan in scenario.get("plan", []):
            for dialog_state in plan.get("dialogState", []):
                if dialog_state.get("name") == state_name:
                    return dialog_state
        return None 