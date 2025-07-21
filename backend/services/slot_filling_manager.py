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
            for memory_key in memory_slot_keys:
                if memory_key in memory and memory[memory_key]:
                    slot_filled = True
                    slot_value = memory[memory_key]
                    logger.info(f"🎰 Slot {slot_name} filled with key {memory_key}: {slot_value}")
                    break
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