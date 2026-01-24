import http from "http"
import https from "https"

// MCP Bridge Server for AG-UI
// Bridges MCP requests to OpenCode A2A API

const PORT = 5000
const HOST = "127.0.0.1"
const OPENCODE_URL = "http://localhost:3001"

console.log("🚀 Starting MCP Bridge Server...")
console.log(`   Bridge: http://${HOST}:${PORT}/mcp/*`)
console.log(`   OpenCode: ${OPENCODE_URL}`)

const server = http.createServer(async (req, res) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`)

  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")

  if (req.method === "OPTIONS") {
    res.writeHead(200)
    res.end()
    return
  }

  // Handle MCP requests
  if (req.url.startsWith("/mcp/")) {
    const pathParts = req.url.split("/")
    const serverName = pathParts[2] // /mcp/{serverName}/call

    if (req.url.includes("/call") && req.method === "POST") {
      // Handle tool calls
      let body = ""
      req.on("data", (chunk) => {
        body += chunk.toString()
      })

      req.on("end", async () => {
        try {
          const mcpRequest = JSON.parse(body)

          // Map MCP server names to A2A tool names
          const toolMapping = {
            context7: "context7_query-docs",
            websearch: "web_search_exa",
            grep_app: "grep_app",
          }

          const toolName = toolMapping[serverName] || serverName

          // Convert MCP request to A2A format
          const a2aRequest = {
            toolName: toolName,
            arguments: mcpRequest.arguments || {},
          }

          console.log(`🔄 Bridging MCP call: ${serverName} -> ${toolName}`)

          // Forward to OpenCode A2A API
          const response = await fetch(`${OPENCODE_URL}/a2a/invoke`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(a2aRequest),
          })

          const result = await response.json()

          // Convert A2A response back to MCP format
          const mcpResponse = {
            result: result.result || result,
            success: true,
          }

          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(JSON.stringify(mcpResponse))
        } catch (error) {
          console.error("MCP bridge error:", error)
          res.writeHead(500, { "Content-Type": "application/json" })
          res.end(
            JSON.stringify({
              error: "Bridge service error",
              message: error.message,
            }),
          )
        }
      })
    } else if (req.method === "GET") {
      // Handle server info requests
      const serverInfo = {
        name: serverName,
        status: "connected",
        version: "1.0.0",
        tools: getServerTools(serverName),
      }

      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify(serverInfo))
    } else {
      res.writeHead(404, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ error: "Not found" }))
    }
  } else if (req.url === "/mcp" || req.url === "/") {
    // Handle main MCP status
    const status = {
      servers: [
        {
          name: "context7",
          status: "connected",
          version: "1.0.0",
          tools: getServerTools("context7"),
        },
        {
          name: "websearch",
          status: "connected",
          version: "1.0.0",
          tools: getServerTools("websearch"),
        },
        {
          name: "grep_app",
          status: "connected",
          version: "1.0.0",
          tools: getServerTools("grep_app"),
        },
      ],
      status: "available",
      message: "MCP bridge server running",
    }

    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify(status))
  } else {
    res.writeHead(404, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ error: "Not found" }))
  }
})

function getServerTools(serverName) {
  const toolDefinitions = {
    context7: [
      {
        name: "context7_query-docs",
        description: "Query documentation for libraries and frameworks",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            libraryId: { type: "string" },
          },
          required: ["query"],
        },
      },
    ],
    websearch: [
      {
        name: "web_search_exa",
        description: "Search the web using Exa AI",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            numResults: { type: "number", default: 8 },
          },
          required: ["query"],
        },
      },
    ],
    grep_app: [
      {
        name: "grep_app",
        description: "Search code across GitHub repositories",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            include: { type: "string" },
          },
          required: ["query"],
        },
      },
    ],
  }

  return toolDefinitions[serverName] || []
}

server.listen(PORT, HOST, () => {
  console.log(`✅ MCP Bridge Server running at http://${HOST}:${PORT}`)
  console.log("   Bridged servers: context7, websearch, grep_app")
})
