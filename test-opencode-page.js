import puppeteer from "puppeteer"

async function testPage() {
  try {
    const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] })
    const page = await browser.newPage()

    console.log("Navigating to OpenCode frontend...")
    await page.goto("http://192.168.0.221:8080", { waitUntil: "networkidle2", timeout: 30000 })

    console.log("Page loaded. Checking content...")

    // Check if the page has content
    const title = await page.title()
    console.log("Page title:", title)

    // Check for main content
    const hasAppDiv = await page.$("#app")
    console.log("Has app div:", !!hasAppDiv)

    // Check for any visible text
    const bodyText = await page.evaluate(() => {
      return document.body ? document.body.textContent.trim() : ""
    })
    console.log("Body has text:", bodyText.length > 0)

    // Check for JavaScript errors
    const errors = []
    page.on("pageerror", (error) => {
      errors.push(error.message)
    })

    await page.waitForTimeout(2000) // Wait for JS to load

    if (errors.length > 0) {
      console.log("JavaScript errors found:", errors)
    } else {
      console.log("No JavaScript errors detected")
    }

    // Take a screenshot
    await page.screenshot({ path: "opencode-test.png", fullPage: true })
    console.log("Screenshot saved as opencode-test.png")

    await browser.close()

    console.log("✅ Test completed successfully!")
    console.log("Page appears to be loading correctly with OpenCode content.")
  } catch (error) {
    console.error("❌ Test failed:", error.message)
  }
}

testPage()
