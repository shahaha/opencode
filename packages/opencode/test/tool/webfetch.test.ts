import { describe, expect, test } from "bun:test"
import { WebFetchTool } from "../../src/tool/webfetch"

const ctx = {
  sessionID: "test",
  messageID: "",
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  metadata: () => {},
  ask: async () => {},
}

describe("tool.webfetch permission patterns", () => {
  const withFetch = async (fn: () => Promise<void>) => {
    const originalFetch = globalThis.fetch
    const stubFetch = async () =>
      new Response("ok", {
        status: 200,
        headers: {
          "content-type": "text/plain",
        },
      })
    globalThis.fetch = stubFetch as unknown as typeof fetch

    try {
      await fn()
    } finally {
      globalThis.fetch = originalFetch
    }
  }

  test("includes portless host patterns", async () => {
    const webfetch = await WebFetchTool.init()
    let patterns: string[] = []
    const askCtx = {
      ...ctx,
      ask: async (req: { patterns?: string[] }) => {
        patterns = req.patterns ?? []
      },
    }

    await withFetch(async () => {
      await webfetch.execute(
        {
          url: "https://example.com:8080/path?x=1#hash",
          format: "text",
        },
        askCtx,
      )
    })

    expect(patterns).toEqual([
      "https://example.com:8080/path?x=1#hash",
      "example.com:8080/path?x=1#hash",
      "example.com:8080",
      "https://example.com/path?x=1#hash",
      "example.com/path?x=1#hash",
      "example.com",
    ])
  })

  test("collapses duplicates when no port", async () => {
    const webfetch = await WebFetchTool.init()
    let patterns: string[] = []
    const askCtx = {
      ...ctx,
      ask: async (req: { patterns?: string[] }) => {
        patterns = req.patterns ?? []
      },
    }

    await withFetch(async () => {
      await webfetch.execute(
        {
          url: "https://example.com",
          format: "text",
        },
        askCtx,
      )
    })

    expect(patterns).toEqual(["https://example.com/", "example.com/", "example.com"])
  })
})
