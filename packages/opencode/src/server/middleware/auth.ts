// packages/opencode/src/server/middleware/auth.ts
import { createMiddleware } from "hono/factory"
import { HTTPException } from "hono/http-exception"
import { Auth } from "../../auth/auth"
import { Log } from "../../util/log"

const log = Log.create({ service: "auth" })

export interface AuthUser {
  id: string
  email: string
  workspaceId?: string
  permissions: string[]
}

// JWT authentication middleware for AG-UI routes
export const aguiAuth = createMiddleware(async (c, next) => {
  const authHeader = c.req.header("Authorization")

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Missing or invalid authorization header" })
  }

  const token = authHeader.substring(7) // Remove 'Bearer ' prefix

  try {
    // Validate JWT token
    const payload = await Auth.validateToken(token)

    if (!payload) {
      throw new HTTPException(401, { message: "Invalid token" })
    }

    // Extract user information
    const user: AuthUser = {
      id: payload.sub,
      email: payload.email || "",
      workspaceId: payload.workspaceId,
      permissions: payload.permissions || [],
    }

    // Store user in context
    c.set("user", user)

    log.info("User authenticated", {
      userId: user.id,
      email: user.email,
      workspaceId: user.workspaceId,
    })

    await next()
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    log.error("Authentication failed", { error: errorMessage, token: token.substring(0, 10) + "..." })
    throw new HTTPException(401, { message: "Authentication failed" })
  }
})

// Session authorization middleware
export const sessionAuth = createMiddleware(async (c, next) => {
  const user = c.get("user") as AuthUser
  const sessionId = c.req.query("sessionId") || c.req.header("X-Session-ID")

  if (!sessionId) {
    throw new HTTPException(400, { message: "Session ID required" })
  }

  try {
    // Validate session ownership
    const session = await Auth.validateSession(sessionId, user.id)

    if (!session) {
      throw new HTTPException(403, { message: "Access denied to session" })
    }

    // Check if user has permission to access this agent
    if (session.agentId && !user.permissions.includes(`agent:${session.agentId}`)) {
      // Allow access to default agent for all authenticated users
      if (session.agentId !== "default") {
        throw new HTTPException(403, { message: "Insufficient permissions for this agent" })
      }
    }

    c.set("session", session)

    log.info("Session authorized", {
      sessionId,
      userId: user.id,
      agentId: session.agentId,
    })

    await next()
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    log.error("Session authorization failed", {
      error: errorMessage,
      sessionId,
      userId: user?.id,
    })

    throw new HTTPException(403, { message: "Session authorization failed" })
  }
})

// Combined AG-UI authentication middleware
export const aguiAuthMiddleware = [aguiAuth, sessionAuth]
