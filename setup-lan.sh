#!/bin/bash
# OpenCode AG-UI 區網訪問配置腳本

echo "🌐 配置 OpenCode AG-UI 支持區網訪問"
echo "===================================="

# 獲取本機IP地址
get_local_ip() {
    # 嘗試多種方法獲取IP
    local ip=""

    # 方法1: 使用hostname -I
    if command -v hostname &> /dev/null; then
        ip=$(hostname -I | awk '{print $1}')
    fi

    # 方法2: 使用ip route
    if [ -z "$ip" ] && command -v ip &> /dev/null; then
        ip=$(ip route get 1 | awk '{print $7; exit}')
    fi

    # 方法3: 使用ifconfig
    if [ -z "$ip" ] && command -v ifconfig &> /dev/null; then
        ip=$(ifconfig | grep -Eo 'inet (addr:)?([0-9]*\.){3}[0-9]*' | grep -v '127.0.0.1' | head -1 | awk '{print $2}' | sed 's/addr://')
    fi

    # 方法4: 使用python
    if [ -z "$ip" ] && command -v python3 &> /dev/null; then
        ip=$(python3 -c "import socket; s=socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(('8.8.8.8', 80)); print(s.getsockname()[0]); s.close()" 2>/dev/null)
    fi

    echo "$ip"
}

# 主機IP檢測
HOST_IP=$(get_local_ip)

if [ -z "$HOST_IP" ]; then
    echo "❌ 無法檢測到本機IP地址"
    echo "請手動設置 HOST_IP 變數"
    echo "例如: export HOST_IP=192.168.1.100"
    exit 1
fi

echo "✅ 檢測到本機IP: $HOST_IP"

# 創建區網環境變數文件
cat > .env.lan << EOF
# OpenCode AG-UI 區網訪問配置
# 自動生成於 $(date)

# 網路配置
HOST_IP=$HOST_IP
LAN_FRONTEND_URL=http://$HOST_IP
LAN_BACKEND_URL=http://$HOST_IP:3000
LAN_WS_URL=ws://$HOST_IP:3000

# 應用配置
VITE_OPENCODE_API_URL=http://$HOST_IP:3000
VITE_OPENCODE_WS_URL=ws://$HOST_IP:3000

# 開發/生產模式
NODE_ENV=production
HOST=0.0.0.0
PORT=3000

# 資料庫 (保持不變，使用容器內部網路)
DATABASE_URL=postgresql://opencode:\${POSTGRES_PASSWORD}@postgres:5432/opencode
REDIS_URL=redis://redis:6379

# 認證 (需要設置)
JWT_SECRET=\${JWT_SECRET:-change_this_secret_in_production}
POSTGRES_PASSWORD=\${POSTGRES_PASSWORD:-change_this_password}

# 可選服務
SENTRY_DSN=\${SENTRY_DSN:-}
DATADOG_API_KEY=\${DATADOG_API_KEY:-}
EOF

echo "✅ 已創建區網配置文件: .env.lan"

# 更新docker-compose以使用區網配置
cat > docker-compose.lan.yml << EOF
version: '3.8'

services:
  # 前端應用 - 區網訪問
  opencode-frontend:
    build:
      context: ./packages/console/app
      dockerfile: Dockerfile
    container_name: opencode-frontend-lan
    restart: unless-stopped
    ports:
      - "$HOST_IP:80:80"
      - "$HOST_IP:3001:3001"
    environment:
      - VITE_OPENCODE_API_URL=http://$HOST_IP:3000
      - VITE_OPENCODE_WS_URL=ws://$HOST_IP:3000
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

  # 後端 API - 區網訪問
  opencode-backend:
    build:
      context: ./packages/opencode
      dockerfile: Dockerfile
    container_name: opencode-backend-lan
    restart: unless-stopped
    ports:
      - "$HOST_IP:3000:3000"
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
    container_name: opencode-postgres-lan
    restart: unless-stopped
    environment:
      - POSTGRES_DB=opencode
      - POSTGRES_USER=opencode
      - POSTGRES_PASSWORD=\${POSTGRES_PASSWORD}
    volumes:
      - postgres_lan_data:/var/lib/postgresql/data
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
    container_name: opencode-redis-lan
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - redis_lan_data:/data
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
        - subnet: 172.20.0.0/16

volumes:
  postgres_lan_data:
  redis_lan_data:
EOF

echo "✅ 已創建區網Docker Compose配置: docker-compose.lan.yml"

# 創建區網訪問腳本
cat > start-lan.sh << 'EOF'
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
EOF

chmod +x start-lan.sh
echo "✅ 已創建區網啟動腳本: start-lan.sh"

# 創建防火牆配置建議
cat > firewall-suggestions.sh << 'EOF'
#!/bin/bash
# 區網訪問防火牆配置建議

echo "🔥 OpenCode AG-UI 區網訪問防火牆建議"
echo "===================================="

# 獲取當前IP
CURRENT_IP=$(hostname -I | awk '{print $1}')
echo "當前主機IP: $CURRENT_IP"

echo ""
echo "📋 防火牆配置建議 (Ubuntu/Debian):"
echo ""
echo "# 允許HTTP (80) 和後端API (3000) 訪問"
echo "sudo ufw allow 80/tcp"
echo "sudo ufw allow 3000/tcp"
echo ""
echo "# 如果需要限制特定IP段:"
echo "sudo ufw allow from 192.168.1.0/24 to any port 80"
echo "sudo ufw allow from 192.168.1.0/24 to any port 3000"
echo ""
echo "# 查看防火牆狀態:"
echo "sudo ufw status"
echo ""
echo "# 重新載入防火牆:"
echo "sudo ufw reload"
echo ""

echo "📋 Docker 網路配置檢查:"
echo ""
echo "# 查看Docker網路:"
echo "docker network ls"
echo "docker network inspect opencode-lan-network"
echo ""

echo "🔒 安全建議:"
echo "- 只允許信任的IP段訪問"
echo "- 使用強密碼和JWT密鑰"
echo "- 定期更新系統和依賴"
echo "- 監控異常訪問"
EOF

chmod +x firewall-suggestions.sh
echo "✅ 已創建防火牆配置建議: firewall-suggestions.sh"

echo ""
echo "🎉 區網配置完成！"
echo ""
echo "📋 下一步:"
echo "1. 設置環境變數:"
echo "   export JWT_SECRET=your_secure_jwt_secret"
echo "   export POSTGRES_PASSWORD=your_secure_db_password"
echo ""
echo "2. 啟動區網服務:"
echo "   ./start-lan.sh"
echo ""
echo "3. 配置防火牆 (可選):"
echo "   ./firewall-suggestions.sh"
echo ""
echo "4. 訪問應用:"
echo "   http://$HOST_IP (前端)"
echo "   http://$HOST_IP:3000 (後端API)"
echo ""
echo "📖 詳細文檔: 查看 LAN_ACCESS_README.md"