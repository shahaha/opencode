import puppeteer from "puppeteer"
import { CodeChecks } from "./checks/code-checks.js"
import { DomChecks } from "./checks/dom-checks.js"
import { FunctionalChecks } from "./checks/functional-checks.js"
import { PerformanceChecks } from "./checks/performance-checks.js"
import { SecurityChecks } from "./checks/security-checks.js"
import { ConsoleReporter } from "./reporters/console-reporter.js"
import { JsonReporter } from "./reporters/json-reporter.js"

export class RepairVerifier {
  constructor(config = {}) {
    this.config = {
      url: config.url || "http://100.94.136.15:9100/",
      timeout: config.timeout || 30000,
      retries: config.retries || 3,
      checks: config.checks || ["code", "dom", "functional", "security"],
      reporters: config.reporters || ["console"],
      enableCaching: config.enableCaching ?? true,
      cacheTtl: config.cacheTtl || 300000,
      concurrentChecks: config.concurrentChecks ?? true,
      ...config,
    }

    this.checkModules = {
      code: new CodeChecks(),
      dom: new DomChecks(),
      functional: new FunctionalChecks(),
      performance: new PerformanceChecks(),
      security: new SecurityChecks(),
    }

    this.reporters = {
      console: new ConsoleReporter(),
      json: new JsonReporter(),
    }

    this.resultCache = new Map()
    this.browserPool = []
  }

  async verifyFrontendRepairs(customUrl = null) {
    const url = customUrl || this.config.url
    const startTime = Date.now()

    // Check cache first
    if (this.config.enableCaching) {
      const cachedResult = this.getCachedResult(url)
      if (cachedResult) {
        console.log(`🔧 Using cached result for: ${url}`)
        return cachedResult
      }
    }

    console.log(`🔧 Starting repair verification for: ${url}`)

    let browser
    try {
      // Get browser from pool or create new one
      browser = await this.getBrowser()

      // Create page
      const page = await browser.newPage()
      await page.setViewport({ width: 1280, height: 720 })

      // Navigate to URL
      console.log(`📄 Loading page: ${url}`)
      await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: this.config.timeout,
      })

      // Run all enabled checks
      const results = {}
      const enabledChecks = this.config.checks

      console.log(`🧪 Running ${enabledChecks.length} check categories...`)

      if (this.config.concurrentChecks) {
        // Run checks concurrently
        const checkPromises = enabledChecks
          .map(async (checkType) => {
            if (this.checkModules[checkType]) {
              console.log(`  📋 Running ${checkType} checks...`)
              const result = await this.runCheckWithRetry(page, this.checkModules[checkType], checkType)
              return { checkType, result }
            }
            return null
          })
          .filter(Boolean)

        const checkResults = await Promise.all(checkPromises)
        checkResults.forEach(({ checkType, result }) => {
          results[checkType] = result
        })
      } else {
        // Run checks sequentially (original behavior)
        for (const checkType of enabledChecks) {
          if (this.checkModules[checkType]) {
            console.log(`  📋 Running ${checkType} checks...`)
            results[checkType] = await this.runCheckWithRetry(page, this.checkModules[checkType], checkType)
          }
        }
      }

      // Calculate overall success
      const allResults = Object.values(results).flat()
      const success = allResults.every((result) => result.passed)
      const totalChecks = allResults.length
      const passedChecks = allResults.filter((r) => r.passed).length

      const report = {
        success,
        url,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        summary: {
          total: totalChecks,
          passed: passedChecks,
          failed: totalChecks - passedChecks,
          successRate: totalChecks > 0 ? ((passedChecks / totalChecks) * 100).toFixed(1) + "%" : "0%",
        },
        results,
        config: this.config,
      }

      this.setCachedResult(url, report)

      // Generate reports
      for (const reporterName of this.config.reporters) {
        if (this.reporters[reporterName]) {
          await this.reporters[reporterName].generate(report)
        }
      }

      console.log(`✅ Repair verification completed: ${passedChecks}/${totalChecks} checks passed`)

      return report
    } catch (error) {
      console.error("❌ Repair verification failed:", error.message)

      const errorReport = {
        success: false,
        url,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        error: error.message,
        config: this.config,
      }

      // Generate error reports
      for (const reporterName of this.config.reporters) {
        if (this.reporters[reporterName]) {
          await this.reporters[reporterName].generate(errorReport)
        }
      }

      throw error
    } finally {
      if (browser) {
        await this.returnBrowser(browser)
      }
    }
  }

  async runCheckWithRetry(page, checkModule, checkType) {
    const maxRetries = this.config.retries

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const results = await checkModule.run(page)
        return Array.isArray(results) ? results : [results]
      } catch (error) {
        console.warn(`  ⚠️  ${checkType} check attempt ${attempt}/${maxRetries} failed:`, error.message)

        if (attempt === maxRetries) {
          // Return failed result on last attempt
          return [
            {
              name: `${checkType}_check`,
              passed: false,
              error: error.message,
              attempt,
            },
          ]
        }

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
      }
    }
  }

  // Utility method to run quick checks
  async quickCheck(url, checks = ["code"]) {
    const originalConfig = { ...this.config }
    this.config.checks = checks
    this.config.reporters = ["console"]

    try {
      return await this.verifyFrontendRepairs(url)
    } finally {
      this.config = originalConfig
    }
  }

  getCachedResult(url) {
    if (!this.config.enableCaching) return null

    const cacheKey = `${url}:${JSON.stringify(this.config.checks)}`
    const cached = this.resultCache.get(cacheKey)

    if (cached && Date.now() - cached.timestamp < this.config.cacheTtl) {
      return cached.result
    }

    if (cached) {
      this.resultCache.delete(cacheKey)
    }

    return null
  }

  setCachedResult(url, result) {
    if (!this.config.enableCaching) return

    const cacheKey = `${url}:${JSON.stringify(this.config.checks)}`
    this.resultCache.set(cacheKey, {
      result,
      timestamp: Date.now(),
    })
  }

  async getBrowser() {
    if (this.browserPool.length > 0) {
      const browser = this.browserPool.pop()
      try {
        await browser.version()
        return browser
      } catch (error) {
        console.log("Browser from pool is dead, creating new one")
      }
    }

    return await puppeteer.launch({
      headless: true,
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
    })
  }

  async returnBrowser(browser) {
    if (this.browserPool.length < 3) {
      try {
        await browser.version()
        this.browserPool.push(browser)
        return
      } catch (error) {
        // Browser is dead, don't add to pool
      }
    }

    try {
      await browser.close()
    } catch (error) {
      // Ignore close errors
    }
  }

  async cleanup() {
    this.resultCache.clear()

    for (const browser of this.browserPool) {
      try {
        await browser.close()
      } catch (error) {
        // Ignore close errors
      }
    }
    this.browserPool = []
  }
}
