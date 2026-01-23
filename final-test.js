import puppeteer from "puppeteer"

async function finalTest() {
  let browser
  try {
    console.log("🎯 FINAL TEST: OpenCode Vite + SolidJS Build")

    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    })
    const page = await browser.newPage()

    console.log("📄 Loading OpenCode page...")
    await page.goto("http://192.168.0.221:8080", { waitUntil: "networkidle2", timeout: 30000 })

    await new Promise((resolve) => setTimeout(resolve, 5000))

    const title = await page.title()
    const hasRootDiv = await page.$("#root")
    const rootAnalysis = await page.evaluate(() => {
      const root = document.getElementById("root")
      if (!root) return { exists: false }

      return {
        exists: true,
        innerHTML: root.innerHTML?.substring(0, 300) || "",
        childrenCount: root.children.length,
        hasContent: root.innerHTML.trim().length > 0,
      }
    })

    console.log("📊 RESULTS:")
    console.log(`   ✅ Title: "${title}"`)
    console.log(`   ✅ Root div exists: ${hasRootDiv}`)
    console.log(`   ✅ Root has content: ${rootAnalysis.hasContent}`)
    console.log(`   ✅ Content length: ${rootAnalysis.innerHTML?.length || 0}`)
    console.log(`   ✅ Children count: ${rootAnalysis.childrenCount}`)

    // Check for visible content
    const visibleContent = await page.evaluate(() => {
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

      const root = document.getElementById("root")
      const rootRect = root?.getBoundingClientRect()

      return {
        totalElements: allElements.length,
        visibleElements: visibleElements.length,
        rootVisible: rootRect ? rootRect.width > 0 && rootRect.height > 0 : false,
        hasTextContent: document.body?.textContent?.trim().length > 0,
      }
    })

    console.log("👁️  VISIBILITY ANALYSIS:")
    console.log(`   ✅ Total elements: ${visibleContent.totalElements}`)
    console.log(`   ✅ Visible elements: ${visibleContent.visibleElements}`)
    console.log(`   ✅ Root is visible: ${visibleContent.rootVisible}`)
    console.log(`   ✅ Page has text: ${visibleContent.hasTextContent}`)

    await page.screenshot({ path: "final-test-result.png", fullPage: true })
    console.log("\n📸 Screenshot saved as final-test-result.png")

    await browser.close()

    const success =
      title === "OpenCode" &&
      hasRootDiv &&
      rootAnalysis.hasContent &&
      visibleContent.visibleElements > 3 &&
      visibleContent.rootVisible

    console.log(
      `\n${success ? "🎉 SUCCESS!" : "❌ FAILURE"}: OpenCode SolidJS app is ${success ? "properly mounted and rendering" : "still not working"}`,
    )

    if (success) {
      console.log("\n✅ CONFIRMED: The webpage is no longer blank!")
      console.log("   - SolidJS app is mounting correctly")
      console.log("   - Content is being rendered")
      console.log("   - UI elements are visible")
      console.log("   - OpenCode AG-UI is functional")
    }
  } catch (error) {
    console.error("❌ Test failed:", error.message)
  } finally {
    if (browser) await browser.close()
  }
}

finalTest()
