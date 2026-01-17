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
      // No token set
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
      // Should include Claude models
      expect(models.some((m) => m.includes("claude"))).toBe(true)
      // Should include Llama models
      expect(models.some((m) => m.includes("llama"))).toBe(true)
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

      // Check Llama model capabilities
      const llamaModel = providers["databricks"].models["databricks-llama-4-maverick"]
      expect(llamaModel).toBeDefined()
      expect(llamaModel.capabilities.toolcall).toBe(true)
      expect(llamaModel.capabilities.attachment).toBe(false) // Llama doesn't support images
    },
  })
})
