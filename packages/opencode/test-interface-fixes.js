#!/usr/bin/env node
console.log("🔧 測試 AG-UI 介面修復...")

const tests = [
  {
    name: "browser-diagnostics-injector.js 檔案存在",
    url: "http://100.94.136.15:9100/browser-diagnostics-injector.js",
    test: (content) => content.includes("Browser Diagnostics Injector"),
  },
  {
    name: "CSS 包含重置樣式",
    url: "http://100.94.136.15:9100/css/chat.css",
    test: (content) => content.includes("box-sizing: border-box"),
  },
  {
    name: "Chat 容器佈局正確",
    url: "http://100.94.136.15:9100/",
    test: (content) => content.includes("chat-container") && content.includes("message-input"),
  },
  {
    name: "Settings Panel 存在",
    url: "http://100.94.136.15:9100/",
    test: (content) => content.includes("settings-panel"),
  },
]

const runTest = async (test) => {
  try {
    const response = await fetch(test.url)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const content = await response.text()
    const passed = test.test(content)

    console.log(`${passed ? "✅" : "❌"} ${test.name}`)
    return passed
  } catch (error) {
    console.log(`❌ ${test.name} - 錯誤: ${error.message}`)
    return false
  }
}

const runTests = async () => {
  console.log("🧪 開始測試修復...\n")

  const results = await Promise.all(tests.map(runTest))
  const allPassed = results.every(Boolean)

  console.log("\n" + "=".repeat(50))
  if (allPassed) {
    console.log("🎉 所有修復測試通過！")
    console.log("✨ 介面問題已解決")
    console.log("🌐 測試網址: http://100.94.136.15:9100/")
  } else {
    console.log("❌ 部分測試失敗，請檢查上述問題")
  }
  console.log("=".repeat(50))

  process.exit(allPassed ? 0 : 1)
}

runTests()
