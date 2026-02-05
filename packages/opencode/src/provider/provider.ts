import z from "zod"
import fuzzysort from "fuzzysort"
import { Config } from "../config/config"
import { mapValues, mergeDeep, omit, pickBy, sortBy } from "remeda"
import { NoSuchModelError, type Provider as SDK } from "ai"
import { Log } from "../util/log"
import { BunProc } from "../bun"
import { Plugin } from "../plugin"
import { ModelsDev } from "./models"
import { NamedError } from "@opencode-ai/util/error"
import { Auth } from "../auth"
import { Env } from "../env"
import { Instance } from "../project/instance"
import { Flag } from "../flag/flag"
import { iife } from "@/util/iife"

// Direct imports for bundled providers
import { createAmazonBedrock, type AmazonBedrockProviderSettings } from "@ai-sdk/amazon-bedrock"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createAzure } from "@ai-sdk/azure"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createVertex } from "@ai-sdk/google-vertex"
import { createVertexAnthropic } from "@ai-sdk/google-vertex/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { createOpenRouter, type LanguageModelV2 } from "@openrouter/ai-sdk-provider"
import { createOpenaiCompatible as createGitHubCopilotOpenAICompatible } from "./sdk/copilot"
import { createXai } from "@ai-sdk/xai"
import { createMistral } from "@ai-sdk/mistral"
import { createGroq } from "@ai-sdk/groq"
import { createDeepInfra } from "@ai-sdk/deepinfra"
import { createCerebras } from "@ai-sdk/cerebras"
import { createCohere } from "@ai-sdk/cohere"
import { createGateway } from "@ai-sdk/gateway"
import { createTogetherAI } from "@ai-sdk/togetherai"
import { createPerplexity } from "@ai-sdk/perplexity"
import { createVercel } from "@ai-sdk/vercel"
import { createGitLab } from "@gitlab/gitlab-ai-provider"
import { ProviderTransform } from "./transform"

export namespace Provider {
  const log = Log.create({ service: "provider" })

  function isGpt5OrLater(modelID: string): boolean {
    const match = /^gpt-(\d+)/.exec(modelID)
    if (!match) {
      return false
    }
    return Number(match[1]) >= 5
  }

  function shouldUseCopilotResponsesApi(modelID: string): boolean {
    return isGpt5OrLater(modelID) && !modelID.startsWith("gpt-5-mini")
  }

  const BUNDLED_PROVIDERS: Record<string, (options: any) => SDK> = {
    "@ai-sdk/amazon-bedrock": createAmazonBedrock,
    "@ai-sdk/anthropic": createAnthropic,
    "@ai-sdk/azure": createAzure,
    "@ai-sdk/google": createGoogleGenerativeAI,
    "@ai-sdk/google-vertex": createVertex,
    "@ai-sdk/google-vertex/anthropic": createVertexAnthropic,
    "@ai-sdk/openai": createOpenAI,
    "@ai-sdk/openai-compatible": createOpenAICompatible,
    "@openrouter/ai-sdk-provider": createOpenRouter,
    "@ai-sdk/xai": createXai,
    "@ai-sdk/mistral": createMistral,
    "@ai-sdk/groq": createGroq,
    "@ai-sdk/deepinfra": createDeepInfra,
    "@ai-sdk/cerebras": createCerebras,
    "@ai-sdk/cohere": createCohere,
    "@ai-sdk/gateway": createGateway,
    "@ai-sdk/togetherai": createTogetherAI,
    "@ai-sdk/perplexity": createPerplexity,
    "@ai-sdk/vercel": createVercel,
    "@gitlab/gitlab-ai-provider": createGitLab,
    // @ts-ignore (TODO: kill this code so we dont have to maintain it)
    "@ai-sdk/github-copilot": createGitHubCopilotOpenAICompatible,
  }

  type CustomModelLoader = (sdk: any, modelID: string, options?: Record<string, any>) => Promise<any>
  type CustomLoader = (provider: Info) => Promise<{
    autoload: boolean
    getModel?: CustomModelLoader
    options?: Record<string, any>
  }>

  const CUSTOM_LOADERS: Record<string, CustomLoader> = {
    async anthropic() {
      return {
        autoload: false,
        options: {
          headers: {
            "anthropic-beta":
              "claude-code-20250219,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14",
          },
        },
      }
    },
    async opencode(input) {
      const hasKey = await (async () => {
        const env = Env.all()
        if (input.env.some((item) => env[item])) return true
        if (await Auth.get(input.id)) return true
        const config = await Config.get()
        if (config.provider?.["opencode"]?.options?.apiKey) return true
        return false
      })()

      if (!hasKey) {
        for (const [key, value] of Object.entries(input.models)) {
          if (value.cost.input === 0) continue
          delete input.models[key]
        }
      }

      return {
        autoload: Object.keys(input.models).length > 0,
        options: hasKey ? {} : { apiKey: "public" },
      }
    },
    openai: async () => {
      return {
        autoload: false,
        async getModel(sdk: any, modelID: string, _options?: Record<string, any>) {
          return sdk.responses(modelID)
        },
        options: {},
      }
    },
    "github-copilot": async () => {
      return {
        autoload: false,
        async getModel(sdk: any, modelID: string, _options?: Record<string, any>) {
          if (sdk.responses === undefined && sdk.chat === undefined) return sdk.languageModel(modelID)
          return shouldUseCopilotResponsesApi(modelID) ? sdk.responses(modelID) : sdk.chat(modelID)
        },
        options: {},
      }
    },
    "github-copilot-enterprise": async () => {
      return {
        autoload: false,
        async getModel(sdk: any, modelID: string, _options?: Record<string, any>) {
          if (sdk.responses === undefined && sdk.chat === undefined) return sdk.languageModel(modelID)
          return shouldUseCopilotResponsesApi(modelID) ? sdk.responses(modelID) : sdk.chat(modelID)
        },
        options: {},
      }
    },
    azure: async () => {
      return {
        autoload: false,
        async getModel(sdk: any, modelID: string, options?: Record<string, any>) {
          if (options?.["useCompletionUrls"]) {
            return sdk.chat(modelID)
          } else {
            return sdk.responses(modelID)
          }
        },
        options: {},
      }
    },
    "azure-cognitive-services": async () => {
      const resourceName = Env.get("AZURE_COGNITIVE_SERVICES_RESOURCE_NAME")
      return {
        autoload: false,
        async getModel(sdk: any, modelID: string, options?: Record<string, any>) {
          if (options?.["useCompletionUrls"]) {
            return sdk.chat(modelID)
          } else {
            return sdk.responses(modelID)
          }
        },
        options: {
          baseURL: resourceName ? `https://${resourceName}.cognitiveservices.azure.com/openai` : undefined,
        },
      }
    },
    "amazon-bedrock": async () => {
      const config = await Config.get()
      const providerConfig = config.provider?.["amazon-bedrock"]

      const auth = await Auth.get("amazon-bedrock")

      // Region precedence: 1) config file, 2) env var, 3) default
      const configRegion = providerConfig?.options?.region
      const envRegion = Env.get("AWS_REGION")
      const defaultRegion = configRegion ?? envRegion ?? "us-east-1"

      // Profile: config file takes precedence over env var
      const configProfile = providerConfig?.options?.profile
      const envProfile = Env.get("AWS_PROFILE")
      const profile = configProfile ?? envProfile

      const awsAccessKeyId = Env.get("AWS_ACCESS_KEY_ID")

      const awsBearerToken = iife(() => {
        const envToken = Env.get("AWS_BEARER_TOKEN_BEDROCK")
        if (envToken) return envToken
        if (auth?.type === "api") {
          Env.set("AWS_BEARER_TOKEN_BEDROCK", auth.key)
          return auth.key
        }
        return undefined
      })

      const awsWebIdentityTokenFile = Env.get("AWS_WEB_IDENTITY_TOKEN_FILE")

      if (!profile && !awsAccessKeyId && !awsBearerToken && !awsWebIdentityTokenFile) return { autoload: false }

      const providerOptions: AmazonBedrockProviderSettings = {
        region: defaultRegion,
      }

      // Only use credential chain if no bearer token exists
      // Bearer token takes precedence over credential chain (profiles, access keys, IAM roles, web identity tokens)
      if (!awsBearerToken) {
        const { fromNodeProviderChain } = await import(await BunProc.install("@aws-sdk/credential-providers"))

        // Build credential provider options (only pass profile if specified)
        const credentialProviderOptions = profile ? { profile } : {}

        providerOptions.credentialProvider = fromNodeProviderChain(credentialProviderOptions)
      }

      // Add custom endpoint if specified (endpoint takes precedence over baseURL)
      const endpoint = providerConfig?.options?.endpoint ?? providerConfig?.options?.baseURL
      if (endpoint) {
        providerOptions.baseURL = endpoint
      }

      return {
        autoload: true,
        options: providerOptions,
        async getModel(sdk: any, modelID: string, options?: Record<string, any>) {
          // Skip region prefixing if model already has a cross-region inference profile prefix
          if (modelID.startsWith("global.") || modelID.startsWith("jp.")) {
            return sdk.languageModel(modelID)
          }

          // Region resolution precedence (highest to lowest):
          // 1. options.region from opencode.json provider config
          // 2. defaultRegion from AWS_REGION environment variable
          // 3. Default "us-east-1" (baked into defaultRegion)
          const region = options?.region ?? defaultRegion

          let regionPrefix = region.split("-")[0]

          switch (regionPrefix) {
            case "us": {
              const modelRequiresPrefix = [
                "nova-micro",
                "nova-lite",
                "nova-pro",
                "nova-premier",
                "nova-2",
                "claude",
                "deepseek",
              ].some((m) => modelID.includes(m))
              const isGovCloud = region.startsWith("us-gov")
              if (modelRequiresPrefix && !isGovCloud) {
                modelID = `${regionPrefix}.${modelID}`
              }
              break
            }
            case "eu": {
              const regionRequiresPrefix = [
                "eu-west-1",
                "eu-west-2",
                "eu-west-3",
                "eu-north-1",
                "eu-central-1",
                "eu-south-1",
                "eu-south-2",
              ].some((r) => region.includes(r))
              const modelRequiresPrefix = ["claude", "nova-lite", "nova-micro", "llama3", "pixtral"].some((m) =>
                modelID.includes(m),
              )
              if (regionRequiresPrefix && modelRequiresPrefix) {
                modelID = `${regionPrefix}.${modelID}`
              }
              break
            }
            case "ap": {
              const isAustraliaRegion = ["ap-southeast-2", "ap-southeast-4"].includes(region)
              const isTokyoRegion = region === "ap-northeast-1"
              if (
                isAustraliaRegion &&
                ["anthropic.claude-sonnet-4-5", "anthropic.claude-haiku"].some((m) => modelID.includes(m))
              ) {
                regionPrefix = "au"
                modelID = `${regionPrefix}.${modelID}`
              } else if (isTokyoRegion) {
                // Tokyo region uses jp. prefix for cross-region inference
                const modelRequiresPrefix = ["claude", "nova-lite", "nova-micro", "nova-pro"].some((m) =>
                  modelID.includes(m),
                )
                if (modelRequiresPrefix) {
                  regionPrefix = "jp"
                  modelID = `${regionPrefix}.${modelID}`
                }
              } else {
                // Other APAC regions use apac. prefix
                const modelRequiresPrefix = ["claude", "nova-lite", "nova-micro", "nova-pro"].some((m) =>
                  modelID.includes(m),
                )
                if (modelRequiresPrefix) {
                  regionPrefix = "apac"
                  modelID = `${regionPrefix}.${modelID}`
                }
              }
              break
            }
          }

          return sdk.languageModel(modelID)
        },
      }
    },
    openrouter: async () => {
      return {
        autoload: false,
        options: {
          headers: {
            "HTTP-Referer": "https://opencode.ai/",
            "X-Title": "opencode",
          },
        },
      }
    },
    vercel: async () => {
      return {
        autoload: false,
        options: {
          headers: {
            "http-referer": "https://opencode.ai/",
            "x-title": "opencode",
          },
        },
      }
    },
    "google-vertex": async () => {
      const project = Env.get("GOOGLE_CLOUD_PROJECT") ?? Env.get("GCP_PROJECT") ?? Env.get("GCLOUD_PROJECT")
      const location = Env.get("GOOGLE_CLOUD_LOCATION") ?? Env.get("VERTEX_LOCATION") ?? "us-east5"
      const autoload = Boolean(project)
      if (!autoload) return { autoload: false }
      return {
        autoload: true,
        options: {
          project,
          location,
        },
        async getModel(sdk: any, modelID: string) {
          const id = String(modelID).trim()
          return sdk.languageModel(id)
        },
      }
    },
    "google-vertex-anthropic": async () => {
      const project = Env.get("GOOGLE_CLOUD_PROJECT") ?? Env.get("GCP_PROJECT") ?? Env.get("GCLOUD_PROJECT")
      const location = Env.get("GOOGLE_CLOUD_LOCATION") ?? Env.get("VERTEX_LOCATION") ?? "global"
      const autoload = Boolean(project)
      if (!autoload) return { autoload: false }
      return {
        autoload: true,
        options: {
          project,
          location,
        },
        async getModel(sdk: any, modelID) {
          const id = String(modelID).trim()
          return sdk.languageModel(id)
        },
      }
    },
    "sap-ai-core": async () => {
      const auth = await Auth.get("sap-ai-core")
      const envServiceKey = iife(() => {
        const envAICoreServiceKey = Env.get("AICORE_SERVICE_KEY")
        if (envAICoreServiceKey) return envAICoreServiceKey
        if (auth?.type === "api") {
          Env.set("AICORE_SERVICE_KEY", auth.key)
          return auth.key
        }
        return undefined
      })
      const deploymentId = Env.get("AICORE_DEPLOYMENT_ID")
      const resourceGroup = Env.get("AICORE_RESOURCE_GROUP")

      return {
        autoload: !!envServiceKey,
        options: envServiceKey ? { deploymentId, resourceGroup } : {},
        async getModel(sdk: any, modelID: string) {
          return sdk(modelID)
        },
      }
    },
    zenmux: async () => {
      return {
        autoload: false,
        options: {
          headers: {
            "HTTP-Referer": "https://opencode.ai/",
            "X-Title": "opencode",
          },
        },
      }
    },
    gitlab: async (input) => {
      const instanceUrl = Env.get("GITLAB_INSTANCE_URL") || "https://gitlab.com"

      const auth = await Auth.get(input.id)
      const apiKey = await (async () => {
        if (auth?.type === "oauth") return auth.access
        if (auth?.type === "api") return auth.key
        return Env.get("GITLAB_TOKEN")
      })()

      const config = await Config.get()
      const providerConfig = config.provider?.["gitlab"]

      return {
        autoload: !!apiKey,
        options: {
          instanceUrl,
          apiKey,
          featureFlags: {
            duo_agent_platform_agentic_chat: true,
            duo_agent_platform: true,
            ...(providerConfig?.options?.featureFlags || {}),
          },
        },
        async getModel(sdk: ReturnType<typeof createGitLab>, modelID: string) {
          return sdk.agenticChat(modelID, {
            featureFlags: {
              duo_agent_platform_agentic_chat: true,
              duo_agent_platform: true,
              ...(providerConfig?.options?.featureFlags || {}),
            },
          })
        },
      }
    },
    "cloudflare-ai-gateway": async (input) => {
      const accountId = Env.get("CLOUDFLARE_ACCOUNT_ID")
      const gateway = Env.get("CLOUDFLARE_GATEWAY_ID")

      if (!accountId || !gateway) return { autoload: false }

      // Get API token from env or auth prompt
      const apiToken = await (async () => {
        const envToken = Env.get("CLOUDFLARE_API_TOKEN")
        if (envToken) return envToken
        const auth = await Auth.get(input.id)
        if (auth?.type === "api") return auth.key
        return undefined
      })()

      return {
        autoload: true,
        async getModel(sdk: any, modelID: string, _options?: Record<string, any>) {
          return sdk.languageModel(modelID)
        },
        options: {
          baseURL: `https://gateway.ai.cloudflare.com/v1/${accountId}/${gateway}/compat`,
          headers: {
            // Cloudflare AI Gateway uses cf-aig-authorization for authenticated gateways
            // This enables Unified Billing where Cloudflare handles upstream provider auth
            ...(apiToken ? { "cf-aig-authorization": `Bearer ${apiToken}` } : {}),
            "HTTP-Referer": "https://opencode.ai/",
            "X-Title": "opencode",
          },
          // Custom fetch to handle parameter transformation and auth
          fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
            const headers = new Headers(init?.headers)
            // Strip Authorization header - AI Gateway uses cf-aig-authorization instead
            headers.delete("Authorization")

            // Transform max_tokens to max_completion_tokens for newer models
            if (init?.body && init.method === "POST") {
              try {
                const body = JSON.parse(init.body as string)
                if (body.max_tokens !== undefined && !body.max_completion_tokens) {
                  body.max_completion_tokens = body.max_tokens
                  delete body.max_tokens
                  init = { ...init, body: JSON.stringify(body) }
                }
              } catch (e) {
                // If body parsing fails, continue with original request
              }
            }

            return fetch(input, { ...init, headers })
          },
        },
      }
    },
    cerebras: async () => {
      return {
        autoload: false,
        options: {
          headers: {
            "X-Cerebras-3rd-Party-Integration": "opencode",
          },
        },
      }
    },
    databricks: async (input) => {
      // Azure Databricks resource ID for OAuth/AAD authentication
      // This is the official Azure AD application ID for Azure Databricks
      // See: https://learn.microsoft.com/en-us/azure/databricks/dev-tools/auth/oauth-m2m
      const AZURE_DATABRICKS_RESOURCE_ID = "2ff814a6-3304-4ab8-85cb-cd0e6f879c1d"

      const config = await Config.get()
      const providerConfig = config.provider?.["databricks"]
      const auth = await Auth.get("databricks")

      // Helper to read host from ~/.databrickscfg profile
      const getHostFromProfile = async (profileName: string): Promise<string | undefined> => {
        try {
          const homedir = Env.get("HOME") ?? Env.get("USERPROFILE")
          if (!homedir) return undefined
          const configPath = Env.get("DATABRICKS_CONFIG_FILE") ?? `${homedir}/.databrickscfg`
          const file = Bun.file(configPath)
          if (!(await file.exists())) return undefined

          const content = await file.text()
          const lines = content.split("\n")

          let currentSection = ""
          for (const line of lines) {
            const trimmed = line.trim()
            // Check for section header [profile-name]
            const sectionMatch = trimmed.match(/^\[(.+)\]$/)
            if (sectionMatch) {
              currentSection = sectionMatch[1]
              continue
            }
            // Check for host = value in the target section
            if (currentSection === profileName) {
              const hostMatch = trimmed.match(/^host\s*=\s*(.+)$/)
              if (hostMatch) {
                return hostMatch[1].trim().replace(/\/$/, "")
              }
            }
          }
          return undefined
        } catch {
          return undefined
        }
      }

      // Host resolution: 1) stored auth, 2) config file, 3) env var, 4) profile from ~/.databrickscfg
      const authHost = auth?.type === "api" ? auth.host : undefined
      const configHost = providerConfig?.options?.baseURL ?? providerConfig?.options?.host
      const envHost = Env.get("DATABRICKS_HOST")
      const profileName = Env.get("DATABRICKS_CONFIG_PROFILE") ?? providerConfig?.options?.profile ?? "DEFAULT"
      const profileHost = await getHostFromProfile(profileName)
      const host = authHost ?? configHost ?? envHost ?? profileHost

      if (!host) return { autoload: false }

      // Authentication precedence:
      // 1. PAT token (DATABRICKS_TOKEN or stored auth)
      // 2. OAuth M2M (DATABRICKS_CLIENT_ID + DATABRICKS_CLIENT_SECRET) for Azure
      // 3. Azure AD Service Principal (azure_client_id + azure_client_secret + azure_tenant_id)
      const token = Env.get("DATABRICKS_TOKEN") ?? (auth?.type === "api" ? auth.key : undefined)

      // OAuth M2M credentials for Azure Databricks
      // Note: Standard OAuth auth type doesn't include clientId/clientSecret fields,
      // so we use type assertion. In practice, these come from env vars or config.
      const clientId =
        Env.get("DATABRICKS_CLIENT_ID") ??
        providerConfig?.options?.clientId ??
        (auth?.type === "oauth" ? (auth as any).clientId : undefined)
      const clientSecret =
        Env.get("DATABRICKS_CLIENT_SECRET") ??
        providerConfig?.options?.clientSecret ??
        (auth?.type === "oauth" ? (auth as any).clientSecret : undefined)

      // Azure AD Service Principal credentials
      const azureClientId = Env.get("ARM_CLIENT_ID") ?? providerConfig?.options?.azureClientId
      const azureClientSecret = Env.get("ARM_CLIENT_SECRET") ?? providerConfig?.options?.azureClientSecret
      const azureTenantId = Env.get("ARM_TENANT_ID") ?? providerConfig?.options?.azureTenantId

      // Determine which auth method to use
      const hasOAuthM2M = clientId && clientSecret
      const hasAzureAD = azureClientId && azureClientSecret && azureTenantId
      const hasPAT = Boolean(token)
      // Check if Azure CLI is available for Azure Databricks workspaces
      const isAzureDatabricks = host.includes("azuredatabricks.net")

      // Check for Databricks CLI token cache
      const hasDatabricksCLI = await (async () => {
        try {
          const homedir = Env.get("HOME") ?? Env.get("USERPROFILE")
          if (!homedir) return false
          const tokenCachePath = `${homedir}/.databricks/token-cache.json`
          const file = Bun.file(tokenCachePath)
          return await file.exists()
        } catch {
          return false
        }
      })()

      if (!hasPAT && !hasOAuthM2M && !hasAzureAD && !isAzureDatabricks && !hasDatabricksCLI) return { autoload: false }

      // Databricks Foundation Model APIs use OpenAI-compatible endpoints
      // The base URL format is: https://<workspace-url>/serving-endpoints
      // If baseURL is already a full path (includes /serving-endpoints), use it as-is
      const baseURL = host.includes("/serving-endpoints")
        ? host.replace(/\/$/, "")
        : host.replace(/\/$/, "") + "/serving-endpoints"

      // For OAuth M2M, we need to fetch an access token
      let accessToken: string | undefined = token
      if (!accessToken && hasOAuthM2M) {
        // Fetch OAuth token from Databricks OIDC endpoint
        const tokenEndpoint = `${host.replace(/\/$/, "")}/oidc/v1/token`
        try {
          const response = await fetch(tokenEndpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
            },
            body: "grant_type=client_credentials&scope=all-apis",
          })
          if (response.ok) {
            const data = (await response.json()) as { access_token: string }
            accessToken = data.access_token
          } else {
            log.debug("Failed to fetch Databricks OAuth token", {
              status: response.status,
              statusText: response.statusText,
            })
          }
        } catch (e) {
          log.debug("Failed to fetch Databricks OAuth token", {
            error: e instanceof Error ? e.message : "Unknown error",
          })
        }
      }

      // For Azure AD Service Principal, we need to fetch an Azure AD token first
      if (!accessToken && hasAzureAD) {
        try {
          // Get Azure AD token for Databricks resource
          const aadTokenEndpoint = `https://login.microsoftonline.com/${azureTenantId}/oauth2/v2.0/token`
          const response = await fetch(aadTokenEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "client_credentials",
              client_id: azureClientId,
              client_secret: azureClientSecret,
              scope: `${AZURE_DATABRICKS_RESOURCE_ID}/.default`,
            }).toString(),
          })
          if (response.ok) {
            const data = (await response.json()) as { access_token: string }
            accessToken = data.access_token
          } else {
            log.debug("Failed to fetch Azure AD token for Databricks", {
              status: response.status,
              statusText: response.statusText,
            })
          }
        } catch (e) {
          log.debug("Failed to fetch Azure AD token for Databricks", {
            error: e instanceof Error ? e.message : "Unknown error",
          })
        }
      }

      // Try Databricks CLI token cache (from `databricks auth login`)
      if (!accessToken) {
        try {
          const homedir = Env.get("HOME") ?? Env.get("USERPROFILE")
          if (homedir) {
            const tokenCachePath = `${homedir}/.databricks/token-cache.json`
            const file = Bun.file(tokenCachePath)
            if (await file.exists()) {
              const cacheContent = await file.text()
              const cache = JSON.parse(cacheContent) as {
                version: number
                tokens: Record<
                  string,
                  {
                    access_token: string
                    token_type: string
                    refresh_token: string
                    expiry: string
                    expires_in?: number
                  }
                >
              }

              // Normalize host for lookup (remove trailing slash)
              const normalizedHost = host.replace(/\/$/, "")

              // Find token for this host
              const tokenEntry = cache.tokens[normalizedHost]
              if (tokenEntry) {
                const expiry = new Date(tokenEntry.expiry)
                const now = new Date()

                // Check if token is still valid (with 5 minute buffer)
                if (expiry.getTime() - 5 * 60 * 1000 > now.getTime()) {
                  accessToken = tokenEntry.access_token
                  log.info("Using Databricks CLI token cache for authentication")
                } else if (tokenEntry.refresh_token) {
                  // Token expired, try to refresh it
                  log.debug("Databricks CLI token expired, attempting refresh")
                  const tokenEndpoint = `${normalizedHost}/oidc/v1/token`
                  try {
                    const response = await fetch(tokenEndpoint, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                      },
                      body: new URLSearchParams({
                        grant_type: "refresh_token",
                        refresh_token: tokenEntry.refresh_token,
                        client_id: "databricks-cli",
                      }).toString(),
                    })
                    if (response.ok) {
                      const data = (await response.json()) as {
                        access_token: string
                        refresh_token?: string
                        expires_in?: number
                      }
                      accessToken = data.access_token
                      log.info("Refreshed Databricks CLI token successfully")

                      // Update the token cache with new tokens
                      cache.tokens[normalizedHost] = {
                        ...tokenEntry,
                        access_token: data.access_token,
                        refresh_token: data.refresh_token ?? tokenEntry.refresh_token,
                        expiry: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
                        expires_in: data.expires_in ?? 3600,
                      }
                      await Bun.write(tokenCachePath, JSON.stringify(cache, null, 2))
                    } else {
                      log.debug("Failed to refresh Databricks CLI token", {
                        status: response.status,
                        statusText: response.statusText,
                      })
                    }
                  } catch (refreshError) {
                    log.debug("Failed to refresh Databricks CLI token", {
                      error: refreshError instanceof Error ? refreshError.message : "Unknown error",
                    })
                  }
                }
              }
            }
          }
        } catch (e) {
          log.debug("Failed to read Databricks CLI token cache", {
            error: e instanceof Error ? e.message : "Unknown error",
          })
        }
      }

      // For Azure Databricks, try Azure CLI as a fallback
      if (!accessToken && isAzureDatabricks) {
        try {
          // Try to get token from Azure CLI
          const proc = Bun.spawn(
            ["az", "account", "get-access-token", "--resource", AZURE_DATABRICKS_RESOURCE_ID, "-o", "json"],
            { stdout: "pipe", stderr: "pipe" },
          )
          const output = await new Response(proc.stdout).text()
          const exitCode = await proc.exited
          if (exitCode === 0) {
            try {
              const data = JSON.parse(output) as { accessToken: string }
              accessToken = data.accessToken
              log.info("Using Azure CLI token for Databricks authentication")
            } catch (parseError) {
              log.debug("Failed to parse Azure CLI token response", {
                error: parseError instanceof Error ? parseError.message : "Unknown error",
              })
            }
          } else {
            log.debug("Azure CLI returned non-zero exit code", { exitCode })
          }
        } catch (e) {
          log.debug("Azure CLI not available for Databricks auth", {
            error: e instanceof Error ? e.message : "Unknown error",
          })
        }
      }

      if (!accessToken) return { autoload: false }

      // Store normalized host for token lookups
      const normalizedHost = host.replace(/\/$/, "")

      // Function to get fresh token from Databricks CLI token cache
      const getFreshToken = async (): Promise<string> => {
        try {
          const homedir = Env.get("HOME") ?? Env.get("USERPROFILE")
          if (homedir) {
            const tokenCachePath = `${homedir}/.databricks/token-cache.json`
            const file = Bun.file(tokenCachePath)
            if (await file.exists()) {
              const cacheContent = await file.text()
              const cache = JSON.parse(cacheContent) as {
                version: number
                tokens: Record<
                  string,
                  {
                    access_token: string
                    refresh_token?: string
                    expiry: string
                    expires_in?: number
                  }
                >
              }

              const tokenEntry = cache.tokens[normalizedHost]
              if (tokenEntry) {
                const expiry = new Date(tokenEntry.expiry)
                const now = new Date()

                // Check if cached token is still valid (with 5 minute buffer)
                if (expiry.getTime() - 5 * 60 * 1000 > now.getTime()) {
                  return tokenEntry.access_token
                }

                // Token expired, try to refresh it if we have a refresh_token
                if (tokenEntry.refresh_token) {
                  log.debug("Databricks CLI token expired during session, attempting refresh")
                  const tokenEndpoint = `${normalizedHost}/oidc/v1/token`
                  try {
                    const response = await fetch(tokenEndpoint, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                      },
                      body: new URLSearchParams({
                        grant_type: "refresh_token",
                        refresh_token: tokenEntry.refresh_token,
                        client_id: "databricks-cli",
                      }).toString(),
                    })
                    if (response.ok) {
                      const data = (await response.json()) as {
                        access_token: string
                        refresh_token?: string
                        expires_in?: number
                      }
                      log.info("Refreshed Databricks CLI token successfully during session")

                      // Update the token cache with new tokens
                      cache.tokens[normalizedHost] = {
                        ...tokenEntry,
                        access_token: data.access_token,
                        refresh_token: data.refresh_token ?? tokenEntry.refresh_token,
                        expiry: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
                        expires_in: data.expires_in ?? 3600,
                      }
                      await Bun.write(tokenCachePath, JSON.stringify(cache, null, 2))

                      return data.access_token
                    } else {
                      log.debug("Failed to refresh Databricks CLI token during session", {
                        status: response.status,
                        statusText: response.statusText,
                      })
                    }
                  } catch (refreshError) {
                    log.debug("Failed to refresh Databricks CLI token during session", {
                      error: refreshError instanceof Error ? refreshError.message : "Unknown error",
                    })
                  }
                }

                // Token expired and refresh failed or no refresh token available
                log.warn("Databricks CLI token expired. Run `databricks auth login --profile <profile>` to refresh.")
              }
            }
          }
        } catch (e) {
          log.debug("Failed to read Databricks CLI token cache", {
            error: e instanceof Error ? e.message : "Unknown error",
          })
        }

        // Fall back to the token we got at initialization
        return accessToken
      }

      // Define default Databricks Foundation Model API endpoints
      // These are the pay-per-token endpoints available in most workspaces
      // Users can override or add more models in their opencode.json config
      const defaultModels: Record<string, ModelsDev.Model> = {
        // OpenAI GPT Models
        "databricks-gpt-5-2": {
          id: "databricks-gpt-5-2",
          name: "GPT-5.2 (Databricks)",
          family: "gpt-5",
          attachment: true,
          reasoning: true,
          tool_call: true,
          temperature: true,
          release_date: "2025-12-17",
          modalities: { input: ["text", "image"], output: ["text"] },
          cost: { input: 1.25, output: 10, cache_read: 0.125 },
          limit: { context: 400000, output: 128000 },
          options: {},
        },
        "databricks-gpt-5-1": {
          id: "databricks-gpt-5-1",
          name: "GPT-5.1 (Databricks)",
          family: "gpt-5",
          attachment: true,
          reasoning: true,
          tool_call: true,
          temperature: true,
          release_date: "2025-10-10",
          modalities: { input: ["text", "image"], output: ["text"] },
          cost: { input: 1.25, output: 10, cache_read: 0.125 },
          limit: { context: 400000, output: 128000 },
          options: {},
        },
        "databricks-gpt-5-1-codex-max": {
          id: "databricks-gpt-5-1-codex-max",
          name: "GPT-5.1 Codex Max (Databricks)",
          family: "gpt-5-codex",
          attachment: true,
          reasoning: true,
          tool_call: true,
          temperature: true,
          release_date: "2025-10-10",
          modalities: { input: ["text", "image"], output: ["text"] },
          cost: { input: 2.5, output: 20, cache_read: 0.25 },
          limit: { context: 400000, output: 128000 },
          options: {},
        },
        "databricks-gpt-5": {
          id: "databricks-gpt-5",
          name: "GPT-5 (Databricks)",
          family: "gpt-5",
          attachment: true,
          reasoning: true,
          tool_call: true,
          temperature: true,
          release_date: "2025-06-12",
          modalities: { input: ["text", "image"], output: ["text"] },
          cost: { input: 1.25, output: 10, cache_read: 0.125 },
          limit: { context: 400000, output: 128000 },
          options: {},
        },
        "databricks-gpt-5-mini": {
          id: "databricks-gpt-5-mini",
          name: "GPT-5 mini (Databricks)",
          family: "gpt-5-mini",
          attachment: true,
          reasoning: true,
          tool_call: true,
          temperature: true,
          release_date: "2025-06-12",
          modalities: { input: ["text", "image"], output: ["text"] },
          cost: { input: 0.15, output: 0.6, cache_read: 0.015 },
          limit: { context: 400000, output: 128000 },
          options: {},
        },
        "databricks-gpt-5-nano": {
          id: "databricks-gpt-5-nano",
          name: "GPT-5 nano (Databricks)",
          family: "gpt-5-nano",
          attachment: true,
          reasoning: false,
          tool_call: true,
          temperature: true,
          release_date: "2025-06-12",
          modalities: { input: ["text", "image"], output: ["text"] },
          cost: { input: 0.05, output: 0.2, cache_read: 0.005 },
          limit: { context: 400000, output: 128000 },
          options: {},
        },
        "databricks-gpt-5-1-codex-mini": {
          id: "databricks-gpt-5-1-codex-mini",
          name: "GPT-5.1 Codex Mini (Databricks)",
          family: "gpt-5.1-codex",
          attachment: true,
          reasoning: true,
          tool_call: false, // Only supports Responses API, not Chat Completions API
          temperature: true,
          release_date: "2025-09-15",
          modalities: { input: ["text", "image"], output: ["text"] },
          cost: { input: 0.15, output: 0.6, cache_read: 0.015 },
          limit: { context: 400000, output: 128000 },
          options: {},
        },
        "databricks-gpt-oss-120b": {
          id: "databricks-gpt-oss-120b",
          name: "GPT OSS 120B (Databricks)",
          family: "gpt-oss",
          attachment: false,
          reasoning: true,
          tool_call: false, // OSS models don't support full JSON Schema (e.g., maxLength) for tool parameters
          temperature: true,
          release_date: "2025-11-01",
          modalities: { input: ["text"], output: ["text"] },
          cost: { input: 0.5, output: 1.5 },
          limit: { context: 128000, output: 32000 },
          options: {},
        },
        "databricks-gpt-oss-20b": {
          id: "databricks-gpt-oss-20b",
          name: "GPT OSS 20B (Databricks)",
          family: "gpt-oss",
          attachment: false,
          reasoning: true,
          tool_call: false, // OSS models don't support full JSON Schema (e.g., maxLength) for tool parameters
          temperature: true,
          release_date: "2025-11-01",
          modalities: { input: ["text"], output: ["text"] },
          cost: { input: 0.1, output: 0.3 },
          limit: { context: 128000, output: 32000 },
          options: {},
        },
        // Google Gemini Models
        "databricks-gemini-3-pro": {
          id: "databricks-gemini-3-pro",
          name: "Gemini 3 Pro (Databricks)",
          family: "gemini-3",
          attachment: true,
          reasoning: true,
          tool_call: true,
          temperature: true,
          release_date: "2025-11-20",
          modalities: { input: ["text", "image", "audio", "video"], output: ["text"] },
          cost: { input: 2, output: 12, cache_read: 0.2 },
          limit: { context: 1000000, output: 65536 },
          options: {},
        },
        "databricks-gemini-3-flash": {
          id: "databricks-gemini-3-flash",
          name: "Gemini 3 Flash (Databricks)",
          family: "gemini-3",
          attachment: true,
          reasoning: false,
          tool_call: true,
          temperature: true,
          release_date: "2025-11-20",
          modalities: { input: ["text", "image", "audio", "video"], output: ["text"] },
          cost: { input: 0.5, output: 3, cache_read: 0.05 },
          limit: { context: 1000000, output: 65536 },
          options: {},
        },
        "databricks-gemini-2-5-pro": {
          id: "databricks-gemini-2-5-pro",
          name: "Gemini 2.5 Pro (Databricks)",
          family: "gemini-2.5",
          attachment: true,
          reasoning: true,
          tool_call: true,
          temperature: true,
          release_date: "2025-04-10",
          modalities: { input: ["text", "image", "audio", "video"], output: ["text", "audio"] },
          cost: { input: 1.25, output: 10, cache_read: 0.125 },
          limit: { context: 1000000, output: 65536 },
          options: {},
        },
        "databricks-gemini-2-5-flash": {
          id: "databricks-gemini-2-5-flash",
          name: "Gemini 2.5 Flash (Databricks)",
          family: "gemini-2.5",
          attachment: true,
          reasoning: true,
          tool_call: true,
          temperature: true,
          release_date: "2025-04-10",
          modalities: { input: ["text", "image", "audio", "video"], output: ["text"] },
          cost: { input: 0.15, output: 0.6, cache_read: 0.015 },
          limit: { context: 1000000, output: 65536 },
          options: {},
        },
        "databricks-gemma-3-12b": {
          id: "databricks-gemma-3-12b",
          name: "Gemma 3 12B (Databricks)",
          family: "gemma-3",
          attachment: true,
          reasoning: false,
          tool_call: false, // Smaller model with limited tool support
          temperature: true,
          release_date: "2025-11-01",
          modalities: { input: ["text", "image"], output: ["text"] },
          cost: { input: 0.1, output: 0.3 },
          limit: { context: 128000, output: 8192 },
          options: {},
        },
        // Anthropic Claude Models
        "databricks-claude-sonnet-4": {
          id: "databricks-claude-sonnet-4",
          name: "Claude Sonnet 4 (Databricks)",
          family: "claude-sonnet",
          attachment: true,
          reasoning: false,
          tool_call: true,
          temperature: true,
          release_date: "2025-05-22",
          modalities: { input: ["text", "image"], output: ["text"] },
          cost: { input: 3, output: 15, cache_read: 0.3 },
          limit: { context: 200000, output: 64000 },
          options: {},
        },
        "databricks-claude-sonnet-4-5": {
          id: "databricks-claude-sonnet-4-5",
          name: "Claude Sonnet 4.5 (Databricks)",
          family: "claude-sonnet",
          attachment: true,
          reasoning: true,
          tool_call: true,
          temperature: true,
          release_date: "2025-10-22",
          modalities: { input: ["text", "image"], output: ["text"] },
          cost: { input: 3, output: 15, cache_read: 0.3 },
          limit: { context: 200000, output: 64000 },
          options: {},
        },
        "databricks-claude-haiku-4-5": {
          id: "databricks-claude-haiku-4-5",
          name: "Claude Haiku 4.5 (Databricks)",
          family: "claude-haiku",
          attachment: true,
          reasoning: false,
          tool_call: true,
          temperature: true,
          release_date: "2025-10-22",
          modalities: { input: ["text", "image"], output: ["text"] },
          cost: { input: 0.8, output: 4, cache_read: 0.08 },
          limit: { context: 200000, output: 8192 },
          options: {},
        },
        "databricks-claude-opus-4-5": {
          id: "databricks-claude-opus-4-5",
          name: "Claude Opus 4.5 (Databricks)",
          family: "claude-opus",
          attachment: true,
          reasoning: true,
          tool_call: true,
          temperature: true,
          release_date: "2025-10-22",
          modalities: { input: ["text", "image"], output: ["text"] },
          cost: { input: 15, output: 75, cache_read: 1.5 },
          limit: { context: 200000, output: 32000 },
          options: {},
        },
        "databricks-meta-llama-3-3-70b-instruct": {
          id: "databricks-meta-llama-3-3-70b-instruct",
          name: "Meta Llama 3.3 70B Instruct (Databricks)",
          family: "llama-3.3",
          attachment: false,
          reasoning: false,
          tool_call: false, // Llama models have unreliable tool support via OpenAI-compatible API
          temperature: true,
          release_date: "2024-12-06",
          modalities: { input: ["text"], output: ["text"] },
          cost: { input: 0.65, output: 2.56 },
          limit: { context: 128000, output: 4096 },
          options: {},
        },
        "databricks-claude-3-7-sonnet": {
          id: "databricks-claude-3-7-sonnet",
          name: "Claude 3.7 Sonnet (Databricks)",
          family: "claude-sonnet",
          attachment: true,
          reasoning: true,
          tool_call: true,
          temperature: true,
          release_date: "2025-02-24",
          modalities: { input: ["text", "image"], output: ["text"] },
          cost: { input: 3, output: 15, cache_read: 0.3 },
          limit: { context: 200000, output: 64000 },
          options: {},
        },
        "databricks-claude-opus-4-1": {
          id: "databricks-claude-opus-4-1",
          name: "Claude Opus 4.1 (Databricks)",
          family: "claude-opus",
          attachment: true,
          reasoning: true,
          tool_call: true,
          temperature: true,
          release_date: "2025-04-16",
          modalities: { input: ["text", "image"], output: ["text"] },
          cost: { input: 15, output: 75, cache_read: 1.5 },
          limit: { context: 200000, output: 32000 },
          options: {},
        },
        "databricks-llama-4-maverick": {
          id: "databricks-llama-4-maverick",
          name: "Llama 4 Maverick (Databricks)",
          family: "llama-4",
          attachment: false,
          reasoning: false,
          tool_call: false, // Llama models have unreliable tool support via OpenAI-compatible API
          temperature: true,
          release_date: "2025-04-05",
          modalities: { input: ["text"], output: ["text"] },
          cost: { input: 0.2, output: 0.6 },
          limit: { context: 1048576, output: 65536 },
          options: {},
        },
        "databricks-meta-llama-3-1-405b-instruct": {
          id: "databricks-meta-llama-3-1-405b-instruct",
          name: "Meta Llama 3.1 405B Instruct (Databricks)",
          family: "llama-3.1",
          attachment: false,
          reasoning: false,
          tool_call: false, // Llama models have unreliable tool support via OpenAI-compatible API
          temperature: true,
          release_date: "2024-07-23",
          modalities: { input: ["text"], output: ["text"] },
          cost: { input: 3, output: 3 },
          limit: { context: 128000, output: 4096 },
          options: {},
        },
        "databricks-meta-llama-3-1-8b-instruct": {
          id: "databricks-meta-llama-3-1-8b-instruct",
          name: "Meta Llama 3.1 8B Instruct (Databricks)",
          family: "llama-3.1",
          attachment: false,
          reasoning: false,
          tool_call: false, // Llama models have unreliable tool support via OpenAI-compatible API
          temperature: true,
          release_date: "2024-07-23",
          modalities: { input: ["text"], output: ["text"] },
          cost: { input: 0.1, output: 0.1 },
          limit: { context: 128000, output: 4096 },
          options: {},
        },
        // Qwen Models
        "databricks-qwen3-next-80b-a3b-instruct": {
          id: "databricks-qwen3-next-80b-a3b-instruct",
          name: "Qwen3 Next 80B A3B Instruct (Databricks)",
          family: "qwen3",
          attachment: false,
          reasoning: false,
          tool_call: false, // Qwen models have unreliable tool support via OpenAI-compatible API
          temperature: true,
          release_date: "2025-11-01",
          modalities: { input: ["text"], output: ["text"] },
          cost: { input: 0.5, output: 1.5 },
          limit: { context: 512000, output: 32768 },
          options: {},
        },
      }

      // Transform ModelsDev.Model to Provider.Model format
      function toProviderModel(model: ModelsDev.Model): Model {
        return {
          id: model.id,
          providerID: "databricks",
          name: model.name,
          family: model.family,
          api: {
            id: model.id,
            url: baseURL,
            npm: "@ai-sdk/openai-compatible",
          },
          status: "active",
          headers: {},
          options: model.options ?? {},
          cost: {
            input: model.cost?.input ?? 0,
            output: model.cost?.output ?? 0,
            cache: {
              read: model.cost?.cache_read ?? 0,
              write: model.cost?.cache_write ?? 0,
            },
          },
          limit: {
            context: model.limit.context,
            output: model.limit.output,
          },
          capabilities: {
            temperature: model.temperature,
            reasoning: model.reasoning,
            attachment: model.attachment,
            toolcall: model.tool_call,
            input: {
              text: model.modalities?.input?.includes("text") ?? false,
              audio: model.modalities?.input?.includes("audio") ?? false,
              image: model.modalities?.input?.includes("image") ?? false,
              video: model.modalities?.input?.includes("video") ?? false,
              pdf: model.modalities?.input?.includes("pdf") ?? false,
            },
            output: {
              text: model.modalities?.output?.includes("text") ?? false,
              audio: model.modalities?.output?.includes("audio") ?? false,
              image: model.modalities?.output?.includes("image") ?? false,
              video: model.modalities?.output?.includes("video") ?? false,
              pdf: model.modalities?.output?.includes("pdf") ?? false,
            },
            interleaved: false,
          },
          release_date: model.release_date,
          variants: {},
        }
      }

      // Add default models to the input provider if not already defined
      // Only include models that support tool calling since opencode requires it
      for (const [modelID, model] of Object.entries(defaultModels)) {
        if (!input.models[modelID] && model.tool_call) {
          input.models[modelID] = toProviderModel(model)
        }
      }

      // Custom fetch that gets fresh token before each request and fixes empty content
      const databricksFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const freshToken = await getFreshToken()
        const headers = new Headers(init?.headers)
        headers.set("Authorization", `Bearer ${freshToken}`)

        // Fix empty content issue: Databricks API rejects messages with empty string content
        // The AI SDK sends content: "" for assistant messages with only tool calls
        let body = init?.body
        let isGeminiModel = false
        if (body && typeof body === "string") {
          try {
            const parsed = JSON.parse(body)
            // Detect if this is a Gemini model request
            isGeminiModel = parsed.model?.includes("gemini") ?? false

            if (parsed.messages && Array.isArray(parsed.messages)) {
              parsed.messages = parsed.messages.map((msg: any) => {
                // For assistant messages with tool_calls but empty content, set content to null
                if (msg.role === "assistant" && msg.tool_calls && msg.content === "") {
                  return { ...msg, content: null }
                }
                return msg
              })
              body = JSON.stringify(parsed)
            }
          } catch {
            // If parsing fails, use original body
          }
        }

        const response = await fetch(input, { ...init, body, headers })

        // For Gemini models, transform streaming responses
        // Gemini returns content as array [{type:"text", text:"..."}] but AI SDK expects string
        if (isGeminiModel && response.body) {
          const originalBody = response.body
          const transformStream = new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
              const text = new TextDecoder().decode(chunk)
              const lines = text.split("\n")
              const transformedLines = lines.map((line) => {
                if (!line.startsWith("data: ") || line === "data: [DONE]") {
                  return line
                }

                try {
                  const jsonStr = line.slice(6) // Remove "data: " prefix
                  if (!jsonStr.trim()) return line

                  const data = JSON.parse(jsonStr)

                  // Transform choices[].delta.content from array to string
                  if (data.choices && Array.isArray(data.choices)) {
                    for (const choice of data.choices) {
                      if (choice.delta && Array.isArray(choice.delta.content)) {
                        // Extract text from content array
                        const textParts = choice.delta.content
                          .filter((part: any) => part.type === "text" && part.text)
                          .map((part: any) => part.text)
                        choice.delta.content = textParts.join("")
                      }
                    }
                    return "data: " + JSON.stringify(data)
                  }
                } catch {
                  // If parsing fails, return original line
                }
                return line
              })

              controller.enqueue(new TextEncoder().encode(transformedLines.join("\n")))
            },
          })

          const transformedBody = originalBody.pipeThrough(transformStream)
          return new Response(transformedBody, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          })
        }

        return response
      }

      return {
        autoload: true,
        async getModel(sdk: any, modelID: string, _options?: Record<string, any>) {
          return sdk.languageModel(modelID)
        },
        options: {
          baseURL,
          apiKey: accessToken,
          // Disable stream_options to prevent "unknown field" errors with Databricks OSS models
          includeUsage: false,
          headers: {
            "User-Agent": "opencode",
            // Prevent Claude beta headers from breaking Databricks Model Serving
            "x-databricks-disable-beta-headers": "true",
          },
          // Use custom fetch that refreshes token when expired
          fetch: databricksFetch,
        },
      }
    },
  }

  export const Model = z
    .object({
      id: z.string(),
      providerID: z.string(),
      api: z.object({
        id: z.string(),
        url: z.string(),
        npm: z.string(),
      }),
      name: z.string(),
      family: z.string().optional(),
      capabilities: z.object({
        temperature: z.boolean(),
        reasoning: z.boolean(),
        attachment: z.boolean(),
        toolcall: z.boolean(),
        input: z.object({
          text: z.boolean(),
          audio: z.boolean(),
          image: z.boolean(),
          video: z.boolean(),
          pdf: z.boolean(),
        }),
        output: z.object({
          text: z.boolean(),
          audio: z.boolean(),
          image: z.boolean(),
          video: z.boolean(),
          pdf: z.boolean(),
        }),
        interleaved: z.union([
          z.boolean(),
          z.object({
            field: z.enum(["reasoning_content", "reasoning_details"]),
          }),
        ]),
      }),
      cost: z.object({
        input: z.number(),
        output: z.number(),
        cache: z.object({
          read: z.number(),
          write: z.number(),
        }),
        experimentalOver200K: z
          .object({
            input: z.number(),
            output: z.number(),
            cache: z.object({
              read: z.number(),
              write: z.number(),
            }),
          })
          .optional(),
      }),
      limit: z.object({
        context: z.number(),
        input: z.number().optional(),
        output: z.number(),
      }),
      status: z.enum(["alpha", "beta", "deprecated", "active"]),
      options: z.record(z.string(), z.any()),
      headers: z.record(z.string(), z.string()),
      release_date: z.string(),
      variants: z.record(z.string(), z.record(z.string(), z.any())).optional(),
    })
    .meta({
      ref: "Model",
    })
  export type Model = z.infer<typeof Model>

  export const Info = z
    .object({
      id: z.string(),
      name: z.string(),
      source: z.enum(["env", "config", "custom", "api"]),
      env: z.string().array(),
      key: z.string().optional(),
      options: z.record(z.string(), z.any()),
      models: z.record(z.string(), Model),
    })
    .meta({
      ref: "Provider",
    })
  export type Info = z.infer<typeof Info>

  function fromModelsDevModel(provider: ModelsDev.Provider, model: ModelsDev.Model): Model {
    const m: Model = {
      id: model.id,
      providerID: provider.id,
      name: model.name,
      family: model.family,
      api: {
        id: model.id,
        url: provider.api!,
        npm: model.provider?.npm ?? provider.npm ?? "@ai-sdk/openai-compatible",
      },
      status: model.status ?? "active",
      headers: model.headers ?? {},
      options: model.options ?? {},
      cost: {
        input: model.cost?.input ?? 0,
        output: model.cost?.output ?? 0,
        cache: {
          read: model.cost?.cache_read ?? 0,
          write: model.cost?.cache_write ?? 0,
        },
        experimentalOver200K: model.cost?.context_over_200k
          ? {
              cache: {
                read: model.cost.context_over_200k.cache_read ?? 0,
                write: model.cost.context_over_200k.cache_write ?? 0,
              },
              input: model.cost.context_over_200k.input,
              output: model.cost.context_over_200k.output,
            }
          : undefined,
      },
      limit: {
        context: model.limit.context,
        input: model.limit.input,
        output: model.limit.output,
      },
      capabilities: {
        temperature: model.temperature,
        reasoning: model.reasoning,
        attachment: model.attachment,
        toolcall: model.tool_call,
        input: {
          text: model.modalities?.input?.includes("text") ?? false,
          audio: model.modalities?.input?.includes("audio") ?? false,
          image: model.modalities?.input?.includes("image") ?? false,
          video: model.modalities?.input?.includes("video") ?? false,
          pdf: model.modalities?.input?.includes("pdf") ?? false,
        },
        output: {
          text: model.modalities?.output?.includes("text") ?? false,
          audio: model.modalities?.output?.includes("audio") ?? false,
          image: model.modalities?.output?.includes("image") ?? false,
          video: model.modalities?.output?.includes("video") ?? false,
          pdf: model.modalities?.output?.includes("pdf") ?? false,
        },
        interleaved: model.interleaved ?? false,
      },
      release_date: model.release_date,
      variants: {},
    }

    m.variants = mapValues(ProviderTransform.variants(m), (v) => v)

    return m
  }

  export function fromModelsDevProvider(provider: ModelsDev.Provider): Info {
    return {
      id: provider.id,
      source: "custom",
      name: provider.name,
      env: provider.env ?? [],
      options: {},
      models: mapValues(provider.models, (model) => fromModelsDevModel(provider, model)),
    }
  }

  const state = Instance.state(async () => {
    using _ = log.time("state")
    const config = await Config.get()
    const modelsDev = await ModelsDev.get()
    const database = mapValues(modelsDev, fromModelsDevProvider)

    const disabled = new Set(config.disabled_providers ?? [])
    const enabled = config.enabled_providers ? new Set(config.enabled_providers) : null

    function isProviderAllowed(providerID: string): boolean {
      if (enabled && !enabled.has(providerID)) return false
      if (disabled.has(providerID)) return false
      return true
    }

    const providers: { [providerID: string]: Info } = {}
    const languages = new Map<string, LanguageModelV2>()
    const modelLoaders: {
      [providerID: string]: CustomModelLoader
    } = {}
    const sdk = new Map<number, SDK>()

    log.info("init")

    const configProviders = Object.entries(config.provider ?? {})

    // Add GitHub Copilot Enterprise provider that inherits from GitHub Copilot
    if (database["github-copilot"]) {
      const githubCopilot = database["github-copilot"]
      database["github-copilot-enterprise"] = {
        ...githubCopilot,
        id: "github-copilot-enterprise",
        name: "GitHub Copilot Enterprise",
        models: mapValues(githubCopilot.models, (model) => ({
          ...model,
          providerID: "github-copilot-enterprise",
        })),
      }
    }

    // Add Databricks provider for Foundation Model APIs
    // This provider is not in models.dev so we create it programmatically
    if (!database["databricks"]) {
      database["databricks"] = {
        id: "databricks",
        name: "Databricks",
        source: "custom",
        env: ["DATABRICKS_TOKEN"],
        options: {},
        models: {},
      }
    }

    function mergeProvider(providerID: string, provider: Partial<Info>) {
      const existing = providers[providerID]
      if (existing) {
        // @ts-expect-error
        providers[providerID] = mergeDeep(existing, provider)
        return
      }
      const match = database[providerID]
      if (!match) return
      // @ts-expect-error
      providers[providerID] = mergeDeep(match, provider)
    }

    // extend database from config
    for (const [providerID, provider] of configProviders) {
      const existing = database[providerID]
      const parsed: Info = {
        id: providerID,
        name: provider.name ?? existing?.name ?? providerID,
        env: provider.env ?? existing?.env ?? [],
        options: mergeDeep(existing?.options ?? {}, provider.options ?? {}),
        source: "config",
        models: existing?.models ?? {},
      }

      for (const [modelID, model] of Object.entries(provider.models ?? {})) {
        const existingModel = parsed.models[model.id ?? modelID]
        const name = iife(() => {
          if (model.name) return model.name
          if (model.id && model.id !== modelID) return modelID
          return existingModel?.name ?? modelID
        })
        const parsedModel: Model = {
          id: modelID,
          api: {
            id: model.id ?? existingModel?.api.id ?? modelID,
            npm:
              model.provider?.npm ??
              provider.npm ??
              existingModel?.api.npm ??
              modelsDev[providerID]?.npm ??
              "@ai-sdk/openai-compatible",
            url: provider?.api ?? existingModel?.api.url ?? modelsDev[providerID]?.api,
          },
          status: model.status ?? existingModel?.status ?? "active",
          name,
          providerID,
          capabilities: {
            temperature: model.temperature ?? existingModel?.capabilities.temperature ?? false,
            reasoning: model.reasoning ?? existingModel?.capabilities.reasoning ?? false,
            attachment: model.attachment ?? existingModel?.capabilities.attachment ?? false,
            toolcall: model.tool_call ?? existingModel?.capabilities.toolcall ?? true,
            input: {
              text: model.modalities?.input?.includes("text") ?? existingModel?.capabilities.input.text ?? true,
              audio: model.modalities?.input?.includes("audio") ?? existingModel?.capabilities.input.audio ?? false,
              image: model.modalities?.input?.includes("image") ?? existingModel?.capabilities.input.image ?? false,
              video: model.modalities?.input?.includes("video") ?? existingModel?.capabilities.input.video ?? false,
              pdf: model.modalities?.input?.includes("pdf") ?? existingModel?.capabilities.input.pdf ?? false,
            },
            output: {
              text: model.modalities?.output?.includes("text") ?? existingModel?.capabilities.output.text ?? true,
              audio: model.modalities?.output?.includes("audio") ?? existingModel?.capabilities.output.audio ?? false,
              image: model.modalities?.output?.includes("image") ?? existingModel?.capabilities.output.image ?? false,
              video: model.modalities?.output?.includes("video") ?? existingModel?.capabilities.output.video ?? false,
              pdf: model.modalities?.output?.includes("pdf") ?? existingModel?.capabilities.output.pdf ?? false,
            },
            interleaved: model.interleaved ?? false,
          },
          cost: {
            input: model?.cost?.input ?? existingModel?.cost?.input ?? 0,
            output: model?.cost?.output ?? existingModel?.cost?.output ?? 0,
            cache: {
              read: model?.cost?.cache_read ?? existingModel?.cost?.cache.read ?? 0,
              write: model?.cost?.cache_write ?? existingModel?.cost?.cache.write ?? 0,
            },
          },
          options: mergeDeep(existingModel?.options ?? {}, model.options ?? {}),
          limit: {
            context: model.limit?.context ?? existingModel?.limit?.context ?? 0,
            output: model.limit?.output ?? existingModel?.limit?.output ?? 0,
          },
          headers: mergeDeep(existingModel?.headers ?? {}, model.headers ?? {}),
          family: model.family ?? existingModel?.family ?? "",
          release_date: model.release_date ?? existingModel?.release_date ?? "",
          variants: {},
        }
        const merged = mergeDeep(ProviderTransform.variants(parsedModel), model.variants ?? {})
        parsedModel.variants = mapValues(
          pickBy(merged, (v) => !v.disabled),
          (v) => omit(v, ["disabled"]),
        )
        parsed.models[modelID] = parsedModel
      }
      database[providerID] = parsed
    }

    // load env
    const env = Env.all()
    for (const [providerID, provider] of Object.entries(database)) {
      if (disabled.has(providerID)) continue
      const apiKey = provider.env.map((item) => env[item]).find(Boolean)
      if (!apiKey) continue
      mergeProvider(providerID, {
        source: "env",
        key: provider.env.length === 1 ? apiKey : undefined,
      })
    }

    // load apikeys
    for (const [providerID, provider] of Object.entries(await Auth.all())) {
      if (disabled.has(providerID)) continue
      if (provider.type === "api") {
        mergeProvider(providerID, {
          source: "api",
          key: provider.key,
        })
      }
    }

    for (const plugin of await Plugin.list()) {
      if (!plugin.auth) continue
      const providerID = plugin.auth.provider
      if (disabled.has(providerID)) continue

      // For github-copilot plugin, check if auth exists for either github-copilot or github-copilot-enterprise
      let hasAuth = false
      const auth = await Auth.get(providerID)
      if (auth) hasAuth = true

      // Special handling for github-copilot: also check for enterprise auth
      if (providerID === "github-copilot" && !hasAuth) {
        const enterpriseAuth = await Auth.get("github-copilot-enterprise")
        if (enterpriseAuth) hasAuth = true
      }

      if (!hasAuth) continue
      if (!plugin.auth.loader) continue

      // Load for the main provider if auth exists
      if (auth) {
        const options = await plugin.auth.loader(() => Auth.get(providerID) as any, database[plugin.auth.provider])
        const opts = options ?? {}
        const patch: Partial<Info> = providers[providerID] ? { options: opts } : { source: "custom", options: opts }
        mergeProvider(providerID, patch)
      }

      // If this is github-copilot plugin, also register for github-copilot-enterprise if auth exists
      if (providerID === "github-copilot") {
        const enterpriseProviderID = "github-copilot-enterprise"
        if (!disabled.has(enterpriseProviderID)) {
          const enterpriseAuth = await Auth.get(enterpriseProviderID)
          if (enterpriseAuth) {
            const enterpriseOptions = await plugin.auth.loader(
              () => Auth.get(enterpriseProviderID) as any,
              database[enterpriseProviderID],
            )
            const opts = enterpriseOptions ?? {}
            const patch: Partial<Info> = providers[enterpriseProviderID]
              ? { options: opts }
              : { source: "custom", options: opts }
            mergeProvider(enterpriseProviderID, patch)
          }
        }
      }
    }

    for (const [providerID, fn] of Object.entries(CUSTOM_LOADERS)) {
      if (disabled.has(providerID)) continue
      const data = database[providerID]
      if (!data) {
        log.error("Provider does not exist in model list " + providerID)
        continue
      }
      const result = await fn(data)
      if (result && (result.autoload || providers[providerID])) {
        if (result.getModel) modelLoaders[providerID] = result.getModel
        const opts = result.options ?? {}
        const patch: Partial<Info> = providers[providerID] ? { options: opts } : { source: "custom", options: opts }
        mergeProvider(providerID, patch)
      }
    }

    // load config
    for (const [providerID, provider] of configProviders) {
      const partial: Partial<Info> = { source: "config" }
      if (provider.env) partial.env = provider.env
      if (provider.name) partial.name = provider.name
      if (provider.options) partial.options = provider.options
      mergeProvider(providerID, partial)
    }

    for (const [providerID, provider] of Object.entries(providers)) {
      if (!isProviderAllowed(providerID)) {
        delete providers[providerID]
        continue
      }

      const configProvider = config.provider?.[providerID]

      for (const [modelID, model] of Object.entries(provider.models)) {
        model.api.id = model.api.id ?? model.id ?? modelID
        if (modelID === "gpt-5-chat-latest" || (providerID === "openrouter" && modelID === "openai/gpt-5-chat"))
          delete provider.models[modelID]
        if (model.status === "alpha" && !Flag.OPENCODE_ENABLE_EXPERIMENTAL_MODELS) delete provider.models[modelID]
        if (model.status === "deprecated") delete provider.models[modelID]
        if (
          (configProvider?.blacklist && configProvider.blacklist.includes(modelID)) ||
          (configProvider?.whitelist && !configProvider.whitelist.includes(modelID))
        )
          delete provider.models[modelID]

        model.variants = mapValues(ProviderTransform.variants(model), (v) => v)

        // Filter out disabled variants from config
        const configVariants = configProvider?.models?.[modelID]?.variants
        if (configVariants && model.variants) {
          const merged = mergeDeep(model.variants, configVariants)
          model.variants = mapValues(
            pickBy(merged, (v) => !v.disabled),
            (v) => omit(v, ["disabled"]),
          )
        }
      }

      if (Object.keys(provider.models).length === 0) {
        delete providers[providerID]
        continue
      }

      log.info("found", { providerID })
    }

    return {
      models: languages,
      providers,
      sdk,
      modelLoaders,
    }
  })

  export async function list() {
    return state().then((state) => state.providers)
  }

  async function getSDK(model: Model) {
    try {
      using _ = log.time("getSDK", {
        providerID: model.providerID,
      })
      const s = await state()
      const provider = s.providers[model.providerID]
      const options = { ...provider.options }

      if (model.api.npm.includes("@ai-sdk/openai-compatible") && options["includeUsage"] !== false) {
        options["includeUsage"] = true
      }

      if (!options["baseURL"]) options["baseURL"] = model.api.url
      if (options["apiKey"] === undefined && provider.key) options["apiKey"] = provider.key
      if (model.headers)
        options["headers"] = {
          ...options["headers"],
          ...model.headers,
        }

      const key = Bun.hash.xxHash32(JSON.stringify({ providerID: model.providerID, npm: model.api.npm, options }))
      const existing = s.sdk.get(key)
      if (existing) return existing

      const customFetch = options["fetch"]

      options["fetch"] = async (input: any, init?: BunFetchRequestInit) => {
        // Preserve custom fetch if it exists, wrap it with timeout logic
        const fetchFn = customFetch ?? fetch
        const opts = init ?? {}

        if (options["timeout"] !== undefined && options["timeout"] !== null) {
          const signals: AbortSignal[] = []
          if (opts.signal) signals.push(opts.signal)
          if (options["timeout"] !== false) signals.push(AbortSignal.timeout(options["timeout"]))

          const combined = signals.length > 1 ? AbortSignal.any(signals) : signals[0]

          opts.signal = combined
        }

        // Strip openai itemId metadata following what codex does
        // Codex uses #[serde(skip_serializing)] on id fields for all item types:
        // Message, Reasoning, FunctionCall, LocalShellCall, CustomToolCall, WebSearchCall
        // IDs are only re-attached for Azure with store=true
        if (model.api.npm === "@ai-sdk/openai" && opts.body && opts.method === "POST") {
          const body = JSON.parse(opts.body as string)
          const isAzure = model.providerID.includes("azure")
          const keepIds = isAzure && body.store === true
          if (!keepIds && Array.isArray(body.input)) {
            for (const item of body.input) {
              if ("id" in item) {
                delete item.id
              }
            }
            opts.body = JSON.stringify(body)
          }
        }

        return fetchFn(input, {
          ...opts,
          // @ts-ignore see here: https://github.com/oven-sh/bun/issues/16682
          timeout: false,
        })
      }

      const bundledFn = BUNDLED_PROVIDERS[model.api.npm]
      if (bundledFn) {
        log.info("using bundled provider", { providerID: model.providerID, pkg: model.api.npm })
        const loaded = bundledFn({
          name: model.providerID,
          ...options,
        })
        s.sdk.set(key, loaded)
        return loaded as SDK
      }

      let installedPath: string
      if (!model.api.npm.startsWith("file://")) {
        installedPath = await BunProc.install(model.api.npm, "latest")
      } else {
        log.info("loading local provider", { pkg: model.api.npm })
        installedPath = model.api.npm
      }

      const mod = await import(installedPath)

      const fn = mod[Object.keys(mod).find((key) => key.startsWith("create"))!]
      const loaded = fn({
        name: model.providerID,
        ...options,
      })
      s.sdk.set(key, loaded)
      return loaded as SDK
    } catch (e) {
      throw new InitError({ providerID: model.providerID }, { cause: e })
    }
  }

  export async function getProvider(providerID: string) {
    return state().then((s) => s.providers[providerID])
  }

  export async function getModel(providerID: string, modelID: string) {
    const s = await state()
    const provider = s.providers[providerID]
    if (!provider) {
      const availableProviders = Object.keys(s.providers)
      const matches = fuzzysort.go(providerID, availableProviders, { limit: 3, threshold: -10000 })
      const suggestions = matches.map((m) => m.target)
      throw new ModelNotFoundError({ providerID, modelID, suggestions })
    }

    const info = provider.models[modelID]
    if (!info) {
      const availableModels = Object.keys(provider.models)
      const matches = fuzzysort.go(modelID, availableModels, { limit: 3, threshold: -10000 })
      const suggestions = matches.map((m) => m.target)
      throw new ModelNotFoundError({ providerID, modelID, suggestions })
    }
    return info
  }

  export async function getLanguage(model: Model): Promise<LanguageModelV2> {
    const s = await state()
    const key = `${model.providerID}/${model.id}`
    if (s.models.has(key)) return s.models.get(key)!

    const provider = s.providers[model.providerID]
    const sdk = await getSDK(model)

    try {
      const language = s.modelLoaders[model.providerID]
        ? await s.modelLoaders[model.providerID](sdk, model.api.id, provider.options)
        : sdk.languageModel(model.api.id)
      s.models.set(key, language)
      return language
    } catch (e) {
      if (e instanceof NoSuchModelError)
        throw new ModelNotFoundError(
          {
            modelID: model.id,
            providerID: model.providerID,
          },
          { cause: e },
        )
      throw e
    }
  }

  export async function closest(providerID: string, query: string[]) {
    const s = await state()
    const provider = s.providers[providerID]
    if (!provider) return undefined
    for (const item of query) {
      for (const modelID of Object.keys(provider.models)) {
        if (modelID.includes(item))
          return {
            providerID,
            modelID,
          }
      }
    }
  }

  export async function getSmallModel(providerID: string) {
    const cfg = await Config.get()

    if (cfg.small_model) {
      const parsed = parseModel(cfg.small_model)
      return getModel(parsed.providerID, parsed.modelID)
    }

    const provider = await state().then((state) => state.providers[providerID])
    if (provider) {
      let priority = [
        "claude-haiku-4-5",
        "claude-haiku-4.5",
        "3-5-haiku",
        "3.5-haiku",
        "gemini-3-flash",
        "gemini-2.5-flash",
        "gpt-5-nano",
      ]
      if (providerID.startsWith("opencode")) {
        priority = ["gpt-5-nano"]
      }
      if (providerID.startsWith("github-copilot")) {
        // prioritize free models for github copilot
        priority = ["gpt-5-mini", "claude-haiku-4.5", ...priority]
      }
      for (const item of priority) {
        for (const model of Object.keys(provider.models)) {
          if (model.includes(item)) return getModel(providerID, model)
        }
      }
    }

    // Check if opencode provider is available before using it
    const opencodeProvider = await state().then((state) => state.providers["opencode"])
    if (opencodeProvider && opencodeProvider.models["gpt-5-nano"]) {
      return getModel("opencode", "gpt-5-nano")
    }

    return undefined
  }

  const priority = ["gpt-5", "claude-sonnet-4", "big-pickle", "gemini-3-pro"]
  export function sort(models: Model[]) {
    return sortBy(
      models,
      [(model) => priority.findIndex((filter) => model.id.includes(filter)), "desc"],
      [(model) => (model.id.includes("latest") ? 0 : 1), "asc"],
      [(model) => model.id, "desc"],
    )
  }

  export async function defaultModel() {
    const cfg = await Config.get()
    if (cfg.model) return parseModel(cfg.model)

    const provider = await list()
      .then((val) => Object.values(val))
      .then((x) => x.find((p) => !cfg.provider || Object.keys(cfg.provider).includes(p.id)))
    if (!provider) throw new Error("no providers found")
    const [model] = sort(Object.values(provider.models))
    if (!model) throw new Error("no models found")
    return {
      providerID: provider.id,
      modelID: model.id,
    }
  }

  export function parseModel(model: string) {
    const [providerID, ...rest] = model.split("/")
    return {
      providerID: providerID,
      modelID: rest.join("/"),
    }
  }

  export const ModelNotFoundError = NamedError.create(
    "ProviderModelNotFoundError",
    z.object({
      providerID: z.string(),
      modelID: z.string(),
      suggestions: z.array(z.string()).optional(),
    }),
  )

  export const InitError = NamedError.create(
    "ProviderInitError",
    z.object({
      providerID: z.string(),
    }),
  )
}
