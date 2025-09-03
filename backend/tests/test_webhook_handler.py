import pytest
import asyncio
from services.webhook_handler import WebhookHandler

class MockScenarioManager:
    pass  # 필요한 경우 메서드 추가

@pytest.mark.asyncio
async def test_handle_returns_expected_format():
    handler = WebhookHandler(MockScenarioManager())
    # 최소 입력값 (실제 로직에 맞게 수정 필요)
    current_state = "TestState"
    current_dialog_state = {"entryAction": {"webhookActions": []}}
    scenario = {"webhooks": []}
    memory = {}
    result = await handler.handle(current_state, current_dialog_state, scenario, memory)
    assert isinstance(result, dict)
    assert "new_state" in result
    assert "response" in result
    assert "transitions" in result
    assert "intent" in result
    assert "entities" in result
    assert "memory" in result 
