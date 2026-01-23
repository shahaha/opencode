#!/usr/bin/env node
// Simple HTTP server to serve the fixed HTML file

import { createServer } from "http"
import { readFileSync, existsSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const PORT = 9102
const HTML_FILE = join(__dirname, "production-agui-chat-fixed.html")

// Check if file exists
if (!existsSync(HTML_FILE)) {
  console.error(`Error: ${HTML_FILE} not found`)
  process.exit(1)
}

const server = createServer((req, res) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`)

  // Set CORS headers for all responses
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.writeHead(200)
    res.end()
    return
  }

  // Serve the HTML file
  if (req.url === "/" || req.url === "/production-agui-chat-fixed.html") {
    try {
      const content = readFileSync(HTML_FILE, "utf8")
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      })
      res.end(content)
    } catch (error) {
      console.error("Error reading file:", error)
      res.writeHead(500, { "Content-Type": "text/plain" })
      res.end("Internal Server Error")
    }
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" })
    res.end("Not Found")
  }
})

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Fixed AG-UI Chat server running at:`)
  console.log(`   http://localhost:${PORT}/`)
  console.log(`   http://100.94.136.15:${PORT}/`)
  console.log("")
  console.log("🧪 Test the fixes:")
  console.log("1. Open the URL above in your browser")
  console.log("2. Click Settings button multiple times")
  console.log("3. Check that workspace items are not duplicated")
  console.log("4. Verify MCP status loads without CORS errors")
  console.log("")
  console.log("🛠️  Server logs will appear below...")
})

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down server...")
  server.close(() => {
    console.log("✅ Server stopped")
    process.exit(0)
  })
})

process.on("SIGTERM", () => {
  console.log("\n🛑 Received SIGTERM, shutting down...")
  server.close(() => {
    process.exit(0)
  })
})
