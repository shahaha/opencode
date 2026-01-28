#!/usr/bin/env node

// Memory Monitoring Integration for OpenCode Server
// Simple integration without TypeScript syntax issues

const { spawn } = require("child_process")
const { existsSync, readFileSync, writeFileSync } = require("fs")
const { join } = require("path")

class SimpleMemoryMonitor {
  constructor() {
    this.serverDir = "/home/rick/prj/opencode/packages/opencode/src/server"
    this.memoryMonitorPath = "/home/rick/prj/opencode/scripts/memory-monitor.mjs"
  }

  checkMemoryMonitorExists() {
    const test = spawn("test", ["-f", this.memoryMonitorPath])

    return new Promise((resolve) => {
      test.on("close", (code) => {
        resolve(code === 0)
      })

      setTimeout(() => {
        resolve(false)
      }, 5000)
    })
  }

  async integrateMemoryMonitor() {
    console.log("🔧 Integrating memory monitoring into OpenCode server...")

    const serverFile = join(this.serverDir, "server.ts")
    const currentContent = readFileSync(serverFile, "utf-8")

    // Find where to insert memory monitoring import
    const routesIndex = currentContent.indexOf('.route("/diagnostics")')

    if (routesIndex === -1) {
      throw new Error("Could not find diagnostics routes in server.ts")
    }

    // Simple insertion after route handlers
    const importPosition = routesIndex + 23
    const importToAdd = `
// Memory monitoring
const memoryMonitor = require('${this.memoryMonitorPath}')
await memoryMonitor.startMonitoring(5) // Check every 5 minutes
`

    const newContent = currentContent.slice(0, importPosition) + importToAdd + currentContent.slice(importPosition)

    writeFileSync(serverFile, newContent)
    console.log("✅ Memory monitor import added to server.ts")
  }

  createMemoryRoutes() {
    console.log("🛣️ Adding memory monitoring routes...")

    const fs = require("fs")
    const content = readFileSync(serverFile, "utf-8")

    // Find diagnostics routes end
    const diagnosticsEnd = content.indexOf('.route("/project")')

    // Add memory monitoring routes
    const routesToAdd = `
  // Memory monitoring routes
  app.get("/api/memory/status", async (c) => {
    const memory = await memoryMonitor.generateReport()
    return c.json(memory)
  })

  app.get("/api/memory/alerts", (c) => {
    const limit = parseInt(c.req.query('limit') || '10'
    const alerts = memoryMonitor.getAlertHistory(limit)
    return c.json(alerts)
  })

  app.post("/api/memory/monitor", async (c) => {
    const body = await c.req.json()
    const interval = body.interval || 5
    await memoryMonitor.startMonitoring(interval)
    return c.json({ success: true, message: \`Memory monitoring started with \${interval} minute intervals\` })
  })
`

    const newContent = content.slice(0, diagnosticsEnd) + routesToAdd + content.slice(diagnosticsEnd)

    writeFileSync(serverFile, newContent)
    console.log("✅ Memory monitoring routes added to server.ts")
  }

  async integrate() {
    try {
      const monitorExists = await this.checkMemoryMonitorExists()

      if (!monitorExists) {
        console.log("❌ Memory monitor script not found at:", this.memoryMonitorPath)
        console.log("💡 Please ensure script exists before integration")
        return
      }

      await this.integrateMemoryMonitor()
      this.createMemoryRoutes()

      console.log("🎯 Memory monitoring integration complete!")
      console.log("📊 Server will now monitor memory usage and model compatibility")
    } catch (error) {
      console.error("❌ Integration failed:", error)
    }
  }
}

// CLI
async function main() {
  const integration = new SimpleMemoryMonitor()
  await integration.integrate()
}

if (require.main === module) {
  main().catch(console.error)
}
