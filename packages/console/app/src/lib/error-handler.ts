// packages/console/app/src/lib/error-handler.ts
import { createSignal } from "solid-js"

export interface AppError {
  id: string
  type: "network" | "auth" | "validation" | "server" | "client" | "unknown"
  message: string
  details?: any
  timestamp: number
  recoverable: boolean
  retryCount?: number
}

class ErrorHandler {
  // Private signal for errors
  private _errorsSignal = createSignal<AppError[]>([])

  // Public accessor for errors
  get errors() {
    return this._errorsSignal[0]
  }

  private maxErrors = 10
  private retryTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

  // Handle different types of errors
  handleError(
    error: Error | string,
    context?: {
      type?: AppError["type"]
      recoverable?: boolean
      retryable?: boolean
      maxRetries?: number
    },
  ) {
    const errorObj = this.normalizeError(error, context)

    // Log error for debugging
    console.error(`[${errorObj.type.toUpperCase()}] ${errorObj.message}`, errorObj.details)

    // Add to error list
    this.addError(errorObj)

    // Handle recoverable errors
    if (errorObj.recoverable && context?.retryable) {
      this.scheduleRetry(errorObj, context.maxRetries || 3)
    }

    // Emit error event for UI handling
    window.dispatchEvent(
      new CustomEvent("app-error", {
        detail: errorObj,
      }),
    )

    return errorObj
  }

  private normalizeError(error: Error | string, context?: any): AppError {
    const timestamp = Date.now()
    const id = `error_${timestamp}_${Math.random().toString(36).substr(2, 9)}`

    if (typeof error === "string") {
      return {
        id,
        type: context?.type || "unknown",
        message: error,
        timestamp,
        recoverable: context?.recoverable ?? false,
      }
    }

    // Network errors
    if (error.message.includes("fetch") || error.message.includes("network")) {
      return {
        id,
        type: "network",
        message: "Network connection failed",
        details: error,
        timestamp,
        recoverable: true,
      }
    }

    // Authentication errors
    if (error.message.includes("auth") || error.message.includes("token") || error.message.includes("401")) {
      return {
        id,
        type: "auth",
        message: "Authentication failed",
        details: error,
        timestamp,
        recoverable: true,
      }
    }

    // Validation errors
    if (error.message.includes("validation") || error.message.includes("invalid")) {
      return {
        id,
        type: "validation",
        message: error.message,
        details: error,
        timestamp,
        recoverable: false,
      }
    }

    // Server errors
    if (error.message.includes("500") || error.message.includes("server")) {
      return {
        id,
        type: "server",
        message: "Server error occurred",
        details: error,
        timestamp,
        recoverable: true,
      }
    }

    // Default error
    return {
      id,
      type: context?.type || "client",
      message: error.message,
      details: error,
      timestamp,
      recoverable: context?.recoverable ?? false,
    }
  }

  private addError(error: AppError) {
    this._errorsSignal[1]((prev) => {
      const newErrors = [error, ...prev]
      return newErrors.slice(0, this.maxErrors) // Keep only recent errors
    })
  }

  private scheduleRetry(error: AppError, maxRetries: number) {
    if ((error.retryCount || 0) >= maxRetries) {
      return
    }

    const retryCount = (error.retryCount || 0) + 1
    const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 30000) // Exponential backoff

    const timeoutId = setTimeout(() => {
      // Emit retry event
      window.dispatchEvent(
        new CustomEvent("error-retry", {
          detail: { ...error, retryCount },
        }),
      )

      this.retryTimeouts.delete(error.id)
    }, delay)

    this.retryTimeouts.set(error.id, timeoutId)

    // Update error with retry info
    this._errorsSignal[1]((prev) =>
      prev.map((e) =>
        e.id === error.id ? { ...e, retryCount, message: `${e.message} (retrying in ${delay / 1000}s...)` } : e,
      ),
    )
  }

  // Clear specific error
  clearError(errorId: string) {
    this._errorsSignal[1]((prev) => prev.filter((e) => e.id !== errorId))

    // Clear retry timeout if exists
    const timeoutId = this.retryTimeouts.get(errorId)
    if (timeoutId) {
      clearTimeout(timeoutId)
      this.retryTimeouts.delete(errorId)
    }
  }

  // Clear all errors
  clearAllErrors() {
    this._errorsSignal[1]([])
    this.retryTimeouts.forEach((timeoutId) => clearTimeout(timeoutId))
    this.retryTimeouts.clear()
  }

  // Get error statistics
  getStats() {
    const errors = this.errors()
    const stats = {
      total: errors.length,
      byType: {} as Record<AppError["type"], number>,
      recoverable: 0,
      retrying: 0,
    }

    errors.forEach((error) => {
      stats.byType[error.type] = (stats.byType[error.type] || 0) + 1
      if (error.recoverable) stats.recoverable++
      if (error.retryCount && error.retryCount > 0) stats.retrying++
    })

    return stats
  }
}

// Global error handler instance
export const globalErrorHandler = new ErrorHandler()

// Global error event listeners
if (typeof window !== "undefined") {
  // Handle unhandled promise rejections
  window.addEventListener("unhandledrejection", (event) => {
    globalErrorHandler.handleError(event.reason instanceof Error ? event.reason : new Error(String(event.reason)), {
      type: "client",
      recoverable: false,
    })
    event.preventDefault()
  })

  // Handle global JavaScript errors
  window.addEventListener("error", (event) => {
    globalErrorHandler.handleError(event.error || new Error(event.message), { type: "client", recoverable: false })
  })

  // Handle AG-UI specific errors
  window.addEventListener("agui-error", (event: any) => {
    globalErrorHandler.handleError(event.detail?.error || new Error("AG-UI error"), {
      type: "client",
      recoverable: event.detail?.recoverable ?? false,
      retryable: true,
    })
  })
}
