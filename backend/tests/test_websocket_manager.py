from backend.services.websocket_manager import WebSocketManager

class DummyWebSocket:
    pass

def test_get_active_connections_and_count():
    wsm = WebSocketManager()
    wsm.active_connections = {"sess1": DummyWebSocket(), "sess2": DummyWebSocket()}
    conns = wsm.get_active_connections()
    assert isinstance(conns, dict)
    assert len(conns) == 2
    assert wsm.get_connection_count() == 2 