#!/bin/bash
# 智能错题本 - 启动脚本
# 由 LaunchAgent 自动调用，用户登录时启动所有服务

PROJECT_DIR="/Users/doudou_files/Claude/mistake_notebook"
LOG_DIR="$PROJECT_DIR/backend/logs"
mkdir -p "$LOG_DIR"

# 记录启动时间
echo "=== $(date) 启动服务 ===" >> "$LOG_DIR/startup.log"

# 1. 启动后端
cd "$PROJECT_DIR/backend"
source venv/bin/activate
if pgrep -f "uvicorn app.main" > /dev/null; then
    echo "后端已在运行" >> "$LOG_DIR/startup.log"
else
    nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 > "$LOG_DIR/app.log" 2>&1 &
    echo "后端已启动 (PID: $!)" >> "$LOG_DIR/startup.log"
fi

# 2. 确保 Nginx 运行
if pgrep -x nginx > /dev/null; then
    echo "Nginx 已在运行" >> "$LOG_DIR/startup.log"
    # 确保配置最新
    nginx -s reload 2>/dev/null && echo "Nginx 配置已重载" >> "$LOG_DIR/startup.log"
else
    nginx 2>/dev/null && echo "Nginx 已启动" >> "$LOG_DIR/startup.log"
fi

echo "=== 启动完成 ===" >> "$LOG_DIR/startup.log"