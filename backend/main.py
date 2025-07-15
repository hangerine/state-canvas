from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import json
import uuid
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
import logging

from models.scenario import Scenario, ProcessInputRequest, LegacyProcessInputRequest, StateTransition, UserInput, TextContent, CustomEventContent, ChatbotInputRequest, ChatbotProcessRequest
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

# 세션 메모리 관리 함수들
def get_or_create_session_memory(session_id: str) -> Dict[str, Any]:
    """세션 메모리를 가져오거나 생성합니다."""
    if session_id not in active_sessions:
        active_sessions[session_id] = {
            "current_state": "Start",
            "memory": {"sessionId": session_id},
            "history": [],
            "scenario": None
        }
    return active_sessions[session_id]["memory"]

def update_session_memory(session_id: str, memory: Dict[str, Any]) -> None:
    """세션 메모리를 업데이트합니다."""
    if session_id not in active_sessions:
        active_sessions[session_id] = {
            "current_state": "Start",
            "memory": memory,
            "history": [],
            "scenario": None
        }
    else:
        active_sessions[session_id]["memory"] = memory

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

# 세션 초기화 요청 모델
class ResetSessionRequest(BaseModel):
    scenario: Optional[Dict[str, Any]] = None

class UpdateIntentMappingRequest(BaseModel):
    scenario: str
    intentMapping: List[Dict[str, Any]]

# 세션 초기화
@app.post("/api/reset-session/{session_id}")
async def reset_session(session_id: str, request: Optional[ResetSessionRequest] = None):
    """세션을 초기화합니다"""
    try:
        scenario = None
        initial_state = "Start"  # 기본값
        
        # 요청에서 시나리오 가져오기
        if request and request.scenario:
            scenario = request.scenario
            # State engine을 사용하여 초기 상태 결정
            initial_state = state_engine.get_initial_state(scenario)
            # State engine에 시나리오 로드
            state_engine.load_scenario(session_id, scenario)
        else:
            # 기존 세션에서 시나리오 가져오기
            if session_id in active_sessions:
                scenario = active_sessions[session_id].get("scenario")
                if scenario:
                    initial_state = state_engine.get_initial_state(scenario)
                    state_engine.load_scenario(session_id, scenario)
        
        # 세션 초기화
        active_sessions[session_id] = {
            "current_state": initial_state,
            "memory": {},
            "history": [],
            "scenario": scenario
        }
        
        logger.info(f"Session {session_id} reset to state: {initial_state}")
        
        return {
            "status": "success",
            "session_id": session_id,
            "initial_state": initial_state,
            "message": f"세션이 초기화되었습니다. 초기 상태: {initial_state}"
        }
        
    except Exception as e:
        logger.error(f"Session reset error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"세션 초기화 오류: {str(e)}")

@app.post("/api/intent-mapping")
async def update_intent_mapping(request: UpdateIntentMappingRequest):
    """Intent Mapping을 업데이트하고 StateEngine에 실시간 반영합니다."""
    try:
        logger.info(f"Updating intent mapping for scenario: {request.scenario}")
        
        # StateEngine에 Intent Mapping 업데이트
        state_engine.update_intent_mapping(request.intentMapping)
        
        # 모든 세션의 시나리오 업데이트
        for session_id, session_data in active_sessions.items():
            if session_data.get("scenario") and session_data["scenario"].get("plan"):
                # 시나리오에 intentMapping 업데이트
                session_data["scenario"]["intentMapping"] = request.intentMapping
                logger.info(f"Updated intent mapping for session: {session_id}")
        
        logger.info("Intent mapping updated successfully")
        
        return {
            "status": "success",
            "message": "Intent mapping updated successfully",
            "intentMapping": request.intentMapping
        }
        
    except Exception as e:
        logger.error(f"Error updating intent mapping: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update intent mapping: {str(e)}")

# 새로운 userInput 형식을 지원하는 엔드포인트
@app.post("/api/process-input")
async def process_input(request: ProcessInputRequest):
    """
    새로운 userInput 형식으로 사용자 입력을 처리하고 State 전이를 수행합니다.
    """
    logger.info(f"📥 Processing userInput: session={request.sessionId}, state={request.currentState}, userInput={request.userInput}")
    
    # 세션 메모리 가져오기 또는 생성
    memory = get_or_create_session_memory(request.sessionId)
    
    # userInput에서 텍스트 추출 및 메모리 저장
    user_text = ""
    if request.userInput.type == "text":
        if isinstance(request.userInput.content, dict) and "text" in request.userInput.content:
            user_text = request.userInput.content["text"]
            
            # NLU 결과가 있는 경우 메모리에 저장 (딕셔너리 형태)
            if "nluResult" in request.userInput.content and request.userInput.content["nluResult"]:
                memory["NLU_RESULT"] = request.userInput.content["nluResult"]
        else:
            # TextContent 객체인 경우
            user_text = request.userInput.content.text if hasattr(request.userInput.content, 'text') else ""
            
            # NLU 결과가 있는 경우 메모리에 저장 (객체 형태)
            if hasattr(request.userInput.content, 'nluResult') and request.userInput.content.nluResult:
                memory["NLU_RESULT"] = request.userInput.content.nluResult.dict()
        
        if user_text.strip():
            memory["USER_TEXT_INPUT"] = [user_text.strip()]
    
    elif request.userInput.type == "customEvent":
        if isinstance(request.userInput.content, dict) and "type" in request.userInput.content:
            event_type = request.userInput.content["type"]
        else:
            # CustomEventContent 객체인 경우
            event_type = request.userInput.content.type if hasattr(request.userInput.content, 'type') else ""
        
        memory["CUSTOM_EVENT"] = {
            "type": event_type,
            "content": request.userInput.content.dict() if hasattr(request.userInput.content, 'dict') else request.userInput.content
        }
    
    # State Engine에 시나리오 로드
    state_engine.load_scenario(request.sessionId, request.scenario)
    
    # 입력 처리 (기존 state_engine은 텍스트를 기대하므로 변환)
    result = await state_engine.process_input(
        session_id=request.sessionId,
        user_input=user_text,
        current_state=request.currentState,
        scenario=request.scenario,
        memory=memory,
        event_type=request.eventType
    )
    
    # 세션 메모리 업데이트
    update_session_memory(request.sessionId, result.get("memory", memory))
    
    logger.info(f"📤 Processing result: {result}")
    return result

# 새로운 챗봇 입력 포맷을 지원하는 엔드포인트
@app.post("/api/process-chatbot-input")
async def process_chatbot_input(request: ChatbotProcessRequest):
    """
    새로운 챗봇 입력 포맷으로 사용자 입력을 처리하고 State 전이를 수행합니다.
    """
    logger.info(f"📥 Processing chatbot input: userId={request.userId}, sessionId={request.sessionId}, requestId={request.requestId}, botId={request.botId}, state={request.currentState}")
    
    # 세션 메모리 가져오기 또는 생성
    memory = get_or_create_session_memory(request.sessionId)
    
    # 챗봇 메타데이터를 메모리에 저장
    memory["CHATBOT_METADATA"] = {
        "userId": request.userId,
        "botId": request.botId,
        "botVersion": request.botVersion,
        "botName": request.botName,
        "botResourcePath": request.botResourcePath,
        "requestId": request.requestId,
        "context": request.context,
        "headers": request.headers
    }
    
    # userInput에서 텍스트 추출 및 메모리 저장
    user_text = ""
    if request.userInput.type == "text":
        if isinstance(request.userInput.content, dict) and "text" in request.userInput.content:
            user_text = request.userInput.content["text"]
        else:
            # TextContent 객체인 경우
            user_text = request.userInput.content.text if hasattr(request.userInput.content, 'text') else ""
        
        if user_text.strip():
            memory["USER_TEXT_INPUT"] = [user_text.strip()]
            
            # NLU 결과가 있는 경우 메모리에 저장
            if hasattr(request.userInput.content, 'nluResult') and request.userInput.content.nluResult:
                memory["NLU_RESULT"] = request.userInput.content.nluResult.dict()
    
    elif request.userInput.type == "customEvent":
        if isinstance(request.userInput.content, dict) and "type" in request.userInput.content:
            event_type = request.userInput.content["type"]
        else:
            # CustomEventContent 객체인 경우
            event_type = request.userInput.content.type if hasattr(request.userInput.content, 'type') else ""
        
        memory["CUSTOM_EVENT"] = {
            "type": event_type,
            "content": request.userInput.content.dict() if hasattr(request.userInput.content, 'dict') else request.userInput.content
        }
    
    # State Engine에 시나리오 로드
    state_engine.load_scenario(request.sessionId, request.scenario)
    
    # 입력 처리 (기존 state_engine은 텍스트를 기대하므로 변환)
    result = await state_engine.process_input(
        session_id=request.sessionId,
        user_input=user_text,
        current_state=request.currentState,
        scenario=request.scenario,
        memory=memory,
        event_type=request.eventType
    )
    
    # 세션 메모리 업데이트
    update_session_memory(request.sessionId, result.get("memory", memory))
    
    # 새로운 챗봇 응답 포맷으로 변환
    chatbot_response = state_engine.create_chatbot_response(
        new_state=result.get("new_state", request.currentState),
        response_messages=[result.get("response", "")],
        intent=result.get("intent", ""),
        entities=result.get("entities", {}),
        memory=result.get("memory", memory),
        scenario=request.scenario,
        used_slots=None,  # TODO: 추후 구현
        event_type=request.eventType
    )
    
    logger.info(f"📤 Processing result: {chatbot_response.dict()}")
    return chatbot_response

# 기존 형식 지원을 위한 레거시 엔드포인트
@app.post("/api/process-input-legacy")
async def process_input_legacy(request: LegacyProcessInputRequest):
    """
    기존 input 형식으로 사용자 입력을 처리하고 State 전이를 수행합니다. (호환성 유지)
    """
    logger.info(f"📥 Processing legacy input: session={request.sessionId}, state={request.currentState}, input='{request.input}', event={request.eventType}")
    
    # 세션 메모리 가져오기 또는 생성
    memory = get_or_create_session_memory(request.sessionId)
    
    # 세션 메모리에 사용자 입력 저장
    if request.input.strip():
        memory["USER_TEXT_INPUT"] = [request.input.strip()]
    
    # State Engine에 시나리오 로드
    state_engine.load_scenario(request.sessionId, request.scenario)
    
    # 입력 처리
    result = await state_engine.process_input(
        session_id=request.sessionId,
        user_input=request.input,
        current_state=request.currentState,
        scenario=request.scenario,
        memory=memory,
        event_type=request.eventType
    )
    
    # 세션 메모리 업데이트
    update_session_memory(request.sessionId, result.get("memory", memory))
    
    logger.info(f"📤 Processing result: {result}")
    return result

# Mock API endpoints for testing apicall functionality
@app.post("/mock/nlu")
async def mock_nlu_api(request: Dict[str, Any]):
    """Mock NLU API for testing"""
    text = request.get("text", "")
    session_id = request.get("sessionId", "")
    
    # Simulate NLU processing based on input text
    intent_mapping = {
        "weather": "Weather.Inform",
        "날씨": "Weather.Inform", 
        "hello": "Greeting.Hello",
        "안녕": "Greeting.Hello",
        "bye": "Greeting.Goodbye",
        "안녕히": "Greeting.Goodbye",
        "book": "Booking.Request",
        "예약": "Booking.Request"
    }
    
    # Find intent based on text content
    detected_intent = "Fallback.Unknown"
    confidence = 0.3
    
    for keyword, intent in intent_mapping.items():
        if keyword.lower() in text.lower():
            detected_intent = intent
            confidence = 0.85
            break
    
    # Mock response in the format provided by user
    response = {
        "sessionId": session_id,
        "requestId": f"req-{hash(text) % 10000}",
        "NLU_INTENT": {
            "value": detected_intent
        },
        "nlu": {
            "intent": detected_intent,
            "confidence": confidence,
            "entities": []
        },
        "meta": {
            "exactMatch": confidence > 0.8,
            "processingTime": 150
        }
    }
    
    return response

@app.post("/mock/complex-response")
async def mock_complex_response(request: Dict[str, Any]):
    """Mock API with complex nested response for testing various JSONPath scenarios"""
    
    response = {
        "status": "success",
        "data": {
            "users": [
                {
                    "id": 1,
                    "name": "John Doe",
                    "profile": {
                        "age": 30,
                        "location": "Seoul",
                        "preferences": ["music", "sports"]
                    }
                },
                {
                    "id": 2,
                    "name": "Jane Smith", 
                    "profile": {
                        "age": 25,
                        "location": "Busan",
                        "preferences": ["art", "travel", "books"]
                    }
                }
            ],
            "metadata": {
                "total": 2,
                "page": 1,
                "hasMore": False
            }
        },
        "result": {
            "success": True,
            "message": "Data retrieved successfully"
        },
        "timestamp": "2024-01-15T10:30:00Z"
    }
    
    return response

@app.get("/mock/simple-data")
async def mock_simple_data():
    """Mock API with simple response"""
    return {
        "value": "simple_response",
        "count": 42,
        "active": True,
        "items": ["item1", "item2", "item3"]
    }

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