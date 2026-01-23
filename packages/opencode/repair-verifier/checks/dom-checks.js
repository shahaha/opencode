export class DomChecks {
  constructor(config = {}) {
    this.config = {
      checks: config.checks || this.getDefaultChecks(),
      ...config,
    }
  }

  getDefaultChecks() {
    return [
      {
        name: "settings_button",
        selector: "#settingsBtn",
        description: "檢查設置按鈕是否存在",
      },
      {
        name: "settings_panel",
        selector: ".settings-panel",
        description: "檢查設置面板容器是否存在",
      },
      {
        name: "workspace_list",
        selector: "#workspaceList",
        description: "檢查工作區列表容器是否存在",
      },
      {
        name: "chat_container",
        selector: ".chat-container",
        description: "檢查聊天容器是否存在",
      },
      {
        name: "message_input",
        selector: "#messageInput",
        description: "檢查訊息輸入框是否存在",
      },
      {
        name: "send_button",
        selector: "#sendButton",
        description: "檢查發送按鈕是否存在",
      },
      {
        name: "mcp_server_list",
        selector: "#mcp-server-list",
        description: "檢查 MCP 服務器列表是否存在",
      },
    ]
  }

  async run(page) {
    const results = []

    for (const check of this.config.checks) {
      try {
        const result = await this.performDomCheck(page, check)
        results.push(result)
      } catch (error) {
        results.push({
          name: check.name,
          passed: false,
          error: error.message,
          selector: check.selector,
          description: check.description,
        })
      }
    }

    return results
  }

  async performDomCheck(page, check) {
    // Check if element exists
    const elementExists = (await page.$(check.selector)) !== null

    // Get element details if it exists
    let elementDetails = null
    if (elementExists) {
      elementDetails = await page.evaluate((sel) => {
        const element = document.querySelector(sel)
        if (!element) return null

        return {
          tagName: element.tagName,
          className: element.className,
          id: element.id,
          visible: element.offsetWidth > 0 && element.offsetHeight > 0,
          textContent: element.textContent?.substring(0, 100) || "",
          childrenCount: element.children.length,
        }
      }, check.selector)
    }

    return {
      name: check.name,
      passed: elementExists,
      selector: check.selector,
      exists: elementExists,
      details: elementDetails,
      description: check.description,
    }
  }

  // Add custom DOM check
  addCheck(name, selector, description) {
    this.config.checks.push({
      name,
      selector,
      description,
    })
  }

  // Remove check by name
  removeCheck(name) {
    this.config.checks = this.config.checks.filter((check) => check.name !== name)
  }

  // Update check selector
  updateCheck(name, newSelector) {
    const check = this.config.checks.find((c) => c.name === name)
    if (check) {
      check.selector = newSelector
    }
  }

  // Check for duplicate elements (potential bug)
  async checkForDuplicates(page, selector) {
    const count = await page.$$eval(selector, (elements) => elements.length)
    return {
      selector,
      count,
      hasDuplicates: count > 1,
      expected: 1,
    }
  }
}
