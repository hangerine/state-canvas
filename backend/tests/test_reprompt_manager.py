from backend.services.reprompt_manager import RepromptManager

class MockScenarioManager:
    pass

class MockActionExecutor:
    def execute_prompt_action(self, action, memory):
        return "Prompt!"

def test_handle_no_match_event_none():
    rm = RepromptManager(MockScenarioManager(), MockActionExecutor())
    current_dialog_state = {}
    memory = {}
    scenario = {}
    current_state = "state1"
    result = rm.handle_no_match_event(current_dialog_state, memory, scenario, current_state)
    assert result is None

def test_clear_reprompt_handlers():
    rm = RepromptManager(MockScenarioManager(), MockActionExecutor())
    memory = {"_WAITING_FOR_SLOT": "slot1", "_REPROMPT_HANDLERS": [1], "_REPROMPT_JUST_REGISTERED": True}
    current_state = "state1"
    rm.clear_reprompt_handlers(memory, current_state)
    assert "_WAITING_FOR_SLOT" not in memory
    assert "_REPROMPT_HANDLERS" not in memory
    assert "_REPROMPT_JUST_REGISTERED" not in memory 