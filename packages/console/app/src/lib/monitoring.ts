// packages/console/app/src/lib/monitoring.ts
export interface Metric {
  name: string
  value: number
  timestamp: number
  tags?: Record<string, string>
}

export interface LogEntry {
  level: "debug" | "info" | "warn" | "error"
  message: string
  timestamp: number
  context?: Record<string, any>
}

class MonitoringService {
  private metrics: Metric[] = []
  private logs: LogEntry[] = []
  private readonly maxEntries = 1000
  private sessionId: string

  constructor() {
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Setup periodic cleanup
    setInterval(
      () => {
        this.cleanup()
      },
      5 * 60 * 1000,
    ) // 5 minutes
  }

  // Metrics recording
  recordMetric(name: string, value: number, tags?: Record<string, string>) {
    const metric: Metric = {
      name,
      value,
      timestamp: Date.now(),
      tags: {
        sessionId: this.sessionId,
        ...tags,
      },
    }

    this.metrics.push(metric)

    // Keep only recent metrics
    if (this.metrics.length > this.maxEntries) {
      this.metrics = this.metrics.slice(-this.maxEntries)
    }

    // Send to external monitoring if configured
    this.sendToExternalMonitoring(metric)
  }

  // Performance timing
  startTiming(name: string, tags?: Record<string, string>): () => void {
    const startTime = performance.now()

    return () => {
      const duration = performance.now() - startTime
      this.recordMetric(`${name}_duration`, duration, tags)
    }
  }

  // Counter metrics
  incrementCounter(name: string, tags?: Record<string, string>) {
    this.recordMetric(name, 1, { type: "counter", ...tags })
  }

  // Logging
  log(level: LogEntry["level"], message: string, context?: Record<string, any>) {
    const entry: LogEntry = {
      level,
      message,
      timestamp: Date.now(),
      context: {
        sessionId: this.sessionId,
        userAgent: navigator.userAgent,
        url: window.location.href,
        ...context,
      },
    }

    this.logs.push(entry)

    // Keep only recent logs
    if (this.logs.length > this.maxEntries) {
      this.logs = this.logs.slice(-this.maxEntries)
    }

    // Console logging in development
    if (import.meta.env.DEV) {
      console[level]("[Monitoring]", message, entry.context)
    }

    // Send to external logging service
    this.sendToExternalLogging(entry)
  }

  // AG-UI specific metrics
  recordAGUIMessage(direction: "sent" | "received", messageType: string, size: number) {
    this.recordMetric("agui_message", 1, {
      direction,
      type: messageType,
      size: size.toString(),
    })
  }

  recordAGUIConnection(status: "connected" | "disconnected" | "error", duration?: number) {
    this.recordMetric("agui_connection", duration || 1, {
      status,
      ...(duration && { duration: duration.toString() }),
    })
  }

  recordAGUIPerformance(operation: string, duration: number, success: boolean) {
    this.recordMetric(`agui_performance_${operation}`, duration, {
      success: success.toString(),
    })
  }

  // User interaction tracking
  trackUserInteraction(action: string, element?: string, context?: Record<string, any>) {
    this.recordMetric("user_interaction", 1, {
      action,
      element: element || "unknown",
      ...context,
    })
  }

  // Error tracking
  trackError(error: Error, context?: Record<string, any>) {
    this.log("error", error.message, {
      stack: error.stack,
      ...context,
    })

    this.recordMetric("error", 1, {
      type: context?.type || "unknown",
      recoverable: (context?.recoverable || false).toString(),
    })
  }

  // Data export for debugging
  exportData() {
    return {
      sessionId: this.sessionId,
      metrics: this.metrics.slice(-100), // Last 100 metrics
      logs: this.logs.slice(-50), // Last 50 logs
      stats: this.getStats(),
    }
  }

  getStats() {
    const now = Date.now()
    const lastHour = now - 60 * 60 * 1000

    const recentMetrics = this.metrics.filter((m) => m.timestamp > lastHour)
    const recentLogs = this.logs.filter((l) => l.timestamp > lastHour)

    return {
      sessionDuration: now - parseInt(this.sessionId.split("_")[1]),
      totalMetrics: this.metrics.length,
      totalLogs: this.logs.length,
      recentMetrics: recentMetrics.length,
      recentErrors: recentLogs.filter((l) => l.level === "error").length,
      aguiMessagesSent: recentMetrics.filter((m) => m.name === "agui_message" && m.tags?.direction === "sent").length,
      aguiMessagesReceived: recentMetrics.filter((m) => m.name === "agui_message" && m.tags?.direction === "received")
        .length,
      averageResponseTime: this.calculateAverageResponseTime(recentMetrics),
    }
  }

  private calculateAverageResponseTime(metrics: Metric[]): number {
    const responseTimes = metrics.filter((m) => m.name.includes("response_time")).map((m) => m.value)

    if (responseTimes.length === 0) return 0

    return responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
  }

  private sendToExternalMonitoring(metric: Metric) {
    // In production, send to monitoring service like DataDog, New Relic, etc.
    // For now, just store locally
    if (import.meta.env.PROD) {
      // TODO: Implement external monitoring integration
      // Example: sendBeacon('/api/metrics', JSON.stringify(metric));
    }
  }

  private sendToExternalLogging(entry: LogEntry) {
    // In production, send to logging service like LogRocket, Sentry, etc.
    if (import.meta.env.PROD) {
      // TODO: Implement external logging integration
      // Example: sendBeacon('/api/logs', JSON.stringify(entry));
    }
  }

  private cleanup() {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000 // 24 hours ago

    this.metrics = this.metrics.filter((m) => m.timestamp > cutoff)
    this.logs = this.logs.filter((l) => l.timestamp > cutoff)
  }
}

// Global monitoring instance
export const monitoring = new MonitoringService()

// Performance observer for automatic metrics
if (typeof PerformanceObserver !== "undefined") {
  try {
    // Observe navigation timing
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === "navigation") {
          const nav = entry as PerformanceNavigationTiming
          monitoring.recordMetric("page_load_time", nav.loadEventEnd - nav.loadEventStart)
        }
      }
    }).observe({ entryTypes: ["navigation"] })

    // Observe resource loading
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === "resource" && entry.name.includes("/ag-ui/")) {
          const res = entry as PerformanceResourceTiming
          monitoring.recordMetric("agui_resource_load", res.responseEnd - res.requestStart, {
            resource: entry.name.split("/").pop() || "unknown",
          })
        }
      }
    }).observe({ entryTypes: ["resource"] })
  } catch (error) {
    console.warn("Performance monitoring setup failed:", error)
  }
}

// Export convenience functions
export const log = {
  debug: (message: string, context?: Record<string, any>) => monitoring.log("debug", message, context),
  info: (message: string, context?: Record<string, any>) => monitoring.log("info", message, context),
  warn: (message: string, context?: Record<string, any>) => monitoring.log("warn", message, context),
  error: (message: string, context?: Record<string, any>) => monitoring.log("error", message, context),
}
