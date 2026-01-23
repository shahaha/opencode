#!/bin/bash
# OpenCode AG-UI Production Monitoring Script

echo "📊 OpenCode AG-UI 生產環境監控"
echo "================================="

# 服務狀態
echo "=== Docker 服務狀態 ==="
docker-compose ps

# 資源使用
echo -e "\n=== 容器資源使用 ==="
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"

# 健康檢查
echo -e "\n=== 應用健康檢查 ==="

# 前端健康檢查
if curl -s -f http://localhost/health > /dev/null 2>&1; then
    echo "✅ 前端: 正常運行"
else
    echo "❌ 前端: 服務異常"
fi

# 後端健康檢查
if curl -s -f http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "✅ 後端 API: 正常運行"
else
    echo "❌ 後端 API: 服務異常"
fi

# AG-UI 特定檢查
if curl -s -f -H "Authorization: Bearer test" http://localhost:3000/api/ag-ui/events -X POST -d '{}' > /dev/null 2>&1; then
    echo "✅ AG-UI 端點: 可訪問"
else
    echo "❌ AG-UI 端點: 無法訪問"
fi

# 資料庫健康檢查
echo -e "\n=== 資料庫狀態 ==="
if docker-compose exec -T postgres pg_isready -U opencode -d opencode > /dev/null 2>&1; then
    echo "✅ PostgreSQL: 連接正常"

    # 顯示資料庫統計
    echo "📊 資料庫統計:"
    docker-compose exec -T postgres psql -U opencode -d opencode -c "
        SELECT schemaname, tablename,
               pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
        LIMIT 5;
    " 2>/dev/null || echo "   無法獲取統計信息"
else
    echo "❌ PostgreSQL: 連接失敗"
fi

# Redis 健康檢查
echo -e "\n=== Redis 狀態 ==="
if docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis: 連接正常"

    # 顯示 Redis 統計
    echo "📊 Redis 統計:"
    docker-compose exec -T redis redis-cli info stats | grep -E "(total_connections_received|total_commands_processed|used_memory_human)" || echo "   無法獲取統計信息"
else
    echo "❌ Redis: 連接失敗"
fi

# 日誌檢查
echo -e "\n=== 最近錯誤日誌 ==="
echo "後端錯誤日誌:"
docker-compose logs --tail=5 opencode-backend 2>/dev/null | grep -i error || echo "   無錯誤日誌"

echo -e "\n前端錯誤日誌:"
docker-compose logs --tail=5 opencode-frontend 2>/dev/null | grep -i error || echo "   無錯誤日誌"

# 網路連接
echo -e "\n=== 網路連接 ==="
echo "活躍網路連接:"
netstat -tlnp 2>/dev/null | grep -E ":(80|3000|5432|6379)" | head -10 || ss -tlnp | grep -E ":(80|3000|5432|6379)" | head -10 || echo "   無法獲取網路信息"

# 磁碟使用
echo -e "\n=== 磁碟使用情況 ==="
df -h | grep -E "(Filesystem|/$|/var|/home)" || echo "無法獲取磁碟信息"

# 系統資源
echo -e "\n=== 系統資源 ==="
echo "CPU 使用率:"
top -bn1 | grep "Cpu(s)" || echo "無法獲取 CPU 信息"

echo "記憶體使用率:"
free -h || echo "無法獲取記憶體信息"

# 應用指標 (如果有 Prometheus)
echo -e "\n=== 應用指標 ==="
if curl -s http://localhost:9090/api/v1/query?query=up > /dev/null 2>&1; then
    echo "✅ Prometheus: 運行中"
    echo "📊 關鍵指標:"

    # 查詢一些基本指標
    if command -v jq &> /dev/null; then
        # 這裡可以添加更多 Prometheus 查詢
        echo "   服務可用性指標請查看 Grafana 儀表板"
    else
        echo "   安裝 jq 以查看詳細指標"
    fi
else
    echo "⚠️  Prometheus 未運行 (可選)"
fi

echo -e "\n=== 監控摘要 ==="
echo "🔍 要查看詳細日誌，請運行:"
echo "   docker-compose logs -f [service-name]"
echo ""
echo "📊 要訪問監控儀表板:"
echo "   Prometheus: http://localhost:9090"
echo "   Grafana: http://localhost:3001 (admin/admin)"
echo ""
echo "🛑 緊急停止所有服務:"
echo "   docker-compose down"