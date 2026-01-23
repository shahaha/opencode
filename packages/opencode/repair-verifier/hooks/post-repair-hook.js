import { RepairVerifier } from "../index.js"
import { ConsoleReporter } from "../reporters/console-reporter.js"
import { JsonReporter } from "../reporters/json-reporter.js"

export class PostRepairHook {
  constructor(config = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      notifications: {
        slack: config.notifications?.slack ?? false,
        email: config.notifications?.email ?? false,
        webhook: config.notifications?.webhook ?? false,
        ...config.notifications,
      },
      slackWebhook: config.slackWebhook,
      emailConfig: config.emailConfig,
      webhookUrl: config.webhookUrl,
      autoRollback: config.autoRollback ?? false,
      rollbackThreshold: config.rollbackThreshold ?? 0.5, // 50% failure threshold
      ...config,
    }

    this.verifier = new RepairVerifier(config.verifier)
    this.consoleReporter = new ConsoleReporter()
    this.jsonReporter = new JsonReporter(config.jsonReportPath)
  }

  async execute(repairContext) {
    console.log("🔧 修復完成，開始自動驗證...")

    if (!this.config.enabled) {
      console.log("ℹ️  PostRepairHook 已禁用，跳過驗證")
      return { success: true, skipped: true }
    }

    try {
      // Execute repair verification
      const result = await this.verifier.verifyFrontendRepairs(repairContext.deployUrl)

      // Generate reports
      await this.consoleReporter.generate(result)
      await this.jsonReporter.generate(result)

      // Handle verification results
      if (!result.success) {
        console.error("❌ 修復驗證失敗！")
        await this.handleVerificationFailure(result, repairContext)

        // Auto-rollback if enabled and threshold exceeded
        if (this.shouldAutoRollback(result)) {
          await this.triggerRollback(repairContext)
        }

        return { success: false, result, rolledBack: this.config.autoRollback }
      } else {
        console.log("✅ 修復驗證通過，部署成功！")
        await this.handleVerificationSuccess(result, repairContext)
        return { success: true, result }
      }
    } catch (error) {
      console.error("修復驗證過程出錯:", error)
      await this.handleVerificationError(error, repairContext)
      throw error
    }
  }

  shouldAutoRollback(result) {
    if (!this.config.autoRollback) return false

    const failureRate = 1 - result.summary.passed / result.summary.total
    return failureRate >= this.config.rollbackThreshold
  }

  async handleVerificationFailure(result, context) {
    const message = this.formatFailureMessage(result, context)

    // Send notifications
    if (this.config.notifications.slack) {
      await this.sendSlackNotification(message, "danger")
    }

    if (this.config.notifications.email) {
      await this.sendEmailNotification(message)
    }

    if (this.config.notifications.webhook) {
      await this.sendWebhookNotification({ ...result, context, status: "failed" })
    }
  }

  async handleVerificationSuccess(result, context) {
    const message = this.formatSuccessMessage(result, context)

    // Send success notifications
    if (this.config.notifications.slack) {
      await this.sendSlackNotification(message, "good")
    }

    if (this.config.notifications.webhook) {
      await this.sendWebhookNotification({ ...result, context, status: "success" })
    }
  }

  async handleVerificationError(error, context) {
    const message = this.formatErrorMessage(error, context)

    // Send error notifications
    if (this.config.notifications.slack) {
      await this.sendSlackNotification(message, "danger")
    }

    if (this.config.notifications.webhook) {
      await this.sendWebhookNotification({ error, context, status: "error" })
    }
  }

  formatFailureMessage(result, context) {
    const failedChecks = result.results.filter((r) => !r.passed)
    return {
      title: "🚨 前端修復驗證失敗",
      text: `部署 ${context.deployUrl} 的修復驗證失敗`,
      fields: [
        {
          title: "總檢查數",
          value: `${result.summary.total}`,
          short: true,
        },
        {
          title: "失敗數",
          value: `${result.summary.total - result.summary.passed}`,
          short: true,
        },
        {
          title: "成功率",
          value: `${result.summary.successRate}`,
          short: true,
        },
        {
          title: "修復 ID",
          value: context.repairId || "N/A",
          short: true,
        },
      ],
      attachments: failedChecks.map((check) => ({
        color: "danger",
        title: `❌ ${check.name}`,
        text: check.description || "",
        fields: [
          {
            title: "錯誤",
            value: check.error || "Unknown error",
            short: false,
          },
        ],
      })),
    }
  }

  formatSuccessMessage(result, context) {
    return {
      title: "✅ 前端修復驗證通過",
      text: `部署 ${context.deployUrl} 的修復驗證成功完成`,
      fields: [
        {
          title: "檢查通過",
          value: `${result.summary.passed}/${result.summary.total}`,
          short: true,
        },
        {
          title: "成功率",
          value: `${result.summary.successRate}`,
          short: true,
        },
        {
          title: "驗證時間",
          value: `${result.duration}ms`,
          short: true,
        },
      ],
    }
  }

  formatErrorMessage(error, context) {
    return {
      title: "💥 修復驗證過程錯誤",
      text: `部署 ${context.deployUrl} 的驗證過程發生錯誤`,
      fields: [
        {
          title: "錯誤信息",
          value: error.message,
          short: false,
        },
        {
          title: "修復 ID",
          value: context.repairId || "N/A",
          short: true,
        },
      ],
    }
  }

  async sendSlackNotification(message, color = "good") {
    if (!this.config.slackWebhook) {
      console.warn("Slack webhook not configured")
      return
    }

    try {
      const payload = {
        ...message,
        color,
        ts: Date.now() / 1000,
      }

      const response = await fetch(this.config.slackWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        console.error("Failed to send Slack notification:", response.statusText)
      }
    } catch (error) {
      console.error("Slack notification error:", error)
    }
  }

  async sendEmailNotification(message) {
    if (!this.config.emailConfig) {
      console.warn("Email configuration not provided")
      return
    }

    const { host, port, secure, user, pass, from, to } = this.config.emailConfig

    try {
      const emailPayload = {
        from: from || user,
        to: Array.isArray(to) ? to : [to],
        subject: message.title,
        html: this.formatEmailHtml(message),
        text: this.formatEmailText(message),
      }

      const response = await fetch(`http://localhost:3000/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smtp: { host, port, secure, auth: { user, pass } },
          email: emailPayload,
        }),
      })

      if (!response.ok) {
        console.error("Failed to send email notification:", response.statusText)
      } else {
        console.log("📧 Email notification sent successfully")
      }
    } catch (error) {
      console.error("Email notification error:", error)
    }
  }

  formatEmailHtml(message) {
    const fields =
      message.fields
        ?.map((field) => `<tr><td><strong>${field.title}:</strong></td><td>${field.value}</td></tr>`)
        .join("") || ""

    const attachments =
      message.attachments
        ?.map(
          (attachment) =>
            `<div style="border:1px solid #ccc; margin:10px 0; padding:10px;">
        <h4 style="color:${attachment.color};">${attachment.title}</h4>
        <p>${attachment.text}</p>
        ${attachment.fields?.map((field) => `<p><strong>${field.title}:</strong> ${field.value}</p>`).join("") || ""}
      </div>`,
        )
        .join("") || ""

    return `
      <div style="font-family:Arial,sans-serif; max-width:600px; margin:0 auto;">
        <h1 style="color:#333;">${message.title}</h1>
        <p>${message.text}</p>
        ${fields ? `<table style="width:100%; border-collapse:collapse;">${fields}</table>` : ""}
        ${attachments}
      </div>
    `
  }

  formatEmailText(message) {
    let text = `${message.title}\n\n${message.text}\n\n`

    if (message.fields) {
      message.fields.forEach((field) => {
        text += `${field.title}: ${field.value}\n`
      })
      text += "\n"
    }

    if (message.attachments) {
      message.attachments.forEach((attachment) => {
        text += `${attachment.title}\n${attachment.text}\n`
        if (attachment.fields) {
          attachment.fields.forEach((field) => {
            text += `  ${field.title}: ${field.value}\n`
          })
        }
        text += "\n"
      })
    }

    return text
  }

  async sendWebhookNotification(payload) {
    if (!this.config.webhookUrl) {
      console.warn("Webhook URL not configured")
      return
    }

    try {
      const response = await fetch(this.config.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        console.error("Failed to send webhook notification:", response.statusText)
      }
    } catch (error) {
      console.error("Webhook notification error:", error)
    }
  }

  async triggerRollback(context) {
    console.log("🔄 觸發自動回滾...")
    console.log("Rollback context:", {
      deployId: context.deployId,
      repairId: context.repairId,
      commitHash: context.commitHash,
      branch: context.branch,
    })

    try {
      const rollbackResult = await this.performGitRollback(context)
      console.log("✅ 自動回滾完成:", rollbackResult)

      // Send rollback notification
      await this.sendRollbackNotification(rollbackResult, context)

      return rollbackResult
    } catch (error) {
      console.error("❌ 自動回滾失敗:", error)
      await this.sendRollbackFailureNotification(error, context)
      throw error
    }
  }

  async performGitRollback(context) {
    const { exec } = await import("child_process")
    const { promisify } = await import("util")
    const execAsync = promisify(exec)

    try {
      // Get current status
      const { stdout: statusOutput } = await execAsync("git status --porcelain")
      const hasUncommittedChanges = statusOutput.trim().length > 0

      if (hasUncommittedChanges) {
        console.log("發現未提交的更改，先 stash")
        await execAsync('git stash push -m "Auto-stash before rollback"')
      }

      // Determine rollback strategy
      let rollbackCommand
      let rollbackType

      if (context.commitHash) {
        // Rollback to specific commit
        rollbackCommand = `git reset --hard ${context.commitHash}`
        rollbackType = "commit"
      } else if (context.deployId) {
        // Try to find commit by deploy ID (assuming deploy ID is in commit message)
        const { stdout: logOutput } = await execAsync(`git log --oneline -20 --grep="${context.deployId}"`)
        const lines = logOutput
          .trim()
          .split("\n")
          .filter((line) => line.trim())
        if (lines.length > 0) {
          const targetCommit = lines[0].split(" ")[0]
          rollbackCommand = `git reset --hard ${targetCommit}`
          rollbackType = "deploy-id"
        } else {
          throw new Error(`無法找到部署 ID ${context.deployId} 對應的提交`)
        }
      } else {
        // Rollback to previous commit
        rollbackCommand = "git reset --hard HEAD~1"
        rollbackType = "previous"
      }

      // Execute rollback
      console.log(`執行回滾命令: ${rollbackCommand}`)
      const { stdout: rollbackOutput } = await execAsync(rollbackCommand)

      // Restore stashed changes if any
      if (hasUncommittedChanges) {
        try {
          await execAsync("git stash pop")
          console.log("已恢復暫存的更改")
        } catch (stashError) {
          console.warn("恢復 stash 失敗:", stashError.message)
        }
      }

      // Get rollback details
      const { stdout: currentCommit } = await execAsync("git rev-parse HEAD")
      const { stdout: currentBranch } = await execAsync("git branch --show-current")

      return {
        success: true,
        type: rollbackType,
        previousCommit: context.commitHash,
        currentCommit: currentCommit.trim(),
        branch: currentBranch.trim(),
        timestamp: new Date().toISOString(),
      }
    } catch (error) {
      // If rollback fails, try to restore original state
      try {
        if (context.commitHash) {
          await execAsync(`git reset --hard ${context.commitHash}`)
        }
      } catch (restoreError) {
        console.error("無法恢復原始狀態:", restoreError)
      }
      throw error
    }
  }

  async sendRollbackNotification(rollbackResult, context) {
    const message = {
      title: "🔄 自動回滾已執行",
      text: `部署 ${context.deployUrl || context.deployId} 因驗證失敗已自動回滾`,
      fields: [
        {
          title: "回滾類型",
          value: rollbackResult.type,
          short: true,
        },
        {
          title: "當前提交",
          value: rollbackResult.currentCommit.substring(0, 8),
          short: true,
        },
        {
          title: "分支",
          value: rollbackResult.branch,
          short: true,
        },
        {
          title: "回滾時間",
          value: new Date(rollbackResult.timestamp).toLocaleString(),
          short: true,
        },
      ],
    }

    if (this.config.notifications.slack) {
      await this.sendSlackNotification(message, "warning")
    }

    if (this.config.notifications.webhook) {
      await this.sendWebhookNotification({ ...rollbackResult, context, status: "rolled_back" })
    }
  }

  async sendRollbackFailureNotification(error, context) {
    const message = {
      title: "💥 自動回滾失敗",
      text: `部署 ${context.deployUrl || context.deployId} 的自動回滾過程失敗`,
      fields: [
        {
          title: "錯誤信息",
          value: error.message,
          short: false,
        },
        {
          title: "部署 ID",
          value: context.deployId || context.repairId || "N/A",
          short: true,
        },
      ],
    }

    if (this.config.notifications.slack) {
      await this.sendSlackNotification(message, "danger")
    }

    if (this.config.notifications.webhook) {
      await this.sendWebhookNotification({ error, context, status: "rollback_failed" })
    }
  }
}
