import { describe, expect, test } from "bun:test"
import { WebFetchTool } from "../../src/tool/webfetch"
import type { PermissionNext } from "../../src/permission/next"

function formatWebfetchRules(ruleset: PermissionNext.Ruleset): string | undefined {
  const rules = ruleset.filter((r) => r.permission === "webfetch")
  if (!rules.length) return
  if (rules.length === 1 && rules[0].pattern === "*" && rules[0].action === "allow") return
  const lines = rules.map((r) => `  ${r.action}: ${r.pattern}`)
  return ["<webfetch-url-permissions>", ...lines, "</webfetch-url-permissions>"].join("\n")
}

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

describe("formatWebfetchRules", () => {
  test("returns undefined when no webfetch rules", () => {
    const ruleset: PermissionNext.Ruleset = [{ permission: "bash", pattern: "*", action: "allow" }]
    expect(formatWebfetchRules(ruleset)).toBeUndefined()
  })

  test("returns undefined when only default allow", () => {
    const ruleset: PermissionNext.Ruleset = [{ permission: "webfetch", pattern: "*", action: "allow" }]
    expect(formatWebfetchRules(ruleset)).toBeUndefined()
  })

  test("formats mixed rules", () => {
    const ruleset: PermissionNext.Ruleset = [
      { permission: "webfetch", pattern: "*", action: "deny" },
      { permission: "webfetch", pattern: "https://docs.example.com/*", action: "allow" },
      { permission: "webfetch", pattern: "*.internal.com/*", action: "ask" },
    ]
    const result = formatWebfetchRules(ruleset)
    expect(result).toBe(
      [
        "<webfetch-url-permissions>",
        "  deny: *",
        "  allow: https://docs.example.com/*",
        "  ask: *.internal.com/*",
        "</webfetch-url-permissions>",
      ].join("\n"),
    )
  })

  test("preserves rule order", () => {
    const ruleset: PermissionNext.Ruleset = [
      { permission: "webfetch", pattern: "https://allowed.com/*", action: "allow" },
      { permission: "webfetch", pattern: "*", action: "deny" },
    ]
    const result = formatWebfetchRules(ruleset)
    expect(result).toBe(
      ["<webfetch-url-permissions>", "  allow: https://allowed.com/*", "  deny: *", "</webfetch-url-permissions>"].join(
        "\n",
      ),
    )
  })

  test("formats deny all except specific host", () => {
    const ruleset: PermissionNext.Ruleset = [
      { permission: "webfetch", pattern: "*", action: "deny" },
      { permission: "webfetch", pattern: "github.com", action: "allow" },
      { permission: "webfetch", pattern: "github.com/*", action: "allow" },
    ]
    const result = formatWebfetchRules(ruleset)
    expect(result).toBe(
      [
        "<webfetch-url-permissions>",
        "  deny: *",
        "  allow: github.com",
        "  allow: github.com/*",
        "</webfetch-url-permissions>",
      ].join("\n"),
    )
  })
})
