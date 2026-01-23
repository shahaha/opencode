# A2A + MCP Integration API Documentation

## Overview

This document describes the Agent-to-Agent (A2A) and Model Context Protocol (MCP) API endpoints implemented for the OpenCode application. These protocols enable agents to discover each other, delegate tasks, and share MCP tools across the network.

## A2A Protocol (Agent-to-Agent)

The A2A protocol is based on the [A2A Protocol Specification](https://a2a-protocol.org/latest/) and enables agents to communicate with each other for task delegation.

### Agent Card Endpoints

#### GET /.well-known/agent.json

Returns the agent's capabilities and MCP tools for discovery.

**Response:**

```json
{
  "name": "OpenCode Agent",
  "description": "A powerful AI coding assistant...",
  "url": "http://localhost:5000/a2a",
  "provider": {
    "organization": "OpenCode",
    "url": "https://opencode.ai"
  },
  "version": "1.0.0",
  "capabilities": {
    "streaming": true,
    "pushNotifications": false,
    "stateTransitionHistory": true
  },
  "authentication": {
    "schemes": ["Bearer"]
  },
  "skills": [...],
  "mcpTools": [...]
}
```

#### GET /a2a/agent-card

Alias for `/.well-known/agent.json`.

### Agent Management

#### GET /a2a/agents

Lists all discovered or registered agents.

**Response:**

```json
{
  "agents": [
    {
      "name": "External Agent",
      "url": "http://localhost:5001/a2a",
      "provider": {"organization": "Test Org"},
      "version": "1.0.0",
      "capabilities": {"streaming": true, ...},
      "status": "available",
      "id": "agent_aHR0cDovL2xvY2Fs",
      "source": "manual",
      "discoveredAt": 1769134877903
    }
  ],
  "total": 1,
  "status": {
    "total": 1,
    "available": 1,
    "unavailable": 0
  }
}
```

#### POST /a2a/agents

Registers a new agent manually.

**Request Body:**

```json
{
  "name": "External Agent",
  "url": "http://localhost:5001/a2a",
  "provider": { "organization": "Test Org" },
  "version": "1.0.0",
  "capabilities": { "streaming": true }
}
```

**Response:**

```json
{
  "success": true,
  "agent": {
    "name": "External Agent",
    "url": "http://localhost:5001/a2a",
    "status": "available",
    "id": "agent_aHR0cDovL2xvY2Fs",
    "source": "manual",
    "discoveredAt": 1769134877903
  }
}
```

#### GET /a2a/agents/:agentId

Gets details of a specific agent.

#### DELETE /a2a/agents/:agentId

Removes an agent from the registry.

#### GET /a2a/agents/:agentId/capabilities

Gets an agent's capabilities including supported features and skills.

### Agent Discovery

#### POST /a2a/agents/discover

Discovers agents from configured registries.

#### POST /a2a/agents/discover/sddp

Discovers agents on the local network using SDDP (Service Discovery and Description Protocol).

### Health Monitoring

#### GET /a2a/agents/health

Gets health status of all registered agents.

**Response:**

```json
{
  "agents": {
    "agent_aHR0cDovL2xvY2Fs": {
      "agentId": "agent_aHR0cDovL2xvY2Fs",
      "url": "http://localhost:5001/a2a",
      "lastHeartbeat": 1769134942720,
      "status": "online",
      "responseTime": 314
    }
  },
  "total": 1,
  "monitor": {
    "running": true,
    "checkInterval": 10000,
    "timeout": 30000
  }
}
```

#### GET /a2a/agents/:agentId/health

Gets health status of a specific agent.

#### POST /a2a/agents/heartbeat

Agent reports its own heartbeat status.

**Request Body:**

```json
{
  "agentId": "agent_aHR0cDovL2xvY2Fs",
  "status": "online",
  "load": 45,
  "activeTasks": 2
}
```

### Heartbeat Monitor Control

#### POST /a2a/monitor/start

Starts the background heartbeat monitoring service.

#### POST /a2a/monitor/stops

Stops the background heartbeat monitoring service.

### A2A Tasks (Standard Protocol)

#### POST /a2a/tasks

Creates a new task with an agent (standard A2A protocol).

#### GET /a2a/tasks

Lists tasks.

#### GET /a2a/tasks/:taskId

Gets task details and messages.

#### POST /a2a/tasks/:taskId/messages

Adds a message to a task.

#### POST /a2a/tasks/:taskId/cancel

Cancels a task.

#### GET /a2a/tasks/:taskId/stream

Streams task updates (for streaming-capable agents).

### Delegations (Custom Extension)

#### POST /a2a/delegations

Creates a delegation to another agent.

**Request Body:**

```json
{
  "agentId": "agent_aHR0cDovL2xvY2Fs",
  "message": {
    "role": "user",
    "parts": [{ "type": "text", "text": "Hello, can you help me?" }]
  }
}
```

**Response:**

```json
{
  "success": true,
  "delegation": {
    "taskId": "delegation_1769134900181_2",
    "agentId": "agent_aHR0cDovL2xvY2Fs",
    "agentName": "External Agent",
    "status": "completed",
    "createdAt": 1769134900181
  }
}
```

#### GET /a2a/delegations

Lists all delegations.

#### GET /a2a/delegations/:taskId

Gets delegation details.

#### GET /a2a/delegations/:taskId/mcp/tools

Gets MCP tools available for a delegation.

**Response:**

```json
{
  "tools": [
    {
      "name": "context7_query-docs",
      "description": "Query Context7 documentation...",
      "inputSchema": {
        "type": "object",
        "properties": {
          "libraryId": { "type": "string" },
          "query": { "type": "string" }
        },
        "required": ["libraryId", "query"]
      }
    },
    {
      "name": "web_search_exa",
      "description": "Search the web using Exa AI..."
    },
    {
      "name": "grep_app",
      "description": "Search code patterns in the codebase..."
    },
    {
      "name": "lsp_goto_definition",
      "description": "Go to symbol definition in code..."
    }
  ],
  "sourceAgent": "opencode-local",
  "targetAgent": "External Agent"
}
```

#### POST /a2a/delegations/:taskId/mcp/invoke

Invokes an MCP tool on behalf of the target agent.

**Request Body:**

```json
{
  "toolName": "grep_app",
  "arguments": {
    "pattern": "function.*test",
    "path": "/home/rick/prj/opencode"
  }
}
```

---

## MCP Protocol (Model Context Protocol)

The MCP protocol enables agents to expose tools to each other.

### MCP Server Endpoints

#### GET /mcp

Lists available MCP servers.

**Response:**

```json
{
  "servers": {
    "context7": {
      "name": "Context7",
      "status": "connected",
      "tools": 2
    },
    "websearch": {
      "name": "Web Search",
      "status": "connected",
      "tools": 2
    },
    "grep_app": {
      "name": "Code Search",
      "status": "connected",
      "tools": 1
    }
  }
}
```

#### GET /mcp/:name/tools

Lists tools available on an MCP server.

**Response:**

```json
{
  "context7_resolve-library-id": "Resolves a package/product name to a Context7-compatible library ID...",
  "context7_query-docs": "Retrieves and queries up-to-date documentation..."
}
```

#### POST /mcp/:name/call

Calls an MCP tool.

**Request Body:**

```json
{
  "toolName": "context7_resolve-library-id",
  "arguments": {
    "libraryName": "next-js",
    "query": "How to set up Next.js"
  }
}
```

#### GET /mcp/:name

Gets MCP server status.

#### POST /mcp/:name/auth

Starts OAuth flow for an MCP server.

**Response:**

```json
{
  "authorizationUrl": "https://provider.com/oauth/authorize?..."
}
```

#### DELETE /mcp/:name/auth

Disconnects authentication for an MCP server.

---

## Configuration

### Discovery Configuration

```typescript
const discoveryConfig = {
  registries: [
    {
      url: "http://localhost:5000",
      name: "Local OpenCode",
      enabled: true,
    },
  ],
  wellKnownDomains: ["http://localhost:5000", "http://127.0.0.1:5000", "https://agents.opencode.ai"],
  scanInterval: 300000, // 5 minutes
}
```

### Heartbeat Monitoring Configuration

- **CHECK_INTERVAL**: 10 seconds (how often to check agent health)
- **HEARTBEAT_TIMEOUT**: 30 seconds (agent considered offline after this)

---

## Usage Examples

### Register an External Agent

```bash
curl -X POST http://localhost:5000/a2a/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "External Agent",
    "url": "http://localhost:5001/a2a",
    "provider": {"organization": "Test"},
    "version": "1.0.0",
    "capabilities": {"streaming": true}
  }'
```

### Create a Delegation

```bash
curl -X POST http://localhost:5000/a2a/delegations \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent_aHR0cDovL2xvY2Fs",
    "message": {
      "role": "user",
      "parts": [{"type": "text", "text": "Hello from main server!"}]
    }
  }'
```

### Get Shared MCP Tools

```bash
curl http://localhost:5000/a2a/delegations/delegation_xxx/mcp/tools
```

### Check Agent Health

```bash
curl http://localhost:5000/a2a/agents/health
```

---

## Status Codes

| Code | Description  |
| ---- | ------------ |
| 200  | Success      |
| 400  | Bad Request  |
| 404  | Not Found    |
| 500  | Server Error |

---

## Agent ID Format

Agent IDs are generated from the agent URL using base64 encoding:

```
agent_${base64(agentUrl)}
```

Example: `agent_aHR0cDovL2xvY2Fs` = `agent_${base64("http://localhost")}`

---

## Security Considerations

1. **Authentication**: Agents may require Bearer token authentication
2. **Tool Sandboxing**: MCP tools are invoked within the target agent's context
3. **Network Isolation**: Local network discovery is limited to localhost by default
4. **OAuth**: External MCP servers require OAuth flow for authentication
