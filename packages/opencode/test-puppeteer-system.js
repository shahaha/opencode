#!/usr/bin/env node
// Test script for Puppeteer repair verification system

import { RepairVerifier } from "./repair-verifier/index.js"
import { PuppeteerSkill } from "./repair-verifier/skills/puppeteer-skill.js"
import { SkillRunner } from "./repair-verifier/skills/skill-runner.js"

async function testPuppeteerImplementation() {
  console.log("🧪 測試 Puppeteer 修復驗證系統")
  console.log("=====================================")

  const testUrl = "http://100.94.136.15:9100/"

  try {
    // Test 1: Direct RepairVerifier usage
    console.log("\n1️⃣ 測試 RepairVerifier 直接使用")
    const verifier = new RepairVerifier({
      url: testUrl,
      checks: ["code", "dom"],
      reporters: ["console"],
    })

    const directResult = await verifier.quickCheck(testUrl, ["code"])
    console.log(`✅ RepairVerifier 測試: ${directResult.success ? "通過" : "失敗"}`)
    console.log(`   檢查項目: ${directResult.summary.passed}/${directResult.summary.total}`)

    // Test 2: Puppeteer Skill direct usage
    console.log("\n2️⃣ 測試 PuppeteerSkill 直接使用")
    const puppeteerSkill = new PuppeteerSkill()

    const skillResult = await puppeteerSkill.execute({
      action: "verify_repairs",
      parameters: {
        url: testUrl,
        checks: [
          {
            name: "container_clearing",
            type: "code",
            pattern: 'container.innerHTML = ""',
            description: "檢查 DOM 清空修復",
          },
          {
            name: "settings_button",
            type: "dom",
            selector: "#settingsBtn",
            description: "檢查設置按鈕存在",
          },
        ],
      },
    })

    console.log(`✅ PuppeteerSkill 測試: ${skillResult.success ? "通過" : "失敗"}`)
    console.log(`   驗證結果: ${skillResult.summary.passed}/${skillResult.summary.total} 項檢查通過`)

    // Test 3: SkillRunner integration
    console.log("\n3️⃣ 測試 SkillRunner 集成")
    const skillRunner = new SkillRunner()
    skillRunner.registerSkill("puppeteer", PuppeteerSkill)

    const runnerResult = await skillRunner.verifyRepairs({
      url: testUrl,
      checks: [
        {
          name: "event_protection",
          type: "code",
          pattern: "settingsEventBound",
          description: "檢查事件保護機制",
        },
        {
          name: "chat_container",
          type: "dom",
          selector: ".chat-container",
          description: "檢查聊天容器",
        },
      ],
    })

    console.log(`✅ SkillRunner 測試: ${runnerResult.success ? "通過" : "失敗"}`)
    console.log(`   總檢查數: ${runnerResult.summary.total}`)
    console.log(`   通過數: ${runnerResult.summary.passed}`)
    console.log(`   成功率: ${runnerResult.summary.successRate}`)

    // Test 4: Screenshot capability
    console.log("\n4️⃣ 測試截圖功能")
    const screenshotResult = await puppeteerSkill.execute({
      action: "take_screenshot",
      parameters: {
        url: testUrl,
        filename: "repair-verification-screenshot.png",
        fullPage: false,
      },
    })

    console.log(`✅ 截圖測試: ${screenshotResult.success ? "通過" : "失敗"}`)
    if (screenshotResult.success) {
      console.log(`   截圖保存至: ${screenshotResult.filename}`)
    }

    // Test 5: DOM checking
    console.log("\n5️⃣ 測試 DOM 檢查功能")
    const domResult = await puppeteerSkill.execute({
      action: "check_dom",
      parameters: {
        url: testUrl,
        selectors: ["#settingsBtn", ".chat-container", "#messageInput"],
      },
    })

    console.log(`✅ DOM 檢查測試: ${domResult.success ? "通過" : "失敗"}`)
    if (domResult.success) {
      console.log("   元素檢查結果:")
      Object.entries(domResult.results).forEach(([selector, exists]) => {
        console.log(`     ${selector}: ${exists ? "✅ 存在" : "❌ 不存在"}`)
      })
    }

    // Cleanup
    await puppeteerSkill.cleanup()

    // Summary
    console.log("\n" + "=".repeat(50))
    console.log("📊 測試總結")
    console.log("=".repeat(50))

    const tests = [
      { name: "RepairVerifier 直接使用", result: directResult.success },
      { name: "PuppeteerSkill 直接使用", result: skillResult.success },
      { name: "SkillRunner 集成", result: runnerResult.success },
      { name: "截圖功能", result: screenshotResult.success },
      { name: "DOM 檢查功能", result: domResult.success },
    ]

    const passedTests = tests.filter((t) => t.result).length
    const totalTests = tests.length

    console.log(`總測試數: ${totalTests}`)
    console.log(`通過測試: ${passedTests}`)
    console.log(`失敗測試: ${totalTests - passedTests}`)
    console.log(`成功率: ${((passedTests / totalTests) * 100).toFixed(1)}%`)

    tests.forEach((test) => {
      console.log(`   ${test.result ? "✅" : "❌"} ${test.name}`)
    })

    console.log("\n" + "=".repeat(50))

    if (passedTests === totalTests) {
      console.log("🎉 所有測試通過！Puppeteer 修復驗證系統運行正常！")
      return true
    } else {
      console.log("⚠️ 部分測試失敗，需要檢查配置或代碼")
      return false
    }
  } catch (error) {
    console.error("❌ 測試過程中發生錯誤:", error)
    console.error("錯誤詳情:", error.stack)
    return false
  }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testPuppeteerImplementation()
    .then((success) => {
      process.exit(success ? 0 : 1)
    })
    .catch((error) => {
      console.error("測試腳本執行失敗:", error)
      process.exit(1)
    })
}

export { testPuppeteerImplementation }
