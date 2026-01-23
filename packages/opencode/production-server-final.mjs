#!/usr/bin/env node
import http from "http"
import https from "https"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = 9100
const HOST = "0.0.0.0"
const HTML_FILE = path.join(__dirname, "production-agui-chat.html")
const DIAGNOSTICS_SCRIPT = path.join(__dirname, "browser-diagnostics-injector.js")

console.log("=== 啟動生產服務器 ===")

if (!fs.existsSync(HTML_FILE)) {
  console.error("Error: production-agui-chat.html not found")
  process.exit(1)
}

const server = http.createServer((req, res) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url} from ${req.socket.remoteAddress}`)

  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")

  if (req.method === "OPTIONS") {
    res.writeHead(200)
    res.end()
    return
  }

  try {
    // Handle MCP status endpoint
    if (req.url === "/mcp/status") {
      console.log("Proxying MCP status request to backend...")

      const options = {
        hostname: "100.94.136.15",
        port: 5000,
        path: "/mcp",
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "AG-UI-Proxy/1.0",
        },
      }

      const backendReq = http.request(options, (backendRes) => {
        let data = ""

        backendRes.on("data", (chunk) => {
          data += chunk
        })

        backendRes.on("end", () => {
          res.writeHead(backendRes.statusCode, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          })
          res.end(data)
        })
      })

      backendReq.on("error", (error) => {
        console.error("Backend request error:", error)
        // Return a proper MCP response structure even when backend is unavailable
        const mockMcpResponse = {
          servers: [
            {
              name: "context7",
              status: "disconnected",
              version: "unknown",
              tools: [],
            },
            {
              name: "websearch",
              status: "disconnected",
              version: "unknown",
              tools: [],
            },
            {
              name: "grep_app",
              status: "disconnected",
              version: "unknown",
              tools: [],
            },
          ],
          status: "backend_unavailable",
          message: "MCP backend service is not running",
        }

        res.writeHead(200, {
          // Return 200 instead of 500 to avoid browser errors
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        })
        res.end(JSON.stringify(mockMcpResponse))
      })

      backendReq.end()
      return
    }

    // Handle diagnostics report endpoint
    if (req.method === "POST" && req.url === "/diagnostics/report") {
      let body = ""
      req.on("data", (chunk) => {
        body += chunk.toString()
      })

      req.on("end", () => {
        try {
          const diagnostics = JSON.parse(body)
          console.log("📊 Received browser diagnostics:", {
            url: diagnostics.url,
            errors: diagnostics.errors?.length || 0,
            warnings: diagnostics.warnings?.length || 0,
            networkFailures: diagnostics.networkFailures?.length || 0,
          })

          // Store diagnostics data (in a real implementation, this would save to a database)
          // For now, just log it and return success
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          })
          res.end(JSON.stringify({ success: true, message: "Diagnostics received" }))
        } catch (error) {
          console.error("Error processing diagnostics:", error)
          res.writeHead(400, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          })
          res.end(JSON.stringify({ error: "Invalid diagnostics data" }))
        }
      })
      return
    }

    let fileToServe = HTML_FILE
    if (req.url === "/" || req.url === "/production-agui-chat.html") {
      fileToServe = HTML_FILE
    } else if (req.url === "/browser-diagnostics-injector.js") {
      fileToServe = DIAGNOSTICS_SCRIPT
    } else if (req.url.startsWith("/production-agui-chat.html")) {
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" })
      res.end("Not Found")
      return
    }

    const content = fs.readFileSync(fileToServe, "utf8")
    const isJsFile = fileToServe.endsWith(".js")
    res.writeHead(200, {
      "Content-Type": isJsFile ? "application/javascript; charset=utf-8" : "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    })
    res.end(content)
  } catch (error) {
    console.error("Error reading file:", error)
    res.writeHead(500, { "Content-Type": "text/plain" })
    res.end("Internal Server Error")
  }
})

server.listen(PORT, HOST, () => {
  console.log("🚀 Production AG-UI Chat server running at:")
  console.log(`   Local: http://localhost:${PORT}/`)
  console.log(`   External: http://${HOST}:${PORT}/`)
  console.log(`   External File: http://${HOST}:${PORT}/production-agui-chat.html`)
  console.log("")
  console.log("🎯 修復已應用！")
  console.log("   可以訪問: http://100.94.136.15:9100/production-agui-chat.html")
})
