const WebSocket = require("ws")
const http = require("http")

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")

  if (req.method === "OPTIONS") {
    res.writeHead(200)
    res.end()
    return
  }

  if (req.url === "/mcp") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(
      JSON.stringify({
        servers: [
          {
            name: "context7",
            status: "connected",
            authenticated: true,
            tools: 15,
          },
          {
            name: "websearch",
            status: "connected",
            authenticated: true,
            tools: 8,
          },
          {
            name: "grep_app",
            status: "connected",
            authenticated: true,
            tools: 12,
          },
        ],
      }),
    )
  } else if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ status: "ok", timestamp: Date.now() }))
  } else {
    res.writeHead(404)
    res.end()
  }
})

const wss = new WebSocket.Server({ server })

wss.on("connection", (ws) => {
  console.log("WebSocket client connected")

  ws.send(
    JSON.stringify({
      type: "connection",
      status: "connected",
      timestamp: Date.now(),
    }),
  )

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message)
      console.log("Received:", data)

      if (data.type === "message") {
        ws.send(
          JSON.stringify({
            type: "response",
            id: data.id,
            content: `Mock response to: ${data.content}`,
            timestamp: Date.now(),
            agent: "mock-agent",
          }),
        )
      }
    } catch (error) {
      console.error("Error parsing message:", error)
    }
  })

  ws.on("close", () => {
    console.log("WebSocket client disconnected")
  })

  ws.on("error", (error) => {
    console.error("WebSocket error:", error)
  })
})

const PORT = 5000
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Mock AG-UI server running on port ${PORT}`)
  console.log(`WebSocket: ws://localhost:${PORT}/ag-ui/ws`)
  console.log(`HTTP API: http://localhost:${PORT}`)
})
