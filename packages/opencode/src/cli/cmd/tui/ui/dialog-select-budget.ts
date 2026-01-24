import { Locale } from "@/util/locale"

export function budget(width: number, tail: number, lines: number) {
  const pad = 10
  const span = Math.max(width - pad, 0)
  if (lines === 1) return span === 0 ? 1 : 61
  const perLine = Math.max(span - tail, 1)
  return Math.min(Math.max(perLine * lines, 1), 122)
}

type WrapState = {
  lines: string[]
  truncated: boolean
}

export function wrap(text: string, width: number, tail: number, maxLines: number) {
  const limit = budget(width, 0, 1)
  if (maxLines === 1) return Locale.truncate(text, limit)
  const perLine = Math.max(width - 10 - tail, 1)
  const words = text.split(/\s+/).filter(Boolean)
  const state = words.reduce<WrapState>(
    (current, word) => {
      if (current.truncated) return current
      const line = current.lines.at(-1) ?? ""
      const spacer = line.length === 0 ? "" : " "
      const next = `${line}${spacer}${word}`
      if (next.length <= perLine) {
        const lines = current.lines.slice(0, -1).concat(next)
        return { lines, truncated: false }
      }
      if (line.length === 0) {
        const available = maxLines - current.lines.length + 1
        const parts = Array.from({ length: available }, (_, index) =>
          word.slice(index * perLine, (index + 1) * perLine),
        ).filter(Boolean)
        const lines = current.lines.slice(0, -1).concat(parts)
        const truncated = word.length > perLine * available
        return { lines, truncated }
      }
      if (current.lines.length >= maxLines) {
        return { lines: current.lines, truncated: true }
      }
      if (word.length > perLine) {
        const available = maxLines - current.lines.length
        const parts = Array.from({ length: available }, (_, index) =>
          word.slice(index * perLine, (index + 1) * perLine),
        ).filter(Boolean)
        const lines = current.lines.concat(parts)
        const truncated = word.length > perLine * available
        return { lines, truncated }
      }
      const lines = current.lines.concat(word)
      return { lines, truncated: false }
    },
    { lines: [""], truncated: false },
  )
  const joined = state.lines.join("\n")
  if (!state.truncated) return joined
  const ellipsis = perLine <= 3 ? ".".repeat(perLine) : "..."
  const room = Math.max(perLine - ellipsis.length, 0)
  const last = state.lines.at(-1) ?? ""
  const head = last.slice(0, room).trimEnd()
  const lines = state.lines.slice(0, -1).concat(`${head}${ellipsis}`)
  return lines.join("\n")
}
