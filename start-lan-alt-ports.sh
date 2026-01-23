#!/bin/bash
# OpenCode AG-UI Lan Access - Alternative Ports Startup Script

set -e

echo "🌐 Starting OpenCode AG-UI - LAN Access (Alternative Ports)"
echo "========================================================="

# Load alternative ports environment variables
if [ -f .env.lan.alt-ports ]; then
    # Use grep to filter out comments and empty lines
    export $(grep -v '^#' .env.lan.alt-ports | grep -v '^$' | xargs)
    echo "✅ Loaded alternative ports configuration"
else
    echo "❌ Alternative ports config file not found"
    echo "Please run: ./setup-lan-alt-ports.sh"
    exit 1
fi

# Check required environment variables
if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "change_this_secret_in_production" ]; then
    echo "⚠️  WARNING: JWT_SECRET not set or using default value"
    echo "Please set a secure JWT secret: export JWT_SECRET=your_secure_secret"
fi

if [ -z "$POSTGRES_PASSWORD" ] || [ "$POSTGRES_PASSWORD" = "change_this_password" ]; then
    echo "⚠️  WARNING: POSTGRES_PASSWORD not set or using default value"
    echo "Please set a secure database password: export POSTGRES_PASSWORD=your_secure_password"
fi

# Check port availability
echo "🔍 Checking port availability..."
if lsof -Pi :8080 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "❌ Port 8080 is already in use, please choose a different port"
    exit 1
fi

if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "❌ Port 3001 is already in use, please choose a different port"
    exit 1
fi

echo "✅ Port availability check passed"

# Stop existing services
echo "🛑 Stopping existing services..."
docker-compose -f docker-compose.lan.alt-ports.yml down 2>/dev/null || true

# Clean up resources
echo "🧹 Cleaning up resources..."
docker system prune -f >/dev/null 2>&1 || true

# Start services
echo "▶️  Starting alternative ports services..."
docker-compose -f docker-compose.lan.alt-ports.yml up -d

# Wait for services to start
echo "⏳ Waiting for services to start..."
sleep 25

# Health checks
echo "🏥 Running health checks..."

# Check backend
if curl -s -f http://$HOST_IP:3001/api/health >/dev/null 2>&1; then
    echo "✅ Backend service healthy: http://$HOST_IP:3001"
else
    echo "❌ Backend service unhealthy"
    echo "Check logs: docker-compose -f docker-compose.lan.alt-ports.yml logs opencode-backend"
fi

# Check frontend
if curl -s -f http://$HOST_IP:8080/health >/dev/null 2>&1; then
    echo "✅ Frontend service healthy: http://$HOST_IP:8080"
else
    echo "❌ Frontend service unhealthy"
    echo "Check logs: docker-compose -f docker-compose.lan.alt-ports.yml logs opencode-frontend"
fi

echo ""
echo "🎉 Alternative ports deployment completed!"
echo ""
echo "🌐 Access URLs:"
echo "   Frontend App: http://$HOST_IP:8080"
echo "   Backend API: http://$HOST_IP:3001"
echo "   AG-UI Chat: http://$HOST_IP:8080/agent-chat/test-session"
echo ""
echo "📋 Management Commands:"
echo "   View status: docker-compose -f docker-compose.lan.alt-ports.yml ps"
echo "   View logs: docker-compose -f docker-compose.lan.alt-ports.yml logs -f"
echo "   Stop services: docker-compose -f docker-compose.lan.alt-ports.yml down"
echo ""
echo "🔒 Security Reminder:"
echo "   Ensure LAN environment security"
echo "   Update passwords and keys regularly"
echo "   Monitor network access logs"
echo ""
echo "💡 Tip: These ports don't conflict with JupyterHub"
