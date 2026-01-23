import puppeteer from "puppeteer"

async function testEndToEndAGUI() {
  let browser
  try {
    console.log("🧪 END-TO-END AG-UI FUNCTIONALITY TEST")
    console.log("==========================================")

    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    })
    const page = await browser.newPage()

    // Capture console and network
    const consoleMessages = []
    const networkErrors = []
    const wsMessages = []

    page.on("console", (msg) => {
      consoleMessages.push(`${msg.type().toUpperCase()}: ${msg.text()}`)
    })

    page.on("pageerror", (error) => {
      console.error("PAGE ERROR:", error.message)
    })

    // Test 1: Load the main application
    console.log("\n📄 TEST 1: Loading OpenCode Application")
    await page.goto("http://192.168.0.221:8080", { waitUntil: "networkidle2", timeout: 30000 })

    const title = await page.title()
    console.log(`   ✅ Page title: "${title}"`)

    // Test 2: Navigate to AG-UI chat
    console.log("\n📄 TEST 2: Navigating to AG-UI Chat")
    await page.goto("http://192.168.0.221:8080/agent-chat/test-session", { waitUntil: "networkidle2" })

    await new Promise((resolve) => setTimeout(resolve, 3000))

    // Check if chat interface loaded
    const chatTitle = await page.title()
    console.log(`   ✅ Chat page title: "${chatTitle}"`)

    // Check for chat UI elements using proper selectors
    const chatElements = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll("input"))
      const buttons = Array.from(document.querySelectorAll("button"))
      const divs = Array.from(document.querySelectorAll("div"))

      return {
        hasInput: inputs.some((input) => input.placeholder && input.placeholder.includes("message")),
        hasSendButton: buttons.some((button) => button.textContent && button.textContent.includes("Send")),
        hasChatHeader: divs.some(
          (div) =>
            div.classList.contains("bg-white") &&
            (div.classList.contains("border-b") || div.textContent?.includes("AG-UI Chat")),
        ),
        hasMessageArea: divs.some((div) => div.classList.contains("overflow-y-auto")),
        hasWelcomeMessage: document.body?.textContent?.includes("Welcome to OpenCode AG-UI Chat") || false,
        hasConnectedStatus: document.body?.textContent?.includes("Connected") || false,
        totalDivs: divs.length,
        totalButtons: buttons.length,
        totalInputs: inputs.length,
      }
    })

    console.log(`   ✅ Chat header present: ${chatElements.hasChatHeader}`)
    console.log(`   ✅ Message area present: ${chatElements.hasMessageArea}`)
    console.log(`   ✅ Input field present: ${chatElements.hasInput}`)
    console.log(`   ✅ Send button present: ${chatElements.hasSendButton}`)
    console.log(`   ✅ Welcome message visible: ${chatElements.hasWelcomeMessage}`)
    console.log(`   ✅ WebSocket connected: ${chatElements.hasConnectedStatus}`)

    // Test 3: Test message sending (if UI is ready)
    if (chatElements.hasInput && chatElements.hasSendButton) {
      console.log("\n📝 TEST 3: Testing Message Input")

      // Type a test message
      await page.fill('input[placeholder*="message"]', "Hello from automated test!")
      console.log("   ✅ Message typed successfully")

      // Click send button
      await page.click("button")
      console.log("   ✅ Send button clicked")

      // Wait a bit for any updates
      await new Promise((resolve) => setTimeout(resolve, 1000))
      console.log("   ✅ Message sending attempted")
    }

    // Test 4: Check for any JavaScript errors
    console.log("\n🚨 TEST 4: Checking for Errors")
    const recentErrors = consoleMessages.filter(
      (msg) => msg.includes("ERROR") || msg.includes("error") || msg.includes("Error"),
    )
    const recentLogs = consoleMessages.slice(-10)

    console.log(`   📊 Total console messages: ${consoleMessages.length}`)
    console.log(`   ❌ JavaScript errors: ${recentErrors.length}`)

    if (recentErrors.length > 0) {
      console.log("   Recent errors:")
      recentErrors.slice(-3).forEach((error) => console.log(`     - ${error}`))
    }

    // Test 5: Check visual layout
    console.log("\n👁️  TEST 5: Visual Layout Check")
    const bodyText = await page.evaluate(() => document.body?.textContent?.trim().length || 0)
    const visibleElements = await page.evaluate(() => {
      const all = document.querySelectorAll("*")
      const visible = Array.from(all).filter((el) => {
        const rect = el.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      })
      return visible.length
    })

    console.log(`   📏 Body text length: ${bodyText} characters`)
    console.log(`   🎨 Visible elements: ${visibleElements}`)

    // Final assessment
    console.log("\n🎯 FINAL ASSESSMENT")
    console.log("=====================================")

    const tests = [
      { name: "Page loads correctly", pass: title === "OpenCode" },
      { name: "Chat page accessible", pass: chatTitle === "OpenCode" },
      { name: "Chat UI components present", pass: hasChatHeader && hasMessageArea && hasInputArea && hasSendButton },
      { name: "Welcome message visible", pass: !!welcomeMessage },
      { name: "Connection status shown", pass: !!connectionStatus },
      { name: "No critical JavaScript errors", pass: recentErrors.length === 0 },
      { name: "Content rendered properly", pass: bodyText > 100 && visibleElements > 10 },
    ]

    tests.forEach((test) => {
      const status = test.pass ? "✅" : "❌"
      console.log(`${status} ${test.name}`)
    })

    const passedTests = tests.filter((t) => t.pass).length
    const totalTests = tests.length
    const successRate = ((passedTests / totalTests) * 100).toFixed(1)

    console.log(`\n📊 OVERALL RESULT: ${passedTests}/${totalTests} tests passed (${successRate}%)`)

    if (passedTests === totalTests) {
      console.log("🎉 ALL TESTS PASSED! AG-UI is fully functional.")
    } else if (passedTests >= totalTests * 0.8) {
      console.log("✅ MOSTLY WORKING! Minor issues detected but core functionality operational.")
    } else {
      console.log("⚠️  ISSUES DETECTED! Core functionality may be impaired.")
    }

    // Take final screenshot
    await page.screenshot({ path: "agui-final-test.png", fullPage: true })
    console.log("\n📸 Screenshot saved as agui-final-test.png")

    await browser.close()

    return {
      success: passedTests === totalTests,
      passedTests,
      totalTests,
      tests,
    }
  } catch (error) {
    console.error("❌ Test failed with exception:", error.message)
    return { success: false, error: error.message }
  } finally {
    if (browser) await browser.close()
  }
}

// Run the test
testEndToEndAGUI()
  .then((result) => {
    console.log("\n🏁 TEST COMPLETED")
    process.exit(result.success ? 0 : 1)
  })
  .catch((error) => {
    console.error("Test runner failed:", error)
    process.exit(1)
  })
