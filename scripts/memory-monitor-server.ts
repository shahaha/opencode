#!/usr/bin/env node

// Automated Memory Monitoring System for OpenCode Server
// Integrates with OpenCode server to provide real-time memory monitoring

import { spawn } from "child_process"
import { writeFileSync, readFileSync, existsSync } from "fs"
import { join } from "path"

interface MemoryStats {
  timestamp: string
  total_mb: number
  available_mb: number
  used_mb: number
  usage_percent: number
  swap_total_mb: number
  swap_used_mb: number
}

interface ModelMemoryRequirements {
  [modelId: string]: {
    minimum: number
    recommended: number
    required: number
  }
}

interface MemoryAlert {
  timestamp: string
  level: "info" | "warning" | "critical"
  message: string
  available_mb: number
  model: string
}

class MemoryMonitor {
  private alertHistory: MemoryAlert[] = []
  private modelRequirements: ModelMemoryRequirements = {}
  private logFile: string
  private configPath: string

  constructor() {
    this.logFile = join(process.cwd(), "logs", "memory-monitor.log")
    this.configPath = join(process.cwd(), "packages", "opencode", "test", "tool", "fixtures", "models-api.json")
    this.loadModelRequirements()
  }

  private loadModelRequirements(): void {
    try {
      if (existsSync(this.configPath)) {
        const config = JSON.parse(readFileSync(this.configPath, "utf-8"))

        // Extract memory requirements from all models
        Object.values(config).forEach((provider: any) => {
          if (provider.models) {
            Object.values(provider.models).forEach((model: any) => {
              if (model.id && model.memory) {
                this.modelRequirements[model.id] = model.memory
              }
            })
          }
        })

        this.log("info", `Loaded memory requirements for ${Object.keys(this.modelRequirements).length} models`)
      }
    } catch (error: any) {
      this.log("error", `Failed to load model requirements: ${error}`)
    }
  }

  private async getMemoryStats(): Promise<MemoryStats | null> {
    return new Promise((resolve) => {
      const free = spawn("free", ["-m"])
      let output = ""

      free.stdout.on("data", (data: Buffer) => {
        output += data.toString()
      })

      free.on("close", (code: number | null) => {
        if (code === 0) {
          const lines = output.split("\n")
          const memLine = lines.find((line: string) => line.startsWith("Mem:"))
          const swapLine = lines.find((line: string) => line.startsWith("Swap:"))

          if (memLine) {
            const memParts = memLine.split(/\s+/)
            const swapParts = swapLine?.split(/\s+/) || ["0", "0", "0", "0"]

            const total = parseInt(memParts[1])
            const used = parseInt(memParts[2])
            const free_mem = parseInt(memParts[3])
            const available = parseInt(memParts[6])
            const swapTotal = parseInt(swapParts[1])
            const swapUsed = parseInt(swapParts[2])

            resolve({
              timestamp: new Date().toISOString(),
              total_mb: total,
              available_mb: available,
              used_mb: used,
              usage_percent: Math.round((used / total) * 100),
              swap_total_mb: swapTotal,
              swap_used_mb: swapUsed,
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

  private checkModelCompatibility(memory: MemoryStats): void {
    Object.entries(this.modelRequirements).forEach(([modelId, requirements]) => {
      const { minimum, recommended, required } = requirements

      if (memory.available_mb < minimum) {
        this.createAlert(
          "critical",
          `Insufficient memory for ${modelId}: ${memory.available_mb}MB available, ${minimum}MB minimum required`,
          modelId,
        )
      } else if (memory.available_mb < required) {
        this.createAlert(
          "warning",
          `Low memory for ${modelId}: ${memory.available_mb}MB available, ${required}MB required`,
          modelId,
        )
      } else if (memory.available_mb < recommended) {
        this.createAlert(
          "info",
          `Suboptimal memory for ${modelId}: ${memory.available_mb}MB available, ${recommended}MB recommended`,
          modelId,
        )
      }
    })
  }

  private createAlert(level: MemoryAlert["level"], message: string, model: string): void {
    const alert: MemoryAlert = {
      timestamp: new Date().toISOString(),
      level,
      message,
      model,
      available_mb: this.getCurrentMemory() || 0,
    }

    this.alertHistory.push(alert)
    this.log(level, message)

    // Keep only last 100 alerts
    if (this.alertHistory.length > 100) {
      this.alertHistory = this.alertHistory.slice(-100)
    }
  }

  private getCurrentMemory(): number | null {
    try {
      // For now, return null - would need sync implementation for real-time
      return null
    } catch {
      return null
    }
  }

  private log(level: string, message: string): void {
    const timestamp = new Date().toISOString()
    const logEntry = `[${timestamp}] ${level.toUpperCase()}: ${message}\n`

    try {
      writeFileSync(this.logFile, logEntry, { flag: "a" })
    } catch (error: any) {
      console.error("Failed to write to log file:", error)
    }

    // Also output to console for immediate visibility
    console.log(`MemoryMonitor ${level}: ${message}`)
  }

  public async startMonitoring(intervalMinutes: number = 5): Promise<void> {
    this.log("info", "Starting automated memory monitoring")

    const monitor = async (): Promise<void> => {
      try {
        const memory = await this.getMemoryStats()

        if (memory) {
          this.log("info", `Memory: ${memory.available_mb}MB available (${memory.usage_percent}% used)`)

          // Check overall system memory health
          if (memory.available_mb < 2048) {
            // Less than 2GB
            this.createAlert("critical", `Very low system memory: ${memory.available_mb}MB available`, "system")
          } else if (memory.available_mb < 4096) {
            // Less than 4GB
            this.createAlert("warning", `Low system memory: ${memory.available_mb}MB available`, "system")
          }

          // Check model-specific compatibility
          this.checkModelCompatibility(memory)
        }
      } catch (error: any) {
        this.log("error", `Memory monitoring error: ${error}`)
      }
    }

    // Initial check
    await monitor()

    // Set up recurring monitoring
    setInterval(monitor, intervalMinutes * 60 * 1000)
  }

  public getAlertHistory(limit: number = 10): MemoryAlert[] {
    return this.alertHistory.slice(-limit)
  }

  public getModelRequirements(): ModelMemoryRequirements {
    return this.modelRequirements
  }

  public async generateReport(): Promise<string> {
    const memory = await this.getMemoryStats()
    const recentAlerts = this.getAlertHistory(5)

    const report = {
      timestamp: new Date().toISOString(),
      memory,
      model_requirements: this.modelRequirements,
      recent_alerts: recentAlerts,
      total_alerts: this.alertHistory.length,
      alerts_by_level: {
        critical: this.alertHistory.filter((a: MemoryAlert) => a.level === "critical").length,
        warning: this.alertHistory.filter((a: MemoryAlert) => a.level === "warning").length,
        info: this.alertHistory.filter((a: MemoryAlert) => a.level === "info").length,
      },
    }

    return JSON.stringify(report, null, 2)
  }
}

// CLI interface
async function main(): Promise<void> {
  const monitor = new MemoryMonitor()

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

    case "requirements":
      console.log(JSON.stringify(monitor.getModelRequirements(), null, 2))
      break

    default: {
      const helpText = `Memory Monitor Commands:
  start [minutes]    - Start monitoring (default: 5 minute intervals)
  report            - Generate current memory report
  alerts [count]    - Show recent alerts (default: 10)
  requirements      - Show model memory requirements

Usage Examples:
  node memory-monitor.ts start 5    # Monitor every 5 minutes
  node memory-monitor.ts report     # Generate report
  node memory-monitor.ts alerts 5   # Show last 5 alerts`
      console.log(helpText)
    }
  }
}

if (require.main === module) {
  main().catch(console.error)
}

export { MemoryMonitor }
