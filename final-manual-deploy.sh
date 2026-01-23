#!/bin/bash
# OpenCode AG-UI 最終解決方案 - 手動Docker啟動

set -e

echo "🚀 OpenCode AG-UI 最終解決方案"
echo "================================"

# 設置環境變數
export JWT_SECRET="${JWT_SECRET:-final_test_secret_$(date +%s)}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-final_test_password_$(date +%s)}"
export HOST_IP="${HOST_IP:-192.168.0.221}"

echo "📋 配置信息:"
echo "   JWT_SECRET: 已設置"
echo "   POSTGRES_PASSWORD: 已設置"
echo "   HOST_IP: $HOST_IP"

# 停止所有相關容器
echo -e "\n🛑 清理現有容器..."
docker stop opencode-frontend-lan-alt opencode-backend-lan-alt opencode-postgres-lan-alt opencode-redis-lan-alt 2>/dev/null || true
docker rm opencode-frontend-lan-alt opencode-backend-lan-alt opencode-postgres-lan-alt opencode-redis-lan-alt 2>/dev/null || true

# 清理網路
docker network rm opencode-lan-network 2>/dev/null || true

# 創建網路
echo -e "\n🌐 創建Docker網路..."
docker network create opencode-lan-network --driver bridge --subnet=172.25.0.0/16

# 啟動PostgreSQL
echo -e "\n🐘 啟動PostgreSQL資料庫..."
docker run -d \
  --name opencode-postgres-lan-alt \
  --network opencode-lan-network \
  --ip 172.25.0.10 \
  -e POSTGRES_DB=opencode \
  -e POSTGRES_USER=opencode \
  -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  -p 5433:5432 \
  --restart unless-stopped \
  postgres:15-alpine

# 等待資料庫啟動
echo "⏳ 等待PostgreSQL啟動..."
sleep 10

# 測試資料庫連接
if docker exec opencode-postgres-lan-alt pg_isready -U opencode -d opencode >/dev/null 2>&1; then
    echo "✅ PostgreSQL 連接正常"
else
    echo "❌ PostgreSQL 連接失敗，檢查日誌:"
    docker logs opencode-postgres-lan-alt
    exit 1
fi

# 啟動Redis
echo -e "\n🔴 啟動Redis快取..."
docker run -d \
  --name opencode-redis-lan-alt \
  --network opencode-lan-network \
  --ip 172.25.0.11 \
  -p 6381:6379 \
  --restart unless-stopped \
  redis:7-alpine redis-server --appendonly yes

# 測試Redis連接
if docker exec opencode-redis-lan-alt redis-cli ping | grep -q PONG; then
    echo "✅ Redis 連接正常"
else
    echo "❌ Redis 連接失敗"
    exit 1
fi

# 檢查鏡像是否存在
echo -e "\n🔍 檢查Docker鏡像..."

# 嘗試構建鏡像（如果不存在）
if ! docker images | grep -q "opencode/backend"; then
    echo "🔨 構建後端鏡像..."
    cd packages/opencode
    docker build -t opencode/backend:latest . || {
        echo "❌ 後端鏡像構建失敗"
        echo "請確保後端代碼正確"
        exit 1
    }
    cd ../..
fi

if ! docker images | grep -q "opencode/frontend"; then
    echo "🔨 構建前端鏡像..."

    # Build Docker image (includes frontend build inside container) from root context
    docker build -t opencode/frontend:latest . -f packages/console/app/Dockerfile || {
        echo "❌ 前端鏡像構建失敗"
        exit 1
    }
fi

# 啟動後端服務
echo -e "\n🚀 啟動後端API服務..."
docker run -d \
  --name opencode-backend-lan-alt \
  --network opencode-lan-network \
  --ip 172.25.0.12 \
   -p $HOST_IP:4000:3000 \
  -e NODE_ENV=production \
  -e HOST=0.0.0.0 \
  -e PORT=3000 \
  -e DATABASE_URL="postgresql://opencode:$POSTGRES_PASSWORD@opencode-postgres-lan-alt:5432/opencode" \
  -e REDIS_URL="redis://opencode-redis-lan-alt:6379" \
  -e JWT_SECRET="$JWT_SECRET" \
  --restart unless-stopped \
  opencode/backend:latest

# 等待後端啟動
echo "⏳ 等待後端服務啟動..."
sleep 15

# 測試後端健康檢查
echo -e "\n🏥 測試後端服務..."
if curl -s -f --max-time 10 http://$HOST_IP:4000 >/dev/null 2>&1; then
    echo "✅ 後端服務健康檢查通過: http://$HOST_IP:4000"
else
    echo "❌ 後端服務健康檢查失敗"
    echo "檢查後端日誌:"
    docker logs opencode-backend-lan-alt | tail -20
    exit 1
fi

# 啟動前端服務
echo -e "\n🌐 啟動前端應用服務..."
docker run -d \
  --name opencode-frontend-lan-alt \
  --network opencode-lan-network \
  --ip 172.25.0.13 \
  -p $HOST_IP:8080:80 \
   -e VITE_OPENCODE_API_URL="http://$HOST_IP:4000" \
   -e VITE_OPENCODE_WS_URL="ws://$HOST_IP:4000" \
  -e HOST=0.0.0.0 \
  --restart unless-stopped \
  opencode/frontend:latest

# 等待前端啟動
echo "⏳ 等待前端服務啟動..."
sleep 10

# 測試前端健康檢查
echo -e "\n🎨 測試前端服務..."
if curl -s -f --max-time 10 http://$HOST_IP:8080/health >/dev/null 2>&1; then
    echo "✅ 前端服務健康檢查通過: http://$HOST_IP:8080"
else
    echo "❌ 前端服務健康檢查失敗"
    echo "檢查前端日誌:"
    docker logs opencode-frontend-lan-alt | tail -20
fi

# 最終狀態檢查
echo -e "\n📊 最終服務狀態:"
echo "容器狀態:"
docker ps --filter "name=opencode" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo -e "\n🎯 部署完成！"
echo ""
echo "🌐 訪問地址:"
echo "   前端應用: http://$HOST_IP:8080"
echo "   後端API:  http://$HOST_IP:4000"
echo "   AG-UI聊天: http://$HOST_IP:8080/agent-chat/test-session"
echo ""
echo "📋 管理命令:"
echo "   查看所有服務: docker ps --filter 'name=opencode'"
echo "   查看網路: docker network inspect opencode-lan-network"
echo "   查看日誌: docker logs [container_name]"
echo "   停止所有服務: docker stop opencode-frontend-lan-alt opencode-backend-lan-alt opencode-postgres-lan-alt opencode-redis-lan-alt"
echo "   清理所有: docker rm opencode-frontend-lan-alt opencode-backend-lan-alt opencode-postgres-lan-alt opencode-redis-lan-alt && docker network rm opencode-lan-network"
echo ""
echo "✅ OpenCode AG-UI 區網部署成功！"
echo "🚀 現在可以從任何區網設備訪問應用了！"