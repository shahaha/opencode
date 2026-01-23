#!/bin/bash

# AG-UI Chat Deployment Script with Remote Ollama Support
# Usage: ./deploy-ollama.sh [options]
#
# Options:
#   -e, --environment   Environment (development|production)
#   -w, --ws-url        WebSocket URL
#   -o, --ollama-host   Ollama host URL (e.g., http://100.94.136.15:11434)
#   -s, --session-id    Session ID
#   -t, --token         Auth token
#   -n, --hostname      Server hostname
#   -h, --help          Show this help message

set -e

# Default values
ENVIRONMENT="development"
WS_URL="ws://localhost:5000/ag-ui/ws"
OLLAMA_HOST="http://localhost:11434"
SESSION_ID="test-session"
TOKEN="dev-token-12345"
HOSTNAME="localhost"

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
        -o|--ollama-host)
            OLLAMA_HOST="$2"
            shift 2
            ;;
        -s|--session-id)
            SESSION_ID="$2"
            shift 2
            ;;
        -t|--token)
            TOKEN="$2"
            shift 2
            ;;
        -n|--hostname)
            HOSTNAME="$2"
            shift 2
            ;;
        -h|--help)
            head -20 "$0"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            head -20 "$0"
            exit 1
            ;;
    esac
done

echo "========================================"
echo "AG-UI Chat Deployment with Remote Ollama"
echo "========================================"
echo ""
echo "Configuration:"
echo "  Environment: $ENVIRONMENT"
echo "  WebSocket URL: $WS_URL"
echo "  Ollama Host: $OLLAMA_HOST"
echo "  Session ID: $SESSION_ID"
echo "  Hostname: $HOSTNAME"
echo ""

# Check if Ollama is accessible
echo "Testing Ollama connection to $OLLAMA_HOST..."
if curl -s --max-time 5 "$OLLAMA_HOST/api/tags" > /dev/null 2>&1; then
    echo "✅ Ollama is accessible"
    curl -s "$OLLAMA_HOST/api/tags" | python3 -c "import sys,json; models=json.load(sys.stdin).get('models',[]); print(f'   Available models: {len(models)}')" 2>/dev/null || echo "   Could not get model list"
else
    echo "⚠️  Warning: Cannot connect to Ollama at $OLLAMA_HOST"
    echo "   Make sure Ollama is running and accessible"
    echo "   For remote hosts, ensure firewall allows port 11434"
fi

echo ""
echo "Deployment complete!"
echo ""
echo "To start the server with remote Ollama:"
echo "  OLLAMA_HOST=$OLLAMA_HOST bun run --conditions=browser ./src/index.ts serve --port 5000"
echo ""
echo "Or set it in your environment:"
echo "  export OLLAMA_HOST=$OLLAMA_HOST"
