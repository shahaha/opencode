const WebSocket = require("ws")
const https = require("https")
const http = require("http")
const fs = require("fs")
const path = require("path")
const jwt = require("jsonwebtoken")
const crypto = require("crypto")
const { Logger, Metrics } = require("./monitoring.cjs")

const logger = new Logger("ag-ui-server")
const metrics = new Metrics()

const dataDir = path.join(__dirname, "data")
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const useSSL = process.env.USE_SSL === "true"
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production"
const usersFile = path.join(dataDir, "users.json")
const sessionsFile = path.join(dataDir, "sessions.json")
const messagesFile = path.join(dataDir, "messages.json")

function loadUsers() {
  try {
    return JSON.parse(fs.readFileSync(usersFile, "utf-8"))
  } catch {
    return {
      admin: {
        id: "admin",
        username: "admin",
        password: hashPassword("admin123"),
        role: "admin",
        created: Date.now(),
      },
    }
  }
}

function saveUsers(users) {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2))
}

function hashPassword(pwd) {
  return crypto.createHash("sha256").update(pwd).digest("hex")
}

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

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET)
  } catch {
    return null
  }
}

function generateToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, {
    expiresIn: "24h",
  })
}

const users = loadUsers()
saveUsers(users)
const sessions = loadSessions()
const messages = loadMessages()

const requestHandler = (req, res) => {
  metrics.recordRequest()
  
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("X-Frame-Options", "DENY")

  logger.debug(`${req.method} ${req.url}`)

  if (req.method === "OPTIONS") {
    res.writeHead(200)
    res.end()
    return
  }

  const authHeader = req.headers.authorization
  const token = authHeader ? authHeader.replace("Bearer ", "") : null
  const user = token ? verifyToken(token) : null

  if (req.url === "/metrics" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify(metrics.getStats()))
  } else if (req.url === "/auth/register" && req.method === "POST") {
    let body = ""
    req.on("data", (chunk) => {
      body += chunk
    })
    req.on("end", () => {
      const { username, password } = JSON.parse(body)
      if (users[username]) {
        metrics.recordError()
        logger.warn(`Registration failed: user ${username} already exists`)
        res.writeHead(400, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "User already exists" }))
        return
      }
      const newUser = {
        id: crypto.randomUUID(),
        username,
        password: hashPassword(password),
        role: "user",
        created: Date.now(),
      }
      users[username] = newUser
      saveUsers(users)
      const token = generateToken(newUser)
      logger.info(`User registered: ${username}`)
      res.writeHead(201, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ token, user: { id: newUser.id, username: newUser.username } }))
    })
  } else if (req.url === "/auth/login" && req.method === "POST") {
    let body = ""
    req.on("data", (chunk) => {
      body += chunk
    })
    req.on("end", () => {
      const { username, password } = JSON.parse(body)
      const user = users[username]
      if (!user || user.password !== hashPassword(password)) {
        metrics.recordError()
        logger.warn(`Login failed: invalid credentials for ${username}`)
        res.writeHead(401, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "Invalid credentials" }))
        return
      }
      const token = generateToken(user)
      logger.info(`User logged in: ${username}`)
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ token, user: { id: user.id, username: user.username } }))
    })
  } else if (req.url === "/auth/verify" && req.method === "POST") {
    if (!user) {
      metrics.recordError()
      res.writeHead(401)
      res.end()
      return
    }
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ valid: true, user }))
  } else if (
    req.url === "/mcp" ||
    req.url === "/ag-ui/mcp/status" ||
    req.url === "/mcp/status"
  ) {
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
    if (!user) {
      metrics.recordError()
      res.writeHead(401)
      res.end()
      return
    }
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
        session.userId = user.id
        session.created = Date.now()
        sessions[session.id] = session
        saveSessions(sessions)
        logger.info(`Session created: ${session.id} for user ${user.username}`)
        res.writeHead(201, { "Content-Type": "application/json" })
        res.end(JSON.stringify(session))
      })
    }
  } else if (req.url.startsWith("/messages")) {
    if (!user) {
      metrics.recordError()
      res.writeHead(401)
      res.end()
      return
    }
    if (req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify(messages.filter((m) => m.userId === user.id)))
    } else if (req.method === "POST") {
      let body = ""
      req.on("data", (chunk) => {
        body += chunk
      })
      req.on("end", () => {
        const msg = JSON.parse(body)
        msg.id = msg.id || Date.now().toString()
        msg.userId = user.id
        msg.timestamp = Date.now()
        messages.push(msg)
        saveMessages(messages)
        logger.debug(`Message created by ${user.username}`)
        res.writeHead(201, { "Content-Type": "application/json" })
        res.end(JSON.stringify(msg))
      })
    }
  } else {
    metrics.recordError()
    res.writeHead(404)
    res.end()
  }
}

const server = useSSL
  ? https.createServer(
      {
        key: fs.readFileSync(path.join(__dirname, "certs", "key.pem")),
        cert: fs.readFileSync(path.join(__dirname, "certs", "cert.pem")),
      },
      requestHandler,
    )
  : http.createServer(requestHandler)

const wss = new WebSocket.Server({ server })

wss.on("connection", (ws) => {
  metrics.recordWSConnection()
  logger.info(`WebSocket client connected (${metrics.wsConnections} active)`)

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
      logger.debug(`WebSocket message received`, { type: data.type })

      if (data.type === "message") {
        ws.send(
          JSON.stringify({
            type: "content",
            id: data.id,
            content: `Response: ${data.content}`,
            timestamp: Date.now(),
            agent: "ag-ui-agent",
          }),
        )
      }
    } catch (error) {
      metrics.recordError()
      logger.error(`WebSocket message error`, { error: error.message })
    }
  })

  ws.on("close", () => {
    metrics.recordWSDisconnection()
    logger.info(`WebSocket client disconnected (${metrics.wsConnections} active)`)
  })

  ws.on("error", (error) => {
    metrics.recordError()
    logger.error(`WebSocket error`, { error: error.message })
  })
})

const PORT = process.env.PORT || 5000
const PROTOCOL = useSSL ? "https" : "http"
server.listen(PORT, "0.0.0.0", () => {
  logger.info(`AG-UI server started on ${PROTOCOL}://localhost:${PORT}`)
  logger.info(`WebSocket: ${useSSL ? "wss" : "ws"}://localhost:${PORT}/ag-ui/ws`)
  logger.info(`Metrics available at /metrics`)
  logger.info(`Default user: admin / admin123`)
})
