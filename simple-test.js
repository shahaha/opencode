import puppeteer from "puppeteer"

async function testPage() {
  let browser
  try {
    console.log("🚀 Testing OpenCode frontend loading...")

    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    })
    const page = await browser.newPage()

    // Capture console messages and errors
    const consoleMessages = []
    const jsErrors = []

    page.on("console", (msg) => {
      consoleMessages.push(`${msg.type()}: ${msg.text()}`)
    })

    page.on("pageerror", (error) => {
      jsErrors.push(error.message)
    })

    console.log("📄 Loading page...")
    await page.goto("http://192.168.0.221:8080", { waitUntil: "networkidle2", timeout: 30000 })

    // Wait for potential content loading
    await new Promise((resolve) => setTimeout(resolve, 3000))

    console.log("\n🔍 PAGE ANALYSIS:")

    const title = await page.title()
    console.log(`📋 Title: "${title}"`)

    // Check if app div exists and has content
    const appAnalysis = await page.evaluate(() => {
      const app = document.getElementById("app")
      if (!app) return { exists: false }

      return {
        exists: true,
        innerHTML: app.innerHTML?.substring(0, 200) || "",
        childrenCount: app.children.length,
        classList: Array.from(app.classList),
        computedDisplay: window.getComputedStyle(app).display,
        boundingRect: {
          width: app.getBoundingClientRect().width,
          height: app.getBoundingClientRect().height,
        },
      }
    })

    console.log("🎯 App div analysis:", JSON.stringify(appAnalysis, null, 2))

    // Check for any visible content
    const visibilityAnalysis = await page.evaluate(() => {
      const allElements = document.querySelectorAll("*")
      const visibleElements = Array.from(allElements).filter((el) => {
        const rect = el.getBoundingClientRect()
        const style = window.getComputedStyle(el)
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          parseFloat(style.opacity || "1") > 0
        )
      })

      return {
        totalElements: allElements.length,
        visibleElements: visibleElements.length,
        bodyTextLength: document.body?.textContent?.trim().length || 0,
        visibleElementTypes: visibleElements.slice(0, 5).map((el) => el.tagName.toLowerCase()),
      }
    })

    console.log("👁️ Visibility analysis:", JSON.stringify(visibilityAnalysis, null, 2))

    console.log("\n📋 Console messages:")
    consoleMessages.slice(0, 10).forEach((msg, i) => console.log(`   ${i + 1}. ${msg}`))

    if (jsErrors.length > 0) {
      console.log("\n❌ JavaScript errors:")
      jsErrors.forEach((error, i) => console.log(`   ${i + 1}. ${error}`))
    }

    // Take screenshot
    await page.screenshot({ path: "opencode-analysis.png", fullPage: true })
    console.log("\n📸 Screenshot saved as opencode-analysis.png")

    await browser.close()

    console.log("\n🎯 SUMMARY:")
    console.log(`   Title correct: ${title === "OpenCode"}`)
    console.log(`   App div exists: ${appAnalysis.exists}`)
    console.log(`   App has content: ${appAnalysis.childrenCount > 0}`)
    console.log(`   Visible elements: ${visibilityAnalysis.visibleElements}`)
    console.log(`   JavaScript errors: ${jsErrors.length}`)

    const isWorking =
      title === "OpenCode" && appAnalysis.exists && visibilityAnalysis.visibleElements > 1 && jsErrors.length === 0

    console.log(`\n${isWorking ? "✅" : "❌"} CONCLUSION: Page ${isWorking ? "appears to be working" : "has issues"}`)
  } catch (error) {
    console.error("❌ Test failed:", error.message)
  } finally {
    if (browser) await browser.close()
  }
}

testPage()
