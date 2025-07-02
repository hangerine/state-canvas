from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import json
import uuid
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
import logging

from models.scenario import Scenario, ProcessInputRequest, StateTransition
from services.state_engine import StateEngine
from services.websocket_manager import WebSocketManager

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# FastAPI 앱 생성
app = FastAPI(
    title="StateCanvas Backend",
    description="JSON 기반 시나리오 State Flow 처리 백엔드",
    version="1.0.0"
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # React 개발 서버
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 전역 상태
state_engine = StateEngine()
websocket_manager = WebSocketManager()
active_sessions: Dict[str, Dict[str, Any]] = {}

@app.get("/")
async def root():
    return {"message": "StateCanvas Backend API", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "engine_status": "running"}

# 시나리오 파일 업로드
@app.post("/api/upload-scenario")
async def upload_scenario(file: UploadFile = File(...)):
    """시나리오 JSON 파일 업로드"""
    try:
        content = await file.read()
        scenario_data = json.loads(content.decode('utf-8'))
        
        # 시나리오 validation
        scenario = Scenario(**scenario_data)
        
        # State engine에 로드
        session_id = str(uuid.uuid4())
        state_engine.load_scenario(session_id, scenario_data)
        
        logger.info(f"Scenario uploaded for session: {session_id}")
        
        return {
            "status": "success",
            "session_id": session_id,
            "scenario": scenario_data,
            "message": "시나리오가 성공적으로 업로드되었습니다."
        }
        
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"JSON 파싱 오류: {str(e)}")
    except Exception as e:
        logger.error(f"Upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"업로드 오류: {str(e)}")

# 시나리오 파일 다운로드
@app.get("/api/download-scenario/{session_id}")
async def download_scenario(session_id: str):
    """시나리오 JSON 파일 다운로드"""
    try:
        scenario_data = state_engine.get_scenario(session_id)
        if not scenario_data:
            raise HTTPException(status_code=404, detail="시나리오를 찾을 수 없습니다.")
        
        # 임시 파일로 저장 후 반환
        import tempfile
        import os
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as tmp_file:
            json.dump(scenario_data, tmp_file, indent=2, ensure_ascii=False)
            tmp_filename = tmp_file.name
        
        return FileResponse(
            tmp_filename,
            media_type='application/json',
            filename='scenario.json'
        )
        
    except Exception as e:
        logger.error(f"Download error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"다운로드 오류: {str(e)}")

# 세션 초기화
@app.post("/api/reset-session/{session_id}")
async def reset_session(session_id: str):
    """세션을 초기화합니다"""
    try:
        # 활성 세션 초기화
        if session_id in active_sessions:
            scenario = active_sessions[session_id].get("scenario")
            initial_state = "Start"  # 기본값
            
            # 시나리오에서 첫 번째 상태 찾기
            if scenario and scenario.get("plan") and len(scenario["plan"]) > 0:
                dialog_states = scenario["plan"][0].get("dialogState", [])
                if dialog_states:
                    initial_state = dialog_states[0].get("name", "Start")
            
            active_sessions[session_id] = {
                "current_state": initial_state,
                "memory": {},
                "history": [],
                "scenario": scenario
            }
        else:
            # 새 세션 생성
            active_sessions[session_id] = {
                "current_state": "Start",
                "memory": {},
                "history": []
            }
        
        logger.info(f"Session {session_id} reset to state: {active_sessions[session_id]['current_state']}")
        
        return {
            "status": "success",
            "session_id": session_id,
            "initial_state": active_sessions[session_id]["current_state"],
            "message": "세션이 초기화되었습니다."
        }
        
    except Exception as e:
        logger.error(f"Session reset error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"세션 초기화 오류: {str(e)}")

# 사용자 입력 처리 및 State 전이
@app.post("/api/process-input")
async def process_input(request: ProcessInputRequest):
    """사용자 입력을 처리하고 State 전이를 수행"""
    try:
        session_id = request.sessionId
        user_input = request.input
        current_state = request.currentState
        scenario = request.scenario
        
        # 세션이 없으면 생성
        if session_id not in active_sessions:
            initial_state = "Start"
            if scenario.get("plan") and len(scenario["plan"]) > 0:
                dialog_states = scenario["plan"][0].get("dialogState", [])
                if dialog_states:
                    initial_state = dialog_states[0].get("name", "Start")
            
            active_sessions[session_id] = {
                "current_state": initial_state,
                "memory": {},
                "history": [],
                "scenario": scenario
            }
        
        # 현재 상태 업데이트 (프론트엔드에서 전달된 상태 사용)
        if current_state:
            active_sessions[session_id]["current_state"] = current_state
        
        # State engine에서 입력 처리
        result = await state_engine.process_input(
            session_id=session_id,
            user_input=user_input,
            current_state=active_sessions[session_id]["current_state"],
            scenario=scenario,
            memory=active_sessions[session_id]["memory"]
        )
        
        # 세션 상태 업데이트
        if result.get("new_state"):
            active_sessions[session_id]["current_state"] = result["new_state"]
        
        active_sessions[session_id]["history"].append({
            "input": user_input,
            "old_state": current_state,
            "new_state": result.get("new_state"),
            "transitions": result.get("transitions", []),
            "timestamp": str(uuid.uuid4())  # 임시 타임스탬프
        })
        
        # WebSocket으로 실시간 업데이트 전송
        if session_id in websocket_manager.active_connections:
            await websocket_manager.send_personal_message({
                "type": "state_update",
                "session_id": session_id,
                "old_state": current_state,
                "new_state": result.get("new_state"),
                "transitions": result.get("transitions", [])
            }, session_id)
        
        logger.info(f"Processed input for session {session_id}: {current_state} -> {result.get('new_state')}")
        
        return result
        
    except Exception as e:
        logger.error(f"Process input error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"입력 처리 오류: {str(e)}")

# WebSocket 연결
@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """WebSocket 연결 처리"""
    await websocket_manager.connect(websocket, session_id)
    try:
        while True:
            # 클라이언트로부터 메시지 받기
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # 메시지 타입에 따른 처리
            if message.get("type") == "ping":
                await websocket_manager.send_personal_message({
                    "type": "pong",
                    "timestamp": str(uuid.uuid4())
                }, session_id)
            
            logger.info(f"WebSocket message from {session_id}: {message}")
            
    except WebSocketDisconnect:
        websocket_manager.disconnect(session_id)
        logger.info(f"WebSocket disconnected: {session_id}")

# 세션 상태 조회
@app.get("/api/session/{session_id}")
async def get_session_state(session_id: str):
    """세션의 현재 상태 조회"""
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다.")
    
    return {
        "session_id": session_id,
        "state": active_sessions[session_id]
    }

# 세션 목록 조회
@app.get("/api/sessions")
async def list_sessions():
    """활성 세션 목록 조회"""
    return {
        "active_sessions": list(active_sessions.keys()),
        "count": len(active_sessions)
    }

# 애플리케이션 시작 시
@app.on_event("startup")
async def startup_event():
    logger.info("StateCanvas Backend started")

# 애플리케이션 종료 시
@app.on_event("shutdown")
async def shutdown_event():
    logger.info("StateCanvas Backend shutting down") 