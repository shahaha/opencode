# AG-UI Chat Docker Deployment
# Build: docker build -t ag-ui-chat -f deploy/ag-ui-chat/Dockerfile .
# Run: docker run -p 80:80 -e WS_URL=ws://your-backend:5000/ag-ui/ag-ui-chat

# Use nginx-alpine for small footprint
FROM nginx:alpine

# Install curl for health check
RUN apk add --no-cache curl bash

# Copy custom nginx configuration
COPY deploy/ag-ui-chat/nginx-docker.conf /etc/nginx/nginx.conf

# Create directory for static files
RUN mkdir -p /usr/share/nginx/html

# Copy the chat application
COPY deploy/ag-ui-chat/production-agui-chat.html /usr/share/nginx/html/

# Make health check script executable
RUN chmod +x /docker-entrypoint.d/healthcheck.sh

# Set environment variables with defaults
ENV WS_URL=ws://127.0.0.1:5000/ag-ui/ws
ENV SESSION_ID=test-session
ENV AUTH_TOKEN=dev-token-12345
ENV SERVER_NAME=localhost

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/health || exit 1

# Entrypoint scripts
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
