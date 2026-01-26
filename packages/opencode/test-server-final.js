#!/usr/bin/env node

const http = require("http")
const fs = require("fs")
const path = require("path")

const PORT = 8080
const PUBLIC_DIR = path.join(__dirname, "public")

const server = http.createServer((req, res) => {
  console.log(`Request: ${req.method} ${req.url}`)

  if (req.url === "/") {
    try {
      const html = fs.readFileSync(path.join(PUBLIC_DIR, "index.html"), "utf8")
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache",
      })
      res.end(html)
      console.log("Successfully served index.html")
    } catch (error) {
      console.error("Error reading file:", error.message)
      res.writeHead(500)
      res.end("500 Internal Server Error")
    }
  } else {
    res.writeHead(404)
    res.end("404 Not Found")
  }
})

server.listen(PORT, "0.0.0.0", () => {
  console.log("Test server started successfully!")
  console.log(`Local: http://localhost:${PORT}/`)
  console.log(`External: http://100.94.136.15:${PORT}/`)
  console.log("Server is listening on all interfaces")
})
