from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import json
import os
import logging
from datetime import datetime
import sqlite3
from contextlib import contextmanager

GREEN = "\033[92m"
RESET = "\033[0m"

class GreenFormatter(logging.Formatter):
    def format(self, record):
        message = super().format(record)
        return f"{GREEN}{message}{RESET}"

handler = logging.StreamHandler()
handler.setFormatter(GreenFormatter("%(asctime)s - %(levelname)s - %(message)s"))

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
logger.handlers = [handler]

router = APIRouter(prefix="/api/nlu", tags=["nlu"])

# 데이터 모델들
class Entity(BaseModel):
    """Entity 정보"""
    start: int
    end: int
    value: str
    entity_type: str
    role: Optional[str] = None
    normalization: Optional[str] = None

class TrainingUtterance(BaseModel):
    """학습용 발화 데이터"""
    id: Optional[int] = None
    text: str
    intent: str
    entities: List[Entity] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class DMIntentRule(BaseModel):
    """DM Intent 규칙"""
    id: Optional[int] = None
    name: str
    base_intent: str
    conditions: List[Dict[str, Any]]
    target_intent: str
    priority: int = 1
    active: bool = True
    created_at: Optional[datetime] = None

class NLURequest(BaseModel):
    """NLU 추론 요청"""
    text: str
    session_id: Optional[str] = None
    context: Optional[Dict[str, Any]] = None

class NLUResponse(BaseModel):
    """NLU 추론 응답"""
    intent: str
    confidence: float
    entities: List[Entity]
    dm_intent: Optional[str] = None
    processing_time_ms: int

# 데이터베이스 초기화
@contextmanager
def get_db():
    """SQLite 데이터베이스 연결"""
    db_path = os.path.join(os.path.dirname(__file__), 'data', 'nlu_training.db')
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

def init_database():
    """데이터베이스 테이블 초기화"""
    with get_db() as conn:
        # 학습 발화 테이블
        conn.execute('''
            CREATE TABLE IF NOT EXISTS training_utterances (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                text TEXT NOT NULL,
                intent TEXT NOT NULL,
                entities TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # DM Intent 규칙 테이블
        conn.execute('''
            CREATE TABLE IF NOT EXISTS dm_intent_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                base_intent TEXT NOT NULL,
                conditions TEXT NOT NULL,
                target_intent TEXT NOT NULL,
                priority INTEGER DEFAULT 1,
                active BOOLEAN DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.commit()

# 데이터베이스 초기화
init_database()

@router.get("/health")
async def health_check():
    """NLU 서비스 헬스체크"""
    return {"status": "healthy", "service": "nlu", "timestamp": datetime.now().isoformat()}

@router.get("/training/utterances", response_model=List[TrainingUtterance])
async def get_training_utterances(intent: Optional[str] = None, limit: int = 100):
    """학습 발화 목록 조회"""
    try:
        with get_db() as conn:
            query = "SELECT * FROM training_utterances"
            params = []
            
            if intent:
                query += " WHERE intent = ?"
                params.append(intent)
            
            query += " ORDER BY created_at DESC LIMIT ?"
            params.append(limit)
            
            cursor = conn.execute(query, params)
            rows = cursor.fetchall()
            
            utterances = []
            for row in rows:
                entities = json.loads(row['entities']) if row['entities'] else []
                utterance = TrainingUtterance(
                    id=row['id'],
                    text=row['text'],
                    intent=row['intent'],
                    entities=entities,
                    created_at=datetime.fromisoformat(row['created_at']),
                    updated_at=datetime.fromisoformat(row['updated_at'])
                )
                utterances.append(utterance)
            
            return utterances
    except Exception as e:
        logger.error(f"학습 발화 조회 중 오류: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/training/utterances", response_model=TrainingUtterance)
async def create_training_utterance(utterance: TrainingUtterance):
    """학습 발화 생성"""
    try:
        with get_db() as conn:
            entities_json = json.dumps([entity.dict() for entity in utterance.entities])
            cursor = conn.execute(
                "INSERT INTO training_utterances (text, intent, entities) VALUES (?, ?, ?)",
                (utterance.text, utterance.intent, entities_json)
            )
            conn.commit()
            
            # 생성된 발화 조회
            row = conn.execute(
                "SELECT * FROM training_utterances WHERE id = ?",
                (cursor.lastrowid,)
            ).fetchone()
            
            entities = json.loads(row['entities']) if row['entities'] else []
            return TrainingUtterance(
                id=row['id'],
                text=row['text'],
                intent=row['intent'],
                entities=entities,
                created_at=datetime.fromisoformat(row['created_at']),
                updated_at=datetime.fromisoformat(row['updated_at'])
            )
    except Exception as e:
        logger.error(f"학습 발화 생성 중 오류: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/training/utterances/{utterance_id}", response_model=TrainingUtterance)
async def update_training_utterance(utterance_id: int, utterance: TrainingUtterance):
    """학습 발화 수정"""
    try:
        with get_db() as conn:
            entities_json = json.dumps([entity.dict() for entity in utterance.entities])
            conn.execute(
                "UPDATE training_utterances SET text = ?, intent = ?, entities = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (utterance.text, utterance.intent, entities_json, utterance_id)
            )
            conn.commit()
            
            # 수정된 발화 조회
            row = conn.execute(
                "SELECT * FROM training_utterances WHERE id = ?",
                (utterance_id,)
            ).fetchone()
            
            if not row:
                raise HTTPException(status_code=404, detail="Utterance not found")
            
            entities = json.loads(row['entities']) if row['entities'] else []
            return TrainingUtterance(
                id=row['id'],
                text=row['text'],
                intent=row['intent'],
                entities=entities,
                created_at=datetime.fromisoformat(row['created_at']),
                updated_at=datetime.fromisoformat(row['updated_at'])
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"학습 발화 수정 중 오류: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/training/utterances/{utterance_id}")
async def delete_training_utterance(utterance_id: int):
    """학습 발화 삭제"""
    try:
        with get_db() as conn:
            result = conn.execute(
                "DELETE FROM training_utterances WHERE id = ?",
                (utterance_id,)
            )
            conn.commit()
            
            if result.rowcount == 0:
                raise HTTPException(status_code=404, detail="Utterance not found")
            
            return {"message": "Utterance deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"학습 발화 삭제 중 오류: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/dm-intents", response_model=List[DMIntentRule])
async def get_dm_intent_rules():
    """DM Intent 규칙 목록 조회"""
    try:
        with get_db() as conn:
            cursor = conn.execute("SELECT * FROM dm_intent_rules ORDER BY priority DESC, created_at DESC")
            rows = cursor.fetchall()
            
            rules = []
            for row in rows:
                conditions = json.loads(row['conditions'])
                rule = DMIntentRule(
                    id=row['id'],
                    name=row['name'],
                    base_intent=row['base_intent'],
                    conditions=conditions,
                    target_intent=row['target_intent'],
                    priority=row['priority'],
                    active=bool(row['active']),
                    created_at=datetime.fromisoformat(row['created_at'])
                )
                rules.append(rule)
            
            return rules
    except Exception as e:
        logger.error(f"DM Intent 규칙 조회 중 오류: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/dm-intents", response_model=DMIntentRule)
async def create_dm_intent_rule(rule: DMIntentRule):
    """DM Intent 규칙 생성"""
    try:
        with get_db() as conn:
            conditions_json = json.dumps(rule.conditions)
            cursor = conn.execute(
                "INSERT INTO dm_intent_rules (name, base_intent, conditions, target_intent, priority, active) VALUES (?, ?, ?, ?, ?, ?)",
                (rule.name, rule.base_intent, conditions_json, rule.target_intent, rule.priority, rule.active)
            )
            conn.commit()
            
            # 생성된 규칙 조회
            row = conn.execute(
                "SELECT * FROM dm_intent_rules WHERE id = ?",
                (cursor.lastrowid,)
            ).fetchone()
            
            conditions = json.loads(row['conditions'])
            return DMIntentRule(
                id=row['id'],
                name=row['name'],
                base_intent=row['base_intent'],
                conditions=conditions,
                target_intent=row['target_intent'],
                priority=row['priority'],
                active=bool(row['active']),
                created_at=datetime.fromisoformat(row['created_at'])
            )
    except Exception as e:
        logger.error(f"DM Intent 규칙 생성 중 오류: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/infer", response_model=NLUResponse)
async def infer_nlu(request: NLURequest):
    """NLU 추론"""
    import time
    start_time = time.time()
    
    try:
        # 기본 NLU 처리
        intent, confidence, entities = await perform_basic_nlu(request.text)
        
        # DM Intent 규칙 적용
        dm_intent = None
        if request.context:
            dm_intent = await apply_dm_intent_rules(intent, entities, request.context)
        
        processing_time = int((time.time() - start_time) * 1000)
        
        return NLUResponse(
            intent=intent,
            confidence=confidence,
            entities=entities,
            dm_intent=dm_intent,
            processing_time_ms=processing_time
        )
    except Exception as e:
        logger.error(f"NLU 추론 중 오류: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

async def perform_basic_nlu(text: str) -> tuple[str, float, List[Entity]]:
    """학습 데이터 기반 intent 및 entity 추출"""
    try:
        with get_db() as conn:
            cursor = conn.execute("SELECT id, text, intent FROM training_utterances")
            rows = cursor.fetchall()
            best_intent = "unknown"
            best_confidence = 0.0
            best_entities = []
            import json
            for row in rows:
                similarity = calculate_simple_similarity(text, row['text'])
                if similarity > best_confidence:
                    best_confidence = similarity
                    best_intent = row['intent']
                    # 해당 utterance의 entity 정보 가져오기
                    cursor2 = conn.execute("SELECT entities FROM training_utterances WHERE id = ?", (row['id'],))
                    entity_json = cursor2.fetchone()['entities']
                    if entity_json:
                        try:
                            entity_list = json.loads(entity_json)
                            best_entities = [Entity(**e) for e in entity_list]
                        except Exception:
                            best_entities = []
                    else:
                        best_entities = []
            return best_intent, best_confidence, best_entities
    except Exception as e:
        logger.error(f"기본 NLU 처리 중 오류: {str(e)}")
        return "unknown", 0.0, []

def calculate_simple_similarity(text1: str, text2: str) -> float:
    """간단한 텍스트 유사도 계산"""
    # 간단한 구현: 공통 단어 기반
    words1 = set(text1.lower().split())
    words2 = set(text2.lower().split())
    
    if not words1 or not words2:
        return 0.0
    
    intersection = words1.intersection(words2)
    union = words1.union(words2)
    
    return len(intersection) / len(union) if union else 0.0

async def apply_dm_intent_rules(intent: str, entities: List[Entity], context: Dict[str, Any]) -> Optional[str]:
    """DM Intent 규칙 적용"""
    try:
        with get_db() as conn:
            cursor = conn.execute(
                "SELECT * FROM dm_intent_rules WHERE base_intent = ? AND active = 1 ORDER BY priority DESC",
                (intent,)
            )
            rows = cursor.fetchall()
            
            for row in rows:
                conditions = json.loads(row['conditions'])
                if check_dm_conditions(conditions, entities, context):
                    return row['target_intent']
            
            return None
    except Exception as e:
        logger.error(f"DM Intent 규칙 적용 중 오류: {str(e)}")
        return None

def check_dm_conditions(conditions: List[Dict[str, Any]], entities: List[Entity], context: Dict[str, Any]) -> bool:
    """DM 조건 확인"""
    for condition in conditions:
        condition_type = condition.get('type')
        
        if condition_type == 'entity_exists':
            entity_type = condition.get('entity_type')
            if not any(entity.entity_type == entity_type for entity in entities):
                return False
        elif condition_type == 'context_value':
            key = condition.get('key')
            value = condition.get('value')
            if key is not None and context.get(key) != value:
                return False
    
    return True

@router.get("/intents")
async def get_intents():
    """Intent 목록 조회"""
    try:
        with get_db() as conn:
            cursor = conn.execute("SELECT DISTINCT intent FROM training_utterances")
            intents = [row['intent'] for row in cursor.fetchall()]
            return {"intents": intents}
    except Exception as e:
        logger.error(f"Intent 목록 조회 중 오류: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/entity-types")
async def get_entity_types():
    """Entity 타입 목록 조회"""
    try:
        with get_db() as conn:
            cursor = conn.execute("SELECT entities FROM training_utterances WHERE entities IS NOT NULL")
            entity_types = set()
            
            for row in cursor.fetchall():
                entities = json.loads(row['entities'])
                for entity in entities:
                    entity_types.add(entity.get('entity_type', ''))
            
            return {"entity_types": list(entity_types)}
    except Exception as e:
        logger.error(f"Entity 타입 목록 조회 중 오류: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))