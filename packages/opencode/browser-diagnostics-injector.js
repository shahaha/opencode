/**
 * Browser Diagnostics Collector
 * Automatically captures browser developer tools data for repair verification
 */

;(function () {
  "use strict"

  // Browser diagnostics collector
  var diagnostics = {
    errors: [],
    warnings: [],
    networkFailures: [],
  }

  // Store original console methods
  var originalConsoleError = console.error
  var originalConsoleWarn = console.warn

  function initialize() {
    captureJavaScriptErrors()
    captureConsoleMessages()
    captureNetworkErrors()
    capturePageMetrics()

    // Send diagnostics data every 5 seconds
    setInterval(sendDiagnostics, 5000)

    console.log("[BrowserDiagnostics] Initialized - capturing browser diagnostics")
  }

  function captureJavaScriptErrors() {
    window.addEventListener("error", function (event) {
      var error = {
        type: "javascript",
        level: "error",
        message: event.message,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
        stack: event.error ? event.error.stack : undefined,
        timestamp: Date.now(),
        url: window.location.href,
      }

      diagnostics.errors.push(error)
      console.log("[BrowserDiagnostics] JavaScript error captured:", error)
    })

    window.addEventListener("unhandledrejection", function (event) {
      var error = {
        type: "javascript",
        level: "error",
        message: "Unhandled promise rejection: " + event.reason,
        stack: event.reason ? event.reason.stack : undefined,
        timestamp: Date.now(),
        url: window.location.href,
      }

      diagnostics.errors.push(error)
      console.log("[BrowserDiagnostics] Unhandled rejection captured:", error)
    })
  }

  function captureConsoleMessages() {
    console.error = function () {
      var message = Array.prototype.join.call(arguments, " ")
      var error = {
        type: "console",
        level: "error",
        message: message,
        timestamp: Date.now(),
        url: window.location.href,
      }

      diagnostics.errors.push(error)
      originalConsoleError.apply(console, arguments)
    }

    console.warn = function () {
      var message = Array.prototype.join.call(arguments, " ")
      diagnostics.warnings.push({
        type: "console",
        message: message,
      })

      originalConsoleWarn.apply(console, arguments)
    }
  }

  function captureNetworkErrors() {
    // Override XMLHttpRequest to capture network errors
    var originalOpen = XMLHttpRequest.prototype.open
    XMLHttpRequest.prototype.open = function (method, url) {
      var xhr = this
      var urlString = typeof url === "string" ? url : url.href

      xhr.addEventListener("error", function () {
        var failure = {
          url: urlString,
          error: "Network request failed",
        }

        diagnostics.networkFailures.push(failure)
      })

      xhr.addEventListener("load", function () {
        if (xhr.status >= 400) {
          var failure = {
            url: urlString,
            status: xhr.status,
            error: "HTTP " + xhr.status + ": " + xhr.statusText,
          }

          diagnostics.networkFailures.push(failure)
        }
      })

      return originalOpen.apply(this, [method, url])
    }

    // Override fetch to capture network errors
    var originalFetch = window.fetch
    window.fetch = function (input, init) {
      return originalFetch.call(this, input, init).catch(function (error) {
        var url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
        var failure = {
          url: url,
          error: error.message,
        }

        diagnostics.networkFailures.push(failure)
        throw error
      })
    }
  }

  function capturePageMetrics() {
    // Capture page load metrics
    window.addEventListener("load", function () {
      setTimeout(function () {
        var navigation = performance.getEntriesByType("navigation")[0]
        var paintEntries = performance.getEntriesByType("paint")
        var lcpEntries = performance.getEntriesByType("largest-contentful-paint")

        var metrics = {
          url: window.location.href,
          loadTime: performance.now(),
          domContentLoaded: navigation ? navigation.domContentLoadedEventEnd : 0,
          firstPaint: paintEntries.find(function (entry) {
            return entry.name === "first-paint"
          })
            ? paintEntries.find(function (entry) {
                return entry.name === "first-paint"
              }).startTime
            : undefined,
          largestContentfulPaint: lcpEntries[0] ? lcpEntries[0].startTime : undefined,
          errors: diagnostics.errors.slice(-10), // Last 10 errors
          warnings: diagnostics.warnings.slice(-10), // Last 10 warnings
          networkFailures: diagnostics.networkFailures,
          timestamp: Date.now(),
        }

        console.log("[BrowserDiagnostics] Page metrics captured:", metrics)
      }, 1000)
    })
  }

  function sendDiagnostics() {
    if (
      diagnostics.errors.length === 0 &&
      diagnostics.warnings.length === 0 &&
      diagnostics.networkFailures.length === 0
    ) {
      return // Nothing to send
    }

    var data = {
      errors: diagnostics.errors.splice(0), // Clear and send
      warnings: diagnostics.warnings.splice(0),
      networkFailures: diagnostics.networkFailures.splice(0),
      url: window.location.href,
      timestamp: Date.now(),
    }

    fetch("/diagnostics/report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    })
      .then(function () {
        console.log("[BrowserDiagnostics] Diagnostics sent to server")
      })
      .catch(function (error) {
        console.warn("[BrowserDiagnostics] Failed to send diagnostics:", error)
      })
  }

  // Auto-initialize when script loads
  initialize()
})()
