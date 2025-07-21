from backend.services.nlu_processor import NLUProcessor

class MockScenarioManager:
    global_intent_mapping = []

class MockTransitionManager:
    def evaluate_condition(self, condition, memory):
        return True

def test_get_nlu_results_no_nlu():
    nlu = NLUProcessor(MockScenarioManager(), MockTransitionManager())
    user_input = "hi"
    memory = {}
    intent, entities = nlu.get_nlu_results(user_input, memory)
    assert intent == "NO_INTENT_FOUND"
    assert entities == {}

def test_apply_dm_intent_mapping_returns_base():
    nlu = NLUProcessor(MockScenarioManager(), MockTransitionManager())
    base_intent = "test_intent"
    current_state = "state1"
    memory = {}
    scenario = {}
    result = nlu.apply_dm_intent_mapping(base_intent, current_state, memory, scenario)
    assert result == base_intent 