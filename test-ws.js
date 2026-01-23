import WebSocket from "ws"

const ws = new WebSocket("ws://192.168.0.221:4000/ag-ui/ws")

ws.on("open", function open() {
  console.log("Connected to WebSocket")

  // Send authentication message
  const authMessage = {
    jsonrpc: "2.0",
    id: 1,
    method: "authenticate",
    params: {
      sessionId: "test-session-123",
      token: "dev-token-123",
    },
  }

  console.log("Sending auth message:", JSON.stringify(authMessage))
  ws.send(JSON.stringify(authMessage))
})

ws.on("message", function message(data) {
  console.log("Received:", data.toString())
})

ws.on("error", function error(err) {
  console.error("WebSocket error:", err)
})

ws.on("close", function close(code, reason) {
  console.log("WebSocket closed:", code, reason.toString())
})

setTimeout(() => {
  console.log("Closing connection after 5 seconds...")
  ws.close()
}, 5000)
