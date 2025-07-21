from backend.services.slot_filling_manager import SlotFillingManager

class MockScenarioManager:
    pass
class MockTransitionManager:
    def check_condition_handlers(self, current_dialog_state, memory):
        return None
class MockRepromptManager:
    class action_executor:
        @staticmethod
        def execute_prompt_action(action, memory):
            return "Prompt!"

def test_process_slot_filling_no_forms():
    sfm = SlotFillingManager(MockScenarioManager(), MockTransitionManager(), MockRepromptManager())
    current_dialog_state = {}
    memory = {}
    scenario = {}
    current_state = "state1"
    result = sfm.process_slot_filling(current_dialog_state, memory, scenario, current_state)
    assert result is None 