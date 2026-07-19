#!/bin/bash
set -e
PROJECT_DIR="/Users/doudou_files/Claude/mistake_notebook"
cd "$PROJECT_DIR"
export $(grep -v '^#' .env 2>/dev/null | xargs)

echo "=== 0. 创建日志目录 ==="
mkdir -p "$PROJECT_DIR/backend/logs"

echo "=== 1. 构建前端 ==="
cd frontend
npm install --silent
npm run build
echo "前端构建完成"

echo "=== 2. 启动后端 ==="
cd "$PROJECT_DIR/backend"
source venv/bin/activate 2>/dev/null || python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt -q
nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 > "$PROJECT_DIR/backend/logs/access.log" 2>&1 &
BACKEND_PID=$!
echo "后端 PID: $BACKEND_PID"

echo "=== 3. 停止旧后端 ==="
kill $(lsof -ti:8000) 2>/dev/null || true

echo ""
echo "✅ 部署完成！"
echo "前端访问: http://localhost:2530"
echo "后端 API: http://localhost:8000"
echo "API 文档: http://localhost:8000/docs"
echo "首次使用: 访问 http://localhost:2530 → 注册账号 → 开始使用"