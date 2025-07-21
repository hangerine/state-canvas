from backend.services.chatbot_response_factory import ChatbotResponseFactory

def test_create_chatbot_response_basic():
    factory = ChatbotResponseFactory()
    new_state = "state1"
    response_messages = ["Hello"]
    intent = "greet"
    entities = {"name": "Alice"}
    memory = {}
    scenario = {"plan": [{"name": "TestPlan"}]}
    used_slots = [{"key": "slot1", "value": "val1", "turn": "1"}]
    event_type = "EVENT"
    resp = factory.create_chatbot_response(new_state, response_messages, intent, entities, memory, scenario, used_slots, event_type)
    assert resp.endSession == "N"
    assert resp.meta.intent == [intent]
    assert resp.meta.event == {"type": event_type}
    assert resp.meta.scenario == "TestPlan"
    assert resp.meta.dialogState == new_state
    assert resp.directives 