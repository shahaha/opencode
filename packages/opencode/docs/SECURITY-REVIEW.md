# Security Review - A2A + MCP Integration

## Executive Summary

This document reviews the security characteristics of the A2A (Agent-to-Agent) and MCP (Model Context Protocol) integration implemented for OpenCode. The review identifies potential vulnerabilities and provides mitigation recommendations.

## Security Assessment Summary

| Category               | Risk Level   | Notes                           |
| ---------------------- | ------------ | ------------------------------- |
| Input Validation       | ✅ Good      | Uses Zod for schema validation  |
| Authentication         | ⚠️ Limited   | No auth on internal endpoints   |
| Authorization          | ⚠️ Weak      | No delegation permission checks |
| Tool Invocation        | ⚠️ Medium    | Hardcoded tool mapping          |
| Agent Spoofing         | ⚠️ Medium    | No agent verification           |
| Request Forgery        | ✅ Mitigated | AbortSignal timeouts            |
| Information Disclosure | ⚠️ Low       | Agent details exposed           |
| Memory Safety          | ✅ Good      | In-memory storage               |

---

## Identified Security Issues

### 1. No Authentication on Internal Endpoints (HIGH PRIORITY)

**Location**: All A2A and MCP endpoints

**Issue**: All endpoints are unauthenticated, allowing any client to:

- Register fake agents
- Create delegations to any agent
- Invoke MCP tools
- Access agent health data

**Current State**:

```typescript
// No authentication middleware on any A2A/MCP endpoint
A2ARoutes.post("/agents", async (c) => { ... })
A2ARoutes.post("/delegations", async (c) => { ... })
A2ARoutes.post("/agents/:agentId/mcp/invoke", async (c) => { ... })
```

**Risk**: Malicious actors can:

- Register malicious agents that steal delegation data
- Create unauthorized delegations
- Invoke expensive/dangerous MCP tools
- Monitor agent activity

**Recommendation**:

```typescript
// Add authentication middleware
A2ARoutes.use("/agents", requireAuth())
A2ARoutes.use("/delegations", requireAuth())
A2ARoutes.use("/agents/:agentId/mcp/invoke", requireAuth())
```

---

### 2. No Authorization Checks for Delegations (HIGH PRIORITY)

**Location**: `POST /a2a/delegations` (line 1981)

**Issue**: Any client can create delegations to any registered agent without verifying:

- Whether the client is authorized to use that agent
- Whether the target agent accepts delegations from this source
- Resource quotas or rate limits

**Current State**:

```typescript
A2ARoutes.post("/delegations", async (c) => {
  const params = delegationSchema.parse(body)
  const agent = getAgentById(params.agentId)
  // No authorization check
  const delegation = await delegateTaskToAgent(agent, params.message)
  return c.json({ success: true, delegation })
})
```

**Risk**:

- Unrestricted resource consumption
- Delegation of sensitive data to untrusted agents
- Resource exhaustion attacks

**Recommendation**:

```typescript
A2ARoutes.post("/delegations", async (c) => {
  // Verify client has permission to create delegations
  await authorizeDelegation(c, params.agentId)

  // Check rate limits
  await checkRateLimit(c, "delegations")

  // Verify agent accepts delegations
  if (!agent.capabilities.delegationEnabled) {
    return c.json({ error: "Agent does not accept delegations" }, 403)
  }
})
```

---

### 3. Hardcoded Tool Name Mapping (MEDIUM PRIORITY)

**Location**: `/a2a/agents/:agentId/mcp/invoke` (lines 1630-1650)

**Issue**: Tool names are hardcoded with limited mapping, causing:

- New tools require code changes
- Potential for tool name collisions
- No runtime validation of tool names

**Current State**:

```typescript
if (params.toolName === "context7_query-docs") {
  mcpServer = "context7"
} else if (params.toolName === "web_search_exa") {
  mcpServer = "websearch"
} else if (params.toolName === "grep_app") {
  mcpServer = "grep_app"
}
// No default case handling
```

**Risk**:

- Security bypass via tool name confusion
- Unintended tool invocations
- No audit trail for tool calls

**Recommendation**:

```typescript
// Use dynamic tool lookup from agent's MCP tools list
const toolMap = getToolToServerMapping(agent.mcpTools || [])
const mcpServer = toolMap.get(params.toolName)

if (!mcpServer) {
  return c.json({ error: `Tool not found: ${params.toolName}` }, 404)
}

// Add tool invocation logging
log.toolInvocation({
  agentId,
  toolName: params.toolName,
  arguments: sanitizeArgs(params.arguments),
  timestamp: Date.now(),
})
```

---

### 4. Agent Spoofing Risk (MEDIUM PRIORITY)

**Location**: Agent registration and discovery

**Issue**: Agents can be registered with arbitrary URLs and capabilities without verification:

**Current State**:

```typescript
A2ARoutes.post("/agents", async (c) => {
  const agentData = agentSchema.parse(body)
  // No verification that agent.url is a real agent
  const agent = addManualAgent({
    name: agentData.name,
    url: agentData.url,
    // ... accepts any URL
  })
})
```

**Risk**:

- Man-in-the-middle attacks
- Fake agents collecting sensitive data
- Redirecting delegations to malicious endpoints

**Recommendation**:

```typescript
// Verify agent URL before registration
const verificationUrl = agentData.url + "/.well-known/agent.json"
const response = await fetch(verificationUrl, { signal: AbortSignal.timeout(5000) })

if (!response.ok) {
  return c.json({ error: "Agent verification failed" }, 400)
}

const agentCard = await response.json()
if (agentCard.name !== agentData.name) {
  return c.json({ error: "Agent name mismatch" }, 400)
}
```

---

### 5. No Rate Limiting (LOW PRIORITY)

**Location**: All endpoints

**Issue**: No rate limiting on:

- Agent registration
- Delegation creation
- MCP tool invocation
- Health checks

**Risk**:

- Denial of service attacks
- Resource exhaustion
- Brute force attempts

**Recommendation**:

```typescript
// Add rate limiting middleware
import { rateLimiter } from "./middleware/rate-limit"

A2ARoutes.post("/agents", rateLimiter({ windowMs: 60000, max: 10 }), ...)
A2ARoutes.post("/delegations", rateLimiter({ windowMs: 60000, max: 100 }), ...)
A2ARoutes.post("/agents/:agentId/mcp/invoke", rateLimiter({ windowMs: 60000, max: 50 }), ...)
```

---

### 6. Information Disclosure (LOW PRIORITY)

**Location**: Error messages and agent listings

**Issue**: Detailed error messages and agent information may reveal:

- Internal network structure
- System configuration
- Other agents' capabilities

**Current State**:

```typescript
return c.json({
  error: {
    code: "AGENT_NOT_FOUND",
    message: `Agent not found: ${params.agentId}`, // Reveals agentId format
  },
})
```

**Recommendation**:

```typescript
// Sanitize error messages in production
const errorMessage = process.env.NODE_ENV === "production" ? "Request failed" : `Agent not found: ${params.agentId}`
```

---

### 7. No Input Sanitization for Tool Arguments (LOW PRIORITY)

**Location**: MCP tool invocation

**Issue**: Tool arguments are passed directly without sanitization:

**Current State**:

```typescript
const { toolName, arguments: args } = c.req.valid("json")
const result = await MCP.callTool(name, toolName, args) // Direct pass-through
```

**Risk**:

- Injection attacks via tool arguments
- Denial of service via resource exhaustion
- Data exfiltration via argument manipulation

**Recommendation**:

```typescript
// Validate tool arguments against schema
const tool = getToolSchema(name, toolName)
const validatedArgs = validateArguments(args, tool.inputSchema)

// Add argument size limits
if (JSON.stringify(args).length > MAX_ARG_SIZE) {
  return c.json({ error: "Arguments too large" }, 400)
}
```

---

## Security Best Practices Implemented

### ✅ Input Validation

All endpoints use Zod for schema validation:

- Agent registration: ✅
- Delegation creation: ✅
- MCP tool invocation: ✅
- OAuth flows: ✅

### ✅ Request Timeouts

All external requests use AbortSignal timeouts:

- Agent health checks: 5000ms
- MCP tool calls: 30000ms
- Delegation requests: 60000ms
- SDDP discovery: 2000ms

### ✅ Local Network Restriction

Agent discovery is limited to localhost by default:

```typescript
const wellKnownDomains = ["http://localhost:5000", "http://127.0.0.1:5000", "https://agents.opencode.ai"]
```

---

## Recommended Security Additions

### Priority 1: Authentication & Authorization

1. Add JWT/authentication middleware
2. Implement delegation permission checks
3. Add API key support for MCP servers

### Priority 2: Rate Limiting & Monitoring

1. Add request rate limiting
2. Implement audit logging
3. Add anomaly detection

### Priority 3: Tool Security

1. Add tool argument validation
2. Implement tool allowlisting
3. Add resource usage limits

---

## Compliance Considerations

| Standard     | Status           | Notes                             |
| ------------ | ---------------- | --------------------------------- |
| OWASP Top 10 | ⚠️ Partial       | Missing auth & rate limiting      |
| CWE          | ⚠️ Partial       | Input validation good, auth weak  |
| SOC 2        | ❌ Non-compliant | No access control or audit trails |

---

## Conclusion

The A2A + MCP integration has good input validation and timeout protections but lacks authentication, authorization, and rate limiting. The highest priority security improvements are:

1. **Add authentication** to all endpoints
2. **Implement authorization** for delegations
3. **Add rate limiting** to prevent abuse
4. **Verify agents** before registration

These changes would bring the implementation to an acceptable security baseline for production use.
