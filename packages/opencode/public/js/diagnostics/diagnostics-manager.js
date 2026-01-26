export class DiagnosticsManager {
  constructor() {
    this.errors = []
    this.warnings = []
    this.listeners = new Map()
    this.isCollecting = false
  }

  startCollection() {
    if (this.isCollecting) return

    this.isCollecting = true
    this.setupErrorHandlers()
    console.log("🔍 Started collecting browser diagnostics")
  }

  stopCollection() {
    if (!this.isCollecting) return

    this.isCollecting = false
    this.removeErrorHandlers()
    console.log("⏹️ Stopped collecting browser diagnostics")
  }

  setupErrorHandlers() {
    this.errorHandler = (event) => this.handleError(event.error, event.filename, event.lineno, event.colno)
    this.unhandledRejectionHandler = (event) => this.handlePromiseRejection(event.reason)

    window.addEventListener("error", this.errorHandler)
    window.addEventListener("unhandledrejection", this.unhandledRejectionHandler)

    const originalConsoleError = console.error
    console.error = (...args) => {
      this.handleConsoleError(args)
      originalConsoleError.apply(console, args)
    }

    const originalConsoleWarn = console.warn
    console.warn = (...args) => {
      this.handleConsoleWarning(args)
      originalConsoleWarn.apply(console, args)
    }
  }

  removeErrorHandlers() {
    window.removeEventListener("error", this.errorHandler)
    window.removeEventListener("unhandledrejection", this.unhandledRejectionHandler)
  }

  handleError(error, filename, lineno, colno) {
    const errorInfo = {
      type: "javascript",
      message: error?.message || "Unknown error",
      filename,
      line: lineno,
      column: colno,
      stack: error?.stack,
      timestamp: Date.now(),
    }

    this.addError(errorInfo)
  }

  handlePromiseRejection(reason) {
    const errorInfo = {
      type: "promise_rejection",
      message: reason?.message || "Unhandled promise rejection",
      stack: reason?.stack,
      timestamp: Date.now(),
    }

    this.addError(errorInfo)
  }

  handleConsoleError(args) {
    const message = args.map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg))).join(" ")

    const errorInfo = {
      type: "console_error",
      message,
      timestamp: Date.now(),
    }

    this.addError(errorInfo)
  }

  handleConsoleWarning(args) {
    const message = args.map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg))).join(" ")

    const warningInfo = {
      type: "console_warning",
      message,
      timestamp: Date.now(),
    }

    this.addWarning(warningInfo)
  }

  addError(error) {
    this.errors.push(error)
    this.notifyListeners("error", error)

    if (this.errors.length > 100) {
      this.errors = this.errors.slice(-100)
    }
  }

  addWarning(warning) {
    this.warnings.push(warning)
    this.notifyListeners("warning", warning)

    if (this.warnings.length > 100) {
      this.warnings = this.warnings.slice(-100)
    }
  }

  getErrors() {
    return [...this.errors]
  }

  getWarnings() {
    return [...this.warnings]
  }

  clear() {
    this.errors = []
    this.warnings = []
    this.notifyListeners("cleared")
  }

  getStats() {
    return {
      errors: this.errors.length,
      warnings: this.warnings.length,
      total: this.errors.length + this.warnings.length,
    }
  }

  addListener(callback) {
    const id = Date.now().toString()
    this.listeners.set(id, callback)
    return id
  }

  removeListener(id) {
    this.listeners.delete(id)
  }

  notifyListeners(type, data) {
    this.listeners.forEach((callback) => {
      try {
        callback(type, data)
      } catch (error) {
        console.error("Diagnostics listener error:", error)
      }
    })
  }

  exportReport() {
    return {
      timestamp: Date.now(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      errors: this.getErrors(),
      warnings: this.getWarnings(),
      stats: this.getStats(),
    }
  }
}

export default new DiagnosticsManager()
