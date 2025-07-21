from backend.services.scenario_manager import ScenarioManager

def test_load_and_get_scenario():
    sm = ScenarioManager()
    session_id = "sess1"
    scenario_data = {"plan": [], "webhooks": []}
    sm.load_scenario(session_id, scenario_data)
    assert sm.get_scenario(session_id) == scenario_data

def test_find_dialog_state():
    sm = ScenarioManager()
    scenario = {"plan": [{"dialogState": [{"name": "state1"}, {"name": "state2"}]}]}
    state = sm.find_dialog_state(scenario, "state2")
    assert state["name"] == "state2"
    assert sm.find_dialog_state(scenario, "notfound") is None 