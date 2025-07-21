#!/bin/bash

# 가상환경 활성화
if [ ! -d "backend/venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv backend/venv
fi

source backend/venv/bin/activate

# pytest-asyncio 설치 보장
pip install -q pytest pytest-asyncio

# 테스트 실행
echo "🚀 Running backend tests..."
PYTHONPATH=backend pytest backend/tests 