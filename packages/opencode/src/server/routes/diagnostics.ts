import { describeRoute, validator, resolver } from "hono-openapi"
import { Hono } from "hono"
import z from "zod"
import { BrowserDiagnosticsCollector } from "@/browser-diagnostics"
import { Log } from "@/util/log"

const log = Log.create({ service: "diagnostics-api" })

export const DiagnosticsRoutes = new Hono()
  .use("/*", async (c, next) => {
    c.header("Access-Control-Allow-Origin", "*")
    c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    c.header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    if (c.req.method === "OPTIONS") {
      return c.text("OK", 200)
    }
    await next()
  })
  .post("/report", async (c) => {
    try {
      const data = await c.req.json()
      const { errors, warnings, networkFailures, url } = data

      log.info("received browser diagnostics", {
        url,
        errorsCount: errors?.length || 0,
        warningsCount: warnings?.length || 0,
        networkFailuresCount: networkFailures?.length || 0,
      })

      // Store diagnostics data
      if (errors && errors.length > 0) {
        errors.forEach((error: any) => {
          BrowserDiagnosticsCollector.storeDiagnosticData(url, "errors", error)
        })
      }

      if (warnings && warnings.length > 0) {
        warnings.forEach((warning: any) => {
          BrowserDiagnosticsCollector.storeDiagnosticData(url, "warnings", warning)
        })
      }

      if (networkFailures && networkFailures.length > 0) {
        networkFailures.forEach((failure: any) => {
          BrowserDiagnosticsCollector.storeDiagnosticData(url, "networkFailures", failure)
        })
      }

      return c.json({
        success: true,
        message: "Diagnostics data received and stored",
      })
    } catch (error) {
      log.error("failed to process diagnostics data", { error })
      return c.json(
        {
          success: false,
          message: "Failed to process diagnostics data",
        },
        500,
      )
    }
  })
  .get("/data/:url", async (c) => {
    const url = decodeURIComponent(c.req.param("url"))
    const diagnostics = BrowserDiagnosticsCollector.getDiagnosticsForUrl(url)

    return c.json({
      url,
      ...diagnostics,
    })
  })
  .get("/all", async (c) => {
    const allDiagnostics = BrowserDiagnosticsCollector.getAllDiagnostics()
    return c.json(allDiagnostics)
  })
  .delete("/clear/:url?", async (c) => {
    const url = c.req.param("url")

    if (url) {
      BrowserDiagnosticsCollector.clearDiagnostics(decodeURIComponent(url))
      return c.json({
        success: true,
        message: `Cleared diagnostics data for ${url}`,
      })
    } else {
      BrowserDiagnosticsCollector.clearDiagnostics()
      return c.json({
        success: true,
        message: "Cleared all diagnostics data",
      })
    }
  })
