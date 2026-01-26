// Browser Diagnostics Injector
;(function () {
  let diagnosticData = {
    errors: [],
    warnings: [],
    networkFailures: [],
    url: window.location.href,
    timestamp: Date.now(),
  }

  function sendDiagnosticData() {
    try {
      fetch("/diagnostics/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(diagnosticData),
      }).catch(() => {
        // Silently fail if diagnostic endpoint is not available
      })
    } catch (error) {
      // Silently fail if fetch is not available
    }
  }

  // Capture JavaScript errors
  window.addEventListener("error", function (event) {
    diagnosticData.errors.push({
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack,
      timestamp: Date.now(),
    })
  })

  // Capture unhandled promise rejections
  window.addEventListener("unhandledrejection", function (event) {
    diagnosticData.errors.push({
      type: "promise_rejection",
      message: event.reason?.message || "Unhandled promise rejection",
      stack: event.reason?.stack,
      timestamp: Date.now(),
    })
  })

  // Override console methods to capture warnings and errors
  const originalConsoleError = console.error
  console.error = function (...args) {
    diagnosticData.errors.push({
      type: "console_error",
      message: args.map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg))).join(" "),
      timestamp: Date.now(),
    })
    originalConsoleError.apply(console, args)
  }

  const originalConsoleWarn = console.warn
  console.warn = function (...args) {
    diagnosticData.warnings.push({
      type: "console_warning",
      message: args.map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg))).join(" "),
      timestamp: Date.now(),
    })
    originalConsoleWarn.apply(console, args)
  }

  // Monitor network failures
  const originalFetch = window.fetch
  window.fetch = function (...args) {
    return originalFetch.apply(this, args).catch((error) => {
      diagnosticData.networkFailures.push({
        url: args[0],
        error: error.message,
        timestamp: Date.now(),
      })
      throw error
    })
  }

  // Send diagnostic data every 5 seconds
  setInterval(sendDiagnosticData, 5000)

  // Send diagnostic data on page unload
  window.addEventListener("beforeunload", sendDiagnosticData)

  console.log("🔍 Browser diagnostics injector loaded")
})()
