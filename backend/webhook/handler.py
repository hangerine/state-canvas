from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
import logging
import json
from datetime import datetime

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# webhook 전용 라우터 (v1)
webhook_router = APIRouter(prefix="/api/v1/webhook", tags=["webhook"])
# apicall 전용 라우터 (v1)
apicall_router = APIRouter(prefix="/api/v1/apicall", tags=["apicall"])
# legacy 호환 라우터 (/api/webhook/*)
legacy_webhook_router = APIRouter(prefix="/api/webhook", tags=["webhook-legacy"])

# 데이터 모델들
class WebhookRequest(BaseModel):
    """Webhook 요청 모델"""
    request: Optional[Dict[str, Any]] = None
    webhook: Optional[Dict[str, Any]] = None
    sessionId: Optional[str] = None
    requestId: Optional[str] = None
    userInput: Optional[Dict[str, Any]] = None
    text: Optional[str] = None

class WebhookResponse(BaseModel):
    """Webhook 응답 모델"""
    version: str = "1.0"
    responseStatus: str = "SUCCESS"
    memorySlots: Dict[str, Any]
    directives: List[Any] = []

def determine_nlu_intent(user_input: str) -> str:
    """사용자 입력에 따라 NLU Intent 결정"""
    if 'ACT_01_0212' in user_input or user_input == 'ACT_01_0212':
        return 'ACT_01_0212'
    elif 'ACT_01_0213' in user_input or user_input == 'ACT_01_0213':
        return 'ACT_01_0213'
    elif 'ACT_01_0235' in user_input or user_input == 'ACT_01_0235':
        return 'ACT_01_0235'
    else:
        # 기본값 또는 fallback
        return 'ACT_01_0235'

@webhook_router.post("")
async def handle_webhook(request: WebhookRequest):
    """POST /api/sentences/webhook 요청 처리"""
    try:
        # 요청에서 필요한 정보 추출
        session_id = request.request.get('sessionId', 'default-session') if request.request else 'default-session'
        request_id = request.request.get('requestId', 'default-request') if request.request else 'default-request'
        user_input = ""
        
        if request.request and request.request.get('userInput'):
            user_input = request.request['userInput'].get('content', {}).get('text', '')
        elif request.userInput:
            user_input = request.userInput.get('content', {}).get('text', '') if isinstance(request.userInput, dict) else str(request.userInput)
        elif request.text:
            user_input = request.text
        
        memory_slots = request.webhook.get('memorySlots', {}) if request.webhook else {}
        
        # 사용자 입력에 따른 NLU_INTENT 결정
        nlu_intent = determine_nlu_intent(user_input)
        
        # 응답 생성
        response = WebhookResponse(
            memorySlots={
                **memory_slots,
                "NLU_INTENT": {
                    "value": [nlu_intent]
                },
                "STS_CONFIDENCE": {
                    "value": ["0.7431283"]
                },
                "STS_IS_EXACT_MATCH": {
                    "value": ["false"]
                },
                "STS_REPR": {
                    "value": [""]
                },
                "USER_TEXT_INPUT": {
                    "value": [user_input]
                }
            }
        )
        
        # 로깅
        logger.info('=== Webhook Request ===')
        logger.info(f'Session ID: {session_id}')
        logger.info(f'Request ID: {request_id}')
        logger.info(f'User Input: {user_input}')
        logger.info(f'NLU Intent: {nlu_intent}')
        logger.info(f'Request Body: {json.dumps(request.dict(), indent=2)}')
        logger.info('=== Webhook Response ===')
        logger.info(json.dumps(response.dict(), indent=2))
        
        return response
        
    except Exception as e:
        logger.error(f"Webhook 처리 중 오류 발생: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@apicall_router.post("")
async def handle_apicall(request: WebhookRequest):
    """POST /apicall 요청 처리 (이전 버전 호환)"""
    try:
        # 요청에서 필요한 정보 추출
        session_id = request.sessionId or 'default-session'
        request_id = request.requestId or 'default-request'
        user_input = ""
        
        if request.userInput:
            user_input = request.userInput.get('content', {}).get('text', '') if isinstance(request.userInput, dict) else str(request.userInput)
        elif request.text:
            user_input = request.text
        
        # 사용자 입력에 따른 NLU_INTENT 결정
        nlu_intent = determine_nlu_intent(user_input)
        
        # 이전 버전 응답 형식
        response = {
            "version": "1.0",
            "responseStatus": "SUCCESS",
            "NLU_INTENT": {
                "value": [nlu_intent]
            },
            "STS_CONFIDENCE": {
                "value": ["0.7431283"]
            },
            "STS_IS_EXACT_MATCH": {
                "value": ["false"]
            },
            "STS_REPR": {
                "value": [""]
            },
            "USER_TEXT_INPUT": {
                "value": [user_input]
            },
            "directives": []
        }
        
        # 로깅
        logger.info('=== API Call Request (Legacy) ===')
        logger.info(f'Session ID: {session_id}')
        logger.info(f'Request ID: {request_id}')
        logger.info(f'User Input: {user_input}')
        logger.info(f'NLU Intent: {nlu_intent}')
        logger.info(f'Request Body: {json.dumps(request.dict(), indent=2)}')
        logger.info('=== API Call Response (Legacy) ===')
        logger.info(json.dumps(response, indent=2))
        
        return response
        
    except Exception as e:
        logger.error(f"API Call 처리 중 오류 발생: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@webhook_router.get("/health")
async def webhook_health_check():
    """Webhook 서비스 헬스체크"""
    return {"status": "healthy", "service": "webhook", "timestamp": datetime.now().isoformat()}

# --- Legacy-compatible routes ---

@legacy_webhook_router.get("/health")
async def legacy_webhook_health_check():
    return await webhook_health_check()

@legacy_webhook_router.post("/sentences/webhook")
async def legacy_handle_webhook(request: WebhookRequest):
    return await handle_webhook(request)

@legacy_webhook_router.post("/apicall")
async def legacy_handle_apicall(request: WebhookRequest):
    return await handle_apicall(request)

__all__ = ["webhook_router", "apicall_router", "legacy_webhook_router"]
