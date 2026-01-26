// AG-UI Chat Application
// Main modules
import { ModelManager } from "./models/model-manager.js"
import { SettingsManager } from "./settings/settings-manager.js"
import { DiagnosticsManager } from "./diagnostics/diagnostics-manager.js"

// Main application class
class AGUIChat {
  constructor() {
    this.modelManager = new ModelManager()
    this.settingsManager = new SettingsManager()
    this.diagnosticsManager = new DiagnosticsManager()
    this.messageCount = 0
    this.isLoading = false
    this.initDom()

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.init())
    } else {
      this.init()
    }
  }

  initDom() {
    this.settingsBtn = document.getElementById("settingsBtn")
    this.settingsCloseBtn = document.getElementById("settingsCloseBtn")
    this.settingsPanel = document.getElementById("settingsPanel")
    this.reloadModelsBtn = document.getElementById("reloadModelsBtn")
    this.sendButton = document.getElementById("sendButton")
    this.clearButton = document.getElementById("clearButton")
    this.messageInput = document.getElementById("messageInput")
    this.chatMessages = document.getElementById("chatMessages")
    this.modelSelect = document.getElementById("modelSelect")
  }

  async init() {
    console.log("🚀 Initializing AG-UI Chat Application...")
    this.showLoading()

    try {
      await this.loadInitialData()
      this.setupEventListeners()
      this.hideLoading()
      console.log("✅ AG-UI Chat Application initialized successfully")
    } catch (error) {
      console.error("❌ Failed to initialize AG-UI Chat Application:", error)
      this.hideLoading()
    }
  }

  // Load initial data
  async loadInitialData() {
    this.messageCount = 1
    this.updateSystemTime()
  }

  // Setup event listeners
  setupEventListeners() {
    // Settings button
    if (this.settingsBtn && this.settingsCloseBtn && this.settingsPanel) {
      this.settingsBtn.addEventListener("click", () => this.toggleSettings())
      this.settingsCloseBtn.addEventListener("click", () => this.hideSettings())
    }

    // Model selection
    if (this.reloadModelsBtn) {
      this.reloadModelsBtn.addEventListener("click", () => this.modelManager.reloadModels())
    }

    // Chat functionality
    if (this.sendButton && this.clearButton && this.messageInput && this.chatMessages) {
      this.sendButton.addEventListener("click", () => this.sendMessage())
      this.clearButton.addEventListener("click", () => this.clearMessages())

      this.messageInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          this.sendMessage()
        }
      })
    }

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.hideSettings()
      }

      // Ctrl/Cmd+K
      if (e.ctrlKey && e.key === "k") {
        this.clearMessages()
      }
    })

    // Window resize
    window.addEventListener("resize", () => {
      this.adjustChatHeight()
    })
  }

  // Toggle settings panel
  toggleSettings() {
    this.settingsPanel.classList.toggle("visible")

    const isVisible = this.settingsPanel.classList.contains("visible")
    this.settingsBtn.setAttribute("aria-expanded", isVisible)

    console.log(isVisible ? "Settings panel opened" : "Settings panel closed")
  }

  hideSettings() {
    this.settingsPanel.classList.remove("visible")
    this.settingsBtn.setAttribute("aria-expanded", "false")
    console.log("Settings panel closed")
  }

  // Send message
  async sendMessage() {
    const messageInput = document.getElementById("messageInput")
    const message = messageInput.value.trim()

    if (!message) return

    this.addMessage(message, "user")
    messageInput.value = ""

    // Show typing indicator
    this.showTypingIndicator()

    try {
      const modelSelect = document.getElementById("modelSelect")
      const selectedModel = modelSelect ? modelSelect.value : "opencode/glm-4.7-free"

      console.log(`📤 Sending message with model: ${selectedModel}`)

      // Call model manager to send message
      const response = await this.modelManager.sendMessage(message, selectedModel)

      this.hideTypingIndicator()
      this.addMessage(response.content || "抱歉，處理您的請求時發生錯誤。", response.error ? "error" : "assistant")
    } catch (error) {
      console.error("Error sending message:", error)
      this.hideTypingIndicator()
      this.addMessage("發送訊息時發生錯誤，請稍後再試。", "error")
    }
  }

  // Add message to chat
  addMessage(content, type = "user", isError = false) {
    const chatMessages = document.getElementById("chatMessages")
    const messageDiv = document.createElement("div")
    messageDiv.className = `message ${type}${isError ? " error" : ""}`

    const messageContent = document.createElement("div")
    messageContent.className = "message-content"

    const messageTime = document.createElement("div")
    messageTime.className = "message-time"

    const avatar = type === "user" ? "👤" : "🤖"

    messageContent.innerHTML = `<strong>${avatar} ${type === "user" ? "You" : "AG-UI"}:</strong> ${content}`
    messageTime.textContent = this.formatTime(new Date())

    messageDiv.appendChild(messageContent)
    messageDiv.appendChild(messageTime)

    chatMessages.appendChild(messageDiv)
    chatMessages.scrollTop = chatMessages.scrollHeight

    this.messageCount++
    this.updateModelStatus()
  }

  // Clear messages
  clearMessages() {
    const chatMessages = document.getElementById("chatMessages")
    chatMessages.innerHTML = ""
    this.messageCount = 1
    this.updateModelStatus()

    console.log("📋 Messages cleared")
  }

  // Show typing indicator
  showTypingIndicator() {
    const chatMessages = document.getElementById("chatMessages")
    const typingIndicator = this.createTypingIndicator()

    chatMessages.appendChild(typingIndicator)
    chatMessages.scrollTop = chatMessages.scrollHeight

    setTimeout(() => {
      typingIndicator.remove()
    }, 3000)
  }

  createTypingIndicator() {
    const indicator = document.createElement("div")
    indicator.className = "typing-indicator"
    indicator.innerHTML = `
      <div class="spinner"></div>
      <span>AI 正在思考...</span>
    `
    return indicator
  }

  // Hide typing indicator
  hideTypingIndicator() {
    const indicators = document.querySelectorAll(".typing-indicator")
    for (const indicator of indicators) {
      indicator.remove()
    }
  }

  // Show loading overlay
  showLoading() {
    this.isLoading = true
    const overlay = document.getElementById("loadingOverlay")
    overlay.style.display = "flex"
  }

  // Hide loading overlay
  hideLoading() {
    this.isLoading = false
    const overlay = document.getElementById("loadingOverlay")
    overlay.style.display = "none"
  }

  // Update model status
  updateModelStatus() {
    const modelStatus = document.getElementById("modelStatusDetails")
    if (modelStatus) {
      const statusDot = modelStatus.querySelector(".status-dot")
      const statusText = modelStatus.querySelector(".status-text")

      if (this.modelManager.models.length > 0) {
        const localCount = this.modelManager.models.filter((m) => !m.details?.remote_model).length
        const cloudCount = this.modelManager.models.filter((m) => m.details?.remote_model).length

        statusDot.className = "status-dot online"
        statusText.textContent = `本地: ${localCount} / 雲端: ${cloudCount}`
      } else {
        statusDot.className = "status-dot offline"
        statusText.textContent = "未載入模型"
      }
    }
  }

  // Update system time
  updateSystemTime() {
    const systemTime = document.getElementById("system-time")
    if (systemTime) {
      systemTime.textContent = this.formatTime(new Date())
    }
  }

  // Format time
  formatTime(date) {
    return date.toLocaleTimeString("zh-TW", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
  }
}

export default new AGUIChat()
