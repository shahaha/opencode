import { diffLines } from "diff"

export interface LineRange {
  start: number
  end: number
}

/**
 * Calculate changed line ranges from old and new content
 * Returns 1-indexed line ranges suitable for formatters like clang-format
 */
export function calculateChangedLines(contentOld: string, contentNew: string): LineRange[] {
  const changes = diffLines(contentOld.replace(/\r\n/g, "\n"), contentNew.replace(/\r\n/g, "\n"))
  const ranges: LineRange[] = []

  let oldLine = 1
  let newLine = 1

  // Calculate total new lines for clamping
  const totalNewLines = changes.reduce(
    (acc, change) => acc + (change.added || (!change.added && !change.removed) ? change.count || 0 : 0),
    0,
  )

  for (const change of changes) {
    const count = change.count || 0

    if (change.added) {
      // Lines were added in new content
      if (count > 0) {
        ranges.push({ start: newLine, end: newLine + count - 1 })
      }
      newLine += count
    } else if (change.removed) {
      // Lines were removed from old content
      // Format the surrounding context (current line in new content)
      if (totalNewLines > 0) {
        const target = Math.min(newLine, totalNewLines)
        ranges.push({ start: target, end: target })
      }
      oldLine += count
    } else {
      // Unchanged lines
      oldLine += count
      newLine += count
    }
  }

  return mergeAdjacentRanges(ranges)
}

/**
 * Merge ranges that are adjacent or overlapping
 * This reduces the number of --lines flags needed
 */
function mergeAdjacentRanges(ranges: LineRange[]): LineRange[] {
  if (ranges.length === 0) return ranges

  // Sort by start line
  const sorted = ranges.toSorted((a, b) => a.start - b.start)
  const merged: LineRange[] = [sorted[0]]

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]
    const last = merged[merged.length - 1]

    // If current range overlaps or is adjacent to last range (allowing 1 line gap), merge them
    // This prevents fragmentation when small changes are close together
    if (current.start <= last.end + 2) {
      last.end = Math.max(last.end, current.end)
    } else {
      merged.push(current)
    }
  }

  return merged
}
