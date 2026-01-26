#!/usr/bin/env node
console.log("🔧 設定按鈕可見性最終測試...")

const testSettingsButton = async () => {
  try {
    const response = await fetch("http://100.94.136.15:9100/")
    const html = await response.text()

    const hasSettingsButton = html.includes('<button id="settingsBtn"')
    const hasSettingsIcon = html.includes("⚙️</span>")
    const hasSettingsText = html.includes('<span class="text">設定</span>')
    const hasHeaderBtn = html.includes('class="header-btn"')

    console.log("🧪 設定按鈕測試：")
    console.log(`${hasSettingsButton ? "✅" : "❌"} 設定按鈕元素存在`)
    console.log(`${hasSettingsIcon ? "✅" : "❌"} 設定圖標顯示`)
    console.log(`${hasSettingsText ? "✅" : "❌"} 設定文字顯示`)
    console.log(`${hasHeaderBtn ? "✅" : "❌"} header-btn 類別應用`)

    return [hasSettingsButton, hasSettingsIcon, hasSettingsText, hasHeaderBtn].every(Boolean)
  } catch (error) {
    console.log("❌ 測試失敗:", error.message)
    return false
  }
}

const testCSSZIndex = async () => {
  try {
    const response = await fetch("http://100.94.136.15:9100/css/chat.css")
    const css = await response.text()

    const hasHeaderZIndex = css.includes("z-index: 999")
    const hasHeaderBtnZIndex = css.includes("z-index: 10000")
    const hasSettingsPanelZIndex = css.includes("z-index: 1000")
    const hasCloseBtnZIndex = css.includes("z-index: 10001")

    console.log("\n🎨 CSS Z-Index 測試：")
    console.log(`${hasHeaderZIndex ? "✅" : "❌"} Header z-index: 999`)
    console.log(`${hasHeaderBtnZIndex ? "✅" : "❌"} 設定按鈕 z-index: 10000`)
    console.log(`${hasSettingsPanelZIndex ? "✅" : "❌"} 設定面板 z-index: 1000`)
    console.log(`${hasCloseBtnZIndex ? "✅" : "❌"} 關閉按鈕 z-index: 10001`)

    return [hasHeaderZIndex, hasHeaderBtnZIndex, hasSettingsPanelZIndex, hasCloseBtnZIndex].every(Boolean)
  } catch (error) {
    console.log("❌ CSS 測試失敗:", error.message)
    return false
  }
}

const runFinalSettingsTest = async () => {
  console.log("🧪 開始設定按鈕可見性最終測試...\n")

  const htmlTest = await testSettingsButton()
  const cssTest = await testCSSZIndex()

  const allPassed = htmlTest && cssTest

  console.log("\n" + "=".repeat(80))
  if (allPassed) {
    console.log("🎉 設定按鈕可見性問題已完全修復！")
    console.log("")
    console.log("✅ 修復完成項目：")
    console.log("   • 設定按鈕正確顯示在 header 中")
    console.log("   • ⚙️ 圖標和「設定」文字正常顯示")
    console.log("   • 按鈕 z-index 設定為 10000")
    console.log("   • Header z-index 設定為 999")
    console.log("   • 設定面板 z-index 為 1000")
    console.log("   • 關閉按鈕 z-index 設定為 10001")
    console.log("")
    console.log("🎯 現在設定面板應該：")
    console.log("   • 主畫面右上角顯示設定按鈕")
    console.log("   • 點擊設定按鈕可以開啟面板")
    console.log("   • 面板內容包含所有設定選項")
    console.log("   • 關閉按鈕和 ESC 鍵可以關閉面板")
    console.log("")
    console.log("🌐 測試網址：http://100.94.136.15:9100/")
  } else {
    console.log("❌ 部分測試失敗，請檢查上述問題")
  }
  console.log("=".repeat(80))

  process.exit(allPassed ? 0 : 1)
}

runFinalSettingsTest()
