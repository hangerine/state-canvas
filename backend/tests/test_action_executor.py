from backend.services.action_executor import ActionExecutor

class MockScenarioManager:
    def find_dialog_state(self, scenario, state_name):
        if state_name == "state1":
            return {"entryAction": {"directives": [{"content": {"item": [{"section": {"item": [{"text": {"text": "<p>Hello</p>"}}]}}]}}]}}
        return None

def test_execute_entry_action_found():
    ae = ActionExecutor(MockScenarioManager())
    scenario = {}
    state_name = "state1"
    result = ae.execute_entry_action(scenario, state_name)
    assert result is not None

def test_execute_entry_action_not_found():
    ae = ActionExecutor(MockScenarioManager())
    scenario = {}
    state_name = "notfound"
    result = ae.execute_entry_action(scenario, state_name)
    assert result is None

def test_execute_prompt_action():
    ae = ActionExecutor(MockScenarioManager())
    action = {"directives": [{"content": {"text": "Prompt!"}}]}
    memory = {}
    result = ae.execute_prompt_action(action, memory)
    assert result == "Prompt!" 