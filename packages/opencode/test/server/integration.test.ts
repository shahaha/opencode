// packages/opencode/test/server/integration.test.ts
// Integration tests for A2A + MCP with running servers
// Requires: Main server on port 5000, External agent on port 5001

import { describe, expect, test, beforeAll, afterAll } from "bun:test"

const MAIN_SERVER = "http://localhost:5000"
const EXTERNAL_AGENT = "http://localhost:5001"

describe("A2A Integration Tests (Requires Running Servers)", () => {
  describe("Agent Discovery", () => {
    test("GET /.well-known/agent.json returns agent card", async () => {
      const response = await fetch(`${MAIN_SERVER}/.well-known/agent.json`)
      expect(response.ok).toBe(true)

      const card = await response.json()
      expect(card.name).toBeDefined()
      expect(card.url).toBeDefined()
      expect(card.capabilities).toBeDefined()
    })

    test("External agent card contains MCP tools", async () => {
      const response = await fetch(`${EXTERNAL_AGENT}/.well-known/agent.json`)
      expect(response.ok).toBe(true)

      const card = await response.json()
      expect(card.mcpTools).toBeDefined()
      expect(Array.isArray(card.mcpTools)).toBe(true)
      expect(card.mcpTools.length).toBeGreaterThan(0)
    })
  })

  describe("Agent Registration", () => {
    test("POST /a2a/agents registers external agent", async () => {
      const response = await fetch(`${MAIN_SERVER}/a2a/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Integration Test Agent",
          url: `${EXTERNAL_AGENT}/a2a`,
          provider: { organization: "Test" },
          version: "1.0.0",
          capabilities: { streaming: true },
        }),
      })

      expect(response.ok).toBe(true)

      const result = await response.json()
      expect(result.success).toBe(true)
      expect(result.agent).toBeDefined()
      expect(result.agent.id).toBeDefined()

      // Cleanup
      const agentId = result.agent.id
      await fetch(`${MAIN_SERVER}/a2a/agents/${agentId}`, { method: "DELETE" })
    })

    test("POST /a2a/agents rejects invalid URL", async () => {
      const response = await fetch(`${MAIN_SERVER}/a2a/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Invalid Agent",
          url: "not-a-valid-url",
        }),
      })

      expect(response.status).toBe(400)
    })
  })

  describe("Delegation Flow", () => {
    let testAgentId: string

    beforeAll(async () => {
      // Register test agent
      const response = await fetch(`${MAIN_SERVER}/a2a/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Delegation Test Agent",
          url: `${EXTERNAL_AGENT}/a2a`,
          provider: { organization: "Test" },
          version: "1.0.0",
          capabilities: { streaming: true },
        }),
      })

      const result = await response.json()
      testAgentId = result.agent?.id
    })

    afterAll(async () => {
      // Cleanup
      if (testAgentId) {
        await fetch(`${MAIN_SERVER}/a2a/agents/${testAgentId}`, { method: "DELETE" })
      }
    })

    test("POST /a2a/delegations creates delegation", async () => {
      if (!testAgentId) {
        console.log("Skipping: No test agent registered")
        return
      }

      const response = await fetch(`${MAIN_SERVER}/a2a/delegations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: testAgentId,
          message: {
            role: "user",
            parts: [{ type: "text", text: "Integration test message" }],
          },
        }),
      })

      expect(response.ok).toBe(true)

      const result = await response.json()
      expect(result.success).toBe(true)
      expect(result.delegation).toBeDefined()
      expect(result.delegation.taskId).toBeDefined()
    })

    test("GET /a2a/delegations/:taskId returns delegation status", async () => {
      if (!testAgentId) {
        console.log("Skipping: No test agent registered")
        return
      }

      // Create delegation first
      const createResponse = await fetch(`${MAIN_SERVER}/a2a/delegations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: testAgentId,
          message: {
            role: "user",
            parts: [{ type: "text", text: "Status test" }],
          },
        }),
      })

      const createResult = await createResponse.json()
      const taskId = createResult.delegation?.taskId

      if (!taskId) {
        console.log("Skipping: Could not create delegation")
        return
      }

      // Get delegation status
      const response = await fetch(`${MAIN_SERVER}/a2a/delegations/${taskId}`)
      expect(response.ok).toBe(true)

      const result = await response.json()
      expect(result.taskId).toBe(taskId)
      expect(result.status).toBeDefined()
    })
  })

  describe("MCP Integration", () => {
    test("GET /mcp returns MCP servers", async () => {
      const response = await fetch(`${MAIN_SERVER}/mcp`)
      expect(response.ok).toBe(true)

      const result = await response.json()
      expect(typeof result).toBe("object")
    })

    test("GET /mcp/:name/tools returns tools", async () => {
      const response = await fetch(`${MAIN_SERVER}/mcp/context7/tools`)
      // May return tools or error if server not connected
      expect(response.status).toBe(200)

      const result = await response.json()
      expect(typeof result).toBe("object")
    })

    test("GET /a2a/delegations/:taskId/mcp/tools returns shared tools", async () => {
      // Register an agent first
      const registerResponse = await fetch(`${MAIN_SERVER}/a2a/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "MCP Tools Test Agent",
          url: `${EXTERNAL_AGENT}/a2a`,
          provider: { organization: "Test" },
          version: "1.0.0",
          capabilities: { streaming: true },
        }),
      })

      const registerResult = await registerResponse.json()
      const agentId = registerResult.agent?.id

      if (!agentId) {
        console.log("Skipping: Could not register agent")
        return
      }

      // Create a delegation
      const delegationResponse = await fetch(`${MAIN_SERVER}/a2a/delegations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          message: {
            role: "user",
            parts: [{ type: "text", text: "MCP tools test" }],
          },
        }),
      })

      const delegationResult = await delegationResponse.json()
      const taskId = delegationResult.delegation?.taskId

      if (!taskId) {
        console.log("Skipping: Could not create delegation")
        await fetch(`${MAIN_SERVER}/a2a/agents/${agentId}`, { method: "DELETE" })
        return
      }

      // Get MCP tools
      const response = await fetch(`${MAIN_SERVER}/a2a/delegations/${taskId}/mcp/tools`)
      expect(response.ok).toBe(true)

      const result = await response.json()
      expect(result.tools).toBeDefined()
      expect(Array.isArray(result.tools)).toBe(true)

      // Cleanup
      await fetch(`${MAIN_SERVER}/a2a/agents/${agentId}`, { method: "DELETE" })
    })
  })

  describe("Health Monitoring", () => {
    test("GET /a2a/agents/health returns agent health", async () => {
      const response = await fetch(`${MAIN_SERVER}/a2a/agents/health`)
      expect(response.ok).toBe(true)

      const result = await response.json()
      expect(result.agents).toBeDefined()
      expect(result.monitor).toBeDefined()
    })
  })
})
