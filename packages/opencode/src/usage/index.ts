import z from "zod"
import { Auth } from "../auth"
import { Bus } from "../bus"
import { BusEvent } from "../bus/bus-event"
import { Storage } from "../storage/storage"
import { Log } from "../util/log"
import { iife } from "../util/iife"
import { getUsageProviderInfo, isUsageProvider, listUsageProviders, type UsageProviderInfo } from "./registry"

const log = Log.create({ service: "usage" })

export const planTypeSchema = z.enum([
  "guest",
  "free",
  "go",
  "plus",
  "pro",
  "free_workspace",
  "team",
  "business",
  "education",
  "quorum",
  "k12",
  "enterprise",
  "edu",
])
export type PlanType = z.infer<typeof planTypeSchema>

export const rateLimitWindowSchema = z.object({
  usedPercent: z.number(),
  windowMinutes: z.number().nullable(),
  resetsAt: z.number().nullable(),
})
export type RateLimitWindow = z.infer<typeof rateLimitWindowSchema>

export const creditsSnapshotSchema = z.object({
  hasCredits: z.boolean(),
  unlimited: z.boolean(),
  balance: z.string().nullable(),
})
export type CreditsSnapshot = z.infer<typeof creditsSnapshotSchema>

export const snapshotSchema = z.object({
  primary: rateLimitWindowSchema.nullable(),
  secondary: rateLimitWindowSchema.nullable(),
  tertiary: rateLimitWindowSchema.nullable(),
  credits: creditsSnapshotSchema.nullable(),
  planType: planTypeSchema.nullable(),
  updatedAt: z.number(),
})
export type Snapshot = z.infer<typeof snapshotSchema>

export const UsageEvent = {
  Updated: BusEvent.define(
    "usage.updated",
    z.object({
      provider: z.string(),
      snapshot: snapshotSchema,
    }),
  ),
}

const chatgptUsageEndpoint = "https://chatgpt.com/backend-api/wham/usage"
const copilotUsageEndpoint = "https://api.github.com/copilot_internal/user"
const claudeUsageEndpoint = "https://api.anthropic.com/api/oauth/usage"
const claudeTokenEndpoint = "https://console.anthropic.com/v1/oauth/token"
const CLAUDE_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"

export async function getUsage(provider: string): Promise<Snapshot | null> {
  return Storage.read<Snapshot>(storageKey(provider)).catch(() => null)
}

export async function updateUsage(provider: string, update: Partial<Snapshot>): Promise<Snapshot> {
  const existing = await getUsage(provider)
  const primary = update.primary !== undefined ? update.primary : (existing?.primary ?? null)
  const secondary = update.secondary !== undefined ? update.secondary : (existing?.secondary ?? null)
  const tertiary = update.tertiary !== undefined ? update.tertiary : (existing?.tertiary ?? null)
  const credits = update.credits !== undefined ? update.credits : (existing?.credits ?? null)
  const planType = update.planType !== undefined ? update.planType : (existing?.planType ?? null)
  const snapshot: Snapshot = {
    primary,
    secondary,
    tertiary,
    credits,
    planType,
    updatedAt: Date.now(),
  }

  await Storage.write(storageKey(provider), snapshot).catch((error) => {
    log.debug("usage write failed", { provider, error })
  })

  await Bus.publish(UsageEvent.Updated, { provider, snapshot }).catch((error) => {
    log.debug("usage publish failed", { provider, error })
  })

  return snapshot
}

export async function clearUsage(provider: string): Promise<void> {
  await Storage.remove(storageKey(provider))
}

export function resolveProvider(input: string): string | null {
  const normalized = input.trim().toLowerCase()
  if (isUsageProvider(normalized)) return normalized
  return null
}

export function getProviderInfo(provider: string): UsageProviderInfo | null {
  return getUsageProviderInfo(provider)
}

export async function getAuthenticatedProviders(auth?: Record<string, Auth.Info>): Promise<string[]> {
  const entries = auth ?? (await Auth.all())
  const providers = listUsageProviders()
  const result: string[] = []

  for (const provider of providers) {
    const matched = provider.authKeys.some((key) => {
      const providerAuth = entries[key]
      if (!providerAuth) return false
      if (provider.requiresOAuth && providerAuth.type !== "oauth") return false
      return true
    })
    if (matched) result.push(provider.id)
  }

  return result
}

export async function getProviderAuth(
  provider: string,
  auth?: Record<string, Auth.Info>,
): Promise<{ key: string; auth: Auth.Info } | null> {
  const info = getUsageProviderInfo(provider)
  if (!info) return null
  const entries = auth ?? (await Auth.all())

  for (const key of info.authKeys) {
    const providerAuth = entries[key]
    if (!providerAuth) continue
    if (info.requiresOAuth && providerAuth.type !== "oauth") continue
    return { key, auth: providerAuth }
  }

  return null
}

type UsageFetchResult = {
  snapshot: Snapshot | null
  error?: string
}

function usageFetchError(provider: string, detail: string | null): string {
  if (!detail) return `${provider} usage request failed`
  return `${provider} usage request failed (${detail})`
}

export async function fetchChatgptUsage(accessToken: string, accountId?: string): Promise<UsageFetchResult> {
  const headers = iife(() => {
    const base = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    }
    if (!accountId) return base
    return { ...base, "ChatGPT-Account-Id": accountId }
  })

  const response = await fetch(chatgptUsageEndpoint, {
    headers,
    signal: AbortSignal.timeout(10_000),
  }).catch((error) => {
    log.warn("usage fetch failed", {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  })

  if (!response) {
    return {
      snapshot: null,
      error: usageFetchError("OpenAI ChatGPT", "network"),
    }
  }

  if (!response.ok) {
    log.warn("usage fetch failed", { status: response.status })
    return {
      snapshot: null,
      error: usageFetchError("OpenAI ChatGPT", String(response.status)),
    }
  }

  const body = await response.json().catch(() => null)
  if (!body) {
    return {
      snapshot: null,
      error: usageFetchError("OpenAI ChatGPT", "empty response"),
    }
  }

  const parsed = chatgptUsageResponseSchema.safeParse(body)
  if (!parsed.success) {
    log.warn("usage fetch parse failed", { issues: parsed.error.issues.length })
    return {
      snapshot: null,
      error: usageFetchError("OpenAI ChatGPT", "parse failed"),
    }
  }

  const rateLimit = parsed.data.rate_limit
  const primary = toChatgptRateLimitWindow(rateLimit.primary_window)
  const secondary = toChatgptRateLimitWindow(rateLimit.secondary_window)
  const credits = toChatgptCreditsSnapshot(parsed.data.credits)
  const planType = toChatgptPlanType(parsed.data.plan_type)

  return {
    snapshot: {
      primary,
      secondary,
      tertiary: null,
      credits,
      planType,
      updatedAt: Date.now(),
    },
  }
}

type ClaudeUsageWindow = {
  utilization: number
  resets_at: string | null
}

type ClaudeUsageResponse = {
  five_hour?: ClaudeUsageWindow | null
  seven_day?: ClaudeUsageWindow | null
  extra_usage?: {
    is_enabled?: boolean | null
    monthly_limit?: number | null
    used_credits?: number | null
    utilization?: number | null
  } | null
}

type ClaudeAuth = Extract<Auth.Info, { type: "oauth" }>

type ClaudeTokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
}

type ClaudeErrorResponse = {
  error?: {
    message?: string
    details?: {
      error_code?: string
    }
  }
}

const claudeUsageWindowSchema = z.object({
  utilization: z.number(),
  resets_at: z.string().nullable(),
})

const claudeUsageResponseSchema = z.object({
  five_hour: claudeUsageWindowSchema.nullish(),
  seven_day: claudeUsageWindowSchema.nullish(),
  extra_usage: z
    .object({
      is_enabled: z.boolean().nullish(),
      monthly_limit: z.number().nullish(),
      used_credits: z.number().nullish(),
      utilization: z.number().nullish(),
    })
    .nullish(),
}) satisfies z.ZodType<ClaudeUsageResponse>

export async function fetchClaudeUsage(authKey: string, auth: ClaudeAuth): Promise<UsageFetchResult> {
  return fetchClaudeUsageInternal(authKey, auth, false)
}

async function fetchClaudeUsageInternal(
  authKey: string,
  auth: ClaudeAuth,
  refreshed: boolean,
): Promise<UsageFetchResult> {
  const currentAuth = await iife(async () => {
    if (auth.expires > 0 && Date.now() >= auth.expires) {
      return refreshClaudeAuth(authKey, auth)
    }
    return auth
  })

  if (!currentAuth) {
    return {
      snapshot: null,
      error: usageFetchError("Claude", "token expired"),
    }
  }

  const response = await requestClaudeUsage(currentAuth.access)
  if (!response) {
    return {
      snapshot: null,
      error: usageFetchError("Claude", "network"),
    }
  }

  if (response.status === 401) {
    const body = (await response.json().catch(() => null)) as ClaudeErrorResponse | null
    const expired = isClaudeTokenExpired(body)
    if (expired && !refreshed) {
      const nextAuth = await refreshClaudeAuth(authKey, currentAuth)
      if (!nextAuth) {
        return {
          snapshot: null,
          error: usageFetchError("Claude", String(response.status)),
        }
      }
      return fetchClaudeUsageInternal(authKey, nextAuth, true)
    }

    log.warn("claude usage fetch failed", { status: response.status })
    return {
      snapshot: null,
      error: usageFetchError("Claude", String(response.status)),
    }
  }

  if (!response.ok) {
    log.warn("claude usage fetch failed", { status: response.status })
    return {
      snapshot: null,
      error: usageFetchError("Claude", String(response.status)),
    }
  }

  const body = await response.json().catch(() => null)
  if (!body) {
    return {
      snapshot: null,
      error: usageFetchError("Claude", "empty response"),
    }
  }

  const parsed = claudeUsageResponseSchema.safeParse(body)
  if (!parsed.success) {
    log.warn("claude usage parse failed", { issues: parsed.error.issues.length })
    return {
      snapshot: null,
      error: usageFetchError("Claude", "parse failed"),
    }
  }

  const data = parsed.data
  const primary = toClaudeWindow(data.five_hour, 5 * 60)
  const secondary = toClaudeWindow(data.seven_day, 7 * 24 * 60)
  const credits = toClaudeCredits(data.extra_usage)

  return {
    snapshot: {
      primary,
      secondary,
      tertiary: null,
      credits,
      planType: null,
      updatedAt: Date.now(),
    },
  }
}

async function requestClaudeUsage(accessToken: string): Promise<Response | null> {
  return fetch(claudeUsageEndpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "anthropic-beta": "oauth-2025-04-20",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  }).catch((error) => {
    log.warn("claude usage fetch failed", {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  })
}

function isClaudeTokenExpired(body: ClaudeErrorResponse | null): boolean {
  if (!body || typeof body !== "object") return false
  const error = body.error
  if (!error) return false
  const code = error.details?.error_code
  if (code === "token_expired") return true
  if (error.message?.toLowerCase().includes("expired")) return true
  return false
}

async function refreshClaudeAuth(authKey: string, auth: ClaudeAuth): Promise<ClaudeAuth | null> {
  const response = await fetch(claudeTokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: auth.refresh,
      client_id: CLAUDE_CLIENT_ID,
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch((error) => {
    log.warn("claude token refresh failed", {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  })

  if (!response) return null
  if (!response.ok) {
    log.warn("claude token refresh failed", { status: response.status })
    return null
  }

  const body = (await response.json().catch(() => null)) as ClaudeTokenResponse | null
  if (!body) return null

  const access = typeof body.access_token === "string" ? body.access_token : null
  if (!access) return null

  const refresh = typeof body.refresh_token === "string" ? body.refresh_token : auth.refresh
  const expires = typeof body.expires_in === "number" ? Date.now() + body.expires_in * 1000 : auth.expires
  const next: Auth.Info = {
    type: "oauth",
    refresh,
    access,
    expires,
    ...(auth.accountId ? { accountId: auth.accountId } : {}),
    ...(auth.enterpriseUrl ? { enterpriseUrl: auth.enterpriseUrl } : {}),
    ...(auth.usage ? { usage: auth.usage } : {}),
  }

  await Auth.set(authKey, next)
  return next
}

function storageKey(provider: string): string[] {
  return ["usage", provider]
}

function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0
  if (value < 0) return 0
  if (value > 100) return 100
  return value
}

type ChatgptUsageResponseWindow = {
  used_percent: number
  limit_window_seconds: number
  reset_after_seconds: number
  reset_at: number
}

type ChatgptUsageResponse = {
  plan_type: string | null
  rate_limit: {
    allowed: boolean
    limit_reached: boolean
    primary_window: ChatgptUsageResponseWindow | null
    secondary_window: ChatgptUsageResponseWindow | null
  }
  credits: {
    has_credits: boolean
    unlimited: boolean
    balance: string | null
  } | null
}

const chatgptUsageResponseWindowSchema = z.object({
  used_percent: z.number(),
  limit_window_seconds: z.number(),
  reset_after_seconds: z.number(),
  reset_at: z.number(),
})

const chatgptUsageResponseSchema = z.object({
  plan_type: z.string().nullable(),
  rate_limit: z.object({
    allowed: z.boolean(),
    limit_reached: z.boolean(),
    primary_window: chatgptUsageResponseWindowSchema.nullable(),
    secondary_window: chatgptUsageResponseWindowSchema.nullable(),
  }),
  credits: z
    .object({
      has_credits: z.boolean(),
      unlimited: z.boolean(),
      balance: z.string().nullable(),
    })
    .nullable(),
}) satisfies z.ZodType<ChatgptUsageResponse>

function toChatgptRateLimitWindow(window: ChatgptUsageResponseWindow | null): RateLimitWindow | null {
  if (!window) return null
  return {
    usedPercent: window.used_percent,
    windowMinutes: Math.round(window.limit_window_seconds / 60),
    resetsAt: window.reset_at,
  }
}

function toChatgptCreditsSnapshot(credits: ChatgptUsageResponse["credits"]): CreditsSnapshot | null {
  if (!credits) return null
  return {
    hasCredits: credits.has_credits,
    unlimited: credits.unlimited,
    balance: credits.balance,
  }
}

function toChatgptPlanType(value: ChatgptUsageResponse["plan_type"]): PlanType | null {
  if (!value) return null
  const parsed = planTypeSchema.safeParse(value)
  if (!parsed.success) return null
  return parsed.data
}

function toClaudeWindow(
  window: ClaudeUsageWindow | null | undefined,
  windowMinutes: number | null,
): RateLimitWindow | null {
  if (!window) return null

  const resetsAt = iife(() => {
    if (!window.resets_at) return null
    const ms = new Date(window.resets_at).getTime()
    if (Number.isNaN(ms)) return null
    return Math.floor(ms / 1000)
  })

  return {
    usedPercent: window.utilization,
    windowMinutes,
    resetsAt,
  }
}

function toClaudeCredits(extra: ClaudeUsageResponse["extra_usage"]): CreditsSnapshot | null {
  if (!extra) return null
  if (extra.is_enabled === false) return null

  const limit = typeof extra.monthly_limit === "number" ? extra.monthly_limit : null
  const used = typeof extra.used_credits === "number" ? extra.used_credits : null
  if (limit !== null && used !== null) {
    const remaining = Math.max(0, Math.round((limit - used) * 100) / 100)
    return {
      hasCredits: remaining > 0,
      unlimited: false,
      balance: String(remaining),
    }
  }

  const utilization = typeof extra.utilization === "number" ? extra.utilization : null
  if (utilization !== null) {
    return {
      hasCredits: utilization < 100,
      unlimited: false,
      balance: null,
    }
  }

  return null
}

type CopilotTokenMetadata = {
  tid?: string
  exp?: number
  sku?: string
  proxyEndpoint?: string
  quotaLimit?: number
  resetDate?: number
}

const COPILOT_SKU_PLAN_MAP: Record<string, PlanType> = {
  free_limited_copilot: "free",
  copilot_for_individual: "pro",
  copilot_individual: "pro",
  copilot_business: "business",
  copilot_enterprise: "enterprise",
  copilot_for_business: "business",
}

const copilotUsageQuotaSchema = z.object({
  entitlement: z.number(),
  remaining: z.number(),
  percent_remaining: z.number(),
  quota_id: z.string(),
})

const copilotUsageResponseSchema = z.object({
  quota_snapshots: z.object({
    premium_interactions: copilotUsageQuotaSchema.nullish(),
    chat: copilotUsageQuotaSchema.nullish(),
  }),
  copilot_plan: z.string().optional(),
  assigned_date: z.string().optional(),
  quota_reset_date: z.string().optional(),
})

export function parseCopilotAccessToken(accessToken: string): CopilotTokenMetadata {
  const result: CopilotTokenMetadata = {}
  const parts = accessToken.split(";")

  for (const part of parts) {
    const eqIndex = part.indexOf("=")
    if (eqIndex === -1) continue
    const key = part.slice(0, eqIndex)
    const value = part.slice(eqIndex + 1)

    switch (key) {
      case "tid":
        result.tid = value
        break
      case "exp":
        result.exp = Number.parseInt(value, 10)
        break
      case "sku":
        result.sku = value
        break
      case "proxy-ep":
        result.proxyEndpoint = value
        break
      case "cq":
        result.quotaLimit = Number.parseInt(value, 10)
        break
      case "rd": {
        const colonIdx = value.indexOf(":")
        if (colonIdx > 0) {
          result.resetDate = Number.parseInt(value.slice(0, colonIdx), 10)
        }
        break
      }
    }
  }

  return result
}

export function copilotSkuToPlan(sku: string | undefined): PlanType | null {
  if (!sku) return null
  return COPILOT_SKU_PLAN_MAP[sku] ?? copilotSkuToPlanType(sku)
}

function resolveCopilotUsageUrl(enterpriseUrl: string | undefined): string {
  if (!enterpriseUrl) return copilotUsageEndpoint
  const base = enterpriseUrl.startsWith("http") ? enterpriseUrl : `https://${enterpriseUrl}`
  const trimmed = base.replace(/\/$/, "")
  if (trimmed.endsWith("/api/v3")) return `${trimmed}/copilot_internal/user`
  return `${trimmed}/api/v3/copilot_internal/user`
}

function parseCopilotResetDate(value: string | undefined): number | null {
  if (!value) return null
  const ms = new Date(value).getTime()
  if (Number.isNaN(ms)) return null
  return Math.floor(ms / 1000)
}

function copilotSnapshotFromToken(tokenMetadata: CopilotTokenMetadata): Snapshot | null {
  const planType = copilotSkuToPlan(tokenMetadata.sku)
  const credits = tokenMetadata.quotaLimit
    ? {
        hasCredits: true,
        unlimited: false,
        balance: String(tokenMetadata.quotaLimit),
      }
    : null

  if (!credits && !planType) return null

  return {
    primary: null,
    secondary: null,
    tertiary: null,
    credits,
    planType,
    updatedAt: Date.now(),
  }
}

type CopilotAuthInfo = {
  access: string
  refresh: string
  usage: string
  enterpriseUrl?: string
}

export async function fetchCopilotUsage(auth: CopilotAuthInfo): Promise<UsageFetchResult> {
  const tokenMetadata = parseCopilotAccessToken(auth.access)
  const fallback = copilotSnapshotFromToken(tokenMetadata)

  const response = await fetch(resolveCopilotUsageUrl(auth.enterpriseUrl), {
    method: "GET",
    headers: {
      Authorization: `token ${auth.usage}`,
      Accept: "application/json",
      "Editor-Version": "vscode/1.96.2",
      "Editor-Plugin-Version": "copilot-chat/0.26.7",
      "User-Agent": "GitHubCopilotChat/0.26.7",
      "X-Github-Api-Version": "2025-04-01",
    },
    signal: AbortSignal.timeout(10_000),
  }).catch((error) => {
    log.warn("copilot usage fetch failed", {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  })

  if (!response) {
    return {
      snapshot: fallback,
      error: usageFetchError("Copilot", "network"),
    }
  }

  if (!response.ok) {
    log.warn("copilot usage fetch failed", { status: response.status })
    return {
      snapshot: fallback,
      error: usageFetchError("Copilot", String(response.status)),
    }
  }

  const body = await response.json().catch(() => null)
  if (!body) {
    return {
      snapshot: fallback,
      error: usageFetchError("Copilot", "empty response"),
    }
  }

  const parsed = copilotUsageResponseSchema.safeParse(body)
  if (!parsed.success) {
    log.warn("copilot usage parse failed", { issues: parsed.error.issues.length })
    return {
      snapshot: fallback,
      error: usageFetchError("Copilot", "parse failed"),
    }
  }

  const data = parsed.data
  const premium = data.quota_snapshots.premium_interactions ?? null
  const chat = data.quota_snapshots.chat ?? null
  const resetAt = parseCopilotResetDate(data.quota_reset_date) ?? tokenMetadata.resetDate ?? null
  const planType = copilotSkuToPlan(data.copilot_plan) ?? copilotSkuToPlan(tokenMetadata.sku)

  const primary: RateLimitWindow | null = iife(() => {
    if (!premium) return null
    return {
      usedPercent: clampPercent(100 - premium.percent_remaining),
      windowMinutes: null,
      resetsAt: resetAt,
    }
  })

  const secondary: RateLimitWindow | null = iife(() => {
    if (!chat) return null
    return {
      usedPercent: clampPercent(100 - chat.percent_remaining),
      windowMinutes: null,
      resetsAt: resetAt,
    }
  })

  const quotaRemaining = iife(() => {
    if (premium?.remaining !== undefined) return premium.remaining
    if (chat?.remaining !== undefined) return chat.remaining
    return tokenMetadata.quotaLimit ?? null
  })

  const credits =
    quotaRemaining !== null
      ? {
          hasCredits: quotaRemaining > 0,
          unlimited: false,
          balance: String(quotaRemaining),
        }
      : null

  return {
    snapshot: {
      primary,
      secondary,
      tertiary: null,
      credits,
      planType,
      updatedAt: Date.now(),
    },
  }
}

function copilotSkuToPlanType(sku: string): PlanType | null {
  const normalized = sku.toLowerCase()
  if (normalized.includes("free")) return "free"
  if (normalized.includes("individual") || normalized.includes("pro")) return "pro"
  if (normalized.includes("business")) return "business"
  if (normalized.includes("enterprise")) return "enterprise"
  return null
}

export const Usage = {
  planTypeSchema,
  rateLimitWindowSchema,
  creditsSnapshotSchema,
  snapshotSchema,
  getUsage,
  updateUsage,
  clearUsage,
  resolveProvider,
  getProviderInfo,
  getAuthenticatedProviders,
  getProviderAuth,
  fetchChatgptUsage,
  fetchClaudeUsage,
  fetchCopilotUsage,
  parseCopilotAccessToken,
  copilotSkuToPlan,
} as const
