import pytest
from backend.services.transition_manager import TransitionManager

class MockScenarioManager:
    pass

def test_check_intent_handlers_none():
    tm = TransitionManager(MockScenarioManager())
    dialog_state = {"intentHandlers": []}
    intent = "test"
    memory = {}
    result = tm.check_intent_handlers(dialog_state, intent, memory)
    assert result is None

def test_check_condition_handlers_none():
    tm = TransitionManager(MockScenarioManager())
    dialog_state = {"conditionHandlers": []}
    memory = {}
    result = tm.check_condition_handlers(dialog_state, memory)
    assert result is None

def test_evaluate_condition_true_false():
    tm = TransitionManager(MockScenarioManager())
    assert tm.evaluate_condition("True", {}) is True
    assert tm.evaluate_condition("False", {}) is False

def test_execute_action_add_remove():
    tm = TransitionManager(MockScenarioManager())
    memory = {}
    action = {"memoryActions": [{"actionType": "ADD", "memorySlotKey": "foo", "memorySlotValue": "bar"}]}
    tm.execute_action(action, memory)
    assert memory["foo"] == "bar"
    action2 = {"memoryActions": [{"actionType": "REMOVE", "memorySlotKey": "foo"}]}
    tm.execute_action(action2, memory)
    assert "foo" not in memory 