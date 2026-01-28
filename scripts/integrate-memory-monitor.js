#!/usr/bin/env node

// Memory Monitoring Integration for OpenCode Server
// Integrates memory monitoring into server startup process

import { spawn } from 'child_process'
import { join } from 'path'

class MemoryMonitorIntegration {
  private serverDir: string
  private memoryMonitorPath: string

  constructor() {
    this.serverDir = '/home/rick/prj/opencode/packages/opencode/src/server'
    this.memoryMonitorPath = '/home/rick/prj/opencode/scripts/memory-monitor.mjs'
  }

  private async checkMemoryMonitorExists(): Promise<boolean> {
    return new Promise((resolve) => {
      const test = spawn('test', ['-f', this.memoryMonitorPath])
      
      test.on('close', (code) => {
        resolve(code === 0)
      })
      
      // Timeout after 5 seconds
      setTimeout(() => {
        resolve(false)
      }, 5000)
    })
  }

  private async integrateMemoryMonitor(serverFile: string): Promise<void> {
    console.log('🔧 Integrating memory monitoring into OpenCode server...')
    
    // Find the location where routes are initialized
    const routesPattern = '.route('
    const routeStart = serverFile.indexOf(routesPattern)
    const middlewarePattern = '.use('
    const middlewareStart = serverFile.indexOf(middlewarePattern)
    
    if (routeStart === -1 || middlewareStart === -1) {
      throw new Error('Could not find proper integration point in server.ts')
    }

    // Read current server file
    const fs = require('fs')
    const currentContent = fs.readFileSync(serverFile, 'utf-8')
    
    // Insert memory monitoring import and initialization before route setup
    const importToAdd = `import { MemoryMonitor } from '${this.memoryMonitorPath}'\n`
    const initToAdd = `
// Initialize memory monitoring
const memoryMonitor = new MemoryMonitor()
await memoryMonitor.startMonitoring(5) // Check every 5 minutes
`
    
    // Insert before the existing routes
    const importPosition = routeStart + importToAdd.length
    
    const newContent = 
      currentContent.slice(0, importPosition) +
      importToAdd +
      initToAdd +
      currentContent.slice(importPosition)
    
    fs.writeFileSync(serverFile, newContent)
    console.log('✅ Memory monitoring integrated into server.ts')
  }

  public async createMemoryMonitoringRoute(serverFile: string): Promise<void> {
    console.log('🛣️ Creating memory monitoring API routes...')
    
    // Find diagnostics routes position
    const fs = require('fs')
    const content = fs.readFileSync(serverFile, 'utf-8')
    const diagnosticsPattern = '.route("/diagnostics"'
    const diagnosticsIndex = content.indexOf(diagnosticsPattern)
    
    if (diagnosticsIndex === -1) {
      throw new Error('Could not find diagnostics routes in server.ts')
    }

    // Insert memory monitoring routes after existing diagnostics routes
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
    return c.json({ success: true, message: `Memory monitoring started with ${interval} minute intervals` })
  })
`
    
    const newContent = 
      content.slice(0, diagnosticsIndex + 23) + // After diagnostics routes
      routesToAdd +
      content.slice(diagnosticsIndex + 23)
    
    fs.writeFileSync(serverFile, newContent)
    console.log('✅ Memory monitoring routes added to server.ts')
  }

  public async integrate(): Promise<void> {
    try {
      // Check if memory monitor script exists
      const monitorExists = await this.checkMemoryMonitorExists()
      
      if (!monitorExists) {
        console.log('❌ Memory monitor script not found at:', this.memoryMonitorPath)
        console.log('💡 Please ensure the memory monitor script exists before integration')
        return
      }

      // Integrate memory monitor into server startup
      const serverFile = join(this.serverDir, 'server.ts')
      await this.integrateMemoryMonitor(serverFile)
      await this.createMemoryMonitoringRoute(serverFile)
      
      console.log('🎯 Memory monitoring integration complete!')
      console.log('📊 Server will now monitor memory usage and model compatibility')
      
    } catch (error) {
      console.error('❌ Integration failed:', error)
    }
  }
}

// CLI interface
async function main() {
  const integration = new MemoryMonitorIntegration()
  await integration.integrate()
}

if (require.main === module) {
  main().catch(console.error)
}

export { MemoryMonitorIntegration }