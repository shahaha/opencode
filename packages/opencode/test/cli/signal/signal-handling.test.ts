import { describe, test, expect } from "bun:test"
import path from "path"

const root = path.join(__dirname, "../../..")
const entry = path.join(root, "src/index.ts")

function spawn(args: string[]) {
  return Bun.spawn(["bun", "run", "--conditions=browser", entry, ...args], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  })
}

async function alive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

describe("signal handling", () => {
  test("serve exits gracefully on SIGHUP", async () => {
    const proc = spawn(["serve", "--port", "0"])
    await Bun.sleep(3000)
    expect(await alive(proc.pid)).toBe(true)

    process.kill(proc.pid, "SIGHUP")
    const code = await proc.exited

    // Our handler calls process.exit(0). Without it, SIGHUP default gives 129.
    expect(code).toBe(0)
  })

  test("serve exits gracefully on SIGTERM", async () => {
    const proc = spawn(["serve", "--port", "0"])
    await Bun.sleep(3000)
    expect(await alive(proc.pid)).toBe(true)

    process.kill(proc.pid, "SIGTERM")
    const code = await proc.exited

    expect(code).toBe(0)
  })
})
