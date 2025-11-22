import { describe, expect, test } from "bun:test"
import { calculateChangedRanges, DiffRange } from "../src/format/diff-range"

describe("calculateChangedRanges", () => {
  test("calculates ranges for added lines", () => {
    const contentOld = "line1\nline2\nline3"
    const contentNew = "line1\nline2\nnewline\nline3"

    const ranges = calculateChangedRanges(contentOld, contentNew)

    // "newline\n" starts at offset 12 (after "line1\nline2\n") and has length 8
    expect(ranges.length).toBe(1)
    expect(ranges[0]!.start).toBe(12)
    expect(ranges[0]!.end).toBe(20)
    expect(ranges[0]!.getCachedByteOffsets()).toEqual({ start: 12, end: 20 })
  })

  test("calculates ranges for multiple added lines", () => {
    const contentOld = "line1\nline2\nline3"
    const contentNew = "line1\nline2\nnewline1\nnewline2\nnewline3\nline3"

    const ranges = calculateChangedRanges(contentOld, contentNew)

    // "newline1\nnewline2\nnewline3\n" starts at offset 12 and has length 27
    expect(ranges.length).toBe(1)
    expect(ranges[0]!.start).toBe(12)
    expect(ranges[0]!.end).toBe(39)
    expect(ranges[0]!.getCachedByteOffsets()).toEqual({ start: 12, end: 39 })
  })

  test("calculates ranges for removed lines", () => {
    const contentOld = "line1\nline2\nline3\nline4"
    const contentNew = "line1\nline2\nline4"

    const ranges = calculateChangedRanges(contentOld, contentNew)

    // "line3\n" was removed at offset 12 (after "line1\nline2\n")
    // Should report a zero-length range to trigger formatting at the join point
    expect(ranges.length).toBe(1)
    expect(ranges[0]!.start).toBe(12)
    expect(ranges[0]!.end).toBe(12)
    expect(ranges[0]!.getCachedByteOffsets()).toEqual({ start: 12, end: 12 })
  })

  test("calculates ranges for removed lines at end", () => {
    const contentOld = "line1\nline2\nline3"
    const contentNew = "line1\nline2"

    const ranges = calculateChangedRanges(contentOld, contentNew)

    // diffLines may report line2 as changed when line3 is removed (missing newline)
    // In this case "line2" changed from "line2\n" to "line2", so offset 6, length 5
    expect(ranges.length).toBe(1)
    expect(ranges[0]!.start).toBe(6)
    expect(ranges[0]!.end).toBe(11)
    expect(ranges[0]!.getCachedByteOffsets()).toEqual({ start: 6, end: 11 })
  })

  test("merges adjacent ranges", () => {
    const contentOld = "line1\nline2\nline3\nline4\nline5"
    const contentNew = "line1\nnew2\nline3\nnew4\nline5"

    const ranges = calculateChangedRanges(contentOld, contentNew)

    // "new2\n" at offset 6, length 5, and "new4\n" at offset 17, length 5
    // These should be merged since they're close
    expect(ranges.length).toBe(1)
    expect(ranges[0]!.start).toBe(6)
    expect(ranges[0]!.end).toBe(22)
    expect(ranges[0]!.getCachedByteOffsets()).toEqual({ start: 6, end: 22 })
  })

  test("keeps separate ranges when not adjacent", () => {
    const contentOld = "line1\nline2\nline3\nline4\nline5\nline6"
    const contentNew = "line1\nnew2\nline3\nline4\nline5\nnew6"

    const ranges = calculateChangedRanges(contentOld, contentNew)

    // "new2\n" at offset 6 and "new6" at offset 29 (counted properly)
    expect(ranges.length).toBe(2)
    expect(ranges[0]!.start).toBe(6)
    expect(ranges[0]!.end).toBe(11)
    expect(ranges[1]!.start).toBe(29)
    expect(ranges[1]!.end).toBe(33)
  })

  test("handles empty old content", () => {
    const contentOld = ""
    const contentNew = "line1\nline2\nline3"

    const ranges = calculateChangedRanges(contentOld, contentNew)

    expect(ranges.length).toBe(1)
    expect(ranges[0]!.start).toBe(0)
    expect(ranges[0]!.end).toBe(17)
    expect(ranges[0]!.getCachedByteOffsets()).toEqual({ start: 0, end: 17 })
  })

  test("handles complex edit with insertions and deletions", () => {
    const contentOld = "line1\nline2\nline3\nline4\nline5"
    const contentNew = "line1\nnewA\nnewB\nline4\nline5"

    const ranges = calculateChangedRanges(contentOld, contentNew)

    // "newA\nnewB\n" starts at offset 6, length 10
    expect(ranges.length).toBe(1)
    expect(ranges[0]!.start).toBe(6)
    expect(ranges[0]!.end).toBe(16)
    expect(ranges[0]!.getCachedByteOffsets()).toEqual({ start: 6, end: 16 })
  })

  test("handles adding lines at the beginning", () => {
    const contentOld = "line2\nline3"
    const contentNew = "line1\nline2\nline3"

    const ranges = calculateChangedRanges(contentOld, contentNew)

    // "line1\n" at offset 0, length 6
    expect(ranges.length).toBe(1)
    expect(ranges[0]!.start).toBe(0)
    expect(ranges[0]!.end).toBe(6)
    expect(ranges[0]!.getCachedByteOffsets()).toEqual({ start: 0, end: 6 })
  })

  test("handles adding lines at the end", () => {
    const contentOld = "line1\nline2\n"
    const contentNew = "line1\nline2\nline3\n"

    const ranges = calculateChangedRanges(contentOld, contentNew)

    // "line3\n" starts at offset 12, length 6
    expect(ranges.length).toBe(1)
    expect(ranges[0]!.start).toBe(12)
    expect(ranges[0]!.end).toBe(18)
    expect(ranges[0]!.getCachedByteOffsets()).toEqual({ start: 12, end: 18 })
  })

  test("returns empty array for identical content", () => {
    const content = "line1\nline2\nline3"

    const ranges = calculateChangedRanges(content, content)

    expect(ranges).toEqual([])
  })

  test("ignores line ending differences", () => {
    const contentOld = "line1\r\nline2\r\nline3"
    const contentNew = "line1\nline2\nline3"

    const ranges = calculateChangedRanges(contentOld, contentNew)

    expect(ranges).toEqual([])
  })

  test("handles byte-level accuracy for unicode", () => {
    const contentOld = "hello\nworld"
    const contentNew = "hello\n世界" // "世界" is "world" in Chinese

    const ranges = calculateChangedRanges(contentOld, contentNew)

    // "世界" starts at offset 6 (after "hello\n")
    // char length is 2 (2 JS chars)
    // byte length is 6 (each Chinese char is 3 bytes in UTF-8)
    expect(ranges.length).toBe(1)
    expect(ranges[0]!.start).toBe(6)
    expect(ranges[0]!.end).toBe(8)
    expect(ranges[0]!.getCachedByteOffsets()).toEqual({ start: 6, end: 12 })
  })

  test("handles unicode characters correctly in offsets", () => {
    const contentOld = "a"
    const contentNew = "a\n💩"

    const ranges = calculateChangedRanges(contentOld, contentNew)

    // "a" (no newline) changed to "a\n..." is treated as a change of the first line
    // So the range covers the entire new content
    expect(ranges.length).toBe(1)
    expect(ranges[0]!.start).toBe(0)
    expect(ranges[0]!.end).toBe(4)
    expect(ranges[0]!.getCachedByteOffsets()).toEqual({ start: 0, end: 6 })
  })

  test("handles unicode with previous content containing unicode", () => {
    const contentOld = "💩"
    const contentNew = "💩\nbar"

    const ranges = calculateChangedRanges(contentOld, contentNew)

    // Same here, "💩" changed to "💩\n..."
    expect(ranges.length).toBe(1)
    expect(ranges[0]!.start).toBe(0)
    expect(ranges[0]!.end).toBe(6)
    expect(ranges[0]!.getCachedByteOffsets()).toEqual({ start: 0, end: 8 })
  })

  test("clamps offset to EOF when deleting last line", () => {
    const contentOld = "line1\nline2"
    const contentNew = "line1\n"

    const ranges = calculateChangedRanges(contentOld, contentNew)

    // "line2" removed. newOffset would be 6 (length of "line1\n").
    // "line1\n" is 6 chars. valid offsets 0..5.
    // Should clamp to 5.
    expect(ranges.length).toBe(1)
    expect(ranges[0]!.start).toBe(5)
    expect(ranges[0]!.end).toBe(5)
    expect(ranges[0]!.getCachedByteOffsets()).toEqual({ start: 5, end: 5 })
  })
})

describe("DiffRange", () => {
  test("shouldMerge works correctly", () => {
    const range1 = new DiffRange(0, 5)
    const range2 = new DiffRange(6, 10) // 1 char gap - should merge
    const range3 = new DiffRange(15, 20) // 5 char gap - should not merge

    expect(range1.shouldMerge(range2)).toBe(true)
    expect(range1.shouldMerge(range3)).toBe(false)
  })

  test("merge works correctly", () => {
    const range1 = new DiffRange(0, 5)
    const range2 = new DiffRange(6, 10)

    const merged = range1.merge(range2)
    expect(merged.start).toBe(0)
    expect(merged.end).toBe(10)
  })
})
