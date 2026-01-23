#!/usr/bin/env node
// Test script to verify the fixes work

console.log("🧪 修復驗證測試")
console.log("================")

const BASE_URL = "http://localhost:9102"
const API_URL = "http://localhost:5000"

async function testCors() {
  console.log("\n1️⃣ 測試 CORS 修復...")
  try {
    const response = await fetch(`${API_URL}/mcp`, {
      headers: {
        Origin: BASE_URL,
        Accept: "application/json",
      },
    })

    if (response.ok) {
      const data = await response.json()
      console.log("✅ CORS 成功！MCP 狀態：", Object.keys(data).join(", "))
      return true
    } else {
      console.log("❌ CORS 失敗：", response.status)
      return false
    }
  } catch (error) {
    console.log("❌ CORS 錯誤：", error.message)
    return false
  }
}

async function testHtmlLoading() {
  console.log("\n2️⃣ 測試 HTML 文件載入...")
  try {
    const response = await fetch(BASE_URL)
    if (response.ok) {
      const html = await response.text()
      const hasTitle = html.includes("AG-UI Chat - OpenCode")
      const hasScript = html.includes("initApp()")
      const hasCorsFetch = html.includes('mode: "cors"')

      console.log(`✅ HTML 載入成功 (大小: ${html.length} 字節)`)
      console.log(`   📄 標題存在: ${hasTitle}`)
      console.log(`   📜 腳本存在: ${hasScript}`)
      console.log(`   🌐 CORS 修復存在: ${hasCorsFetch}`)
      return hasTitle && hasScript && hasCorsFetch
    } else {
      console.log("❌ HTML 載入失敗：", response.status)
      return false
    }
  } catch (error) {
    console.log("❌ HTML 載入錯誤：", error.message)
    return false
  }
}

async function testWorkspaceRendering() {
  console.log("\n3️⃣ 測試 Workspace 渲染邏輯...")
  try {
    const response = await fetch(BASE_URL)
    const html = await response.text()

    // 檢查是否包含修復代碼
    const hasClearContainer = html.includes('container.innerHTML = ""')
    const hasEventBoundCheck = html.includes("settingsEventBound")
    const hasDebounce = html.includes("debounce(")
    const hasFixDuplicates = html.includes("fixDuplicateWorkspaces")

    console.log("✅ Workspace 渲染檢查：")
    console.log(`   🗑️ 清空容器邏輯: ${hasClearContainer}`)
    console.log(`   🔒 事件綁定保護: ${hasEventBoundCheck}`)
    console.log(`   ⏱️ 防抖處理: ${hasDebounce}`)
    console.log(`   🔧 重複修復: ${hasFixDuplicates}`)

    const allChecks = hasClearContainer && hasEventBoundCheck && hasDebounce && hasFixDuplicates
    console.log(`   📊 總計: ${allChecks ? "✅ 全部通過" : "❌ 缺少修復"}`)

    return allChecks
  } catch (error) {
    console.log("❌ 測試錯誤：", error.message)
    return false
  }
}

async function runTests() {
  console.log(`🌐 前端服務器: ${BASE_URL}`)
  console.log(`🔧 API 服務器: ${API_URL}`)

  const corsTest = await testCors()
  const htmlTest = await testHtmlLoading()
  const renderTest = await testWorkspaceRendering()

  console.log("\n" + "=".repeat(50))
  console.log("📊 測試結果總結：")
  console.log(`   CORS 修復: ${corsTest ? "✅" : "❌"}`)
  console.log(`   HTML 載入: ${htmlTest ? "✅" : "❌"}`)
  console.log(`   渲染修復: ${renderTest ? "✅" : "❌"}`)

  const allPassed = corsTest && htmlTest && renderTest
  console.log(`   整體狀態: ${allPassed ? "🎉 所有測試通過！" : "⚠️ 需要檢查"}`)

  if (allPassed) {
    console.log("\n🚀 現在可以在瀏覽器中訪問:")
    console.log(`   http://100.94.136.15:9102/`)
    console.log("\n🧪 手動測試:")
    console.log("1. 打開上面的 URL")
    console.log("2. 多次點擊 Settings 按鈕")
    console.log("3. 確認 workspace 項目不會重複")
    console.log("4. 檢查 MCP 狀態正確載入")
  }

  return allPassed
}

runTests().catch(console.error)
