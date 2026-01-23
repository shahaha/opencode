import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import { Log } from "@/util/log"
import z from "zod/v4"

export const BrowserDiagnostics = {
  Event: {
    ErrorCaptured: BusEvent.define(
      "browser.diagnostics.error",
      z.object({
        type: z.string(), // 'javascript', 'network', 'console'
        level: z.enum(["error", "warning", "info"]),
        message: z.string(),
        source: z.string().optional(),
        line: z.number().optional(),
        column: z.number().optional(),
        stack: z.string().optional(),
        timestamp: z.number(),
        url: z.string(),
      }),
    ),
    PageMetrics: BusEvent.define(
      "browser.diagnostics.metrics",
      z.object({
        url: z.string(),
        loadTime: z.number(),
        domContentLoaded: z.number(),
        firstPaint: z.number().optional(),
        largestContentfulPaint: z.number().optional(),
        errors: z.array(
          z.object({
            type: z.string(),
            message: z.string(),
            source: z.string().optional(),
          }),
        ),
        warnings: z.array(
          z.object({
            type: z.string(),
            message: z.string(),
          }),
        ),
        networkFailures: z.array(
          z.object({
            url: z.string(),
            status: z.number().optional(),
            error: z.string(),
          }),
        ),
        timestamp: z.number(),
      }),
    ),
  },
}

const log = Log.create({ service: "browser-diagnostics" })

export namespace BrowserDiagnosticsCollector {
  let isEnabled = false
  const collectedData: Map<string, any> = new Map()

  export async function init() {
    if (isEnabled) return

    log.info("initializing browser diagnostics collector")
    isEnabled = true

    // Listen for browser diagnostic events
    Bus.subscribe(BrowserDiagnostics.Event.ErrorCaptured, (event) => {
      const error = event.properties
      log.warn("browser error captured", {
        type: error.type,
        level: error.level,
        message: error.message,
        source: error.source,
        url: error.url,
      })

      // Store error for verification analysis
      storeDiagnosticData(error.url, "errors", error)
    })

    Bus.subscribe(BrowserDiagnostics.Event.PageMetrics, (event) => {
      const metrics = event.properties
      log.info("page metrics received", {
        url: metrics.url,
        loadTime: metrics.loadTime,
        errors: metrics.errors.length,
        warnings: metrics.warnings.length,
      })

      // Store metrics for verification analysis
      collectedData.set(metrics.url, metrics)
    })

    log.info("browser diagnostics collector initialized")
  }

  export function storeDiagnosticData(url: string, type: string, data: any) {
    if (!collectedData.has(url)) {
      collectedData.set(url, {
        errors: [],
        warnings: [],
        networkFailures: [],
        consoleLogs: [],
      })
    }

    const pageData = collectedData.get(url)
    if (pageData && pageData[type]) {
      pageData[type].push(data)
    }
  }

  export function getDiagnosticsForUrl(url: string) {
    return (
      collectedData.get(url) || {
        errors: [],
        warnings: [],
        networkFailures: [],
        consoleLogs: [],
      }
    )
  }

  export function clearDiagnostics(url?: string) {
    if (url) {
      collectedData.delete(url)
    } else {
      collectedData.clear()
    }
  }

  export function getAllDiagnostics() {
    return Object.fromEntries(collectedData)
  }
}
