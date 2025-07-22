import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def test_proxy_missing_endpoint():
    response = client.post('/api/proxy', json={"payload": {"foo": "bar"}})
    assert response.status_code == 400
    assert "endpoint" in response.json()["error"]

def test_proxy_missing_payload():
    response = client.post('/api/proxy', json={"endpoint": "http://localhost:9999/any"})
    assert response.status_code == 400
    assert "payload" in response.json()["error"]

def test_proxy_invalid_target():
    response = client.post('/api/proxy', json={"endpoint": "http://localhost:9999/invalid", "payload": {"foo": "bar"}})
    assert response.status_code == 500
    assert "error" in response.json() 