const WebSocket = require("ws")
const http = require("http")
const fs = require("fs")
const path = require("path")

const dataDir = path.join(__dirname, "data")
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const sessionsFile = path.join(dataDir, "sessions.json")
const messagesFile = path.join(dataDir, "messages.json")

function loadSessions() {
  try {
    return JSON.parse(fs.readFileSync(sessionsFile, "utf-8"))
  } catch {
    return {}
  }
}

function saveSessions(sessions) {
  fs.writeFileSync(sessionsFile, JSON.stringify(sessions, null, 2))
}

function loadMessages() {
  try {
    return JSON.parse(fs.readFileSync(messagesFile, "utf-8"))
  } catch {
    return []
  }
}

function saveMessages(messages) {
  fs.writeFileSync(messagesFile, JSON.stringify(messages, null, 2))
}

const sessions = loadSessions()
const messages = loadMessages()

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")

  if (req.method === "OPTIONS") {
    res.writeHead(200)
    res.end()
    return
  }

  if (req.url === "/mcp" || req.url === "/ag-ui/mcp/status" || req.url === "/mcp/status") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(
      JSON.stringify({
        servers: [
          {
            name: "context7",
            status: "connected",
            authenticated: true,
            tools: 15,
            lastChecked: Date.now(),
          },
          {
            name: "websearch",
            status: "connected",
            authenticated: true,
            tools: 8,
            lastChecked: Date.now(),
          },
          {
            name: "grep_app",
            status: "connected",
            authenticated: true,
            tools: 12,
            lastChecked: Date.now(),
          },
        ],
      }),
    )
  } else if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ status: "ok", timestamp: Date.now() }))
  } else if (req.url.startsWith("/sessions")) {
    if (req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify(sessions))
    } else if (req.method === "POST") {
      let body = ""
      req.on("data", (chunk) => {
        body += chunk
      })
      req.on("end", () => {
        const session = JSON.parse(body)
        sessions[session.id] = session
        saveSessions(sessions)
        res.writeHead(201, { "Content-Type": "application/json" })
        res.end(JSON.stringify(session))
      })
    }
  } else if (req.url.startsWith("/messages")) {
    if (req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify(messages))
    } else if (req.method === "POST") {
      let body = ""
      req.on("data", (chunk) => {
        body += chunk
      })
      req.on("end", () => {
        const msg = JSON.parse(body)
        msg.id = msg.id || Date.now().toString()
        msg.timestamp = Date.now()
        messages.push(msg)
        saveMessages(messages)
        res.writeHead(201, { "Content-Type": "application/json" })
        res.end(JSON.stringify(msg))
      })
    }
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
            type: "content",
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
