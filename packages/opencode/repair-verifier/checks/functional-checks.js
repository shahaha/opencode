export class FunctionalChecks {
  constructor(config = {}) {
    this.config = {
      checks: config.checks || this.getDefaultChecks(),
      ...config,
    }
  }

  getDefaultChecks() {
    return [
      {
        name: "settings_toggle",
        description: "測試設置面板開關功能",
        actions: [
          { type: "click", selector: "#settingsBtn" },
          { type: "wait", selector: ".settings-panel.visible" },
          { type: "click", selector: "#settingsCloseBtn" },
          { type: "wait", selector: ".settings-panel:not(.visible)" },
        ],
      },
      {
        name: "workspace_add",
        description: "測試添加工作區功能",
        actions: [
          { type: "click", selector: "#settingsBtn" },
          { type: "wait", selector: ".settings-panel.visible" },
          { type: "type", selector: "#newWorkspacePath", text: "/test/workspace" },
          { type: "click", selector: "#addWorkspaceBtn" },
          { type: "wait", selector: ".workspace-item", count: 6 }, // Should have 6 items now
        ],
      },
      {
        name: "message_send",
        description: "測試訊息發送功能",
        actions: [
          { type: "type", selector: "#messageInput", text: "Hello from automated test" },
          { type: "click", selector: "#sendButton" },
          { type: "wait", selector: ".message.user", count: 2 }, // Should have 2 user messages now
        ],
      },
    ]
  }

  async run(page) {
    const results = []

    for (const check of this.config.checks) {
      try {
        const result = await this.performFunctionalCheck(page, check)
        results.push(result)
      } catch (error) {
        results.push({
          name: check.name,
          passed: false,
          error: error.message,
          description: check.description,
          actions: check.actions.length,
        })
      }
    }

    return results
  }

  async performFunctionalCheck(page, check) {
    const startTime = Date.now()
    let passed = true
    const errors = []

    try {
      // Execute each action in sequence
      for (const action of check.actions) {
        try {
          await this.executeAction(page, action)
        } catch (error) {
          passed = false
          errors.push(`Action ${action.type} failed: ${error.message}`)
          break // Stop on first failure
        }
      }

      // If all actions passed, do final verification
      if (passed && check.finalCheck) {
        passed = await this.executeAction(page, check.finalCheck)
      }
    } catch (error) {
      passed = false
      errors.push(`Functional check failed: ${error.message}`)
    }

    return {
      name: check.name,
      passed,
      duration: Date.now() - startTime,
      actionsExecuted: check.actions.length,
      errors: errors.length > 0 ? errors : undefined,
      description: check.description,
    }
  }

  async executeAction(page, action) {
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
          throw new Error(`Assertion failed: expected "${action.expected}", got "${result}"`)
        }
        break

      default:
        throw new Error(`Unknown action type: ${action.type}`)
    }

    // Small delay between actions
    await page.waitForTimeout(200)
  }

  // Add custom functional check
  addCheck(name, description, actions, finalCheck = null) {
    this.config.checks.push({
      name,
      description,
      actions,
      finalCheck,
    })
  }

  // Remove check by name
  removeCheck(name) {
    this.config.checks = this.config.checks.filter((check) => check.name !== name)
  }

  // Update check actions
  updateCheck(name, newActions) {
    const check = this.config.checks.find((c) => c.name === name)
    if (check) {
      check.actions = newActions
    }
  }
}
