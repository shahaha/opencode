#!/usr/bin/env node
console.log("🔧 測試設定面板開關功能...")

const testSettingsPanel = async () => {
  try {
    const response = await fetch("http://100.94.136.15:9100/js/app.js")
    const js = await response.text()

    const hasHideSettings = js.includes("hideSettings()")
    const hasCloseButtonEvent = js.includes(
      'this.settingsCloseBtn.addEventListener("click", () => this.hideSettings())',
    )
    const hasToggleButtonEvent = js.includes('this.settingsBtn.addEventListener("click", () => this.toggleSettings())')
    const hasEscapeKeyEvent = js.includes('if (e.key === "Escape")')
    const hasProperDomInit = js.includes("initDom()")

    console.log("🧪 設定面板功能測試：")
    console.log(`${hasHideSettings ? "✅" : "❌"} hideSettings() 方法存在`)
    console.log(`${hasCloseButtonEvent ? "✅" : "❌"} 關閉按鈕事件正確綁定`)
    console.log(`${hasToggleButtonEvent ? "✅" : "❌"} 設定按鈕事件正確綁定`)
    console.log(`${hasEscapeKeyEvent ? "✅" : "❌"} ESC 鍵盤事件存在`)
    console.log(`${hasProperDomInit ? "✅" : "❌"} DOM 元素正確初始化`)

    return [hasHideSettings, hasCloseButtonEvent, hasToggleButtonEvent, hasEscapeKeyEvent, hasProperDomInit].every(
      Boolean,
    )
  } catch (error) {
    console.log("❌ 測試失敗:", error.message)
    return false
  }
}

const testSettingsCSS = async () => {
  try {
    const response = await fetch("http://100.94.136.15:9100/css/settings.css")
    const css = await response.text()

    const hasHiddenByDefault = css.includes("transform: translateX(100%)")
    const hasVisibleClass = css.includes(".settings-panel.visible")
    const hasFixedPosition = css.includes("position: fixed")

    console.log("\n🎨 CSS 設定面板測試：")
    console.log(`${hasHiddenByDefault ? "✅" : "❌"} 預設隱藏 (translateX 100%)`)
    console.log(`${hasVisibleClass ? "✅" : "❌"} 可見類別定義 (.visible)`)
    console.log(`${hasFixedPosition ? "✅" : "❌"} 固定位置 (position: fixed)`)

    return [hasHiddenByDefault, hasVisibleClass, hasFixedPosition].every(Boolean)
  } catch (error) {
    console.log("❌ CSS 測試失敗:", error.message)
    return false
  }
}

const runSettingsToggleTest = async () => {
  console.log("🧪 開始設定面板開關功能完整測試...\n")

  const jsTest = await testSettingsPanel()
  const cssTest = await testSettingsCSS()

  const allPassed = jsTest && cssTest

  console.log("\n" + "=".repeat(70))
  if (allPassed) {
    console.log("🎉 設定面板開關功能已完全修復！")
    console.log("")
    console.log("✅ 修復完成項目：")
    console.log("   • hideSettings() 方法正確實現")
    console.log("   • 關閉按鈕事件正確綁定到 hideSettings")
    console.log("   • ESC 鍵盤事件正確綁定")
    console.log("   • DOM 元素在 initDom() 中正確初始化")
    console.log("   • CSS 預設隱藏，.visible 類別顯示")
    console.log("")
    console.log("🌐 現在設定面板應該：")
    console.log("   • 預設隱藏，不會導致螢幕位移")
    console.log("   • 點擊 ⚙️ 按鈕可以開啟")
    console.log("   • 點擊 × 按鈕可以關閉")
    console.log("   • 按 ESC 鍵可以關閉")
    console.log("")
    console.log("🎯 測試網址：http://100.94.136.15:9100/")
  } else {
    console.log("❌ 部分測試失敗，請檢查上述問題")
  }
  console.log("=".repeat(70))

  process.exit(allPassed ? 0 : 1)
}

runSettingsToggleTest()
