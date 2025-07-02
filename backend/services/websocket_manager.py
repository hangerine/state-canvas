import json
import logging
from typing import Dict, Any
from fastapi import WebSocket

logger = logging.getLogger(__name__)

class WebSocketManager:
    """WebSocket 연결을 관리하는 클래스"""
    
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
    
    async def connect(self, websocket: WebSocket, session_id: str):
        """WebSocket 연결을 수락하고 세션에 저장합니다."""
        await websocket.accept()
        self.active_connections[session_id] = websocket
        logger.info(f"WebSocket connected: {session_id}")
        
        # 연결 확인 메시지 전송
        await self.send_personal_message({
            "type": "connection_established",
            "session_id": session_id,
            "message": "WebSocket 연결이 성공적으로 설정되었습니다."
        }, session_id)
    
    def disconnect(self, session_id: str):
        """WebSocket 연결을 해제합니다."""
        if session_id in self.active_connections:
            del self.active_connections[session_id]
            logger.info(f"WebSocket disconnected: {session_id}")
    
    async def send_personal_message(self, message: Dict[str, Any], session_id: str):
        """특정 세션에 메시지를 전송합니다."""
        if session_id in self.active_connections:
            try:
                websocket = self.active_connections[session_id]
                await websocket.send_text(json.dumps(message, ensure_ascii=False))
                logger.debug(f"Message sent to {session_id}: {message}")
            except Exception as e:
                logger.error(f"Failed to send message to {session_id}: {e}")
                # 연결이 끊어진 경우 제거
                self.disconnect(session_id)
    
    async def broadcast(self, message: Dict[str, Any]):
        """모든 연결된 클라이언트에 메시지를 브로드캐스트합니다."""
        disconnected_sessions = []
        
        for session_id, websocket in self.active_connections.items():
            try:
                await websocket.send_text(json.dumps(message, ensure_ascii=False))
            except Exception as e:
                logger.error(f"Failed to broadcast to {session_id}: {e}")
                disconnected_sessions.append(session_id)
        
        # 끊어진 연결들 제거
        for session_id in disconnected_sessions:
            self.disconnect(session_id)
        
        logger.info(f"Broadcasted message to {len(self.active_connections)} clients")
    
    def get_active_connections(self) -> Dict[str, WebSocket]:
        """활성 연결 목록을 반환합니다."""
        return self.active_connections.copy()
    
    def get_connection_count(self) -> int:
        """활성 연결 수를 반환합니다."""
        return len(self.active_connections) 