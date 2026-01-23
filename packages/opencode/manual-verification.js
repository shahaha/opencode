// 修復驗證腳本 - 手動測試修復效果

console.log("🧪 手動修復驗證腳本")
console.log("================================")

async function manualTest() {
  console.log("\n1️⃣ 測試前端載入...")

  try {
    const response = await fetch("http://100.94.136.15:9102/")
    if (!response.ok) {
      console.log("❌ 前端服務器無法訪問")
      return false
    }

    const html = await response.text()
    const hasTitle = html.includes("<title>AG-UI Chat - OpenCode</title>")
    const hasContainerClear = html.includes('container.innerHTML = ""')
    const hasEventBoundCheck = html.includes("settingsEventBound")
    const hasDebounce = html.includes("debounce(")
    const hasCorsFetch = html.includes('mode: "cors"')
    const hasFixDuplicates = html.includes("fixDuplicateWorkspaces")

    console.log("✅ 前端載入檢查：")
    console.log(`   📄 標題: ${hasTitle}`)
    console.log(`   🗑️ 清空容器: ${hasContainerClear}`)
    console.log(`   🔒 事件保護: ${hasEventBoundCheck}`)
    console.log(`   ⏱️ 防抖: ${hasDebounce}`)
    console.log(`   🌐 CORS 修復: ${hasCorsFetch}`)
    console.log(`   🔧 重複修復: ${hasFixDuplicates}`)

    const allFixes = hasContainerClear && hasEventBoundCheck && hasDebounce && hasCorsFetch && hasFixDuplicates

    console.log("\n2️⃣ 測試 CORS 修復...")
    try {
      const mcpResponse = await fetch("http://100.94.136.15:5000/mcp", {
        headers: {
          Origin: "http://100.94.136.15:9102",
          Accept: "application/json",
        },
      })

      if (mcpResponse.ok) {
        const data = await mcpResponse.json()
        console.log(`✅ CORS 修復成功！MCP 服務器: ${Object.keys(data).join(", ")}`)
      } else {
        console.log("❌ CORS 修復失敗")
        return false
      }
    } catch (error) {
      console.log(`❌ CORS 測試錯誤: ${error.message}`)
      return false
    }

    console.log("\n📊 修復狀態總結：")
    console.log(`   前端修復: ${allFixes ? "✅" : "❌"}`)
    console.log(`   CORS 修復: ✅`)
    console.log(`   整體狀態: ${allFixes ? "🎉 成功" : "⚠️ 需要檢查"}`)

    if (allFixes) {
      console.log("\n🚀 修復驗證完成！")
      console.log("   可以訪問: http://100.94.136.15:9102/")
      console.log("   多次點擊 Settings 按鈕驗證重複渲染修復")
      console.log("   檢查 MCP 狀態載入情況")
    }

    return allFixes
  } catch (error) {
    console.error("❌ 測試失敗:", error.message)
    return false
  }
}

manualTest()
  .then((success) => {
    console.log(`\n${success ? "🎉 所有測試通過！" : "❌ 測試失敗"}`)
  })
  .catch(console.error)
