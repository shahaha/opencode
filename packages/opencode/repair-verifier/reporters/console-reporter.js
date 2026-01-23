export class ConsoleReporter {
  async generate(report) {
    console.log("\n" + "=".repeat(60))
    console.log("🔧 REPAIR VERIFICATION REPORT")
    console.log("=".repeat(60))

    console.log(`⏱️  總耗時: ${report.duration}ms`)
    console.log(`📅 時間: ${report.timestamp}`)
    console.log(`🌐 URL: ${report.url}`)

    if (report.error) {
      console.log(`❌ 錯誤: ${report.error}`)
      return
    }

    // Handle successful reports
    if (report.summary) {
      console.log(`📊 總結: ${report.summary.passed}/${report.summary.total} 項檢查通過`)
    }

    // Only show detailed results if we have successful verification
    if (report.results && Array.isArray(report.results) && report.results.length > 0) {
      console.log("\n📋 詳細結果:")

      // Group results by category
      const categories = {}
      report.results.forEach((result) => {
        const category = this.getCategoryFromResult(result)
        if (!categories[category]) {
          categories[category] = []
        }
        categories[category].push(result)
      })

      // Display results by category
      Object.entries(categories).forEach(([category, results]) => {
        console.log(`\n🏷️  ${category.toUpperCase()}:`)

        results.forEach((result) => {
          const status = result.passed ? "✅" : "❌"
          const duration = result.duration ? ` (${result.duration}ms)` : ""
          const error = result.error ? ` - ${result.error}` : ""

          console.log(`   ${status} ${result.name}${duration}${error}`)

          if (result.description) {
            console.log(`      ${result.description}`)
          }

          // Show additional details for failed checks
          if (!result.passed && result.details) {
            if (Array.isArray(result.details)) {
              result.details.forEach((detail) => {
                if (!detail.passed) {
                  console.log(`         ❌ ${detail.name}: ${detail.error || "Failed"}`)
                }
              })
            }
          }
        })
      })
    }

    console.log("\n" + "=".repeat(60))

    // Overall assessment
    const successRate = report.summary.successRate
    if (report.summary.passed === report.summary.total) {
      console.log("🎉 所有修復驗證通過！修復成功！")
    } else if (report.summary.passed / report.summary.total > 0.8) {
      console.log(`⚠️  大部分檢查通過 (${successRate})，但還有一些問題需要注意。`)
    } else {
      console.log(`❌ 修復驗證失敗 (${successRate})，需要重新檢查修復代碼。`)
    }

    console.log("=".repeat(60) + "\n")
  }

  getCategoryFromResult(result) {
    // Try to determine category from result structure
    if (result.pattern) return "代碼檢查"
    if (result.selector) return "DOM 檢查"
    if (result.actionsExecuted) return "功能檢查"
    if (result.maxTime) return "性能檢查"
    return "其他檢查"
  }
}
