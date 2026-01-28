#!/usr/bin/env node

// Simple Memory Monitor Server - JavaScript Version
// Basic memory monitoring integration for OpenCode

const { spawn } = require("child_process")
const { writeFileSync, readFileSync, existsSync } = require("fs")
const { join } = require("path")

class SimpleMemoryMonitor {
  constructor() {
    this.logFile = join(process.cwd(), "logs", "memory-monitor.log")
    this.alertHistory = []
  }

  async getMemoryStats() {
    return new Promise((resolve) => {
      const free = spawn("free", ["-m"])
      let output = ""

      free.stdout.on("data", (data) => {
        output += data.toString()
      })

      free.on("close", (code) => {
        if (code === 0) {
          const lines = output.split("\n")
          const memLine = lines.find((line) => line.startsWith("Mem:"))

          if (memLine) {
            const memParts = memLine.split(/\s+/)
            const total = parseInt(memParts[1])
            const used = parseInt(memParts[2])
            const available = parseInt(memParts[6])
            const usagePercent = Math.round((used / total) * 100)

            resolve({
              timestamp: new Date().toISOString(),
              total_mb: total,
              available_mb: available,
              used_mb: used,
              usage_percent: usagePercent,
            })
          } else {
            resolve(null)
          }
        } else {
          resolve(null)
        }
      })
    })
  }

  createAlert(level, message) {
    const alert = {
      timestamp: new Date().toISOString(),
      level,
      message,
      available_mb: 0,
    }

    this.alertHistory.push(alert)
    this.log(level, message)

    // Keep only last 50 alerts
    if (this.alertHistory.length > 50) {
      this.alertHistory = this.alertHistory.slice(-50)
    }
  }

  log(level, message) {
    const timestamp = new Date().toISOString()
    const logEntry = `[${timestamp}] ${level.toUpperCase()}: ${message}\n`

    try {
      writeFileSync(this.logFile, logEntry, { flag: "a" })
    } catch (error) {
      console.error("Failed to write to log file:", error)
    }

    console.log(`MemoryMonitor ${level}: ${message}`)
  }

  async startMonitoring(intervalMinutes = 5) {
    this.log("info", "Starting automated memory monitoring")

    const monitor = async () => {
      try {
        const memory = await this.getMemoryStats()

        if (memory) {
          this.log("info", `Memory: ${memory.available_mb}MB available (${memory.usage_percent}% used)`)

          // Check overall system memory health
          if (memory.available_mb < 2048) {
            // Less than 2GB
            this.createAlert("critical", `Very low system memory: ${memory.available_mb}MB available`)
          } else if (memory.available_mb < 4096) {
            // Less than 4GB
            this.createAlert("warning", `Low system memory: ${memory.available_mb}MB available`)
          }
        }
      } catch (error) {
        this.log("error", `Memory monitoring error: ${error.message}`)
      }
    }

    // Initial check
    await monitor()

    // Set up recurring monitoring
    setInterval(monitor, intervalMinutes * 60 * 1000)
  }

  getAlertHistory(limit = 10) {
    return this.alertHistory.slice(-limit)
  }

  async generateReport() {
    const memory = await this.getMemoryStats()
    const recentAlerts = this.getAlertHistory(5)

    const report = {
      timestamp: new Date().toISOString(),
      memory,
      recent_alerts: recentAlerts,
      total_alerts: this.alertHistory.length,
    }

    return JSON.stringify(report, null, 2)
  }
}

// CLI interface
async function main() {
  const monitor = new SimpleMemoryMonitor()
  const command = process.argv[2]

  switch (command) {
    case "start":
      const interval = parseInt(process.argv[3]) || 5
      await monitor.startMonitoring(interval)
      break

    case "report":
      const report = await monitor.generateReport()
      console.log(report)
      break

    case "alerts":
      const alerts = monitor.getAlertHistory(parseInt(process.argv[3]) || 10)
      console.log(JSON.stringify(alerts, null, 2))
      break

    default:
      console.log(`
Memory Monitor Commands:
  start [minutes]    - Start monitoring (default: 5 minute intervals)
  report            - Generate current memory report
  alerts [count]    - Show recent alerts (default: 10)

Usage Examples:
  node memory-monitor.js start 5    # Monitor every 5 minutes
  node memory-monitor.js report     # Generate report
  node memory-monitor.js alerts 5   # Show last 5 alerts
      `)
  }
}

if (require.main === module) {
  main().catch(console.error)
}

module.exports = { SimpleMemoryMonitor }
