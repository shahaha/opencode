#!/usr/bin/env node

import { chromium } from "playwright"

console.log("🧪 Testing AG-UI Route Resolution...\n")

const browser = await chromium.launch({
  headless: true,
})

const page = await browser.newPage()

console.log("📍 Test 1: Main app index")
await page.goto("http://127.0.0.1:3002/")
const mainTitle = await page.title()
console.log(`   Title: ${mainTitle}`)
const mainContent = await page.content()
console.log(`   Body length: ${mainContent.length} bytes`)
console.log(`   Contains "OpenCode": ${mainContent.includes("OpenCode")}`)
console.log(`   Contains "AG-UI": ${mainContent.includes("AG-UI")}`)

console.log("\n📍 Test 2: AG-UI Chat route")
await page.goto("http://127.0.0.1:3002/agent-chat/test-session")
const chatTitle = await page.title()
console.log(`   Title: ${chatTitle}`)
const chatContent = await page.content()
console.log(`   Body length: ${chatContent.length} bytes`)
console.log(`   Contains "OpenCode": ${chatContent.includes("OpenCode")}`)
console.log(`   Contains "AG-UI Chat": ${chatContent.includes("AG-UI Chat")}`)
console.log(`   Contains "test-session": ${chatContent.includes("test-session")}`)

console.log("\n📍 Test 3: Compare HTML")
if (mainContent === chatContent) {
  console.log("   ⚠️  SAME CONTENT - Route not working!")
} else {
  console.log("   ✅ DIFFERENT CONTENT - Route is being served")
}

const isSame = mainContent === chatContent

console.log("\n📊 Summary:")
console.log(`   Main route: ${mainTitle}`)
console.log(`   Chat route: ${chatTitle}`)
console.log(`   Same content: ${isSame ? "❌ YES" : "✅ NO"}`)

if (isSame) {
  console.log("\n❌ ROUTING ISSUE: Both routes return identical content")
  console.log("   The AG-UI Chat route is not being recognized by FileRoutes")
  console.log("\n🔍 Possible causes:")
  console.log("   1. Vite cache not cleared")
  console.log("   2. FileRoutes not picking up agent-chat/ directory")
  console.log("   3. Route file naming convention issue")
}

await browser.close()

console.log("\n✅ Test complete!")
