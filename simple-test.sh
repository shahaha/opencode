#!/bin/bash
# 簡單的OpenCode AG-UI 區網測試腳本

echo "🧪 簡單區網測試"
echo "================"

# 設置環境變數
export JWT_SECRET="test_secret_$(date +%s)"
export POSTGRES_PASSWORD="test_password_$(date +%s)"
export HOST_IP="192.168.0.221"

echo "📋 測試配置:"
echo "   JWT_SECRET: 已設置"
echo "   POSTGRES_PASSWORD: 已設置"
echo "   HOST_IP: $HOST_IP"

# 測試Docker基本功能
echo -e "\n🔍 測試Docker功能:"
docker run --rm hello-world 2>/dev/null && echo "✅ Docker 運行正常" || echo "❌ Docker 運行異常"

# 測試端口可用性
echo -e "\n📊 檢查端口:"
for port in 8080 3001 5432 6379; do
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo "❌ 端口 $port 被佔用"
    else
        echo "✅ 端口 $port 可用"
    fi
done

# 提供手動測試指南
echo -e "\n📖 手動測試指南:"
echo "如果自動腳本有問題，請嘗試以下步驟:"
echo ""
echo "1. 清理舊容器:"
echo "   docker stop \$(docker ps -aq) 2>/dev/null || true"
echo "   docker rm \$(docker ps -aq) 2>/dev/null || true"
echo ""
echo "2. 手動啟動服務:"
echo "   # 啟動資料庫"
echo "   docker run -d --name opencode-postgres -e POSTGRES_PASSWORD=$POSTGRES_PASSWORD -p 5432:5432 postgres:15-alpine"
echo ""
echo "   # 啟動Redis"
echo "   docker run -d --name opencode-redis -p 6379:6379 redis:7-alpine"
echo ""
echo "   # 啟動後端"
echo "   docker run -d --name opencode-backend -p 3001:3000 --link opencode-postgres --link opencode-redis -e JWT_SECRET=$JWT_SECRET -e DATABASE_URL=postgresql://postgres:$POSTGRES_PASSWORD@opencode-postgres:5432/postgres opencode/backend:latest"
echo ""
echo "   # 啟動前端"
echo "   docker run -d --name opencode-frontend -p 8080:80 opencode/frontend:latest"
echo ""
echo "3. 測試訪問:"
echo "   curl http://localhost:8080/health"
echo "   curl http://localhost:3001/api/health"
echo ""
echo "4. 區網測試:"
echo "   curl http://$HOST_IP:8080/health"
echo "   curl http://$HOST_IP:3001/api/health"