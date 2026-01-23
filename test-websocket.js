import WebSocket from "ws"

function testWebSocket() {
  console.log("Testing WebSocket connection to backend...")

  const ws = new WebSocket("ws://192.168.0.221:4000/ag-ui/ws")

  ws.onopen = () => {
    console.log("✅ WebSocket connection opened")

    // Send authentication message
    const authMessage = {
      jsonrpc: "2.0",
      id: 1,
      method: "authenticate",
      params: {
        sessionId: "test-session",
        token: "dev-token-123",
      },
    }

    console.log("Sending authentication:", JSON.stringify(authMessage, null, 2))
    ws.send(JSON.stringify(authMessage))
  }

  ws.onmessage = (event) => {
    console.log("📨 Received message:", event.data)
    try {
      const data = JSON.parse(event.data)
      console.log("Parsed message:", JSON.stringify(data, null, 2))

      // Check for authentication success
      if (data.result && data.result.authenticated) {
        console.log("🎉 Authentication successful!")

        // Send a test message after authentication
        setTimeout(() => {
          const testMessage = {
            jsonrpc: "2.0",
            id: 2,
            method: "agent.message",
            params: {
              content: "Hello from automated test",
              sessionId: "test-session",
            },
          }

          console.log("📤 Sending test message:", JSON.stringify(testMessage, null, 2))
          ws.send(JSON.stringify(testMessage))
        }, 1000)
      }

      // Check for AI response
      if (data.type === "agent.message" && data.data?.content) {
        console.log("🤖 AI Response received:", data.data.content)
        console.log("✅ Full test successful - AI is responding!")

        // Clear the test timeout and close connection after receiving response
        clearTimeout(testTimeout)
        setTimeout(() => {
          console.log("🛑 Closing connection after successful test")
          ws.close()
        }, 1000)
      }

      // Check for thinking status
      if (data.type === "agent.thinking") {
        console.log("🧠 Agent is thinking...")
      }

      // Check for errors
      if (data.type === "agent.error") {
        console.log("🚨 Agent error:", data.data?.error)
      }
    } catch (e) {
      console.log("Raw message:", event.data)
    }
  }

  ws.onclose = (event) => {
    console.log("❌ WebSocket connection closed:", event.code, event.reason)
  }

  ws.onerror = (error) => {
    console.log("🚨 WebSocket error:", error)
  }

  // Set a timeout for the entire test (increased for AI response)
  const testTimeout = setTimeout(() => {
    console.log("❌ Test timeout - no AI response received within 30 seconds")
    ws.close()
  }, 30000)

  // Don't close automatically - let the response handler close the connection
}

testWebSocket()
