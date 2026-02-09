import { TextAttributes, RGBA } from "@opentui/core"
import { For, Show, createResource, type JSX } from "solid-js"
import { useTheme, tint } from "@tui/context/theme"
import { Logo as LogoConfig } from "@/cli/logo"
import { useSDK } from "@tui/context/sdk"

// Shadow markers (rendered chars in parens):
// _ = full shadow cell (space with bg=shadow)
// ^ = letter top, shadow bottom (▀ with fg=letter, bg=shadow)
// ~ = shadow top only (▀ with fg=shadow)
const SHADOW_MARKER = new RegExp(`[${LogoConfig.marks}]`)

// Strip ANSI escape codes from text (TUI uses its own color system)
const ANSI_REGEX = /\x1b\[[0-9;]*m/g
function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, "")
}

export function Logo() {
  const { theme } = useTheme()
  const sdk = useSDK()

  const [customLogo] = createResource(async () => {
    const result = await sdk.client.config.logo({}).catch(() => null)
    return result?.data
  })

  const renderLine = (line: string, fg: RGBA, bold: boolean): JSX.Element[] => {
    const shadow = tint(theme.background, fg, 0.25)
    const attrs = bold ? TextAttributes.BOLD : undefined
    const elements: JSX.Element[] = []
    let i = 0

    while (i < line.length) {
      const rest = line.slice(i)
      const markerIndex = rest.search(SHADOW_MARKER)

      if (markerIndex === -1) {
        elements.push(
          <text fg={fg} attributes={attrs} selectable={false}>
            {rest}
          </text>,
        )
        break
      }

      if (markerIndex > 0) {
        elements.push(
          <text fg={fg} attributes={attrs} selectable={false}>
            {rest.slice(0, markerIndex)}
          </text>,
        )
      }

      const marker = rest[markerIndex]
      switch (marker) {
        case "_":
          elements.push(
            <text fg={fg} bg={shadow} attributes={attrs} selectable={false}>
              {" "}
            </text>,
          )
          break
        case "^":
          elements.push(
            <text fg={fg} bg={shadow} attributes={attrs} selectable={false}>
              ▀
            </text>,
          )
          break
        case "~":
          elements.push(
            <text fg={shadow} attributes={attrs} selectable={false}>
              ▀
            </text>,
          )
          break
      }

      i += markerIndex + 1
    }

    return elements
  }

  return (
    <Show when={!customLogo()?.disabled} fallback={null}>
      <Show
        when={customLogo()?.content}
        fallback={
          <box>
            <For each={LogoConfig.glyphs.left}>
              {(line, index) => (
                <box flexDirection="row" gap={1}>
                  <box flexDirection="row">{renderLine(line, theme.textMuted, false)}</box>
                  <box flexDirection="row">{renderLine(LogoConfig.glyphs.right[index()], theme.text, true)}</box>
                </box>
              )}
            </For>
          </box>
        }
      >
        <box>
          <For each={stripAnsi(customLogo()!.content!).split("\n")}>
            {(line) => (
              <box flexDirection="row">
                <text fg={theme.text} selectable={false}>
                  {line}
                </text>
              </box>
            )}
          </For>
        </box>
      </Show>
    </Show>
  )
}
