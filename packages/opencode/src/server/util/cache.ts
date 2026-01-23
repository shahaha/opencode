// packages/opencode/src/server/util/cache.ts
import { Log } from "../../util/log"

const log = Log.create({ service: "cache" })

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

interface CacheConfig {
  defaultTTL: number // milliseconds
  maxSize: number // maximum number of entries
  cleanupInterval: number // milliseconds
}

export class RequestCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map()
  private config: CacheConfig
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor(config?: Partial<CacheConfig>) {
    this.config = {
      defaultTTL: config?.defaultTTL ?? 300000, // 5 minutes
      maxSize: config?.maxSize ?? 1000,
      cleanupInterval: config?.cleanupInterval ?? 60000, // 1 minute
    }

    if (this.config.cleanupInterval > 0) {
      this.startCleanupTimer()
    }
  }

  // Get a cached value
  get(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) {
      return null
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }

    return entry.value
  }

  // Set a cached value
  set(key: string, value: T, ttlMs?: number): void {
    // Evict oldest entry if cache is full
    if (this.cache.size >= this.config.maxSize) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey) {
        this.cache.delete(oldestKey)
      }
    }

    const ttl = ttlMs ?? this.config.defaultTTL
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttl,
    })
  }

  // Delete a cached value
  delete(key: string): boolean {
    return this.cache.delete(key)
  }

  // Check if key exists and is valid
  has(key: string): boolean {
    const entry = this.cache.get(key)
    if (!entry) {
      return false
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return false
    }

    return true
  }

  // Clear all cached values
  clear(): void {
    this.cache.clear()
  }

  // Get cache size
  size(): number {
    return this.cache.size
  }

  // Start periodic cleanup timer
  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      return
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanup()
    }, this.config.cleanupInterval)
  }

  // Stop cleanup timer
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }

  // Remove expired entries
  private cleanup(): void {
    const now = Date.now()
    let removed = 0

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key)
        removed++
      }
    }

    if (removed > 0) {
      log.debug("Cache cleanup", { removed, size: this.cache.size })
    }
  }
}

// Pre-configured cache instances
export const agentCardCache = new RequestCache<any>({
  defaultTTL: 300000, // 5 minutes
  maxSize: 100,
})

export const mcpToolsCache = new RequestCache<any>({
  defaultTTL: 300000, // 5 minutes
  maxSize: 50,
})

export const delegationCache = new RequestCache<any>({
  defaultTTL: 3600000, // 1 hour
  maxSize: 500,
})

// Helper function for cached fetch
export async function cachedFetch<T>(
  cache: RequestCache<T>,
  key: string,
  fetchFn: () => Promise<T>,
  ttlMs?: number,
): Promise<T> {
  const cached = cache.get(key)
  if (cached !== null) {
    return cached
  }

  const value = await fetchFn()
  cache.set(key, value, ttlMs)
  return value
}
