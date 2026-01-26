// packages/console/src/components/agent-chat/MessageBubble.tsx
import { Show, For } from "solid-js"
import type { AgentMessage } from "../../lib/ag-ui/types"

interface MessageBubbleProps {
  message: AgentMessage
  class?: string
}

export function MessageBubble(props: MessageBubbleProps) {
  const isUser = () => props.message.role === "user"
  const isAssistant = () => props.message.role === "assistant"

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const renderToolCalls = () => {
    return (
      <Show when={props.message.toolCalls && props.message.toolCalls.length > 0}>
        <div
          style={{
            "margin-top": "0.5rem",
            padding: "0.5rem",
            background: "var(--bg-secondary)",
            "border-radius": "0.25rem",
            "font-size": "0.875rem",
            border: "1px solid var(--border-color)",
          }}
        >
          <div style={{ "font-weight": "bold", "margin-bottom": "0.25rem" }}>Tool Usage:</div>
          <For each={props.message.toolCalls}>
            {(toolCall: any) => (
              <div
                style={{
                  display: "flex",
                  "align-items": "center",
                  gap: "0.5rem",
                  "margin-bottom": "0.25rem",
                }}
              >
                <span
                  style={{
                    background: getStatusColor(toolCall.status),
                    color: "white",
                    padding: "0.125rem 0.25rem",
                    "border-radius": "0.25rem",
                    "font-size": "0.75rem",
                  }}
                >
                  {toolCall.status}
                </span>
                <code style={{ "font-family": "monospace" }}>
                  {toolCall.tool}({JSON.stringify(toolCall.args)})
                </code>
              </div>
            )}
          </For>
        </div>
      </Show>
    )
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "#10b981" // green
      case "running":
        return "#f59e0b" // yellow
      case "failed":
        return "#ef4444" // red
      default:
        return "#6b7280" // gray
    }
  }

  return (
    <div
      class={`message-bubble ${isUser() ? "user" : "assistant"} ${props.class || ""}`}
      style={{
        display: "flex",
        "flex-direction": isUser() ? "row-reverse" : "row",
        "align-items": "flex-start",
        gap: "0.5rem",
        "margin-bottom": "1rem",
      }}
    >
      {/* Avatar */}
      <div
        class="avatar"
        style={{
          width: "2rem",
          height: "2rem",
          "border-radius": "50%",
          background: isUser() ? "var(--primary-color)" : "var(--accent-color)",
          display: "flex",
          "align-items": "center",
          "justify-content": "center",
          color: "white",
          "font-weight": "bold",
          "font-size": "0.875rem",
          "flex-shrink": "0",
        }}
      >
        {isUser() ? "U" : "A"}
      </div>

      {/* Message Content */}
      <div
        class="message-content"
        style={{
          "max-width": "70%",
          padding: "0.75rem",
          "border-radius": "0.5rem",
          background: isUser() ? "var(--primary-color)" : "var(--bg-secondary)",
          color: isUser() ? "white" : "var(--text-primary)",
          "box-shadow": "0 1px 3px rgba(0, 0, 0, 0.1)",
        }}
      >
        <div
          class="message-text"
          style={{
            "white-space": "pre-wrap",
            "word-wrap": "break-word",
          }}
        >
          {props.message.content}
        </div>

        {/* Tool Calls */}
        {renderToolCalls()}

        {/* Timestamp */}
        <div
          class="timestamp"
          style={{
            "font-size": "0.75rem",
            opacity: "0.7",
            "margin-top": "0.25rem",
            "text-align": isUser() ? "right" : "left",
          }}
        >
          {formatTimestamp(props.message.timestamp)}
        </div>
      </div>
    </div>
  )
}
