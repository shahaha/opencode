// packages/opencode/src/server/routes/ag-ui.ts
import { Hono } from "hono"
import { upgradeWebSocket } from "hono/bun"
import type { WSContext } from "hono/ws"
import { Log } from "../../util/log"
import { Agent } from "../../agent/agent"
import { Storage } from "../../storage/storage"
import { Session } from "../../session"
import { SessionPrompt } from "../../session/prompt"
import { SystemPrompt } from "../../session/system"
import { Auth } from "../../auth/auth"
import { contentFilterMiddleware } from "../middleware/content-filter"
import { Provider } from "../../provider/provider"
import { Config } from "../../config/config"
import { Flag } from "../../flag/flag"
import { Instance } from "../../project/instance"
import { InstanceBootstrap } from "../../project/bootstrap"
import path from "path"

// Use AGUIRoutes consistently
const log = Log.create({ service: "ag-ui" })

interface ConversationHistory {
  sessionId: string
  messages: Array<{ role: string; content: string; timestamp: number }>
}

const conversationHistory = new Map<string, ConversationHistory>()

interface AGUIMessage {
  jsonrpc: "2.0"
  method: string
  params: any
  id?: number
}

interface AGUIEvent {
  id: string
  type: string
  timestamp: number
  data: any
  metadata?: any
}

// Ollama API helper function
async function callOllama(model: string, prompt: string): Promise<string> {
  const ollamaModel = model.replace("ollama/", "")
  try {
    const response = await fetch("http://127.0.0.1:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ollamaModel,
        prompt: prompt,
        stream: false,
        options: {
          num_predict: 2048,
          temperature: 0.7,
        },
      }),
    })

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`)
    }

    const data = await response.json()
    return data.response || "No response from Ollama"
  } catch (error) {
    console.error(`[AG-UI] Ollama API call failed:`, error)
    throw error
  }
}

// Cloud Model fallback - returns a message indicating cloud models require configuration
async function callWithProvider(model: string, messages: Array<{ role: string; content: string }>): Promise<string> {
  // Extract model name from provider/model format
  const modelName = model.split("/").pop() || model

  // Build context from messages
  const userMessages = messages.filter((m) => m.role === "user")
  const lastUserMessage = userMessages[userMessages.length - 1]?.content || ""

  return (
    `[${modelName}] Cloud model response requires API key configuration. ` +
    `Please use Ollama models (ollama/*) for local inference. ` +
    `You said: "${lastUserMessage.substring(0, 100)}..."`
  )
}

async function callOpenCodeZen(model: string, messages: Array<{ role: string; content: string }>): Promise<string> {
  // OpenCode Zen models are part of OpenCode's internal infrastructure
  // They require the full OpenCode framework to access, not direct API calls
  // For now, we'll use a simulated response
  console.log(`[AG-UI] OpenCode Zen model requested: ${model}`)

  // Extract just the model name
  const modelName = model.replace("opencode/", "").replace("google/antigravity-", "")

  // Build context from messages
  const userMessages = messages.filter((m) => m.role === "user")
  const lastUserMessage = userMessages[userMessages.length - 1]?.content || ""

  // Simulate a response based on the model
  const responses = {
    "big-pickle":
      "I'm Big Pickle, an OpenCode Zen model optimized for general-purpose tasks. I'm designed to be fast and efficient while still being helpful.",
    "gpt-5-nano": "I'm GPT-5 Nano, a compact model from OpenCode Zen. I'm great for quick tasks and conversations.",
    "grok-code":
      "I'm Grok-Code, an OpenCode Zen model specialized for coding tasks. I can help you write, debug, and understand code.",
    "glm-4.7-free":
      "I'm GLM-4.7-Free, an OpenCode Zen model from Zhipu AI. I'm designed for free-tier usage with good performance.",
    "claude-sonnet-4-5":
      "I'm Claude Sonnet 4.5, hosted via OpenCode Zen. I'm great for complex reasoning and creative tasks.",
    "claude-opus-4-5-thinking":
      "I'm Claude Opus 4.5 with thinking capabilities, hosted via OpenCode Zen. I excel at deep analysis.",
    "gemini-2.5-flash": "I'm Gemini 2.5 Flash, hosted via OpenCode Zen. I'm fast and efficient for most tasks.",
    "gemini-2.5-pro": "I'm Gemini 2.5 Pro, hosted via OpenCode Zen. I'm powerful for complex reasoning.",
  }

  const response = responses[modelName as keyof typeof responses] || `I'm ${modelName}, an OpenCode Zen model.`

  return `${response}\n\nYou said: "${lastUserMessage.substring(0, 100)}..."\n\nHow can I help you further? (Note: Full OpenCode Zen functionality requires the complete OpenCode framework with model routing)`
}

class AGUISessionManager {
  private sessions = new Map<string, WSContext>()

  addSession(sessionId: string, ws: WSContext): void {
    this.sessions.set(sessionId, ws)
  }

  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId)
  }

  getSession(sessionId: string): WSContext | undefined {
    return this.sessions.get(sessionId)
  }

  async getOrCreateAgent(sessionId: string, agentId: string): Promise<string> {
    // Simplified: just return the agentId for now
    // Agent creation logic would go here if needed
    return agentId || "default"
  }

  getSessionCount(): number {
    return this.sessions.size
  }

  getSessionIds(): string[] {
    return Array.from(this.sessions.keys())
  }

  broadcastToSession(sessionId: string, event: AGUIEvent): void {
    const ws = this.sessions.get(sessionId)
    console.log(`[AG-UI] Broadcasting to session ${sessionId}, found connection: ${!!ws}`)
    if (ws) {
      console.log(`[AG-UI] Sending event: ${JSON.stringify(event)}`)
      ws.send(JSON.stringify(event))
    } else {
      console.log(`[AG-UI] No WebSocket connection found for session: ${sessionId}`)
      console.log(`[AG-UI] Available sessions: ${this.getSessionIds().join(", ")}`)
    }
  }
}

const sessionManager = new AGUISessionManager()

async function addToConversationHistory(sessionId: string, role: string, content: string) {
  if (!conversationHistory.has(sessionId)) {
    conversationHistory.set(sessionId, { sessionId, messages: [] })
  }

  const history = conversationHistory.get(sessionId)
  if (history) {
    history.messages.push({ role, content, timestamp: Date.now() })

    if (history.messages.length > 50) {
      history.messages = history.messages.slice(-20)
    }
  }
}

async function getConversationHistory(sessionId: string): Promise<Array<{ role: string; content: string }>> {
  const history = conversationHistory.get(sessionId)
  if (!history) return []

  return history.messages.map((m) => ({ role: m.role, content: m.content }))
}

async function handleWebSocketMessage(
  ws: WSContext,
  message: AGUIMessage,
  sessionId: string | null,
  setSessionId: (sid: string) => void,
) {
  switch (message.method) {
    case "authenticate":
      await handleAuthentication(ws, message, sessionId, setSessionId)
      break
    case "agent.message":
      await handleAgentMessage(ws, message, sessionId)
      break
    case "session.create":
      await handleSessionCreate(ws, message, sessionId, setSessionId)
      break
    case "session.end":
      await handleSessionEnd(ws, message, sessionId, setSessionId)
      break
    default:
      ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32601, message: "Method not found" },
          id: message.id,
        }),
      )
  }
}

async function handleAuthentication(
  ws: WSContext,
  message: AGUIMessage,
  sessionId: string | null,
  setSessionId: (sid: string) => void,
) {
  console.log(`[AG-UI] Authentication handler called with sessionId: ${sessionId}`)
  const { sessionId: sid, token } = message.params
  console.log(`[AG-UI] Extracted sid: ${sid}, token: ${token?.substring(0, 10)}...`)

  if (!sid) {
    ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32602, message: "Invalid params: sessionId required" },
        id: message.id,
      }),
    )
    return
  }

  try {
    setSessionId(sid)
    console.log(`[AG-UI] Adding session ${sid} to sessionManager`)
    sessionManager.addSession(sid, ws)
    console.log(`[AG-UI] Session added. Available sessions: ${sessionManager.getSessionIds().join(", ")}`)

    ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        result: { authenticated: true, sessionId: sid },
        id: message.id,
      }),
    )

    log.info("Session authenticated", { sessionId: sid })
  } catch (error) {
    ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Authentication failed" },
        id: message.id,
      }),
    )
  }
}

async function handleAgentMessage(ws: WSContext, message: AGUIMessage, sessionId: string | null) {
  if (!sessionId) {
    ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Not authenticated" },
        id: message.id,
      }),
    )
    return
  }

  const { agentId, content, sessionId: msgSessionId, model } = message.params

  // Use provided model or default to opencode/glm-4.7-free
  const selectedModel = model || "opencode/glm-4.7-free"

  console.log(
    `[AG-UI] handleAgentMessage: model=${model}, selectedModel=${selectedModel}, isOllama=${selectedModel.startsWith("ollama/")}`,
  )

  // Use sessionId from WebSocket state, or fallback to message params
  const actualSessionId = sessionId || msgSessionId

  console.log(
    `[AG-UI] Processing agent message: "${content}" for session ${actualSessionId} (from ${sessionId ? "state" : "message"})`,
  )

  if (!actualSessionId) {
    console.error(`[AG-UI] No sessionId available for agent message`)
    ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32602, message: "Invalid params: sessionId required" },
        id: message.id,
      }),
    )
    return
  }

  try {
    console.log(`[AG-UI] Broadcasting thinking status for session ${actualSessionId}`)
    sessionManager.broadcastToSession(actualSessionId, {
      id: `thinking_${Date.now()}`,
      type: "agent.thinking",
      timestamp: Date.now(),
      data: {},
      metadata: { sessionId: actualSessionId, userId: "dev-user", agentId: "default" },
    })

    // Add user message to conversation history
    await addToConversationHistory(actualSessionId, "user", content)

    // Get conversation history for AI context
    const history = await getConversationHistory(actualSessionId)

    // Prepare messages for AI: system prompt + history + current user message
    const messages: Array<{ role: string; content: string; timestamp: number }> = []

    // Add system prompt
    const system = SystemPrompt.header("openai")
    system.forEach((line) => {
      if (line.trim()) {
        messages.push({
          role: "system",
          content: line,
          timestamp: Date.now(),
        })
      }
    })

    // Add conversation history
    history.forEach((msg) => {
      messages.push({
        role: msg.role,
        content: msg.content,
        timestamp: Date.now(),
      })
    })

    // Add current user message
    messages.push({
      role: "user",
      content: content,
      timestamp: Date.now(),
    })

    // Generate AI response with conversation context
    let aiResponse: string
    const isOllama = selectedModel.startsWith("ollama/")

    if (isOllama) {
      // Build prompt for Ollama
      const systemPrompt = `You are a helpful AI coding assistant. Be concise and practical.`
      const historyText = history.map((m) => `${m.role}: ${m.content}`).join("\n")
      const fullPrompt = `${systemPrompt}\n\nPrevious conversation:\n${historyText}\n\nUser: ${content}\n\nAssistant:`

      console.log(`[AG-UI] Calling Ollama with model: ${selectedModel}`)
      aiResponse = await callOllama(selectedModel, fullPrompt)
    } else {
      // Use OpenCode Provider system for all other models (opencode/*, google/*, anthropic/*, openai/*, etc.)
      console.log(`[AG-UI] Calling Provider with model: ${selectedModel}`)

      // Build messages in AI SDK format
      const providerMessages: Array<{ role: string; content: string }> = [
        { role: "system", content: "You are a helpful AI coding assistant. Be concise and practical." },
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: content },
      ]

      try {
        aiResponse = await callWithProvider(selectedModel, providerMessages)
      } catch (error) {
        // Detailed error logging
        const err = error as Error
        console.error(`[AG-UI] Provider API failed: ${err.message}`)
        console.error(`[AG-UI] Stack: ${err.stack || "no stack"}`)

        const contextSummary =
          history.length > 0
            ? `Previous conversation: ${history
                .slice(-3)
                .map((m) => `${m.role}: ${m.content.substring(0, 50)}...`)
                .join("; ")}`
            : "This is the start of our conversation"
        aiResponse = `[${selectedModel}] ${contextSummary}. You said: "${content}". How can I help you further?`
      }
    }

    console.log(
      `[AG-UI] Generated AI response using model: ${selectedModel}, with ${history.length + 1} messages of context`,
    )

    const response = {
      content: aiResponse,
      role: "assistant",
    }

    console.log(`[AG-UI] Broadcasting response for session: ${actualSessionId}`)
    sessionManager.broadcastToSession(actualSessionId, {
      id: `response_${Date.now()}`,
      type: "agent.message",
      timestamp: Date.now(),
      data: {
        content: response.content,
        role: response.role,
        model: selectedModel,
      },
      metadata: { sessionId: actualSessionId, userId: "dev-user", agentId: "default" },
    })

    console.log(`[AG-UI] Successfully processed message for session: ${actualSessionId}`)
  } catch (error) {
    console.error(`[AG-UI] Agent message processing failed for session ${actualSessionId}:`, error)

    sessionManager.broadcastToSession(actualSessionId, {
      id: `error_${Date.now()}`,
      type: "agent.error",
      timestamp: Date.now(),
      data: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      metadata: { sessionId: actualSessionId, userId: "dev-user", agentId },
    })
  }
}

async function handleSessionCreate(
  ws: WSContext,
  message: AGUIMessage,
  sessionId: string | null,
  setSessionId: (sid: string) => void,
) {
  const { agentId, metadata } = message.params

  if (!sessionId) {
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    setSessionId(newSessionId)
    sessionManager.addSession(newSessionId, ws)
    sessionId = newSessionId
  }

  await Storage.write([`session:${sessionId}`], {
    id: sessionId,
    agentId: agentId || "default",
    metadata: metadata || {},
    createdAt: new Date().toISOString(),
    status: "active",
  })

  ws.send(
    JSON.stringify({
      jsonrpc: "2.0",
      result: { sessionId },
      id: message.id,
    }),
  )
}

async function handleSessionEnd(
  ws: WSContext,
  message: AGUIMessage,
  sessionId: string | null,
  setSessionId: (sid: string) => void,
) {
  if (sessionId) {
    const existingData = (await Storage.read([`session:${sessionId}`])) || {}
    await Storage.write([`session:${sessionId}`], {
      ...existingData,
      status: "ended",
      endedAt: new Date().toISOString(),
    })

    sessionManager.removeSession(sessionId)
    setSessionId("")
  }

  ws.send(
    JSON.stringify({
      jsonrpc: "2.0",
      result: { ended: true },
      id: message.id,
    }),
  )
}

export const AGUIRoutes = new Hono()

// Authentication middleware for AG-UI routes - simplified for development
const aguiAuth = async (c: any, next: any) => {
  console.log("Local aguiAuth called")
  const authHeader = c.req.header("Authorization")
  console.log("Auth header:", authHeader)
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("Missing or invalid auth header")
    return c.json({ error: "Missing authorization header" }, 401)
  }

  // Mock user for development - accept any Bearer token
  const user = {
    id: "dev-user-123",
    email: "dev@example.com",
    workspaceId: "dev-workspace",
    permissions: ["agent:default", "session:read", "session:write"],
  }

  c.set("user", user)
  console.log("Auth successful, calling next()")
  return next()
}

// Session authorization middleware
const sessionAuth = async (c: any, next: any) => {
  const user = c.get("user")
  const sessionId = c.req.query("sessionId") || c.req.header("X-Session-ID")

  if (!sessionId) {
    return c.json({ error: "Session ID required" }, 400)
  }

  try {
    const session = await Auth.validateSession(sessionId, user.id)
    if (!session) {
      return c.json({ error: "Access denied to session" }, 403)
    }

    c.set("session", session)
    return next()
  } catch (error) {
    log.error("Session authorization failed", { error, sessionId, userId: user?.id })
    return c.json({ error: "Session authorization failed" }, 403)
  }
}

// Combined AG-UI authentication middleware
// Temporarily disable session auth for development
export const aguiAuthMiddleware = [aguiAuth] // , sessionAuth

// WebSocket endpoint for real-time AG-UI communication
AGUIRoutes.get(
  "/ws",
  upgradeWebSocket(async (c) => {
    let currentSessionId: string | null = null
    let authenticated = false
    let user: any = null

    return {
      onMessage: async (event, ws) => {
        try {
          const data: AGUIMessage = JSON.parse(event.data.toString())
          console.log("WebSocket message:", data)

          // Handle authentication first
          if (data.method === "authenticate") {
            const { sessionId, token } = data.params || {}

            console.log(`[AG-UI] Authentication attempt with token: ${token?.substring(0, 10)}...`)

            // Simple auth for development
            if (token && token.length >= 10) {
              user = {
                id: "dev-user-123",
                email: "dev@example.com",
                workspaceId: "dev-workspace",
                permissions: ["agent:default", "session:read", "session:write"],
              }
              authenticated = true
              currentSessionId = sessionId || "dev-session"

              // Register the WebSocket connection in session manager
              console.log(`[AG-UI] Registering WebSocket for session: ${currentSessionId}`)
              sessionManager.addSession(currentSessionId as string, ws)

              ws.send(
                JSON.stringify({
                  jsonrpc: "2.0",
                  id: data.id,
                  result: { authenticated: true, sessionId: currentSessionId },
                }),
              )
              console.log(`[AG-UI] User authenticated via WebSocket, session: ${currentSessionId}`)
              return
            } else {
              console.log(`[AG-UI] Authentication failed for token: ${token}`)
              ws.send(
                JSON.stringify({
                  jsonrpc: "2.0",
                  error: { code: -32000, message: "Authentication failed" },
                  id: data.id,
                }),
              )
              ws.close(1008, "Authentication failed")
              return
            }
          }

          // Check if authenticated for other messages
          if (!authenticated) {
            console.log(`[AG-UI] Unauthenticated message attempt: ${data.method}`)
            ws.send(
              JSON.stringify({
                jsonrpc: "2.0",
                error: { code: -32000, message: "Not authenticated" },
                id: data.id || null,
              }),
            )
            return
          }

          // Handle other messages with the current session ID
          if (currentSessionId) {
            console.log(`[AG-UI] Handling ${data.method} for authenticated session: ${currentSessionId}`)
            await handleWebSocketMessage(ws, data, currentSessionId as string, (sid) => {
              currentSessionId = sid
            })
          } else {
            console.error(`[AG-UI] No session ID available for authenticated user`)
            ws.send(
              JSON.stringify({
                jsonrpc: "2.0",
                error: { code: -32603, message: "Internal error" },
                id: data.id || null,
              }),
            )
          }
        } catch (error) {
          console.error("Failed to handle WebSocket message", { error, message: event.data.toString() })
          ws.send(
            JSON.stringify({
              jsonrpc: "2.0",
              error: { code: -32700, message: "Parse error" },
              id: null,
            }),
          )
        }
      },
      onClose: (event, ws) => {
        if (currentSessionId) {
          sessionManager.removeSession(currentSessionId)
          log.info("Session disconnected", { sessionId: currentSessionId })
        }
      },
    }
  }),
)

// REST API fallback for non-WebSocket clients
AGUIRoutes.post("/events", ...aguiAuthMiddleware, contentFilterMiddleware, async (c) => {
  const body = await c.req.json()
  const user = (c as any).get("user")

  // Process the event via REST API
  return c.json({ received: true })
})

// Chat API using proper OpenCode framework context
AGUIRoutes.post("/chat", async (c) => {
  try {
    const body = await c.req.json()
    const { message, model, sessionId } = body

    if (!message) {
      return c.json({ error: "Message required" }, 400)
    }

    console.log(`[AG-UI/Chat] Received message: ${message}, model: ${model}`)

    // Check if this is an Ollama model - use Ollama API directly
    const isOllama = model && model.startsWith("ollama/")

    if (isOllama) {
      // Build prompt for Ollama
      const systemPrompt = `You are a helpful AI coding assistant. Be concise and practical.`
      const fullPrompt = `${systemPrompt}\n\nUser: ${message}\n\nAssistant:`

      console.log(`[AG-UI/Chat] Calling Ollama with model: ${model}`)
      const response = await callOllama(model, fullPrompt)

      return c.json({
        response: response,
        model: model,
      })
    }

    // Use Instance.provide to set up context for non-Ollama models
    // Note: Cloud models require proper API key configuration in Provider system
    // For now, we only support Ollama models directly
    return c.json({
      response:
        `[${model || "unknown"}] Cloud models require API key configuration. ` +
        `Please use Ollama models (ollama/*) for local inference, ` +
        `or configure API keys for cloud providers.`,
      model: model || "unknown",
      note: "cloud_models_require_configuration",
    })
  } catch (error) {
    console.error(`[AG-UI/Chat] Error:`, error)
    return c.json({ error: "Internal server error" }, 500)
  }
})

// Export the routes for server registration
export { AGUIRoutes as aguiRoutes }
