#!/usr/bin/env node
import http from "http"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = 8080
const HOST = "0.0.0.0"
const PUBLIC_DIR = path.join(__dirname, "public")

if (!fs.existsSync(PUBLIC_DIR)) {
  console.error("Error: public directory not found")
  process.exit(1)
}

const mimeTypes = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
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

  if (req.url === "/diagnostics/report" && req.method === "POST") {
    let body = ""
    req.on("data", (chunk) => {
      body += chunk.toString()
    })
    req.on("end", () => {
      try {
        const diagnostics = JSON.parse(body)
        console.log("🔍 Received diagnostics:", {
          errors: diagnostics.errors?.length || 0,
          warnings: diagnostics.warnings?.length || 0,
          networkFailures: diagnostics.networkFailures?.length || 0,
        })
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ success: true }))
      } catch (error) {
        console.error("Error parsing diagnostics:", error)
        res.writeHead(400, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "Invalid JSON" }))
      }
    })
    return
  }

  try {
    let filePath = path.join(PUBLIC_DIR, req.url === "/" ? "index.html" : req.url)

    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { "Content-Type": "text/html" })
      res.end("<h1>404 Not Found</h1><p>The requested file was not found.</p>")
      return
    }

    const extname = String(path.extname(filePath)).toLowerCase()
    const contentType = mimeTypes[extname] || "application/octet-stream"

    const fileContent = fs.readFileSync(filePath, "utf8")
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-cache",
    })
    res.end(fileContent)
  } catch (error) {
    console.error("Error serving file:", error)
    res.writeHead(500, { "Content-Type": "text/html" })
    res.end("<h1>500 Server Error</h1><p>Sorry, there was an error processing your request.</p>")
  }
})

server.listen(PORT, () => {
  console.log("🚀 AG-UI Production Server (Refactored Version) running at:")
  console.log(`   Local:   http://localhost:${PORT}/`)
  console.log(`   External: http://100.94.136.15:${PORT}/`)
  console.log("")
  console.log("📁 Serving from:", PUBLIC_DIR)
  console.log("🎯 Modular AG-UI application is now live!")
  console.log("")
  console.log("✅ Features:")
  console.log("   - Modular JavaScript architecture")
  console.log("   - ES6 modules with proper imports/exports")
  console.log("   - Separation of concerns (models, settings, diagnostics)")
  console.log("   - Browser diagnostics collection")
  console.log("   - Improved network binding (all interfaces)")
})
