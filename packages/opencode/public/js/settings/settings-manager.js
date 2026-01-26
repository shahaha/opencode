export class SettingsManager {
  constructor() {
    this.settings = this.loadSettings()
    this.listeners = new Map()
  }

  loadSettings() {
    const stored = localStorage.getItem("agui-settings")
    if (stored) {
      try {
        return JSON.parse(stored)
      } catch (error) {
        console.error("Failed to parse settings:", error)
      }
    }

    return this.getDefaultSettings()
  }

  getDefaultSettings() {
    return {
      theme: "auto",
      fontSize: "medium",
      language: "zh-TW",
      autoSave: true,
      soundEnabled: true,
      notifications: true,
    }
  }

  saveSettings() {
    localStorage.setItem("agui-settings", JSON.stringify(this.settings))
    this.notifyListeners()
  }

  get(key) {
    return this.settings[key]
  }

  set(key, value) {
    this.settings[key] = value
    this.saveSettings()
  }

  update(newSettings) {
    this.settings = { ...this.settings, ...newSettings }
    this.saveSettings()
  }

  reset() {
    this.settings = this.getDefaultSettings()
    this.saveSettings()
  }

  addListener(callback) {
    const id = Date.now().toString()
    this.listeners.set(id, callback)
    return id
  }

  removeListener(id) {
    this.listeners.delete(id)
  }

  notifyListeners() {
    this.listeners.forEach((callback) => {
      try {
        callback(this.settings)
      } catch (error) {
        console.error("Settings listener error:", error)
      }
    })
  }
}

export default new SettingsManager()
