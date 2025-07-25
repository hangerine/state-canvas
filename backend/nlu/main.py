from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
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

app = FastAPI(title="NLU Service", version="1.0.0")

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    conn = sqlite3.connect('nlu/data/nlu_training.db')
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

# 애플리케이션 시작 시 DB 초기화
@app.on_event("startup")
async def startup_event():
    """서버 시작 시 실행"""
    os.makedirs('nlu/data', exist_ok=True)
    init_database()
    logger.info("NLU Service started")

# Health Check
@app.get("/health")
async def health_check():
    """서비스 상태 확인"""
    return {"status": "healthy", "service": "NLU"}

# 학습 데이터 관리 API
@app.get("/api/training/utterances", response_model=List[TrainingUtterance])
async def get_training_utterances(intent: Optional[str] = None, limit: int = 100):
    """학습 발화 목록 조회"""
    with get_db() as conn:
        if intent:
            cursor = conn.execute(
                "SELECT * FROM training_utterances WHERE intent = ? ORDER BY created_at DESC LIMIT ?",
                (intent, limit)
            )
        else:
            cursor = conn.execute(
                "SELECT * FROM training_utterances ORDER BY created_at DESC LIMIT ?",
                (limit,)
            )
        
        utterances = []
        for row in cursor.fetchall():
            entities = json.loads(row['entities']) if row['entities'] else []
            utterances.append(TrainingUtterance(
                id=row['id'],
                text=row['text'],
                intent=row['intent'],
                entities=entities,
                created_at=datetime.fromisoformat(row['created_at']),
                updated_at=datetime.fromisoformat(row['updated_at']) if row['updated_at'] else None
            ))
        
        return utterances

@app.post("/api/training/utterances", response_model=TrainingUtterance)
async def create_training_utterance(utterance: TrainingUtterance):
    """새 학습 발화 추가"""
    with get_db() as conn:
        entities_json = json.dumps([entity.dict() for entity in utterance.entities])
        cursor = conn.execute(
            "INSERT INTO training_utterances (text, intent, entities) VALUES (?, ?, ?)",
            (utterance.text, utterance.intent, entities_json)
        )
        utterance_id = cursor.lastrowid
        conn.commit()
        
        # 생성된 발화 반환
        cursor = conn.execute(
            "SELECT * FROM training_utterances WHERE id = ?",
            (utterance_id,)
        )
        row = cursor.fetchone()
        
        return TrainingUtterance(
            id=row['id'],
            text=row['text'],
            intent=row['intent'],
            entities=json.loads(row['entities']) if row['entities'] else [],
            created_at=datetime.fromisoformat(row['created_at'])
        )

@app.put("/api/training/utterances/{utterance_id}", response_model=TrainingUtterance)
async def update_training_utterance(utterance_id: int, utterance: TrainingUtterance):
    """학습 발화 수정"""
    with get_db() as conn:
        entities_json = json.dumps([entity.dict() for entity in utterance.entities])
        conn.execute(
            "UPDATE training_utterances SET text = ?, intent = ?, entities = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (utterance.text, utterance.intent, entities_json, utterance_id)
        )
        conn.commit()
        
        if conn.total_changes == 0:
            raise HTTPException(status_code=404, detail="Utterance not found")
        
        # 수정된 발화 반환
        cursor = conn.execute(
            "SELECT * FROM training_utterances WHERE id = ?",
            (utterance_id,)
        )
        row = cursor.fetchone()
        
        return TrainingUtterance(
            id=row['id'],
            text=row['text'],
            intent=row['intent'],
            entities=json.loads(row['entities']) if row['entities'] else [],
            created_at=datetime.fromisoformat(row['created_at']),
            updated_at=datetime.fromisoformat(row['updated_at']) if row['updated_at'] else None
        )

@app.delete("/api/training/utterances/{utterance_id}")
async def delete_training_utterance(utterance_id: int):
    """학습 발화 삭제"""
    with get_db() as conn:
        conn.execute("DELETE FROM training_utterances WHERE id = ?", (utterance_id,))
        conn.commit()
        
        if conn.total_changes == 0:
            raise HTTPException(status_code=404, detail="Utterance not found")
        
        return {"message": "Utterance deleted successfully"}

# DM Intent 관리 API
@app.get("/api/dm-intents", response_model=List[DMIntentRule])
async def get_dm_intent_rules():
    """DM Intent 규칙 목록 조회"""
    with get_db() as conn:
        cursor = conn.execute(
            "SELECT * FROM dm_intent_rules ORDER BY priority DESC, created_at DESC"
        )
        
        rules = []
        for row in cursor.fetchall():
            rules.append(DMIntentRule(
                id=row['id'],
                name=row['name'],
                base_intent=row['base_intent'],
                conditions=json.loads(row['conditions']),
                target_intent=row['target_intent'],
                priority=row['priority'],
                active=bool(row['active']),
                created_at=datetime.fromisoformat(row['created_at'])
            ))
        
        return rules

@app.post("/api/dm-intents", response_model=DMIntentRule)
async def create_dm_intent_rule(rule: DMIntentRule):
    """새 DM Intent 규칙 추가"""
    with get_db() as conn:
        conditions_json = json.dumps(rule.conditions)
        cursor = conn.execute(
            "INSERT INTO dm_intent_rules (name, base_intent, conditions, target_intent, priority, active) VALUES (?, ?, ?, ?, ?, ?)",
            (rule.name, rule.base_intent, conditions_json, rule.target_intent, rule.priority, rule.active)
        )
        rule_id = cursor.lastrowid
        conn.commit()
        
        # 생성된 규칙 반환
        cursor = conn.execute(
            "SELECT * FROM dm_intent_rules WHERE id = ?",
            (rule_id,)
        )
        row = cursor.fetchone()
        
        return DMIntentRule(
            id=row['id'],
            name=row['name'],
            base_intent=row['base_intent'],
            conditions=json.loads(row['conditions']),
            target_intent=row['target_intent'],
            priority=row['priority'],
            active=bool(row['active']),
            created_at=datetime.fromisoformat(row['created_at'])
        )

# NLU 추론 API
@app.post("/api/infer", response_model=NLUResponse)
async def infer_nlu(request: NLURequest):
    """NLU 추론 수행"""
    start_time = datetime.now()
    
    # 1. 기본 NLU 추론 (간단한 규칙 기반)
    intent, confidence, entities = await perform_basic_nlu(request.text)
    
    # 2. DM Intent 규칙 적용
    dm_intent = await apply_dm_intent_rules(intent, entities, request.context or {})
    
    processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
    
    return NLUResponse(
        intent=intent,
        confidence=confidence,
        entities=entities,
        dm_intent=dm_intent,
        processing_time_ms=processing_time
    )

async def perform_basic_nlu(text: str) -> tuple[str, float, List[Entity]]:
    """학습 데이터 기반 intent 및 entity 추출"""
    text_lower = text.lower()
    best_intent = "Fallback.Unknown"
    best_confidence = 0.1
    best_entities = []

    with get_db() as conn:
        cursor = conn.execute("SELECT id, text, intent FROM training_utterances")
        rows = cursor.fetchall()
        for row in rows:
            training_text = row['text']
            similarity = calculate_simple_similarity(text_lower, training_text.lower())
            if similarity > best_confidence:
                best_intent = row['intent']
                best_confidence = similarity
                # 해당 utterance의 entity 정보 가져오기
                cursor2 = conn.execute("SELECT entities FROM training_utterances WHERE id = ?", (row['id'],))
                entity_json = cursor2.fetchone()['entities']
                import json
                if entity_json:
                    # entity_json이 문자열일 경우 파싱
                    try:
                        entity_list = json.loads(entity_json)
                        # Entity 객체로 변환
                        best_entities = [Entity(**e) for e in entity_list]
                    except Exception:
                        best_entities = []
                else:
                    best_entities = []
    return best_intent, min(best_confidence, 0.95), best_entities

def calculate_simple_similarity(text1: str, text2: str) -> float:
    """간단한 단어 기반 유사도 계산"""
    words1 = set(text1.split())
    words2 = set(text2.split())
    
    if not words1 and not words2:
        return 1.0
    if not words1 or not words2:
        return 0.0
    
    intersection = words1.intersection(words2)
    union = words1.union(words2)
    
    return len(intersection) / len(union)

async def apply_dm_intent_rules(intent: str, entities: List[Entity], context: Dict[str, Any]) -> Optional[str]:
    """DM Intent 규칙 적용"""
    with get_db() as conn:
        cursor = conn.execute(
            "SELECT * FROM dm_intent_rules WHERE base_intent = ? AND active = 1 ORDER BY priority DESC",
            (intent,)
        )
        
        for row in cursor.fetchall():
            conditions = json.loads(row['conditions'])
            
            # 조건 확인
            if check_dm_conditions(conditions, entities, context):
                return row['target_intent']
    
    return None

def check_dm_conditions(conditions: List[Dict[str, Any]], entities: List[Entity], context: Dict[str, Any]) -> bool:
    """DM Intent 조건 확인"""
    for condition in conditions:
        condition_type = condition.get('type')
        
        if condition_type == 'entity_present':
            entity_type = condition.get('entity_type')
            if not any(e.entity_type == entity_type for e in entities):
                return False
        
        elif condition_type == 'context_value':
            key = condition.get('key')
            expected_value = condition.get('value')
            if key is not None and context.get(key) != expected_value:
                return False
        
        # 다른 조건 타입들도 여기에 추가
    
    return True

# Intent 목록 조회 API
@app.get("/api/intents")
async def get_intents():
    """등록된 Intent 목록 조회"""
    with get_db() as conn:
        cursor = conn.execute("SELECT DISTINCT intent FROM training_utterances ORDER BY intent")
        intents = [row['intent'] for row in cursor.fetchall()]
        return {"intents": intents}

# Entity 타입 목록 조회 API
@app.get("/api/entity-types")
async def get_entity_types():
    """등록된 Entity 타입 목록 조회"""
    entity_types = ["CITY", "PERSON", "DATE", "TIME", "NUMBER", "PHONE", "EMAIL"]
    return {"entity_types": entity_types}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001) 