#!/bin/bash
echo "=== 停止后端 ==="
pkill -f "uvicorn app.main" 2>/dev/null && echo "后端已停止" || echo "后端未运行"
echo "=== 停止 Nginx ==="
sudo nginx -s stop 2>/dev/null && echo "Nginx 已停止" || echo "Nginx 未运行"
echo "服务已全部停止"