export class SecurityChecks {
  constructor(config = {}) {
    this.config = {
      xss: config.xss ?? true,
      csp: config.csp ?? true,
      accessibility: config.accessibility ?? true,
      ...config,
    }
  }

  async check(page, context) {
    const results = []

    if (this.config.xss) {
      results.push(await this.checkXSS(page))
    }

    if (this.config.csp) {
      results.push(await this.checkCSP(page))
    }

    if (this.config.accessibility) {
      results.push(await this.checkAccessibility(page))
    }

    return results
  }

  async checkXSS(page) {
    try {
      // Check for potential XSS vulnerabilities
      const xssIndicators = [
        // Dangerous HTML sinks
        "innerHTML",
        "outerHTML",
        "insertAdjacentHTML",
        "document.write",
        "document.writeln",
        // Dangerous attributes
        "onload",
        "onerror",
        "onclick",
        "onmouseover",
        // Potential script injection
        "javascript:",
        "data:text/html",
        "<script",
        "<iframe",
        "<object",
        "<embed",
      ]

      // Check for inline event handlers and dangerous attributes
      const dangerousElements = await page.$$eval("*", (elements) => {
        const issues = []

        elements.forEach((el) => {
          // Check for inline event handlers
          const eventHandlers = ["onclick", "onload", "onerror", "onmouseover", "onsubmit"]
          eventHandlers.forEach((handler) => {
            if (el.hasAttribute(handler)) {
              issues.push({
                element: el.tagName.toLowerCase(),
                type: "inline-event-handler",
                attribute: handler,
                value: el.getAttribute(handler).substring(0, 50) + "...",
              })
            }
          })

          // Check for dangerous href/src values
          const dangerousAttrs = ["href", "src", "action"]
          dangerousAttrs.forEach((attr) => {
            const value = el.getAttribute(attr)
            if (value && (value.startsWith("javascript:") || value.startsWith("data:text/html"))) {
              issues.push({
                element: el.tagName.toLowerCase(),
                type: "dangerous-url",
                attribute: attr,
                value: value.substring(0, 50) + "...",
              })
            }
          })
        })

        return issues
      })

      // Check for eval usage in scripts
      const evalUsage = await page.$$eval("script", (scripts) => {
        const issues = []
        scripts.forEach((script) => {
          const content = script.textContent || script.innerText || ""
          if (content.includes("eval(") || content.includes("Function(")) {
            issues.push({
              type: "eval-usage",
              content: content.substring(0, 100) + "...",
            })
          }
        })
        return issues
      })

      const allIssues = [...dangerousElements, ...evalUsage]

      return {
        name: "XSS Security Check",
        description: "檢查潛在的跨站腳本攻擊漏洞",
        passed: allIssues.length === 0,
        severity: allIssues.length > 0 ? "high" : "info",
        details: {
          issues: allIssues,
          summary: `${allIssues.length} 個潛在的安全問題發現`,
        },
        error: allIssues.length > 0 ? `發現 ${allIssues.length} 個 XSS 安全問題` : null,
      }
    } catch (error) {
      return {
        name: "XSS Security Check",
        description: "檢查潛在的跨站腳本攻擊漏洞",
        passed: false,
        severity: "high",
        error: `XSS 檢查失敗: ${error.message}`,
      }
    }
  }

  async checkCSP(page) {
    try {
      // Check Content Security Policy
      const cspHeader = await page.evaluate(() => {
        const metaCSP = document.querySelector('meta[http-equiv="Content-Security-Policy"]')
        return {
          meta: metaCSP ? metaCSP.getAttribute("content") : null,
        }
      })

      // Check for inline scripts/styles without CSP
      const inlineContent = await page.$$eval("script, style", (elements) => {
        const issues = []
        elements.forEach((el) => {
          if (el.tagName.toLowerCase() === "script") {
            if (!el.src && el.textContent && el.textContent.trim()) {
              issues.push({
                type: "inline-script",
                content: el.textContent.substring(0, 50) + "...",
              })
            }
          } else if (el.tagName.toLowerCase() === "style") {
            if (el.textContent && el.textContent.trim()) {
              issues.push({
                type: "inline-style",
                content: el.textContent.substring(0, 50) + "...",
              })
            }
          }
        })
        return issues
      })

      // Evaluate CSP effectiveness
      let cspScore = 0
      const recommendations = []

      if (cspHeader.meta) {
        const cspContent = cspHeader.meta

        // Check for basic directives
        if (cspContent.includes("default-src")) cspScore += 20
        if (cspContent.includes("script-src")) cspScore += 20
        if (cspContent.includes("style-src")) cspScore += 15
        if (cspContent.includes("img-src")) cspScore += 10
        if (cspContent.includes("connect-src")) cspScore += 10
        if (cspContent.includes("'unsafe-inline'")) {
          cspScore -= 15
          recommendations.push("避免使用 'unsafe-inline'")
        }
        if (cspContent.includes("'unsafe-eval'")) {
          cspScore -= 15
          recommendations.push("避免使用 'unsafe-eval'")
        }
        if (cspContent.includes("*")) {
          cspScore -= 10
          recommendations.push("避免使用通配符 *")
        }
      } else {
        recommendations.push("建議添加 Content Security Policy")
        cspScore = 0
      }

      return {
        name: "CSP Security Check",
        description: "檢查內容安全策略配置",
        passed: cspScore >= 50,
        severity: cspScore < 30 ? "high" : cspScore < 50 ? "medium" : "low",
        details: {
          cspHeader: cspHeader.meta,
          cspScore,
          inlineContentCount: inlineContent.length,
          recommendations,
          issues: inlineContent,
        },
        error: cspScore < 50 ? `CSP 分數過低: ${cspScore}/100` : null,
      }
    } catch (error) {
      return {
        name: "CSP Security Check",
        description: "檢查內容安全策略配置",
        passed: false,
        severity: "medium",
        error: `CSP 檢查失敗: ${error.message}`,
      }
    }
  }

  async checkAccessibility(page) {
    try {
      // Basic accessibility checks
      const accessibilityIssues = await page.$$eval("*", (elements) => {
        const issues = []

        elements.forEach((el) => {
          const tagName = el.tagName.toLowerCase()

          // Check for missing alt attributes on images
          if (tagName === "img" && !el.hasAttribute("alt")) {
            issues.push({
              type: "missing-alt",
              element: "img",
              severity: "medium",
              message: "圖片缺少 alt 屬性",
            })
          }

          // Check for empty alt attributes
          if (tagName === "img" && el.getAttribute("alt") === "") {
            issues.push({
              type: "empty-alt",
              element: "img",
              severity: "low",
              message: "圖片 alt 屬性為空",
            })
          }

          // Check for missing labels on form inputs
          if (["input", "select", "textarea"].includes(tagName)) {
            const type = el.type || ""
            if (!["submit", "button", "hidden"].includes(type)) {
              const id = el.id
              const label = id ? document.querySelector(`label[for="${id}"]`) : null
              if (!label) {
                issues.push({
                  type: "missing-label",
                  element: tagName,
                  severity: "medium",
                  message: "表單元素缺少關聯的 label",
                })
              }
            }
          }

          // Check for buttons without text
          if (tagName === "button") {
            const text = el.textContent?.trim() || ""
            const ariaLabel = el.getAttribute("aria-label") || ""
            if (!text && !ariaLabel && !el.querySelector("img, svg, i")) {
              issues.push({
                type: "empty-button",
                element: "button",
                severity: "medium",
                message: "按鈕沒有可訪問的文字內容",
              })
            }
          }

          // Check for insufficient color contrast (basic check)
          const style = window.getComputedStyle(el)
          const backgroundColor = style.backgroundColor
          const color = style.color

          // This is a simplified check - real contrast checking would be more complex
          if (backgroundColor && color && backgroundColor !== "rgba(0, 0, 0, 0)" && color !== "rgb(0, 0, 0)") {
            // Basic check: if both are defined and not transparent/black
            // In a real implementation, you'd calculate actual contrast ratios
          }

          // Check for missing lang attribute on html element
          if (tagName === "html" && !el.hasAttribute("lang")) {
            issues.push({
              type: "missing-lang",
              element: "html",
              severity: "low",
              message: "HTML 元素缺少 lang 屬性",
            })
          }
        })

        return issues
      })

      // Check for heading structure
      const headingStructure = await page.$$eval("h1, h2, h3, h4, h5, h6", (headings) => {
        const levels = headings.map((h) => parseInt(h.tagName.charAt(1)))
        const issues = []

        // Check for skipped heading levels (not always an error, but worth noting)
        for (let i = 1; i < levels.length; i++) {
          if (levels[i] > levels[i - 1] + 1) {
            issues.push({
              type: "skipped-heading-level",
              message: `跳過標題等級: h${levels[i - 1]} 到 h${levels[i]}`,
              severity: "low",
            })
          }
        }

        return {
          levels,
          issueCount: issues.length,
          issues,
        }
      })

      const allIssues = [...accessibilityIssues, ...headingStructure.issues]

      return {
        name: "Accessibility Check",
        description: "檢查基本無障礙功能",
        passed: allIssues.filter((issue) => issue.severity === "high" || issue.severity === "medium").length === 0,
        severity: allIssues.some((issue) => issue.severity === "high")
          ? "high"
          : allIssues.some((issue) => issue.severity === "medium")
            ? "medium"
            : "low",
        details: {
          totalIssues: allIssues.length,
          highSeverity: allIssues.filter((issue) => issue.severity === "high").length,
          mediumSeverity: allIssues.filter((issue) => issue.severity === "medium").length,
          lowSeverity: allIssues.filter((issue) => issue.severity === "low").length,
          headingStructure: headingStructure.levels,
          issues: allIssues,
        },
        error: allIssues.length > 0 ? `發現 ${allIssues.length} 個無障礙問題` : null,
      }
    } catch (error) {
      return {
        name: "Accessibility Check",
        description: "檢查基本無障礙功能",
        passed: false,
        severity: "low",
        error: `無障礙檢查失敗: ${error.message}`,
      }
    }
  }
}
