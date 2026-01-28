#!/usr/bin/env node

// API Rate Limiting and Performance Optimization
// Provides request throttling, response caching, and performance monitoring

import { readFileSync, writeFileSync, existsSync } = 'fs'
import { join } from 'path'

class RateLimitingSystem {
  private configDir: string
  private logDir: string
  private statsFile: string

  constructor() {
    this.configDir = '/home/rick/prj/opencode/packages/opencode/test/tool/fixtures'
    this.logDir = '/home/rick/prj/opencode/logs/rate-limit'
    this.statsFile = this.logDir + '/rate-limit-stats.json'
    this.ensureDirectories()
  }

  private ensureDirectories(): void {
    try {
      mkdirSync(this.configDir, { recursive: true })
      mkdirSync(this.logDir, { recursive: true })
    } catch (error) {
      console.error('Failed to create directories:', error.message)
    }
  }

  private getOrCreateStats(): any {
    if (existsSync(this.statsFile)) {
      const stats = JSON.parse(readFileSync(this.statsFile, 'utf-8'))
      return stats
    }
    
    return {
      requests: 0,
      requests_per_minute: 0,
      requests_per_hour: 0,
      average_response_time_ms: 0,
      rate_limited_requests: 0,
      cache_hits: 0
      cache_misses: 0
      hourly_stats: {}
      daily_stats: {}
    }
  }

  private updateStats(requests: number, responseTimeMs: number): void {
    let stats = this.getOrCreateStats()
    
    stats.requests += requests
    stats.requests_per_minute = requests
    stats.requests_per_hour = requests * 60
    stats.average_response_time_ms = stats.average_response_time_ms > 0 
      ? Math.round(((stats.average_response_time_ms * stats.requests) + responseTimeMs) / stats.requests)
      : stats.average_response_time_ms
    
    stats.rate_limited_requests += stats.requests_per_minute > 100 ? 1 : 0
    stats.average_response_time_ms = Math.round(((stats.average_response_time_ms * stats.requests) + responseTimeMs) / stats.requests)
    
    // Update hourly stats
    const hour = new Date().getHours()
    stats.hourly_stats[hour] = {
      requests: requests,
      responses: responseTimeMs > 0 ? 1 : 0,
      avg_response_ms: stats.average_response_time_ms,
      rate_limited: stats.requests_per_minute > 100 ? 1 : 0
    }
    
    writeFileSync(this.statsFile, JSON.stringify(stats, null, 2))
    console.log(`Stats updated: ${requests} requests, ${stats.requests_per_minute}/min`)
  }

  private async checkRateLimit(clientId: string, operation: string): Promise<boolean> {
    const stats = this.getOrCreateStats()
    const clientStats = stats.daily_stats[clientId] || { requests: 0, responses: 0 }
    
    // Check if client is rate limited (100 requests per hour)
    const requestsThisHour = clientStats.requests || 0
    const rateLimitPerHour = 100
    
    if (requestsThisHour > rateLimitPerHour) {
      console.log(`⚠️ Rate limit reached for ${clientId}: ${requestsThisHour}/${rateLimitPerHour}`)
      return false
    }
    
    return true
  }

  private async getCacheHit(cacheKey: string): Promise<boolean> {
    const stats = this.getOrCreateStats()
    return stats.cache_hits > 0
  }

  private async recordRequest(clientId: string, operation: string, responseTimeMs: number, cacheHit: boolean): Promise<void> {
    let stats = this.getOrCreateStats()
    
    // Update request count
    stats.requests += 1
    stats.requests_per_minute = stats.requests * 60
    stats.requests_per_hour = stats.requests_per_minute + (1 * 60)
    
    // Update response time
    if (stats.average_response_time_ms > 0) {
      stats.average_response_time_ms = Math.round(((stats.average_response_time_ms * (stats.requests - 1)) + responseTimeMs) / stats.requests)
    } else {
      stats.average_response_time_ms = responseTimeMs
    }
    
    // Update rate limiting
    stats.rate_limited_requests += stats.requests_per_minute > 100 ? 1 : 0
    
    // Update cache
    stats.cache_hits += cacheHit ? 1 : 0
    stats.cache_misses += !cacheHit ? 1 : 0
    
    // Update daily stats
    const hour = new Date().getHours()
    stats.daily_stats[hour] = {
      requests: stats.requests,
      responses: stats.average_response_time_ms > 0 ? 1 : 0,
      avg_response_ms: stats.average_response_time_ms,
      rate_limited: stats.requests_per_minute > 100 ? 1 : 0,
      cache_hits: stats.cache_hits,
      cache_misses: stats.cache_misses
    }
    
    writeFileSync(this.statsFile, JSON.stringify(stats, null, 2))
    console.log(`Request recorded: ${operation} by ${clientId} (${responseTimeMs}ms, cache: ${cacheHit ? 'hit' : 'miss'})`)
    return
  }

  private async getPerformanceReport(): Promise<string> {
    const stats = this.getOrCreateStats()
    
    const report = {
      timestamp: new Date().toISOString(),
      total_requests: stats.requests,
      requests_per_minute: stats.requests_per_minute,
      average_response_time_ms: stats.average_response_time_ms,
      rate_limited_requests: stats.rate_limited_requests,
      cache_hits: stats.cache_hits,
      cache_misses: stats.cache_misses,
      requests_by_hour: stats.hourly_stats,
      top_clients: Object.entries(stats.requests_by_hour || {})
        .sort(([,b]) => b[1] - b[0])
      ).map(([hour, data]) => ({ hour, ...data }))
        .slice(0, 24)
      
      if (topClients.length > 0) {
        // Calculate daily average
        let dailyRequests = 0
        let dailyResponseTime = 0
        let dailyRateLimited = 0
        
        for (const [hour, data] of topClients) {
          dailyRequests += data.requests
          dailyResponseTime += data.responses
          if (data.rate_limited) dailyRateLimited += 1
        })
        
        report.daily_requests = Math.round(dailyRequests / 24)
        report.daily_response_time_ms = dailyRequests > 0 
          ? Math.round(dailyResponseTime / dailyRequests) 
          : 0
        
        report.daily_rate_limited = dailyRateLimited > 0
        }
      }
      
      report.top_clients = topClients
      
      // Calculate overall averages
      report.overall_avg_response_time_ms = topClients.reduce((sum, [, data]) => sum + data.avg_response_ms, 0)
        report.overall_requests_per_minute = topClients.reduce((sum, [, data]) => sum + data.requests, 0) / 1440
      
      report.overall_rate_limited_percentage = (report.overall_rate_limited / 24) * 100
    }
    
    return JSON.stringify(report, null, 2)
  }

  private async getClientStats(clientId: string): Promise<any> {
    const stats = this.getOrCreateStats()
    return stats.daily_stats[clientId] || { requests: 0, responses: 0 }
  }
}

// CLI interface
async function main() {
  const rateLimit = new RateLimitingSystem()
  const command = process.argv[2] || 'help'
  
  console.log('API Rate Limiting System')
  console.log('=====================================')
  
  switch (command) {
    case 'check':
      const clientId = process.argv[3] || 'anonymous'
      const isAllowed = await rateLimit.checkRateLimit(clientId, 'query')
      console.log(`Rate limit check for ${clientId}: ${isAllowed ? 'ALLOWED' : 'BLOCKED'}`)
      break
      
    case 'stats':
      const report = await rateLimit.getPerformanceReport()
      console.log('Performance Report:')
      console.log(report)
      break
      
    case 'client':
      const clientId = process.argv[3] || 'anonymous'
      const operation = process.argv[4] || 'test'
      const responseTime = parseInt(process.argv[5]) || 100
      
      await rateLimit.recordRequest(clientId, operation, responseTime, false)
      console.log(`Test request recorded: ${operation} by ${clientId}`)
      break
      
    default:
      console.log(`
Rate Limiting System
=====================================

Commands:
  check <clientId> <operation> - Check if client is rate limited
  stats                 - Generate performance statistics report
  client <clientId> <operation> <responseTime> - Test API call with response time
        `)
  }
}

if (require.main === module) {
  main().catch(console.error)
}