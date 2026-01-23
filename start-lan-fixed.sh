#!/bin/bash
# OpenCode AG-UI 修復版區網啟動腳本

set -e

echo "🌐 啟動 OpenCode AG-UI - 區網訪問 (修復版)"
echo "==========================================="

# 清除可能導致問題的環境變數
unset DOCKER_HOST

# 載入替代端口環境變數
if [ -f .env.lan.alt-ports ]; then
    # Use grep to filter out comments and empty lines
    export $(grep -v '^#' .env.lan.alt-ports | grep -v '^$' | xargs)
    echo "✅ 已載入替代端口配置"
else
    echo "❌ 找不到替代端口配置文件，請先運行 ./setup-lan.sh"
    exit 1
fi

# 檢查必要的環境變數
if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "change_this_secret_in_production" ]; then
    echo "⚠️  警告: JWT_SECRET 未設置或使用預設值"
    echo "請設置安全的JWT密鑰: export JWT_SECRET=your_secure_secret"
fi

if [ -z "$POSTGRES_PASSWORD" ] || [ "$POSTGRES_PASSWORD" = "change_this_password" ]; then
    echo "⚠️  警告: POSTGRES_PASSWORD 未設置或使用預設值"
    echo "請設置安全的資料庫密碼: export POSTGRES_PASSWORD=your_secure_password"
fi

# 檢查端口可用性
echo "🔍 檢查端口可用性..."
if lsof -Pi :8080 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "❌ 端口8080已被佔用，請選擇其他端口"
    exit 1
fi

if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "❌ 端口3001已被佔用，請選擇其他端口"
    exit 1
fi

echo "✅ 端口檢查通過"

# 停止現有服務
echo "🛑 停止現有服務..."
docker-compose -f docker-compose.lan.alt-ports.yml down 2>/dev/null || true

# 清理資源
echo "🧹 清理資源..."
docker system prune -f >/dev/null 2>&1 || true

# 啟動服務
echo "▶️  啟動替代端口服務..."
docker-compose -f docker-compose.lan.alt-ports.yml up -d

# 等待服務啟動
echo "⏳ 等待服務啟動..."
sleep 30

# 健康檢查
echo "🏥 執行健康檢查..."

# 檢查後端
if curl -s -f --max-time 10 http://$HOST_IP:3001/api/health >/dev/null 2>&1; then
    echo "✅ 後端服務正常: http://$HOST_IP:3001"
else
    echo "❌ 後端服務異常"
    echo "檢查日誌: docker-compose -f docker-compose.lan.alt-ports.yml logs opencode-backend"
fi

# 檢查前端
if curl -s -f --max-time 10 http://$HOST_IP:8080/health >/dev/null 2>&1; then
    echo "✅ 前端服務正常: http://$HOST_IP:8080"
else
    echo "❌ 前端服務異常"
    echo "檢查日誌: docker-compose -f docker-compose.lan.alt-ports.yml logs opencode-frontend"
fi

echo ""
echo "🎉 修復版部署完成！"
echo ""
echo "🌐 訪問地址:"
echo "   前端應用: http://$HOST_IP:8080"
echo "   後端API: http://$HOST_IP:3001"
echo "   AG-UI聊天: http://$HOST_IP:8080/agent-chat/test-session"
echo ""
echo "📋 管理命令:"
echo "   查看狀態: docker-compose -f docker-compose.lan.alt-ports.yml ps"
echo "   查看日誌: docker-compose -f docker-compose.lan.alt-ports.yml logs -f"
echo "   停止服務: docker-compose -f docker-compose.lan.alt-ports.yml down"
echo ""
echo "🔒 安全提醒:"
echo "   請確保區網環境安全"
echo "   定期更新密碼和密鑰"
echo "   監控網路訪問日誌"
