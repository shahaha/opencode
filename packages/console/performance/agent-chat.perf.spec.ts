// packages/console/performance/agent-chat.perf.spec.ts
import { test, expect } from "@playwright/test"

test.describe("Agent Chat Performance", () => {
  // Performance thresholds
  const THRESHOLDS = {
    pageLoad: 2000, // 2 seconds
    firstPaint: 1000, // 1 second
    messageSend: 200, // 200ms
    messageReceive: 500, // 500ms
    typingLatency: 50, // 50ms
    memoryUsage: 50 * 1024 * 1024, // 50MB
  }

  test("should load page within performance budget", async ({ page }) => {
    const startTime = Date.now()

    // Navigate to the page
    await page.goto("/agent-chat/perf-test-session")

    // Wait for the page to be fully loaded
    await page.waitForSelector('[data-testid="agent-chat"]')

    const loadTime = Date.now() - startTime

    // Check load time
    expect(loadTime).toBeLessThan(THRESHOLDS.pageLoad)

    // Log performance metrics
    console.log(`Page load time: ${loadTime}ms`)
  })

  test("should render messages efficiently", async ({ page }) => {
    await page.goto("/agent-chat/perf-test-session")

    const startTime = Date.now()

    // Simulate receiving multiple messages quickly
    for (let i = 0; i < 10; i++) {
      await page.evaluate((msg) => {
        // Simulate adding a message to the DOM
        const event = new CustomEvent("agui.message", {
          detail: {
            id: `msg-${Date.now()}`,
            content: msg,
            role: "assistant",
            timestamp: Date.now(),
          },
        })
        window.dispatchEvent(event)
      }, `Performance test message ${i}`)

      // Small delay to simulate realistic timing
      await page.waitForTimeout(10)
    }

    const renderTime = Date.now() - startTime
    const averageTime = renderTime / 10

    console.log(`Average message render time: ${averageTime}ms`)
    expect(averageTime).toBeLessThan(THRESHOLDS.messageReceive)
  })

  test("should handle typing latency", async ({ page }) => {
    await page.goto("/agent-chat/perf-test-session")

    const input = page.locator('[data-testid="message-input"]')

    // Measure typing performance
    const startTime = Date.now()

    await input.type("This is a performance test message with realistic typing speed", { delay: 50 })

    const typingTime = Date.now() - startTime
    const expectedTime = "This is a performance test message with realistic typing speed".length * 50

    console.log(`Actual typing time: ${typingTime}ms, Expected: ${expectedTime}ms`)

    // Allow some variance for system performance
    expect(typingTime).toBeLessThan(expectedTime * 1.5)
  })

  test("should maintain performance with large conversation", async ({ page }) => {
    await page.goto("/agent-chat/perf-test-session")

    // Build up a large conversation
    for (let i = 0; i < 50; i++) {
      await page.evaluate(
        (msg) => {
          const event = new CustomEvent("agui.message", {
            detail: {
              id: `msg-${Date.now()}-${i}`,
              content: msg,
              role: i % 2 === 0 ? "user" : "assistant",
              timestamp: Date.now(),
            },
          })
          window.dispatchEvent(event)
        },
        `Message ${i}: ${"x".repeat(100)}`,
      ) // 100 char messages
    }

    // Wait for rendering to complete
    await page.waitForTimeout(1000)

    // Measure scroll performance
    const scrollStart = Date.now()
    await page.locator('[data-testid="message-list"]').evaluate((list) => {
      list.scrollTop = list.scrollHeight
    })
    const scrollTime = Date.now() - scrollStart

    console.log(`Scroll time for 50 messages: ${scrollTime}ms`)
    expect(scrollTime).toBeLessThan(100) // 100ms for scroll
  })

  test("should handle rapid message sending", async ({ page }) => {
    await page.goto("/agent-chat/perf-test-session")

    const input = page.locator('[data-testid="message-input"]')
    const sendButton = page.locator('[data-testid="send-button"]')

    const messageTimes: number[] = []

    // Send 10 messages rapidly
    for (let i = 0; i < 10; i++) {
      const sendStart = Date.now()

      await input.fill(`Rapid message ${i}`)
      await sendButton.click()

      // Wait for the message to be processed (simulated)
      await page.waitForTimeout(50)

      const sendTime = Date.now() - sendStart
      messageTimes.push(sendTime)
    }

    const averageSendTime = messageTimes.reduce((a, b) => a + b, 0) / messageTimes.length
    const maxSendTime = Math.max(...messageTimes)

    console.log(`Average send time: ${averageSendTime}ms`)
    console.log(`Max send time: ${maxSendTime}ms`)

    expect(averageSendTime).toBeLessThan(THRESHOLDS.messageSend)
    expect(maxSendTime).toBeLessThan(THRESHOLDS.messageSend * 2)
  })

  test("should monitor memory usage", async ({ page }) => {
    await page.goto("/agent-chat/perf-test-session")

    // Get initial memory usage
    const initialMemory = await page.evaluate(() => {
      // @ts-ignore - performance.memory is not in types
      return performance.memory?.usedJSHeapSize || 0
    })

    // Perform memory-intensive operations
    for (let i = 0; i < 100; i++) {
      await page.evaluate((msg) => {
        const event = new CustomEvent("agui.message", {
          detail: {
            id: `msg-${Date.now()}-${i}`,
            content: msg,
            role: "assistant",
            timestamp: Date.now(),
          },
        })
        window.dispatchEvent(event)
      }, `Memory test message ${i} with some extra content to consume memory`.repeat(10))
    }

    // Force garbage collection if available
    await page.evaluate(() => {
      // @ts-ignore
      if (window.gc) window.gc()
    })

    await page.waitForTimeout(1000)

    // Check final memory usage
    const finalMemory = await page.evaluate(() => {
      // @ts-ignore
      return performance.memory?.usedJSHeapSize || 0
    })

    const memoryIncrease = finalMemory - initialMemory

    console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`)

    // Allow reasonable memory increase for 100 messages
    expect(memoryIncrease).toBeLessThan(THRESHOLDS.memoryUsage)
  })

  test("should handle WebSocket reconnection efficiently", async ({ page }) => {
    await page.goto("/agent-chat/perf-test-session")

    // Monitor reconnection time
    const reconnectStart = Date.now()

    // Simulate connection loss and recovery
    await page.evaluate(() => {
      // Disconnect WebSocket
      const event = new CustomEvent("agui.disconnected")
      window.dispatchEvent(event)

      // Simulate reconnection after delay
      setTimeout(() => {
        const event = new CustomEvent("agui.connected")
        window.dispatchEvent(event)
      }, 100)
    })

    // Wait for reconnection to complete
    await page.waitForSelector('[data-testid="connection-status"]:has-text("Connected")')

    const reconnectTime = Date.now() - reconnectStart

    console.log(`Reconnection time: ${reconnectTime}ms`)
    expect(reconnectTime).toBeLessThan(500) // 500ms for reconnection
  })

  test("should maintain performance under load", async ({ page, browser }) => {
    // Open multiple tabs to simulate load
    const pages = [page]

    for (let i = 0; i < 4; i++) {
      const newPage = await browser.newPage()
      await newPage.goto("/agent-chat/perf-test-session")
      pages.push(newPage)
    }

    // Measure performance across all tabs
    const startTime = Date.now()

    // Perform operations on all tabs simultaneously
    const operations = pages.map(async (p, index) => {
      const input = p.locator('[data-testid="message-input"]')
      await input.fill(`Load test message ${index}`)
      await p.locator('[data-testid="send-button"]').click()
    })

    await Promise.all(operations)

    const operationTime = Date.now() - startTime
    const averageTime = operationTime / pages.length

    console.log(`Load test - Total time: ${operationTime}ms, Average: ${averageTime}ms`)

    // Cleanup
    for (const p of pages.slice(1)) {
      await p.close()
    }

    expect(averageTime).toBeLessThan(THRESHOLDS.messageSend * 2)
  })
})
