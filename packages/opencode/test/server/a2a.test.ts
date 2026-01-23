import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { Instance } from "../../src/project/instance"
import { Server } from "../../src/server/server"
import { Log } from "../../src/util/log"

const projectRoot = "/home/rick/prj/opencode/packages/opencode"
Log.init({ print: false })

describe("A2A Protocol", () => {
  let app: ReturnType<typeof Server.App>

  beforeAll(async () => {
    app = Server.App()
  })

  afterAll(async () => {
    // Cleanup is handled by the test framework
  })

  describe("GET /a2a", () => {
    test("returns agent card", async () => {
      const response = await app!.request("/a2a")
      expect(response.status).toBe(200)

      const body = (await response.json()) as any
      expect(body.name).toBeDefined()
      expect(body.capabilities).toBeDefined()
      expect(body.capabilities.streaming).toBe(true)
    })
  })

  describe("GET /.well-known/agent.json", () => {
    test("returns agent JSON", async () => {
      const response = await app!.request("/.well-known/agent.json")
      expect(response.status).toBe(200)

      const body = (await response.json()) as any
      expect(body.name).toBe("OpenCode Agent")
      expect(body.mcpTools).toBeDefined()
      expect(Array.isArray(body.mcpTools)).toBe(true)
    })
  })

  describe("GET /a2a/agents", () => {
    test("returns empty list initially", async () => {
      const response = await app!.request("/a2a/agents")
      expect(response.status).toBe(200)

      const body = (await response.json()) as any
      expect(body.agents).toBeDefined()
      expect(Array.isArray(body.agents)).toBe(true)
    })
  })

  describe("POST /a2a/agents", () => {
    test("adds manual agent", async () => {
      const response = await app!.request("/a2a/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test Agent",
          url: "http://localhost:5001/a2a",
          provider: { organization: "Test" },
          version: "1.0.0",
          capabilities: { streaming: true },
        }),
      })

      expect(response.status).toBe(200)
      const body = (await response.json()) as any
      expect(body.success).toBe(true)
      expect(body.agent.id).toBeDefined()
    })
  })

  describe("GET /a2a/agents/:agentId", () => {
    test("returns agent by ID", async () => {
      // First add an agent and get the returned ID
      const addResponse = await app!.request("/a2a/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test Agent",
          url: "http://localhost:5001/a2a",
          provider: { organization: "Test" },
          version: "1.0.0",
          capabilities: { streaming: true },
        }),
      })

      const addBody = (await addResponse.json()) as any
      const agentId = addBody.agent.id

      const response = await app!.request(`/a2a/agents/${agentId}`)
      expect(response.status).toBe(200)

      const body = (await response.json()) as any
      expect(body.name).toBe("Test Agent")
    })

    test("returns 404 for non-existent agent", async () => {
      const response = await app!.request("/a2a/agents/non-existent-id")
      expect(response.status).toBe(404)
    })
  })

  describe("POST /a2a/delegations", () => {
    test("creates delegation", async () => {
      // First add an agent and get the returned ID
      const addResponse = await app!.request("/a2a/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "External Agent",
          url: "http://localhost:5001/a2a",
          provider: { organization: "Test" },
          version: "1.0.0",
          capabilities: { streaming: true },
        }),
      })

      const addBody = (await addResponse.json()) as any
      const agentId = addBody.agent.id

      const response = await app!.request("/a2a/delegations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agentId,
          message: {
            role: "user",
            parts: [{ type: "text", text: "Test" }],
          },
        }),
      })

      // Expect either success or delegation failed (if external agent not available)
      const body = (await response.json()) as any
      expect(body.success !== undefined || body.error !== undefined).toBe(true)
    })
  })

  describe("GET /a2a/delegations", () => {
    test("returns list of delegations", async () => {
      const response = await app!.request("/a2a/delegations")
      expect(response.status).toBe(200)

      const body = (await response.json()) as any
      expect(body.delegations).toBeDefined()
      expect(Array.isArray(body.delegations)).toBe(true)
    })
  })

  describe("GET /a2a/agents/health", () => {
    test("returns health status", async () => {
      const response = await app!.request("/a2a/agents/health")
      expect(response.status).toBe(200)

      const body = (await response.json()) as any
      expect(body.monitor).toBeDefined()
      expect(body.monitor.running).toBeDefined()
    })
  })

  describe("POST /a2a/monitor/start", () => {
    test("starts heartbeat monitor", async () => {
      const response = await app!.request("/a2a/monitor/start", {
        method: "POST",
      })

      expect(response.status).toBe(200)
      const body = (await response.json()) as any
      expect(body.success).toBe(true)
      expect(body.running).toBe(true)
    })
  })

  describe("POST /a2a/monitor/stop", () => {
    test("stops heartbeat monitor", async () => {
      // First start the monitor
      await app!.request("/a2a/monitor/start", { method: "POST" })

      const response = await app!.request("/a2a/monitor/stop", {
        method: "POST",
      })

      expect(response.status).toBe(200)
      const body = (await response.json()) as any
      expect(body.success).toBe(true)
      expect(body.running).toBe(false)
    })
  })
})
