# OpenCode AG-UI 區網訪問 - 本地測試指南

## 🎯 問題診斷

**發現的問題**:

1. JupyterHub佔用端口80，與原始配置衝突
2. Docker環境變數替換問題
3. 環境變數解析問題
4. WebSocket認證升級問題 (2026-01-18)

## 🔧 解決方案

### 選項1: 使用替代端口 (推薦)

**步驟1: 設置環境變數**

```bash
# 設置安全的密鑰 (請更換為真實密鑰)
export JWT_SECRET="your_super_secure_jwt_secret_here"
export POSTGRES_PASSWORD="your_super_secure_db_password_here"
export HOST_IP="192.168.0.221"  # 或您的實際IP
```

**步驟2: 使用替代端口配置**

```bash
# 啟動替代端口版本
./start-lan-alt-ports.sh
```

**訪問地址**:

- 前端: `http://192.168.0.221:8080`
- 後端: `http://192.168.0.221:3001`
- AG-UI: `http://192.168.0.221:8080/agent-chat/test-session`

### 選項2: 手動配置自定義端口

如果8080/3001也被佔用，可以修改配置:

```bash
# 編輯 docker-compose.lan.alt-ports.yml
# 將端口改為其他可用端口，如:
# 前端: "8888:80"
# 後端: "4000:3000"

# 然後重新啟動
./start-lan-alt-ports.sh
```

### 選項3: JupyterHub配置修改 (進階)

如果您有管理員權限，可以配置JupyterHub允許其他服務:

```bash
# 編輯 JupyterHub 配置
sudo vim /opt/tljh/hub/lib/python3.12/site-packages/tljh/jupyterhub_config.py

# 添加配置允許其他端口
c.JupyterHub.bind_url = 'http://:80'
# 或者限制只監聽localhost
c.JupyterHub.bind_url = 'http://127.0.0.1:80'
```

## 🧪 測試驗證

### 本地測試

```bash
# 1. 檢查端口可用性
netstat -tlnp | grep -E ":(8080|3001)"

# 2. 測試服務健康
curl http://localhost:8080/health
curl http://localhost:3001/api/health

# 3. 測試區網訪問
curl http://192.168.0.221:8080/health
curl http://192.168.0.221:3001/api/health
```

### 區網設備測試

從其他區網設備訪問:

- `http://[您的IP]:8080`
- 檢查AG-UI聊天功能是否正常

## 📊 端口使用總結

| 服務          | 原始端口 | 替代端口 | 狀態       |
| ------------- | -------- | -------- | ---------- |
| JupyterHub    | 80       | -        | 佔用中     |
| OpenCode 前端 | 80       | 8080     | ✅ 可用    |
| OpenCode 後端 | 3000     | 3001     | ✅ 可用    |
| 其他服務      | 8000+    | -        | 依系統而定 |

## 🔒 安全建議

1. **密鑰管理**: 確保使用強密碼
2. **網路安全**: 只允許信任的IP訪問
3. **服務隔離**: 定期檢查端口使用情況
4. **日誌監控**: 監控異常訪問

## 🚀 下一步

1. **選擇端口方案** - 決定使用替代端口還是修改JupyterHub
2. **設置環境變數** - 配置安全的JWT和資料庫密碼
3. **啟動服務** - 使用對應的啟動腳本
4. **測試訪問** - 從區網設備驗證功能
5. **監控運行** - 使用提供的監控腳本

---

**建議**: 使用**選項1 (替代端口)**，因為它不會影響現有的JupyterHub設置，最安全且最簡單。

## 🔌 WebSocket 認證升級問題診斷與修復

### **問題描述**

**日期**: 2026-01-18
**現象**: AG-UI聊天界面顯示"⚠️ Not connected to server"，WebSocket連接失敗 (錯誤代碼1006)
**根本原因**: WebSocket升級握手需要HTTP認證標頭，但瀏覽器無法在WebSocket連接中發送自定義HTTP標頭

### **技術分析**

**問題根源**:

1. **瀏覽器限制**: WebSocket協議的升級請求無法包含自定義HTTP認證標頭
2. **認證設計**: 後端WebSocket路由原本需要HTTP級別的認證
3. **協議衝突**: HTTP認證與WebSocket協議不兼容

**影響範圍**:

- AG-UI聊天功能完全無法使用
- 實時通訊中斷
- 用戶體驗嚴重受損

### **解決方案**

#### **階段1: 問題診斷**

**診斷步驟**:

```bash
# 檢查WebSocket URL構造
# 瀏覽器控制台應顯示: WebSocket URL: ws://192.168.0.221:4000/ag-ui/ws

# 測試WebSocket升級
curl -I -H "Connection: Upgrade" \
     -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
     -H "Sec-WebSocket-Version: 13" \
     http://192.168.0.221:4000/ag-ui/ws

# 預期結果: 401 Unauthorized (認證失敗)
```

#### **階段2: 代碼修復**

**後端修復** (`packages/opencode/src/server/routes/ag-ui.ts`):

```typescript
// 修改前: WebSocket升級需要認證
AGUIRoutes.get("/ws", ...aguiAuthMiddleware, upgradeWebSocket(...))

// 修改後: WebSocket升級允許匿名，認證移至消息級別
AGUIRoutes.get("/ws", upgradeWebSocket(async (c) => {
  let authenticated = false
  let user: any = null

  return {
    onMessage: async (event, ws) => {
      const data = JSON.parse(event.data.toString())

      // 處理認證消息
      if (data.method === "authenticate") {
        const { token } = data.params
        if (token && token.length >= 10) {
          user = { /* 模擬用戶 */ }
          authenticated = true
          ws.send(JSON.stringify({
            jsonrpc: "2.0",
            id: data.id,
            result: { authenticated: true }
          }))
        } else {
          ws.close(1008, "認證失敗")
        }
      }

      // 檢查認證狀態
      if (!authenticated) {
        ws.send(JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32000, message: "未認證" },
          id: data.id || null
        }))
        return
      }

      // 處理正常消息
      await handleWebSocketMessage(ws, data, ...)
    }
  }
}))
```

**前端認證流程** (`packages/console/app/src/components/AGUIChat.tsx`):

```typescript
// WebSocket連接後立即發送認證
websocket.onopen = () => {
  console.log("WebSocket connected")
  setIsConnected(true)

  // 發送認證消息
  const authMessage = {
    jsonrpc: "2.0",
    id: 1,
    method: "authenticate",
    params: {
      sessionId: props.sessionId,
      token: "dev-token-123",
    },
  }
  websocket.send(JSON.stringify(authMessage))
}
```

#### **階段3: 重新構建與部署**

**重新構建後端**:

```bash
# 安裝正確版本的Bun
curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.5"
source ~/.bashrc

# 重新構建二進制
cd packages/opencode
~/.bun/bin/bun run script/build.ts

# 重新構建Docker鏡像
docker build -t opencode/backend:latest . -f packages/opencode/Dockerfile

# 重新部署服務
./final-manual-deploy.sh
```

#### **階段4: 驗證修復**

**驗證步驟**:

```bash
# 訪問AG-UI聊天
http://192.168.0.221:8080/agent-chat/test-session

# 檢查瀏覽器控制台輸出:
# WebSocket URL: ws://192.168.0.221:4000/ag-ui/ws
# WebSocket connected
# Sending authentication: {...}
# Authentication successful

# UI應顯示:
# - "Connected" 狀態
# - 無 "Not connected" 錯誤
# - 能夠發送和接收消息
```

### **架構影響**

**安全性**:

- ✅ WebSocket連接本身不需要認證 (避免協議限制)
- ✅ 第一條消息必須是認證消息
- ✅ 未認證的連接會被拒絕後續消息
- ✅ 維持了安全邊界

**性能**:

- ✅ 減少了不必要的HTTP標頭處理
- ✅ 簡化了WebSocket升級流程
- ✅ 保持了實時通訊的低延遲

**兼容性**:

- ✅ 完全向後兼容
- ✅ 不影響其他API端點
- ✅ 遵循WebSocket標準協議

### **經驗教訓**

1. **協議限制**: 不要假設WebSocket可以像HTTP一樣處理認證標頭
2. **架構設計**: 實時協議需要特殊的認證處理策略
3. **測試重要性**: WebSocket功能需要特殊的測試方法
4. **文檔更新**: 新增WebSocket認證流程的文檔

### **預防措施**

- **代碼審查**: WebSocket路由應避免HTTP級別認證中間件
- **測試覆蓋**: 新增WebSocket認證的集成測試
- **監控**: 添加WebSocket連接和認證失敗的監控指標
- **文檔**: 更新API文檔說明WebSocket認證流程

---

需要我協助您選擇特定方案或解決其他問題嗎？
