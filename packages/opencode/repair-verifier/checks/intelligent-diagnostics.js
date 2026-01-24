export class IntelligentDiagnostics {
  constructor(config = {}) {
    this.config = {
      enablePatternMatching: config.enablePatternMatching ?? true,
      enableErrorAnalysis: config.enableErrorAnalysis ?? true,
      enableNetworkAnalysis: config.enableNetworkAnalysis ?? true,
      enablePerformanceAnalysis: config.enablePerformanceAnalysis ?? true,
      ...config,
    }

    this.errorPatterns = this.loadErrorPatterns()
  }

  loadErrorPatterns() {
    return {
      // JavaScript 錯誤模式
      javascript: {
        SyntaxError: {
          pattern: /SyntaxError:\s*(.+)/,
          severity: "high",
          suggestions: ["檢查 JavaScript 語法錯誤", "驗證變數和函數名稱拼寫", "檢查括號和分號匹配"],
        },
        ReferenceError: {
          pattern: /ReferenceError:\s*(.+)/,
          severity: "high",
          suggestions: ["檢查變數是否已宣告", "驗證 DOM 元素 ID 是否正確", "檢查函數是否已定義"],
        },
        TypeError: {
          pattern: /TypeError:\s*(.+)/,
          severity: "medium",
          suggestions: ["檢查物件屬性是否存在", "驗證函數參數類型", "檢查 null/undefined 值"],
        },
      },

      // 網路錯誤模式
      network: {
        "Failed to fetch": {
          pattern: /Failed to fetch/i,
          severity: "high",
          suggestions: ["檢查網路連接", "驗證 API 端點 URL", "檢查 CORS 設定", "確認服務器是否運行"],
        },
        404: {
          pattern: /404|Not Found/i,
          severity: "high",
          suggestions: ["檢查 API 端點路徑", "驗證服務器路由設定", "確認資源是否存在"],
        },
        CORS: {
          pattern: /CORS|cross-origin/i,
          severity: "medium",
          suggestions: ["檢查服務器 CORS 設定", "驗證請求標頭", "考慮使用代理端點"],
        },
      },

      // DOM 錯誤模式
      dom: {
        null: {
          pattern: /getElementById.*null|querySelector.*null/i,
          severity: "medium",
          suggestions: ["檢查 HTML 元素 ID 是否正確", "驗證 DOM 元素是否存在", "檢查 JavaScript 執行時機"],
        },
        undefined: {
          pattern: /undefined is not a function|cannot read property/i,
          severity: "medium",
          suggestions: ["檢查變數初始化", "驗證物件屬性存在", "檢查函數定義"],
        },
      },
    }
  }

  async analyzeDiagnostics(page) {
    const results = {
      overall: { score: 100, issues: [] },
      categories: {
        errors: { score: 100, issues: [] },
        network: { score: 100, issues: [] },
        performance: { score: 100, issues: [] },
        functionality: { score: 100, issues: [] },
      },
      recommendations: [],
    }

    try {
      // 分析 JavaScript 錯誤
      const errorAnalysis = await this.analyzeJavaScriptErrors(page)
      results.categories.errors = errorAnalysis

      // 分析網路請求
      const networkAnalysis = await this.analyzeNetworkRequests(page)
      results.categories.network = networkAnalysis

      // 分析效能
      const performanceAnalysis = await this.analyzePerformance(page)
      results.categories.performance = performanceAnalysis

      // 分析功能性
      const functionalityAnalysis = await this.analyzeFunctionality(page)
      results.categories.functionality = functionalityAnalysis

      // 計算整體分數
      results.overall = this.calculateOverallScore(results.categories)

      // 生成建議
      results.recommendations = this.generateRecommendations(results.categories)
    } catch (error) {
      console.error("Intelligent diagnostics analysis failed:", error)
      results.overall.score = 0
      results.overall.issues.push({
        type: "diagnostic_error",
        severity: "high",
        message: `診斷分析失敗: ${error.message}`,
        suggestions: ["檢查診斷系統設定", "查看瀏覽器控制台"],
      })
    }

    return results
  }

  async analyzeJavaScriptErrors(page) {
    const issues = []
    let score = 100

    try {
      // 獲取控制台錯誤
      const consoleMessages = await page.evaluate(() => {
        // 模擬獲取控制台訊息 (實際上需要從 browser-diagnostics 獲取)
        return window.consoleMessages || []
      })

      // 分析每個錯誤訊息
      consoleMessages.forEach((message) => {
        if (message.level === "error") {
          const issue = this.analyzeErrorMessage(message.text)
          if (issue) {
            issues.push(issue)
            score -= this.getSeverityPenalty(issue.severity)
          }
        }
      })

      // 檢查是否有語法錯誤
      const syntaxErrors = consoleMessages.filter((msg) => msg.level === "error" && msg.text.includes("SyntaxError"))

      if (syntaxErrors.length > 0) {
        issues.push({
          type: "syntax_error",
          severity: "critical",
          message: `發現 ${syntaxErrors.length} 個語法錯誤`,
          suggestions: ["檢查 JavaScript 語法", "驗證變數宣告", "檢查括號匹配"],
        })
        score -= 50
      }
    } catch (error) {
      issues.push({
        type: "analysis_error",
        severity: "medium",
        message: "無法分析 JavaScript 錯誤",
        suggestions: ["檢查瀏覽器診斷設定"],
      })
    }

    return {
      score: Math.max(0, score),
      issues,
    }
  }

  async analyzeNetworkRequests(page) {
    const issues = []
    let score = 100

    try {
      // 檢查網路請求
      const networkRequests = await page.evaluate(() => {
        return window.networkRequests || []
      })

      // 分析失敗的請求
      const failedRequests = networkRequests.filter((req) => req.status >= 400)

      failedRequests.forEach((request) => {
        const issue = {
          type: "network_error",
          severity: this.getNetworkErrorSeverity(request.status),
          message: `${request.method} ${request.url} 返回 ${request.status}`,
          suggestions: this.getNetworkErrorSuggestions(request.status),
        }
        issues.push(issue)
        score -= this.getSeverityPenalty(issue.severity)
      })

      // 檢查是否有 CORS 錯誤
      const corsErrors = networkRequests.filter((req) => req.error && req.error.includes("CORS"))

      if (corsErrors.length > 0) {
        issues.push({
          type: "cors_error",
          severity: "high",
          message: `發現 ${corsErrors.length} 個 CORS 錯誤`,
          suggestions: ["檢查服務器 CORS 設定", "驗證請求來源", "考慮使用代理端點"],
        })
        score -= 30
      }
    } catch (error) {
      issues.push({
        type: "network_analysis_error",
        severity: "low",
        message: "無法分析網路請求",
        suggestions: ["檢查網路監控設定"],
      })
    }

    return {
      score: Math.max(0, score),
      issues,
    }
  }

  async analyzePerformance(page) {
    const issues = []
    let score = 100

    try {
      // 檢查頁面載入效能
      const performanceMetrics = await page.evaluate(() => {
        const perfData = performance.getEntriesByType("navigation")[0]
        return {
          loadTime: perfData.loadEventEnd - perfData.fetchStart,
          domContentLoaded: perfData.domContentLoadedEventEnd - perfData.fetchStart,
          firstPaint: performance.getEntriesByType("paint").find((p) => p.name === "first-paint")?.startTime || 0,
        }
      })

      // 分析載入時間
      if (performanceMetrics.loadTime > 5000) {
        issues.push({
          type: "slow_loading",
          severity: "medium",
          message: `頁面載入時間過慢: ${Math.round(performanceMetrics.loadTime)}ms`,
          suggestions: ["優化資源載入", "壓縮圖片和資源", "檢查網路延遲"],
        })
        score -= 20
      }

      if (performanceMetrics.domContentLoaded > 3000) {
        issues.push({
          type: "slow_dom",
          severity: "low",
          message: `DOM 建構時間過慢: ${Math.round(performanceMetrics.domContentLoaded)}ms`,
          suggestions: ["優化 JavaScript 執行", "減少同步腳本", "檢查大型 DOM 操作"],
        })
        score -= 10
      }
    } catch (error) {
      issues.push({
        type: "performance_analysis_error",
        severity: "low",
        message: "無法分析效能指標",
        suggestions: ["檢查效能監控設定"],
      })
    }

    return {
      score: Math.max(0, score),
      issues,
    }
  }

  async analyzeFunctionality(page) {
    const issues = []
    let score = 100

    try {
      // 檢查關鍵功能元素是否存在
      const elements = await page.evaluate(() => {
        return {
          settingsBtn: !!document.getElementById("settingsBtn"),
          messageInput: !!document.getElementById("messageInput"),
          sendButton: !!document.getElementById("sendButton"),
          chatMessages: !!document.getElementById("chatMessages"),
          modelSelect: !!document.getElementById("modelSelect"),
        }
      })

      const missingElements = Object.entries(elements)
        .filter(([key, exists]) => !exists)
        .map(([key]) => key)

      if (missingElements.length > 0) {
        issues.push({
          type: "missing_elements",
          severity: "high",
          message: `缺少關鍵 UI 元素: ${missingElements.join(", ")}`,
          suggestions: ["檢查 HTML 結構", "驗證元素 ID 拼寫", "確認 JavaScript 載入順序"],
        })
        score -= 40
      }

      // 檢查 JavaScript 錯誤影響功能
      const jsErrors = await page.evaluate(() => {
        return (window.jsErrors || []).length
      })

      if (jsErrors > 0) {
        issues.push({
          type: "javascript_errors",
          severity: "high",
          message: `發現 ${jsErrors} 個 JavaScript 錯誤`,
          suggestions: ["檢查瀏覽器控制台", "修復語法錯誤", "驗證函數定義"],
        })
        score -= 30
      }
    } catch (error) {
      issues.push({
        type: "functionality_analysis_error",
        severity: "medium",
        message: "無法分析功能性",
        suggestions: ["檢查頁面載入狀態"],
      })
    }

    return {
      score: Math.max(0, score),
      issues,
    }
  }

  analyzeErrorMessage(message) {
    // 遍歷所有錯誤模式
    for (const [category, patterns] of Object.entries(this.errorPatterns)) {
      for (const [errorType, config] of Object.entries(patterns)) {
        const match = message.match(config.pattern)
        if (match) {
          return {
            type: `${category}_${errorType.toLowerCase()}`,
            severity: config.severity,
            message: message,
            suggestions: config.suggestions,
            category,
          }
        }
      }
    }

    // 如果沒有匹配的模式，返回通用錯誤
    return {
      type: "unknown_error",
      severity: "low",
      message: message,
      suggestions: ["檢查瀏覽器控制台獲取詳細資訊"],
    }
  }

  getSeverityPenalty(severity) {
    switch (severity) {
      case "critical":
        return 50
      case "high":
        return 30
      case "medium":
        return 15
      case "low":
        return 5
      default:
        return 10
    }
  }

  getNetworkErrorSeverity(status) {
    if (status >= 500) return "high"
    if (status >= 400) return "medium"
    return "low"
  }

  getNetworkErrorSuggestions(status) {
    if (status === 404) {
      return ["檢查 API 端點路徑", "驗證服務器路由", "確認資源是否存在"]
    }
    if (status === 403) {
      return ["檢查認證權限", "驗證 API 金鑰", "確認請求標頭"]
    }
    if (status === 500) {
      return ["檢查服務器日誌", "驗證後端程式碼", "確認資料庫連接"]
    }
    return ["檢查網路連接", "驗證請求格式", "確認服務器狀態"]
  }

  calculateOverallScore(categories) {
    const weights = {
      errors: 0.4, // 錯誤最重要
      network: 0.3, // 網路其次
      performance: 0.15, // 效能重要但較低
      functionality: 0.15, // 功能性
    }

    let totalScore = 0
    let totalIssues = []

    for (const [category, data] of Object.entries(categories)) {
      totalScore += data.score * weights[category]
      totalIssues.push(...data.issues)
    }

    return {
      score: Math.round(totalScore),
      issues: totalIssues,
    }
  }

  generateRecommendations(categories) {
    const recommendations = []

    // 根據問題類型生成建議
    const allIssues = Object.values(categories).flatMap((cat) => cat.issues)

    // 優先處理高嚴重性問題
    const criticalIssues = allIssues.filter((issue) => issue.severity === "critical")
    const highIssues = allIssues.filter((issue) => issue.severity === "high")

    if (criticalIssues.length > 0) {
      recommendations.push({
        priority: "critical",
        action: "立即修復關鍵錯誤",
        issues: criticalIssues.map((i) => i.message),
      })
    }

    if (highIssues.length > 0) {
      recommendations.push({
        priority: "high",
        action: "修復高優先級問題",
        issues: highIssues.map((i) => i.message),
      })
    }

    // 檢查常見模式
    const networkErrors = allIssues.filter((i) => i.type.includes("network"))
    if (networkErrors.length >= 3) {
      recommendations.push({
        priority: "high",
        action: "檢查網路設定和 API 端點",
        reason: "發現多個網路相關錯誤",
      })
    }

    const jsErrors = allIssues.filter((i) => i.type.includes("javascript") || i.type.includes("syntax"))
    if (jsErrors.length >= 2) {
      recommendations.push({
        priority: "high",
        action: "檢查 JavaScript 程式碼品質",
        reason: "發現多個 JavaScript 錯誤",
      })
    }

    return recommendations
  }

  async run(page) {
    console.log("🔍 開始智能診斷分析...")
    const results = await this.analyzeDiagnostics(page)

    console.log(`📊 診斷完成 - 整體分數: ${results.overall.score}/100`)
    console.log(`📋 發現 ${results.overall.issues.length} 個問題`)

    // 記錄詳細結果
    for (const [category, data] of Object.entries(results.categories)) {
      if (data.issues.length > 0) {
        console.log(`  ${category}: ${data.score}/100 (${data.issues.length} 個問題)`)
        data.issues.slice(0, 3).forEach((issue) => {
          console.log(`    - ${issue.message}`)
        })
      }
    }

    return [
      {
        name: "intelligent_diagnostics",
        passed: results.overall.score >= 70,
        score: results.overall.score,
        issues: results.overall.issues.length,
        recommendations: results.recommendations,
        details: results,
      },
    ]
  }
}
