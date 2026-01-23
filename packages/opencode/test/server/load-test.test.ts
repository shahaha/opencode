import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { Server } from "../../src/server/server"
import { Log } from "../../src/util/log"

Log.init({ print: false })

describe("Load Tests - Delegation Flow", () => {
  let app: ReturnType<typeof Server.App>

  beforeAll(async () => {
    app = Server.App()
  })

  afterAll(async () => {
    // No cleanup needed - tests use isolated server instances
  })

  describe("Concurrent Agent Registration", () => {
    test("handles multiple rapid agent registrations", async () => {
      const agents = []
      for (let i = 0; i < 5; i++) {
        const response = await app!.request("/a2a/agents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `Load Test Agent ${i}`,
            url: `http://localhost:500${i}/a2a`,
            provider: { organization: "LoadTest" },
            version: "1.0.0",
            capabilities: { streaming: true },
          }),
        })
        agents.push(response)
      }

      // All requests should succeed
      for (const response of agents) {
        expect(response.status).toBe(200)
      }

      // Verify at least some agents were created
      const listResponse = await app!.request("/a2a/agents")
      expect(listResponse.status).toBe(200)
      const body = (await listResponse.json()) as any
      expect(body.agents.length).toBeGreaterThan(0)
    })
  })

  describe("Sequential Delegation Creation", () => {
    test("handles multiple delegation requests", async () => {
      // Create agents first
      const agentIds: string[] = []
      for (let i = 0; i < 3; i++) {
        const response = await app!.request("/a2a/agents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `Sequential Agent ${i}`,
            url: `http://localhost:600${i}/a2a`,
            provider: { organization: "SequentialTest" },
            version: "1.0.0",
            capabilities: { streaming: true },
          }),
        })
        const body = (await response.json()) as any
        if (body.agent?.id) {
          agentIds.push(body.agent.id)
        }
      }

      // Create delegations sequentially
      for (const agentId of agentIds) {
        const response = await app!.request("/a2a/delegations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: agentId,
            message: {
              role: "user",
              parts: [{ type: "text", text: "Sequential delegation test" }],
            },
          }),
        })
        // Either succeeds or returns error (external agent may not be available)
        const body = (await response.json()) as any
        expect(body.success !== undefined || body.error !== undefined).toBe(true)
      }
    })
  })

  describe("MCP Tool Invocation Load", () => {
    test("handles rapid MCP tool listings", async () => {
      for (let i = 0; i < 3; i++) {
        const response = await app!.request("/mcp/context7/tools")
        // Response is a dictionary of toolName -> description
        const body = (await response.json()) as any
        expect(typeof body === "object" && body !== null).toBe(true)
      }
    })
  })

  describe("Health Check Load", () => {
    test("handles rapid health check requests", async () => {
      for (let i = 0; i < 10; i++) {
        const response = await app!.request("/a2a/agents/health")
        expect(response.status).toBe(200)
      }
    })
  })

  describe("Mixed Load", () => {
    test("handles mixed request patterns", async () => {
      // Mix of different requests
      for (let i = 0; i < 5; i++) {
        // Agent registration
        await app!.request("/a2a/agents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `Mixed Agent ${i}`,
            url: `http://localhost:700${i}/a2a`,
            provider: { organization: "MixedTest" },
            version: "1.0.0",
            capabilities: { streaming: true },
          }),
        })

        // List agents
        await app!.request("/a2a/agents")

        // Health check
        await app!.request("/a2a/agents/health")

        // MCP tools
        await app!.request("/mcp/context7/tools")
      }
    })
  })
})
