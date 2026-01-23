// packages/opencode/src/server/middleware/content-filter.ts
import { createMiddleware } from "hono/factory"
import { HTTPException } from "hono/http-exception"
import { Log } from "../../util/log"

const log = Log.create({ service: "content-filter" })

// Content filtering configuration
const FILTER_CONFIG = {
  maxMessageLength: 10000,
  maxMessagesPerMinute: 60,
  blockedWords: [
    // Add blocked words/phrases as needed
    "inappropriate content",
    // This should be configurable and loaded from a database
  ],
  allowedDomains: [
    "github.com",
    "stackoverflow.com",
    "opencode.ai",
    // Add allowed domains for links
  ],
}

// Rate limiting storage (in production, use Redis or similar)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

export class ContentFilter {
  static validateMessage(content: string, userId: string): { valid: boolean; reason?: string } {
    // Check message length
    if (content.length > FILTER_CONFIG.maxMessageLength) {
      return {
        valid: false,
        reason: `Message too long (${content.length}/${FILTER_CONFIG.maxMessageLength} characters)`,
      }
    }

    // Check for empty messages
    if (content.trim().length === 0) {
      return {
        valid: false,
        reason: "Message cannot be empty",
      }
    }

    // Check for blocked words
    const lowerContent = content.toLowerCase()
    for (const blockedWord of FILTER_CONFIG.blockedWords) {
      if (lowerContent.includes(blockedWord.toLowerCase())) {
        return {
          valid: false,
          reason: "Message contains inappropriate content",
        }
      }
    }

    // Check for malicious links (basic check)
    const urlRegex = /(https?:\/\/[^\s]+)/g
    const urls = content.match(urlRegex)

    if (urls) {
      for (const url of urls) {
        try {
          const urlObj = new URL(url)
          const domain = urlObj.hostname.toLowerCase()

          // Check if domain is in allowed list
          const isAllowed = FILTER_CONFIG.allowedDomains.some(
            (allowed) => domain === allowed || domain.endsWith("." + allowed),
          )

          if (!isAllowed) {
            return {
              valid: false,
              reason: `Links to ${domain} are not allowed`,
            }
          }
        } catch (error) {
          // Invalid URL format
          return {
            valid: false,
            reason: "Invalid URL format detected",
          }
        }
      }
    }

    return { valid: true }
  }

  static checkRateLimit(userId: string): { allowed: boolean; resetIn?: number } {
    const now = Date.now()
    const windowMs = 60 * 1000 // 1 minute
    const key = `rate_limit:${userId}`

    const userLimit = rateLimitStore.get(key)

    if (!userLimit || now > userLimit.resetTime) {
      // Reset or initialize rate limit
      rateLimitStore.set(key, {
        count: 1,
        resetTime: now + windowMs,
      })
      return { allowed: true }
    }

    if (userLimit.count >= FILTER_CONFIG.maxMessagesPerMinute) {
      const resetIn = Math.ceil((userLimit.resetTime - now) / 1000)
      return { allowed: false, resetIn }
    }

    userLimit.count++
    return { allowed: true }
  }

  static sanitizeOutput(content: string): string {
    // Basic HTML sanitization (in production, use a proper sanitizer)
    return content
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;")
      .replace(/\//g, "&#x2F;")
  }

  static auditMessage(userId: string, sessionId: string, content: string, action: "sent" | "received"): void {
    log.info("Message audit", {
      userId,
      sessionId,
      action,
      contentLength: content.length,
      timestamp: new Date().toISOString(),
      // In production, store in database for compliance
    })
  }
}

// Content filtering middleware
export const contentFilterMiddleware = createMiddleware(async (c, next) => {
  const user = c.get("user")
  const session = c.get("session")

  // Skip filtering for WebSocket upgrades (GET requests with upgrade headers)
  const isWebSocketUpgrade =
    c.req.method === "GET" &&
    c.req.header("Connection")?.toLowerCase().includes("upgrade") &&
    c.req.header("Upgrade")?.toLowerCase() === "websocket"

  if (isWebSocketUpgrade) {
    return next()
  }

  // Only filter message-related requests
  if (c.req.method === "POST" && c.req.path.includes("/ag-ui")) {
    try {
      const body = await c.req.json()
      const message = body.params?.content || body.content

      if (message && typeof message === "string") {
        // Validate content
        const validation = ContentFilter.validateMessage(message, user.id)

        if (!validation.valid) {
          throw new HTTPException(400, {
            message: `Content validation failed: ${validation.reason}`,
          })
        }

        // Check rate limit
        const rateLimit = ContentFilter.checkRateLimit(user.id)

        if (!rateLimit.allowed) {
          throw new HTTPException(429, {
            message: `Rate limit exceeded. Try again in ${rateLimit.resetIn} seconds.`,
          })
        }

        // Audit the message
        ContentFilter.auditMessage(user.id, session?.id || "unknown", message, "sent")
      }
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error
      }

      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      log.error("Content filtering error", { error: errorMessage, userId: user?.id })
      throw new HTTPException(500, { message: "Content filtering failed" })
    }
  }

  await next()
})
