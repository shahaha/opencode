// packages/opencode/src/server/middleware/a2a-auth.ts
import { createMiddleware } from "hono/factory"
import { HTTPException } from "hono/http-exception"
import { Log } from "../../util/log"

const log = Log.create({ service: "a2a-auth" })

export interface A2AAuthUser {
  id: string
  type: "user" | "agent" | "system"
  permissions: string[]
}

// Optional auth mode - allows requests without token in development mode
const isOptionalAuth = process.env.A2A_AUTH_OPTIONAL === "true"

// API Key for internal service communication
const INTERNAL_API_KEY = process.env.A2A_INTERNAL_API_KEY || ""

// Authentication middleware for A2A/MCP endpoints
export const a2aAuth = createMiddleware(async (c, next) => {
  const authHeader = c.req.header("Authorization")
  const apiKey = c.req.header("X-API-Key")

  // Skip auth in optional mode for development
  if (isOptionalAuth && !authHeader && !apiKey) {
    log.debug("Auth skipped in optional mode")
    c.set("a2aUser", {
      id: "anonymous",
      type: "user",
      permissions: ["delegation:create", "agent:read"],
    } as A2AAuthUser)
    return next()
  }

  // Check for API key authentication
  if (apiKey) {
    if (apiKey === INTERNAL_API_KEY && INTERNAL_API_KEY) {
      log.debug("API key authentication successful")
      c.set("a2aUser", {
        id: "internal-service",
        type: "system",
        permissions: ["delegation:create", "agent:manage", "mcp:invoke"],
      } as A2AAuthUser)
      return next()
    }

    // Invalid API key
    throw new HTTPException(401, { message: "Invalid API key" })
  }

  // Check for Bearer token authentication
  if (authHeader) {
    if (!authHeader.startsWith("Bearer ")) {
      throw new HTTPException(401, { message: "Invalid authorization format. Use 'Bearer <token>'" })
    }

    const token = authHeader.substring(7)

    try {
      // Simple token validation (replace with proper JWT in production)
      const user = validateA2AToken(token)
      c.set("a2aUser", user)
      log.info("A2A authentication successful", { userId: user.id, type: user.type })
      return next()
    } catch (error) {
      log.error("A2A authentication failed", { error: (error as Error).message })
      throw new HTTPException(401, { message: "Invalid or expired token" })
    }
  }

  // No authentication provided
  if (isOptionalAuth) {
    c.set("a2aUser", {
      id: "anonymous",
      type: "user",
      permissions: ["delegation:create", "agent:read"],
    } as A2AAuthUser)
    return next()
  }

  throw new HTTPException(401, { message: "Authentication required" })
})

// Validate A2A token and extract user info
function validateA2AToken(token: string): A2AAuthUser {
  // In production, use proper JWT validation
  // This is a simplified version for demonstration

  if (!token || token.length < 8) {
    throw new Error("Invalid token format")
  }

  // Decode token (base64 encoded JSON in this simple implementation)
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"))
    return {
      id: decoded.sub || decoded.id || "unknown",
      type: decoded.type || "user",
      permissions: decoded.permissions || ["delegation:create", "agent:read"],
    }
  } catch {
    // For development, allow simple tokens like "user-123"
    if (token.startsWith("user-")) {
      return {
        id: token,
        type: "user",
        permissions: ["delegation:create", "agent:read"],
      }
    }

    if (token.startsWith("agent-")) {
      return {
        id: token,
        type: "agent",
        permissions: ["delegation:accept", "mcp:invoke"],
      }
    }

    throw new Error("Invalid token")
  }
}

// Authorization middleware for specific permissions
export const requirePermission = (...requiredPermissions: string[]) => {
  return createMiddleware(async (c, next) => {
    const user = c.get("a2aUser") as A2AAuthUser | undefined

    if (!user) {
      throw new HTTPException(401, { message: "Authentication required" })
    }

    // System users have all permissions
    if (user.type === "system") {
      return next()
    }

    // Check if user has any of the required permissions
    const hasPermission = requiredPermissions.some((perm) => user.permissions.includes(perm))

    if (!hasPermission) {
      log.warn("Permission denied", {
        userId: user.id,
        required: requiredPermissions,
        has: user.permissions,
      })
      throw new HTTPException(403, { message: `Required permission: ${requiredPermissions.join(" or ")}` })
    }

    await next()
  })
}

// Pre-configured middleware for common A2A operations
export const a2aAuthWithDelegation = [a2aAuth, requirePermission("delegation:create")]
export const a2aAuthWithAgentManage = [a2aAuth, requirePermission("agent:manage")]
export const a2aAuthWithMcpInvoke = [a2aAuth, requirePermission("mcp:invoke")]

// Get current user from context
export const getA2AUser = (c: any): A2AAuthUser | null => {
  return c.get("a2aUser") || null
}
