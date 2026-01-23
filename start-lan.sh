#!/bin/bash
# 啟動區網版本的OpenCode AG-UI

set -e

echo "🌐 啟動 OpenCode AG-UI - 區網訪問模式"
echo "======================================"

# 載入區網環境變數
if [ -f .env.lan ]; then
    export $(cat .env.lan | xargs)
    echo "✅ 已載入區網配置"
else
    echo "❌ 找不到區網配置文件，請先運行 setup-lan.sh"
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

# 停止現有服務
echo "🛑 停止現有服務..."
docker-compose -f docker-compose.lan.yml down 2>/dev/null || true

# 清理資源
echo "🧹 清理資源..."
docker system prune -f >/dev/null 2>&1 || true

# 啟動服務
echo "▶️  啟動區網服務..."
docker-compose -f docker-compose.lan.yml up -d

# 等待服務啟動
echo "⏳ 等待服務啟動..."
sleep 20

# 健康檢查
echo "🏥 執行健康檢查..."

# 檢查後端
if curl -s -f http://$HOST_IP:3000/api/health >/dev/null 2>&1; then
    echo "✅ 後端服務正常: http://$HOST_IP:3000"
else
    echo "❌ 後端服務異常"
fi

# 檢查前端
if curl -s -f http://$HOST_IP/health >/dev/null 2>&1; then
    echo "✅ 前端服務正常: http://$HOST_IP"
else
    echo "❌ 前端服務異常"
fi

echo ""
echo "🎉 區網部署完成！"
echo "🌐 訪問地址:"
echo "   前端應用: http://$HOST_IP"
echo "   後端API: http://$HOST_IP:3000"
echo "   AG-UI聊天: http://$HOST_IP/agent-chat/test-session"
echo ""
echo "📋 管理命令:"
echo "   查看狀態: docker-compose -f docker-compose.lan.yml ps"
echo "   查看日誌: docker-compose -f docker-compose.lan.yml logs -f"
echo "   停止服務: docker-compose -f docker-compose.lan.yml down"
echo ""
echo "🔒 安全提醒:"
echo "   請確保區網環境安全"
echo "   定期更新密碼和密鑰"
echo "   監控網路訪問日誌"
