#!/usr/bin/env node

import { chromium } from "playwright"

console.log("🧪 Testing AG-UI with Playwright Chromium...\n")

const browser = await chromium.launch({
  headless: true,
})

const page = await browser.newPage()

console.log("📍 Navigating to http://127.0.0.1:3002/agent-chat/test-session")
await page.goto("http://127.0.0.1:3002/agent-chat/test-session")

console.log("✅ Page loaded!\n")

// Wait for page to stabilize
await page.waitForTimeout(2000)

// Take screenshot
const screenshot = await page.screenshot({ path: "agui-test-screenshot.png" })
console.log("📸 Screenshot saved to agui-test-screenshot.png\n")

// Check page title
const title = await page.title()
console.log(`📄 Page title: ${title}\n`)

// Check console for errors
const errors = []
page.on("console", (msg) => {
  if (msg.type() === "error") {
    errors.push(msg.text())
    console.log(`❌ Console error: ${msg.text()}`)
  }
})

// Wait a bit more
await page.waitForTimeout(3000)

console.log("🔍 Checking page elements...\n")

// Check for AG-UI Chat elements
const hasHeader = await page
  .getByText("AG-UI Chat")
  .isVisible()
  .catch(() => false)
const hasSessionId = await page
  .getByText("test-session")
  .isVisible()
  .catch(() => false)
const hasModelSelector = await page
  .getByRole("combobox")
  .isVisible()
  .catch(() => false)
const hasInput = await page
  .getByPlaceholder("Type your message...")
  .isVisible()
  .catch(() => false)

console.log(`   Header: ${hasHeader ? "✅" : "❌"}`)
console.log(`   Session ID: ${hasSessionId ? "✅" : "❌"}`)
console.log(`   Model selector: ${hasModelSelector ? "✅" : "❌"}`)
console.log(`   Input field: ${hasInput ? "✅" : "❌"}`)
console.log(`   Console errors: ${errors.length}`)
console.log(`\n📊 Summary:`)
console.log(`   Page load: ✅`)
console.log(`   Title: ${title}`)
console.log(`   Elements visible: ${[hasHeader, hasSessionId, hasModelSelector, hasInput].filter(Boolean).length}/4`)

if (errors.length > 0) {
  console.log(`\n⚠️  Console errors detected:`)
  errors.forEach((err) => console.log(`   - ${err}`))
}

await browser.close()

console.log("\n✅ Test complete! Check agui-test-screenshot.png for visual verification.")
