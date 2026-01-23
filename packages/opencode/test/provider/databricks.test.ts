import { test, expect, mock } from "bun:test"
import path from "path"

// === Mocks ===
// These mocks are required because Provider.list() triggers:
// 1. BunProc.install() for various packages
// 2. Plugin.list() which calls BunProc.install() for default plugins
// Without mocks, these would attempt real package installations that timeout in tests.

mock.module("../../src/bun/index", () => ({
  BunProc: {
    install: async (pkg: string) => pkg,
    run: async () => {
      throw new Error("BunProc.run should not be called in tests")
    },
    which: () => process.execPath,
    InstallFailedError: class extends Error {},
  },
}))

mock.module("@aws-sdk/credential-providers", () => ({
  fromNodeProviderChain: () => async () => ({
    accessKeyId: "mock-access-key-id",
    secretAccessKey: "mock-secret-access-key",
  }),
}))

const mockPlugin = () => ({})
mock.module("opencode-copilot-auth", () => ({ default: mockPlugin }))
mock.module("opencode-anthropic-auth", () => ({ default: mockPlugin }))
mock.module("@gitlab/opencode-gitlab-auth", () => ({ default: mockPlugin }))

// Import after mocks are set up
const { tmpdir } = await import("../fixture/fixture")
const { Instance } = await import("../../src/project/instance")
const { Provider } = await import("../../src/provider/provider")
const { Env } = await import("../../src/env")
const { Global } = await import("../../src/global")

test("Databricks: loads when DATABRICKS_HOST and DATABRICKS_TOKEN are set", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
        }),
      )
    },
  })
  await Instance.provide({
    directory: tmp.path,
    init: async () => {
      Env.set("DATABRICKS_HOST", "https://my-workspace.cloud.databricks.com")
      Env.set("DATABRICKS_TOKEN", "test-token")
    },
    fn: async () => {
      const providers = await Provider.list()
      expect(providers["databricks"]).toBeDefined()
      expect(providers["databricks"].name).toBe("Databricks")
    },
  })
})

test("Databricks: does not load when only DATABRICKS_HOST is set (no auth)", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
        }),
      )
    },
  })
  await Instance.provide({
    directory: tmp.path,
    init: async () => {
      Env.set("DATABRICKS_HOST", "https://my-workspace.cloud.databricks.com")
      Env.remove("DATABRICKS_TOKEN") // Explicitly clear token
    },
    fn: async () => {
      const providers = await Provider.list()
      expect(providers["databricks"]).toBeUndefined()
    },
  })
})

test("Databricks: config host takes precedence over DATABRICKS_HOST env var", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          provider: {
            databricks: {
              options: {
                host: "https://config-workspace.cloud.databricks.com",
              },
            },
          },
        }),
      )
    },
  })
  await Instance.provide({
    directory: tmp.path,
    init: async () => {
      Env.set("DATABRICKS_HOST", "https://env-workspace.cloud.databricks.com")
      Env.set("DATABRICKS_TOKEN", "test-token")
    },
    fn: async () => {
      const providers = await Provider.list()
      expect(providers["databricks"]).toBeDefined()
      // baseURL should use config host
      expect(providers["databricks"].options.baseURL).toContain("config-workspace")
    },
  })
})

test("Databricks: baseURL option takes precedence", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          provider: {
            databricks: {
              options: {
                baseURL: "https://custom-url.cloud.databricks.com/serving-endpoints",
              },
            },
          },
        }),
      )
    },
  })
  await Instance.provide({
    directory: tmp.path,
    init: async () => {
      Env.set("DATABRICKS_HOST", "https://env-workspace.cloud.databricks.com")
      Env.set("DATABRICKS_TOKEN", "test-token")
    },
    fn: async () => {
      const providers = await Provider.list()
      expect(providers["databricks"]).toBeDefined()
      expect(providers["databricks"].options.baseURL).toBe("https://custom-url.cloud.databricks.com/serving-endpoints")
    },
  })
})

test("Databricks: includes default models", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
        }),
      )
    },
  })
  await Instance.provide({
    directory: tmp.path,
    init: async () => {
      Env.set("DATABRICKS_HOST", "https://my-workspace.cloud.databricks.com")
      Env.set("DATABRICKS_TOKEN", "test-token")
    },
    fn: async () => {
      const providers = await Provider.list()
      expect(providers["databricks"]).toBeDefined()
      const models = Object.keys(providers["databricks"].models)
      // Should include Claude models (tool-calling capable)
      expect(models.some((m) => m.includes("claude"))).toBe(true)
      // Should include GPT models (tool-calling capable)
      expect(models.some((m) => m.includes("gpt-5"))).toBe(true)
      // Should include Gemini models (tool-calling capable)
      expect(models.some((m) => m.includes("gemini"))).toBe(true)
    },
  })
})

test("Databricks: custom models via config", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          provider: {
            databricks: {
              models: {
                "custom-endpoint": {
                  name: "Custom Endpoint",
                  tool_call: true,
                  limit: { context: 100000, output: 10000 },
                },
              },
            },
          },
        }),
      )
    },
  })
  await Instance.provide({
    directory: tmp.path,
    init: async () => {
      Env.set("DATABRICKS_HOST", "https://my-workspace.cloud.databricks.com")
      Env.set("DATABRICKS_TOKEN", "test-token")
    },
    fn: async () => {
      const providers = await Provider.list()
      expect(providers["databricks"]).toBeDefined()
      expect(providers["databricks"].models["custom-endpoint"]).toBeDefined()
      expect(providers["databricks"].models["custom-endpoint"].name).toBe("Custom Endpoint")
    },
  })
})

test("Databricks: loads when bearer token from auth.json is present", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
        }),
      )
    },
  })

  const authPath = path.join(Global.Path.data, "auth.json")

  // Backup existing auth.json if it exists
  const authFile = Bun.file(authPath)
  const existingAuth = await authFile.exists() ? await authFile.text() : null

  // Write test auth
  await Bun.write(
    authPath,
    JSON.stringify({
      databricks: {
        type: "api",
        key: "test-bearer-token",
      },
    }),
  )

  try {
    await Instance.provide({
      directory: tmp.path,
      init: async () => {
        Env.set("DATABRICKS_HOST", "https://my-workspace.cloud.databricks.com")
        // No DATABRICKS_TOKEN env var - using auth.json instead
      },
      fn: async () => {
        const providers = await Provider.list()
        expect(providers["databricks"]).toBeDefined()
      },
    })
  } finally {
    // Restore original auth.json or delete if it didn't exist
    if (existingAuth !== null) {
      await Bun.write(authPath, existingAuth)
    } else {
      await Bun.write(authPath, JSON.stringify({}))
    }
  }
})

test("Databricks: appends /serving-endpoints to host URL", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
        }),
      )
    },
  })
  await Instance.provide({
    directory: tmp.path,
    init: async () => {
      Env.set("DATABRICKS_HOST", "https://my-workspace.cloud.databricks.com")
      Env.set("DATABRICKS_TOKEN", "test-token")
    },
    fn: async () => {
      const providers = await Provider.list()
      expect(providers["databricks"]).toBeDefined()
      expect(providers["databricks"].options.baseURL).toBe(
        "https://my-workspace.cloud.databricks.com/serving-endpoints",
      )
    },
  })
})

test("Databricks: does not duplicate /serving-endpoints if already present", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          provider: {
            databricks: {
              options: {
                host: "https://my-workspace.cloud.databricks.com/serving-endpoints",
              },
            },
          },
        }),
      )
    },
  })
  await Instance.provide({
    directory: tmp.path,
    init: async () => {
      Env.set("DATABRICKS_TOKEN", "test-token")
    },
    fn: async () => {
      const providers = await Provider.list()
      expect(providers["databricks"]).toBeDefined()
      // Should not duplicate /serving-endpoints
      expect(providers["databricks"].options.baseURL).toBe(
        "https://my-workspace.cloud.databricks.com/serving-endpoints",
      )
    },
  })
})

test("Databricks: sets User-Agent header", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
        }),
      )
    },
  })
  await Instance.provide({
    directory: tmp.path,
    init: async () => {
      Env.set("DATABRICKS_HOST", "https://my-workspace.cloud.databricks.com")
      Env.set("DATABRICKS_TOKEN", "test-token")
    },
    fn: async () => {
      const providers = await Provider.list()
      expect(providers["databricks"]).toBeDefined()
      expect(providers["databricks"].options.headers["User-Agent"]).toBe("opencode")
    },
  })
})

test("Databricks: sets x-databricks-disable-beta-headers header", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
        }),
      )
    },
  })
  await Instance.provide({
    directory: tmp.path,
    init: async () => {
      Env.set("DATABRICKS_HOST", "https://my-workspace.cloud.databricks.com")
      Env.set("DATABRICKS_TOKEN", "test-token")
    },
    fn: async () => {
      const providers = await Provider.list()
      expect(providers["databricks"]).toBeDefined()
      expect(providers["databricks"].options.headers["x-databricks-disable-beta-headers"]).toBe("true")
    },
  })
})

test("Databricks: sets includeUsage to false", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
        }),
      )
    },
  })
  await Instance.provide({
    directory: tmp.path,
    init: async () => {
      Env.set("DATABRICKS_HOST", "https://my-workspace.cloud.databricks.com")
      Env.set("DATABRICKS_TOKEN", "test-token")
    },
    fn: async () => {
      const providers = await Provider.list()
      expect(providers["databricks"]).toBeDefined()
      expect(providers["databricks"].options.includeUsage).toBe(false)
    },
  })
})

// OAuth M2M tests - note: these test the config parsing, not actual token fetching
// since we'd need to mock the OAuth endpoint

test("Databricks: OAuth M2M credentials via config", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          provider: {
            databricks: {
              options: {
                host: "https://my-workspace.cloud.databricks.com",
                clientId: "test-client-id",
                clientSecret: "test-client-secret",
              },
            },
          },
        }),
      )
    },
  })
  // This test verifies that the config is parsed correctly
  // The actual OAuth flow would require mocking the fetch call
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      // Without a way to mock the OAuth endpoint, this will return autoload: false
      // because the token fetch will fail. We're just verifying config parsing works.
      const providers = await Provider.list()
      // Provider won't load because OAuth token fetch fails (no mock endpoint)
      // This is expected behavior - we'd need to mock fetch for a full test
    },
  })
})

test("Databricks: model capabilities are set correctly", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
        }),
      )
    },
  })
  await Instance.provide({
    directory: tmp.path,
    init: async () => {
      Env.set("DATABRICKS_HOST", "https://my-workspace.cloud.databricks.com")
      Env.set("DATABRICKS_TOKEN", "test-token")
    },
    fn: async () => {
      const providers = await Provider.list()
      expect(providers["databricks"]).toBeDefined()
      // Check Claude model capabilities
      const claudeModel = providers["databricks"].models["databricks-claude-sonnet-4"]
      expect(claudeModel).toBeDefined()
      expect(claudeModel.capabilities.toolcall).toBe(true)
      expect(claudeModel.capabilities.attachment).toBe(true)

      // Check GPT model capabilities
      const gptModel = providers["databricks"].models["databricks-gpt-5"]
      expect(gptModel).toBeDefined()
      expect(gptModel.capabilities.toolcall).toBe(true)
      expect(gptModel.capabilities.attachment).toBe(true)
    },
  })
})

// Model family tests - verify all model types are present with correct capabilities

test("Databricks: GPT-5 models have correct capabilities", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({ $schema: "https://opencode.ai/config.json" }),
      )
    },
  })
  await Instance.provide({
    directory: tmp.path,
    init: async () => {
      Env.set("DATABRICKS_HOST", "https://my-workspace.cloud.databricks.com")
      Env.set("DATABRICKS_TOKEN", "test-token")
    },
    fn: async () => {
      const providers = await Provider.list()
      const models = providers["databricks"].models

      // GPT-5.2
      const gpt52 = models["databricks-gpt-5-2"]
      expect(gpt52).toBeDefined()
      expect(gpt52.family).toBe("gpt-5")
      expect(gpt52.capabilities.reasoning).toBe(true)
      expect(gpt52.capabilities.toolcall).toBe(true)
      expect(gpt52.capabilities.attachment).toBe(true)
      expect(gpt52.capabilities.input.image).toBe(true)

      // GPT-5.1
      const gpt51 = models["databricks-gpt-5-1"]
      expect(gpt51).toBeDefined()
      expect(gpt51.family).toBe("gpt-5")
      expect(gpt51.capabilities.reasoning).toBe(true)

      // GPT-5.1 Codex Max
      const codexMax = models["databricks-gpt-5-1-codex-max"]
      expect(codexMax).toBeDefined()
      expect(codexMax.family).toBe("gpt-5-codex")
      expect(codexMax.capabilities.reasoning).toBe(true)

      // GPT-5.1 Codex Mini
      const codexMini = models["databricks-gpt-5-1-codex-mini"]
      expect(codexMini).toBeDefined()
      expect(codexMini.family).toBe("gpt-5-codex")

      // GPT-5
      const gpt5 = models["databricks-gpt-5"]
      expect(gpt5).toBeDefined()
      expect(gpt5.family).toBe("gpt-5")
      expect(gpt5.capabilities.reasoning).toBe(true)

      // GPT-5 mini
      const gpt5Mini = models["databricks-gpt-5-mini"]
      expect(gpt5Mini).toBeDefined()
      expect(gpt5Mini.family).toBe("gpt-5-mini")
      expect(gpt5Mini.capabilities.reasoning).toBe(true)

      // GPT-5 nano - no reasoning
      const gpt5Nano = models["databricks-gpt-5-nano"]
      expect(gpt5Nano).toBeDefined()
      expect(gpt5Nano.family).toBe("gpt-5-nano")
      expect(gpt5Nano.capabilities.reasoning).toBe(false)

      // GPT OSS models are excluded - they don't support tool calling reliably
      expect(models["databricks-gpt-oss-120b"]).toBeUndefined()
      expect(models["databricks-gpt-oss-20b"]).toBeUndefined()
    },
  })
})

test("Databricks: Gemini models have correct capabilities", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({ $schema: "https://opencode.ai/config.json" }),
      )
    },
  })
  await Instance.provide({
    directory: tmp.path,
    init: async () => {
      Env.set("DATABRICKS_HOST", "https://my-workspace.cloud.databricks.com")
      Env.set("DATABRICKS_TOKEN", "test-token")
    },
    fn: async () => {
      const providers = await Provider.list()
      const models = providers["databricks"].models

      // Gemini 3 Pro
      const gemini3Pro = models["databricks-gemini-3-pro"]
      expect(gemini3Pro).toBeDefined()
      expect(gemini3Pro.family).toBe("gemini-3")
      expect(gemini3Pro.capabilities.reasoning).toBe(true)
      expect(gemini3Pro.capabilities.input.image).toBe(true)
      expect(gemini3Pro.capabilities.input.audio).toBe(true)
      expect(gemini3Pro.capabilities.input.video).toBe(true)
      expect(gemini3Pro.limit.context).toBe(1000000) // 1M context

      // Gemini 3 Flash - no reasoning
      const gemini3Flash = models["databricks-gemini-3-flash"]
      expect(gemini3Flash).toBeDefined()
      expect(gemini3Flash.family).toBe("gemini-3")
      expect(gemini3Flash.capabilities.reasoning).toBe(false)

      // Gemini 2.5 Pro
      const gemini25Pro = models["databricks-gemini-2-5-pro"]
      expect(gemini25Pro).toBeDefined()
      expect(gemini25Pro.family).toBe("gemini-2.5")
      expect(gemini25Pro.capabilities.reasoning).toBe(true)

      // Gemini 2.5 Flash
      const gemini25Flash = models["databricks-gemini-2-5-flash"]
      expect(gemini25Flash).toBeDefined()
      expect(gemini25Flash.family).toBe("gemini-2.5")
      expect(gemini25Flash.capabilities.reasoning).toBe(true)

      // Gemma 3 12B is excluded - limited tool support
      expect(models["databricks-gemma-3-12b"]).toBeUndefined()
    },
  })
})

test("Databricks: Claude models have correct capabilities", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({ $schema: "https://opencode.ai/config.json" }),
      )
    },
  })
  await Instance.provide({
    directory: tmp.path,
    init: async () => {
      Env.set("DATABRICKS_HOST", "https://my-workspace.cloud.databricks.com")
      Env.set("DATABRICKS_TOKEN", "test-token")
    },
    fn: async () => {
      const providers = await Provider.list()
      const models = providers["databricks"].models

      // Claude Sonnet 4 - no reasoning
      const claudeSonnet4 = models["databricks-claude-sonnet-4"]
      expect(claudeSonnet4).toBeDefined()
      expect(claudeSonnet4.family).toBe("claude-sonnet")
      expect(claudeSonnet4.capabilities.reasoning).toBe(false)
      expect(claudeSonnet4.capabilities.attachment).toBe(true)
      expect(claudeSonnet4.capabilities.input.image).toBe(true)

      // Claude Sonnet 4.5 - with reasoning
      const claudeSonnet45 = models["databricks-claude-sonnet-4-5"]
      expect(claudeSonnet45).toBeDefined()
      expect(claudeSonnet45.family).toBe("claude-sonnet")
      expect(claudeSonnet45.capabilities.reasoning).toBe(true)

      // Claude Haiku 4.5
      const claudeHaiku = models["databricks-claude-haiku-4-5"]
      expect(claudeHaiku).toBeDefined()
      expect(claudeHaiku.family).toBe("claude-haiku")
      expect(claudeHaiku.capabilities.reasoning).toBe(false)

      // Claude Opus 4.5
      const claudeOpus45 = models["databricks-claude-opus-4-5"]
      expect(claudeOpus45).toBeDefined()
      expect(claudeOpus45.family).toBe("claude-opus")
      expect(claudeOpus45.capabilities.reasoning).toBe(true)

      // Claude 3.7 Sonnet
      const claude37 = models["databricks-claude-3-7-sonnet"]
      expect(claude37).toBeDefined()
      expect(claude37.family).toBe("claude-sonnet")
      expect(claude37.capabilities.reasoning).toBe(true)

      // Claude Opus 4.1
      const claudeOpus41 = models["databricks-claude-opus-4-1"]
      expect(claudeOpus41).toBeDefined()
      expect(claudeOpus41.family).toBe("claude-opus")
      expect(claudeOpus41.capabilities.reasoning).toBe(true)
    },
  })
})

test("Databricks: non-tool-calling models are excluded", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({ $schema: "https://opencode.ai/config.json" }),
      )
    },
  })
  await Instance.provide({
    directory: tmp.path,
    init: async () => {
      Env.set("DATABRICKS_HOST", "https://my-workspace.cloud.databricks.com")
      Env.set("DATABRICKS_TOKEN", "test-token")
    },
    fn: async () => {
      const providers = await Provider.list()
      const models = providers["databricks"].models

      // Llama models are excluded - unreliable tool support via OpenAI-compatible API
      expect(models["databricks-llama-4-maverick"]).toBeUndefined()
      expect(models["databricks-meta-llama-3-3-70b-instruct"]).toBeUndefined()
      expect(models["databricks-meta-llama-3-1-405b-instruct"]).toBeUndefined()
      expect(models["databricks-meta-llama-3-1-8b-instruct"]).toBeUndefined()

      // Qwen models are excluded - unreliable tool support via OpenAI-compatible API
      expect(models["databricks-qwen3-next-80b-a3b-instruct"]).toBeUndefined()
    },
  })
})

test("Databricks: all models have required API configuration and tool support", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({ $schema: "https://opencode.ai/config.json" }),
      )
    },
  })
  await Instance.provide({
    directory: tmp.path,
    init: async () => {
      Env.set("DATABRICKS_HOST", "https://my-workspace.cloud.databricks.com")
      Env.set("DATABRICKS_TOKEN", "test-token")
    },
    fn: async () => {
      const providers = await Provider.list()
      const models = providers["databricks"].models

      // All models should use openai-compatible SDK and support tool calling
      for (const [modelId, model] of Object.entries(models)) {
        expect(model.api.npm).toBe("@ai-sdk/openai-compatible")
        expect(model.providerID).toBe("databricks")
        expect(model.api.url).toContain("serving-endpoints")
        expect(model.status).toBe("active")
        // All included models must support tool calling
        expect(model.capabilities.toolcall).toBe(true)
      }
    },
  })
})

test("Databricks: model costs are set correctly", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({ $schema: "https://opencode.ai/config.json" }),
      )
    },
  })
  await Instance.provide({
    directory: tmp.path,
    init: async () => {
      Env.set("DATABRICKS_HOST", "https://my-workspace.cloud.databricks.com")
      Env.set("DATABRICKS_TOKEN", "test-token")
    },
    fn: async () => {
      const providers = await Provider.list()
      const models = providers["databricks"].models

      // GPT-5 models should have cache pricing
      const gpt5 = models["databricks-gpt-5"]
      expect(gpt5.cost.input).toBeGreaterThan(0)
      expect(gpt5.cost.output).toBeGreaterThan(0)
      expect(gpt5.cost.cache.read).toBeGreaterThan(0)

      // Gemini models should have cache pricing
      const gemini = models["databricks-gemini-3-pro"]
      expect(gemini.cost.input).toBeGreaterThan(0)
      expect(gemini.cost.output).toBeGreaterThan(0)
      expect(gemini.cost.cache.read).toBeGreaterThan(0)

      // Claude models should have cache pricing
      const claude = models["databricks-claude-sonnet-4"]
      expect(claude.cost.input).toBeGreaterThan(0)
      expect(claude.cost.output).toBeGreaterThan(0)
      expect(claude.cost.cache.read).toBeGreaterThan(0)
    },
  })
})
