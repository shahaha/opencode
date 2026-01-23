export class PerformanceChecks {
  constructor(config = {}) {
    this.config = {
      checks: config.checks || this.getDefaultChecks(),
      ...config,
    }
  }

  getDefaultChecks() {
    return [
      {
        name: "page_load_time",
        description: "檢查頁面載入時間是否在合理範圍內",
        maxTime: 5000, // 5 seconds
        metric: "pageLoad",
      },
      {
        name: "dom_content_loaded",
        description: "檢查 DOM 內容載入時間",
        maxTime: 3000, // 3 seconds
        metric: "domContent",
      },
      {
        name: "first_paint",
        description: "檢查首次繪製時間",
        maxTime: 2000, // 2 seconds
        metric: "firstPaint",
      },
      {
        name: "script_execution",
        description: "檢查關鍵功能執行時間",
        maxTime: 1000, // 1 second
        metric: "scriptExecution",
      },
    ]
  }

  async run(page) {
    const results = []

    for (const check of this.config.checks) {
      try {
        const result = await this.performPerformanceCheck(page, check)
        results.push(result)
      } catch (error) {
        results.push({
          name: check.name,
          passed: false,
          error: error.message,
          description: check.description,
          maxTime: check.maxTime,
        })
      }
    }

    return results
  }

  async performPerformanceCheck(page, check) {
    let measuredTime

    try {
      switch (check.metric) {
        case "pageLoad":
          measuredTime = await this.measurePageLoadTime(page)
          break

        case "domContent":
          measuredTime = await this.measureDomContentTime(page)
          break

        case "firstPaint":
          measuredTime = await this.measureFirstPaintTime(page)
          break

        case "scriptExecution":
          measuredTime = await this.measureScriptExecutionTime(page)
          break

        default:
          throw new Error(`Unknown performance metric: ${check.metric}`)
      }

      const passed = measuredTime <= check.maxTime

      return {
        name: check.name,
        passed,
        measuredTime,
        maxTime: check.maxTime,
        difference: measuredTime - check.maxTime,
        description: check.description,
        metric: check.metric,
      }
    } catch (error) {
      return {
        name: check.name,
        passed: false,
        error: error.message,
        description: check.description,
        metric: check.metric,
      }
    }
  }

  async measurePageLoadTime(page) {
    // Measure time from navigation start to load event
    const startTime = Date.now()

    // Wait for page to be fully loaded
    await page.waitForLoadState("networkidle2")

    return Date.now() - startTime
  }

  async measureDomContentTime(page) {
    // Measure DOM content loaded time
    return await page.evaluate(() => {
      return new Promise((resolve) => {
        if (document.readyState === "complete") {
          resolve(performance.now())
        } else {
          window.addEventListener("load", () => resolve(performance.now()))
        }
      })
    })
  }

  async measureFirstPaintTime(page) {
    // Measure first paint using Performance API
    return await page.evaluate(() => {
      return new Promise((resolve) => {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries()
          const paintEntry = entries.find((entry) => entry.name === "first-paint")
          if (paintEntry) {
            resolve(paintEntry.startTime)
            observer.disconnect()
          }
        })

        observer.observe({ entryTypes: ["paint"] })

        // Fallback timeout
        setTimeout(() => {
          observer.disconnect()
          resolve(performance.now())
        }, 5000)
      })
    })
  }

  async measureScriptExecutionTime(page) {
    // Measure time to execute a key function
    const startTime = Date.now()

    await page.evaluate(() => {
      // Execute key functionality
      const settingsBtn = document.querySelector("#settingsBtn")
      if (settingsBtn) {
        settingsBtn.click()
        // Wait for panel to show
        return new Promise((resolve) => {
          setTimeout(() => {
            const panel = document.querySelector(".settings-panel")
            if (panel) panel.click() // Close panel
            resolve()
          }, 500)
        })
      }
    })

    return Date.now() - startTime
  }

  // Add custom performance check
  addCheck(name, description, maxTime, metric) {
    this.config.checks.push({
      name,
      description,
      maxTime,
      metric,
    })
  }

  // Remove check by name
  removeCheck(name) {
    this.config.checks = this.config.checks.filter((check) => check.name !== name)
  }

  // Update check parameters
  updateCheck(name, updates) {
    const check = this.config.checks.find((c) => c.name === name)
    if (check) {
      Object.assign(check, updates)
    }
  }

  // Get performance summary
  async getPerformanceSummary(page) {
    const metrics = await page.metrics()
    const timing = await page.evaluate(() => performance.timing)

    return {
      pageMetrics: metrics,
      timing: {
        domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
        loadComplete: timing.loadEventEnd - timing.navigationStart,
        firstPaint: timing.domContentLoadedEventEnd - timing.navigationStart,
      },
    }
  }
}
