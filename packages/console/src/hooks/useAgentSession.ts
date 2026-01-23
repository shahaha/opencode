// packages/console/src/hooks/useAgentSession.ts
import { createSignal, createEffect, onMount } from "solid-js"
import type { AgentSession, AgentMessage, AGUIEvent } from "../lib/ag-ui/types"
import { useAGUIClient } from "./useAGUIClient"

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

  const { client, isConnected } = useAGUIClient(config)

  // Load session from localStorage or create new
  const loadSession = () => {
    const saved = localStorage.getItem(`agent_session_${options.sessionId}`)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setSession(parsed)
      } catch (error) {
        console.error("Failed to parse saved session:", error)
        createNewSession()
      }
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
  }

  // Save session to localStorage
  const saveSession = () => {
    if (options.autoSave && session()) {
      localStorage.setItem(`agent_session_${options.sessionId}`, JSON.stringify(session()))
    }
  }

  // Add message to session
  const addMessage = (message: Omit<AgentMessage, "id" | "timestamp">) => {
    setSession((prev) => {
      if (!prev) return null

      const newMessage: AgentMessage = {
        ...message,
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
      }

      const updatedMessages = [...prev.messages, newMessage]

      // Trim messages if exceeding max
      if (options.maxMessages && updatedMessages.length > options.maxMessages) {
        updatedMessages.splice(0, updatedMessages.length - options.maxMessages)
      }

      return {
        ...prev,
        messages: updatedMessages,
        updatedAt: Date.now(),
      }
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
