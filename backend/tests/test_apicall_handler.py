import pytest
import asyncio
from services.apicall_handler import ApiCallHandler

class MockScenarioManager:
    def _apply_response_mappings(self, response_data, mappings, memory):
        pass
    def _evaluate_condition(self, condition, memory):
        return False

@pytest.mark.asyncio
async def test_handle_returns_none_when_no_handlers():
    handler = ApiCallHandler(MockScenarioManager())
    current_state = "TestState"
    current_dialog_state = {"apicallHandlers": []}
    scenario = {}
    memory = {}
    result = await handler.handle(current_state, current_dialog_state, scenario, memory)
    assert result is None 