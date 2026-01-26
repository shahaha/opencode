#!/usr/bin/env node
console.log("🔧 最終測試 AG-UI 修復...")

const tests = [
  {
    name: "診斷端點正常運作",
    test: async () => {
      const response = await fetch("http://100.94.136.15:9100/diagnostics/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ errors: [], warnings: [], networkFailures: [] }),
      })
      return response.ok && (await response.json()).success
    },
  },
  {
    name: "CSS 修復螢幕定位",
    test: async () => {
      const response = await fetch("http://100.94.136.15:9100/css/chat.css")
      const css = await response.text()
      return css.includes("position: fixed") && css.includes("100vw") && css.includes("max-height: 100vh")
    },
  },
  {
    name: "主要介面結構完整",
    test: async () => {
      const response = await fetch("http://100.94.136.15:9100/")
      const html = await response.text()
      return html.includes("chat-container") && html.includes("message-input") && html.includes("settings-panel")
    },
  },
]

const runTest = async (test) => {
  try {
    const passed = await test.test()
    console.log(`${passed ? "✅" : "❌"} ${test.name}`)
    return passed
  } catch (error) {
    console.log(`❌ ${test.name} - 錯誤: ${error.message}`)
    return false
  }
}

const runFinalTests = async () => {
  console.log("🧪 開始最終測試...\n")

  const results = await Promise.all(tests.map(runTest))
  const allPassed = results.every(Boolean)

  console.log("\n" + "=".repeat(60))
  if (allPassed) {
    console.log("🎉 所有最終測試通過！")
    console.log("")
    console.log("✅ 修復完成項目：")
    console.log("   • 診斷端點已添加 (/diagnostics/report)")
    console.log("   • 螢幕位置已修復 (position: fixed, 100vw/vh)")
    console.log("   • 瀏覽器診斷系統正常運作")
    console.log("")
    console.log("🌐 現在可以正常使用：")
    console.log("   http://100.94.136.15:9100/")
  } else {
    console.log("❌ 部分測試失敗，請檢查上述問題")
  }
  console.log("=".repeat(60))

  process.exit(allPassed ? 0 : 1)
}

runFinalTests()
