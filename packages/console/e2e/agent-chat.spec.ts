// packages/console/e2e/agent-chat.spec.ts
import { test, expect } from "@playwright/test"

test.describe("Agent Chat E2E", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the agent chat page
    await page.goto("/agent-chat/test-session-123")

    // Wait for the page to load
    await page.waitForSelector('[data-testid="agent-chat"]')
  })

  test("should load the agent chat interface", async ({ page }) => {
    // Check if the main chat container is present
    await expect(page.locator('[data-testid="agent-chat"]')).toBeVisible()

    // Check if the header is present
    await expect(page.locator("h1").filter({ hasText: "Agent Chat" })).toBeVisible()

    // Check if the back button is present
    await expect(page.locator("button").filter({ hasText: "← Back to Workspace" })).toBeVisible()
  })

  test("should show connection status", async ({ page }) => {
    // Check if status indicator is present
    const statusElement = page.locator('[data-testid="agent-status"]')
    await expect(statusElement).toBeVisible()

    // Should show either "Ready", "Connecting", or "Error"
    const statusText = await statusElement.textContent()
    expect(["Ready", "Connecting", "Error", "Thinking", "Responding"]).toContain(statusText)
  })

  test("should display message input", async ({ page }) => {
    // Check if message input is present
    const input = page.locator('[data-testid="message-input"]')
    await expect(input).toBeVisible()

    // Check placeholder text
    await expect(input).toHaveAttribute("placeholder", /Type your message|Connecting/)
  })

  test("should allow typing in message input", async ({ page }) => {
    const input = page.locator('[data-testid="message-input"]')

    // Type a message
    await input.fill("Hello, this is a test message")

    // Check if the value was set
    await expect(input).toHaveValue("Hello, this is a test message")
  })

  test("should send message when button is clicked", async ({ page }) => {
    const input = page.locator('[data-testid="message-input"]')
    const sendButton = page.locator('[data-testid="send-button"]')

    // Type and send a message
    await input.fill("Test message from E2E")
    await sendButton.click()

    // Check if the message appears in the chat
    await expect(
      page.locator('[data-testid="message"]').filter({
        hasText: "Test message from E2E",
      }),
    ).toBeVisible()
  })

  test("should send message with Enter key", async ({ page }) => {
    const input = page.locator('[data-testid="message-input"]')

    // Type and press Enter
    await input.fill("Test message with Enter")
    await input.press("Enter")

    // Check if the message appears in the chat
    await expect(
      page.locator('[data-testid="message"]').filter({
        hasText: "Test message with Enter",
      }),
    ).toBeVisible()
  })

  test("should not send empty message", async ({ page }) => {
    const sendButton = page.locator('[data-testid="send-button"]')
    const initialMessageCount = await page.locator('[data-testid="message"]').count()

    // Try to send empty message
    await sendButton.click()

    // Message count should remain the same
    await expect(page.locator('[data-testid="message"]')).toHaveCount(initialMessageCount)
  })

  test("should show loading state when sending", async ({ page }) => {
    const input = page.locator('[data-testid="message-input"]')
    const sendButton = page.locator('[data-testid="send-button"]')

    // Start sending a message
    await input.fill("Test loading state")
    await sendButton.click()

    // Check if status changes to responding
    await expect(page.locator('[data-testid="agent-status"]')).toContainText(/Responding|Thinking/)

    // Input should be disabled during sending
    await expect(input).toBeDisabled()
  })

  test("should handle long messages", async ({ page }) => {
    const input = page.locator('[data-testid="message-input"]')
    const longMessage = "A".repeat(1000)

    // Type a long message
    await input.fill(longMessage)

    // Should show character count
    await expect(page.locator('[data-testid="char-count"]')).toContainText("1000/1000")

    // Send the message
    await page.locator('[data-testid="send-button"]').click()

    // Check if message was truncated or handled properly
    const sentMessage = page.locator('[data-testid="message"]').last()
    await expect(sentMessage).toBeVisible()
  })

  test("should navigate back to workspace", async ({ page }) => {
    const backButton = page.locator("button").filter({ hasText: "← Back to Workspace" })

    // Click back button
    await backButton.click()

    // Should navigate to workspace page
    await expect(page).toHaveURL(/.*\/workspace.*/)
  })

  test("should handle network errors gracefully", async ({ page }) => {
    // Mock network failure by disconnecting
    await page.context().setOffline(true)

    const input = page.locator('[data-testid="message-input"]')
    const sendButton = page.locator('[data-testid="send-button"]')

    await input.fill("This should fail")
    await sendButton.click()

    // Should show error state
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible()

    // Restore connection
    await page.context().setOffline(false)
  })

  test("should maintain conversation history", async ({ page }) => {
    // Send multiple messages
    const messages = ["First message", "Second message", "Third message"]

    for (const message of messages) {
      const input = page.locator('[data-testid="message-input"]')
      await input.fill(message)
      await page.locator('[data-testid="send-button"]').click()

      // Wait for message to appear
      await expect(
        page.locator('[data-testid="message"]').filter({
          hasText: message,
        }),
      ).toBeVisible()
    }

    // All messages should be visible
    for (const message of messages) {
      await expect(
        page.locator('[data-testid="message"]').filter({
          hasText: message,
        }),
      ).toBeVisible()
    }
  })
})
