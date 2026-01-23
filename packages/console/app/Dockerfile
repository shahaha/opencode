# Build stage
FROM oven/bun:latest AS builder

WORKDIR /app

# Copy entire workspace
COPY . ./

# Install dependencies for all workspaces
RUN bun install

# Build the frontend application
WORKDIR packages/console/app
RUN bun run build

# Production stage
FROM nginx:alpine

# Copy built files from builder stage
COPY --from=builder /app/packages/console/app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY packages/console/app/nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]