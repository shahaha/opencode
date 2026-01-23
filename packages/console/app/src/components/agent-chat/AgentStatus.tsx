// packages/console/src/components/agent-chat/AgentStatus.tsx
import { Match, Switch } from "solid-js"
import type { AgentSession } from "../../lib/ag-ui/types"

interface AgentStatusProps {
  status: AgentSession["status"]
  class?: string
}

export function AgentStatus(props: AgentStatusProps) {
  const getStatusInfo = () => {
    switch (props.status) {
      case "idle":
        return {
          icon: "🟢",
          text: "Ready",
          description: "Agent is ready to respond",
        }
      case "thinking":
        return {
          icon: "🤔",
          text: "Thinking",
          description: "Agent is processing your message",
        }
      case "responding":
        return {
          icon: "💬",
          text: "Responding",
          description: "Agent is generating a response",
        }
      case "error":
        return {
          icon: "❌",
          text: "Error",
          description: "An error occurred",
        }
      default:
        return {
          icon: "❓",
          text: "Unknown",
          description: "Status unknown",
        }
    }
  }

  const statusInfo = () => getStatusInfo()

  return (
    <div
      class={`agent-status ${props.class || ""}`}
      style={{
        display: "flex",
        "align-items": "center",
        gap: "0.5rem",
        padding: "0.5rem 1rem",
        background: "var(--bg-secondary)",
        "border-bottom": "1px solid var(--border-color)",
        "font-size": "0.875rem",
      }}
    >
      <div
        class="status-indicator"
        style={{
          "font-size": "1.25rem",
          animation: props.status === "thinking" ? "pulse 2s infinite" : "none",
        }}
      >
        {statusInfo().icon}
      </div>

      <div class="status-content">
        <div
          class="status-text"
          style={{
            "font-weight": "bold",
            color: "var(--text-primary)",
          }}
        >
          {statusInfo().text}
        </div>

        <div
          class="status-description"
          style={{
            color: "var(--text-secondary)",
            "font-size": "0.75rem",
          }}
        >
          {statusInfo().description}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
