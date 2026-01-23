#!/usr/bin/env node

const http = require("http")
const fs = require("fs")
const path = require("path")

console.log("🚀 Integrated AG-UI Chat server starting...")

const server = http.createServer((req, res) => {
  // Handle preflight OPTIONS request
  if (req.method === "OPTIONS") {
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400", // 24 hours
    })
    res.end()
    return
  }

  try {
    if (req.url === "/" || req.url === "/production-agui-chat-integrated.html") {
      const html = fs.readFileSync(path.join(__dirname, "production-agui-chat-integrated.html"), "utf8")
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      })
      res.end(html)
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" })
      res.end("Not Found")
    }
  } catch (err) {
    console.error("Server error:", err)
    res.writeHead(500, { "Content-Type": "text/plain" })
    res.end("Internal Server Error")
  }
})

const PORT = process.env.PORT || 9100

server.listen(PORT, "0.0.0.0", () => {
  console.log("🌐 Integrated AG-UI Chat running at:")
  console.log(`   Local: http://localhost:${PORT}`)
  console.log(`   Network: http://100.94.136.15:${PORT}`)
  console.log("")
  console.log("✅ 修復內容:")
  console.log("   - 解決了重複渲染問題")
  console.log("   - 解決了 CORS 錯誤")
  console.log("   - 整合了完整的聊天界面")
  console.log("   - 包含設置面板和 MCP 狀態")
  console.log("")
  console.log("🧪 測試說明:")
  console.log("   1. 多次點擊設置按鈕")
  console.log("   2. 檢查 workspace 列表")
  console.log("   3. 空證聊天功能")
  console.log("   4. 確認 MCP 狀態正確載入")
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
