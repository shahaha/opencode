// packages/console/app/src/lib/ag-ui/config.test.ts
import { describe, it, expect } from "vitest"
import { createAGUIConfig, validateAGUIConfig } from "./config"

describe("AGUIConfig", () => {
  describe("createAGUIConfig", () => {
    it("should create config with default values", () => {
      const config = createAGUIConfig({
        serverUrl: "http://localhost:3000",
        sessionId: "test-session",
        authToken: "test-token",
      })

      expect(config.serverUrl).toBe("http://localhost:3000")
      expect(config.sessionId).toBe("test-session")
      expect(config.authToken).toBe("test-token")
      expect(config.transport).toBe("websocket")
      expect(config.reconnectAttempts).toBe(5)
      expect(config.reconnectDelay).toBe(1000)
    })

    it("should override default values", () => {
      const config = createAGUIConfig({
        serverUrl: "http://localhost:3000",
        sessionId: "test-session",
        authToken: "test-token",
        transport: "sse",
        reconnectAttempts: 3,
      })

      expect(config.transport).toBe("sse")
      expect(config.reconnectAttempts).toBe(3)
    })
  })

  describe("validateAGUIConfig", () => {
    it("should return true for valid config", () => {
      const config = createAGUIConfig({
        serverUrl: "http://localhost:3000",
        sessionId: "test-session",
        authToken: "test-token",
      })

      expect(validateAGUIConfig(config)).toBe(true)
    })

    it("should return false for missing serverUrl", () => {
      const config = createAGUIConfig({
        sessionId: "test-session",
        authToken: "test-token",
      })

      expect(validateAGUIConfig(config)).toBe(false)
    })

    it("should return false for missing sessionId", () => {
      const config = createAGUIConfig({
        serverUrl: "http://localhost:3000",
        authToken: "test-token",
      })

      expect(validateAGUIConfig(config)).toBe(false)
    })

    it("should return false for missing authToken", () => {
      const config = createAGUIConfig({
        serverUrl: "http://localhost:3000",
        sessionId: "test-session",
      })

      expect(validateAGUIConfig(config)).toBe(false)
    })

    it("should return false for invalid transport", () => {
      const config = createAGUIConfig({
        serverUrl: "http://localhost:3000",
        sessionId: "test-session",
        authToken: "test-token",
        transport: "invalid" as any,
      })

      expect(validateAGUIConfig(config)).toBe(false)
    })
  })
})
