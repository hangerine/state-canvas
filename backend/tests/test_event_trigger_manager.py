import pytest
import asyncio
from backend.services.event_trigger_manager import EventTriggerManager

class MockActionExecutor:
    def execute_entry_action(self, scenario, new_state):
        return "Entry action executed"

class MockTransitionManager:
    pass

@pytest.mark.asyncio
async def test_handle_event_trigger_no_handlers():
    etm = EventTriggerManager(MockActionExecutor(), MockTransitionManager())
    event_type = "TEST_EVENT"
    current_state = "state1"
    current_dialog_state = {"eventHandlers": []}
    scenario = {}
    memory = {}
    result = await etm.handle_event_trigger(event_type, current_state, current_dialog_state, scenario, memory)
    assert isinstance(result, dict)
    assert result["new_state"] == current_state
    assert "response" in result
    assert "transitions" in result
    assert result["intent"] == "EVENT_TRIGGER"
    assert isinstance(result["entities"], dict)
    assert result["memory"] == memory 