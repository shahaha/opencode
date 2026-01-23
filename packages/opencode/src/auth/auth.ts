// packages/opencode/src/auth/auth.ts
export namespace Auth {
  export interface User {
    id: string
    email: string
    workspaceId?: string
    permissions: string[]
  }

  export async function validateToken(token: string): Promise<any> {
    // Simple token validation for development
    // In production, this should validate JWT tokens properly
    if (!token || token.length < 10) {
      return null
    }

    // Mock JWT payload for development (what middleware expects)
    return {
      sub: "dev-user-123",
      email: "dev@example.com",
      workspaceId: "dev-workspace",
      permissions: ["agent:default", "session:read", "session:write"],
    }
  }

  export async function validateSession(sessionId: string, userId: string): Promise<any> {
    // Simple session validation
    if (!sessionId || !userId) {
      return null
    }

    // Mock session validation
    return {
      id: sessionId,
      userId,
      agentId: "default",
      status: "active",
      createdAt: new Date().toISOString(),
    }
  }
}
