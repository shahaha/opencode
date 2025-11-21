import { describe, expect, test } from "bun:test"
import { calculateChangedLines } from "../src/format/diff-range"

describe("calculateChangedLines", () => {
  test("calculates ranges for added lines", () => {
    const contentOld = "line1\nline2\nline3"
    const contentNew = "line1\nline2\nnewline\nline3"

    const ranges = calculateChangedLines(contentOld, contentNew)

    expect(ranges).toEqual([{ start: 3, end: 3 }])
  })

  test("calculates ranges for multiple added lines", () => {
    const contentOld = "line1\nline2\nline3"
    const contentNew = "line1\nline2\nnewline1\nnewline2\nnewline3\nline3"

    const ranges = calculateChangedLines(contentOld, contentNew)

    expect(ranges).toEqual([{ start: 3, end: 5 }])
  })

  test("calculates ranges for removed lines", () => {
    const contentOld = "line1\nline2\nline3\nline4"
    const contentNew = "line1\nline2\nline4"

    const ranges = calculateChangedLines(contentOld, contentNew)

    // Removed line3. newLine points to line4 (which is now line 3).
    // Should target line 3 for context formatting.
    expect(ranges).toEqual([{ start: 3, end: 3 }])
  })

  test("calculates ranges for removed lines at end", () => {
    const contentOld = "line1\nline2\nline3"
    const contentNew = "line1\nline2"

    const ranges = calculateChangedLines(contentOld, contentNew)

    // Removed line3. newLine points past end (3).
    // Should clamp to last line (2).
    expect(ranges).toEqual([{ start: 2, end: 2 }])
  })

  test("merges adjacent ranges", () => {
    const contentOld = "line1\nline2\nline3\nline4\nline5"
    const contentNew = "line1\nnew2\nline3\nnew4\nline5"

    const ranges = calculateChangedLines(contentOld, contentNew)

    // Lines 2 and 4 are changed, should be merged into a single range
    expect(ranges).toEqual([{ start: 2, end: 4 }])
  })

  test("keeps separate ranges when not adjacent", () => {
    const contentOld = "line1\nline2\nline3\nline4\nline5\nline6"
    const contentNew = "line1\nnew2\nline3\nline4\nline5\nnew6"

    const ranges = calculateChangedLines(contentOld, contentNew)

    expect(ranges).toEqual([
      { start: 2, end: 2 },
      { start: 6, end: 6 },
    ])
  })

  test("handles empty old content", () => {
    const contentOld = ""
    const contentNew = "line1\nline2\nline3"

    const ranges = calculateChangedLines(contentOld, contentNew)

    expect(ranges).toEqual([{ start: 1, end: 3 }])
  })

  test("handles complex edit with insertions and deletions", () => {
    const contentOld = "line1\nline2\nline3\nline4\nline5"
    const contentNew = "line1\nnewA\nnewB\nline4\nline5"

    const ranges = calculateChangedLines(contentOld, contentNew)

    // Replaced lines 2-3 with newA-newB
    expect(ranges).toEqual([{ start: 2, end: 3 }])
  })

  test("handles adding lines at the beginning", () => {
    const contentOld = "line2\nline3"
    const contentNew = "line1\nline2\nline3"

    const ranges = calculateChangedLines(contentOld, contentNew)

    expect(ranges).toEqual([{ start: 1, end: 1 }])
  })

  test("handles adding lines at the end", () => {
    // Ensure trailing newline exists so 'line2' is not seen as modified when 'line3' is added
    const contentOld = "line1\nline2\n"
    const contentNew = "line1\nline2\nline3\n"

    const ranges = calculateChangedLines(contentOld, contentNew)

    expect(ranges).toEqual([{ start: 3, end: 3 }])
  })

  test("returns empty array for identical content", () => {
    const content = "line1\nline2\nline3"

    const ranges = calculateChangedLines(content, content)

    expect(ranges).toEqual([])
  })

  test("ignores line ending differences", () => {
    const contentOld = "line1\r\nline2\r\nline3"
    const contentNew = "line1\nline2\nline3"

    const ranges = calculateChangedLines(contentOld, contentNew)

    expect(ranges).toEqual([])
  })
})
