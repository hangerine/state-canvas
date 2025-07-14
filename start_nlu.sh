#!/bin/bash

echo "🚀 Starting NLU Service..."

# NLU 디렉토리로 이동
cd nlu

# 가상환경이 없으면 생성
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# 가상환경 활성화
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# 의존성 설치
echo "📋 Installing dependencies..."
pip install -r requirements.txt

# NLU 서버 실행
echo "🌐 Starting NLU server on port 8001..."
python main.py 