// packages/console/src/components/agent-chat/MessageList.tsx
import { For, Show } from "solid-js"
import type { AgentMessage } from "../../lib/ag-ui/types"
import { MessageBubble } from "./MessageBubble"

interface MessageListProps {
  messages: AgentMessage[]
  class?: string
}

export function MessageList(props: MessageListProps) {
  let scrollContainer: HTMLDivElement | undefined

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight
    }
  }

  // Scroll when messages change
  // Using a reactive effect to trigger scroll
  const messages = () => props.messages
  // SolidJS will automatically track the dependency
  messages()

  // Use a timeout to ensure DOM is updated
  setTimeout(scrollToBottom, 0)

  return (
    <div
      ref={scrollContainer}
      class={`message-list ${props.class || ""}`}
      style={{
        "max-height": "400px",
        "overflow-y": "auto",
        padding: "1rem",
        display: "flex",
        "flex-direction": "column",
        gap: "0.5rem",
      }}
    >
      <For each={messages()}>{(message) => <MessageBubble message={message} />}</For>

      <Show when={messages().length === 0}>
        <div
          style={{
            "text-align": "center",
            color: "var(--text-secondary)",
            padding: "2rem",
            "font-style": "italic",
          }}
        >
          Start a conversation with the agent...
        </div>
      </Show>
    </div>
  )
}
