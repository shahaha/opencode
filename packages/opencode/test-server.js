#!/usr/bin/env node
console.log("🚀 啟動 AG-UI 測試伺服器...")

const http = require("http")
const fs = require("fs")
const path = require("path")

const PORT = 8080
const PUBLIC_DIR = path.join(__dirname, "public")

const server = http.createServer((req, res) => {
  console.log(`📝 請求: ${req.method} ${req.url}`)

  if (req.url === "/") {
    try {
      const html = fs.readFileSync(path.join(PUBLIC_DIR, "index.html"), "utf8")
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache",
      })
      res.end(html)
      console.log("✅ 成功回應主頁")
    } catch (error) {
      console.error("❌ 讀取 HTML 錯誤:", error.message)
      res.writeHead(500)
      res.end("500 Internal Server Error")
    }
  } else {
    res.writeHead(404)
    res.end("404 Not Found")
  }
})

server.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 AG-UI 測試伺服器啟動成功！")
  console.log("")
  console.log("🌐 存取網址:")
  console.log(`   本地: http://localhost:${PORT}/`)
  console.log(`   外部: http://100.94.136.15:${PORT}/`)
  console.log("")
  console.log("🔍 伺服器狀態:")
  console.log("   • 端口 8080 正常監聽")
  console.log("   • 綁定所有網路介面 (0.0.0.0)")
  console.log("   • 可接受外部連線")
  console.log("")
  console.log("🎯 現在可以測試連線性")
})
