#!/usr/bin/env node

/**
 * Browser WebSocket Simulation Test
 * Simulates exactly what the browser frontend does
 */

const WebSocket = require("ws")

function simulateBrowserConnection() {
  console.log("🔍 Simulating browser WebSocket connection...")
  console.log("🌐 Connecting to: ws://192.168.0.221:4000/ag-ui/ws")
  console.log("📝 Session ID: test-session")
  console.log("")

  const ws = new WebSocket("ws://192.168.0.221:4000/ag-ui/ws")

  ws.on("open", () => {
    console.log("✅ Browser WebSocket connected")
    console.log("🔐 Sending authentication...")

    // Send authentication exactly like the browser does
    const authMessage = {
      jsonrpc: "2.0",
      id: 1,
      method: "authenticate",
      params: {
        sessionId: "test-session", // Same as browser URL
        token: "dev-token-123",
      },
    }

    console.log("📤 Auth payload:", JSON.stringify(authMessage, null, 2))
    ws.send(JSON.stringify(authMessage))
  })

  ws.on("message", (data) => {
    const message = JSON.parse(data.toString())
    console.log("📨 Browser received:", JSON.stringify(message, null, 2))

    // Check for authentication success
    if (message.result?.authenticated) {
      console.log("🎉 Browser authentication successful!")
      console.log("💬 Browser would now send 'hello' message...")

      // Simulate sending the "hello" message like the browser does
      setTimeout(() => {
        const helloMessage = {
          jsonrpc: "2.0",
          id: 2,
          method: "agent.message",
          params: {
            content: "hello",
            sessionId: "test-session",
          },
        }

        console.log("📤 Browser sending 'hello':", JSON.stringify(helloMessage, null, 2))
        ws.send(JSON.stringify(helloMessage))
      }, 1000)
    }

    // Check for AI response
    if (message.type === "agent.message" && message.data?.content) {
      console.log("🤖 Browser received AI response!")
      console.log("📝 Content preview:", message.data.content.substring(0, 100) + "...")

      console.log("✅ Browser simulation successful!")
      console.log("💡 If browser doesn't show this, check:")
      console.log("   1. Browser console for WebSocket errors")
      console.log("   2. Network tab for WebSocket connection")
      console.log("   3. Session ID mismatch")

      ws.close()
    }

    // Check for thinking indicator
    if (message.type === "agent.thinking") {
      console.log("🧠 Browser received thinking indicator")
    }
  })

  ws.on("error", (error) => {
    console.error("❌ Browser WebSocket error:", error.message)
  })

  ws.on("close", (code, reason) => {
    console.log(`🔌 Browser WebSocket closed (code: ${code})`)
  })

  // Timeout after 15 seconds
  setTimeout(() => {
    console.log("⏰ Browser simulation timeout")
    ws.close()
  }, 15000)
}

simulateBrowserConnection()
