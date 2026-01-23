// packages/console/src/hooks/useAgentSession.ts
import { createSignal, createEffect, onMount } from "solid-js"
import type { AgentSession, AgentMessage, AGUIEvent } from "../lib/ag-ui/types"
import { useAGUIClient } from "./useAGUIClient"
import { globalMemoryManager } from "../lib/ag-ui/memory-manager"

interface UseAgentSessionOptions {
  sessionId: string
  agentId: string
  autoSave?: boolean
  maxMessages?: number
}

export function useAgentSession(options: UseAgentSessionOptions) {
  const [session, setSession] = createSignal<AgentSession | null>(null)
  const [isLoading, setIsLoading] = createSignal(true)

  const config = () => ({
    serverUrl: import.meta.env.VITE_OPENCODE_API_URL || "http://localhost:3000",
    sessionId: options.sessionId,
    authToken: localStorage.getItem("opencode_token") || "",
  })

  const { client, isConnected, connect, disconnect } = useAGUIClient(config)

  // Watch for authentication token changes
  createEffect(() => {
    const token = localStorage.getItem("opencode_token")
    if (!token && isConnected()) {
      // Disconnect if token is removed
      disconnect()
    } else if (token && !isConnected()) {
      // Attempt to reconnect if token is available
      connect()
    }
  })

  // Load session from memory manager or create new
  const loadSession = () => {
    const cached = globalMemoryManager.getSession(options.sessionId)
    if (cached) {
      setSession(cached)
    } else {
      createNewSession()
    }
    setIsLoading(false)
  }

  const createNewSession = () => {
    const newSession: AgentSession = {
      id: options.sessionId,
      agentId: options.agentId,
      messages: [],
      status: "idle",
      tools: [],
      metadata: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    setSession(newSession)
    globalMemoryManager.addSession(newSession)
  }

  // Save session to memory manager (and localStorage as backup)
  const saveSession = () => {
    if (options.autoSave && session()) {
      globalMemoryManager.updateSession(options.sessionId, session()!)
      // Also save to localStorage as backup
      localStorage.setItem(`agent_session_${options.sessionId}`, JSON.stringify(session()))
    }
    setIsLoading(false)
  }

  // Add message to session
  const addMessage = (message: Omit<AgentMessage, "id" | "timestamp">) => {
    const newMessage: AgentMessage = {
      ...message,
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    }

    globalMemoryManager.addMessage(options.sessionId, newMessage)

    setSession((prev) => {
      if (!prev) return null
      return globalMemoryManager.getSession(options.sessionId)
    })
  }

  const updateStatus = (status: AgentSession["status"]) => {
    setSession((prev) => (prev ? { ...prev, status, updatedAt: Date.now() } : null))
  }

  // Send message to agent
  const sendMessage = async (content: string) => {
    if (!client() || !isConnected()) {
      throw new Error("Client not connected")
    }

    addMessage({ role: "user", content })
    updateStatus("responding")

    client()?.send({
      jsonrpc: "2.0",
      method: "agent.message",
      params: {
        sessionId: options.sessionId,
        content,
        role: "user",
      },
      id: Date.now(),
    })
  }

  // Handle incoming events
  createEffect(() => {
    const c = client()
    if (c) {
      c.on("agent.message", (data: any) => {
        addMessage({
          role: "assistant",
          content: data.content,
          metadata: data.metadata,
        })
        updateStatus("idle")
      })

      c.on("agent.thinking", () => {
        updateStatus("thinking")
      })

      c.on("agent.tool_call", (data: any) => {
        addMessage({
          role: "assistant",
          content: `Using tool: ${data.tool}`,
          toolCalls: [data],
          metadata: { toolCall: data },
        })
      })

      c.on("agent.error", (error: any) => {
        updateStatus("error")
        console.error("Agent error:", error)
      })
    }
  })

  // Auto-save when session changes
  createEffect(() => {
    const currentSession = session()
    if (currentSession) {
      saveSession()
    }
  })

  onMount(() => {
    loadSession()
  })

  return {
    session,
    isLoading,
    addMessage,
    updateStatus,
    sendMessage,
    isConnected: () => isConnected(),
  }
}
