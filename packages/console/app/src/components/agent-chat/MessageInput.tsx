// packages/console/src/components/agent-chat/MessageInput.tsx
import { createSignal, createEffect, Show } from "solid-js"

interface MessageInputProps {
  onSend: (message: string) => void
  disabled?: boolean
  placeholder?: string
  class?: string
}

export function MessageInput(props: MessageInputProps) {
  const [message, setMessage] = createSignal("")
  const [isComposing, setIsComposing] = createSignal(false)

  let textareaRef: HTMLTextAreaElement | undefined

  const handleSubmit = (e: Event) => {
    e.preventDefault()
    const currentMessage = message().trim()

    if (currentMessage && !props.disabled && !isComposing()) {
      props.onSend(currentMessage)
      setMessage("")

      // Reset textarea height
      if (textareaRef) {
        textareaRef.style.height = "auto"
      }
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const handleInput = (e: Event) => {
    const target = e.target as HTMLTextAreaElement
    setMessage(target.value)

    // Auto-resize textarea
    target.style.height = "auto"
    target.style.height = `${Math.min(target.scrollHeight, 120)}px`
  }

  const handleCompositionStart = () => {
    setIsComposing(true)
  }

  const handleCompositionEnd = () => {
    setIsComposing(false)
  }

  // Focus textarea when component mounts
  createEffect(() => {
    if (textareaRef && !props.disabled) {
      textareaRef.focus()
    }
  })

  const canSend = () => {
    return message().trim().length > 0 && !props.disabled && !isComposing()
  }

  return (
    <form
      onSubmit={handleSubmit}
      class={`message-input ${props.class || ""}`}
      style={{
        display: "flex",
        gap: "0.5rem",
        "align-items": "flex-end",
        padding: "1rem",
        "border-top": "1px solid var(--border-color)",
        background: "var(--bg-primary)",
      }}
    >
      <div style={{ flex: "1", position: "relative" }}>
        <textarea
          ref={textareaRef}
          value={message()}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder={props.placeholder || "Type your message..."}
          disabled={props.disabled}
          rows={1}
          style={{
            width: "100%",
            padding: "0.75rem",
            border: "1px solid var(--border-color)",
            "border-radius": "0.5rem",
            resize: "none",
            outline: "none",
            "font-family": "inherit",
            "font-size": "0.875rem",
            "line-height": "1.25",
            "min-height": "2.5rem",
            "max-height": "120px",
            background: props.disabled ? "var(--bg-disabled)" : "var(--bg-primary)",
            color: "var(--text-primary)",
          }}
        />

        <Show when={message().length > 500}>
          <div
            style={{
              position: "absolute",
              bottom: "0.25rem",
              right: "0.75rem",
              "font-size": "0.75rem",
              color: message().length > 1000 ? "var(--error-color)" : "var(--text-secondary)",
              background: "var(--bg-primary)",
              padding: "0 0.25rem",
            }}
          >
            {message().length}/1000
          </div>
        </Show>
      </div>

      <button
        type="submit"
        disabled={!canSend()}
        style={{
          padding: "0.75rem",
          border: "none",
          "border-radius": "0.5rem",
          background: canSend() ? "var(--primary-color)" : "var(--bg-disabled)",
          color: "white",
          cursor: canSend() ? "pointer" : "not-allowed",
          display: "flex",
          "align-items": "center",
          "justify-content": "center",
          "min-width": "2.5rem",
          transition: "background-color 0.2s",
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22,2 15,22 11,13 2,9"></polygon>
        </svg>
      </button>
    </form>
  )
}
