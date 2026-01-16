import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import { Installation } from "@/installation"
import { Log } from "@/util/log"
import { iife } from "@/util/iife"

const CLIENT_ID = "Ov23li8tweQw6odWQebz"
const COPILOT_USAGE_CLIENT_ID = "Iv1.b507a08c87ecfe98"
const COPILOT_USAGE_SCOPE = "read:user"
const COPILOT_USAGE_TIMEOUT_MS = 30000
// Add a small safety buffer when polling to avoid hitting the server
// slightly too early due to clock skew / timer drift.
const OAUTH_POLLING_SAFETY_MARGIN_MS = 3000 // 3 seconds
const log = Log.create({ service: "copilot-auth" })
function normalizeDomain(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "")
}

function apiBase(domain: string) {
  if (domain === "github.com") return "https://api.github.com"
  return `https://${domain}/api/v3`
}

function getUrls(domain: string) {
  const base = apiBase(domain)
  return {
    DEVICE_CODE_URL: `https://${domain}/login/device/code`,
    ACCESS_TOKEN_URL: `https://${domain}/login/oauth/access_token`,
    COPILOT_TOKEN_URL: `${base}/copilot_internal/v2/token`,
  }
}

type CopilotDeviceCode = {
  deviceCode: string
  userCode: string
  verificationUri: string
  interval: number
  expiresIn: number
}

async function requestCopilotDeviceCode(
  url: string,
  clientId: string,
  scope: string,
): Promise<CopilotDeviceCode | null> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": `opencode/${Installation.VERSION}`,
    },
    body: JSON.stringify({
      client_id: clientId,
      scope,
    }),
  })

  if (!response.ok) return null

  const data = (await response.json()) as {
    verification_uri: string
    user_code: string
    device_code: string
    interval: number
    expires_in?: number
  }

  if (!data.device_code || !data.user_code || !data.verification_uri) return null

  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    interval: data.interval,
    expiresIn: data.expires_in ?? 0,
  }
}

async function pollCopilotDeviceToken(
  url: string,
  device: CopilotDeviceCode,
  clientId: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const deadline = device.expiresIn > 0 ? Date.now() + device.expiresIn * 1000 : null

  const poll = async (intervalMs: number): Promise<string | null> => {
    if (signal?.aborted) return null
    if (deadline && Date.now() >= deadline) return null

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": `opencode/${Installation.VERSION}`,
      },
      body: JSON.stringify({
        client_id: clientId,
        device_code: device.deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    })

    if (!response.ok) return null

    const data = (await response.json()) as {
      access_token?: string
      error?: string
      interval?: number
    }

    if (data.access_token) return data.access_token
    if (data.error === "authorization_pending") {
      await Bun.sleep(intervalMs + OAUTH_POLLING_SAFETY_MARGIN_MS)
      return poll(intervalMs)
    }

    if (data.error === "slow_down") {
      const newInterval = iife(() => {
        const serverInterval = data.interval
        if (serverInterval && typeof serverInterval === "number" && serverInterval > 0) {
          return serverInterval * 1000
        }
        return (device.interval + 5) * 1000
      })
      await Bun.sleep(newInterval + OAUTH_POLLING_SAFETY_MARGIN_MS)
      return poll(newInterval)
    }

    if (data.error === "expired_token") return null
    if (data.error) return null

    await Bun.sleep(intervalMs + OAUTH_POLLING_SAFETY_MARGIN_MS)
    return poll(intervalMs)
  }

  return poll(device.interval * 1000)
}

type CopilotServiceTokenResponse = {
  token?: string
  access_token?: string
  refresh_token?: string
  expires_at?: number | string
}

type CopilotServiceToken = {
  access: string
  refresh: string
  expires: number
}

async function fetchCopilotServiceToken(url: string, accessToken: string): Promise<CopilotServiceToken | null> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `token ${accessToken}`,
      Accept: "application/vnd.github+json",
      "Editor-Version": "vscode/1.96.2",
      "Editor-Plugin-Version": "copilot-chat/0.26.7",
      "User-Agent": `opencode/${Installation.VERSION}`,
      "X-Github-Api-Version": "2025-04-01",
    },
    signal: AbortSignal.timeout(10_000),
  }).catch((error) => {
    log.warn("copilot service token request failed", {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  })

  if (!response) return null
  if (!response.ok) {
    const detail = await response.json().catch(() => null)
    log.warn("copilot service token request rejected", {
      status: response.status,
      detail,
    })
    return null
  }

  const body = (await response.json().catch(() => null)) as CopilotServiceTokenResponse | null
  if (!body) {
    log.warn("copilot service token response empty")
    return null
  }

  const token = iife(() => {
    if (typeof body.token === "string") return body.token
    if (typeof body.access_token === "string") return body.access_token
    return null
  })
  if (!token) {
    log.warn("copilot service token missing")
    return null
  }

  const refresh = typeof body.refresh_token === "string" ? body.refresh_token : token
  const expires = iife(() => {
    const value = body.expires_at
    if (typeof value === "number") return value
    if (typeof value === "string") {
      const parsed = Number.parseInt(value, 10)
      if (!Number.isNaN(parsed)) return parsed
      const ms = new Date(value).getTime()
      if (!Number.isNaN(ms)) return Math.floor(ms / 1000)
    }
    return 0
  })

  return {
    access: token,
    refresh,
    expires,
  }
}

export async function CopilotAuthPlugin(input: PluginInput): Promise<Hooks> {
  const sdk = input.client
  return {
    auth: {
      provider: "github-copilot",
      async loader(getAuth, provider) {
        const info = await getAuth()
        if (!info || info.type !== "oauth") return {}

        const enterpriseUrl = info.enterpriseUrl
        const baseURL = enterpriseUrl ? `https://copilot-api.${normalizeDomain(enterpriseUrl)}` : undefined

        if (provider && provider.models) {
          for (const model of Object.values(provider.models)) {
            model.cost = {
              input: 0,
              output: 0,
              cache: {
                read: 0,
                write: 0,
              },
            }

            // TODO: re-enable once messages api has higher rate limits
            // TODO: move some of this hacky-ness to models.dev presets once we have better grasp of things here...
            // const base = baseURL ?? model.api.url
            // const claude = model.id.includes("claude")
            // const url = iife(() => {
            //   if (!claude) return base
            //   if (base.endsWith("/v1")) return base
            //   if (base.endsWith("/")) return `${base}v1`
            //   return `${base}/v1`
            // })

            // model.api.url = url
            // model.api.npm = claude ? "@ai-sdk/anthropic" : "@ai-sdk/github-copilot"
            model.api.npm = "@ai-sdk/github-copilot"
          }
        }

        return {
          baseURL,
          apiKey: "",
          async fetch(request: RequestInfo | URL, init?: RequestInit) {
            const info = await getAuth()
            if (info.type !== "oauth") return fetch(request, init)

            const url = request instanceof URL ? request.href : request.toString()
            const { isVision, isAgent } = iife(() => {
              try {
                const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body

                // Completions API
                if (body?.messages && url.includes("completions")) {
                  const last = body.messages[body.messages.length - 1]
                  return {
                    isVision: body.messages.some(
                      (msg: any) =>
                        Array.isArray(msg.content) && msg.content.some((part: any) => part.type === "image_url"),
                    ),
                    isAgent: last?.role !== "user",
                  }
                }

                // Responses API
                if (body?.input) {
                  const last = body.input[body.input.length - 1]
                  return {
                    isVision: body.input.some(
                      (item: any) =>
                        Array.isArray(item?.content) && item.content.some((part: any) => part.type === "input_image"),
                    ),
                    isAgent: last?.role !== "user",
                  }
                }

                // Messages API
                if (body?.messages) {
                  const last = body.messages[body.messages.length - 1]
                  const hasNonToolCalls =
                    Array.isArray(last?.content) && last.content.some((part: any) => part?.type !== "tool_result")
                  return {
                    isVision: body.messages.some(
                      (item: any) =>
                        Array.isArray(item?.content) &&
                        item.content.some(
                          (part: any) =>
                            part?.type === "image" ||
                            // images can be nested inside tool_result content
                            (part?.type === "tool_result" &&
                              Array.isArray(part?.content) &&
                              part.content.some((nested: any) => nested?.type === "image")),
                        ),
                    ),
                    isAgent: !(last?.role === "user" && hasNonToolCalls),
                  }
                }
              } catch {}
              return { isVision: false, isAgent: false }
            })

            const headers: Record<string, string> = {
              "x-initiator": isAgent ? "agent" : "user",
              ...(init?.headers as Record<string, string>),
              "User-Agent": `opencode/${Installation.VERSION}`,
              Authorization: `Bearer ${info.refresh}`,
              "Openai-Intent": "conversation-edits",
            }

            if (isVision) {
              headers["Copilot-Vision-Request"] = "true"
            }

            delete headers["x-api-key"]
            delete headers["authorization"]

            return fetch(request, {
              ...init,
              headers,
            })
          },
        }
      },
      methods: [
        {
          type: "oauth",
          label: "Login with GitHub Copilot",
          prompts: [
            {
              type: "select",
              key: "deploymentType",
              message: "Select GitHub deployment type",
              options: [
                {
                  label: "GitHub.com",
                  value: "github.com",
                  hint: "Public",
                },
                {
                  label: "GitHub Enterprise",
                  value: "enterprise",
                  hint: "Data residency or self-hosted",
                },
              ],
            },
            {
              type: "text",
              key: "enterpriseUrl",
              message: "Enter your GitHub Enterprise URL or domain",
              placeholder: "company.ghe.com or https://company.ghe.com",
              condition: (inputs) => inputs.deploymentType === "enterprise",
              validate: (value) => {
                if (!value) return "URL or domain is required"
                try {
                  const url = value.includes("://") ? new URL(value) : new URL(`https://${value}`)
                  if (!url.hostname) return "Please enter a valid URL or domain"
                  return undefined
                } catch {
                  return "Please enter a valid URL (e.g., company.ghe.com or https://company.ghe.com)"
                }
              },
            },
          ],
          async authorize(inputs = {}) {
            const deploymentType = inputs.deploymentType || "github.com"

            let domain = "github.com"
            let actualProvider = "github-copilot"

            if (deploymentType === "enterprise") {
              const enterpriseUrl = inputs.enterpriseUrl
              domain = normalizeDomain(enterpriseUrl!)
              actualProvider = "github-copilot-enterprise"
            }

            const urls = getUrls(domain)

            const deviceData = await requestCopilotDeviceCode(urls.DEVICE_CODE_URL, CLIENT_ID, "read:user")
            if (!deviceData) throw new Error("Failed to initiate device authorization")

            const usageDeviceData = await requestCopilotDeviceCode(
              urls.DEVICE_CODE_URL,
              COPILOT_USAGE_CLIENT_ID,
              COPILOT_USAGE_SCOPE,
            ).catch(() => null)

            if (!usageDeviceData) {
              log.warn("copilot usage device authorization unavailable")
            }

            const instructions = iife(() => {
              if (!usageDeviceData) return `Enter code: ${deviceData.userCode}`
              return [
                `Enter code: ${deviceData.userCode}`,
                "",
                "To enable usage tracking, also complete:",
                `Go to: ${usageDeviceData.verificationUri}`,
                `Enter code: ${usageDeviceData.userCode}`,
              ].join("\n")
            })

            return {
              url: deviceData.verificationUri,
              instructions,
              method: "auto" as const,
              async callback() {
                const usageController = usageDeviceData ? new AbortController() : null
                const usagePromise = usageDeviceData
                  ? pollCopilotDeviceToken(
                      urls.ACCESS_TOKEN_URL,
                      usageDeviceData,
                      COPILOT_USAGE_CLIENT_ID,
                      usageController?.signal,
                    )
                  : Promise.resolve(null)

                const deviceToken = await pollCopilotDeviceToken(urls.ACCESS_TOKEN_URL, deviceData, CLIENT_ID)
                if (!deviceToken) return { type: "failed" as const }

                const usageToken = await iife(async () => {
                  if (!usageDeviceData) return null
                  const timeout = Bun.sleep(COPILOT_USAGE_TIMEOUT_MS).then(() => ({ type: "timeout" as const }))
                  const result = await Promise.race([
                    usagePromise.then((token) => ({ type: "token" as const, token })),
                    timeout,
                  ])
                  if (result.type === "token") return result.token
                  usageController?.abort()
                  return null
                })

                const serviceToken = await fetchCopilotServiceToken(urls.COPILOT_TOKEN_URL, deviceToken)
                const accessToken = serviceToken?.access ?? deviceToken
                const refreshToken = serviceToken?.refresh ?? accessToken
                const expires = serviceToken?.expires ?? 0
                const result: {
                  type: "success"
                  refresh: string
                  access: string
                  expires: number
                  usage?: string
                  provider?: string
                  enterpriseUrl?: string
                } = {
                  type: "success",
                  refresh: refreshToken,
                  access: accessToken,
                  expires,
                  ...(usageToken ? { usage: usageToken } : {}),
                }

                if (actualProvider === "github-copilot-enterprise") {
                  result.provider = "github-copilot-enterprise"
                  result.enterpriseUrl = domain
                }

                return result
              },
            }
          },
        },
      ],
    },
    "chat.headers": async (incoming, output) => {
      if (!incoming.model.providerID.includes("github-copilot")) return

      if (incoming.model.api.npm === "@ai-sdk/anthropic") {
        output.headers["anthropic-beta"] = "interleaved-thinking-2025-05-14"
      }

      const session = await sdk.session
        .get({
          path: {
            id: incoming.sessionID,
          },
          query: {
            directory: input.directory,
          },
          throwOnError: true,
        })
        .catch(() => undefined)
      if (!session || !session.data.parentID) return
      // mark subagent sessions as agent initiated matching standard that other copilot tools have
      output.headers["x-initiator"] = "agent"
    },
  }
}
