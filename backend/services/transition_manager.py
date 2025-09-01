import logging
from typing import Dict, Any, Optional
from models.scenario import StateTransition

logger = logging.getLogger(__name__)

class TransitionManager:
    def __init__(self, scenario_manager):
        self.scenario_manager = scenario_manager

    def check_intent_handlers(self, dialog_state: Dict[str, Any], intent: str, memory: Dict[str, Any]):
        intent_handlers = dialog_state.get("intentHandlers", [])
        
        # 먼저 정확한 인텐트 매칭 확인
        exact_match_handler = None
        any_intent_handler = None
        
        for handler in intent_handlers:
            if not isinstance(handler, dict):
                logger.warning(f"Handler is not a dict: {handler}")
                continue
            handler_intent = handler.get("intent")
            if handler_intent == intent:
                exact_match_handler = handler
                break
            elif handler_intent == "__ANY_INTENT__":
                any_intent_handler = handler
        
        # 정확한 매칭이 있으면 그것을 사용, 없으면 __ANY_INTENT__ 사용
        target_handler = exact_match_handler or any_intent_handler
        
        if target_handler:
            action = target_handler.get("action", {})
            if action:
                self.execute_action(action, memory)
            target = target_handler.get("transitionTarget", {})
            
            # __ANY_INTENT__로 전이하는 경우 로그 추가
            if target_handler == any_intent_handler:
                logger.info(f"🎯 __ANY_INTENT__ fallback triggered for intent: {intent}")
            
            # 🚀 수정: transitionTarget 파싱 강화 및 디버깅 로그 추가
            to_state = target.get("dialogState", "")
            scenario_name = target.get("scenario", "")
            
            # 디버깅 로그 추가
            logger.info(f"🎯 Intent handler found: {target_handler}")
            logger.info(f"🎯 Transition target: {target}")
            logger.info(f"🎯 To state: {to_state}")
            logger.info(f"🎯 To scenario: {scenario_name}")
            
            # to_state가 비어있으면 경고 로그
            if not to_state:
                logger.warning(f"⚠️ transitionTarget.dialogState is empty for intent: {intent}")
                logger.warning(f"⚠️ Full transitionTarget: {target}")
            
            return StateTransition(
                fromState=dialog_state.get("name", ""),
                toState=to_state,
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
            
            # 🚀 수정: 하드코딩된 조건 제거, 일반적인 조건 평가 시스템 구축
            
            # 1. 리터럴 조건 처리
            if condition.strip() == "True" or condition.strip() == '"True"':
                logger.info(f"🔍 Condition is literal True")
                return True
            elif condition.strip() == "False" or condition.strip() == '"False"':
                logger.info(f"🔍 Condition is literal False")
                return False
            
            # 2. 특별한 조건 처리 (SLOT_FILLING_COMPLETED)
            elif condition == "SLOT_FILLING_COMPLETED":
                result = memory.get("SLOT_FILLING_COMPLETED") is not None
                logger.info(f"🔍 SLOT_FILLING_COMPLETED check: {result}")
                logger.info(f"🔍 SLOT_FILLING_COMPLETED value: {memory.get('SLOT_FILLING_COMPLETED', 'NOT_FOUND')}")
                return result
            
            # 3. 일반적인 조건 평가 (변수 치환 후 평가)
            logger.info(f"🔍 [CONDITION DEBUG] Processing general condition: '{condition}'")
            
            # 변수 치환: {$variable} -> "value"
            processed_condition = condition
            for key, value in memory.items():
                if value is not None:  # None 값은 건너뛰기
                    # {$key} 패턴 치환
                    pattern = "{$" + key + "}"
                    if pattern in processed_condition:
                        processed_condition = processed_condition.replace(pattern, f'"{value}"')
                        logger.info(f"🔍 [CONDITION DEBUG] Replaced {pattern} with '{value}'")
                    
                    # {key} 패턴 치환 (중괄호만 있는 경우)
                    pattern2 = "{" + key + "}"
                    if pattern2 in processed_condition:
                        processed_condition = processed_condition.replace(pattern2, f'"{value}"')
                        logger.info(f"🔍 [CONDITION DEBUG] Replaced {pattern2} with '{value}'")
            
            logger.info(f"🔍 [CONDITION DEBUG] Final processed condition: '{processed_condition}'")
            
            # 4. 조건 평가
            if "==" in processed_condition:
                left, right = processed_condition.split("==", 1)
                left = left.strip().strip('"')
                right = right.strip().strip('"')
                result = left == right
                logger.info(f"🔍 [CONDITION DEBUG] Equality evaluation: '{left}' == '{right}' -> {result}")
                return result
            elif "!=" in processed_condition:
                left, right = processed_condition.split("!=", 1)
                left = left.strip().strip('"')
                right = right.strip().strip('"')
                result = left != right
                logger.info(f"🔍 [CONDITION DEBUG] Inequality evaluation: '{left}' != '{right}' -> {result}")
                return result
            elif ">" in processed_condition:
                left, right = processed_condition.split(">", 1)
                left = left.strip().strip('"')
                right = right.strip().strip('"')
                try:
                    result = float(left) > float(right)
                    logger.info(f"🔍 [CONDITION DEBUG] Greater than evaluation: {left} > {right} -> {result}")
                    return result
                except ValueError:
                    logger.warning(f"🔍 [CONDITION DEBUG] Cannot convert to number for comparison: {left} > {right}")
                    return False
            elif "<" in processed_condition:
                left, right = processed_condition.split("<", 1)
                left = left.strip().strip('"')
                right = right.strip().strip('"')
                try:
                    result = float(left) < float(right)
                    logger.info(f"🔍 [CONDITION DEBUG] Less than evaluation: {left} < {right} -> {result}")
                    return result
                except ValueError:
                    logger.warning(f"🔍 [CONDITION DEBUG] Cannot convert to number for comparison: {left} < {right}")
                    return False
            
            # 5. 지원되지 않는 조건 형식
            logger.warning(f"🔍 [CONDITION DEBUG] Unsupported condition format: '{condition}'")
            return False
            
        except Exception as e:
            logger.error(f"🔍 [CONDITION DEBUG] Condition evaluation error: {e}")
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