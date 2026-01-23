// packages/opencode/src/server/util/agent-verify.ts
import { Log } from "../../util/log"

const log = Log.create({ service: "agent-verify" })

export interface AgentCard {
  name: string
  description?: string
  url: string
  provider?: {
    organization: string
    url?: string
  }
  version?: string
  capabilities?: {
    streaming?: boolean
    pushNotifications?: boolean
    stateTransitionHistory?: boolean
  }
  authentication?: {
    schemes?: string[]
  }
  skills?: Array<{
    id: string
    name: string
    description?: string
  }>
  mcpTools?: Array<{
    name: string
    description?: string
  }>
}

export interface VerificationResult {
  success: boolean
  agentCard?: AgentCard
  error?: string
  responseTime?: number
}

// Verify an agent by fetching and validating its agent card
export async function verifyAgent(agentUrl: string, timeoutMs: number = 5000): Promise<VerificationResult> {
  const startTime = Date.now()

  try {
    // Normalize URL
    let cardUrl = agentUrl
    if (!cardUrl.endsWith("/.well-known/agent.json")) {
      cardUrl = cardUrl.replace(/\/a2a\/?$/, "/.well-known/agent.json")
    }

    log.debug("Verifying agent", { agentUrl, cardUrl })

    const response = await fetch(cardUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "OpenCode-A2A-Verifier/1.0",
      },
      signal: AbortSignal.timeout(timeoutMs),
    })

    const responseTime = Date.now() - startTime

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        responseTime,
      }
    }

    const agentCard = (await response.json()) as AgentCard

    // Validate required fields
    if (!agentCard.name || !agentCard.url) {
      return {
        success: false,
        error: "Invalid agent card: missing required fields (name, url)",
        responseTime,
      }
    }

    // Verify URL matches
    if (agentCard.url !== agentUrl) {
      log.warn("Agent URL mismatch", {
        declared: agentUrl,
        card: agentCard.url,
      })
    }

    log.info("Agent verified successfully", {
      name: agentCard.name,
      url: agentUrl,
      responseTime,
    })

    return {
      success: true,
      agentCard,
      responseTime,
    }
  } catch (error) {
    const responseTime = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : "Unknown error"

    log.error("Agent verification failed", {
      agentUrl,
      error: errorMessage,
      responseTime,
    })

    return {
      success: false,
      error: errorMessage,
      responseTime,
    }
  }
}

// Batch verify multiple agents
export async function verifyAgents(
  agents: Array<{ id: string; url: string }>,
  timeoutMs: number = 5000,
): Promise<Map<string, VerificationResult>> {
  const results = new Map<string, VerificationResult>()

  // Process in parallel with concurrency limit
  const concurrency = 10
  for (let i = 0; i < agents.length; i += concurrency) {
    const batch = agents.slice(i, i + concurrency)
    const verifications = batch.map(async (agent) => {
      const result = await verifyAgent(agent.url, timeoutMs)
      results.set(agent.id, result)
    })
    await Promise.all(verifications)
  }

  return results
}

// Check if agent URL is on allowlist
const agentAllowlist = new Set([
  "http://localhost:5000",
  "http://localhost:5001",
  "http://127.0.0.1:5000",
  "http://127.0.0.1:5001",
  "https://agents.opencode.ai",
])

export function isAgentAllowed(agentUrl: string): boolean {
  // Check allowlist first
  if (agentAllowlist.has(agentUrl)) {
    return true
  }

  // Allow localhost URLs
  try {
    const url = new URL(agentUrl)
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return true
    }
  } catch {
    // Invalid URL
    return false
  }

  return false
}

// Add URL to allowlist
export function addToAllowlist(url: string): boolean {
  try {
    const parsed = new URL(url)
    agentAllowlist.add(parsed.origin + parsed.pathname.replace(/\/$/, ""))
    return true
  } catch {
    return false
  }
}

// Remove URL from allowlist
export function removeFromAllowlist(url: string): boolean {
  try {
    const parsed = new URL(url)
    return agentAllowlist.delete(parsed.origin + parsed.pathname.replace(/\/$/, ""))
  } catch {
    return false
  }
}

// Get allowlist
export function getAllowlist(): string[] {
  return Array.from(agentAllowlist)
}
