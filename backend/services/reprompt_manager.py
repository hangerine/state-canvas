import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

class RepromptManager:
    def __init__(self, scenario_manager, action_executor):
        self.scenario_manager = scenario_manager
        self.action_executor = action_executor

    def handle_no_match_event(self, current_dialog_state: Dict[str, Any], memory: Dict[str, Any], scenario: Dict[str, Any], current_state: str) -> Optional[Dict[str, Any]]:
        waiting_slot = memory.get("_WAITING_FOR_SLOT")
        reprompt_handlers = memory.get("_REPROMPT_HANDLERS", [])
        if not waiting_slot or not reprompt_handlers:
            return None
        logger.info(f"🔄 Handling NO_MATCH_EVENT for slot: {waiting_slot}")
        for handler in reprompt_handlers:
            event = handler.get("event", {})
            if event.get("type") == "NO_MATCH_EVENT":
                action = handler.get("action", {})
                action_message = None
                if action.get("directives"):
                    action_message = self.action_executor.execute_prompt_action(action, memory)
                transition_target = handler.get("transitionTarget", {})
                target_state = transition_target.get("dialogState", "__CURRENT_DIALOG_STATE__")
                if target_state == "__CURRENT_DIALOG_STATE__":
                    target_state = current_state
                return {
                    "new_state": target_state,
                    "messages": [action_message] if action_message else [],
                    "transition": None
                }
        return None

    def clear_reprompt_handlers(self, memory: Dict[str, Any], current_state: str) -> None:
        if memory.get("_WAITING_FOR_SLOT") or memory.get("_REPROMPT_HANDLERS"):
            logger.info(f"🧹 Clearing reprompt handlers when leaving state: {current_state}")
            memory.pop("_WAITING_FOR_SLOT", None)
            memory.pop("_REPROMPT_HANDLERS", None)
            memory.pop("_REPROMPT_JUST_REGISTERED", None) 