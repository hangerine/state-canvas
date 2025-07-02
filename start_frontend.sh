#!/bin/bash

echo "🎨 StateCanvas Frontend 시작 중..."

cd frontend

# Node.js 설치 확인
if ! command -v node &> /dev/null; then
    echo "❌ Node.js가 설치되지 않았습니다."
    echo "Node.js를 설치한 후 다시 시도해주세요."
    echo "설치 방법: https://nodejs.org/"
    exit 1
fi

# npm install
if [ ! -d "node_modules" ]; then
    echo "📦 의존성 설치 중..."
    npm install
fi

# React 개발 서버 실행
echo "🌟 Frontend 서버 실행 중..."
echo "Frontend: http://localhost:3000"
echo ""
npm start 