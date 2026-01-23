// packages/console/app/src/components/ErrorBoundary.tsx
import { Component, createSignal, onMount } from "solid-js"

interface ErrorBoundaryProps {
  children: any
  fallback?: (error: Error, reset: () => void) => any
}

export const ErrorBoundary: Component<ErrorBoundaryProps> = (props) => {
  const [error, setError] = createSignal<Error | null>(null)

  const reset = () => {
    setError(null)
  }

  // Global error handler for AG-UI related errors
  const handleError = (event: ErrorEvent) => {
    // Only handle AG-UI related errors
    if (
      event.message.includes("AG-UI") ||
      event.message.includes("WebSocket") ||
      event.message.includes("authentication")
    ) {
      setError(new Error(event.message))
      event.preventDefault()
    }
  }

  // Unhandled promise rejection handler
  const handleRejection = (event: PromiseRejectionEvent) => {
    if (event.reason && typeof event.reason === "object" && "message" in event.reason) {
      const message = (event.reason as Error).message
      if (message.includes("AG-UI") || message.includes("authentication")) {
        setError(event.reason as Error)
        event.preventDefault()
      }
    }
  }

  onMount(() => {
    window.addEventListener("error", handleError)
    window.addEventListener("unhandledrejection", handleRejection)

    return () => {
      window.removeEventListener("error", handleError)
      window.removeEventListener("unhandledrejection", handleRejection)
    }
  })

  // Default fallback UI
  const defaultFallback = (error: Error, reset: () => void) => (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        "justify-content": "center",
        padding: "2rem",
        margin: "2rem",
        border: "1px solid var(--error-color)",
        "border-radius": "0.5rem",
        background: "var(--error-bg)",
        color: "var(--error-color)",
      }}
    >
      <div
        style={{
          "font-size": "2rem",
          "margin-bottom": "1rem",
        }}
      >
        ⚠️
      </div>
      <h3
        style={{
          margin: "0 0 1rem 0",
          color: "var(--error-color)",
        }}
      >
        Something went wrong
      </h3>
      <p
        style={{
          margin: "0 0 1rem 0",
          "text-align": "center",
          "max-width": "400px",
        }}
      >
        {error.message}
      </p>
      <button
        onClick={reset}
        style={{
          padding: "0.5rem 1rem",
          border: "1px solid var(--error-color)",
          "border-radius": "0.25rem",
          background: "transparent",
          color: "var(--error-color)",
          cursor: "pointer",
        }}
      >
        Try Again
      </button>
    </div>
  )

  return error()
    ? props.fallback
      ? props.fallback(error()!, reset)
      : defaultFallback(error()!, reset)
    : props.children
}
