const http = require('http')
const { WebSocketServer } = require('ws')

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }

  if (req.url === '/mcp') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      servers: [
        { name: 'context7', status: 'connected', tools: 15 },
        { name: 'websearch', status: 'connected', tools: 8 },
        { name: 'grep_app', status: 'connected', tools: 3 }
      ]
    }))
    return
  }

  res.writeHead(404)
  res.end('Not Found')
})

const wss = new WebSocketServer({ 
  server,
  path: '/ag-ui/ws'
})

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString())
      
      if (message.method === 'authenticate') {
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          result: { authenticated: true, sessionId: 'test-session' },
          id: message.id
        }))
        return
      }
      
      if (message.method === 'agent.message') {
        ws.send(JSON.stringify({
          id: 'thinking_' + Date.now(),
          type: 'agent.thinking',
          timestamp: Date.now(),
          data: {},
          metadata: { sessionId: 'test-session', userId: 'dev-user', agentId: 'default' }
        }))
        
        setTimeout(() => {
          ws.send(JSON.stringify({
            id: 'response_' + Date.now(),
            type: 'agent.message',
            timestamp: Date.now(),
            data: {
              content: 'Test response to: ' + message.params.content,
              role: 'assistant'
            },
            metadata: { sessionId: 'test-session', userId: 'dev-user', agentId: 'default' }
          }))
        }, 1000)
        return
      }
    } catch (error) {
      console.error('Error processing message:', error)
    }
  })
})

server.listen(5000, () => {
  console.log('Test server running on http://localhost:5000')
})
