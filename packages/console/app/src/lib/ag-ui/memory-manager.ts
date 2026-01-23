// packages/console/app/src/lib/ag-ui/memory-manager.ts
import type { AgentSession, AgentMessage } from "./types"

export class MemoryManager {
  private sessions = new Map<string, AgentSession>()
  private readonly maxSessions = 50
  private readonly maxMessagesPerSession = 100
  private readonly cleanupInterval = 5 * 60 * 1000 // 5 minutes
  private cleanupTimer: number | null = null

  constructor() {
    this.startCleanupTimer()
  }

  addSession(session: AgentSession): void {
    if (this.sessions.size >= this.maxSessions) {
      this.evictOldestSession()
    }

    this.sessions.set(session.id, session)
  }

  getSession(sessionId: string): AgentSession | null {
    const session = this.sessions.get(sessionId)
    if (session) {
      // Update last accessed time
      session.updatedAt = Date.now()
    }
    return session || null
  }

  updateSession(sessionId: string, updates: Partial<AgentSession>): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      Object.assign(session, updates, { updatedAt: Date.now() })

      // Trim messages if exceeding limit
      if (session.messages.length > this.maxMessagesPerSession) {
        session.messages = session.messages.slice(-this.maxMessagesPerSession)
      }
    }
  }

  addMessage(sessionId: string, message: AgentMessage): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.messages.push(message)

      // Trim old messages
      if (session.messages.length > this.maxMessagesPerSession) {
        session.messages = session.messages.slice(-this.maxMessagesPerSession)
      }

      session.updatedAt = Date.now()
    }
  }

  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId)
  }

  private evictOldestSession(): void {
    let oldestTime = Date.now()
    let oldestId = ""

    for (const [id, session] of this.sessions) {
      if (session.updatedAt < oldestTime) {
        oldestTime = session.updatedAt
        oldestId = id
      }
    }

    if (oldestId) {
      this.sessions.delete(oldestId)
    }
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.performCleanup()
    }, this.cleanupInterval)
  }

  private performCleanup(): void {
    const now = Date.now()
    const maxAge = 30 * 60 * 1000 // 30 minutes

    for (const [id, session] of this.sessions) {
      if (now - session.updatedAt > maxAge) {
        this.sessions.delete(id)
      }
    }
  }

  getStats(): {
    sessionCount: number
    totalMessages: number
    memoryUsage: number
  } {
    let totalMessages = 0
    for (const session of this.sessions.values()) {
      totalMessages += session.messages.length
    }

    return {
      sessionCount: this.sessions.size,
      totalMessages,
      memoryUsage: JSON.stringify([...this.sessions]).length,
    }
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
    this.sessions.clear()
  }
}

// Global memory manager instance
export const globalMemoryManager = new MemoryManager()
