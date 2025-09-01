import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

class SlotFillingManager:
    def __init__(self, scenario_manager, transition_manager, reprompt_manager):
        self.scenario_manager = scenario_manager
        self.transition_manager = transition_manager
        self.reprompt_manager = reprompt_manager

    def process_slot_filling(
        self,
        current_dialog_state: Dict[str, Any],
        memory: Dict[str, Any],
        scenario: Dict[str, Any],
        current_state: str
    ) -> Optional[Dict[str, Any]]:
        slot_filling_forms = current_dialog_state.get("slotFillingForm", [])
        if not slot_filling_forms:
            return None
            
        logger.info(f"🎰 Processing slot filling forms: {len(slot_filling_forms)} forms found")
        
        # 🚀 추가: 사용자 입력과 메모리 상태 로깅
        user_input = memory.get("USER_TEXT_INPUT", [""])[0] if memory.get("USER_TEXT_INPUT") else ""
        logger.info(f"🎰 [SLOT DEBUG] User input: '{user_input}'")
        logger.info(f"🎰 [SLOT DEBUG] Current memory keys: {list(memory.keys())}")
        logger.info(f"🎰 [SLOT DEBUG] NLU_RESULT in memory: {memory.get('NLU_RESULT', 'NOT_FOUND')}")
        
        messages = []
        all_required_filled = True
        reprompt_just_registered = memory.get("_REPROMPT_JUST_REGISTERED", False)
        
        for form in slot_filling_forms:
            slot_name = form.get("name", "")
            required = form.get("required", "N") == "Y"
            memory_slot_keys = form.get("memorySlotKey", [])
            fill_behavior = form.get("fillBehavior", {})
            
            logger.info(f"🎰 Checking slot: {slot_name}, required: {required}, keys: {memory_slot_keys}")
            slot_filled = False
            slot_value = None
            
            # 🚀 추가: 각 슬롯의 현재 상태 확인
            for memory_key in memory_slot_keys:
                if ":" in memory_key:
                    domain, slot_key = memory_key.split(":", 1)
                    current_value = memory.get(memory_key)
                    logger.info(f"🎰 [SLOT DEBUG] Checking key '{memory_key}' -> domain: {domain}, slot_key: {slot_key}, current_value: {current_value}")
                    
                    if current_value:
                        slot_filled = True
                        slot_value = current_value
                        logger.info(f"🎰 [SLOT DEBUG] Slot {slot_name} is already filled with: {current_value}")
                        break
                else:
                    current_value = memory.get(memory_key)
                    logger.info(f"🎰 [SLOT DEBUG] Checking simple key '{memory_key}' -> current_value: {current_value}")
                    
                    if current_value:
                        slot_filled = True
                        slot_value = current_value
                        logger.info(f"🎰 [SLOT DEBUG] Slot {slot_name} is already filled with: {current_value}")
                        break
            
            # 🚀 추가: 사용자 입력에서 슬롯 추출 시도 (먼저 실행)
            if not slot_filled and user_input:
                logger.info(f"🎰 [SLOT DEBUG] Attempting to extract slot '{slot_name}' from user input: '{user_input}'")
                
                # NLU 결과에서 엔티티 확인
                nlu_result = memory.get("NLU_RESULT")
                if nlu_result:
                    logger.info(f"🎰 [SLOT DEBUG] NLU_RESULT found, checking for entities")
                    entities = self._extract_entities_from_nlu(nlu_result)
                    logger.info(f"🎰 [SLOT DEBUG] Extracted entities: {entities}")
                    
                    # 엔티티를 슬롯에 매핑 시도
                    for entity_type, entity_value in entities.items():
                        for key in memory_slot_keys:
                            if ":" in key:
                                domain, slot_key = key.split(":", 1)
                                if entity_type.lower() == slot_key.lower():
                                    logger.info(f"🎰 [SLOT DEBUG] Entity '{entity_type}:{entity_value}' matches slot '{slot_name}'")
                                    memory[f"{domain}:{slot_key}"] = entity_value
                                    slot_filled = True
                                    slot_value = entity_value
                                    logger.info(f"🎰 [SLOT DEBUG] Slot {slot_name} filled with: {entity_value}")
                                    break
                            else:
                                if entity_type.lower() == key.lower():
                                    logger.info(f"🎰 [SLOT DEBUG] Entity '{entity_type}:{entity_value}' matches slot '{slot_name}'")
                                    memory[key] = entity_value
                                    slot_filled = True
                                    slot_value = entity_value
                                    logger.info(f"🎰 [SLOT DEBUG] Slot {slot_name} filled with: {entity_value}")
                                    break
                        if slot_filled:
                            break
            
            if slot_filled:
                logger.info(f"🎰 Slot {slot_name} filled with key {memory_key}: {slot_value}")
            else:
                logger.info(f"🎰 Slot {slot_name} not filled")
                
            # 🚀 수정: 슬롯이 채워진 후에 required 체크
            if required and not slot_filled:
                all_required_filled = False
                logger.info(f"🎰 Required slot {slot_name} not filled")
                
                if memory.get("_WAITING_FOR_SLOT") == slot_name and not reprompt_just_registered:
                    logger.info(f"🎰 Already waiting for slot {slot_name}, skipping prompt")
                    return None
                    
                prompt_action = fill_behavior.get("promptAction", {})
                if prompt_action:
                    prompt_message = self.reprompt_manager.action_executor.execute_prompt_action(prompt_action, memory)
                    if prompt_message:
                        messages.append(prompt_message)
                        
                reprompt_handlers = fill_behavior.get("repromptEventHandlers", [])
                if reprompt_handlers:
                    logger.info(f"🎰 Registering reprompt handlers for slot {slot_name}")
                    memory["_WAITING_FOR_SLOT"] = slot_name
                    memory["_REPROMPT_HANDLERS"] = reprompt_handlers
                    memory["_REPROMPT_JUST_REGISTERED"] = True
                    
                return {
                    "new_state": current_state,
                    "messages": messages,
                    "transition": None
                }
            elif slot_filled and memory.get("_WAITING_FOR_SLOT") == slot_name:
                logger.info(f"🎰 Slot {slot_name} just filled, clearing waiting state")
                memory.pop("_WAITING_FOR_SLOT", None)
                memory.pop("_REPROMPT_HANDLERS", None)
                memory.pop("_REPROMPT_JUST_REGISTERED", None)
                
        if reprompt_just_registered:
            memory.pop("_REPROMPT_JUST_REGISTERED", None)
            
        if all_required_filled:
            logger.info("🎰 All required slots filled, setting SLOT_FILLING_COMPLETED")
            memory["SLOT_FILLING_COMPLETED"] = ""
            memory.pop("_WAITING_FOR_SLOT", None)
            memory.pop("_REPROMPT_HANDLERS", None)
            memory.pop("_REPROMPT_JUST_REGISTERED", None)
            
            condition_transition = self.transition_manager.check_condition_handlers(current_dialog_state, memory)
            if condition_transition:
                logger.info(f"🎰 Slot filling completed, transitioning to: {condition_transition.toState}")
                return {
                    "new_state": condition_transition.toState,
                    "messages": messages,
                    "transition": condition_transition
                }
                
        return {
            "new_state": current_state,
            "messages": messages,
            "transition": None
        }

    def _extract_entities_from_nlu(self, nlu_result: Dict[str, Any]) -> Dict[str, str]:
        """NLU 결과에서 엔티티를 추출"""
        entities = {}
        try:
            results = nlu_result.get("results", [])
            if not results:
                return entities
                
            nlu_nbest = results[0].get("nluNbest", [])
            if not nlu_nbest:
                return entities
                
            # 첫 번째 결과에서 엔티티 추출
            first_result = nlu_nbest[0]
            entity_list = first_result.get("entities", [])
            
            for entity in entity_list:
                # 🚀 수정: 다양한 엔티티 구조 지원
                entity_type = None
                entity_value = None
                
                # 구조 1: {"type": "CITY", "value": "서울"}
                if "type" in entity and "value" in entity:
                    entity_type = entity.get("type")
                    entity_value = entity.get("value")
                # 구조 2: {"role": "CITY", "type": "CITY", "text": "서울"}
                elif "role" in entity and "text" in entity:
                    entity_type = entity.get("role")  # role을 type으로 사용
                    entity_value = entity.get("text")  # text를 value로 사용
                # 구조 3: {"type": "CITY", "text": "서울"}
                elif "type" in entity and "text" in entity:
                    entity_type = entity.get("type")
                    entity_value = entity.get("text")
                
                if entity_type and entity_value:
                    entities[entity_type] = entity_value
                    logger.info(f"🎰 [SLOT DEBUG] Extracted entity: {entity_type} = {entity_value}")
                    
        except Exception as e:
            logger.warning(f"🎰 [SLOT DEBUG] Failed to extract entities: {e}")
            
        return entities
