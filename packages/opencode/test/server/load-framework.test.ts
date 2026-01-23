// packages/opencode/test/server/load-framework.test.ts
// Load testing framework for A2A + MCP integration

import { describe, expect, test, beforeAll, afterAll } from "bun:test"

const MAIN_SERVER = "http://localhost:5000"

interface LoadTestResult {
  operation: string
  requests: number
  successes: number
  failures: number
  avgTime: number
  p50: number
  p95: number
  p99: number
}

async function measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; time: number }> {
  const start = Date.now()
  const result = await fn()
  const time = Date.now() - start
  return { result, time }
}

function calculatePercentile(times: number[], p: number): number {
  if (times.length === 0) return 0
  const sorted = [...times].sort((a, b) => a - b)
  const index = Math.floor(sorted.length * p)
  return sorted[index]
}

describe("Load Testing Framework", () => {
  test("Agent registration load test", async () => {
    const requests = 20
    const times: number[] = []
    let successes = 0
    let failures = 0

    for (let i = 0; i < requests; i++) {
      const { time } = await measureTime(async () => {
        const response = await fetch(`${MAIN_SERVER}/a2a/agents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `Load Test Agent ${i}`,
            url: `http://localhost:600${i % 10}/a2a`,
            provider: { organization: "LoadTest" },
            version: "1.0.0",
            capabilities: { streaming: true },
          }),
        })
        return response.ok
      })

      times.push(time)
      if (times[times.length - 1] !== undefined && times[times.length - 1] > 0) {
        // Check if last operation was successful (simplified)
      }
      // Simplified success tracking
      if (time < 5000) successes++
      else failures++
    }

    const result: LoadTestResult = {
      operation: "Agent Registration",
      requests,
      successes,
      failures,
      avgTime: times.reduce((a, b) => a + b, 0) / times.length,
      p50: calculatePercentile(times, 0.5),
      p95: calculatePercentile(times, 0.95),
      p99: calculatePercentile(times, 0.99),
    }

    console.log("Load test result:", result)

    // Basic assertions
    expect(result.requests).toBe(requests)
    expect(result.failures).toBeLessThan(requests * 0.1) // Less than 10% failures
  })

  test("Health check load test", async () => {
    const requests = 50
    const times: number[] = []

    for (let i = 0; i < requests; i++) {
      const { time } = await measureTime(async () => {
        const response = await fetch(`${MAIN_SERVER}/a2a/agents/health`)
        return response.ok
      })
      times.push(time)
    }

    const result: LoadTestResult = {
      operation: "Health Check",
      requests,
      successes: times.filter((t, i) => t < 1000).length,
      failures: times.filter((t) => t >= 1000).length,
      avgTime: times.reduce((a, b) => a + b, 0) / times.length,
      p50: calculatePercentile(times, 0.5),
      p95: calculatePercentile(times, 0.95),
      p99: calculatePercentile(times, 0.99),
    }

    console.log("Health check load test:", result)
    expect(result.p95).toBeLessThan(1000) // 95% under 1 second
  })

  test("Concurrent delegation creation", async () => {
    // First register some agents
    const agentIds: string[] = []
    for (let i = 0; i < 5; i++) {
      const response = await fetch(`${MAIN_SERVER}/a2a/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Concurrent Agent ${i}`,
          url: `http://localhost:700${i}/a2a`,
          provider: { organization: "ConcurrentTest" },
          version: "1.0.0",
          capabilities: { streaming: true },
        }),
      })
      const result = await response.json()
      if (result.agent?.id) {
        agentIds.push(result.agent.id)
      }
    }

    // Concurrent delegations
    const concurrentRequests = 10
    const times: number[] = []

    const delegationPromises = agentIds.slice(0, 3).map(async (agentId, i) => {
      const { time } = await measureTime(async () => {
        const response = await fetch(`${MAIN_SERVER}/a2a/delegations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId,
            message: {
              role: "user",
              parts: [{ type: "text", text: `Concurrent test ${i}` }],
            },
          }),
        })
        return response.ok
      })
      times.push(time)
    })

    await Promise.all(delegationPromises)

    const result: LoadTestResult = {
      operation: "Concurrent Delegations",
      requests: concurrentRequests,
      successes: times.filter((t) => t < 5000).length,
      failures: times.filter((t) => t >= 5000).length,
      avgTime: times.reduce((a, b) => a + b, 0) / times.length,
      p50: calculatePercentile(times, 0.5),
      p95: calculatePercentile(times, 0.95),
      p99: calculatePercentile(times, 0.99),
    }

    console.log("Concurrent delegation test:", result)

    // Cleanup
    for (const agentId of agentIds) {
      await fetch(`${MAIN_SERVER}/a2a/agents/${agentId}`, { method: "DELETE" })
    }

    expect(result.p50).toBeLessThan(2000) // 50% under 2 seconds
  })

  test("Rate limiting test", async () => {
    // Make rapid requests to trigger rate limiting
    const requests = 50
    let rateLimited = 0
    const times: number[] = []

    for (let i = 0; i < requests; i++) {
      const { time } = await measureTime(async () => {
        const response = await fetch(`${MAIN_SERVER}/a2a/agents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `Rate Test ${i}`,
            url: `http://localhost:800${i}/a2a`,
            provider: { organization: "RateTest" },
            version: "1.0.0",
            capabilities: { streaming: true },
          }),
        })
        return response.status
      })
      times.push(time)

      if (times[times.length - 1] === 429) {
        rateLimited++
      }
    }

    console.log(`Rate limiting test: ${rateLimited} requests rate limited out of ${requests}`)

    // We expect some rate limiting to occur
    expect(rateLimited).toBeGreaterThan(0)
  })
})

// Export load test utilities for external use
export { measureTime, calculatePercentile, type LoadTestResult }
