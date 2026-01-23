import puppeteer from "puppeteer"

async function testPage() {
  let browser
  try {
    console.log("🚀 Starting comprehensive OpenCode frontend test...")

    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-web-security"],
    })
    const page = await browser.newPage()

    // Capture console messages
    const consoleMessages = []
    page.on("console", (msg) => {
      consoleMessages.push(`${msg.type()}: ${msg.text()}`)
    })

    // Capture JavaScript errors
    const jsErrors = []
    page.on("pageerror", (error) => {
      jsErrors.push(error.message)
    })

    console.log("📄 Navigating to OpenCode frontend...")
    const response = await page.goto("http://192.168.0.221:8080", {
      waitUntil: "networkidle2",
      timeout: 30000,
    })

    console.log(`📊 Response status: ${response.status()}`)
    console.log(`📊 Response headers: ${JSON.stringify(Object.fromEntries(response.headers()), null, 2)}`)

    // Wait for potential dynamic content
    await page.waitForTimeout(5000)

    console.log("\n🔍 ANALYZING PAGE CONTENT...")

    // Check title
    const title = await page.title()
    console.log(`📋 Page title: "${title}"`)

    // Check if app div exists
    const appDiv = await page.$("#app")
    console.log(`🎯 App div exists: ${!!appDiv}`)

    if (appDiv) {
      const appRect = await page.evaluate((el) => {
        const rect = el.getBoundingClientRect()
        return {
          width: rect.width,
          height: rect.height,
          visible: rect.width > 0 && rect.height > 0,
        }
      }, appDiv)
      console.log(`📏 App div dimensions: ${appRect.width}x${appRect.height}, visible: ${appRect.visible}`)
    }

    // Check body content
    const bodyText = await page.evaluate(() => {
      const body = document.body
      if (!body) return "NO_BODY_ELEMENT"

      const text = body.textContent?.trim() || ""
      const html = body.innerHTML?.substring(0, 200) || ""

      return {
        hasText: text.length > 0,
        textLength: text.length,
        textPreview: text.substring(0, 100),
        hasChildren: body.children.length > 0,
        childCount: body.children.length,
        htmlPreview: html,
      }
    })

    console.log(`📝 Body analysis:`)
    console.log(`   - Has text: ${bodyText.hasText}`)
    console.log(`   - Text length: ${bodyText.textLength}`)
    console.log(`   - Text preview: "${bodyText.textPreview}"`)
    console.log(`   - Has children: ${bodyText.hasChildren}`)
    console.log(`   - Child count: ${bodyText.childCount}`)
    console.log(`   - HTML preview: "${bodyText.htmlPreview}"`)

    // Check for SolidJS mounting
    const solidContent = await page.evaluate(() => {
      const app = document.getElementById("app")
      if (!app) return "NO_APP_DIV"

      return {
        appInnerHTML: app.innerHTML?.substring(0, 200) || "",
        appChildren: app.children.length,
        hasSolidClasses: app.classList.contains("flex") && app.classList.contains("flex-col"),
        computedStyle: window.getComputedStyle(app).display,
      }
    })

    console.log(`⚛️  SolidJS analysis:`)
    console.log(`   - App inner HTML: "${solidContent.appInnerHTML}"`)
    console.log(`   - App children: ${solidContent.appChildren}`)
    console.log(`   - Has expected classes: ${solidContent.hasSolidClasses}`)
    console.log(`   - Display style: ${solidContent.computedStyle}`)

    // Check for any visible elements
    const visibleElements = await page.evaluate(() => {
      const allElements = document.querySelectorAll("*")
      const visible = Array.from(allElements).filter((el) => {
        const rect = el.getBoundingClientRect()
        const style = window.getComputedStyle(el)
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0"
        )
      })

      return {
        totalElements: allElements.length,
        visibleElements: visible.length,
        visibleTags: visible.slice(0, 10).map((el) => el.tagName.toLowerCase()),
      }
    })

    console.log(`👁️  Visibility analysis:`)
    console.log(`   - Total elements: ${visibleElements.totalElements}`)
    console.log(`   - Visible elements: ${visibleElements.visibleElements}`)
    console.log(`   - Visible element types: [${visibleElements.visibleTags.join(", ")}]`)

    // Check JavaScript execution
    const jsStatus = await page.evaluate(() => {
      return {
        hasWindow: typeof window !== "undefined",
        hasDocument: typeof document !== "undefined",
        hasSolid: typeof window.SolidJS !== "undefined",
        scriptsLoaded: document.querySelectorAll("script").length,
        scriptsExecuted: Array.from(document.querySelectorAll("script")).filter((s) => s.dataset.executed).length,
      }
    })

    console.log(`🟨 JavaScript analysis:`)
    console.log(`   - Window available: ${jsStatus.hasWindow}`)
    console.log(`   - Document available: ${jsStatus.hasDocument}`)
    console.log(`   - SolidJS available: ${jsStatus.hasSolid}`)
    console.log(`   - Scripts in DOM: ${jsStatus.scriptsLoaded}`)
    console.log(`   - Scripts marked executed: ${jsStatus.scriptsExecuted}`)

    console.log("\n📋 CONSOLE MESSAGES:")
    consoleMessages.forEach((msg, i) => console.log(`   ${i + 1}. ${msg}`))

    if (jsErrors.length > 0) {
      console.log("\n❌ JAVASCRIPT ERRORS:")
      jsErrors.forEach((error, i) => console.log(`   ${i + 1}. ${error}`))
    } else {
      console.log("\n✅ No JavaScript errors detected")
    }

    // Take detailed screenshot
    await page.screenshot({
      path: "opencode-detailed-test.png",
      fullPage: true,
      type: "png",
    })
    console.log("\n📸 Screenshot saved as opencode-detailed-test.png")

    // Final assessment
    const isWorking =
      title === "OpenCode" &&
      appDiv &&
      bodyText.hasChildren &&
      visibleElements.visibleElements > 1 &&
      jsErrors.length === 0

    console.log(`\n🎯 FINAL ASSESSMENT:`)
    console.log(`   Page appears to be ${isWorking ? "WORKING" : "BROKEN"}`)
    console.log(`   Title correct: ${title === "OpenCode"}`)
    console.log(`   App div present: ${!!appDiv}`)
    console.log(`   Has content: ${bodyText.hasChildren}`)
    console.log(`   Has visible elements: ${visibleElements.visibleElements > 1}`)
    console.log(`   No JS errors: ${jsErrors.length === 0}`)

    await browser.close()

    if (!isWorking) {
      console.log("\n🔍 DIAGNOSTIC SUMMARY:")
      console.log("The page may appear blank due to:")
      console.log("1. SolidJS app not mounting properly")
      console.log("2. CSS not loading, making content invisible")
      console.log("3. JavaScript runtime errors (check console)")
      console.log("4. Network issues with asset loading")
      console.log("5. Authentication/token issues")
    }
  } catch (error) {
    console.error("❌ Test failed with error:", error.message)
    console.error("Stack trace:", error.stack)
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

testPage()
