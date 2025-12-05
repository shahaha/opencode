import { diffLines } from "diff"

// Configuration constants
const MERGE_THRESHOLD = 6 // characters - about 1 line gap
const EOF_CLAMP_OFFSET = 1 // Safety margin for EOF clamping

/**
 * Clamp offset to be within valid file bounds
 */
function clampOffset(offset: number, total: number): number {
  return total > 0 ? Math.min(offset, total - EOF_CLAMP_OFFSET) : 0
}

/**
 * Simplified range representation with conversion methods
 */
export class DiffRange {
  constructor(
    public readonly start: number,
    public readonly end: number,
  ) {}

  /**
   * Convert to plain object for serialization
   */
  toJSON(): { start: number; end: number; _byteOffset?: number; _byteLength?: number } {
    const byteOffsets = this.getCachedByteOffsets()
    return {
      start: this.start,
      end: this.end,
      _byteOffset: byteOffsets?.start,
      _byteLength: byteOffsets ? byteOffsets.end - byteOffsets.start : undefined,
    }
  }

  /**
   * Create from plain object (for deserialization)
   */
  static fromJSON(data: { start: number; end: number; _byteOffset?: number; _byteLength?: number }): DiffRange {
    if (data.start < 0 || data.end < 0) {
      throw new Error(`Invalid range: negative offsets (start=${data.start}, end=${data.end})`)
    }
    if (data.start > data.end) {
      throw new Error(`Invalid range: start ${data.start} > end ${data.end}`)
    }
    const range = new DiffRange(data.start, data.end)
    if (data._byteOffset !== undefined && data._byteLength !== undefined) {
      range._byteOffset = data._byteOffset
      range._byteLength = data._byteLength
    }
    return range
  }

  get length(): number {
    return this.end - this.start
  }

  // Private storage for cached byte offsets (mutable for factory methods)
  private _byteOffset?: number
  private _byteLength?: number

  /**
   * Create DiffRange from character and byte offsets
   */
  static fromOffsets(charOffset: number, charLength: number, byteOffset: number, byteLength: number): DiffRange {
    const range = new DiffRange(charOffset, charOffset + charLength)
    range._byteOffset = byteOffset
    range._byteLength = byteLength
    return range
  }

  getCachedByteOffsets(): { start: number; end: number } | undefined {
    if (this._byteOffset !== undefined && this._byteLength !== undefined) {
      return { start: this._byteOffset, end: this._byteOffset + this._byteLength }
    }
    return undefined
  }

  /**
   * Check if this range should be merged with another
   */
  shouldMerge(other: DiffRange): boolean {
    return other.start - this.end <= MERGE_THRESHOLD
  }

  /**
   * Merge this range with another
   */
  merge(other: DiffRange): DiffRange {
    const newStart = Math.min(this.start, other.start)
    const newEnd = Math.max(this.end, other.end)
    const merged = new DiffRange(newStart, newEnd)

    // Merge cached byte offsets if available
    const thisBytes = this.getCachedByteOffsets()
    const otherBytes = other.getCachedByteOffsets()
    if (thisBytes && otherBytes) {
      merged._byteOffset = Math.min(thisBytes.start, otherBytes.start)
      merged._byteLength = Math.max(thisBytes.end, otherBytes.end) - merged._byteOffset
    }

    return merged
  }
}

/**
 * Calculate changed ranges from old and new content
 * Returns ranges that can be converted to both character and byte offsets
 */
export function calculateRanges(oldContent: string, newContent: string): DiffRange[] {
  const changes = diffLines(oldContent.replace(/\r\n/g, "\n"), newContent.replace(/\r\n/g, "\n"))
  const result: DiffRange[] = []

  let charOffset = 0
  let byteOffset = 0

  const totalChars = newContent.length
  const totalBytes = Buffer.byteLength(newContent)

  for (const change of changes) {
    if (change.added) {
      const text = change.value
      const bytes = Buffer.byteLength(text)
      result.push(DiffRange.fromOffsets(charOffset, text.length, byteOffset, bytes))
      charOffset += text.length
      byteOffset += bytes
      continue
    }
    if (change.removed) {
      result.push(DiffRange.fromOffsets(clampOffset(charOffset, totalChars), 0, clampOffset(byteOffset, totalBytes), 0))
      continue
    }
    const text = change.value
    const bytes = Buffer.byteLength(text)
    charOffset += text.length
    byteOffset += bytes
  }

  return mergeRanges(result)
}

/**
 * Merge adjacent ranges to reduce formatter invocations
 */
function mergeRanges(ranges: DiffRange[]): DiffRange[] {
  if (ranges.length === 0) return ranges

  return ranges
    .toSorted((a, b) => a.start - b.start)
    .reduce((acc, cur) => {
      if (acc.length === 0) return [cur]

      const last = acc[acc.length - 1]
      if (last.shouldMerge(cur)) {
        acc[acc.length - 1] = last.merge(cur)
        return acc
      }
      acc.push(cur)
      return acc
    }, [] as DiffRange[])
}
