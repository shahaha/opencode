import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import path from "path"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Env } from "../../src/env"

describe("Env", () => {
  describe("test mode (with OPENCODE_TEST_HOME)", () => {
    it("snapshot isolation - late-set process.env not visible", async () => {
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
        fn: async () => {
          const initial = Env.get("TEST_LATE_VAR_1")
          process.env["TEST_LATE_VAR_1"] = "outside"
          expect(Env.get("TEST_LATE_VAR_1")).toBe(initial)
          delete process.env["TEST_LATE_VAR_1"]
        },
      })
    })

    it("Env.set() updates snapshot, not process.env", async () => {
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
        fn: async () => {
          Env.set("TEST_INTERNAL_VAR", "inside")
          expect(Env.get("TEST_INTERNAL_VAR")).toBe("inside")
          expect(process.env["TEST_INTERNAL_VAR"]).toBeUndefined()
        },
      })
    })

    it("Env.get() returns same value as Env.all()[key] in test mode", async () => {
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
        fn: async () => {
          Env.set("TEST_CONSISTENCY_VAR", "consistent-value")
          const fromGet = Env.get("TEST_CONSISTENCY_VAR")
          const fromAll = Env.all()["TEST_CONSISTENCY_VAR"]
          expect(fromGet).toBe(fromAll)
          expect(fromGet).toBe("consistent-value")
        },
      })
    })

    it("Env.all() returns snapshot object in test mode", async () => {
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
        fn: async () => {
          Env.set("TEST_SNAPSHOT_1", "value1")
          Env.set("TEST_SNAPSHOT_2", "value2")
          const all = Env.all()
          expect(all["TEST_SNAPSHOT_1"]).toBe("value1")
          expect(all["TEST_SNAPSHOT_2"]).toBe("value2")
        },
      })
    })

    it("Env.remove() removes from snapshot", async () => {
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
        fn: async () => {
          Env.set("TEST_REMOVE_VAR", "will-be-removed")
          expect(Env.get("TEST_REMOVE_VAR")).toBe("will-be-removed")
          Env.remove("TEST_REMOVE_VAR")
          expect(Env.get("TEST_REMOVE_VAR")).toBeUndefined()
        },
      })
    })
  })

  describe("production mode (without OPENCODE_TEST_HOME)", () => {
    const originalTestHome = process.env["OPENCODE_TEST_HOME"]

    beforeEach(() => {
      delete process.env["OPENCODE_TEST_HOME"]
    })

    afterEach(() => {
      if (originalTestHome) process.env["OPENCODE_TEST_HOME"] = originalTestHome
      delete process.env["TEST_PROD_LATE_VAR"]
      delete process.env["TEST_PROD_SET_VAR"]
      delete process.env["TEST_PROD_REMOVE_VAR"]
      delete process.env["TEST_PROD_CONSISTENCY_VAR"]
      delete process.env["TEST_PROD_VAR_1"]
      delete process.env["TEST_PROD_VAR_2"]
    })

    it("variable set AFTER first Env.get() call is detected on second call (issue #12698)", async () => {
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
        fn: async () => {
          expect(Env.get("TEST_PROD_LATE_VAR")).toBeUndefined()

          process.env["TEST_PROD_LATE_VAR"] = "late-value"

          expect(Env.get("TEST_PROD_LATE_VAR")).toBe("late-value")
        },
      })
    })

    it("variable set AFTER first Env.all() call is detected on second call (issue #12698)", async () => {
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
        fn: async () => {
          const all1 = Env.all()
          expect(all1["TEST_PROD_LATE_VAR"]).toBeUndefined()

          process.env["TEST_PROD_LATE_VAR"] = "late-value"

          const all2 = Env.all()
          expect(all2["TEST_PROD_LATE_VAR"]).toBe("late-value")
        },
      })
    })

    it("Env.set() updates process.env directly", async () => {
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
        fn: async () => {
          Env.set("TEST_PROD_SET_VAR", "set-value")
          expect(process.env["TEST_PROD_SET_VAR"]).toBe("set-value")
          expect(Env.get("TEST_PROD_SET_VAR")).toBe("set-value")
        },
      })
    })

    it("Env.remove() deletes from process.env", async () => {
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
        fn: async () => {
          process.env["TEST_PROD_REMOVE_VAR"] = "will-be-removed"
          Env.remove("TEST_PROD_REMOVE_VAR")
          expect(process.env["TEST_PROD_REMOVE_VAR"]).toBeUndefined()
          expect(Env.get("TEST_PROD_REMOVE_VAR")).toBeUndefined()
        },
      })
    })

    it("Env.get() returns same value as Env.all()[key] in production mode", async () => {
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
        fn: async () => {
          process.env["TEST_PROD_CONSISTENCY_VAR"] = "consistent-prod-value"
          const fromGet = Env.get("TEST_PROD_CONSISTENCY_VAR")
          const fromAll = Env.all()["TEST_PROD_CONSISTENCY_VAR"]
          expect(fromGet).toBe(fromAll)
          expect(fromGet).toBe("consistent-prod-value")
        },
      })
    })

    it("Env.all() returns process.env object in production mode", async () => {
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
        fn: async () => {
          process.env["TEST_PROD_VAR_1"] = "prod-value-1"
          process.env["TEST_PROD_VAR_2"] = "prod-value-2"
          const all = Env.all()
          expect(all["TEST_PROD_VAR_1"]).toBe("prod-value-1")
          expect(all["TEST_PROD_VAR_2"]).toBe("prod-value-2")
        },
      })
    })

    it("pre-existing env vars are accessible", async () => {
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
        fn: async () => {
          expect(Env.get("PATH")).toBe(process.env["PATH"])
          expect(Env.all()["PATH"]).toBe(process.env["PATH"])
        },
      })
    })
  })

  describe("test mode without Instance context (fallback)", () => {
    afterEach(() => {
      delete process.env["TEST_FALLBACK_VAR"]
    })

    it("Env.get() falls back to process.env when Instance not initialized", () => {
      process.env["TEST_FALLBACK_VAR"] = "fallback-value"
      expect(Env.get("TEST_FALLBACK_VAR")).toBe("fallback-value")
    })

    it("Env.all() falls back to process.env when Instance not initialized", () => {
      process.env["TEST_FALLBACK_VAR"] = "fallback-value"
      expect(Env.all()["TEST_FALLBACK_VAR"]).toBe("fallback-value")
    })

    it("Env.set() falls back to process.env when Instance not initialized", () => {
      Env.set("TEST_FALLBACK_VAR", "set-without-instance")
      expect(process.env["TEST_FALLBACK_VAR"]).toBe("set-without-instance")
    })

    it("Env.remove() falls back to process.env when Instance not initialized", () => {
      process.env["TEST_FALLBACK_VAR"] = "will-be-removed"
      Env.remove("TEST_FALLBACK_VAR")
      expect(process.env["TEST_FALLBACK_VAR"]).toBeUndefined()
    })
  })
})
