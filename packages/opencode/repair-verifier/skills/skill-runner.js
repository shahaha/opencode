export class SkillRunner {
  constructor(config = {}) {
    this.config = {
      skills: {},
      timeout: 30000,
      retries: 3,
      ...config,
    }

    this.skillInstances = new Map()
  }

  registerSkill(name, skillClass, config = {}) {
    this.config.skills[name] = {
      class: skillClass,
      config: { ...this.config, ...config },
    }
    console.log(`✅ 已註冊技能: ${name}`)
  }

  async runSkill(name, task) {
    const skillConfig = this.config.skills[name]
    if (!skillConfig) {
      throw new Error(`技能 '${name}' 未註冊。可用技能: ${Object.keys(this.config.skills).join(", ")}`)
    }

    // Get or create skill instance
    if (!this.skillInstances.has(name)) {
      const SkillClass = skillConfig.class
      const instance = new SkillClass(skillConfig.config)
      this.skillInstances.set(name, instance)
    }

    const skill = this.skillInstances.get(name)

    // Execute with timeout and retries
    return await this.executeWithTimeoutAndRetry(() => skill.execute(task), this.config.timeout, this.config.retries)
  }

  async executeWithTimeoutAndRetry(operation, timeout, maxRetries) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await Promise.race([
          operation(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("操作超時")), timeout)),
        ])

        return result
      } catch (error) {
        console.warn(`技能執行嘗試 ${attempt}/${maxRetries} 失敗:`, error.message)

        if (attempt === maxRetries) {
          throw new Error(`技能執行失敗，已重試 ${maxRetries} 次: ${error.message}`)
        }

        // Wait before retry (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  async runMultipleSkills(tasks) {
    const results = []

    for (const task of tasks) {
      try {
        const result = await this.runSkill(task.skill, task)
        results.push({
          task: task.name || `${task.skill}:${task.action}`,
          success: true,
          result,
        })
      } catch (error) {
        results.push({
          task: task.name || `${task.skill}:${task.action}`,
          success: false,
          error: error.message,
        })
      }
    }

    return {
      success: results.every((r) => r.success),
      results,
      summary: {
        total: results.length,
        successful: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
      },
      timestamp: new Date().toISOString(),
    }
  }

  getAvailableSkills() {
    return Object.keys(this.config.skills)
  }

  async cleanup() {
    for (const [name, skill] of this.skillInstances) {
      try {
        if (skill.cleanup) {
          await skill.cleanup()
        }
      } catch (error) {
        console.warn(`清理技能 ${name} 時出錯:`, error)
      }
    }

    this.skillInstances.clear()
  }

  // Utility method for repair verification workflow
  async verifyRepairs(config) {
    const { url, checks = [] } = config

    // Convert checks to skill tasks
    const codeChecks = checks.filter((c) => c.type === "code")
    const domChecks = checks.filter((c) => c.type === "dom")
    const functionalChecks = checks.filter((c) => c.type === "functional")
    const performanceChecks = checks.filter((c) => c.type === "performance")

    const tasks = []

    if (codeChecks.length > 0) {
      tasks.push({
        name: "code_verification",
        skill: "puppeteer",
        action: "verify_repairs",
        parameters: { url, checks: codeChecks },
      })
    }

    if (domChecks.length > 0) {
      tasks.push({
        name: "dom_verification",
        skill: "puppeteer",
        action: "verify_repairs",
        parameters: { url, checks: domChecks },
      })
    }

    if (functionalChecks.length > 0) {
      tasks.push({
        name: "functional_verification",
        skill: "puppeteer",
        action: "verify_repairs",
        parameters: { url, checks: functionalChecks },
      })
    }

    if (performanceChecks.length > 0) {
      tasks.push({
        name: "performance_verification",
        skill: "puppeteer",
        action: "verify_repairs",
        parameters: { url, checks: performanceChecks },
      })
    }

    // Run all verification tasks
    const results = await this.runMultipleSkills(tasks)

    // Aggregate results
    const allResults = results.results.flatMap((r) => (r.success ? r.result.results : []))

    const passed = allResults.filter((r) => r.passed).length
    const total = allResults.length

    return {
      success: results.success && passed === total,
      summary: {
        total,
        passed,
        failed: total - passed,
        successRate: total > 0 ? `${((passed / total) * 100).toFixed(1)}%` : "0%",
      },
      results: allResults,
      taskResults: results.results,
      url,
      timestamp: new Date().toISOString(),
    }
  }
}
