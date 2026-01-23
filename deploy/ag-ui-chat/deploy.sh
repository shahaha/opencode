#!/bin/bash
# AG-UI Chat Deployment Script
# Usage: ./deploy.sh [environment] [options]

set -e

# Configuration
APP_NAME="ag-ui-chat"
DEPLOY_DIR="/var/www/${APP_NAME}"
BACKUP_DIR="/var/backups/${APP_NAME}"
CONFIG_DIR="/etc/${APP_NAME}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="development"
WS_URL="ws://127.0.0.1:5000/ag-ui/ws"
SESSION_ID="test-session"
AUTH_TOKEN="dev-token-12345"
SERVER_NAME="localhost"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -w|--ws-url)
            WS_URL="$2"
            shift 2
            ;;
        -s|--session-id)
            SESSION_ID="$2"
            shift 2
            ;;
        -t|--auth-token)
            AUTH_TOKEN="$2"
            shift 2
            ;;
        -n|--server-name)
            SERVER_NAME="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -e, --environment ENV     Environment (development|staging|production)"
            echo "  -w, --ws-url URL          WebSocket URL"
            echo "  -s, --session-id ID      Default session ID"
            echo "  -t, --auth-token TOKEN   Authentication token"
            echo "  -n, --server-name NAME   Server name"
            echo "  -h, --help               Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_warn "This script may require root privileges for some operations"
    fi
}

create_directories() {
    log_info "Creating directories..."
    sudo mkdir -p ${DEPLOY_DIR}
    sudo mkdir -p ${BACKUP_DIR}
    sudo mkdir -p ${CONFIG_DIR}
}

backup_existing() {
    if [[ -d ${DEPLOY_DIR} ]]; then
        log_info "Backing up existing deployment..."
        TIMESTAMP=$(date +%Y%m%d_%H%M%S)
        sudo cp -r ${DEPLOY_DIR} ${BACKUP_DIR}/${APP_NAME}_${TIMESTAMP}
        log_info "Backup created at ${BACKUP_DIR}/${APP_NAME}_${TIMESTAMP}"
    fi
}

deploy_files() {
    log_info "Deploying files..."
    sudo cp production-agui-chat.html ${DEPLOY_DIR}/
    sudo cp nginx.conf ${CONFIG_DIR}/
    
    # Set permissions
    sudo chmod 644 ${DEPLOY_DIR}/*
    sudo chmod 644 ${CONFIG_DIR}/*
    
    log_info "Files deployed successfully"
}

configure_nginx() {
    log_info "Configuring Nginx..."
    
    # Create systemd service file
    sudo tee /etc/systemd/system/${APP_NAME}.service << EOF
[Unit]
Description=AG-UI Chat Web Server
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=${DEPLOY_DIR}
ExecStart=/usr/bin/env bash -c "env SERVER_NAME=${SERVER_NAME} WS_URL=${WS_URL} /usr/sbin/nginx -c ${CONFIG_DIR}/nginx.conf"
Restart=always
RestartSec=10
Environment=WS_URL=${WS_URL}
Environment=SESSION_ID=${SESSION_ID}
Environment=AUTH_TOKEN=${AUTH_TOKEN}
Environment=SERVER_NAME=${SERVER_NAME}

[Install]
WantedBy=multi-user.target
EOF

    log_info "Systemd service created"
}

start_service() {
    log_info "Starting service..."
    
    # Reload systemd
    sudo systemctl daemon-reload
    
    # Enable and start service
    sudo systemctl enable ${APP_NAME}
    sudo systemctl start ${APP_NAME}
    
    # Check status
    if sudo systemctl is-active --quiet ${APP_NAME}; then
        log_info "Service started successfully"
        sudo systemctl status ${APP_NAME} --no-pager
    else
        log_error "Failed to start service"
        exit 1
    fi
}

health_check() {
    log_info "Performing health check..."
    
    MAX_RETRIES=10
    RETRY_DELAY=2
    RETRY_COUNT=0
    
    while [[ ${RETRY_COUNT} -lt ${MAX_RETRIES} ]]; do
        if curl -sf http://localhost/health > /dev/null 2>&1; then
            log_info "Health check passed!"
            return 0
        fi
        RETRY_COUNT=$((RETRY_COUNT + 1))
        log_warn "Health check failed, retrying in ${RETRY_DELAY}s... (${RETRY_COUNT}/${MAX_RETRIES})"
        sleep ${RETRY_DELAY}
    done
    
    log_error "Health check failed after ${MAX_RETRIES} attempts"
    return 1
}

show_info() {
    echo ""
    echo "=========================================="
    echo "  AG-UI Chat Deployment Complete!"
    echo "=========================================="
    echo ""
    echo "Environment: ${ENVIRONMENT}"
    echo "WebSocket URL: ${WS_URL}"
    echo "Session ID: ${SESSION_ID}"
    echo ""
    echo "Deployment Directory: ${DEPLOY_DIR}"
    echo "Configuration Directory: ${CONFIG_DIR}"
    echo ""
    echo "Useful Commands:"
    echo "  View logs: sudo journalctl -u ${APP_NAME} -f"
    echo "  Restart: sudo systemctl restart ${APP_NAME}"
    echo "  Stop: sudo systemctl stop ${APP_NAME}"
    echo "  Status: sudo systemctl status ${APP_NAME}"
    echo ""
    echo "Access URLs:"
    echo "  Chat: http://${SERVER_NAME}/"
    echo "  Health: http://${SERVER_NAME}/health"
    echo ""
}

# Main execution
main() {
    log_info "Starting AG-UI Chat deployment..."
    log_info "Environment: ${ENVIRONMENT}"
    
    check_root
    create_directories
    backup_existing
    deploy_files
    configure_nginx
    start_service
    
    if health_check; then
        show_info
        log_info "Deployment successful!"
    else
        log_error "Deployment failed!"
        exit 1
    fi
}

# Run main
main
