#!/usr/bin/env node
import http from "http"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = 3005
const HOST = "0.0.0.0"
const PUBLIC_DIR = path.join(__dirname, "public")

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

  let filePath = path.join(PUBLIC_DIR, req.url === "/" ? "index.html" : req.url)

  const extname = String(path.extname(filePath)).toLowerCase()
  const contentType = mimeTypes[extname] || "application/octet-stream"

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/html" })
        res.end("<h1>404 Not Found</h1><p>The requested file was not found.</p>")
      } else {
        res.writeHead(500, { "Content-Type": "text/html" })
        res.end("<h1>500 Server Error</h1><p>Sorry, there was an error processing your request.</p>")
        console.error("Server error:", error)
      }
    } else {
      res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      })
      res.end(content, "utf-8")
    }
  })
})

server.listen(PORT, HOST, () => {
  console.log("🚀 Refactored AG-UI Test Server running at:")
  console.log(`   Local:   http://localhost:${PORT}/`)
  console.log(`   External: http://${HOST}:${PORT}/`)
  console.log("")
  console.log("📁 Serving from:", PUBLIC_DIR)
  console.log("🎯 Testing modular AG-UI application")
})
