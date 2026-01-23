// packages/console/src/components/agent-chat/AgentChat.tsx
import { createSignal } from "solid-js"
import { useAgentSession } from "~/hooks/useAgentSession"
import { MessageList } from "./MessageList"
import { MessageInput } from "./MessageInput"
import { AgentStatus } from "./AgentStatus"
import type { AgentSession } from "~/lib/ag-ui/types"

interface AgentChatProps {
  sessionId: string
  agentId?: string
  class?: string
  maxMessages?: number
  autoSave?: boolean
}

export function AgentChat(props: AgentChatProps) {
  const [error, setError] = createSignal<string | null>(null)

  const { session, isLoading, sendMessage, isConnected } = useAgentSession({
    sessionId: props.sessionId,
    agentId: props.agentId || "default",
    autoSave: props.autoSave !== false,
    maxMessages: props.maxMessages || 100,
  })

  const handleSendMessage = async (content: string) => {
    setError(null)

    try {
      await sendMessage(content)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message")
      console.error("Failed to send message:", err)
    }
  }

  const currentStatus = (): AgentSession["status"] => {
    if (error()) return "error"
    if (!isConnected()) return "idle" // Could add a 'disconnected' status
    return session()?.status || "idle"
  }

  return (
    <div
      class={`agent-chat ${props.class || ""}`}
      style={{
        display: "flex",
        "flex-direction": "column",
        height: "100%",
        border: "1px solid var(--border-color)",
        "border-radius": "0.5rem",
        overflow: "hidden",
        background: "var(--bg-primary)",
      }}
    >
      {/* Status Bar */}
      <AgentStatus status={currentStatus()} />

      {/* Messages Area */}
      <div style={{ flex: "1", overflow: "hidden" }}>
        {isLoading() ? (
          <div
            style={{
              display: "flex",
              "align-items": "center",
              "justify-content": "center",
              height: "100%",
              color: "var(--text-secondary)",
            }}
          >
            Loading conversation...
          </div>
        ) : (
          <MessageList messages={session()?.messages || []} />
        )}
      </div>

      {/* Error Display */}
      {error() && (
        <div
          style={{
            padding: "0.5rem 1rem",
            background: "var(--error-bg)",
            color: "var(--error-color)",
            "border-top": "1px solid var(--border-color)",
            "font-size": "0.875rem",
          }}
        >
          <strong>Error:</strong> {error()}
          <button
            onClick={() => setError(null)}
            style={{
              float: "right",
              background: "none",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              "font-size": "1rem",
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Input Area */}
      <MessageInput
        onSend={handleSendMessage}
        disabled={!isConnected() || currentStatus() === "responding"}
        placeholder={isConnected() ? "Type your message..." : "Connecting..."}
      />
    </div>
  )
}
