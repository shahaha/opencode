#!/bin/bash
# WebSocket Health Check Script
# Monitors WebSocket connection status and alerts on failures

set -e

# Configuration
BACKEND_HOST="${BACKEND_HOST:-192.168.0.221}"
BACKEND_PORT="${BACKEND_PORT:-4000}"
CHECK_INTERVAL="${CHECK_INTERVAL:-30}"
LOG_FILE="${LOG_FILE:-websocket-health.log}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

check_websocket_upgrade() {
    local response
    response=$(curl -s -w "%{http_code}" -o /dev/null \
        -H "Connection: Upgrade" \
        -H "Upgrade: websocket" \
        -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" \
        -H "Sec-WebSocket-Version: 13" \
        --max-time 10 \
        "http://$BACKEND_HOST:$BACKEND_PORT/ag-ui/ws" 2>/dev/null)

    if [ "$response" = "200" ]; then
        # 200 OK means it's serving HTML instead of proper WebSocket upgrade
        return 1
    elif [ "$response" = "000" ]; then
        # Connection failed
        return 2
    else
        # Any other response (like 101 Switching Protocols would be ideal)
        return 0
    fi
}

check_backend_health() {
    local response
    response=$(curl -s -w "%{http_code}" -o /dev/null \
        --max-time 5 \
        "http://$BACKEND_HOST:$BACKEND_PORT/" 2>/dev/null)

    if [ "$response" = "200" ]; then
        return 0
    else
        return 1
    fi
}

send_alert() {
    local message="$1"
    local severity="${2:-WARNING}"

    log "${RED}[$severity]${NC} $message"

    # Here you could add email notifications, Slack alerts, etc.
    # Example:
    # curl -X POST -H 'Content-type: application/json' \
    #      --data "{\"text\":\"WebSocket Alert: $message\"}" \
    #      "$SLACK_WEBHOOK_URL"
}

main() {
    log "Starting WebSocket health monitoring"
    log "Backend: $BACKEND_HOST:$BACKEND_PORT"
    log "Check interval: ${CHECK_INTERVAL}s"
    log "Log file: $LOG_FILE"

    local consecutive_failures=0
    local max_consecutive_failures=3

    while true; do
        # Check backend general health
        if ! check_backend_health; then
            send_alert "Backend health check failed - server may be down" "CRITICAL"
            consecutive_failures=$((consecutive_failures + 1))
        else
            log "${GREEN}✓${NC} Backend health OK"
        fi

        # Check WebSocket endpoint
        if check_websocket_upgrade; then
            log "${GREEN}✓${NC} WebSocket endpoint accessible"
            consecutive_failures=0
        else
            local exit_code=$?
            if [ $exit_code -eq 1 ]; then
                send_alert "WebSocket endpoint returning HTML instead of WebSocket upgrade" "ERROR"
            elif [ $exit_code -eq 2 ]; then
                send_alert "WebSocket endpoint connection failed" "ERROR"
            fi
            consecutive_failures=$((consecutive_failures + 1))
        fi

        # Alert if too many consecutive failures
        if [ $consecutive_failures -ge $max_consecutive_failures ]; then
            send_alert "WebSocket monitoring: $consecutive_failures consecutive failures detected" "CRITICAL"
        fi

        sleep "$CHECK_INTERVAL"
    done
}

# Run main function
main