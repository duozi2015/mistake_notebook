#!/bin/bash
set -e
PROJECT_DIR="/Users/doudou_files/claude/mistake_notebook"
cd "$PROJECT_DIR"
export $(grep -v '^#' .env 2>/dev/null | xargs)

# Fix expat compatibility issue on macOS with Python 3.12
export DYLD_LIBRARY_PATH="/opt/homebrew/Cellar/expat/2.8.2/lib:$DYLD_LIBRARY_PATH"

echo "=== 0. 创建日志目录 ==="
mkdir -p "$PROJECT_DIR/backend/logs"

echo "=== 1. 构建前端 ==="
cd frontend
npm install --silent
npm run build
echo "前端构建完成"

echo "=== 2. 停止旧后端 ==="
kill $(lsof -ti:8000) 2>/dev/null || true
sleep 1

echo "=== 3. 启动后端 ==="
cd "$PROJECT_DIR/backend"
source venv/bin/activate 2>/dev/null || (python3 -m venv venv && source venv/bin/activate)
pip install --upgrade pip -q
pip install -r requirements.txt -q
pip install bcrypt==4.0.1 httpx2 pytest -q
nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 > "$PROJECT_DIR/backend/logs/access.log" 2>&1 &
BACKEND_PID=$!
echo "后端 PID: $BACKEND_PID"

echo "=== 4. 启动 Nginx ==="
nginx -t 2>/dev/null && nginx 2>/dev/null || echo "nginx 已在运行或无需启动"

echo ""
echo "✅ 部署完成！"
echo "前端访问: http://localhost:2530"
echo "后端 API: http://localhost:8000"
echo "API 文档: http://localhost:8000/docs"
echo "首次使用: 访问 http://localhost:2530 → 注册账号 → 开始使用"