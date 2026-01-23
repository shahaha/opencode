# OpenCode AG-UI Production Deployment Configuration

## 環境變數配置

### 前端環境變數 (.env.production)

```bash
# API 端點
VITE_OPENCODE_API_URL=https://api.opencode.ai
VITE_OPENCODE_WS_URL=wss://api.opencode.ai

# 認證配置
VITE_AUTH_URL=https://auth.opencode.ai
VITE_AUTH_CLIENT_ID=opencode-agui-prod

# 監控配置
VITE_SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
VITE_DATADOG_CLIENT_TOKEN=your-datadog-client-token
VITE_DATADOG_APPLICATION_ID=your-datadog-app-id

# 功能標誌
VITE_AGUI_ENABLED=true
VITE_AGUI_DEBUG=false
VITE_AGUI_MAX_MESSAGES=100
VITE_AGUI_SESSION_TIMEOUT=3600000

# 性能配置
VITE_AGUI_BATCH_SIZE=10
VITE_AGUI_BATCH_DELAY=50
VITE_AGUI_RECONNECT_ATTEMPTS=5
VITE_AGUI_RECONNECT_DELAY=1000
```

### 後端環境變數

```bash
# 應用配置
NODE_ENV=production
PORT=3000

# 資料庫
DATABASE_URL=postgresql://user:password@host:5432/opencode_prod
REDIS_URL=redis://host:6379

# 認證
JWT_SECRET=your-production-jwt-secret
JWT_EXPIRES_IN=24h

# OpenCode 特定
OPENCODE_SERVER_PASSWORD=secure-server-password
OPENCODE_API_KEY=your-api-key

# 外部服務
OPENAI_API_KEY=sk-prod-...
ANTHROPIC_API_KEY=sk-ant-prod-...

# AG-UI 配置
AGUI_MAX_SESSIONS=1000
AGUI_SESSION_TIMEOUT=3600000
AGUI_RATE_LIMIT_REQUESTS=100
AGUI_RATE_LIMIT_WINDOW=60000

# 日誌
LOG_LEVEL=info
LOG_FORMAT=json

# 監控
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
DATADOG_API_KEY=your-datadog-api-key
```

## Docker 配置

### 前端 Dockerfile

```dockerfile
# 多階段構建
FROM node:22-alpine AS base
WORKDIR /app

# 安裝 pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM nginx:alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html

# 配置 Nginx
COPY nginx.conf /etc/nginx/nginx.conf
COPY default.conf /etc/nginx/conf.d/default.conf

# 健康檢查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/health || exit 1

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### 後端 Dockerfile

```dockerfile
FROM node:22-alpine AS base
WORKDIR /app

# 安裝 pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM base AS runner
COPY --from=builder /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./

# 創建非root用戶
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

USER nextjs

# 健康檢查
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node healthcheck.js

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Nginx 配置 (nginx.conf)

```nginx
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log notice;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
    use epoll;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # 日誌格式
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;

    # 基本設置
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 100M;

    # Gzip 壓縮
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/javascript
        application/xml+rss
        application/json;

    # 安全頭
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

    # 靜態資源快取
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # API 代理
    location /api/ {
        proxy_pass http://backend:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }

    # 健康檢查
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }

    # 主應用
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
}
```

### Docker Compose (生產環境)

```yaml
version: "3.8"

services:
  # 前端應用
  opencode-frontend:
    image: opencode/frontend:latest
    container_name: opencode-frontend
    restart: unless-stopped
    ports:
      - "80:80"
    environment:
      - NGINX_ENVSUBST_TEMPLATE_DIR=/etc/nginx/templates
    networks:
      - opencode-network
    depends_on:
      - opencode-backend
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # 後端 API
  opencode-backend:
    image: opencode/backend:latest
    container_name: opencode-backend
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - JWT_SECRET=${JWT_SECRET}
      - SENTRY_DSN=${SENTRY_DSN}
    networks:
      - opencode-network
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
      start_period: 40s

  # 資料庫
  postgres:
    image: postgres:15-alpine
    container_name: opencode-postgres
    restart: unless-stopped
    environment:
      - POSTGRES_DB=opencode
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    networks:
      - opencode-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Redis 快取
  redis:
    image: redis:7-alpine
    container_name: opencode-redis
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    networks:
      - opencode-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3

  # 反向代理 (可選)
  nginx:
    image: nginx:alpine
    container_name: opencode-nginx
    restart: unless-stopped
    ports:
      - "443:443"
    volumes:
      - ./nginx/ssl:/etc/nginx/ssl
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
    networks:
      - opencode-network
    depends_on:
      - opencode-frontend
      - opencode-backend

  # 監控 (可選)
  prometheus:
    image: prom/prometheus:latest
    container_name: opencode-prometheus
    restart: unless-stopped
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    networks:
      - opencode-network
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.path=/prometheus"
      - "--web.console.libraries=/etc/prometheus/console_libraries"
      - "--web.console.templates=/etc/prometheus/consoles"

  grafana:
    image: grafana/grafana:latest
    container_name: opencode-grafana
    restart: unless-stopped
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}
    volumes:
      - grafana_data:/var/lib/grafana
    networks:
      - opencode-network
    depends_on:
      - prometheus

networks:
  opencode-network:
    driver: bridge

volumes:
  postgres_data:
  redis_data:
  prometheus_data:
  grafana_data:
```

## 部署腳本

### 部署準備腳本 (prepare-deploy.sh)

```bash
#!/bin/bash
set -e

echo "🚀 準備 OpenCode AG-UI 生產部署..."

# 檢查必要工具
command -v docker >/dev/null 2>&1 || { echo "❌ Docker 未安裝"; exit 1; }
command -v docker-compose >/dev/null 2>&1 || { echo "❌ Docker Compose 未安裝"; exit 1; }

# 檢查環境變數
if [ -z "$DATABASE_URL" ]; then
    echo "❌ 缺少 DATABASE_URL 環境變數"
    exit 1
fi

if [ -z "$JWT_SECRET" ]; then
    echo "❌ 缺少 JWT_SECRET 環境變數"
    exit 1
fi

# 創建必要的目錄
mkdir -p logs
mkdir -p ssl
mkdir -p monitoring

# 生成 SSL 證書 (自簽名，用於測試)
if [ ! -f ssl/cert.pem ]; then
    echo "📜 生成自簽名 SSL 證書..."
    openssl req -x509 -newkey rsa:4096 -keyout ssl/key.pem -out ssl/cert.pem -days 365 -nodes -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
fi

# 創建環境變數文件
cat > .env << EOF
# 資料庫
DATABASE_URL=$DATABASE_URL
POSTGRES_USER=opencode
POSTGRES_PASSWORD=$POSTGRES_PASSWORD

# 認證
JWT_SECRET=$JWT_SECRET

# 監控
SENTRY_DSN=$SENTRY_DSN
DATADOG_API_KEY=$DATADOG_API_KEY
GRAFANA_PASSWORD=$GRAFANA_PASSWORD
EOF

echo "✅ 部署準備完成"
```

### 部署腳本 (deploy.sh)

```bash
#!/bin/bash
set -e

echo "🚀 部署 OpenCode AG-UI 到生產環境..."

# 載入環境變數
if [ -f .env ]; then
    export $(cat .env | xargs)
fi

# 版本標記
VERSION=$(date +%Y%m%d_%H%M%S)
echo "📦 部署版本: $VERSION"

# 停止現有服務
echo "🛑 停止現有服務..."
docker-compose down

# 清理未使用的資源
echo "🧹 清理 Docker 資源..."
docker system prune -f

# 重新構建鏡像
echo "🔨 構建應用鏡像..."
docker-compose build --no-cache

# 啟動服務
echo "▶️  啟動服務..."
docker-compose up -d

# 等待服務就緒
echo "⏳ 等待服務啟動..."
sleep 30

# 健康檢查
echo "🏥 執行健康檢查..."
if curl -f http://localhost/health > /dev/null 2>&1; then
    echo "✅ 前端健康檢查通過"
else
    echo "❌ 前端健康檢查失敗"
    exit 1
fi

if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "✅ 後端健康檢查通過"
else
    echo "❌ 後端健康檢查失敗"
    exit 1
fi

# 標記部署成功
echo "$VERSION" > .last_deploy
echo "✅ 部署成功完成!"
echo "🌐 應用已在 http://localhost 運行"
```

### 回滾腳本 (rollback.sh)

```bash
#!/bin/bash
set -e

echo "⏪ 回滾 OpenCode AG-UI 部署..."

# 檢查上次部署版本
if [ ! -f .last_deploy ]; then
    echo "❌ 找不到上次部署記錄"
    exit 1
fi

LAST_VERSION=$(cat .last_deploy)
echo "📦 回滾到版本: $LAST_VERSION"

# 停止當前服務
docker-compose down

# 恢復上一個鏡像版本
docker tag opencode/frontend:$LAST_VERSION opencode/frontend:latest
docker tag opencode/backend:$LAST_VERSION opencode/backend:latest

# 重新啟動服務
docker-compose up -d

# 健康檢查
echo "⏳ 等待服務恢復..."
sleep 30

if curl -f http://localhost/health > /dev/null 2>&1 && \
   curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "✅ 回滾成功完成"
else
    echo "❌ 回滾失敗，請手動檢查"
    exit 1
fi
```

### 監控腳本 (monitor.sh)

```bash
#!/bin/bash

echo "📊 OpenCode AG-UI 監控狀態"

# 服務狀態
echo "=== 服務狀態 ==="
docker-compose ps

# 資源使用
echo -e "\n=== 資源使用 ==="
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"

# 日誌檢查 (最近錯誤)
echo -e "\n=== 最近錯誤日誌 ==="
docker-compose logs --tail=20 | grep -i error || echo "無錯誤日誌"

# 健康檢查
echo -e "\n=== 健康檢查 ==="
if curl -s http://localhost/health > /dev/null; then
    echo "✅ 前端: 正常"
else
    echo "❌ 前端: 異常"
fi

if curl -s http://localhost:3000/api/health > /dev/null; then
    echo "✅ 後端: 正常"
else
    echo "❌ 後端: 異常"
fi

# 資料庫連接
echo -e "\n=== 資料庫狀態 ==="
docker-compose exec -T postgres pg_isready -U opencode || echo "❌ 資料庫連接失敗"

# Redis 狀態
echo -e "\n=== Redis 狀態 ==="
docker-compose exec -T redis redis-cli ping || echo "❌ Redis 連接失敗"
```

## 監控配置

### Prometheus 配置 (monitoring/prometheus.yml)

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  # - "first_rules.yml"
  # - "second_rules.yml"

scrape_configs:
  - job_name: "opencode-frontend"
    static_configs:
      - targets: ["opencode-frontend:80"]

  - job_name: "opencode-backend"
    static_configs:
      - targets: ["opencode-backend:3000"]

  - job_name: "postgres"
    static_configs:
      - targets: ["postgres:5432"]

  - job_name: "redis"
    static_configs:
      - targets: ["redis:6379"]

  - job_name: "prometheus"
    static_configs:
      - targets: ["localhost:9090"]
```

### Grafana 儀表板配置

```json
{
  "dashboard": {
    "title": "OpenCode AG-UI Monitoring",
    "tags": ["opencode", "ag-ui"],
    "timezone": "browser",
    "panels": [
      {
        "title": "Response Time",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{job=\"opencode-backend\"}[5m]))",
            "legendFormat": "95th percentile"
          }
        ]
      },
      {
        "title": "Error Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total{status=~\"5..\"}[5m]) / rate(http_requests_total[5m]) * 100",
            "legendFormat": "Error rate %"
          }
        ]
      },
      {
        "title": "Active WebSocket Connections",
        "type": "stat",
        "targets": [
          {
            "expr": "websocket_connections_active",
            "legendFormat": "Active connections"
          }
        ]
      }
    ]
  }
}
```

## 功能標誌系統

### 功能標誌配置

```typescript
// lib/feature-flags.ts
export const FEATURES = {
  // AG-UI 功能
  aguiChat: process.env.VITE_AGUI_ENABLED === "true",
  aguiVoice: process.env.VITE_AGUI_VOICE_ENABLED === "true",
  aguiFiles: process.env.VITE_AGUI_FILES_ENABLED === "true",

  // 進階功能
  analytics: process.env.VITE_ANALYTICS_ENABLED === "true",
  betaFeatures: process.env.VITE_BETA_FEATURES === "true",

  // 調試功能 (僅開發環境)
  debugMode: process.env.VITE_AGUI_DEBUG === "true",
} as const

// 使用示例
if (FEATURES.aguiChat) {
  // 啟用 AG-UI 聊天功能
}

if (FEATURES.debugMode) {
  // 啟用調試日誌
}
```

## 安全配置

### SSL/TLS 配置

```bash
# 生成 Let's Encrypt 證書
certbot certonly --nginx -d your-domain.com

# 或使用自簽名證書 (僅測試)
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes
```

### Nginx SSL 配置

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    # SSL 安全設置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # HSTS
    add_header Strict-Transport-Security "max-age=63072000" always;

    location / {
        proxy_pass http://opencode-frontend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 災難恢復計劃

### 備份策略

```bash
#!/bin/bash
# 每日備份腳本

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/$DATE"

mkdir -p $BACKUP_DIR

# 資料庫備份
docker-compose exec -T postgres pg_dump -U opencode opencode > $BACKUP_DIR/database.sql

# Redis 快照
docker-compose exec -T redis redis-cli SAVE
docker cp opencode-redis:/data/dump.rdb $BACKUP_DIR/redis.rdb

# 應用配置
cp .env $BACKUP_DIR/
cp docker-compose.yml $BACKUP_DIR/

# 壓縮備份
tar -czf /backups/opencode_$DATE.tar.gz $BACKUP_DIR

# 清理舊備份 (保留7天)
find /backups -name "*.tar.gz" -mtime +7 -delete

echo "✅ 備份完成: $DATE"
```

### 恢復程序

```bash
#!/bin/bash
# 災難恢復腳本

if [ -z "$1" ]; then
    echo "用法: $0 <備份檔案>"
    exit 1
fi

BACKUP_FILE=$1
RESTORE_DIR="/tmp/restore"

# 解壓備份
tar -xzf $BACKUP_FILE -C $RESTORE_DIR

# 停止服務
docker-compose down

# 恢復資料庫
docker-compose exec -T postgres psql -U opencode -d opencode < $RESTORE_DIR/database.sql

# 恢復 Redis
docker cp $RESTORE_DIR/redis.rdb opencode-redis:/data/dump.rdb
docker-compose exec -T redis redis-cli FLUSHALL
docker-compose restart redis

# 恢復配置
cp $RESTORE_DIR/.env ./
cp $RESTORE_DIR/docker-compose.yml ./

# 重新啟動服務
docker-compose up -d

echo "✅ 恢復完成"
```

## 效能優化配置

### Redis 配置 (redis.conf)

```
# Redis 生產配置
maxmemory 256mb
maxmemory-policy allkeys-lru
tcp-keepalive 300
timeout 300
databases 16

# 持久化
save 900 1
save 300 10
save 60 10000

# 安全
bind 127.0.0.1
protected-mode yes
requirepass your-redis-password
```

### PostgreSQL 配置

```sql
-- 效能優化設置
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;

-- 重新載入配置
SELECT pg_reload_conf();
```

## 部署檢查清單

### 部署前檢查

- [ ] 所有環境變數已配置
- [ ] SSL 證書已安裝
- [ ] 資料庫已初始化
- [ ] 備份已創建
- [ ] 監控已設置
- [ ] 團隊已通知

### 部署後驗證

- [ ] 應用可訪問
- [ ] API 端點響應正常
- [ ] 資料庫連接正常
- [ ] WebSocket 連接正常
- [ ] 監控儀表板正常
- [ ] 日誌無錯誤

### 回滾就緒

- [ ] 上一個版本鏡像已保存
- [ ] 資料庫備份可用
- [ ] 回滾腳本已測試
- [ ] 團隊知道回滾程序

---

**配置狀態**: ✅ **生產部署配置已準備完成**

**下一步建議**:

1. 根據你的基礎設施調整配置
2. 設置環境變數
3. 執行 `prepare-deploy.sh` 準備環境
4. 運行 `deploy.sh` 執行部署
5. 使用 `monitor.sh` 監控系統健康狀況
