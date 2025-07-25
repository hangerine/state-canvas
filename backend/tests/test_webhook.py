import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def test_webhook_health():
    response = client.get("/api/webhook/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"

def test_webhook_sentences():
    req = {
        "request": {
            "sessionId": "test-session",
            "requestId": "test-request",
            "userInput": {"content": {"text": "ACT_01_0212"}}
        },
        "webhook": {"memorySlots": {}}
    }
    response = client.post("/api/webhook/sentences/webhook", json=req)
    assert response.status_code == 200
    data = response.json()
    assert data["memorySlots"]["NLU_INTENT"]["value"][0] == "ACT_01_0212"
    assert data["responseStatus"] == "SUCCESS"

def test_webhook_apicall():
    req = {
        "sessionId": "test-session",
        "requestId": "test-request",
        "userInput": {"content": {"text": "ACT_01_0213"}}
    }
    response = client.post("/api/webhook/apicall", json=req)
    assert response.status_code == 200
    data = response.json()
    assert data["NLU_INTENT"]["value"][0] == "ACT_01_0213"
    assert data["responseStatus"] == "SUCCESS"