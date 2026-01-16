import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { Auth } from "../auth"
import { Usage } from "../usage"
import type { Snapshot as UsageSnapshot } from "../usage"

const USAGE_CACHE_TTL_MS = 5 * 60 * 1000

const usageResponseSchema = z.object({
  entries: z.array(
    z.object({
      provider: z.string(),
      displayName: z.string(),
      snapshot: Usage.snapshotSchema,
    }),
  ),
  error: z.string().optional(),
  errors: z
    .array(
      z.object({
        provider: z.string(),
        message: z.string(),
      }),
    )
    .optional(),
})

const refreshSchema = z.preprocess((value) => {
  if (typeof value === "boolean") return value
  if (typeof value !== "string") return value
  const normalized = value.trim().toLowerCase()
  if (normalized === "true" || normalized === "1") return true
  if (normalized === "false" || normalized === "0") return false
  return undefined
}, z.boolean())

export function UsageRoutes() {
  return new Hono().get(
    "/",
    describeRoute({
      summary: "Get usage",
      description: "Fetch usage limits for authenticated providers.",
      operationId: "usage.get",
      responses: {
        200: {
          description: "Usage response",
          content: {
            "application/json": {
              schema: resolver(usageResponseSchema),
            },
          },
        },
      },
    }),
    validator(
      "query",
      z.object({
        provider: z.string().optional(),
        refresh: refreshSchema.optional(),
      }),
    ),
    async (c) => {
      const query = c.req.valid("query")
      const providerInput = query.provider?.trim()
      const refresh = query.refresh ?? false
      const resolved = providerInput ? Usage.resolveProvider(providerInput) : null
      if (providerInput && !resolved) {
        return c.json({
          entries: [],
          error: `Unknown provider: "${providerInput}"`,
        })
      }

      const auth = await Auth.all()
      const providers = resolved ? [resolved] : await Usage.getAuthenticatedProviders(auth)
      if (providers.length === 0) {
        return c.json({
          entries: [],
          error: "No OAuth providers with usage tracking are authenticated. Run: opencode auth login",
        })
      }

      const providerTasks = providers.map(async (provider) => {
        const errors: string[] = []
        const providerErrors: Array<{ provider: string; message: string }> = []
        const pushError = (message: string) => {
          errors.push(message)
          providerErrors.push({ provider, message })
        }

        const info = Usage.getProviderInfo(provider)
        if (!info) {
          pushError(`Provider "${provider}" does not support usage tracking.`)
          return { provider, entry: null, errors, providerErrors }
        }

        const authEntry = await Usage.getProviderAuth(provider, auth)
        if (!authEntry) {
          pushError(`Not authenticated with ${info.displayName}. Run: opencode auth add ${info.authKeys[0]}`)
          return { provider, entry: null, errors, providerErrors }
        }
        const oauthAuth = authEntry.auth.type === "oauth" ? authEntry.auth : null
        if (info.requiresOAuth && !oauthAuth) {
          pushError(`Not authenticated with ${info.displayName} OAuth. Run: opencode auth add ${info.authKeys[0]}`)
          return { provider, entry: null, errors, providerErrors }
        }

        const oauth = oauthAuth
        if (!oauth) {
          pushError(`Missing OAuth access token for ${info.displayName}.`)
          return { provider, entry: null, errors, providerErrors }
        }

        const accessToken = oauth.access
        if (!accessToken) {
          pushError(`Missing OAuth access token for ${info.displayName}.`)
          return { provider, entry: null, errors, providerErrors }
        }

        const isCopilot = provider === "github-copilot" || provider === "github-copilot-enterprise"
        if (isCopilot && !oauth.usage) {
          pushError("Copilot usage requires a GitHub OAuth device token. Run: opencode auth login")
          return { provider, entry: null, errors, providerErrors }
        }

        const usageToken = isCopilot ? (oauth.usage ?? null) : accessToken
        if (!usageToken) {
          pushError(`Missing OAuth access token for ${info.displayName}.`)
          return { provider, entry: null, errors, providerErrors }
        }

        const cached = await Usage.getUsage(provider)
        const stale = !cached || Date.now() - cached.updatedAt > USAGE_CACHE_TTL_MS
        const snapshot = await (async () => {
          if (!refresh && !stale) return cached

          const fetched = await (async (): Promise<{ snapshot: UsageSnapshot | null; error?: string }> => {
            if (isCopilot) {
              return Usage.fetchCopilotUsage({
                access: accessToken,
                refresh: oauth.refresh,
                usage: usageToken,
                enterpriseUrl: oauth.enterpriseUrl,
              })
            }
            if (provider === "anthropic") {
              return Usage.fetchClaudeUsage(authEntry.key, oauth)
            }
            return Usage.fetchChatgptUsage(accessToken, oauth.accountId)
          })()

          const fetchedSnapshot = fetched.snapshot
          const detail = fetched.error ?? `Unable to refresh usage data for ${info.displayName}.`

          if (fetched.error) {
            if (cached) {
              pushError(`${detail} Showing cached results.`)
              return cached
            }
            if (fetchedSnapshot) {
              pushError(detail)
              await Usage.updateUsage(provider, fetchedSnapshot)
              return fetchedSnapshot
            }
            pushError(detail)
            return null
          }

          if (!fetchedSnapshot) {
            if (cached) {
              pushError(`${detail} Showing cached results.`)
              return cached
            }
            pushError(detail)
            return null
          }

          return Usage.updateUsage(provider, fetchedSnapshot)
        })()

        if (!snapshot) {
          return { provider, entry: null, errors, providerErrors }
        }

        return {
          provider,
          entry: { provider, displayName: info.displayName, snapshot },
          errors,
          providerErrors,
        }
      })

      const results = await Promise.all(providerTasks)
      const entries = results.flatMap((result) => (result.entry ? [result.entry] : []))
      const errors = results.flatMap((result) => result.errors)
      const providerErrors = results.flatMap((result) => result.providerErrors)

      return c.json({
        entries,
        error: errors.length > 0 ? errors.join("\n") : undefined,
        errors: providerErrors.length > 0 ? providerErrors : undefined,
      })
    },
  )
}
