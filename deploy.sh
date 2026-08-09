#!/bin/bash
# 智能错题本 - 一键部署脚本（含家长作业打卡模块）
# 安全流程：① 部署前备份数据库 → ② 构建前端 → ③ 停止旧后端 → ④ 显式数据库升级(增量/幂等/非破坏) → ⑤ 启动后端 → ⑥ 启动 nginx
set -e

PROJECT_DIR="/Users/doudou_files/claude/mistake_notebook"
cd "$PROJECT_DIR"
export $(grep -v '^#' .env 2>/dev/null | xargs)

# Fix expat compatibility issue on macOS with Python 3.12
export DYLD_LIBRARY_PATH="/opt/homebrew/Cellar/expat/2.8.2/lib:$DYLD_LIBRARY_PATH"

DB_PATH="$PROJECT_DIR/backend/data/mistake_notebook.db"
BACKUP_DIR="$PROJECT_DIR/backend/data/backups"

echo "=== 0. 创建日志目录 ==="
mkdir -p "$PROJECT_DIR/backend/logs"

echo "=== 0.5 备份数据库（部署前，安全在线备份，不影响正在运行的服务） ==="
if [ -f "$DB_PATH" ]; then
    mkdir -p "$BACKUP_DIR"
    STAMP=$(date +%Y%m%d_%H%M%S)
    sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/deploy_$STAMP.db'"
    echo "✅ 已备份: deploy_$STAMP.db"
    # 部署备份保留最近 15 份，第 16 份起删除最旧
    ls -1t "$BACKUP_DIR"/deploy_*.db 2>/dev/null | tail -n +16 | xargs -r rm -f || true
    echo "   部署备份当前保留 $(ls -1 "$BACKUP_DIR"/deploy_*.db 2>/dev/null | wc -l | tr -d ' ') 份"
else
    echo "⚠️ 未找到数据库，跳过备份（首次部署）"
fi

echo "=== 1. 构建前端 ==="
cd frontend
npm install --silent
npm run build
cd "$PROJECT_DIR"

echo "=== 2. 停止旧后端 ==="
kill $(lsof -ti:8000) 2>/dev/null || true
sleep 1

echo "=== 3. 数据库升级（增量、幂等、非破坏，不影响存量数据） ==="
cd "$PROJECT_DIR/backend"
source venv/bin/activate 2>/dev/null || (python3 -m venv venv && source venv/bin/activate)
pip install --upgrade pip -q
pip install -r requirements.txt -q
pip install bcrypt==4.0.1 httpx2 pytest -q

# 3.1 数据库完整性预检
echo "--- 数据库完整性预检 ---"
CHK=$(sqlite3 "$DB_PATH" "PRAGMA integrity_check;" 2>/dev/null | head -1)
echo "integrity_check: ${CHK:-文件不存在或非数据库}"

# 3.2 记录迁移前存量用户数（验证升级不丢失数据）
if [ -f "$DB_PATH" ]; then
    BEFORE=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM users;" 2>/dev/null || echo "表不存在")
else
    BEFORE="表不存在"
fi
echo "迁移前 users 行数: $BEFORE"

# 3.3 执行迁移（create_all 新表 + ALTER 存量表加列，均幂等）
python - <<'PY'
from app.database import engine
from app.migrations import run_migrations
applied = run_migrations(engine)
print("迁移完成。本次新增列:", applied if applied else "无（库已是最新）")
PY

# 3.4 校验迁移后存量数据未受影响
AFTER=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM users;" 2>/dev/null || echo "表不存在")
echo "迁移后 users 行数: $AFTER"
if [ "$BEFORE" = "$AFTER" ] && [ "$BEFORE" != "表不存在" ]; then
    echo "✅ 存量用户数未变化（$BEFORE），升级未影响现有数据"
elif [ "$BEFORE" = "表不存在" ]; then
    echo "ℹ️ 全新数据库（无存量数据），已创建完整结构"
else
    echo "⚠️ 注意：users 行数变化 $BEFORE → $AFTER，请人工核查"
fi

echo "=== 4. 启动后端 ==="
nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 > "$PROJECT_DIR/backend/logs/access.log" 2>&1 &
BACKEND_PID=$!
echo "后端 PID: $BACKEND_PID"

echo "=== 5. 启动 Nginx ==="
nginx -t 2>/dev/null && nginx 2>/dev/null || echo "nginx 已在运行或无需启动"

echo ""
echo "✅ 部署完成！"
echo "前端访问: http://localhost:2530"
echo "后端 API: http://localhost:8000"
echo "API 文档: http://localhost:8000/docs"
echo "部署备份位于: $BACKUP_DIR"
