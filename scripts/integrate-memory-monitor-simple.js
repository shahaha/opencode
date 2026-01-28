#!/usr/bin/env node

// Memory Monitoring Integration for OpenCode Server
// Simple JavaScript integration to avoid TypeScript issues

import { readFileSync, writeFileSync, existsSync } from "fs"
import { join } from "path"

class MemoryMonitorIntegration {
  constructor() {
    this.serverDir = "/home/rick/prj/opencode/packages/opencode/src/server"
    this.memoryMonitorPath = "/home/rick/prj/opencode/scripts/memory-monitor.mjs"
  }

  async checkMemoryMonitorExists() {
    return new Promise((resolve) => {
      const test = spawn("test", ["-f", this.memoryMonitorPath])

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

    const importToAdd = `import { MemoryMonitor } from '${this.memoryMonitorPath}'\n`
    const initToAdd = `
// Initialize memory monitoring
const memoryMonitor = new MemoryMonitor()
await memoryMonitor.startMonitoring(5)
`

    const newContent =
      currentContent.slice(0, routesIndex) + importToAdd + initToAdd + currentContent.slice(routesIndex)

    writeFileSync(serverFile, newContent)
    console.log("✅ Memory monitor import added to server.ts")
  }

  createMemoryRoutes() {
    console.log("🛣️ Adding memory monitoring routes...")

    const serverFile = join(this.serverDir, "server.ts")
    const content = readFileSync(serverFile, "utf-8")

    // Find where diagnostics routes end
    const diagnosticsEnd = content.indexOf('.route("/project")')

    const routesToAdd = `
  // Memory monitoring routes
  app.get("/api/memory/status", async (c) => {
    const memory = await memoryMonitor.generateReport()
    return c.json(memory)
  })

  app.get("/api/memory/alerts", (c) => {
    const limit = parseInt(c.req.query('limit') || '10')
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

    const newContent = content.slice(0, diagnosticsEnd) + routesToAdd
    content.slice(diagnosticsEnd)

    writeFileSync(serverFile, newContent)
    console.log("✅ Memory monitoring routes added to server.ts")
  }

  async integrate() {
    try {
      await this.checkMemoryMonitorExists()
      await this.integrateMemoryMonitor()
      this.createMemoryRoutes()

      console.log("🎯 Memory monitoring integration complete!")
    } catch (error) {
      console.error("❌ Integration failed:", error)
    }
  }
}

// CLI
async function main() {
  const integration = new MemoryMonitorIntegration()
  await integration.integrate()
}

if (require.main === module) {
  main().catch(console.error)
}
