type Credits = {
  hasCredits: boolean
  unlimited: boolean
  balance: string | null
}

type WindowType = "primary" | "secondary" | "tertiary"

export function formatUsageWindowLabel(provider: string, windowType: WindowType, windowMinutes: number | null): string {
  const base = windowBaseLabel(provider, windowType)
  return formatWindowLabel(base, windowMinutes)
}

export function formatPlanType(planType: string | null): string | null {
  if (!planType) return null
  const normalized = planType.replace(/_/g, " ")
  const parts: string[] = []
  for (const part of normalized.split(" ")) {
    if (!part) continue
    parts.push(part.slice(0, 1).toUpperCase() + part.slice(1))
  }
  return parts.join(" ")
}

export function formatCreditsLabel(provider: string, credits: Credits): string {
  if (provider.startsWith("github-copilot")) {
    if (credits.unlimited) return "Quota: Unlimited"
    if (!credits.hasCredits) return "Quota: Exhausted"
    if (credits.balance) return `Quota: ${credits.balance}`
    return "Quota: Available"
  }
  if (provider === "anthropic") return `Extra Usage: ${formatCredits(credits)}`
  return `Credits: ${formatCredits(credits)}`
}

type UsageTheme = {
  error: unknown
  warning: unknown
  success: unknown
}

export function formatUsageResetShort(resetAt: number | null): string {
  if (!resetAt) return ""
  const now = Math.floor(Date.now() / 1000)
  const diff = resetAt - now
  if (diff <= 0) return "refreshing"
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.round(diff / 60)}m`
  if (diff < 86400) return `${Math.round(diff / 3600)}h`
  return `${Math.round(diff / 86400)}d`
}

export function formatUsageResetLong(resetAt: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = resetAt - now
  if (diff <= 0) return "now"
  if (diff < 60) return `in ${diff} seconds`
  if (diff < 3600) return `in ${Math.round(diff / 60)} minutes`
  if (diff < 86400) return `in ${Math.round(diff / 3600)} hours`
  return `in ${Math.round(diff / 86400)} days`
}

export function usageBarString(percent: number, width = 10): string {
  const clamped = Math.max(0, Math.min(100, percent))
  const filled = Math.round((clamped / 100) * width)
  return "█".repeat(filled) + "░".repeat(width - filled)
}

export function usageBarColor<T extends UsageTheme>(
  percent: number,
  theme: T,
): T["error"] | T["warning"] | T["success"] {
  if (percent >= 90) return theme.error
  if (percent >= 70) return theme.warning
  return theme.success
}

function windowBaseLabel(provider: string, windowType: WindowType): string {
  if (provider.startsWith("github-copilot")) {
    if (windowType === "primary") return "Usage"
    if (windowType === "secondary") return "Completions"
  }
  if (provider === "anthropic") {
    if (windowType === "primary") return "5h"
    if (windowType === "secondary") return "7d"
  }
  return windowType === "primary" ? "Hourly" : "Weekly"
}

function formatWindowLabel(base: string, windowMinutes: number | null): string {
  if (!windowMinutes) return base
  if (base !== "Hourly" && base !== "Weekly") return base
  const minutesPerHour = 60
  const minutesPerDay = 24 * minutesPerHour
  const minutesPerWeek = 7 * minutesPerDay
  if (windowMinutes >= minutesPerWeek) return "Weekly"

  if (windowMinutes % minutesPerHour === 0) {
    const hours = Math.max(1, Math.round(windowMinutes / minutesPerHour))
    if (hours === 1) return "Hourly"
    return `${hours}h`
  }

  if (windowMinutes < minutesPerHour) return `${windowMinutes}m`
  const hours = Math.max(1, Math.round(windowMinutes / minutesPerHour))
  return `${hours}h`
}

function formatCredits(credits: Credits): string {
  if (!credits.hasCredits) return "None"
  if (credits.unlimited) return "Unlimited"
  if (credits.balance) {
    const numeric = Number(credits.balance)
    if (!Number.isNaN(numeric)) return String(Math.floor(numeric))
    return credits.balance
  }
  return "Available"
}
