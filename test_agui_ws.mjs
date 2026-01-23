#!/usr/bin/env node

// Test WebSocket connection to AG-UI
import WebSocket from "ws"

const wsUrl = "ws://127.0.0.1:5000/ag-ui/ws"
console.log("Testing connection to:", wsUrl)

const ws = new WebSocket(wsUrl)

ws.on("open", function open() {
  console.log("✅ WebSocket connected successfully!")
  ws.send(
    JSON.stringify({
      jsonrpc: "2.0",
      method: "authenticate",
      params: { sessionId: "test-session", token: "test-token" },
      id: 1,
    }),
  )
})

ws.on("message", function message(data) {
  console.log("📨 Received:", data.toString())
})

ws.on("error", function error(err) {
  console.log("❌ WebSocket error:", err.message)
  process.exit(1)
})

ws.on("close", function close(code, reason) {
  console.log("🔌 WebSocket closed:", code, reason.toString())
  process.exit(0)
})

// Timeout after 10 seconds
setTimeout(() => {
  console.log("⏰ Connection timeout")
  ws.close()
  process.exit(1)
}, 10000)
