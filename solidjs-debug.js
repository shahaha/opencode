import puppeteer from "puppeteer"

async function debugSolidJS() {
  let browser
  try {
    console.log("🔧 Debugging SolidJS mounting issues...")

    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    })
    const page = await browser.newPage()

    // Capture all console messages
    const allMessages = []
    page.on("console", (msg) => {
      allMessages.push(`${msg.type().toUpperCase()}: ${msg.text()}`)
    })

    // Capture network requests
    const networkRequests = []
    const networkErrors = []
    page.on("request", (request) => {
      networkRequests.push({
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
      })
    })
    page.on("requestfailed", (request) => {
      networkErrors.push({
        url: request.url(),
        error: request.failure()?.errorText,
      })
    })

    console.log("📄 Loading OpenCode page...")
    await page.goto("http://192.168.0.221:8080", {
      waitUntil: "networkidle0",
      timeout: 30000,
    })

    // Wait a bit for potential JS execution
    await new Promise((resolve) => setTimeout(resolve, 5000))

    console.log("\n📊 NETWORK ANALYSIS:")
    console.log(`   Total requests: ${networkRequests.length}`)
    console.log(`   Failed requests: ${networkErrors.length}`)

    if (networkErrors.length > 0) {
      console.log("❌ Network errors:")
      networkErrors.forEach((err, i) => {
        console.log(`   ${i + 1}. ${err.url}: ${err.error}`)
      })
    }

    // Check JavaScript asset loading
    const jsAssets = networkRequests.filter((req) => req.resourceType === "script" || req.url.includes(".js"))
    console.log(`🟨 JavaScript files requested: ${jsAssets.length}`)
    jsAssets.forEach((asset) => {
      console.log(`   - ${asset.url}`)
    })

    console.log("\n🟨 JAVASCRIPT EXECUTION CHECK:")

    // Check if main script loaded
    const mainScriptLoaded = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll("script"))
      const mainScript = scripts.find((s) => s.src && s.src.includes("index-CBizldw8.js"))
      return {
        scriptFound: !!mainScript,
        scriptSrc: mainScript?.src || null,
        allScripts: scripts.map((s) => ({ src: s.src, type: s.type })),
      }
    })

    console.log("Main script in DOM:", JSON.stringify(mainScriptLoaded, null, 2))

    // Check if SolidJS globals exist
    const solidJSCheck = await page.evaluate(() => {
      return {
        hasSolid: typeof window !== "undefined" && "SolidJS" in window,
        hasSolidCreateSignal: typeof createSignal === "function",
        hasSolidCreateComponent: typeof createComponent === "function",
        windowKeys: Object.keys(window)
          .filter((key) => key.toLowerCase().includes("solid"))
          .slice(0, 5),
      }
    })

    console.log("SolidJS availability:", JSON.stringify(solidJSCheck, null, 2))

    // Check for module loading errors
    const moduleCheck = await page.evaluate(() => {
      return {
        hasImportMeta: typeof import.meta !== "undefined",
        hasImportMetaUrl: import.meta?.url,
        currentScript: document.currentScript?.src,
        moduleScripts: Array.from(document.querySelectorAll('script[type="module"]')).length,
      }
    })

    console.log("Module loading:", JSON.stringify(moduleCheck, null, 2))

    console.log("\n📋 RECENT CONSOLE MESSAGES:")
    allMessages.slice(-20).forEach((msg, i) => {
      console.log(`   ${i + 1}. ${msg}`)
    })

    // Try to manually execute some SolidJS code
    try {
      const testResult = await page.evaluate(() => {
        try {
          // Try to access SolidJS functions if they exist
          if (typeof createSignal === "function") {
            const [count, setCount] = createSignal(0)
            return { solidJSAvailable: true, testSignal: count() }
          }
          return { solidJSAvailable: false, error: "createSignal not available" }
        } catch (e) {
          return { solidJSAvailable: false, error: e.message }
        }
      })
      console.log("SolidJS test result:", JSON.stringify(testResult, null, 2))
    } catch (e) {
      console.log("SolidJS test failed:", e.message)
    }

    await page.screenshot({ path: "solidjs-debug.png", fullPage: true })
    console.log("\n📸 Debug screenshot saved as solidjs-debug.png")

    await browser.close()

    console.log("\n🔍 ROOT CAUSE ANALYSIS:")
    if (networkErrors.length > 0) {
      console.log("❌ Issue: Network errors loading assets")
    } else if (!mainScriptLoaded.scriptFound) {
      console.log("❌ Issue: Main JavaScript file not found in DOM")
    } else if (!solidJSCheck.hasSolidCreateSignal) {
      console.log("❌ Issue: SolidJS functions not available globally")
    } else if (mainScriptLoaded.scriptFound && solidJSCheck.hasSolidCreateSignal) {
      console.log("❓ Issue: SolidJS loaded but app not mounting - check console for runtime errors")
    } else {
      console.log("❓ Issue: Unknown - requires further investigation")
    }
  } catch (error) {
    console.error("❌ Debug failed:", error.message)
  } finally {
    if (browser) await browser.close()
  }
}

debugSolidJS()
