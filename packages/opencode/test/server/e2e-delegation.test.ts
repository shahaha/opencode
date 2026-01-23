// packages/opencode/test/server/e2e-delegation.test.ts
// End-to-end delegation flow tests

import { describe, expect, test, beforeAll, afterAll } from "bun:test"

const MAIN_SERVER = "http://localhost:5000"
const EXTERNAL_AGENT = "http://localhost:5001"

describe("End-to-End Delegation Flow", () => {
  let agentId: string

  beforeAll(async () => {
    // Register external agent
    const response = await fetch(`${MAIN_SERVER}/a2a/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "E2E Test Agent",
        url: `${EXTERNAL_AGENT}/a2a`,
        provider: { organization: "E2E Test" },
        version: "1.0.0",
        capabilities: { streaming: true },
      }),
    })

    const result = await response.json()
    agentId = result.agent?.id

    if (!agentId) {
      throw new Error("Failed to register E2E test agent")
    }
  })

  afterAll(async () => {
    // Cleanup
    if (agentId) {
      await fetch(`${MAIN_SERVER}/a2a/agents/${agentId}`, { method: "DELETE" })
    }
  })

  test("Complete delegation flow: register -> delegate -> get status -> get tools", async () => {
    if (!agentId) {
      throw new Error("No agent ID available")
    }

    // Step 1: Verify agent is registered
    const listResponse = await fetch(`${MAIN_SERVER}/a2a/agents`)
    expect(listResponse.ok).toBe(true)

    const listResult = await listResponse.json()
    const agents = listResult.agents || []
    const registeredAgent = agents.find((a: any) => a.id === agentId)
    expect(registeredAgent).toBeDefined()

    // Step 2: Create delegation
    const delegationResponse = await fetch(`${MAIN_SERVER}/a2a/delegations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId,
        message: {
          role: "user",
          parts: [{ type: "text", text: "E2E test: List your capabilities" }],
        },
      }),
    })

    expect(delegationResponse.ok).toBe(true)

    const delegationResult = await delegationResponse.json()
    expect(delegationResult.success).toBe(true)
    expect(delegationResult.delegation.taskId).toBeDefined()

    const taskId = delegationResult.delegation.taskId

    // Step 3: Get delegation status
    const statusResponse = await fetch(`${MAIN_SERVER}/a2a/delegations/${taskId}`)
    expect(statusResponse.ok).toBe(true)

    const statusResult = await statusResponse.json()
    expect(statusResult.taskId).toBe(taskId)
    expect(statusResult.status).toBeDefined()

    // Step 4: Get shared MCP tools
    const toolsResponse = await fetch(`${MAIN_SERVER}/a2a/delegations/${taskId}/mcp/tools`)
    expect(toolsResponse.ok).toBe(true)

    const toolsResult = await toolsResponse.json()
    expect(toolsResult.tools).toBeDefined()
    expect(Array.isArray(toolsResult.tools)).toBe(true)

    // Step 5: List all delegations
    const allDelegationsResponse = await fetch(`${MAIN_SERVER}/a2a/delegations`)
    expect(allDelegationsResponse.ok).toBe(true)

    const allDelegationsResult = await allDelegationsResponse.json()
    expect(allDelegationsResult.delegations).toBeDefined()
    expect(allDelegationsResult.delegations.length).toBeGreaterThan(0)

    console.log("E2E delegation flow completed successfully")
  })

  test("Multiple rapid delegations", async () => {
    if (!agentId) {
      throw new Error("No agent ID available")
    }

    const delegationIds: string[] = []

    // Create 5 rapid delegations
    for (let i = 0; i < 5; i++) {
      const response = await fetch(`${MAIN_SERVER}/a2a/delegations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          message: {
            role: "user",
            parts: [{ type: "text", text: `Rapid delegation ${i + 1}` }],
          },
        }),
      })

      expect(response.ok).toBe(true)

      const result = await response.json()
      if (result.delegation?.taskId) {
        delegationIds.push(result.delegation.taskId)
      }
    }

    // Verify all were created
    expect(delegationIds.length).toBe(5)

    // Verify all exist
    for (const id of delegationIds) {
      const response = await fetch(`${MAIN_SERVER}/a2a/delegations/${id}`)
      expect(response.ok).toBe(true)
    }

    console.log("Multiple rapid delegations test completed")
  })

  test("Agent health monitoring", async () => {
    // Start health monitoring
    const startResponse = await fetch(`${MAIN_SERVER}/a2a/monitor/start`, {
      method: "POST",
    })
    expect(startResponse.ok).toBe(true)

    // Wait for health check to run
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Check health
    const healthResponse = await fetch(`${MAIN_SERVER}/a2a/agents/health`)
    expect(healthResponse.ok).toBe(true)

    const healthResult = await healthResponse.json()
    expect(healthResult.agents).toBeDefined()
    expect(healthResult.monitor?.running).toBe(true)

    // Stop monitoring
    const stopResponse = await fetch(`${MAIN_SERVER}/a2a/monitor/stop`, {
      method: "POST",
    })
    expect(stopResponse.ok).toBe(true)

    console.log("Agent health monitoring test completed")
  })

  test("Invalid agent delegation", async () => {
    const response = await fetch(`${MAIN_SERVER}/a2a/delegations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "non-existent-agent",
        message: {
          role: "user",
          parts: [{ type: "text", text: "This should fail" }],
        },
      }),
    })

    expect(response.status).toBe(404)

    const result = await response.json()
    expect(result.error).toBeDefined()
    expect(result.error.code).toBe("AGENT_NOT_FOUND")
  })
})
