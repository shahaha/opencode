#!/usr/bin/env node

import { RepairVerifier } from "./repair-verifier/index.js"

async function testIntelligentDiagnostics() {
  console.log("🧠 測試智能診斷系統...\n")

  const verifier = new RepairVerifier({
    url: "http://100.94.136.15:9100/",
    checks: ["intelligent"],
    reporters: ["console"],
    timeout: 30000,
  })

  try {
    const result = await verifier.verifyFrontendRepairs()
    console.log("\n✅ 智能診斷測試完成")
    console.log(`整體分數: ${result.results.intelligent[0].score}/100`)
    console.log(`發現問題: ${result.results.intelligent[0].issues} 個`)

    if (result.results.intelligent[0].recommendations) {
      console.log("\n📋 修復建議:")
      result.results.intelligent[0].recommendations.forEach((rec, i) => {
        console.log(`  ${i + 1}. [${rec.priority.toUpperCase()}] ${rec.action}`)
        if (rec.issues) {
          rec.issues.slice(0, 2).forEach((issue) => {
            console.log(`     - ${issue}`)
          })
        }
      })
    }
  } catch (error) {
    console.error("❌ 智能診斷測試失敗:", error.message)
  }
}

testIntelligentDiagnostics()
