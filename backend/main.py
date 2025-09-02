import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
import json
import uuid
from typing import Dict, Any, List, Optional, Union
from pydantic import BaseModel, Field
import logging
import requests

from models.scenario import Scenario, ProcessInputRequest, LegacyProcessInputRequest, StateTransition, UserInput, TextContent, CustomEventContent, ChatbotInputRequest, ChatbotProcessRequest
from services.state_engine import StateEngine
from services.websocket_manager import WebSocketManager
from services.context_store import build_context_store_from_env
from nlu.router import router as nlu_router
from webhook.handler import webhook_router, apicall_router

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
    allow_origins=["http://localhost:3000", "http://localhost:5173"],  # React 개발 서버
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 등록
app.include_router(nlu_router)
app.include_router(webhook_router)
app.include_router(apicall_router)

# 전역 상태
state_engine = StateEngine()
websocket_manager = WebSocketManager()
active_sessions: Dict[str, Dict[str, Any]] = {}
context_store = build_context_store_from_env()
import os
SCENARIO_DIR = os.getenv("SCENARIO_DIR", "").strip()

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
        # 🚀 핵심 수정: 기존 메모리를 보존하면서 새로운 메모리로 업데이트
        existing_memory = active_sessions[session_id].get("memory", {})
        if existing_memory:
            # 기존 메모리를 보존하면서 새로운 메모리로 업데이트
            merged_memory = existing_memory.copy()
            merged_memory.update(memory)
            active_sessions[session_id]["memory"] = merged_memory
            logger.info(f"[MEMORY UPDATE] Merged memory for session: {session_id}")
            logger.info(f"[MEMORY UPDATE] Existing keys: {list(existing_memory.keys())}")
            logger.info(f"[MEMORY UPDATE] New keys: {list(memory.keys())}")
            logger.info(f"[MEMORY UPDATE] Merged keys: {list(merged_memory.keys())}")
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
    """시나리오 JSON 파일 업로드 (여러 개 가능)"""
    try:
        content = await file.read()
        scenario_data = json.loads(content.decode('utf-8'))
        # 여러 시나리오 지원
        scenarios = scenario_data if isinstance(scenario_data, list) else [scenario_data]
        # State engine에 로드
        session_id = str(uuid.uuid4())
        state_engine.load_scenario(session_id, scenarios)
        logger.info(f"Scenario(s) uploaded for session: {session_id}")
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
    """시나리오 JSON 파일 다운로드 (apicallHandlers의 url 필드 제거)"""
    try:
        scenario_data = state_engine.get_scenario(session_id)
        if not scenario_data:
            raise HTTPException(status_code=404, detail="시나리오를 찾을 수 없습니다.")

        # 통합 저장 규칙:
        # - webhooks 배열에 WEBHOOK/APICALL을 함께 저장 (type 필드로 구분)
        # - legacy apicalls는 webhooks(type='APICALL')로 이동 후 삭제
        def unify_webhooks_and_apicalls(scenario: Dict[str, Any]):
            # 기본 webhooks 보장
            webhooks = scenario.get("webhooks", []) or []
            # 기존 webhook들에 type 없으면 WEBHOOK으로 표기
            for w in webhooks:
                if "type" not in w:
                    w["type"] = "WEBHOOK"

            legacy_apicalls = scenario.get("apicalls", []) or []
            if legacy_apicalls:
                # 기존 webhooks에서 APICALL 타입 중복 제거(이름 기준)
                existing_apicall_names = {w.get("name") for w in webhooks if str(w.get("type", "")).upper() == "APICALL"}
                for a in legacy_apicalls:
                    name = a.get("name")
                    if name in existing_apicall_names:
                        continue
                    
                    # 새로운 spec에 맞춰 변환
                    formats = a.get("formats", {}) or {}
                    # responseMappings 변환 (레거시 → 그룹)
                    def to_groups(m):
                        if not m:
                            return []
                        if isinstance(m, list) and len(m) > 0 and isinstance(m[0], dict) and m[0].get('expressionType'):
                            return m
                        memory, directive = {}, {}
                        if isinstance(m, list):
                            for item in m:
                                t = str(item.get('type', 'memory')).lower()
                                for k, v in (item.get('map') or {}).items():
                                    (directive if t == 'directive' else memory)[k] = v
                        elif isinstance(m, dict):
                            for k, conf in m.items():
                                if isinstance(conf, str):
                                    memory[k] = conf
                                elif isinstance(conf, dict):
                                    t = str(conf.get('type', 'memory')).lower()
                                    expr = conf.get(k)
                                    if not isinstance(expr, str):
                                        for kk, vv in conf.items():
                                            if kk != 'type' and isinstance(vv, str):
                                                expr = vv; break
                                    if isinstance(expr, str):
                                        (directive if t == 'directive' else memory)[k] = expr
                        groups = []
                        if memory: groups.append({ 'expressionType': 'JSON_PATH', 'targetType': 'MEMORY', 'mappings': memory })
                        if directive: groups.append({ 'expressionType': 'JSON_PATH', 'targetType': 'DIRECTIVE', 'mappings': directive })
                        return groups
                    new_formats = {
                        "contentType": formats.get("contentType", "application/json"),
                        "requestTemplate": formats.get("requestTemplate"),

                        "responseProcessing": formats.get("responseProcessing", {}),
                        "responseMappings": to_groups(formats.get("responseMappings")),
                        "headers": formats.get("headers", {}),
                        "queryParams": formats.get("queryParams", [])
                    }
                    
                    webhooks.append({
                        "type": "APICALL",
                        "name": name,
                        "url": a.get("url", ""),
                        "timeoutInMilliSecond": a.get("timeoutInMilliSecond", a.get("timeout", 5000)),
                        "retry": a.get("retry", 3),
                        # webhook 공통 인터페이스 호환 필드
                        "timeoutInMilliSecond": a.get("timeout", 5000),
                        "headers": formats.get("headers", {}) or {},
                        "method": formats.get("method", "POST"),
                        # apicall 고유 포맷 보관
                        "formats": new_formats
                    })
                scenario["webhooks"] = webhooks
                # legacy 삭제
                if "apicalls" in scenario:
                    del scenario["apicalls"]

        # apicallHandlers의 apicall.url 필드 삭제 함수
        def remove_apicall_urls(scenario):
            # 여러 plan, 여러 dialogState 지원
            plans = scenario.get("plan", [])
            for plan in plans:
                dialog_states = plan.get("dialogState", [])
                for state in dialog_states:
                    apicall_handlers = state.get("apicallHandlers", [])
                    for handler in apicall_handlers:
                        if "apicall" in handler and "url" in handler["apicall"]:
                            # 한글/영문 주석: 다운로드 시 외부 API URL 정보 제거
                            # Remove url field from apicall when downloading scenario
                            logger.info(f"[REMOVE_URL] state: {state.get('name')}, handler: {handler.get('name')} - url 삭제됨 (removed)")
                            del handler["apicall"]["url"]
                        else:
                            # 삭제할 url이 없는 경우도 로그로 남김
                            logger.info(f"[REMOVE_URL] state: {state.get('name')}, handler: {handler.get('name')} - url 없음 (no url field)")

        # 시나리오가 리스트일 수도 있음
        if isinstance(scenario_data, list):
            for scenario in scenario_data:
                unify_webhooks_and_apicalls(scenario)
                remove_apicall_urls(scenario)
        else:
            unify_webhooks_and_apicalls(scenario_data)
            remove_apicall_urls(scenario_data)

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
    """세션을 초기화합니다 (여러 시나리오 지원)"""
    try:
        scenario = None
        initial_state = "Start"  # 기본값
        # 요청에서 시나리오 가져오기
        if request and request.scenario:
            scenario = request.scenario
            scenarios = scenario if isinstance(scenario, list) else [scenario]
            initial_state = state_engine.get_initial_state(scenarios[0], session_id)
            state_engine.load_scenario(session_id, scenarios)
            # 🚀 스택 매니저로 세션 초기화
            if state_engine.adapter and state_engine.adapter.handler_execution_engine and state_engine.adapter.handler_execution_engine.stack_manager:
                state_engine.adapter.handler_execution_engine.stack_manager.initialize_session(session_id, scenarios[0], initial_state)
        else:
            # 기존 세션에서 시나리오 가져오기
            if session_id in active_sessions:
                scenario = active_sessions[session_id].get("scenario")
                if scenario:
                    scenarios = scenario if isinstance(scenario, list) else [scenario]
                    initial_state = state_engine.get_initial_state(scenarios[0], session_id)
                    state_engine.load_scenario(session_id, scenarios)
                    # 🚀 스택 매니저로 세션 초기화
                    if state_engine.adapter and state_engine.adapter.handler_execution_engine and state_engine.adapter.handler_execution_engine.stack_manager:
                        state_engine.adapter.handler_execution_engine.stack_manager.initialize_session(session_id, scenarios[0], initial_state)
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
class MultiScenarioProcessInputRequest(ProcessInputRequest):
    scenario: Union[Dict[str, Any], List[Dict[str, Any]]] = Field(...)

@app.post("/api/process-input")
async def process_input(request: MultiScenarioProcessInputRequest):
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
    
    # 여러 시나리오 지원
    scenarios: List[Dict[str, Any]] = request.scenario if isinstance(request.scenario, list) else [request.scenario]
    if not scenarios:
        raise HTTPException(status_code=400, detail="No scenario(s) provided.")
    state_engine.load_scenario(request.sessionId, scenarios)
    
    # 입력 처리 (기존 state_engine은 텍스트를 기대하므로 변환)
    result = await state_engine.process_input_v2(
        session_id=request.sessionId,
        user_input=user_text,
        current_state=request.currentState,
        scenario=scenarios[0],
        memory=memory,
        event_type=request.eventType
    )
    
    # 세션 메모리 업데이트
    update_session_memory(request.sessionId, result.get("memory", memory))
    
    logger.info(f"📤 Processing result: {result}")
    return result

# 새로운 챗봇 입력 포맷을 지원하는 엔드포인트
class MultiScenarioChatbotProcessRequest(ChatbotProcessRequest):
    scenario: Union[Dict[str, Any], List[Dict[str, Any]]] = Field(...)

@app.post("/api/process-chatbot-input")
async def process_chatbot_input(request: MultiScenarioChatbotProcessRequest):
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
    
    scenarios: List[Dict[str, Any]] = request.scenario if isinstance(request.scenario, list) else [request.scenario]
    if scenarios:
        state_engine.load_scenario(request.sessionId, scenarios)
    else:
        scenario_loaded = state_engine.get_scenario(request.sessionId)
        if not scenario_loaded:
            raise HTTPException(status_code=400, detail="No scenario loaded for session and none provided.")
        scenarios = [scenario_loaded]
    
    # 입력 처리 (기존 state_engine은 텍스트를 기대하므로 변환)
    result = await state_engine.process_input_v2(
        session_id=request.sessionId,
        user_input=user_text,
        current_state=request.currentState,
        scenario=scenarios[0],
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
        scenario=scenarios[0],
        used_slots=None,  # TODO: 추후 구현
        event_type=request.eventType
    )
    
    logger.info(f"📤 Processing result: {chatbot_response.dict()}")
    return chatbot_response

# --- bdm-new compatible execute endpoint ---
from fastapi import Request as FastApiRequest

@app.post("/api/v1/execute")
async def execute_endpoint(req: FastApiRequest):
    try:
        payload = await req.json()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {str(e)}")

    user_id = payload.get("userId", "")
    bot_id = payload.get("botId", "")
    bot_version = payload.get("botVersion", "")
    session_id = payload.get("sessionId", str(uuid.uuid4()))
    request_id = payload.get("requestId", f"req-{uuid.uuid4().hex[:8]}")
    user_input = payload.get("userInput", {})
    context = payload.get("context", {})
    headers = payload.get("headers", {})

    # load scenario from SCENARIO_DIR if provided
    scenario = state_engine.get_scenario(session_id)
    if not scenario:
        if not SCENARIO_DIR:
            raise HTTPException(status_code=400, detail="SCENARIO_DIR is not set and no scenario loaded for session.")
        import os
        import json as _json
        file_name = f"{bot_id}-{bot_version}.json"
        file_path = os.path.join(SCENARIO_DIR, file_name)
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"Scenario file not found: {file_path}")
        with open(file_path, "r", encoding="utf-8") as f:
            scenario_data = _json.load(f)
        # support list or dict
        scenarios = scenario_data if isinstance(scenario_data, list) else [scenario_data]
        state_engine.load_scenario(session_id, scenarios)
        scenario = scenarios[0]

    # restore dialog memory/stack from context store
    context_key = f"{session_id}__bot_builder_dm"
    snapshot = await context_store.get(context_key)
    memory = get_or_create_session_memory(session_id)
    
    # 🚀 핵심 수정: 메모리 병합 로직 정리
    # 1. context_store에서 메모리 복원 (우선순위 1)
    if snapshot and isinstance(snapshot, dict):
        mem_data = snapshot.get("memory", {})
        if isinstance(mem_data, dict):
            memory.update(mem_data)
            logger.info(f"[MEMORY DEBUG] Restored from context_store: {list(mem_data.keys())}")
        # restore session stack if available
        stack_data = snapshot.get("stack")
        if isinstance(stack_data, list):
            state_engine.session_stacks[session_id] = stack_data
    
    # 2. active_sessions에서 메모리 병합 (우선순위 2)
    if session_id in active_sessions:
        previous_memory = active_sessions[session_id].get("memory", {})
        if previous_memory:
            # 기존 메모리를 보존하면서 새로운 메모리로 업데이트
            for key, value in previous_memory.items():
                if key not in memory:
                    memory[key] = value
            logger.info(f"[MEMORY DEBUG] Merged from active_sessions: {list(previous_memory.keys())}")
    
    logger.info(f"[MEMORY DEBUG] Final memory keys: {list(memory.keys())}")

    # hydrate metadata
    memory["sessionId"] = session_id
    memory["requestId"] = request_id
    memory["CHATBOT_METADATA"] = {
        "userId": user_id,
        "botId": bot_id,
        "botVersion": bot_version,
        "botName": payload.get("botName", ""),
        "botResourcePath": payload.get("botResourcePath"),
        "requestId": request_id,
        "context": context,
        "headers": headers,
    }

    # extract text
    text_input = ""
    if isinstance(user_input, dict) and user_input.get("type") == "text":
        content = user_input.get("content", {})
        text_input = content.get("text", "")
        if text_input.strip():
            memory["USER_TEXT_INPUT"] = [text_input.strip()]
        # NLU result passthrough if any
        if "nluResult" in content and content["nluResult"]:
            # 🚀 NLU_RESULT를 올바른 형식으로 변환
            nlu_result = content["nluResult"]
            if isinstance(nlu_result, dict) and "intent" in nlu_result:
                # 단순한 intent 형식을 NLU_RESULT 형식으로 변환
                memory["NLU_RESULT"] = {
                    "results": [{
                        "nluNbest": [{
                            "intent": nlu_result["intent"],
                            "entities": nlu_result.get("entities", [])
                        }]
                    }]
                }
            else:
                # 이미 올바른 형식인 경우 그대로 사용
                memory["NLU_RESULT"] = nlu_result
    elif isinstance(user_input, dict) and user_input.get("type") == "customEvent":
        content = user_input.get("content", {})
        memory["CUSTOM_EVENT"] = {
            "type": content.get("type", ""),
            "content": content,
        }

    # determine current state from request, stack, or initial
    current_info = state_engine.get_current_scenario_info(session_id)
    # 요청에서 받은 currentState를 우선적으로 사용
    current_state = payload.get("currentState") or current_info.get("dialogStateName") or state_engine.get_initial_state(scenario, session_id)
    
    # Debug: Log the current state for verification
    logger.info(f"[STATE DEBUG] Current state from stack: {current_state}, session: {session_id}")
    
    # 세션 스택 전체 상태 로깅
    session_stack = state_engine.get_scenario_stack(session_id)
    logger.info(f"[STATE DEBUG] Full session stack: {session_stack}")

    # process input
    result = await state_engine.process_input_v2(
        session_id=session_id,
        user_input=text_input,
        current_state=current_state,
        scenario=scenario,
        memory=memory,
        event_type=payload.get("eventType")
    )

    update_session_memory(session_id, result.get("memory", memory))
    # also update active session's current_state for quick inspection
    try:
        if session_id in active_sessions:
            active_sessions[session_id]["current_state"] = result.get("new_state", current_state)
    except Exception:
        pass

    # 🚀 핵심 수정: 메모리 저장 로직 정리
    # context_store에 최종 메모리와 스택 저장
    final_memory = active_sessions.get(session_id, {}).get("memory", {})
    final_stack = state_engine.session_stacks.get(session_id, [])
    
    await context_store.set(context_key, {
        "memory": final_memory,
        "stack": final_stack
    })
    
    logger.info(f"[MEMORY SAVE] Saved to context_store: {list(final_memory.keys())}")

    # build response using factory honoring botType
    chatbot_response = state_engine.create_chatbot_response(
        new_state=result.get("new_state", current_state),
        response_messages=[result.get("response", "")],
        intent=result.get("intent", ""),
        entities=result.get("entities", {}),
        memory=result.get("memory", memory),
        scenario=scenario,
        used_slots=None,
        event_type=payload.get("eventType")
    )

    return chatbot_response

# 기존 형식 지원을 위한 레거시 엔드포인트
class MultiScenarioLegacyProcessInputRequest(LegacyProcessInputRequest):
    scenario: Union[Dict[str, Any], List[Dict[str, Any]]] = Field(...)

@app.post("/api/process-input-legacy")
async def process_input_legacy(request: MultiScenarioLegacyProcessInputRequest):
    """
    기존 input 형식으로 사용자 입력을 처리하고 State 전이를 수행합니다. (호환성 유지)
    """
    logger.info(f"📥 Processing legacy input: session={request.sessionId}, state={request.currentState}, input='{request.input}', event={request.eventType}")
    
    # 세션 메모리 가져오기 또는 생성
    memory = get_or_create_session_memory(request.sessionId)
    
    # 세션 메모리에 사용자 입력 저장
    if request.input.strip():
        memory["USER_TEXT_INPUT"] = [request.input.strip()]
    
    scenarios: List[Dict[str, Any]] = request.scenario if isinstance(request.scenario, list) else [request.scenario]
    if not scenarios:
        raise HTTPException(status_code=400, detail="No scenario(s) provided.")
    state_engine.load_scenario(request.sessionId, scenarios)
    
    # 입력 처리
    result = await state_engine.process_input_v2(
        session_id=request.sessionId,
        user_input=request.input,
        current_state=request.currentState,
        scenario=scenarios[0],
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

@app.post("/api/proxy")
async def proxy_endpoint(request: Request):
    data = await request.json()
    endpoint = data.get("endpoint")
    payload = data.get("payload")
    logger.info(f"Proxy endpoint: {endpoint}")
    if not endpoint or not payload:
        return JSONResponse(status_code=400, content={"error": "endpoint와 payload가 필요합니다."})
    try:
        resp = requests.post(endpoint, json=payload, timeout=15)
        logger.info(f"Proxy response: {resp.json()}")
        return JSONResponse(status_code=resp.status_code, content=resp.json() if resp.headers.get('content-type', '').startswith('application/json') else {"raw": resp.text})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

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
