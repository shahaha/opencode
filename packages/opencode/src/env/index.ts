import { Instance } from "../project/instance"

export namespace Env {
  const state = Instance.state(() => {
    // Create a shallow copy to isolate environment per instance
    // Prevents parallel tests from interfering with each other's env vars
    return { ...process.env } as Record<string, string | undefined>
  })

  function isTestMode() {
    return !!process.env["OPENCODE_TEST_HOME"]
  }

  export function get(key: string) {
    if (!isTestMode()) return process.env[key]
    return state()[key]
  }

  export function all() {
    if (!isTestMode()) return process.env as Record<string, string | undefined>
    return state()
  }

  export function set(key: string, value: string) {
    if (!isTestMode()) {
      process.env[key] = value
      return
    }
    state()[key] = value
  }

  export function remove(key: string) {
    if (!isTestMode()) {
      delete process.env[key]
      return
    }
    delete state()[key]
  }
}
