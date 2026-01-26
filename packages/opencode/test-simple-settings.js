#!/usr/bin/env node
console.log("🔧 測試設定按鈕是否可見...")

const testSettingsButton = async () => {
  try {
    const response = await fetch("http://100.94.136.15:9100/")
    const html = await response.text()

    const hasSettingsButton = html.includes('<button id="settingsBtn"')
    const hasIcon = html.includes("⚙️</span>")
    const hasText = html.includes("設定</span>")

    console.log("🧪 設定按鈕檢查：")
    console.log(`${hasSettingsButton ? "✅" : "❌"} 設定按鈕存在`)
    console.log(`${hasIcon ? "✅" : "❌"} 設定圖標存在`)
    console.log(`${hasText ? "✅" : "❌"} 設定文字存在`)

    return hasSettingsButton && hasIcon && hasText
  } catch (error) {
    console.log("❌ 測試失敗:", error.message)
    return false
  }
}

testSettingsButton().then((success) => {
  console.log("\n" + "=".repeat(60))
  if (success) {
    console.log("🎉 設定按鈕顯示正常！")
    console.log("")
    console.log("✅ 確認項目：")
    console.log("   • 設定按鈕在 HTML 中存在")
    console.log("   • ⚙️ 圖標顯示正常")
    console.log("   • 「設定」文字顯示正常")
    console.log("")
    console.log("🌐 現在請訪問：http://100.94.136.15:9100/")
  } else {
    console.log("❌ 設定按鈕仍有問題")
  }
  console.log("=".repeat(60))
})
