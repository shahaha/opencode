# OpenCode AG-UI 區網訪問指南

## 📋 概述

本指南說明如何將OpenCode AG-UI配置為支持區網訪問，讓同一網路中的其他設備可以訪問應用。

## 🚀 快速開始

### 步驟1: 自動配置

```bash
# 運行區網配置腳本 (會自動檢測IP)
./setup-lan.sh
```

### 步驟2: 設置環境變數

```bash
# 設置安全的密鑰和密碼
export JWT_SECRET="your_super_secure_jwt_secret_here"
export POSTGRES_PASSWORD="your_super_secure_db_password_here"

# 可選: 設置監控服務
export SENTRY_DSN="your_sentry_dsn"
```

### 步驟3: 啟動區網服務

```bash
# 啟動區網版本
./start-lan.sh
```

### 步驟4: 驗證訪問

從其他區網設備訪問:

- 前端: `http://[主機IP]`
- 後端: `http://[主機IP]:3000`
- AG-UI: `http://[主機IP]/agent-chat/test-session`

## 🔧 手動配置

### 檢測本機IP

```bash
# 方法1: hostname命令
hostname -I

# 方法2: ip命令
ip route get 1 | awk '{print $7}'

# 方法3: ifconfig (如果可用)
ifconfig | grep inet | grep -v 127.0.0.1 | head -1
```

### 環境變數配置

```bash
# 替換 YOUR_HOST_IP 為實際IP
export HOST_IP=192.168.1.100
export VITE_OPENCODE_API_URL=http://192.168.1.100:3000
export VITE_OPENCODE_WS_URL=ws://192.168.1.100:3000
```

### Docker配置調整

```yaml
# docker-compose.lan.yml 中的關鍵修改
services:
  opencode-frontend:
    ports:
      - "192.168.1.100:80:80" # 綁定到具體IP
      - "192.168.1.100:3001:3001"
    extra_hosts:
      - "192.168.1.100:host-gateway" # Docker主機訪問

  opencode-backend:
    ports:
      - "192.168.1.100:3000:3000"
    environment:
      - HOST=0.0.0.0 # 監聽所有接口
```

## 🌐 網路配置

### 防火牆設定

#### Ubuntu/Debian

```bash
# 允許HTTP和API端口
sudo ufw allow 80/tcp
sudo ufw allow 3000/tcp

# 只允許特定網路段
sudo ufw allow from 192.168.1.0/24 to any port 80
sudo ufw allow from 192.168.1.0/24 to any port 3000

# 查看狀態
sudo ufw status
```

#### CentOS/RHEL/Fedora

```bash
# 允許端口
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=3000/tcp

# 重新載入
sudo firewall-cmd --reload

# 查看狀態
sudo firewall-cmd --list-all
```

### 路由器設定

1. **埠轉發**: 將外部端口80和3000轉發到內部主機
2. **DHCP**: 確保區網設備獲得正確IP
3. **DNS**: 可選設置本地DNS解析

## 🔍 故障排除

### 無法從其他設備訪問

**問題**: 其他區網設備無法訪問應用

```bash
# 檢查服務狀態
docker-compose -f docker-compose.lan.yml ps

# 檢查端口綁定
netstat -tlnp | grep -E ":(80|3000)"

# 測試本地訪問
curl http://localhost/health
curl http://localhost:3000/api/health

# 測試區網訪問 (從另一台機器)
curl http://[主機IP]/health
```

**解決方案**:

1. 確保服務綁定到正確IP (`0.0.0.0`)
2. 檢查防火牆設定
3. 確認區網設備在同一網路段
4. 檢查路由器設定

### WebSocket連接失敗

**問題**: 聊天功能無法連接WebSocket

```bash
# 檢查WebSocket端點
curl -I http://localhost:3000/api/ag-ui/ws

# 檢查瀏覽器控制台錯誤
# 查找CORS或網路錯誤
```

**解決方案**:

1. 確保WebSocket URL正確: `ws://[主機IP]:3000`
2. 檢查CORS設定
3. 驗證防火牆允許WebSocket流量

### 資料庫連接問題

**問題**: 後端無法連接資料庫

```bash
# 檢查資料庫容器
docker-compose -f docker-compose.lan.yml logs postgres

# 測試資料庫連接
docker-compose -f docker-compose.lan.yml exec postgres pg_isready -U opencode
```

**解決方案**:

1. 確保POSTGRES_PASSWORD正確設置
2. 檢查網路配置
3. 驗證資料庫端口綁定

## 📊 監控區網訪問

### 訪問日誌

```bash
# 查看Nginx訪問日誌
docker-compose -f docker-compose.lan.yml logs opencode-frontend | grep "GET"

# 查看後端API日誌
docker-compose -f docker-compose.lan.yml logs opencode-backend | grep "AG-UI"
```

### 網路監控

```bash
# 查看活躍連接
netstat -tlnp | grep -E ":(80|3000)"

# 監控網路流量
docker stats opencode-frontend opencode-backend
```

### 效能監控

```bash
# 使用提供的監控腳本
./monitor-production.sh
```

## 🔒 安全考慮

### 區網安全最佳實踐

1. **網路隔離**: 只允許信任的網路段訪問
2. **強密碼**: 使用複雜的JWT密鑰和資料庫密碼
3. **定期更新**: 保持系統和依賴項更新
4. **訪問控制**: 實現適當的認證和授權
5. **日誌監控**: 監控可疑訪問模式

### HTTPS配置 (推薦)

對於生產區網環境，建議配置HTTPS:

```bash
# 生成自簽名證書
openssl req -x509 -newkey rsa:4096 -keyout ssl/key.pem -out ssl/cert.pem -days 365 -nodes -subj "/CN=opencode.local"

# 更新Nginx配置啟用SSL
# 參考 PRODUCTION_DEPLOYMENT_CONFIG.md 中的SSL配置
```

## 📞 支援

### 常見問題

**Q: 如何更改監聽IP?**
A: 修改 `HOST_IP` 環境變數並重新運行 `./setup-lan.sh`

**Q: 如何添加更多端口?**
A: 在 `docker-compose.lan.yml` 中添加端口映射

**Q: 如何限制訪問特定設備?**
A: 使用防火牆規則限制IP範圍

### 聯絡支援

- 檢查應用日誌: `docker-compose -f docker-compose.lan.yml logs`
- 驗證網路配置: `ip addr show`
- 測試服務連通性: `telnet [主機IP] 80`

## 📋 總結

區網訪問配置讓OpenCode AG-UI可以在區網環境中運行，讓團隊成員能夠方便地協作和測試。

**關鍵步驟**:

1. 運行 `./setup-lan.sh` 自動配置
2. 設置安全密鑰和密碼
3. 運行 `./start-lan.sh` 啟動服務
4. 配置防火牆允許訪問
5. 從其他設備測試訪問

**安全提醒**: 區網訪問雖然方便，但請確保網路安全，只允許信任的設備訪問。
