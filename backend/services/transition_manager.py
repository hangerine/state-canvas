import logging
from typing import Dict, Any, Optional
from models.scenario import StateTransition

logger = logging.getLogger(__name__)

class TransitionManager:
    def __init__(self, scenario_manager):
        self.scenario_manager = scenario_manager

    def check_intent_handlers(self, dialog_state: Dict[str, Any], intent: str, memory: Dict[str, Any]):
        intent_handlers = dialog_state.get("intentHandlers", [])
        for handler in intent_handlers:
            if not isinstance(handler, dict):
                logger.warning(f"Handler is not a dict: {handler}")
                continue
            handler_intent = handler.get("intent")
            if handler_intent == intent or handler_intent == "__ANY_INTENT__":
                action = handler.get("action", {})
                if action:
                    self.execute_action(action, memory)
                target = handler.get("transitionTarget", {})
                return StateTransition(
                    fromState=dialog_state.get("name", ""),
                    toState=target.get("dialogState", ""),
                    reason=f"인텐트 '{intent}' 매칭",
                    conditionMet=True,
                    handlerType="intent"
                )
        return None

    def check_condition_handlers(self, dialog_state: Dict[str, Any], memory: Dict[str, Any]):
        condition_handlers = dialog_state.get("conditionHandlers", [])
        for handler in condition_handlers:
            if not isinstance(handler, dict):
                logger.warning(f"Handler is not a dict: {handler}")
                continue
            condition = handler.get("conditionStatement", "")
            if self.evaluate_condition(condition, memory):
                target = handler.get("transitionTarget", {})
                return StateTransition(
                    fromState=dialog_state.get("name", ""),
                    toState=target.get("dialogState", ""),
                    reason=f"조건 '{condition}' 만족",
                    conditionMet=True,
                    handlerType="condition"
                )
        return None

    def evaluate_condition(self, condition: str, memory: Dict[str, Any]) -> bool:
        try:
            logger.info(f"🔍 Evaluating condition: '{condition}'")
            logger.info(f"🔍 Available memory keys: {list(memory.keys())}")
            logger.info(f"🔍 NLU_INTENT value in memory: {memory.get('NLU_INTENT', 'NOT_FOUND')} (type: {type(memory.get('NLU_INTENT', 'NOT_FOUND'))})")
            if condition.strip() == "True" or condition.strip() == '"True"':
                logger.info(f"🔍 Condition is literal True")
                return True
            elif condition.strip() == "False" or condition.strip() == '"False"':
                logger.info(f"🔍 Condition is literal False")
                return False
            elif condition == "SLOT_FILLING_COMPLETED":
                result = memory.get("CITY") is not None
                logger.info(f"🔍 SLOT_FILLING_COMPLETED check: {result}")
                return result
            original_condition = condition
            for key, value in memory.items():
                old_condition = condition
                pattern1 = "{" + key + "}"
                condition = condition.replace(pattern1, f'"{value}"')
                pattern2 = "{$" + key + "}"
                condition = condition.replace(pattern2, f'"{value}"')
                pattern3 = "${" + key + "}"
                condition = condition.replace(pattern3, f'"{value}"')
                if old_condition != condition:
                    logger.info(f"🔍 Replaced variable {key} (type: {type(value)}) with '{value}': '{old_condition}' -> '{condition}'")
            if "{$NLU_INTENT}" in condition or "{NLU_INTENT}" in condition:
                nlu_intent_data = memory.get("NLU_INTENT", "")
                if isinstance(nlu_intent_data, dict) and "value" in nlu_intent_data:
                    nlu_intent = nlu_intent_data["value"][0] if nlu_intent_data["value"] else ""
                elif isinstance(nlu_intent_data, list) and nlu_intent_data:
                    nlu_intent = nlu_intent_data[0]
                else:
                    nlu_intent = str(nlu_intent_data)
                old_condition = condition
                condition = condition.replace("{$NLU_INTENT}", f'"{nlu_intent}"')
                condition = condition.replace("{NLU_INTENT}", f'"{nlu_intent}"')
                logger.info(f"🔍 Replaced NLU_INTENT with '{nlu_intent}': '{old_condition}' -> '{condition}'")
            logger.info(f"🔍 Final condition after substitution: '{condition}'")
            if "==" in condition:
                left, right = condition.split("==", 1)
                left = left.strip().strip('"')
                right = right.strip().strip('"')
                result = left == right
                logger.info(f"🔍 Condition evaluation: '{left}' == '{right}' -> {result}")
                return result
            logger.warning(f"🔍 Unsupported condition format: '{condition}'")
            return False
        except Exception as e:
            logger.error(f"🔍 Condition evaluation error: {e}")
            return False

    def execute_action(self, action: Dict[str, Any], memory: Dict[str, Any]) -> None:
        try:
            memory_actions = action.get("memoryActions", [])
            for memory_action in memory_actions:
                if not isinstance(memory_action, dict):
                    continue
                action_type = memory_action.get("actionType", "")
                memory_slot_key = memory_action.get("memorySlotKey", "")
                memory_slot_value = memory_action.get("memorySlotValue", "")
                action_scope = memory_action.get("actionScope", "SESSION")
                if action_type == "ADD" and memory_slot_key:
                    memory[memory_slot_key] = memory_slot_value
                    logger.info(f"💾 Memory action executed: {memory_slot_key} = {memory_slot_value}")
                elif action_type == "REMOVE" and memory_slot_key:
                    if memory_slot_key in memory:
                        del memory[memory_slot_key]
                        logger.info(f"🗑️ Memory action executed: removed {memory_slot_key}")
        except Exception as e:
            logger.error(f"Error executing action: {e}") 