import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def test_nlu_health():
    response = client.get("/api/nlu/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"

def test_nlu_utterances_crud():
    # Create utterance
    utterance = {"text": "테스트 발화", "intent": "TEST_INTENT", "entities": []}
    response = client.post("/api/nlu/training/utterances", json=utterance)
    assert response.status_code == 200
    utter = response.json()
    assert utter["text"] == "테스트 발화"
    utter_id = utter["id"]

    # Get utterances
    response = client.get("/api/nlu/training/utterances")
    assert response.status_code == 200
    assert any(u["id"] == utter_id for u in response.json())

    # Delete utterance
    response = client.delete(f"/api/nlu/training/utterances/{utter_id}")
    assert response.status_code == 200
    assert response.json()["message"]

def test_nlu_infer():
    req = {"text": "테스트 발화"}
    response = client.post("/api/nlu/infer", json=req)
    assert response.status_code == 200
    data = response.json()
    assert "intent" in data
    assert "confidence" in data
    assert "entities" in data