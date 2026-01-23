#!/bin/bash
# OpenCode AG-UI 區網訪問 - 端口衝突解決方案

echo "🔧 解決端口衝突問題"
echo "==================="

# 檢查當前端口使用情況
echo "📊 當前端口狀態:"
echo "JupyterHub佔用端口: 80"
echo "建議的替代端口:"
echo "  前端: 8080"
echo "  後端: 3001"
echo "  AG-UI: 3002"

# 創建替代端口的配置
cat > .env.lan.alt-ports << EOF
# OpenCode AG-UI 區網訪問 - 替代端口配置
# 自動生成於 $(date)
# 解決與JupyterHub的端口衝突

# 網路配置
HOST_IP=$HOST_IP
LAN_FRONTEND_URL=http://$HOST_IP:8080
LAN_BACKEND_URL=http://$HOST_IP:3001
LAN_WS_URL=ws://$HOST_IP:3001

# 應用配置 - 替代端口
VITE_OPENCODE_API_URL=http://$HOST_IP:3001
VITE_OPENCODE_WS_URL=ws://$HOST_IP:3001

# 開發/生產模式
NODE_ENV=production
HOST=0.0.0.0
PORT=3001

# 資料庫 (保持不變)
DATABASE_URL=postgresql://opencode:\${POSTGRES_PASSWORD}@postgres:5432/opencode
REDIS_URL=redis://redis:6379

# 認證
JWT_SECRET=\${JWT_SECRET:-change_this_secret_in_production}
POSTGRES_PASSWORD=\${POSTGRES_PASSWORD:-change_this_password}
EOF

echo "✅ 已創建替代端口配置: .env.lan.alt-ports"

# 創建替代端口的Docker Compose
cat > docker-compose.lan.alt-ports.yml << EOF
version: '3.8'

services:
  # 前端應用 - 替代端口
  opencode-frontend:
    build:
      context: ./packages/console/app
      dockerfile: Dockerfile
    container_name: opencode-frontend-lan-alt
    restart: unless-stopped
    ports:
      - "$HOST_IP:8080:80"      # 改為8080避免衝突
    environment:
      - VITE_OPENCODE_API_URL=http://$HOST_IP:3001
      - VITE_OPENCODE_WS_URL=ws://$HOST_IP:3001
      - HOST=0.0.0.0
    networks:
      - opencode-lan-network
    extra_hosts:
      - "$HOST_IP:host-gateway"
    depends_on:
      - opencode-backend
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # 後端 API - 替代端口
  opencode-backend:
    build:
      context: ./packages/opencode
      dockerfile: Dockerfile
    container_name: opencode-backend-lan-alt
    restart: unless-stopped
    ports:
      - "$HOST_IP:3001:3000"    # 改為3001避免衝突
    environment:
      - NODE_ENV=production
      - HOST=0.0.0.0
      - PORT=3000
      - DATABASE_URL=postgresql://opencode:\${POSTGRES_PASSWORD}@postgres:5432/opencode
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=\${JWT_SECRET}
      - SENTRY_DSN=\${SENTRY_DSN}
    networks:
      - opencode-lan-network
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "node", "healthcheck.js"]
      interval: 30s
      timeout: 10s
      retries: 3

  # 資料庫
  postgres:
    image: postgres:15-alpine
    container_name: opencode-postgres-lan-alt
    restart: unless-stopped
    environment:
      - POSTGRES_DB=opencode
      - POSTGRES_USER=opencode
      - POSTGRES_PASSWORD=\${POSTGRES_PASSWORD}
    volumes:
      - postgres_lan_alt_data:/var/lib/postgresql/data
    networks:
      - opencode-lan-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U opencode -d opencode"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Redis
  redis:
    image: redis:7-alpine
    container_name: opencode-redis-lan-alt
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - redis_lan_alt_data:/data
    networks:
      - opencode-lan-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3

networks:
  opencode-lan-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.21.0.0/16  # 不同的網路段

volumes:
  postgres_lan_alt_data:
  redis_lan_alt_data:
EOF

echo "✅ 已創建替代端口Docker配置: docker-compose.lan.alt-ports.yml"

# 創建替代端口啟動腳本
cat > start-lan-alt-ports.sh << 'EOF'
#!/bin/bash
# 啟動OpenCode AG-UI - 替代端口版本 (避免JupyterHub衝突)

set -e

echo "🌐 啟動 OpenCode AG-UI - 區網訪問 (替代端口)"
echo "=============================================="

# 載入替代端口環境變數
if [ -f .env.lan.alt-ports ]; then
    export $(cat .env.lan.alt-ports | xargs)
    echo "✅ 已載入替代端口配置"
else
    echo "❌ 找不到替代端口配置文件"
    echo "請先運行: ./setup-lan.sh"
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

# 檢查端口衝突
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
sleep 25

# 健康檢查
echo "🏥 執行健康檢查..."

# 檢查後端
if curl -s -f http://$HOST_IP:3001/api/health >/dev/null 2>&1; then
    echo "✅ 後端服務正常: http://$HOST_IP:3001"
else
    echo "❌ 後端服務異常"
    echo "檢查日誌: docker-compose -f docker-compose.lan.alt-ports.yml logs opencode-backend"
fi

# 檢查前端
if curl -s -f http://$HOST_IP:8080/health >/dev/null 2>&1; then
    echo "✅ 前端服務正常: http://$HOST_IP:8080"
else
    echo "❌ 前端服務異常"
    echo "檢查日誌: docker-compose -f docker-compose.lan.alt-ports.yml logs opencode-frontend"
fi

echo ""
echo "🎉 替代端口部署完成！"
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
echo ""
echo "💡 提示: 這些端口不會與JupyterHub衝突"
EOF

chmod +x start-lan-alt-ports.sh
echo "✅ 已創建替代端口啟動腳本: start-lan-alt-ports.sh"

echo ""
echo "🎯 端口衝突解決方案完成！"
echo ""
echo "📋 現在您有兩個選擇:"
echo ""
echo "選項1: 使用替代端口 (推薦)"
echo "   端口: 前端8080, 後端3001"
echo "   命令: ./start-lan-alt-ports.sh"
echo ""
echo "選項2: 配置JupyterHub允許其他服務"
echo "   (需要管理員權限修改JupyterHub配置)"
echo ""
echo "🚀 建議使用選項1，因為它不會影響現有的JupyterHub設置"