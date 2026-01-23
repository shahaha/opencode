#!/bin/bash
# OpenCode AG-UI Production Deployment Script
set -e

echo "🚀 OpenCode AG-UI Production Deployment"
echo "====================================="

# 檢查環境
check_environment() {
    echo "📋 檢查環境..."

    # 檢查 Docker
    if ! command -v docker &> /dev/null; then
        echo "❌ Docker 未安裝"
        exit 1
    fi

    # 檢查 Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        echo "❌ Docker Compose 未安裝"
        exit 1
    fi

    # 檢查環境變數
    required_vars=("DATABASE_URL" "JWT_SECRET" "POSTGRES_PASSWORD")
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            echo "❌ 缺少必要環境變數: $var"
            exit 1
        fi
    done

    echo "✅ 環境檢查通過"
}

# 創建必要的目錄和文件
setup_directories() {
    echo "📁 設置目錄結構..."

    mkdir -p logs
    mkdir -p ssl
    mkdir -p monitoring
    mkdir -p backups

    # 創建 .env 文件
    if [ ! -f .env ]; then
        cat > .env << EOF
# 生產環境變數
DATABASE_URL=${DATABASE_URL}
POSTGRES_USER=opencode
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
JWT_SECRET=${JWT_SECRET}
SENTRY_DSN=${SENTRY_DSN:-}
DATADOG_API_KEY=${DATADOG_API_KEY:-}
GRAFANA_PASSWORD=${GRAFANA_PASSWORD:-admin}
EOF
        echo "✅ 創建了 .env 文件"
    fi
}

# 構建應用鏡像
build_images() {
    echo "🔨 構建應用鏡像..."

    # 前端鏡像
    echo "  構建前端鏡像..."
    cd packages/console/app
    docker build -t opencode/frontend:$(date +%Y%m%d_%H%M%S) .
    docker tag opencode/frontend:$(date +%Y%m%d_%H%M%S) opencode/frontend:latest
    cd ../../..

    # 後端鏡像
    echo "  構建後端鏡像..."
    cd packages/opencode
    docker build -t opencode/backend:$(date +%Y%m%d_%H%M%S) .
    docker tag opencode/backend:$(date +%Y%m%d_%H%M%S) opencode/backend:latest
    cd ..

    echo "✅ 鏡像構建完成"
}

# 部署服務
deploy_services() {
    echo "▶️  部署服務..."

    # 停止現有服務
    docker-compose down || true

    # 清理資源
    docker system prune -f

    # 啟動服務
    docker-compose up -d

    echo "⏳ 等待服務啟動..."
    sleep 30

    echo "✅ 服務部署完成"
}

# 健康檢查
health_check() {
    echo "🏥 執行健康檢查..."

    # 檢查前端
    if curl -f -s http://localhost/health > /dev/null; then
        echo "✅ 前端健康檢查通過"
    else
        echo "❌ 前端健康檢查失敗"
        return 1
    fi

    # 檢查後端
    if curl -f -s http://localhost:3000/api/health > /dev/null; then
        echo "✅ 後端健康檢查通過"
    else
        echo "❌ 後端健康檢查失敗"
        return 1
    fi

    # 檢查資料庫
    if docker-compose exec -T postgres pg_isready -U opencode -d opencode > /dev/null; then
        echo "✅ 資料庫健康檢查通過"
    else
        echo "❌ 資料庫健康檢查失敗"
        return 1
    fi

    # 檢查 Redis
    if docker-compose exec -T redis redis-cli ping > /dev/null; then
        echo "✅ Redis 健康檢查通過"
    else
        echo "❌ Redis 健康檢查失敗"
        return 1
    fi

    echo "✅ 所有健康檢查通過"
}

# 創建備份
create_backup() {
    echo "💾 創建部署前備份..."

    BACKUP_DIR="backups/pre_deploy_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"

    # 備份資料庫 (如果存在)
    if docker-compose ps postgres | grep -q "Up"; then
        echo "  備份資料庫..."
        docker-compose exec -T postgres pg_dump -U opencode opencode > "$BACKUP_DIR/database.sql" || true
    fi

    # 備份配置
    cp .env "$BACKUP_DIR/" 2>/dev/null || true
    cp docker-compose.yml "$BACKUP_DIR/" 2>/dev/null || true

    # 壓縮備份
    tar -czf "${BACKUP_DIR}.tar.gz" "$BACKUP_DIR" 2>/dev/null || true
    rm -rf "$BACKUP_DIR"

    echo "✅ 備份創建完成: ${BACKUP_DIR}.tar.gz"
}

# 主部署流程
main() {
    echo "開始生產部署流程..."
    echo ""

    check_environment
    echo ""

    setup_directories
    echo ""

    create_backup
    echo ""

    build_images
    echo ""

    deploy_services
    echo ""

    if health_check; then
        echo ""
        echo "🎉 生產部署成功完成！"
        echo ""
        echo "🌐 應用現在運行在:"
        echo "   前端: http://localhost"
        echo "   後端: http://localhost:3000"
        echo "   監控: http://localhost:9090 (Prometheus)"
        echo "   日誌: http://localhost:3001 (Grafana)"
        echo ""
        echo "📊 要查看監控狀態，請運行: ./monitor.sh"
        echo "🛑 要停止服務，請運行: docker-compose down"
    else
        echo ""
        echo "❌ 部署失敗，請檢查日誌並修復問題"
        echo "📋 查看服務日誌: docker-compose logs"
        echo "🔄 要回滾，請運行: ./rollback.sh"
        exit 1
    fi
}

# 執行主流程
main "$@"