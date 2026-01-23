import { createSignal, createEffect, onMount, onCleanup, For } from "solid-js"
import ConnectionStatusIndicator from "./ConnectionStatusIndicator"

interface Message {
  id: string
  content: string
  sender: "user" | "agent"
  timestamp: number
  model?: string
}

interface AGUIChatProps {
  sessionId: string
}

export default function AGUIChat(props: AGUIChatProps) {
  console.log("[AG-UI] AGUIChat component rendered with sessionId:", props.sessionId)

  const [messages, setMessages] = createSignal<Message[]>([])
  const [newMessage, setNewMessage] = createSignal("")
  const [isConnected, setIsConnected] = createSignal(false)
  const [isLoading, setIsLoading] = createSignal(false)
  const [ws, setWs] = createSignal<WebSocket | null>(null)
  const [selectedModel, setSelectedModel] = createSignal("opencode/glm-4.7-free")

  // Available models for selection
  // Reconnection state
  const [connectionStatus, setConnectionStatus] = createSignal<
    "connecting" | "connected" | "disconnected" | "reconnecting"
  >("connecting")
  const [reconnectAttempts, setReconnectAttempts] = createSignal(0)
  const [reconnectTimeout, setReconnectTimeout] = createSignal<ReturnType<typeof setTimeout> | null>(null)

  const maxReconnectAttempts = 5
  const baseReconnectDelay = 1000 // 1 second
  const maxReconnectDelay = 30000 // 30 seconds

  // Connection quality metrics
  const [connectionMetrics, setConnectionMetrics] = createSignal({
    lastConnected: Date.now(),
    totalReconnects: 0,
    averageReconnectTime: 0,
    connectionUptime: 0,
  })

  // Message persistence and session management
  const [savedSessions, setSavedSessions] = createSignal<any[]>([])
  const [currentSessionId, setCurrentSessionId] = createSignal(props.sessionId)
  const messageStore = {
    save: (sessionId: string, messages: Message[]) => {
      try {
        localStorage.setItem(
          `chat_${sessionId}`,
          JSON.stringify({
            messages,
            timestamp: Date.now(),
            lastActivity: Date.now(),
          }),
        )
        console.log(`[AG-UI] Saved ${messages.length} messages for session: ${sessionId}`)
      } catch (error) {
        console.error("[AG-UI] Failed to save messages:", error)
      }
    },

    load: (sessionId: string): Message[] => {
      try {
        const stored = localStorage.getItem(`chat_${sessionId}`)
        if (stored) {
          const data = JSON.parse(stored)
          console.log(`[AG-UI] Loaded ${data.messages?.length || 0} messages for session: ${sessionId}`)
          return data.messages || []
        }
      } catch (error) {
        console.error("[AG-UI] Failed to load messages:", error)
      }
      return []
    },

    clear: (sessionId: string) => {
      localStorage.removeItem(`chat_${sessionId}`)
      console.log(`[AG-UI] Cleared messages for session: ${sessionId}`)
    },

    list: (): any[] => {
      const sessions = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith("chat_")) {
          try {
            const sessionId = key.replace("chat_", "")
            const data = JSON.parse(localStorage.getItem(key) || "{}")
            sessions.push({
              id: sessionId,
              messageCount: data.messages?.length || 0,
              lastActivity: data.lastActivity || data.timestamp || 0,
              timestamp: data.timestamp || 0,
            })
          } catch (error) {
            console.error(`[AG-UI] Error parsing session ${key}:`, error)
          }
        }
      }
      return sessions.sort((a, b) => b.lastActivity - a.lastActivity)
    },
  }

  // Offline message queue
  const offlineQueue = {
    add: (message: Message) => {
      try {
        const queue = JSON.parse(localStorage.getItem("offline_queue") || "[]")
        queue.push({
          ...message,
          offline: true,
          queuedAt: Date.now(),
        })
        localStorage.setItem("offline_queue", JSON.stringify(queue))
        console.log(`[AG-UI] Added message to offline queue: ${message.content.substring(0, 50)}...`)
      } catch (error) {
        console.error("[AG-UI] Failed to add message to offline queue:", error)
      }
    },

    get: (): Message[] => {
      try {
        return JSON.parse(localStorage.getItem("offline_queue") || "[]")
      } catch (error) {
        console.error("[AG-UI] Failed to get offline queue:", error)
        return []
      }
    },

    clear: () => {
      localStorage.removeItem("offline_queue")
      console.log("[AG-UI] Cleared offline queue")
    },

    process: () => {
      if (!isConnected() || !ws()) {
        console.log("[AG-UI] Cannot process offline queue - not connected")
        return
      }

      const queue = offlineQueue.get()
      if (queue.length === 0) {
        console.log("[AG-UI] No offline messages to process")
        return
      }

      console.log(`[AG-UI] Processing ${queue.length} offline messages`)

      queue.forEach((message, index) => {
        setTimeout(() => {
          try {
            const messageData = {
              jsonrpc: "2.0",
              id: Date.now() + index,
              method: "agent.message",
              params: {
                content: message.content,
                sessionId: currentSessionId(),
              },
            }

            console.log(`[AG-UI] Sending offline message: ${message.content.substring(0, 50)}...`)
            ws()?.send(JSON.stringify(messageData))
          } catch (error) {
            console.error(`[AG-UI] Failed to send offline message:`, error)
          }
        }, index * 500) // Stagger sending to avoid overwhelming
      })

      offlineQueue.clear()
    },
  }

  // Session recovery and management
  const sessionManager = {
    saveState: (sessionId: string) => {
      try {
        const state = {
          sessionId,
          connectionStatus: connectionStatus(),
          reconnectAttempts: reconnectAttempts(),
          selectedModel: selectedModel(),
          timestamp: Date.now(),
        }
        localStorage.setItem(`session_state_${sessionId}`, JSON.stringify(state))
        console.log(`[AG-UI] Saved session state for: ${sessionId}`)
      } catch (error) {
        console.error("[AG-UI] Failed to save session state:", error)
      }
    },

    loadState: (sessionId: string) => {
      try {
        const stored = localStorage.getItem(`session_state_${sessionId}`)
        if (stored) {
          const state = JSON.parse(stored)
          console.log(`[AG-UI] Loaded session state for: ${sessionId}`)
          // Restore selected model if available
          if (state.selectedModel) {
            setSelectedModel(state.selectedModel)
          }
          return state
        }
      } catch (error) {
        console.error("[AG-UI] Failed to load session state:", error)
      }
      return null
    },

    switchSession: (sessionId: string) => {
      console.log(`[AG-UI] Switching to session: ${sessionId}`)

      // Save current session
      messageStore.save(currentSessionId(), messages())
      sessionManager.saveState(currentSessionId())

      // Load new session
      const loadedMessages = messageStore.load(sessionId)
      setMessages(loadedMessages)
      setCurrentSessionId(sessionId)

      // Disconnect and reconnect with new session
      if (ws()) {
        ws()?.close()
        setTimeout(() => connectWebSocket(), 1000)
      }

      // Update saved sessions list
      setSavedSessions(messageStore.list())
    },

    createNewSession: () => {
      const newSessionId = `session_${Date.now()}`
      console.log(`[AG-UI] Creating new session: ${newSessionId}`)

      setMessages([])
      setCurrentSessionId(newSessionId)

      // Disconnect and reconnect with new session
      if (ws()) {
        ws()?.close()
        setTimeout(() => connectWebSocket(), 1000)
      }

      return newSessionId
    },
  }

  // Initialize with a welcome message
  onMount(() => {
    setMessages([
      {
        id: "welcome",
        content: "Welcome to OpenCode AG-UI Chat! Start a conversation with the AI agent.",
        sender: "agent",
        timestamp: Date.now(),
      },
    ])

    // Load saved model selection
    try {
      const savedModel = localStorage.getItem("agui_selected_model")
      if (savedModel) {
        setSelectedModel(savedModel)
        console.log(`[AG-UI] Loaded saved model: ${savedModel}`)
      } else {
        console.log(`[AG-UI] Using default model: opencode/glm-4.7-free`)
      }
    } catch (error) {
      console.error("[AG-UI] Failed to load saved model:", error)
    }

    // Load saved sessions list
    loadSavedSessions()

    // Clean up old sessions (older than 7 days)
    cleanupOldSessions()
  })

  // Calculate reconnection delay with exponential backoff
  const getReconnectDelay = (attempt: number) => {
    const delay = baseReconnectDelay * Math.pow(2, attempt)
    return Math.min(delay, maxReconnectDelay)
  }

  // Schedule reconnection attempt
  const scheduleReconnect = () => {
    if (reconnectAttempts() >= maxReconnectAttempts) {
      console.error(`Max reconnection attempts (${maxReconnectAttempts}) reached`)
      setConnectionStatus("disconnected")
      return
    }

    const delay = getReconnectDelay(reconnectAttempts())
    console.log(`Scheduling reconnection in ${delay}ms (attempt ${reconnectAttempts() + 1}/${maxReconnectAttempts})`)

    setConnectionStatus("reconnecting")
    const timeoutId = setTimeout(() => {
      setReconnectAttempts(reconnectAttempts() + 1)
      connectWebSocket()
    }, delay)

    setReconnectTimeout(timeoutId)
  }

  // WebSocket connection setup
  const connectWebSocket = () => {
    try {
      // Clear any pending reconnection
      if (reconnectTimeout()) {
        clearTimeout(reconnectTimeout()!)
        setReconnectTimeout(null)
      }

      setConnectionStatus("connecting")

      // Determine backend URL based on environment
      const isDevelopment = import.meta.env.DEV
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
      const host = window.location.hostname

      // Backend is always on port 4000, frontend on port 8080
      const backendPort = "5000"
      const wsUrl = `${protocol}//${host}:5000/ag-ui/ws`

      console.log("WebSocket URL:", wsUrl)
      console.log("Environment:", { isDevelopment, protocol, host, backendPort })

      const websocket = new WebSocket(wsUrl)

      websocket.onopen = () => {
        console.log("[AG-UI] WebSocket connected successfully")
        setIsConnected(true)
        setConnectionStatus("connected")
        setReconnectAttempts(0) // Reset reconnection attempts on successful connection

        setConnectionMetrics((prev) => ({
          ...prev,
          lastConnected: Date.now(),
          totalReconnects: prev.totalReconnects + (prev.lastConnected > 0 ? 1 : 0),
        }))

        // Process offline queue when connection is restored
        setTimeout(() => {
          offlineQueue.process()
        }, 1000) // Wait a bit for authentication to complete

        // Send authentication message
        const authMessage = {
          jsonrpc: "2.0",
          id: 1,
          method: "authenticate",
          params: {
            sessionId: props.sessionId,
            token: "dev-token-123", // Simplified for development
          },
        }
        console.log("Sending authentication:", authMessage)
        websocket.send(JSON.stringify(authMessage))
      }

      websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          console.log("[AG-UI] Received message:", data)

          if (data.result && data.result.authenticated) {
            console.log("[AG-UI] Authentication successful")
          } else if (data.type === "agent.message" || data.type === "agent.thinking") {
            // Handle agent messages
            if (data.type === "agent.message") {
              console.log("[AG-UI] Processing AI response message")
              // Add received message to chat
              const message: Message = {
                id: data.id || `msg-${Date.now()}`,
                content: data.data?.content || data.content,
                sender: "agent",
                timestamp: data.timestamp || Date.now(),
              }
              console.log("[AG-UI] Adding message to chat:", message)
              setMessages((prev) => {
                console.log("[AG-UI] Previous messages count:", prev.length)
                const newMessages = [...prev, message]
                console.log("[AG-UI] New messages count:", newMessages.length)
                return newMessages
              })
            } else if (data.type === "agent.thinking") {
              // Handle thinking indicator
              console.log("[AG-UI] Agent is thinking...")
            }
          } else if (data.type === "agent.error") {
            // Handle error messages
            console.error("[AG-UI] Agent error:", data.data?.error)
          } else {
            console.log("[AG-UI] Unknown message type:", data.type)
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error, "Raw data:", event.data)
        }
      }

      websocket.onclose = (event) => {
        console.log("WebSocket disconnected, code:", event.code, "reason:", event.reason)
        setIsConnected(false)

        // Don't attempt reconnection for clean closes (code 1000) or auth failures (code 1008)
        if (event.code === 1000 || event.code === 1008) {
          setConnectionStatus("disconnected")
          console.log("Clean disconnect, not attempting reconnection")
        } else {
          console.log("Unexpected disconnect, attempting reconnection...")
          scheduleReconnect()
        }
      }

      websocket.onerror = (error) => {
        console.error("WebSocket error:", error)
        setIsConnected(false)
        setConnectionStatus("disconnected")
      }

      setWs(websocket)
    } catch (error) {
      console.error("Failed to connect to WebSocket:", error)
      setConnectionStatus("disconnected")
    }
  }

  // Connect on mount
  onMount(() => {
    connectWebSocket()
  })

  // Update connection uptime
  createEffect(() => {
    if (connectionStatus() === "connected") {
      const interval = setInterval(() => {
        setConnectionMetrics((prev) => ({
          ...prev,
          connectionUptime: Date.now() - prev.lastConnected,
        }))
      }, 1000)

      onCleanup(() => clearInterval(interval))
    } else {
      setConnectionMetrics((prev) => ({
        ...prev,
        connectionUptime: 0,
      }))
    }
  })

  // Load saved sessions and initialize current session
  const loadSavedSessions = () => {
    setSavedSessions(messageStore.list())
  }

  // Save messages whenever they change
  createEffect(() => {
    if (messages().length > 0) {
      messageStore.save(currentSessionId(), messages())
    }
  })

  // Utility function to clean up old sessions
  const cleanupOldSessions = () => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000 // 7 days ago
    const sessions = messageStore.list()

    sessions.forEach((session) => {
      if (session.lastActivity < cutoff) {
        messageStore.clear(session.id)
        console.log(`[AG-UI] Cleaned up old session: ${session.id}`)
      }
    })

    // Reload sessions list after cleanup
    loadSavedSessions()
  }

  // Expose connection status for UI
  const getConnectionStatus = () => {
    if (connectionStatus() === "connected" && isConnected()) return "connected"
    if (connectionStatus() === "reconnecting") return "reconnecting"
    if (connectionStatus() === "connecting") return "connecting"
    return "disconnected"
  }

  // Cleanup on unmount
  onCleanup(() => {
    // Clear any pending reconnection timeout
    if (reconnectTimeout()) {
      clearTimeout(reconnectTimeout()!)
      setReconnectTimeout(null)
    }

    // Close WebSocket connection
    if (ws()) {
      ws()?.close()
    }
  })

  const sendMessage = async () => {
    const content = newMessage().trim()
    console.log(`[AG-UI] sendMessage called with content: "${content}"`)
    console.log(`[AG-UI] Connection status: ws=${!!ws()}, isConnected=${isConnected()}`)

    if (!content) return

    // If not connected, add to offline queue
    if (!ws() || !isConnected()) {
      console.log(`[AG-UI] Not connected - adding message to offline queue`)
      const offlineMessage: Message = {
        id: `offline-${Date.now()}`,
        content,
        sender: "user",
        timestamp: Date.now(),
      }
      offlineQueue.add(offlineMessage)
      setMessages((prev) => [...prev, offlineMessage])

      // Show user feedback about offline queuing
      console.log(`[AG-UI] Message queued for offline sending`)
      return
    }

    setIsLoading(true)
    console.log(`[AG-UI] Sending message to session: ${props.sessionId}`)

    try {
      // Add user message to UI immediately
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        content,
        sender: "user",
        timestamp: Date.now(),
      }
      console.log(`[AG-UI] Adding user message to UI:`, userMessage)
      setMessages((prev) => [...prev, userMessage])

      // Send message via WebSocket
      const messageData = {
        jsonrpc: "2.0",
        id: Date.now(),
        method: "agent.message",
        params: {
          content,
          sessionId: props.sessionId,
          model: selectedModel(),
        },
      }
      console.log(`[AG-UI] Sending WebSocket message:`, messageData)
      ws()?.send(JSON.stringify(messageData))

      setNewMessage("")
    } catch (error) {
      console.error("Error sending message:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div class="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-3">
            <div class="w-3 h-3 bg-green-500 rounded-full"></div>
            <h1 class="text-lg font-semibold text-gray-900 dark:text-white">AG-UI Chat</h1>
            <span class="text-sm text-gray-500 dark:text-gray-400">Session: {props.sessionId}</span>
          </div>
          <div class="flex items-center space-x-4">
            {/* Model Selector */}
            <div class="flex items-center space-x-2 min-w-0">
              <label class="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">Model:</label>
              <select
                id="model-select"
                value={selectedModel()}
                onChange={(e) => {
                  setSelectedModel(e.target.value)
                  localStorage.setItem("agui_selected_model", e.target.value)
                  console.log(`[AG-UI] Model changed to: ${e.target.value}`)
                }}
                class="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px]"
              >
                <option value="opencode/glm-4.7-free">OpenCode GLM-4.7 Free</option>
                <option value="opencode/gpt-5-nano">OpenCode GPT-5 Nano</option>
                <option value="opencode/big-pickle">OpenCode Big Pickle</option>
                <option value="anthropic/claude-sonnet-4-5">Claude Sonnet 4.5</option>
                <option value="anthropic/claude-haiku-4-5">Claude Haiku 4.5</option>
                <option value="openai/gpt-5">GPT-5</option>
                <option value="openai/gpt-5-nano">GPT-5 Nano</option>
                <option value="google/gemini-2.5-flash">Gemini 2.5 Flash</option>
                <option value="google/gemini-2.5-pro">Gemini 2.5 Pro</option>
                <option value="xai/grok-4">Grok-4</option>
                <option value="mistral/mistral-large-latest">Mistral Large</option>
              </select>
            </div>
            <div class="flex items-center space-x-2">
              <div class={`w-2 h-2 rounded-full ${isConnected() ? "bg-green-500" : "bg-red-500"}`}></div>
              <span class="text-sm text-gray-600 dark:text-gray-400">
                {isConnected() ? "Connected" : "Disconnected"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div class="flex-1 overflow-y-auto p-4 space-y-4">
        <For each={messages()}>
          {(message) => (
            <div class={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}>
              <div
                class={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                  message.sender === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600"
                }`}
              >
                <p class="text-sm">{message.content}</p>
                <div class="flex justify-between items-center mt-1">
                  <p class="text-xs opacity-70">{new Date(message.timestamp).toLocaleTimeString()}</p>
                  {message.sender === "agent" && message.model && (
                    <p class="text-xs text-blue-600 dark:text-blue-400 ml-2">{message.model}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </For>

        {isLoading() && (
          <div class="flex justify-start">
            <div class="bg-gray-200 dark:bg-gray-600 px-4 py-2 rounded-lg">
              <div class="flex items-center space-x-2">
                <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900 dark:border-white"></div>
                <span class="text-sm text-gray-600 dark:text-gray-300">Agent is typing...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div class="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4">
        <div class="flex space-x-3">
          <input
            type="text"
            value={newMessage()}
            onInput={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            class="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            disabled={!isConnected() || isLoading()}
          />
          <button
            onClick={sendMessage}
            disabled={!newMessage().trim() || !isConnected() || isLoading()}
            class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading() ? "Sending..." : "Send"}
          </button>
        </div>

        {/* Connection Status Indicator */}
        <ConnectionStatusIndicator
          status={getConnectionStatus()}
          reconnectAttempts={reconnectAttempts()}
          maxReconnectAttempts={maxReconnectAttempts}
          metrics={connectionMetrics()}
        />

        {/* Session Management */}
        <div class="session-management mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">會話管理</h3>

          <div class="flex space-x-2 mb-3">
            <button
              onclick={() => sessionManager.switchSession(sessionManager.createNewSession())}
              class="px-3 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
            >
              新建會話
            </button>
            <button
              onclick={cleanupOldSessions}
              class="px-3 py-1 text-xs bg-orange-500 hover:bg-orange-600 text-white rounded transition-colors"
            >
              清理舊會話
            </button>
          </div>

          {/* Saved Sessions List */}
          <div class="space-y-2">
            <h4 class="text-xs font-medium text-gray-600 dark:text-gray-400">已保存的會話</h4>
            <div class="max-h-32 overflow-y-auto space-y-1">
              <For each={savedSessions()}>
                {(session) => (
                  <button
                    onclick={() => sessionManager.switchSession(session.id)}
                    class={`w-full text-left px-2 py-1 text-xs rounded transition-colors ${
                      session.id === currentSessionId()
                        ? "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200"
                        : "bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    <div class="flex justify-between items-center">
                      <span class="truncate">
                        {session.id === currentSessionId() ? "📌 " : ""}
                        {session.id.length > 20 ? `${session.id.substring(0, 20)}...` : session.id}
                      </span>
                      <span class="text-gray-500 dark:text-gray-400 ml-2">{session.messageCount}條</span>
                    </div>
                    <div class="text-gray-400 dark:text-gray-500 text-xs mt-1">
                      {new Date(session.lastActivity).toLocaleString()}
                    </div>
                  </button>
                )}
              </For>
              {savedSessions().length === 0 && (
                <div class="text-xs text-gray-500 dark:text-gray-400 py-2 text-center">暫無保存的會話</div>
              )}
            </div>
          </div>

          {/* Current Session Info */}
          <div class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
            <div class="text-xs text-gray-600 dark:text-gray-400">
              當前會話: <span class="font-mono text-gray-800 dark:text-gray-200">{currentSessionId()}</span>
            </div>
            <div class="text-xs text-gray-600 dark:text-gray-400 mt-1">訊息數量: {messages().length}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
