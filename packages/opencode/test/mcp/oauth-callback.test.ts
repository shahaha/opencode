import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test"

describe("McpOAuthCallback ensureRunning behavior", () => {
  let originalServe: typeof Bun.serve
  let originalConnect: typeof Bun.connect
  let serveCallArgs: Array<{ hostname?: string; port?: number }>
  let mockServer: { stop: ReturnType<typeof mock> }

  beforeEach(() => {
    serveCallArgs = []
    mockServer = { stop: mock(() => {}) }
    originalServe = Bun.serve
    originalConnect = Bun.connect

    Bun.serve = mock((opts: any) => {
      serveCallArgs.push({ hostname: opts.hostname, port: opts.port })
      return mockServer as any
    }) as any

    Bun.connect = mock(() => Promise.reject(new Error("Connection refused"))) as any
  })

  afterEach(async () => {
    Bun.serve = originalServe
    Bun.connect = originalConnect
    const mod = await import("../../src/mcp/oauth-callback")
    mod.McpOAuthCallback.stop()
  })

  test("passes hostname to Bun.serve when callbackHost is set", async () => {
    const { McpOAuthCallback } = await import("../../src/mcp/oauth-callback")
    await McpOAuthCallback.ensureRunning({ callbackHost: "127.0.0.1" })

    expect(serveCallArgs.length).toBe(1)
    expect(serveCallArgs[0].hostname).toBe("127.0.0.1")
  })

  test("does not pass hostname when callbackHost is unset", async () => {
    const { McpOAuthCallback } = await import("../../src/mcp/oauth-callback")
    await McpOAuthCallback.ensureRunning()

    expect(serveCallArgs.length).toBe(1)
    expect(serveCallArgs[0].hostname).toBeUndefined()
  })

  test("restarts server when callbackHost changes", async () => {
    const { McpOAuthCallback } = await import("../../src/mcp/oauth-callback")

    await McpOAuthCallback.ensureRunning({ callbackHost: "127.0.0.1" })
    expect(serveCallArgs.length).toBe(1)
    expect(mockServer.stop).not.toHaveBeenCalled()

    await McpOAuthCallback.ensureRunning({ callbackHost: "0.0.0.0" })
    expect(serveCallArgs.length).toBe(2)
    expect(mockServer.stop).toHaveBeenCalled()
    expect(serveCallArgs[1].hostname).toBe("0.0.0.0")
  })

  test("does not restart when callbackHost unchanged", async () => {
    const { McpOAuthCallback } = await import("../../src/mcp/oauth-callback")

    await McpOAuthCallback.ensureRunning({ callbackHost: "127.0.0.1" })
    await McpOAuthCallback.ensureRunning({ callbackHost: "127.0.0.1" })

    expect(serveCallArgs.length).toBe(1)
    expect(mockServer.stop).not.toHaveBeenCalled()
  })
})
