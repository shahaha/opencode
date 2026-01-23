#!/usr/bin/env node
import http from "http"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = 9100
const HOST = "100.94.136.15"
const HTML_FILE = path.join(__dirname, "production-agui-chat.html")

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
    let fileToServe = HTML_FILE
    if (req.url === "/" || req.url === "/production-agui-chat.html") {
      fileToServe = HTML_FILE
    } else if (req.url.startsWith("/production-agui-chat.html")) {
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" })
      res.end("Not Found")
      return
    }

    const content = fs.readFileSync(fileToServe, "utf8")
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
})

server.listen(PORT, HOST, () => {
  console.log("🚀 Production AG-UI Chat server running at:")
  console.log(`   Local: http://localhost:${PORT}/`)
  console.log(`   External: http://${HOST}:${PORT}/`)
  console.log(`   External File: http://${HOST}:${PORT}/production-agui-chat.html`)
  console.log("")
  console.log("🎯 修復已應用！現在可以訪問:")
  console.log("   http://100.94.136.15:9100/production-agui-chat.html")
  console.log("")
  console.log("✅ 修復特性:")
  console.log("   - CORS 錯誤已修復")
  console.log("   - 重複渲染問題已解決")
  console.log("   - WebSocket 支持已添加")
  console.log("")
  console.log("🛠️ 服務器日誌:")
})
