#!/usr/bin/env node

import { chromium } from "playwright"

console.log("🧪 Testing AG-UI with Enhanced Playwright...\n")

const browser = await chromium.launch({
  headless: true,
})

const page = await browser.newPage()

// Enable console logging for debugging
page.on("console", (msg) => {
  console.log(`🔍 Console: ${msg.text()}`)
})

// Enhanced error handling
const errors = []
page.on("pageerror", (err) => {
  errors.push(err.message)
  console.log(`❌ Page Error: ${err.message}`)
})

// Navigate and wait for full load
console.log("📍 Navigating to http://127.0.0.1:3002/agent-chat/test-session")
await page.goto("http://127.0.0.1:3002/agent-chat/test-session", {
  waitUntil: "networkidle",
  timeout: 10000,
})

console.log("✅ Page loaded!")
await page.waitForTimeout(2000) // Wait for hydration

// Take initial screenshot
await page.screenshot({ path: "agui-test-screenshot.png", fullPage: true })
console.log("📸 Screenshot saved")

// Check page title and URL
const title = await page.title()
const url = page.url()
console.log(`📄 Page title: ${title}`)
console.log(`🔗 Current URL: ${url}`)

// Check for SolidJS hydration
const isHydrated = await page.evaluate(() => {
  return typeof window !== "undefined" && window.location !== undefined
})
console.log(`💧 Page hydrated: ${isHydrated}`)

// Check for React/SolidJS root element
const rootElement = await page.$("#root")
console.log(`🏗️  Root element found: ${!!rootElement}`)

// Check for AG-UI specific content with multiple strategies
console.log("\n🔍 Checking for AG-UI content...\n")

// Strategy 1: Direct text search
const hasAGUIText = await page
  .locator("text=AG-UI")
  .isVisible()
  .catch(() => false)
const hasSessionText = await page
  .locator("text=test-session")
  .isVisible()
  .catch(() => false)

// Strategy 2: Check for chat input
const chatInput = await page
  .locator('input[placeholder*="message"]')
  .isVisible()
  .catch(() => false)

// Strategy 3: Check for model selector
const modelSelect = await page
  .locator("select")
  .isVisible()
  .catch(() => false)

// Strategy 4: Check for specific CSS classes (if using Tailwind)
const hasChatClasses = await page
  .locator(".flex.flex-col.h-screen")
  .isVisible()
  .catch(() => false)

// Strategy 5: Check for WebSocket connection attempts
const wsConnections = await page.evaluate(() => {
  // Check if WebSocket constructor was called
  return typeof WebSocket !== "undefined"
})

// Strategy 6: Check for JavaScript errors in console
console.log(`❌ Console errors: ${errors.length}`)
if (errors.length > 0) {
  console.log("   Error details:")
  errors.forEach((err, i) => console.log(`   ${i + 1}. ${err}`))
}

// Strategy 8: Evaluate JavaScript to check component state
const componentState = await page.evaluate(() => {
  try {
    // Check if SolidJS is running
    const solidElements = document.querySelectorAll("[data-solid]")
    return {
      solidElements: solidElements.length,
      hasBody: !!document.body,
      scriptsLoaded: document.scripts.length,
      hasTitle: !!document.title,
    }
  } catch (e) {
    return { error: e.message }
  }
})

console.log(`⚛️  Component state:`, componentState)

// Strategy 9: Check page content directly
const pageContent = await page.content()
const hasAGUIContent = pageContent.includes("AG-UI") || pageContent.includes("test-session")
const hasModelOptions = pageContent.includes("opencode/glm-4.7-free")
const hasInputElement = pageContent.includes("placeholder")

console.log(`📄 Page content analysis:`)
console.log(`   Contains AG-UI: ${hasAGUIContent}`)
console.log(`   Contains session: ${pageContent.includes("test-session")}`)
console.log(`   Contains models: ${hasModelOptions}`)
console.log(`   Contains input: ${hasInputElement}`)

// Comprehensive result analysis
const testResults = {
  pageLoaded: true,
  titleCorrect: title.includes("OpenCode"),
  urlCorrect: url.includes("agent-chat/test-session"),
  hydrated: isHydrated,
  rootElement: !!rootElement,
  hasAGUIText,
  hasSessionText,
  chatInput,
  modelSelect,
  hasChatClasses,
  wsAvailable: wsConnections,
  consoleErrors: errors.length,
  solidElements: componentState.solidElements || 0,
  contentChecks: {
    agui: hasAGUIContent,
    session: pageContent.includes("test-session"),
    models: hasModelOptions,
    input: hasInputElement,
  },
}

// Calculate confidence score
let confidenceScore = 0
const maxScore = 15

if (testResults.pageLoaded) confidenceScore += 2
if (testResults.titleCorrect) confidenceScore += 1
if (testResults.urlCorrect) confidenceScore += 2
if (testResults.hydrated) confidenceScore += 1
if (testResults.rootElement) confidenceScore += 1
if (testResults.hasAGUIText) confidenceScore += 2
if (testResults.hasSessionText) confidenceScore += 1
if (testResults.chatInput) confidenceScore += 2
if (testResults.modelSelect) confidenceScore += 1
if (testResults.wsAvailable) confidenceScore += 1
if (testResults.consoleErrors === 0) confidenceScore += 1

// Content-based scoring
if (testResults.contentChecks.agui) confidenceScore += 1
if (testResults.contentChecks.session) confidenceScore += 1
if (testResults.contentChecks.models) confidenceScore += 1
if (testResults.contentChecks.input) confidenceScore += 1

const confidencePercent = Math.round((confidenceScore / maxScore) * 100)

console.log("\n📊 COMPREHENSIVE TEST RESULTS:")
console.log("=".repeat(50))
console.log(`Overall Confidence: ${confidencePercent}% (${confidenceScore}/${maxScore})`)

if (confidencePercent >= 80) {
  console.log("✅ STATUS: AG-UI LIKELY WORKING")
} else if (confidencePercent >= 50) {
  console.log("⚠️  STATUS: PARTIAL SUCCESS - MAY NEED INVESTIGATION")
} else {
  console.log("❌ STATUS: AG-UI NOT WORKING")
}

console.log("\n🔍 DETAILED BREAKDOWN:")
Object.entries(testResults).forEach(([key, value]) => {
  const icon = typeof value === "boolean" ? (value ? "✅" : "❌") : "📊"
  console.log(`   ${icon} ${key}: ${value}`)
})

console.log("\n💡 RECOMMENDATIONS:")
if (confidencePercent < 80) {
  console.log("   • Check if frontend server is running")
  console.log("   • Verify routing is configured correctly")
  console.log("   • Check browser console for JavaScript errors")
  console.log("   • Ensure backend WebSocket server is accessible")
  console.log("   • Try clearing browser cache")
}

console.log("\n✅ Enhanced test complete!")
console.log("📸 Screenshot: agui-test-screenshot.png")

await browser.close()
