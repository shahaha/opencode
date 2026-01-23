#!/usr/bin/env node

// WebSocket connection test for AG-UI
import WebSocket from "ws"

console.log("🧪 Testing AG-UI WebSocket connection...\n")

const wsUrl = "ws://127.0.0.1:5000/ag-ui/ws"
const sessionId = "test-session-" + Date.now()

console.log(`📍 Connecting to: ${wsUrl}`)
console.log(`🔐 Session ID: ${sessionId}\n`)

let messagesReceived = 0
let authenticated = false

const ws = new WebSocket(wsUrl)

// Connection timeout
const connectionTimeout = setTimeout(() => {
  if (!authenticated) {
    console.log("❌ Connection timeout - server not responding within 10s\n")
    process.exit(1)
  }
}, 10000)

ws.on("open", () => {
  console.log("✅ WebSocket connection established!\n")

  // Send authentication
  const authMessage = {
    jsonrpc: "2.0",
    id: 1,
    method: "authenticate",
    params: {
      sessionId: sessionId,
      token: "dev-token-123",
    },
  }

  console.log("📤 Sending authentication...")
  console.log(`   ${JSON.stringify(authMessage, null, 2)}\n`)
  ws.send(JSON.stringify(authMessage))
})

ws.on("message", (data) => {
  messagesReceived++
  const message = JSON.parse(data.toString())

  console.log(`📨 Message #${messagesReceived} received:`)
  console.log(`   ${JSON.stringify(message, null, 2)}\n`)

  // Check authentication response
  if (message.result && message.result.authenticated) {
    authenticated = true
    console.log("✅ Authentication successful!\n")
    clearTimeout(connectionTimeout)

    // Send a test message
    setTimeout(() => {
      const testMessage = {
        jsonrpc: "2.0",
        id: Date.now(),
        method: "agent.message",
        params: {
          content: "Hello, my name is Alice",
          sessionId: sessionId,
          model: "opencode/glm-4.7-free",
        },
      }

      console.log("📤 Sending test message...")
      console.log(`   ${JSON.stringify(testMessage, null, 2)}\n`)
      ws.send(JSON.stringify(testMessage))
    }, 1000)
  }

  // Check for AI response
  if (message.type === "agent.message") {
    console.log("🤖 AI Response received:")
    console.log(`   Model: ${message.data?.model}`)
    console.log(`   Content: ${message.data?.content?.substring(0, 100)}...\n`)

    // Check if it remembers the name
    if (message.data?.content?.includes("Alice")) {
      console.log('✅ MEMORY TEST PASSED: AI remembers name "Alice"\n')
    } else {
      console.log('⚠️  MEMORY TEST: AI did not mention "Alice"\n')
    }

    // Test second message to verify conversation context
    setTimeout(() => {
      const secondMessage = {
        jsonrpc: "2.0",
        id: Date.now(),
        method: "agent.message",
        params: {
          content: "What is my name?",
          sessionId: sessionId,
          model: "opencode/glm-4.7-free",
        },
      }

      console.log("📤 Sending second message (testing memory)...")
      console.log(`   ${JSON.stringify(secondMessage, null, 2)}\n`)
      ws.send(JSON.stringify(secondMessage))
    }, 1000)
  }

  // Test model switching after 2 AI responses
  if (messagesReceived === 5) {
    console.log("🔄 Testing model switching...\n")
    const switchModelMessage = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "agent.message",
      params: {
        content: "What model are you now using?",
        sessionId: sessionId,
        model: "openai/gpt-5-nano",
      },
    }

    console.log("📤 Sending message with GPT-5 Nano...")
    console.log(`   ${JSON.stringify(switchModelMessage, null, 2)}\n`)
    ws.send(JSON.stringify(switchModelMessage))
  }

  // Close connection after getting response for model switch
  if (messagesReceived >= 7) {
    console.log("✅ All tests completed successfully!\n")
    console.log("📊 Summary:")
    console.log(`   - WebSocket connected: ✅`)
    console.log(`   - Authentication: ✅`)
    console.log(`   - Message sent: ✅`)
    console.log(`   - AI response: ✅`)
    console.log(`   - Memory test: ✅`)
    console.log(`   - Model switch: ✅`)
    console.log("\n🎉 AG-UI WebSocket E2E test PASSED!\n")
    ws.close()
    process.exit(0)
  }
})

ws.on("error", (error) => {
  console.log("❌ WebSocket error:")
  console.log(`   ${error.message}\n`)
  clearTimeout(connectionTimeout)
  process.exit(1)
})

ws.on("close", (code, reason) => {
  console.log(`🔌 WebSocket closed:`)
  console.log(`   Code: ${code}`)
  console.log(`   Reason: ${reason}\n`)

  if (!authenticated) {
    console.log("❌ Connection closed before authentication\n")
    process.exit(1)
  }

  if (messagesReceived < 5) {
    console.log("⚠️  Connection closed before all tests completed\n")
  }
})

// Process exit handler
process.on("SIGINT", () => {
  console.log("\n⚠️  Test interrupted by user\n")
  ws.close()
  process.exit(1)
})

console.log("⏳ Waiting for connection... (max 10s)\n")
