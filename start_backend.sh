#!/bin/bash

echo "🚀 StateCanvas Backend 시작 중..."

cd backend

# Python 가상환경 확인 및 생성
if [ ! -d "venv" ]; then
    echo "📦 가상환경 생성 중..."
    python3 -m venv venv
fi

# 가상환경 활성화
echo "🔧 가상환경 활성화 중..."
source venv/bin/activate

# 의존성 설치
echo "📚 의존성 설치 중..."
pip install -r requirements.txt

# FastAPI 서버 실행
echo "🌟 Backend 서버 실행 중..."
echo "API 문서: http://localhost:8000/docs"
echo "Backend API: http://localhost:8000"
echo ""
uvicorn main:app --reload --host 0.0.0.0 --port 8000 