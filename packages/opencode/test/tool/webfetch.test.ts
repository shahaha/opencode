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
