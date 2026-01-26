export class ModelManager {
  constructor() {
    this.models = []
    this.selectedModel = "opencode/glm-4.7-free"
  }

  async loadModels() {
    console.log("🔄 Loading models from server...")

    try {
      const response = await fetch("/ollama/models", {
        signal: AbortSignal.timeout(10000),
      })

      if (response.ok) {
        const data = await response.json()
        this.models = data.models || []
        console.log(`✅ Loaded ${this.models.length} models from server`)

        this.classifyModels()
        this.updateModelDropdown()
        this.notifySuccess(`成功載入 ${this.models.length} 個模型`)
      } else {
        console.warn("❌ Failed to load models:", response.status)
        this.notifyError("無法從服務器載入模型")
        this.models = []
      }
    } catch (error) {
      console.error("❌ Model loading failed:", error)
      this.models = []
      this.notifyError("載入模型時發生錯誤")
    }
  }

  classifyModels() {
    const localModels = this.models.filter((m) => !m.details?.remote_model)
    const cloudModels = this.models.filter((m) => m.details?.remote_model)

    console.log(`📊 模型分類完成: 本地=${localModels.length}, 雲端=${cloudModels.length}`)

    return {
      local: localModels,
      cloud: cloudModels,
    }
  }

  updateModelDropdown() {
    const modelSelect = document.getElementById("modelSelect")
    if (!modelSelect) return

    modelSelect.innerHTML = ""

    const classified = this.classifyModels()

    if (classified.local.length > 0) {
      const localGroup = document.createElement("optgroup")
      localGroup.label = "本地模型"

      classified.local.forEach((model) => {
        const option = document.createElement("option")
        option.value = model.name
        option.textContent = `${model.name} (${model.size || "Unknown"})`
        if (model.name === this.selectedModel) {
          option.selected = true
        }
        localGroup.appendChild(option)
      })

      modelSelect.appendChild(localGroup)
    }

    if (classified.cloud.length > 0) {
      const cloudGroup = document.createElement("optgroup")
      cloudGroup.label = "雲端模型"

      classified.cloud.forEach((model) => {
        const option = document.createElement("option")
        option.value = model.name
        option.textContent = `${model.name} (${model.size || "Unknown"})`
        if (model.name === this.selectedModel) {
          option.selected = true
        }
        cloudGroup.appendChild(option)
      })

      modelSelect.appendChild(cloudGroup)
    }

    if (this.models.length === 0) {
      const option = document.createElement("option")
      option.value = "opencode/glm-4.7-free"
      option.textContent = "opencode/glm-4.7-free (預設)"
      option.selected = true
      modelSelect.appendChild(option)
    }
  }

  async sendMessage(message, model = null) {
    const selectedModel = model || this.selectedModel

    console.log(`📤 Sending message to model: ${selectedModel}`)

    try {
      const response = await fetch("/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            {
              role: "user",
              content: message,
            },
          ],
          temperature: 0.7,
          max_tokens: 2000,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        const content = data.choices?.[0]?.message?.content || "抱歉，無法取得回應。"

        console.log(`✅ Received response from ${selectedModel}`)
        return { content, model: selectedModel }
      } else {
        const errorText = await response.text()
        console.error(`❌ Model ${selectedModel} error:`, response.status, errorText)
        return {
          content: `模型 ${selectedModel} 回應錯誤 (${response.status}): ${errorText}`,
          error: true,
        }
      }
    } catch (error) {
      console.error(`❌ Failed to send message to ${selectedModel}:`, error)
      return {
        content: `發送訊息到 ${selectedModel} 時發生錯誤: ${error.message}`,
        error: true,
      }
    }
  }

  reloadModels() {
    console.log("🔄 Reloading models...")
    this.notifyInfo("正在重新載入模型...")
    return this.loadModels()
  }

  notifySuccess(message) {
    this.showNotification(message, "success")
  }

  notifyError(message) {
    this.showNotification(message, "error")
  }

  notifyInfo(message) {
    this.showNotification(message, "info")
  }

  showNotification(message, type = "info") {
    const notification = document.createElement("div")
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 6px;
      color: white;
      font-weight: 500;
      z-index: 1000;
      transition: opacity 0.3s ease;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    `

    const colors = {
      success: "#10b981",
      error: "#ef4444",
      info: "#3b82f6",
    }

    notification.style.backgroundColor = colors[type] || colors.info
    notification.textContent = message
    document.body.appendChild(notification)

    setTimeout(() => {
      notification.style.opacity = "0"
      notification.remove()
    }, 3000)
  }
}

export default new ModelManager()
