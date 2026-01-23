// packages/opencode/src/server/middleware/rate-limit.ts
import { createMiddleware } from "hono/factory"
import { HTTPException } from "hono/http-exception"
import { Log } from "../../util/log"

const log = Log.create({ service: "rate-limit" })

interface RateLimitConfig {
  windowMs: number // Time window in milliseconds
  max: number // Max requests per window
  keyGenerator?: (c: any) => string
  message?: string
}

interface RateLimitEntry {
  count: number
  resetTime: number
}

// In-memory rate limit storage (use Redis in production)
const rateLimitStore = new Map<string, RateLimitEntry>()

// Clean up expired entries every minute
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key)
    }
  }
}, 60000)

// Default key generator uses client IP
const defaultKeyGenerator = (c: any): string => {
  const ip = c.req.header("X-Forwarded-For") || c.req.header("X-Real-IP") || "unknown"
  const userAgent = c.req.header("User-Agent") || "unknown"
  return `${ip}:${userAgent.substring(0, 20)}`
}

// Create rate limiting middleware
export const rateLimit = (config: RateLimitConfig) => {
  const { windowMs, max, keyGenerator = defaultKeyGenerator, message = "Too many requests" } = config

  return createMiddleware(async (c, next) => {
    const key = keyGenerator(c)
    const now = Date.now()

    let entry = rateLimitStore.get(key)

    if (!entry || now > entry.resetTime) {
      // Create new entry or reset expired one
      entry = {
        count: 1,
        resetTime: now + windowMs,
      }
      rateLimitStore.set(key, entry)
    } else {
      entry.count++
    }

    const remaining = Math.max(0, max - entry.count)
    const resetTime = Math.ceil((entry.resetTime - now) / 1000)

    // Set rate limit headers
    c.header("X-RateLimit-Limit", max.toString())
    c.header("X-RateLimit-Remaining", remaining.toString())
    c.header("X-RateLimit-Reset", resetTime.toString())

    // Check if over limit
    if (entry.count > max) {
      log.warn("Rate limit exceeded", {
        key,
        count: entry.count,
        limit: max,
        windowMs,
      })

      c.header("Retry-After", resetTime.toString())
      throw new HTTPException(429, { message: `${message}. Retry in ${resetTime}s` })
    }

    await next()
  })
}

// Create rate limiter for specific endpoints
export const createRateLimiter = (windowMs: number, max: number, prefix: string = "") => {
  return rateLimit({
    windowMs,
    max,
    keyGenerator: (c) => {
      const baseKey = defaultKeyGenerator(c)
      return `${prefix}:${baseKey}`
    },
  })
}

// Pre-configured rate limiters for different endpoints
export const agentsRateLimit = createRateLimiter(60000, 10, "agents") // 10 agents/minute
export const delegationsRateLimit = createRateLimiter(60000, 100, "delegations") // 100 delegations/minute
export const mcpInvokeRateLimit = createRateLimiter(60000, 50, "mcp-invoke") // 50 MCP calls/minute
export const healthCheckRateLimit = createRateLimiter(10000, 20, "health") // 20 checks/10s

// Get rate limit stats (for monitoring)
export const getRateLimitStats = (): { activeKeys: number; entries: Map<string, RateLimitEntry> } => {
  return {
    activeKeys: rateLimitStore.size,
    entries: rateLimitStore,
  }
}

// Reset rate limits (for testing/admin)
export const resetRateLimits = (pattern?: string): number => {
  let count = 0
  if (pattern) {
    for (const [key] of rateLimitStore.entries()) {
      if (key.includes(pattern)) {
        rateLimitStore.delete(key)
        count++
      }
    }
  } else {
    count = rateLimitStore.size
    rateLimitStore.clear()
  }
  return count
}
