export class JsonReporter {
  constructor(outputPath = "verification-results.json") {
    this.outputPath = outputPath
  }

  async generate(report) {
    try {
      // Create detailed JSON report
      const jsonReport = {
        metadata: {
          generatedAt: new Date().toISOString(),
          version: "1.0.0",
          generator: "OpenCode Repair Verifier",
        },
        verification: {
          url: report.url,
          timestamp: report.timestamp,
          duration: report.duration,
          config: report.config,
        },
        summary: report.summary,
        results: report.results,
        analysis: this.analyzeResults(report),
      }

      // Write to file (in Node.js environment)
      if (typeof process !== "undefined" && process.cwd) {
        const fs = await import("fs/promises")
        const path = await import("path")

        const fullPath = path.resolve(process.cwd(), this.outputPath)
        await fs.writeFile(fullPath, JSON.stringify(jsonReport, null, 2), "utf8")

        console.log(`📄 JSON 報告已保存到: ${fullPath}`)
      } else {
        // Browser environment - log to console
        console.log("📄 JSON 報告:", JSON.stringify(jsonReport, null, 2))
      }

      return jsonReport
    } catch (error) {
      console.error("生成 JSON 報告時出錯:", error)
      throw error
    }
  }

  analyzeResults(report) {
    const analysis = {
      categories: {},
      recommendations: [],
      criticalIssues: [],
      warnings: [],
    }

    // Analyze by category
    report.results.forEach((result) => {
      const category = this.categorizeResult(result)
      if (!analysis.categories[category]) {
        analysis.categories[category] = {
          total: 0,
          passed: 0,
          failed: 0,
          results: [],
        }
      }

      analysis.categories[category].total++
      if (result.passed) {
        analysis.categories[category].passed++
      } else {
        analysis.categories[category].failed++
        analysis.categories[category].results.push(result)
      }
    })

    // Generate recommendations
    analysis.recommendations = this.generateRecommendations(analysis.categories)

    // Identify critical issues
    analysis.criticalIssues = this.identifyCriticalIssues(report.results)

    // Generate warnings
    analysis.warnings = this.generateWarnings(report.results)

    return analysis
  }

  categorizeResult(result) {
    if (result.pattern) return "code"
    if (result.selector) return "dom"
    if (result.actionsExecuted) return "functional"
    if (result.maxTime) return "performance"
    return "other"
  }

  generateRecommendations(categories) {
    const recommendations = []

    Object.entries(categories).forEach(([category, stats]) => {
      const passRate = stats.passed / stats.total

      if (passRate < 0.8) {
        recommendations.push({
          category,
          priority: "high",
          message: `${category} 檢查通過率只有 ${(passRate * 100).toFixed(1)}%，需要重點關注`,
          actions: this.getCategoryRecommendations(category),
        })
      } else if (passRate < 1.0) {
        recommendations.push({
          category,
          priority: "medium",
          message: `${category} 檢查還有改進空間`,
          actions: this.getCategoryRecommendations(category),
        })
      }
    })

    return recommendations
  }

  getCategoryRecommendations(category) {
    const recommendations = {
      code: ["檢查修復代碼是否正確應用", "驗證代碼模式匹配規則", "確認腳本載入順序"],
      dom: ["檢查 HTML 元素 ID 和類名", "驗證 DOM 結構完整性", "確認動態內容生成"],
      functional: ["測試用戶交互流程", "檢查事件處理器綁定", "驗證狀態管理邏輯"],
      performance: ["優化資源載入", "檢查代碼執行效率", "監控記憶體使用"],
    }

    return recommendations[category] || ["檢查相關配置和實現"]
  }

  identifyCriticalIssues(results) {
    return results
      .filter((result) => !result.passed)
      .filter((result) => this.isCritical(result))
      .map((result) => ({
        name: result.name,
        category: this.categorizeResult(result),
        description: result.description,
        error: result.error,
        impact: this.assessImpact(result),
      }))
  }

  isCritical(result) {
    // Define what constitutes a critical issue
    const criticalPatterns = ["cors", "container_clearing", "event_protection", "settings_button"]

    return criticalPatterns.some((pattern) => result.name.includes(pattern) || result.description?.includes(pattern))
  }

  assessImpact(result) {
    if (result.name.includes("cors")) return "high"
    if (result.name.includes("container_clearing")) return "high"
    if (result.name.includes("settings")) return "medium"
    return "low"
  }

  generateWarnings(results) {
    const warnings = []

    // Check for performance issues
    const performanceIssues = results.filter((r) => r.maxTime && r.measuredTime > r.maxTime * 1.5)

    if (performanceIssues.length > 0) {
      warnings.push({
        type: "performance",
        message: `${performanceIssues.length} 項性能檢查超出預期時間 50%`,
        details: performanceIssues.map((r) => `${r.name}: ${r.measuredTime}ms > ${r.maxTime}ms`),
      })
    }

    // Check for retry attempts
    const retryResults = results.filter((r) => r.attempt && r.attempt > 1)
    if (retryResults.length > 0) {
      warnings.push({
        type: "reliability",
        message: `${retryResults.length} 項檢查需要重試，表明系統穩定性問題`,
        details: retryResults.map((r) => `${r.name} 重試了 ${r.attempt - 1} 次`),
      })
    }

    return warnings
  }
}
