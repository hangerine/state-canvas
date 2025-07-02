# StateCanvas

StateCanvas는 JSON 기반 시나리오 파일을 시각적인 State Flow로 표현하고, State 전이를 처리할 수 있는 웹 애플리케이션입니다.

## 프로젝트 구조

```
StateCanvas/
├── frontend/              # React + TypeScript 프론트엔드
│   ├── src/
│   │   ├── components/    # React 컴포넌트
│   │   ├── types/         # TypeScript 타입 정의
│   │   ├── services/      # API 서비스
│   │   └── hooks/         # Custom hooks
│   ├── package.json
│   └── tsconfig.json
├── backend/               # FastAPI 백엔드
│   ├── models/           # 데이터 모델
│   ├── services/         # 비즈니스 로직
│   ├── main.py          # FastAPI 메인 애플리케이션
│   └── requirements.txt
├── example_scenario.json # 테스트용 시나리오 파일
└── README.md
```

## 주요 기능

### Frontend
- State flow 시각화 (React Flow 사용)
- JSON 시나리오 파일 업로드/다운로드
- 노드 속성 편집 Form (Sidebar)
- Canvas에서 드래그 앤 드롭으로 State 편집
- 실시간 State 전이 시각화
- 시나리오 테스트 모드
- JSON validation

### Backend
- JSON 시나리오 파일 처리 및 validation
- State Engine - 전이 조건 처리
  - Intent Handler (인텐트 기반 전이)
  - Condition Handler (조건 기반 전이)  
  - Event Handler (이벤트 기반 전이)
  - Slot Filling 처리
  - Entry Action 실행
- WebSocket을 통한 실시간 상태 업데이트
- 파일 업로드/다운로드 API
- 세션 기반 상태 관리

## 설치 및 실행

### 사전 요구사항
- Node.js 16+ (Frontend)
- Python 3.8+ (Backend)

### 1. Backend 실행
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Backend는 http://localhost:8000 에서 실행됩니다.

### 2. Frontend 실행
```bash
cd frontend
# Node.js가 설치된 경우
npm install
npm start

# 또는 yarn 사용
yarn install
yarn start
```

Frontend는 http://localhost:3000 에서 실행됩니다.

## 사용법

### 1. 시나리오 로드
- 좌측 Sidebar에서 "업로드" 버튼 클릭
- `example_scenario.json` 파일 선택
- 시나리오가 Canvas에 Flow 형태로 시각화됨

### 2. State Flow 탐색
- Canvas에서 노드를 클릭하여 상세 정보 확인
- 우측 하단 "테스트 모드 ON" 버튼으로 테스트 시작
- 테스트 패널에서 메시지 입력하여 State 전이 확인

### 3. 테스트 예시
시나리오 로드 후 테스트 모드에서 다음과 같이 입력해보세요:

1. "날씨" 입력 → Weather.Inform 인텐트로 weather_inform_response 상태로 전이
2. "서울" 입력 → CITY 슬롯 채움, slot_filled_response 상태로 전이
3. "긍정" 입력 → Positive 인텐트로 positive_sentence_response 상태로 전이
4. "네" 입력 → say.yes 인텐트로 sts_router 상태로 전이

## API 문서

Backend가 실행 중일 때 http://localhost:8000/docs 에서 Swagger UI를 통해 API 문서를 확인할 수 있습니다.

### 주요 API 엔드포인트
- `POST /api/upload-scenario` - 시나리오 파일 업로드
- `GET /api/download-scenario/{session_id}` - 시나리오 파일 다운로드
- `POST /api/process-input` - 사용자 입력 처리 및 State 전이
- `GET /api/sessions` - 활성 세션 목록 조회
- `WebSocket /ws/{session_id}` - 실시간 상태 업데이트

## 기술 스택

### Frontend
- **React 18** + **TypeScript** - UI 프레임워크
- **React Flow** - 플로우차트 시각화
- **Material-UI** - UI 컴포넌트 라이브러리
- **Axios** - HTTP 클라이언트

### Backend
- **FastAPI** - Python 웹 프레임워크
- **Pydantic** - 데이터 validation
- **WebSocket** - 실시간 통신
- **Uvicorn** - ASGI 서버

## 프로젝트 특징

### State Engine
- JSON 시나리오 기반 State 전이 엔진
- 조건식 평가 (메모리 변수 치환)
- NLU 시뮬레이션 (키워드 기반)
- Slot Filling 처리
- Entry Action 실행 (메시지 추출)

### 실시간 시각화
- WebSocket을 통한 실시간 State 전이 표시
- Canvas에서 현재 활성 상태 하이라이트
- 전이 과정 로그 표시

### 확장성
- 모듈형 컴포넌트 구조
- 플러그인 방식의 핸들러 시스템
- TypeScript를 통한 타입 안정성 