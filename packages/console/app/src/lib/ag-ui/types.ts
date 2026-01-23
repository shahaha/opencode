// packages/console/src/lib/ag-ui/types.ts
export interface AGUIEvent {
  id: string
  type: string
  timestamp: number
  data: any
  metadata?: {
    sessionId: string
    userId: string
    agentId: string
  }
}

export interface AgentMessage {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  timestamp: number
  toolCalls?: ToolCall[]
  metadata?: any
}

export interface ToolCall {
  id: string
  tool: string
  args: any
  result?: any
  status: "pending" | "running" | "completed" | "failed"
}

export interface AgentSession {
  id: string
  agentId: string
  messages: AgentMessage[]
  status: "idle" | "thinking" | "responding" | "error"
  tools: Tool[]
  metadata: SessionMetadata
  createdAt: number
  updatedAt: number
}

export interface SessionMetadata {
  title?: string
  description?: string
  tags?: string[]
  settings?: Record<string, any>
}

export interface Tool {
  name: string
  description: string
  parameters: Record<string, any>
}

export interface AGUIConfig {
  serverUrl: string
  sessionId: string
  authToken: string
  transport?: "websocket" | "sse"
  reconnectAttempts?: number
  reconnectDelay?: number
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error"

export type AgentStatus = "idle" | "thinking" | "responding" | "error"
