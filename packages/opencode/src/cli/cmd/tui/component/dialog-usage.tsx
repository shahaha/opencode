import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog } from "@tui/ui/dialog"
import {
  formatCreditsLabel,
  formatPlanType,
  formatUsageResetLong,
  formatUsageWindowLabel,
  usageBarColor,
  usageBarString,
} from "./usage-format"
import type { UsageEntry, UsageError, UsageWindow } from "./usage-data"
import { For, Show, createSignal } from "solid-js"

type Theme = ReturnType<typeof useTheme>["theme"]

export function DialogUsage(props: { entries: UsageEntry[]; errors?: UsageError[] }) {
  const { theme } = useTheme()
  const dialog = useDialog()
  const [hover, setHover] = createSignal(false)

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1} flexDirection="column">
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Usage
        </text>
        <box
          paddingLeft={1}
          paddingRight={1}
          backgroundColor={hover() ? theme.primary : undefined}
          onMouseOver={() => setHover(true)}
          onMouseOut={() => setHover(false)}
          onMouseUp={() => dialog.clear()}
        >
          <text fg={hover() ? theme.selectedListItemText : theme.textMuted}>esc</text>
        </box>
      </box>
      <Show when={props.entries.length > 0} fallback={<text fg={theme.text}>No usage data available.</text>}>
        <For each={props.entries}>
          {(entry, index) => {
            const mergeReset = entry.provider.startsWith("github-copilot")
            const resetAt =
              entry.snapshot.primary?.resetsAt ??
              entry.snapshot.secondary?.resetsAt ??
              entry.snapshot.tertiary?.resetsAt ??
              null
            const planType = formatPlanType(entry.snapshot.planType)
            const entryErrors = (props.errors ?? [])
              .filter((error) => error.provider === entry.provider)
              .map((error) => error.message)
            return (
              <box flexDirection="column" marginTop={index() === 0 ? 0 : 1} gap={1}>
                <box flexDirection="column">
                  <text fg={theme.text} attributes={TextAttributes.BOLD}>
                    {entry.displayName} Usage
                    <Show when={planType}>
                      <span style={{ fg: theme.textMuted }}>{` (${planType})`}</span>
                    </Show>
                  </text>
                  <text fg={theme.textMuted}>{"─".repeat(Math.max(24, entry.displayName.length + 20))}</text>
                </box>
                <Show when={mergeReset && resetAt !== null}>
                  <text fg={theme.textMuted}>Resets {formatUsageResetLong(resetAt!)}</text>
                </Show>
                <Show when={entry.snapshot.primary}>
                  {(window) => (
                    <box flexDirection="column">
                      {renderWindow(entry.provider, "primary", window(), theme, !mergeReset)}
                    </box>
                  )}
                </Show>
                <Show when={entry.snapshot.secondary}>
                  {(window) => (
                    <box flexDirection="column">
                      {renderWindow(entry.provider, "secondary", window(), theme, !mergeReset)}
                    </box>
                  )}
                </Show>
                <Show when={entry.snapshot.tertiary}>
                  {(window) => (
                    <box flexDirection="column">
                      {renderWindow(entry.provider, "tertiary", window(), theme, !mergeReset)}
                    </box>
                  )}
                </Show>
                <Show when={entry.snapshot.credits}>
                  {(credits) => <text fg={theme.text}>{formatCreditsLabel(entry.provider, credits())}</text>}
                </Show>
                <Show when={entryErrors.length > 0}>
                  <text fg={theme.error} attributes={TextAttributes.DIM}>
                    {entryErrors.join(" • ")}
                  </text>
                </Show>
              </box>
            )
          }}
        </For>
      </Show>
    </box>
  )
}

function renderWindow(
  provider: string,
  windowType: "primary" | "secondary" | "tertiary",
  window: UsageWindow,
  theme: Theme,
  showReset = true,
) {
  const usedPercent = clampPercent(window.usedPercent)
  const windowLabel = formatUsageWindowLabel(provider, windowType, window.windowMinutes)

  return (
    <box flexDirection="column">
      <text fg={theme.text}>
        {windowLabel} Limit: [
        <span style={{ fg: usageBarColor(usedPercent, theme) }}>{usageBarString(usedPercent)}</span>]{" "}
        {usedPercent.toFixed(0)}% used
      </text>
      <Show when={showReset && window.resetsAt !== null}>
        <text fg={theme.textMuted}>Resets {formatUsageResetLong(window.resetsAt!)}</text>
      </Show>
    </box>
  )
}

function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0
  if (value < 0) return 0
  if (value > 100) return 100
  return value
}
