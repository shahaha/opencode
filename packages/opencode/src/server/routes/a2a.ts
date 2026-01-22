// A2A (Agent-to-Agent) Protocol Implementation
// Based on https://a2a-protocol.org/latest/

import { Hono } from "hono"
import { z } from "zod"
import { Log } from "../../util/log"

const log = Log.create({ service: "a2a" })

// ============================================================================
// A2A Types (based on protocol specification)
// ============================================================================

type MessagePartType = "text" | "image" | "data" | "audio" | "video"

interface MessagePart {
  type: MessagePartType
  text?: string
  mimeType?: string
  data?: string
  url?: string
}

interface PushNotificationConfig {
  url: string
  token?: string
}

interface Message {
  role: "user" | "agent"
  parts: MessagePart[]
  messageId?: string
  timestamp?: number
}

interface Task {
  taskId: string
  agentId: string
  sessionId?: string
  status: "pending" | "processing" | "completed" | "failed" | "canceled"
  messages: Message[]
  artifacts?: any[]
  createdAt: number
  updatedAt: number
  metadata?: Record<string, any>
  pushNotification?: PushNotificationConfig
}

// ============================================================================
// A2A Agent Discovery Types
// ============================================================================

interface DiscoveredAgent {
  id: string
  name: string
  description: string
  url: string
  provider: {
    organization: string
    url?: string
  }
  version: string
  capabilities: {
    streaming: boolean
    pushNotifications: boolean
    stateTransitionHistory: boolean
  }
  authentication?: {
    schemes: string[]
  }
  skills: Array<{
    id: string
    name: string
    description: string
    inputModes: string[]
    outputModes: string[]
    examples?: string[]
  }>
  mcpTools?: Array<{
    name: string
    description: string
    inputSchema?: Record<string, any>
  }>
  source: "local" | "registry" | "well-known" | "manual" | "broadcast"
  discoveredAt: number
  lastChecked?: number
  status: "available" | "unavailable" | "unknown"
}

interface AgentRegistry {
  url: string
  name: string
  description?: string
  enabled: boolean
}

interface DiscoveryConfig {
  registries: AgentRegistry[]
  wellKnownDomains: string[]
  manualAgents: DiscoveredAgent[]
  scanInterval: number // milliseconds
  lastScanTime?: number
}

// ============================================================================
// Agent Discovery Storage
// ============================================================================

const discoveredAgents = new Map<string, DiscoveredAgent>()

// Default discovery configuration
const discoveryConfig: DiscoveryConfig = {
  registries: [
    {
      url: "http://localhost:5000",
      name: "Local OpenCode",
      description: "Local OpenCode instance",
      enabled: true,
    },
  ],
  wellKnownDomains: ["http://localhost:5000", "http://127.0.0.1:5000", "https://agents.opencode.ai"],
  manualAgents: [],
  scanInterval: 300000,
}

interface DelegationTask {
  taskId: string
  originalTaskId?: string
  sourceAgent: string
  targetAgent: DiscoveredAgent
  status: "pending" | "processing" | "completed" | "failed" | "delegated"
  message: Message
  result?: Message
  createdAt: number
  updatedAt: number
  metadata?: {
    delegatedAt?: number
    completedAt?: number
    originalTaskId?: string
  }
}

const delegatedTasks = new Map<string, DelegationTask>()
let delegationCounter = 0

// ============================================================================
// Agent Discovery Functions
// ============================================================================

function generateAgentId(url: string): string {
  return `agent_${Buffer.from(url).toString("base64url").slice(0, 16)}`
}

async function fetchAgentCard(agentUrl: string): Promise<DiscoveredAgent | null> {
  try {
    const wellKnownUrl = `${agentUrl.replace(/\/$/, "")}/.well-known/agent.json`
    const response = await fetch(wellKnownUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) {
      log.warn("Failed to fetch agent card", { url: wellKnownUrl, status: response.status })
      return null
    }

    const card = await response.json()

    // Validate required fields
    if (!card.name || !card.url) {
      log.warn("Invalid agent card - missing required fields", { url: wellKnownUrl })
      return null
    }

    return {
      id: generateAgentId(card.url),
      name: card.name,
      description: card.description || "",
      url: card.url,
      provider: card.provider || { organization: "Unknown" },
      version: card.version || "1.0.0",
      capabilities: card.capabilities || {
        streaming: false,
        pushNotifications: false,
        stateTransitionHistory: true,
      },
      authentication: card.authentication,
      skills: card.skills || [],
      source: "well-known",
      discoveredAt: Date.now(),
      lastChecked: Date.now(),
      status: "available",
    }
  } catch (error) {
    log.debug("Failed to fetch agent card", { url: agentUrl, error })
    return null
  }
}

async function discoverFromRegistry(registry: AgentRegistry): Promise<DiscoveredAgent[]> {
  const agents: DiscoveredAgent[] = []

  try {
    const response = await fetch(`${registry.url}/a2a/agents`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      log.warn("Registry request failed", { registry: registry.url, status: response.status })
      return agents
    }

    const data = await response.json()
    const agentList = data.agents || data || []

    for (const card of agentList) {
      if (card.name && card.url) {
        const agent: DiscoveredAgent = {
          id: generateAgentId(card.url),
          name: card.name,
          description: card.description || "",
          url: card.url,
          provider: card.provider || { organization: registry.name },
          version: card.version || "1.0.0",
          capabilities: card.capabilities || {
            streaming: false,
            pushNotifications: false,
            stateTransitionHistory: true,
          },
          authentication: card.authentication,
          skills: card.skills || [],
          source: "registry",
          discoveredAt: Date.now(),
          lastChecked: Date.now(),
          status: "available",
        }
        agents.push(agent)
      }
    }

    log.info("Discovered agents from registry", { registry: registry.url, count: agents.length })
  } catch (error) {
    log.warn("Registry discovery failed", { registry: registry.url, error })
  }

  return agents
}

async function scanWellKnownDomains(): Promise<DiscoveredAgent[]> {
  const agents: DiscoveredAgent[] = []

  for (const domain of discoveryConfig.wellKnownDomains) {
    const agent = await fetchAgentCard(domain)
    if (agent) {
      agents.push(agent)
      log.info("Discovered agent from well-known URI", { domain, name: agent.name })
    }
  }

  log.info("Well-known domain scan complete", {
    domains: discoveryConfig.wellKnownDomains.length,
    found: agents.length,
  })
  return agents
}

async function performFullDiscovery(): Promise<DiscoveredAgent[]> {
  const allAgents: DiscoveredAgent[] = []

  // 1. Add local agent
  const localAgent = getAgentCard()
  const localDiscovered: DiscoveredAgent = {
    id: "local-agent",
    name: localAgent.name,
    description: localAgent.description,
    url: localAgent.url,
    provider: localAgent.provider,
    version: localAgent.version,
    capabilities: localAgent.capabilities,
    authentication: localAgent.authentication,
    skills: localAgent.skills,
    source: "local",
    discoveredAt: Date.now(),
    lastChecked: Date.now(),
    status: "available",
  }
  allAgents.push(localDiscovered)

  // 2. Scan well-known domains
  const wellKnownAgents = await scanWellKnownDomains()
  allAgents.push(...wellKnownAgents)

  // 3. Query registries
  for (const registry of discoveryConfig.registries.filter((r) => r.enabled)) {
    const registryAgents = await discoverFromRegistry(registry)
    allAgents.push(...registryAgents)
  }

  // Add manual agents
  allAgents.push(...discoveryConfig.manualAgents)

  const agentMap = new Map<string, DiscoveredAgent>()
  allAgents.forEach((agent) => {
    const existing = discoveredAgents.get(agent.id)
    if (existing) {
      agent.lastChecked = existing.lastChecked
      agent.status = existing.status
    }
    agentMap.set(agent.id, agent)
  })

  for (const [id, agent] of agentMap) {
    discoveredAgents.set(id, agent)
  }

  discoveryConfig.lastScanTime = Date.now()
  log.info("Full discovery complete", { total: allAgents.length })

  return allAgents
}

function getDiscoveredAgents(): DiscoveredAgent[] {
  return Array.from(discoveredAgents.values())
}

function getAgentById(agentId: string): DiscoveredAgent | undefined {
  return discoveredAgents.get(agentId)
}

function addManualAgent(agent: Omit<DiscoveredAgent, "id" | "source" | "discoveredAt">): DiscoveredAgent {
  const fullAgent: DiscoveredAgent = {
    ...agent,
    id: generateAgentId(agent.url),
    source: "manual",
    discoveredAt: Date.now(),
  }

  discoveredAgents.set(fullAgent.id, fullAgent)
  log.info("Manual agent added", { name: fullAgent.name })

  return fullAgent
}

function removeAgent(agentId: string): boolean {
  const deleted = discoveredAgents.delete(agentId)
  if (deleted) {
    log.info("Agent removed", { agentId })
  }
  return deleted
}

function getDiscoveryStatus(): {
  total: number
  available: number
  unavailable: number
  lastScan: number | null
} {
  const agents = Array.from(discoveredAgents.values())
  return {
    total: agents.length,
    available: agents.filter((a) => a.status === "available").length,
    unavailable: agents.filter((a) => a.status === "unavailable").length,
    lastScan: discoveryConfig.lastScanTime || null,
  }
}

// ============================================================================
// MCP Tools Functions
// ============================================================================

interface MCPTool {
  name: string
  description: string
  inputSchema?: Record<string, any>
}

interface MCPServerStatus {
  status: string
  tools?: Record<string, MCPTool>
}

async function fetchLocalMcpTools(): Promise<MCPTool[]> {
  try {
    const response = await fetch("http://127.0.0.1:5000/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 1 }),
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) {
      return []
    }

    const data = await response.json()
    const tools: MCPTool[] = []

    if (data.result?.tools) {
      for (const [name, tool] of Object.entries(data.result.tools)) {
        const t = tool as any
        tools.push({
          name,
          description: t.description || "",
          inputSchema: t.inputSchema,
        })
      }
    }

    log.info("Fetched MCP tools", { count: tools.length })
    return tools
  } catch (error) {
    log.debug("Failed to fetch MCP tools", { error })
    return []
  }
}

function getMcpToolsForAgent(agentUrl: string): MCPTool[] {
  if (agentUrl.includes("localhost:5000") || agentUrl.includes("127.0.0.1:5000")) {
    return [
      {
        name: "context7_query-docs",
        description: "Query Context7 documentation for libraries and frameworks",
        inputSchema: {
          type: "object",
          properties: {
            libraryId: { type: "string", description: "Library identifier (e.g., /vercel/next.js)" },
            query: { type: "string", description: "Query about the library" },
          },
          required: ["libraryId", "query"],
        },
      },
      {
        name: "web_search_exa",
        description: "Search the web using Exa AI for current information",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            numResults: { type: "number", description: "Number of results (default: 8)" },
          },
          required: ["query"],
        },
      },
      {
        name: "grep_app",
        description: "Search code patterns in the codebase",
        inputSchema: {
          type: "object",
          properties: {
            pattern: { type: "string", description: "Code pattern to search" },
            path: { type: "string", description: "Directory to search" },
          },
          required: ["pattern"],
        },
      },
      {
        name: "lsp_goto_definition",
        description: "Go to symbol definition in code",
        inputSchema: {
          type: "object",
          properties: {
            filePath: { type: "string", description: "File path" },
            line: { type: "number", description: "Line number" },
            character: { type: "number", description: "Character position" },
          },
          required: ["filePath", "line", "character"],
        },
      },
    ]
  }
  return []
}

// ============================================================================
// In-memory task storage (for demo purposes)
// In production, this would be a database
// ============================================================================

const tasks = new Map<string, Task>()
let taskCounter = 0

// ============================================================================
// Helper Functions
// ============================================================================

function generateTaskId(): string {
  return `task_${Date.now()}_${++taskCounter}`
}

interface TaskSubmitParams {
  sessionId?: string
  message: Message
  acceptedInputModes?: string[]
  pushNotification?: PushNotificationConfig
}

function createTask(agentId: string, params: TaskSubmitParams): Task {
  const taskId = generateTaskId()
  const now = Date.now()

  const task: Task = {
    taskId,
    agentId,
    sessionId: params.sessionId,
    status: "pending",
    messages: [params.message],
    createdAt: now,
    updatedAt: now,
    pushNotification: params.pushNotification,
  }

  tasks.set(taskId, task)
  log.info("Task created", { taskId, agentId })

  processTask(taskId)

  return task
}

async function processTask(taskId: string): Promise<void> {
  const task = tasks.get(taskId)
  if (!task) return

  task.status = "processing"
  task.updatedAt = Date.now()

  try {
    const agentMessage: Message = {
      role: "agent",
      parts: [
        { type: "text", text: `I received your message. I'm an OpenCode A2A-compatible agent. Task ID: ${taskId}` },
      ],
      messageId: `msg_${Date.now()}`,
      timestamp: Date.now(),
    }

    task.messages.push(agentMessage)
    task.status = "completed"
    task.updatedAt = Date.now()

    log.info("Task completed", { taskId })
  } catch (error) {
    task.status = "failed"
    task.updatedAt = Date.now()
    log.error("Task failed", { taskId, error })
  }
}

function getTask(taskId: string): Task | undefined {
  return tasks.get(taskId)
}

function cancelTask(taskId: string): boolean {
  const task = tasks.get(taskId)
  if (!task) return false

  if (task.status === "pending" || task.status === "processing") {
    task.status = "canceled"
    task.updatedAt = Date.now()
    log.info("Task canceled", { taskId })
    return true
  }

  return false
}

// ============================================================================
// Agent Card for OpenCode
// ============================================================================

interface AgentSkill {
  id: string
  name: string
  description: string
  inputModes: string[]
  outputModes: string[]
  examples?: string[]
}

interface AgentCapabilities {
  streaming: boolean
  pushNotifications: boolean
  stateTransitionHistory: boolean
}

interface AgentProvider {
  organization: string
  url?: string
}

interface AgentCard {
  name: string
  description: string
  url: string
  provider: AgentProvider
  version: string
  capabilities: AgentCapabilities
  authentication?: {
    schemes: string[]
  }
  skills: AgentSkill[]
  mcpTools?: MCPTool[]
}

function getAgentCard(): AgentCard {
  const baseUrl = process.env.OPENCODE_BASE_URL || "http://localhost:5000"
  const agentUrl = `${baseUrl}/a2a`
  const mcpTools = getMcpToolsForAgent(agentUrl)

  return {
    name: "OpenCode Agent",
    description: "A powerful AI coding assistant for code exploration, generation, and refactoring.",
    url: agentUrl,
    provider: {
      organization: "OpenCode",
      url: "https://opencode.ai",
    },
    version: "1.0.0",
    capabilities: {
      streaming: true,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    authentication: {
      schemes: ["Bearer"],
    },
    skills: [
      {
        id: "code-exploration",
        name: "Code Exploration",
        description: "Explore and understand codebases, find files, search for patterns",
        inputModes: ["text"],
        outputModes: ["text"],
        examples: ["Find all API endpoints", "How does authentication work?"],
      },
      {
        id: "code-generation",
        name: "Code Generation",
        description: "Write new code, implement features, create tests",
        inputModes: ["text"],
        outputModes: ["text"],
        examples: ["Create a REST API endpoint", "Write unit tests"],
      },
      {
        id: "file-operations",
        name: "File Operations",
        description: "Read, write, and manage files in the workspace",
        inputModes: ["text"],
        outputModes: ["text"],
        examples: ["Read package.json", "Create a new component file"],
      },
    ],
    mcpTools,
  }
}

// ============================================================================
// A2A Routes
// ============================================================================

const A2ARoutes = new Hono()

// CORS headers for all A2A routes
A2ARoutes.use("/*", async (c, next) => {
  c.header("Access-Control-Allow-Origin", "*")
  c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  c.header("Access-Control-Allow-Headers", "Content-Type, Authorization")
  if (c.req.method === "OPTIONS") {
    return c.text("OK", 200)
  }
  await next()
})

// --------------------------------------------------------------------------
// Well-Known URI at root level (for A2A specification compliance)
// --------------------------------------------------------------------------
A2ARoutes.get("/", async (c) => {
  const agentCard = getAgentCard()
  return c.json(agentCard)
})

// --------------------------------------------------------------------------
// Agent Card (Well-Known URI)
// GET /.well-known/agent.json or /a2a/agent-card
// --------------------------------------------------------------------------
A2ARoutes.get("/.well-known/agent.json", async (c) => {
  const agentCard = getAgentCard()
  return c.json(agentCard)
})

A2ARoutes.get("/agent-card", async (c) => {
  const agentCard = getAgentCard()
  return c.json(agentCard)
})

// --------------------------------------------------------------------------
// Agent Info
// GET /a2a
// --------------------------------------------------------------------------
A2ARoutes.get("/", async (c) => {
  return c.json({
    name: "OpenCode A2A Server",
    version: "1.0.0",
    protocol: "A2A",
    specificationUrl: "https://a2a-protocol.org/latest/",
    endpoints: {
      agentCard: "/agent-card",
      agentCardWellKnown: "/.well-known/agent.json",
      submitTask: "POST /tasks",
      getTask: "GET /tasks/:taskId",
      cancelTask: "POST /tasks/:taskId/cancel",
    },
  })
})

// --------------------------------------------------------------------------
// Task Management
// --------------------------------------------------------------------------

// Submit a new task
// POST /a2a/tasks
A2ARoutes.post("/tasks", async (c) => {
  try {
    const body = await c.req.json()

    const submitSchema = z.object({
      sessionId: z.string().optional(),
      message: z.object({
        role: z.enum(["user", "agent"]),
        parts: z.array(
          z.object({
            type: z.enum(["text", "image", "data", "audio", "video"]),
            text: z.string().optional(),
            mimeType: z.string().optional(),
            data: z.string().optional(),
            url: z.string().optional(),
          }),
        ),
      }),
      acceptedInputModes: z.array(z.string()).optional(),
      pushNotification: z
        .object({
          url: z.string(),
          token: z.string().optional(),
        })
        .optional(),
    })

    const params = submitSchema.parse(body)

    const agentId = "opencode-agent"
    const task = createTask(agentId, params)

    return c.json({
      taskId: task.taskId,
      status: task.status,
      result: null,
    })
  } catch (error) {
    const err = error as Error
    log.error("Task submission failed", { error: err.message })
    return c.json(
      {
        error: {
          code: "INVALID_PARAMS",
          message: err.message,
        },
      },
      400,
    )
  }
})

// Get task status and result
// GET /a2a/tasks/:taskId
A2ARoutes.get("/tasks/:taskId", async (c) => {
  const taskId = c.req.param("taskId")
  const history = c.req.query("history") === "true"
  const details = c.req.query("details") === "true"

  const task = getTask(taskId)
  if (!task) {
    return c.json(
      {
        error: {
          code: "TASK_NOT_FOUND",
          message: `Task not found: ${taskId}`,
        },
      },
      404,
    )
  }

  const response: any = {
    taskId: task.taskId,
    agentId: task.agentId,
    status: task.status,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }

  if (details || task.status === "completed") {
    response.result = {
      messages: history ? task.messages : task.messages.slice(-1),
    }
  }

  if (history) {
    response.history = {
      stateHistory: task.messages.map((msg, idx) => ({
        state: idx === task.messages.length - 1 ? task.status : "intermediate",
        timestamp: msg.timestamp || task.createdAt,
      })),
    }
  }

  if (task.pushNotification) {
    response.pushNotification = {
      url: task.pushNotification.url,
    }
  }

  return c.json(response)
})

// Cancel a task
// POST /a2a/tasks/:taskId/cancel
A2ARoutes.post("/tasks/:taskId/cancel", async (c) => {
  const taskId = c.req.param("taskId")

  const task = getTask(taskId)
  if (!task) {
    return c.json(
      {
        error: {
          code: "TASK_NOT_FOUND",
          message: `Task not found: ${taskId}`,
        },
      },
      404,
    )
  }

  const canceled = cancelTask(taskId)
  if (!canceled) {
    return c.json(
      {
        error: {
          code: "TASK_NOT_CANCELABLE",
          message: `Task cannot be canceled in current status: ${task.status}`,
        },
      },
      400,
    )
  }

  return c.json({
    taskId: task.taskId,
    status: task.status,
    result: null,
  })
})

// --------------------------------------------------------------------------
// Task Streaming (Server-Sent Events)
// --------------------------------------------------------------------------

// Stream task updates via Server-Sent Events
// GET /a2a/tasks/:taskId/stream
A2ARoutes.get("/tasks/:taskId/stream", async (c) => {
  const taskId = c.req.param("taskId")

  const task = getTask(taskId)
  if (!task) {
    return c.text("Task not found", 404)
  }

  // Set up SSE headers
  c.header("Content-Type", "text/event-stream")
  c.header("Cache-Control", "no-cache")
  c.header("Connection", "keep-alive")
  c.header("X-Accel-Buffering", "no")

  // Get the writable stream
  const stream = c.req.raw.body

  // Create a readable stream for SSE
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()

  // Function to send SSE event
  const sendEvent = async (event: string, data: any) => {
    await writer.write(encoder.encode(`event: ${event}\n`))
    await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
  }

  // Send initial task state
  await sendEvent("task", {
    taskId: task.taskId,
    agentId: task.agentId,
    status: task.status,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  })

  // Send current messages as they are available
  if (task.messages.length > 0) {
    for (const message of task.messages) {
      await sendEvent("message", message)
    }
  }

  // Check if task is already completed
  if (task.status === "completed" || task.status === "failed" || task.status === "canceled") {
    await sendEvent("done", {
      taskId: task.taskId,
      status: task.status,
      result: task.status === "completed" ? { messages: task.messages } : null,
    })
    await writer.close()
    return c.body(readable)
  }

  // For ongoing tasks, we'll simulate streaming by sending periodic updates
  // In a real implementation, this would wait for actual task updates
  const checkInterval = setInterval(async () => {
    const updatedTask = getTask(taskId)
    if (!updatedTask) {
      clearInterval(checkInterval)
      await sendEvent("error", { message: "Task not found" })
      await writer.close()
      return
    }

    // Send any new messages
    if (updatedTask.messages.length > task.messages.length) {
      const newMessages = updatedTask.messages.slice(task.messages.length)
      for (const message of newMessages) {
        await sendEvent("message", message)
      }
      task.messages = [...updatedTask.messages]
    }

    // Check if task is completed
    if (updatedTask.status === "completed" || updatedTask.status === "failed" || updatedTask.status === "canceled") {
      clearInterval(checkInterval)
      await sendEvent("done", {
        taskId: updatedTask.taskId,
        status: updatedTask.status,
        result: updatedTask.status === "completed" ? { messages: updatedTask.messages } : null,
      })
      await writer.close()
    }
  }, 1000)

  // Clean up on client disconnect
  c.req.raw.signal.addEventListener("abort", () => {
    clearInterval(checkInterval)
    writer.close()
  })

  return c.body(readable)
})

// List all tasks
// GET /a2a/tasks
A2ARoutes.get("/tasks", async (c) => {
  const tasksArray = Array.from(tasks.values()).map((task) => ({
    taskId: task.taskId,
    agentId: task.agentId,
    status: task.status,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }))

  return c.json({
    tasks: tasksArray,
    total: tasksArray.length,
  })
})

// --------------------------------------------------------------------------
// Message Operations
// --------------------------------------------------------------------------

// Send a message to an existing task
// POST /a2a/tasks/:taskId/messages
A2ARoutes.post("/tasks/:taskId/messages", async (c) => {
  const taskId = c.req.param("taskId")

  const task = getTask(taskId)
  if (!task) {
    return c.json(
      {
        error: {
          code: "TASK_NOT_FOUND",
          message: `Task not found: ${taskId}`,
        },
      },
      404,
    )
  }

  if (task.status !== "pending" && task.status !== "processing") {
    return c.json(
      {
        error: {
          code: "TASK_NOT_ACTIVE",
          message: `Cannot send messages to task in status: ${task.status}`,
        },
      },
      400,
    )
  }

  try {
    const body = await c.req.json()

    const messageSchema = z.object({
      role: z.enum(["user", "agent"]),
      parts: z.array(
        z.object({
          type: z.enum(["text", "image", "data", "audio", "video"]),
          text: z.string().optional(),
          mimeType: z.string().optional(),
          data: z.string().optional(),
          url: z.string().optional(),
        }),
      ),
    })

    const inputMessage = messageSchema.parse(body)
    const message: Message = {
      ...inputMessage,
      timestamp: Date.now(),
      messageId: `msg_${Date.now()}`,
    }

    task.messages.push(message)
    task.updatedAt = Date.now()

    return c.json({
      messageId: message.messageId,
      timestamp: message.timestamp,
    })
  } catch (error) {
    const err = error as Error
    return c.json(
      {
        error: {
          code: "INVALID_PARAMS",
          message: err.message,
        },
      },
      400,
    )
  }
})

// --------------------------------------------------------------------------
// Health Check
// --------------------------------------------------------------------------
A2ARoutes.get("/health", async (c) => {
  return c.json({
    status: "healthy",
    service: "a2a",
    timestamp: Date.now(),
  })
})

// --------------------------------------------------------------------------
// Agent Discovery Endpoints
// --------------------------------------------------------------------------

// List all discovered agents
A2ARoutes.get("/agents", async (c) => {
  const agents = getDiscoveredAgents()
  const status = getDiscoveryStatus()

  return c.json({
    agents,
    total: agents.length,
    status,
  })
})

// Trigger agent discovery
A2ARoutes.post("/agents/discover", async (c) => {
  try {
    const agents = await performFullDiscovery()
    return c.json({
      success: true,
      discovered: agents.length,
      agents,
      timestamp: Date.now(),
    })
  } catch (error) {
    const err = error as Error
    log.error("Discovery failed", { error: err.message })
    return c.json(
      {
        error: {
          code: "DISCOVERY_FAILED",
          message: err.message,
        },
      },
      500,
    )
  }
})

// Add manual agent
A2ARoutes.post("/agents", async (c) => {
  try {
    const body = await c.req.json()

    const agentSchema = z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      url: z.string().url(),
      provider: z
        .object({
          organization: z.string(),
          url: z.string().optional(),
        })
        .optional(),
      version: z.string().optional(),
      capabilities: z
        .object({
          streaming: z.boolean().optional(),
          pushNotifications: z.boolean().optional(),
          stateTransitionHistory: z.boolean().optional(),
        })
        .optional(),
      skills: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            description: z.string().optional(),
            inputModes: z.array(z.string()).optional(),
            outputModes: z.array(z.string()).optional(),
          }),
        )
        .optional(),
    })

    const agentData = agentSchema.parse(body)

    const agent = addManualAgent({
      name: agentData.name,
      description: agentData.description || "",
      url: agentData.url,
      provider: agentData.provider || { organization: "Manual" },
      version: agentData.version || "1.0.0",
      capabilities: {
        streaming: agentData.capabilities?.streaming ?? false,
        pushNotifications: agentData.capabilities?.pushNotifications ?? false,
        stateTransitionHistory: agentData.capabilities?.stateTransitionHistory ?? true,
      },
      skills:
        agentData.skills?.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description || "",
          inputModes: s.inputModes || ["text"],
          outputModes: s.outputModes || ["text"],
        })) || [],
      status: "available",
    })

    return c.json({
      success: true,
      agent,
    })
  } catch (error) {
    const err = error as Error
    return c.json(
      {
        error: {
          code: "INVALID_AGENT",
          message: err.message,
        },
      },
      400,
    )
  }
})

// Remove agent
A2ARoutes.delete("/agents/:agentId", async (c) => {
  const agentId = c.req.param("agentId")
  const removed = removeAgent(agentId)

  if (!removed) {
    return c.json(
      {
        error: {
          code: "AGENT_NOT_FOUND",
          message: `Agent not found: ${agentId}`,
        },
      },
      404,
    )
  }

  return c.json({
    success: true,
    removed: agentId,
  })
})

A2ARoutes.get("/agents/status", async (c) => {
  const status = getDiscoveryStatus()
  return c.json({
    ...status,
    config: {
      registries: discoveryConfig.registries.length,
      wellKnownDomains: discoveryConfig.wellKnownDomains.length,
      manualAgents: discoveryConfig.manualAgents.length,
      scanInterval: discoveryConfig.scanInterval,
    },
  })
})

// Get single agent
A2ARoutes.get("/agents/:agentId", async (c) => {
  const agentId = c.req.param("agentId")
  const agent = getAgentById(agentId)

  if (!agent) {
    return c.json(
      {
        error: {
          code: "AGENT_NOT_FOUND",
          message: `Agent not found: ${agentId}`,
        },
      },
      404,
    )
  }

  return c.json(agent)
})

A2ARoutes.get("/agents/:agentId/capabilities", async (c) => {
  const agentId = c.req.param("agentId")
  const agent = getAgentById(agentId)

  if (!agent) {
    return c.json(
      {
        error: {
          code: "AGENT_NOT_FOUND",
          message: `Agent not found: ${agentId}`,
        },
      },
      404,
    )
  }

  let mcpTools = agent.mcpTools
  if (!mcpTools) {
    mcpTools = getMcpToolsForAgent(agent.url)
  }

  return c.json({
    agentId: agent.id,
    name: agent.name,
    capabilities: agent.capabilities,
    skills: agent.skills,
    mcpTools,
    authentication: agent.authentication,
  })
})

A2ARoutes.post("/agents/:agentId/mcp/invoke", async (c) => {
  try {
    const agentId = c.req.param("agentId")
    const agent = getAgentById(agentId)

    if (!agent) {
      return c.json(
        {
          error: {
            code: "AGENT_NOT_FOUND",
            message: `Agent not found: ${agentId}`,
          },
        },
        404,
      )
    }

    const body = await c.req.json()

    const invokeSchema = z.object({
      toolName: z.string(),
      arguments: z.record(z.string(), z.any()),
    })

    const params = invokeSchema.parse(body)

    // Determine which MCP server to call based on tool name
    // Map agent card tool names to MCP server and actual tool name
    let mcpServer = ""
    let actualToolName = params.toolName

    if (params.toolName === "context7_query-docs") {
      mcpServer = "context7"
      actualToolName = "context7_query-docs"
    } else if (params.toolName === "web_search_exa") {
      mcpServer = "websearch"
      actualToolName = "web_search_exa"
    } else if (params.toolName === "grep_app") {
      mcpServer = "grep_app"
      actualToolName = "grep_app"
    } else if (params.toolName === "lsp_goto_definition") {
      // This is an internal LSP tool, not an MCP tool
      return c.json(
        {
          error: {
            code: "TOOL_NOT_FOUND",
            message: `Tool not found: ${params.toolName}`,
          },
        },
        404,
      )
    }

    if (mcpServer) {
      const response = await fetch(`http://127.0.0.1:5000/mcp/${mcpServer}/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolName: actualToolName,
          arguments: params.arguments,
        }),
        signal: AbortSignal.timeout(30000),
      })

      if (!response.ok) {
        return c.json(
          {
            error: {
              code: "TOOL_INVOCATION_FAILED",
              message: `MCP tool invocation failed: ${response.statusText}`,
            },
          },
          500,
        )
      }

      const result = await response.json()
      return c.json(result)
    }

    // For non-MCP tools, try to call the agent's MCP endpoint
    if (agent.url.includes("localhost:5000") || agent.url.includes("127.0.0.1:5000")) {
      return c.json(
        {
          error: {
            code: "TOOL_NOT_FOUND",
            message: `Tool not found: ${params.toolName}`,
          },
        },
        404,
      )
    }

    const response = await fetch(`${agent.url}/mcp/invoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(30000),
    })

    if (!response.ok) {
      return c.json(
        {
          error: {
            code: "TOOL_INVOCATION_FAILED",
            message: `Tool invocation failed: ${response.statusText}`,
          },
        },
        500,
      )
    }

    const result = await response.json()
    return c.json(result)
  } catch (error) {
    const err = error as Error
    return c.json(
      {
        error: {
          code: "TOOL_INVOCATION_ERROR",
          message: err.message,
        },
      },
      400,
    )
  }
})

function generateDelegationId(): string {
  return `delegation_${Date.now()}_${++delegationCounter}`
}

async function delegateTaskToAgent(
  agent: DiscoveredAgent,
  message: Message,
  originalTaskId?: string,
): Promise<DelegationTask | null> {
  try {
    const delegationId = generateDelegationId()
    const now = Date.now()

    const delegationTask: DelegationTask = {
      taskId: delegationId,
      originalTaskId,
      sourceAgent: "opencode-local",
      targetAgent: agent,
      status: "pending",
      message,
      createdAt: now,
      updatedAt: now,
      metadata: {
        delegatedAt: now,
        originalTaskId,
      },
    }

    delegatedTasks.set(delegationId, delegationTask)

    const response = await fetch(`${agent.url}/a2a/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        message,
        sessionId: delegationId,
      }),
      signal: AbortSignal.timeout(60000),
    })

    if (!response.ok) {
      delegationTask.status = "failed"
      delegationTask.updatedAt = Date.now()
      log.warn("Delegation failed", { agent: agent.name, status: response.status })
      return delegationTask
    }

    const result = await response.json()

    delegationTask.status = "delegated"
    delegationTask.updatedAt = Date.now()

    if (result.taskId && agent.capabilities.streaming) {
      delegationTask.status = "processing"
      delegationTask.updatedAt = Date.now()

      for (let i = 0; i < 30; i++) {
        await new Promise((resolve) => setTimeout(resolve, 2000))

        const statusResponse = await fetch(`${agent.url}/a2a/tasks/${result.taskId}`, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(5000),
        })

        if (statusResponse.ok) {
          const status = await statusResponse.json()
          if (status.status === "completed" || status.status === "failed") {
            delegationTask.status = status.status
            delegationTask.updatedAt = Date.now()
            if (status.result?.messages?.[0]) {
              delegationTask.result = status.result.messages[0]
            }
            delegationTask.metadata!.completedAt = Date.now()
            break
          }
        }
      }
    } else if (result.result?.messages?.[0]) {
      delegationTask.result = result.result.messages[0]
      delegationTask.status = "completed"
      delegationTask.updatedAt = Date.now()
      delegationTask.metadata!.completedAt = Date.now()
    }

    log.info("Task delegated", {
      delegationId,
      agent: agent.name,
      status: delegationTask.status,
    })

    return delegationTask
  } catch (error) {
    const err = error as Error
    log.error("Delegation error", { agent: agent.name, error: err.message })
    return null
  }
}

function getDelegationTask(taskId: string): DelegationTask | undefined {
  return delegatedTasks.get(taskId)
}

function getAllDelegations(): DelegationTask[] {
  return Array.from(delegatedTasks.values())
}

A2ARoutes.post("/delegations", async (c) => {
  try {
    const body = await c.req.json()

    const delegationSchema = z.object({
      agentId: z.string(),
      message: z.object({
        role: z.enum(["user", "agent"]),
        parts: z.array(
          z.object({
            type: z.enum(["text", "image", "data", "audio", "video"]),
            text: z.string().optional(),
            mimeType: z.string().optional(),
            data: z.string().optional(),
            url: z.string().optional(),
          }),
        ),
      }),
      originalTaskId: z.string().optional(),
    })

    const params = delegationSchema.parse(body)

    const agent = getAgentById(params.agentId)
    if (!agent) {
      return c.json(
        {
          error: {
            code: "AGENT_NOT_FOUND",
            message: `Agent not found: ${params.agentId}`,
          },
        },
        404,
      )
    }

    const delegation = await delegateTaskToAgent(agent, params.message, params.originalTaskId)

    if (!delegation) {
      return c.json(
        {
          error: {
            code: "DELEGATION_FAILED",
            message: `Failed to delegate task to agent: ${agent.name}`,
          },
        },
        500,
      )
    }

    return c.json({
      success: true,
      delegation: {
        taskId: delegation.taskId,
        agentId: agent.id,
        agentName: agent.name,
        status: delegation.status,
        createdAt: delegation.createdAt,
      },
    })
  } catch (error) {
    const err = error as Error
    return c.json(
      {
        error: {
          code: "INVALID_DELEGATION",
          message: err.message,
        },
      },
      400,
    )
  }
})

A2ARoutes.get("/delegations/:taskId", async (c) => {
  const taskId = c.req.param("taskId")
  const delegation = getDelegationTask(taskId)

  if (!delegation) {
    return c.json(
      {
        error: {
          code: "DELEGATION_NOT_FOUND",
          message: `Delegation not found: ${taskId}`,
        },
      },
      404,
    )
  }

  return c.json({
    taskId: delegation.taskId,
    agentId: delegation.targetAgent.id,
    agentName: delegation.targetAgent.name,
    status: delegation.status,
    message: delegation.message,
    result: delegation.result,
    createdAt: delegation.createdAt,
    updatedAt: delegation.updatedAt,
    metadata: delegation.metadata,
  })
})

A2ARoutes.get("/delegations", async (c) => {
  const delegations = getAllDelegations()

  return c.json({
    delegations: delegations.map((d) => ({
      taskId: d.taskId,
      agentId: d.targetAgent.id,
      agentName: d.targetAgent.name,
      status: d.status,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    })),
    total: delegations.length,
  })
})

// ============================================================================
// Export
// ============================================================================

export { A2ARoutes as a2aRoutes, getAgentCard, performFullDiscovery, getDiscoveredAgents }
