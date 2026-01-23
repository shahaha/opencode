export class CodeChecks {
  constructor(config = {}) {
    this.config = {
      checks: config.checks || this.getDefaultChecks(),
      ...config,
    }
  }

  getDefaultChecks() {
    return [
      {
        name: "container_clearing",
        pattern: 'container.innerHTML = ""',
        description: "檢查是否實現了 DOM 清空修復",
      },
      {
        name: "event_protection",
        pattern: "settingsEventBound",
        description: "檢查事件綁定保護機制",
      },
      {
        name: "debounce_function",
        pattern: "debounce(",
        description: "檢查防抖處理實現",
      },
      {
        name: "cors_mode",
        pattern: 'mode: "cors"',
        description: "檢查 CORS 請求配置",
      },
      {
        name: "duplicate_fix",
        pattern: "fixDuplicateWorkspaces",
        description: "檢查重複項目修復函數",
      },
    ]
  }

  async run(page) {
    const results = []

    for (const check of this.config.checks) {
      try {
        const result = await this.performCodeCheck(page, check)
        results.push(result)
      } catch (error) {
        results.push({
          name: check.name,
          passed: false,
          error: error.message,
          description: check.description,
        })
      }
    }

    return results
  }

  async performCodeCheck(page, check) {
    // Get all script contents
    const scriptContents = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll("script"))
      return scripts.map((script) => script.textContent || "").join("\n")
    })

    // Check if the pattern exists in the code
    const patternFound = scriptContents.includes(check.pattern)

    return {
      name: check.name,
      passed: patternFound,
      pattern: check.pattern,
      found: patternFound,
      description: check.description,
      codeLength: scriptContents.length,
    }
  }

  // Add custom check
  addCheck(name, pattern, description) {
    this.config.checks.push({
      name,
      pattern,
      description,
    })
  }

  // Remove check by name
  removeCheck(name) {
    this.config.checks = this.config.checks.filter((check) => check.name !== name)
  }

  // Update check pattern
  updateCheck(name, newPattern) {
    const check = this.config.checks.find((c) => c.name === name)
    if (check) {
      check.pattern = newPattern
    }
  }
}
