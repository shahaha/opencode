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
