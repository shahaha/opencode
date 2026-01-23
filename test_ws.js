// Test WebSocket connection to AG-UI
const WebSocket = require("ws")

const wsUrl = "ws://127.0.0.1:3000/ag-ui/ws"
console.log("Connecting to:", wsUrl)

const ws = new WebSocket(wsUrl)

ws.on("open", function open() {
  console.log("✅ WebSocket connected")
  ws.close()
  process.exit(0)
})

ws.on("error", function error(err) {
  console.log("❌ WebSocket error:", err.message)
  process.exit(1)
})

ws.on("close", function close(code, reason) {
  console.log("WebSocket closed:", code, reason.toString())
})

// Timeout after 5 seconds
setTimeout(() => {
  console.log("❌ Connection timeout")
  ws.close()
  process.exit(1)
}, 5000)
