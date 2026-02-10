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

  function tryState() {
    try {
      return state()
    } catch {
      // Instance context not initialized - fallback to process.env
      return undefined
    }
  }

  export function get(key: string) {
    if (!isTestMode()) return process.env[key]
    const s = tryState()
    if (s) return s[key]
    return process.env[key]
  }

  export function all() {
    if (!isTestMode()) return process.env as Record<string, string | undefined>
    const s = tryState()
    if (s) return s
    return process.env as Record<string, string | undefined>
  }

  export function set(key: string, value: string) {
    if (!isTestMode()) {
      process.env[key] = value
      return
    }
    const s = tryState()
    if (s) s[key] = value
    else process.env[key] = value
  }

  export function remove(key: string) {
    if (!isTestMode()) {
      delete process.env[key]
      return
    }
    const s = tryState()
    if (s) delete s[key]
    else delete process.env[key]
  }
}
