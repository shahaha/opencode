const fs = require("fs")
const path = require("path")

const logsDir = path.join(__dirname, "logs")
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true })
}

const logLevels = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
}

class Logger {
  constructor(service) {
    this.service = service
    this.logFile = path.join(logsDir, `${service}.log`)
  }

  write(level, message, data) {
    const timestamp = new Date().toISOString()
    const logEntry = {
      timestamp,
      level,
      service: this.service,
      message,
      ...(data && { data }),
    }

    const logLine = JSON.stringify(logEntry)

    fs.appendFileSync(this.logFile, logLine + "\n")

    if (level === "ERROR" || level === "WARN") {
      console.error(`[${level}] ${this.service}: ${message}`, data || "")
    } else {
      console.log(`[${level}] ${this.service}: ${message}`, data || "")
    }
  }

  error(message, data) {
    this.write("ERROR", message, data)
  }

  warn(message, data) {
    this.write("WARN", message, data)
  }

  info(message, data) {
    this.write("INFO", message, data)
  }

  debug(message, data) {
    this.write("DEBUG", message, data)
  }
}

class Metrics {
  constructor() {
    this.requests = 0
    this.errors = 0
    this.wsConnections = 0
    this.startTime = Date.now()
  }

  recordRequest() {
    this.requests++
  }

  recordError() {
    this.errors++
  }

  recordWSConnection() {
    this.wsConnections++
  }

  recordWSDisconnection() {
    this.wsConnections = Math.max(0, this.wsConnections - 1)
  }

  getStats() {
    const uptime = Math.floor((Date.now() - this.startTime) / 1000)
    const errorRate = this.requests > 0 ? ((this.errors / this.requests) * 100).toFixed(2) : 0
    return {
      uptime,
      totalRequests: this.requests,
      totalErrors: this.errors,
      errorRate: `${errorRate}%`,
      activeConnections: this.wsConnections,
      timestamp: new Date().toISOString(),
    }
  }
}

module.exports = {
  Logger,
  Metrics,
}
