// packages/console/src/lib/ag-ui/config.ts
import type { AGUIConfig } from "./types"

export const DEFAULT_AGUI_CONFIG: Partial<AGUIConfig> = {
  transport: "websocket",
  reconnectAttempts: 5,
  reconnectDelay: 1000,
}

export function createAGUIConfig(overrides: Partial<AGUIConfig>): AGUIConfig {
  return {
    ...DEFAULT_AGUI_CONFIG,
    ...overrides,
  } as AGUIConfig
}

export function validateAGUIConfig(config: AGUIConfig): boolean {
  if (!config.serverUrl || !config.sessionId || !config.authToken) {
    return false
  }

  if (!["websocket", "sse"].includes(config.transport || "websocket")) {
    return false
  }

  return true
}
