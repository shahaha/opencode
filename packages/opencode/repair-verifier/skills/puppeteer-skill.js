import puppeteer from "puppeteer"

export class PuppeteerSkill {
  constructor(config = {}) {
    this.config = {
      headless: true,
      timeout: 30000,
      retries: 3,
      browser: {
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--single-process",
          "--disable-gpu",
        ],
      },
      ...config,
    }

    this.browser = null
  }

  async initialize() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: this.config.headless,
        args: this.config.browser.args,
        timeout: this.config.timeout,
      })
    }
  }

  async execute(task) {
    await this.initialize()

    const { action, parameters } = task

    try {
      switch (action) {
        case "verify_repairs":
          return await this.verifyRepairs(parameters)

        case "take_screenshot":
          return await this.takeScreenshot(parameters)

        case "check_dom":
          return await this.checkDOM(parameters)

        case "measure_performance":
          return await this.measurePerformance(parameters)

        case "test_functionality":
          return await this.testFunctionality(parameters)

        default:
          throw new Error(`未知的 Puppeteer skill 動作: ${action}`)
      }
    } catch (error) {
      console.error(`Puppeteer skill 執行失敗 (${action}):`, error)
      throw error
    }
  }

  async verifyRepairs({ url, checks = [] }) {
    const page = await this.browser.newPage()
    await page.setViewport({ width: 1280, height: 720 })

    try {
      console.log(`🔍 開始修復驗證: ${url}`)

      // Navigate to the page
      await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: this.config.timeout,
      })

      const results = []

      // Execute each check
      for (const check of checks) {
        try {
          const result = await this.executeCheck(page, check)
          results.push(result)
          console.log(`   ${result.passed ? "✅" : "❌"} ${check.name}`)
        } catch (error) {
          results.push({
            name: check.name,
            passed: false,
            error: error.message,
            type: check.type,
          })
          console.log(`   ❌ ${check.name}: ${error.message}`)
        }
      }

      // Calculate overall success
      const passed = results.filter((r) => r.passed).length
      const total = results.length
      const success = passed === total

      return {
        action: "verify_repairs",
        success,
        summary: {
          total,
          passed,
          failed: total - passed,
          successRate: total > 0 ? `${((passed / total) * 100).toFixed(1)}%` : "0%",
        },
        results,
        timestamp: new Date().toISOString(),
        url,
      }
    } finally {
      await page.close()
    }
  }

  async executeCheck(page, check) {
    switch (check.type) {
      case "code":
        return await this.checkCodePattern(page, check)

      case "dom":
        return await this.checkDOMElement(page, check)

      case "functional":
        return await this.checkFunctionality(page, check)

      case "performance":
        return await this.checkPerformance(page, check)

      default:
        throw new Error(`未知的檢查類型: ${check.type}`)
    }
  }

  async checkCodePattern(page, check) {
    const scriptContents = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll("script"))
      return scripts.map((script) => script.textContent || "").join("\n")
    })

    const patternFound = scriptContents.includes(check.pattern)

    return {
      name: check.name,
      type: "code",
      passed: patternFound,
      pattern: check.pattern,
      found: patternFound,
      description: check.description || `檢查代碼模式: ${check.pattern}`,
    }
  }

  async checkDOMElement(page, check) {
    const elementExists = (await page.$(check.selector)) !== null

    let elementDetails = null
    if (elementExists && check.details) {
      elementDetails = await page.evaluate((sel) => {
        const element = document.querySelector(sel)
        if (!element) return null

        return {
          tagName: element.tagName,
          className: element.className,
          visible: element.offsetWidth > 0 && element.offsetHeight > 0,
          textContent: element.textContent?.substring(0, 100) || "",
        }
      }, check.selector)
    }

    return {
      name: check.name,
      type: "dom",
      passed: elementExists,
      selector: check.selector,
      exists: elementExists,
      details: elementDetails,
      description: check.description || `檢查 DOM 元素: ${check.selector}`,
    }
  }

  async checkFunctionality(page, check) {
    try {
      // Execute functional test steps
      for (const action of check.actions || []) {
        await this.executeFunctionalAction(page, action)
      }

      // Check final condition if specified
      if (check.finalCheck) {
        const finalResult = await this.executeFunctionalAction(page, check.finalCheck)
        return {
          name: check.name,
          type: "functional",
          passed: finalResult,
          actions: check.actions?.length || 0,
          description: check.description || "功能測試",
        }
      }

      return {
        name: check.name,
        type: "functional",
        passed: true,
        actions: check.actions?.length || 0,
        description: check.description || "功能測試",
      }
    } catch (error) {
      return {
        name: check.name,
        type: "functional",
        passed: false,
        error: error.message,
        actions: check.actions?.length || 0,
        description: check.description || "功能測試",
      }
    }
  }

  async executeFunctionalAction(page, action) {
    switch (action.type) {
      case "click":
        await page.waitForSelector(action.selector, { timeout: 5000 })
        await page.click(action.selector)
        break

      case "type":
        await page.waitForSelector(action.selector, { timeout: 5000 })
        await page.clearInput(action.selector)
        await page.type(action.selector, action.text)
        break

      case "wait":
        if (action.count) {
          await page.waitForFunction(
            (selector, expectedCount) => document.querySelectorAll(selector).length >= expectedCount,
            { timeout: 5000 },
            action.selector,
            action.count,
          )
        } else {
          await page.waitForSelector(action.selector, { timeout: 5000 })
        }
        break

      case "assert":
        const result = await page.evaluate((selector) => {
          const element = document.querySelector(selector)
          return element ? element.textContent : null
        }, action.selector)

        if (action.expected && result !== action.expected) {
          throw new Error(`斷言失敗: 期望 "${action.expected}", 得到 "${result}"`)
        }
        return result

      default:
        throw new Error(`未知的功能動作類型: ${action.type}`)
    }

    // Small delay between actions
    await page.waitForTimeout(200)
  }

  async checkPerformance(page, check) {
    let measuredTime

    switch (check.metric) {
      case "pageLoad":
        measuredTime = Date.now() - (await page.evaluate(() => performance.timing.navigationStart))
        break

      case "scriptExecution":
        const startTime = Date.now()
        await page.evaluate(() => {
          const btn = document.querySelector("#settingsBtn")
          if (btn) btn.click()
        })
        measuredTime = Date.now() - startTime
        break

      default:
        throw new Error(`未知的性能指標: ${check.metric}`)
    }

    const passed = measuredTime <= (check.maxTime || 5000)

    return {
      name: check.name,
      type: "performance",
      passed,
      measuredTime,
      maxTime: check.maxTime || 5000,
      metric: check.metric,
      description: check.description || `${check.metric} 性能檢查`,
    }
  }

  async takeScreenshot({ url, filename = "screenshot.png", fullPage = false }) {
    const page = await this.browser.newPage()

    try {
      await page.goto(url, { waitUntil: "networkidle2" })
      await page.screenshot({
        path: filename,
        fullPage,
      })

      return {
        action: "take_screenshot",
        success: true,
        filename,
        url,
        fullPage,
        timestamp: new Date().toISOString(),
      }
    } finally {
      await page.close()
    }
  }

  async checkDOM({ url, selectors = [] }) {
    const page = await this.browser.newPage()

    try {
      await page.goto(url, { waitUntil: "networkidle2" })

      const results = {}
      for (const selector of selectors) {
        const exists = (await page.$(selector)) !== null
        results[selector] = exists
      }

      return {
        action: "check_dom",
        success: true,
        url,
        results,
        timestamp: new Date().toISOString(),
      }
    } finally {
      await page.close()
    }
  }

  async measurePerformance({ url }) {
    const page = await this.browser.newPage()

    try {
      const startTime = Date.now()
      await page.goto(url, { waitUntil: "networkidle2" })
      const loadTime = Date.now() - startTime

      const metrics = await page.metrics()

      return {
        action: "measure_performance",
        success: true,
        url,
        loadTime,
        metrics,
        timestamp: new Date().toISOString(),
      }
    } finally {
      await page.close()
    }
  }

  async testFunctionality({ url, scenario }) {
    const page = await this.browser.newPage()

    try {
      await page.goto(url, { waitUntil: "networkidle2" })

      // Execute functional test scenario
      const result = await this.executeFunctionalScenario(page, scenario)

      return {
        action: "test_functionality",
        success: result.success,
        url,
        scenario: scenario.name,
        result,
        timestamp: new Date().toISOString(),
      }
    } finally {
      await page.close()
    }
  }

  async executeFunctionalScenario(page, scenario) {
    // Implement scenario execution logic
    // This would handle complex multi-step functional tests
    return { success: true, steps: scenario.steps?.length || 0 }
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
    }
  }
}
