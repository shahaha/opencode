# OpenCode AG-UI Integration - Production Deployment Guide

## Prerequisites

### System Requirements

- Node.js 22+
- Bun runtime
- PostgreSQL 15+
- Redis (optional, for rate limiting)

### Environment Variables

#### Required

```bash
# API Configuration
VITE_OPENCODE_API_URL=https://api.opencode.ai
VITE_OPENCODE_WS_URL=wss://api.opencode.ai

# Authentication
VITE_AUTH_URL=https://auth.opencode.ai
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Monitoring (optional)
VITE_SENTRY_DSN=https://...
VITE_DATADOG_CLIENT_TOKEN=...
```

#### Server Environment Variables

```bash
# Database
DATABASE_URL=postgresql://...

# Authentication
JWT_SECRET=your-secret-key
OPENCODE_SERVER_PASSWORD=secure-password

# External Services
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Monitoring
SENTRY_DSN=https://...
DD_API_KEY=...
```

## Build Process

### Frontend Build

```bash
cd packages/console/app

# Install dependencies
bun install

# Run production checks
bun run check:production

# Build for production
bun run build

# Preview build
bun run preview
```

### Backend Build

```bash
cd packages/opencode

# Install dependencies
bun install

# Type checking
bun run typecheck

# Build
bun run build
```

## Deployment

### Docker Deployment

#### Dockerfile (Frontend)

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

#### Dockerfile (Backend)

```dockerfile
FROM oven/bun:1-alpine
WORKDIR /app
COPY package*.json ./
RUN bun install --production
COPY . .
EXPOSE 3000
CMD ["bun", "run", "src/index.ts"]
```

#### Docker Compose

```yaml
version: "3.8"
services:
  opencode-frontend:
    build: ./packages/console/app
    ports:
      - "80:80"
    environment:
      - VITE_OPENCODE_API_URL=https://api.opencode.ai

  opencode-backend:
    build: ./packages/opencode
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: opencode
      POSTGRES_USER: opencode
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}

  redis:
    image: redis:7-alpine
```

### Cloud Deployment Options

#### Vercel (Frontend)

```javascript
// vercel.json
{
  "buildCommand": "bun run build",
  "outputDirectory": "dist",
  "installCommand": "bun install",
  "framework": null,
  "env": {
    "VITE_OPENCODE_API_URL": "@opencode-api-url"
  }
}
```

#### Railway/Fly.io (Backend)

- Use the provided Dockerfiles
- Configure environment variables
- Set up database connections
- Enable WebSocket support

## Monitoring Setup

### Application Monitoring

#### Sentry (Error Tracking)

```javascript
// src/lib/sentry.ts
import * as Sentry from "@sentry/browser"

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.PROD ? "production" : "development",
  integrations: [new Sentry.BrowserTracing(), new Sentry.Replay()],
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
})
```

#### DataDog (Metrics & APM)

```javascript
// src/lib/datadog.ts
import { datadogRum } from "@datadog/browser-rum"

datadogRum.init({
  applicationId: "your-app-id",
  clientToken: import.meta.env.VITE_DATADOG_CLIENT_TOKEN,
  site: "datadoghq.com",
  service: "opencode-agui",
  env: import.meta.env.PROD ? "production" : "development",
  version: "1.0.0",
  sessionSampleRate: 100,
  sessionReplaySampleRate: 20,
  trackUserInteractions: true,
  trackResources: true,
  trackLongTasks: true,
  defaultPrivacyLevel: "mask-user-input",
})

datadogRum.startSessionReplayRecording()
```

### Infrastructure Monitoring

#### Health Checks

```typescript
// Server health endpoint
app.get("/health", (c) => {
  return c.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  })
})

// AG-UI specific health check
app.get("/health/ag-ui", async (c) => {
  try {
    // Test WebSocket connection
    // Test database connectivity
    // Test external API connectivity

    return c.json({
      status: "healthy",
      websocket: "ok",
      database: "ok",
      external_apis: "ok",
    })
  } catch (error) {
    return c.json(
      {
        status: "unhealthy",
        error: error.message,
      },
      503,
    )
  }
})
```

#### Log Aggregation

```typescript
// Winston logger configuration
import winston from "winston"

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  defaultMeta: { service: "opencode-agui" },
  transports: [
    // Console for development
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),

    // File for production
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
    }),
    new winston.transports.File({
      filename: "logs/combined.log",
    }),

    // External service (e.g., DataDog, CloudWatch)
    ...(process.env.LOG_TRANSPORT === "datadog"
      ? [
          new winston.transports.Http({
            host: "http-intake.logs.datadoghq.com",
            path: `/api/v2/logs?dd-api-key=${process.env.DD_API_KEY}&ddsource=nodejs&service=opencode-agui`,
            ssl: true,
          }),
        ]
      : []),
  ],
})
```

## Performance Optimization

### Frontend Optimizations

#### Code Splitting

```typescript
// src/routes/agent-chat.lazy.tsx
import { lazy } from 'solid-js';

const AgentChatPage = lazy(() => import('./agent-chat'));

export default function LazyAgentChatPage() {
  return <AgentChatPage />;
}
```

#### Bundle Analysis

```bash
# Analyze bundle size
npm run build
npx vite-bundle-analyzer dist/static

# Check for large dependencies
npx webpack-bundle-analyzer dist/static/js/*.js
```

### Backend Optimizations

#### Connection Pooling

```typescript
// Database connection pooling
import { Pool } from "pg"

export const dbPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})
```

#### Caching Strategy

```typescript
// Redis caching for session data
import { createClient } from "redis"

const redisClient = createClient({
  url: process.env.REDIS_URL,
})

export async function getCachedSession(sessionId: string) {
  const cached = await redisClient.get(`session:${sessionId}`)
  return cached ? JSON.parse(cached) : null
}

export async function setCachedSession(sessionId: string, session: any, ttl = 3600) {
  await redisClient.setEx(`session:${sessionId}`, ttl, JSON.stringify(session))
}
```

## Security Checklist

### Pre-deployment Security Review

- [ ] All environment variables are properly configured
- [ ] JWT tokens have appropriate expiration times
- [ ] Rate limiting is configured for API endpoints
- [ ] Input validation is implemented for all user inputs
- [ ] HTTPS is enforced for all connections
- [ ] Content Security Policy (CSP) headers are set
- [ ] CORS is properly configured
- [ ] Sensitive data is not logged
- [ ] Dependencies are scanned for vulnerabilities

### Runtime Security

- [ ] WebSocket connections require authentication
- [ ] File uploads are validated and scanned
- [ ] API keys are rotated regularly
- [ ] Audit logs are monitored
- [ ] Intrusion detection is enabled

## Rollback Strategy

### Blue-Green Deployment

```bash
# Deploy new version to staging
kubectl set image deployment/opencode-backend opencode-backend=new-version

# Run tests against staging
npm run test:e2e -- --baseUrl=https://staging.opencode.ai

# Promote to production
kubectl set image deployment/opencode-backend opencode-backend=new-version
```

### Feature Flags

```typescript
// Feature flag system
export const features = {
  aguiChat: process.env.FEATURE_AGUI_CHAT === "true",
  advancedLogging: process.env.FEATURE_ADVANCED_LOGGING === "true",
}

// Usage
if (features.aguiChat) {
  // Enable AG-UI features
}
```

### Database Migrations

```sql
-- Migration scripts
-- Version 1.0.0: Add AG-UI tables
CREATE TABLE agui_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  agent_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE agui_messages (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES agui_sessions(id),
  role VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## User Documentation

### Setup Guide

1. Environment configuration
2. Database setup
3. External service integration
4. SSL certificate installation

### API Documentation

- REST API endpoints
- WebSocket message formats
- Authentication flows
- Error codes and handling

### Troubleshooting Guide

- Common deployment issues
- Performance tuning
- Monitoring dashboards
- Support contact information

## Go-Live Checklist

### Pre-launch

- [ ] All tests passing (unit, integration, E2E)
- [ ] Performance benchmarks met
- [ ] Security audit completed
- [ ] Documentation updated
- [ ] Team training completed

### Launch Day

- [ ] Deploy to staging environment
- [ ] Run smoke tests
- [ ] Monitor error rates and performance
- [ ] Gradual rollout (canary deployment)
- [ ] Monitor user feedback

### Post-launch

- [ ] Monitor key metrics
- [ ] Address user-reported issues
- [ ] Plan for scaling
- [ ] Schedule regular maintenance
