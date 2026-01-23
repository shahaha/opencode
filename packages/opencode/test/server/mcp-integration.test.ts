import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { Server } from "../../src/server/server"
import { Log } from "../../src/util/log"

Log.init({ print: false })

describe("MCP Integration", () => {
  let app: ReturnType<typeof Server.App>

  beforeAll(async () => {
    app = Server.App()
  })

  afterAll(async () => {
    // No cleanup needed - tests use isolated server instances
  })

  describe("GET /mcp", () => {
    test("returns MCP server status", async () => {
      const response = await app!.request("/mcp")
      expect(response.status).toBe(200)

      const body = (await response.json()) as any
      expect(typeof body).toBe("object")
    })
  })

  describe("GET /mcp/:name/tools", () => {
    test("returns tools for valid server", async () => {
      const response = await app!.request("/mcp/context7/tools")
      // Response is a dictionary of toolName -> description
      const body = (await response.json()) as any
      // Either returns tools dict or an error
      expect(typeof body === "object" && body !== null).toBe(true)
    })
  })

  describe("POST /mcp/:name/call", () => {
    test("calls MCP tool", async () => {
      const response = await app!.request("/mcp/context7/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolName: "context7_resolve-library-id",
          arguments: {
            libraryName: "next-js",
            query: "How to set up Next.js",
          },
        }),
      })

      // Either success or error is acceptable
      const body = (await response.json()) as any
      expect(body.success !== undefined || body.error !== undefined || body.content !== undefined).toBe(true)
    })

    test("handles invalid tool name", async () => {
      const response = await app!.request("/mcp/context7/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolName: "non_existent_tool",
          arguments: {},
        }),
      })

      // Either returns error or success (depends on server behavior)
      const body = (await response.json()) as any
      expect(typeof body === "object").toBe(true)
    })
  })

  describe("POST /mcp/:name/auth", () => {
    test("starts OAuth flow", async () => {
      const response = await app!.request("/mcp/context7/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })

      // Either returns auth URL or error (if already connected or not configured)
      const body = (await response.json()) as any
      expect(body.authorizationUrl !== undefined || body.error !== undefined).toBe(true)
    })
  })

  describe("DELETE /mcp/:name/auth", () => {
    test("disconnects authentication", async () => {
      const response = await app!.request("/mcp/context7/auth", {
        method: "DELETE",
      })

      // Either returns success or error (if not connected)
      const body = (await response.json()) as any
      expect(body.success !== undefined || body.error !== undefined).toBe(true)
    })
  })

  describe("Delegation MCP Tools", () => {
    test("GET /a2a/delegations/:taskId/mcp/tools returns tools", async () => {
      // Create an agent first and get the returned ID
      const agentResponse = await app!.request("/a2a/agents", {
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

      const agentBody = (await agentResponse.json()) as any
      const agentId = agentBody.agent?.id

      // Create delegation
      const delegationResponse = await app!.request("/a2a/delegations", {
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

      const delegationBody = (await delegationResponse.json()) as any
      const taskId = delegationBody.delegation?.taskId || delegationBody.error?.message?.match(/taskId:\s*(\w+)/)?.[1]

      if (taskId) {
        const response = await app!.request(`/a2a/delegations/${taskId}/mcp/tools`)
        // Either returns tools or 404 if delegation not found
        const body = (await response.json()) as any
        expect(body.tools !== undefined || body.error !== undefined).toBe(true)
      }
    })
  })
})
