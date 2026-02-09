import { describe, expect, test } from "bun:test"
import { budget, wrap } from "../../../src/cli/cmd/tui/ui/dialog-select-budget"

describe("dialog-select budget", () => {
  test("caps width to max", () => {
    expect(budget(200, 0, 2)).toBe(122)
  })

  test("scales with width", () => {
    expect(budget(40, 0, 2)).toBe(60)
    expect(budget(40, 0, 1)).toBe(61)
  })

  test("clamps to minimum", () => {
    expect(budget(0, 0, 1)).toBe(1)
  })

  test("subtracts footer length for strings", () => {
    const tail = "tail".length + 1
    expect(budget(40, tail, 2)).toBe(50)
  })

  test("ignores non-string footer", () => {
    expect(budget(40, 0, 2)).toBe(60)
  })

  test("keeps single-line budget constant", () => {
    expect(budget(40, 10, 1)).toBe(61)
  })

  test("wraps to two lines with ellipsis", () => {
    const text = "one two three four five six seven eight nine ten"
    const result = wrap(text, 20, 0, 2)
    const lines = result.split("\n")
    expect(lines.length).toBe(2)
    expect(lines.at(-1) ?? "").toContain("...")
  })

  test("wrap respects footer tail", () => {
    const text = "one two three four five six seven"
    const result = wrap(text, 20, 5, 2)
    const lines = result.split("\n")
    expect(lines.length).toBe(2)
    expect(lines.every((line) => line.length <= 5)).toBe(true)
  })

  test("wrap chunks long tokens", () => {
    const text = "supercalifragilisticexpialidocious"
    const result = wrap(text, 20, 0, 2)
    const lines = result.split("\n")
    expect(lines.length).toBe(2)
    expect(lines.at(-1) ?? "").toContain("...")
  })
})
