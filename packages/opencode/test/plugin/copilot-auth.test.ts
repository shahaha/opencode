import { describe, expect, test } from "bun:test"
import { CopilotAuthPlugin } from "../../src/plugin/copilot"
import type { PluginInput } from "@opencode-ai/plugin"

const CLIENT_ID = "Ov23li8tweQw6odWQebz"
const USAGE_CLIENT_ID = "Iv1.b507a08c87ecfe98"

function createInput(): PluginInput {
  return {
    client: {
      session: {
        get: async () => ({ data: { parentID: null } }),
      },
    } as unknown as PluginInput["client"],
    project: {} as PluginInput["project"],
    directory: "/",
    worktree: "/",
    serverUrl: new URL("http://localhost"),
    $: Bun.$,
  }
}

function mockCopilotDeviceFlow(options: { usageToken?: string | null }) {
  const originalFetch = globalThis.fetch

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString()
    const body = init?.body ? JSON.parse(init.body.toString()) : {}

    if (url.endsWith("/login/device/code")) {
      if (body.client_id === CLIENT_ID) {
        return new Response(
          JSON.stringify({
            verification_uri: "https://github.com/login/device",
            user_code: "MAIN-CODE",
            device_code: "main-device",
            interval: 1,
            expires_in: 600,
          }),
          { status: 200 },
        )
      }
      if (body.client_id === USAGE_CLIENT_ID) {
        return new Response(
          JSON.stringify({
            verification_uri: "https://github.com/login/device",
            user_code: "USAGE-CODE",
            device_code: "usage-device",
            interval: 1,
            expires_in: 600,
          }),
          { status: 200 },
        )
      }
    }

    if (url.endsWith("/login/oauth/access_token")) {
      if (body.client_id === CLIENT_ID) {
        return new Response(JSON.stringify({ access_token: "device-token" }), { status: 200 })
      }
      if (body.client_id === USAGE_CLIENT_ID) {
        if (options.usageToken) {
          return new Response(JSON.stringify({ access_token: options.usageToken }), { status: 200 })
        }
        return new Response(JSON.stringify({ error: "expired_token" }), { status: 200 })
      }
    }

    if (url.endsWith("/copilot_internal/v2/token")) {
      return new Response(JSON.stringify({ token: "service-token" }), { status: 200 })
    }

    return new Response("", { status: 404 })
  }) as typeof fetch

  return () => {
    globalThis.fetch = originalFetch
  }
}

describe("Copilot auth", () => {
  test("returns usage token when device flow completes", async () => {
    const restore = mockCopilotDeviceFlow({ usageToken: "usage-token" })
    try {
      const hooks = await CopilotAuthPlugin(createInput())
      const method = hooks.auth?.methods[0]
      const authorize = method?.authorize
      if (!authorize) throw new Error("Missing authorize handler")

      const authorizeResult = await authorize({})
      if (!("callback" in authorizeResult)) throw new Error("Expected oauth authorize result")
      if (authorizeResult.method !== "auto") throw new Error("Expected auto OAuth flow")
      expect(authorizeResult.instructions).toContain("To enable usage tracking")

      const result = await authorizeResult.callback()
      if (result.type !== "success") throw new Error("Expected success")
      if (!("access" in result)) throw new Error("Expected access token")

      expect(result.access).toBe("service-token")
      expect(result.usage).toBe("usage-token")
    } finally {
      restore()
    }
  })

  test("succeeds without usage token when device flow expires", async () => {
    const restore = mockCopilotDeviceFlow({ usageToken: null })
    try {
      const hooks = await CopilotAuthPlugin(createInput())
      const method = hooks.auth?.methods[0]
      const authorize = method?.authorize
      if (!authorize) throw new Error("Missing authorize handler")

      const authorizeResult = await authorize({})
      if (!("callback" in authorizeResult)) throw new Error("Expected oauth authorize result")
      if (authorizeResult.method !== "auto") throw new Error("Expected auto OAuth flow")
      expect(authorizeResult.instructions).toContain("To enable usage tracking")

      const result = await authorizeResult.callback()
      if (result.type !== "success") throw new Error("Expected success")
      if (!("access" in result)) throw new Error("Expected access token")

      expect(result.access).toBe("service-token")
      expect(result.usage).toBeUndefined()
    } finally {
      restore()
    }
  })
})
