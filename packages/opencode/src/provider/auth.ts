import { Instance } from "@/project/instance"
import { Plugin } from "../plugin"
import { map, filter, pipe, fromEntries, mapValues } from "remeda"
import z from "zod"
import { fn } from "@/util/fn"
import type { AuthOuathResult, Hooks } from "@opencode-ai/plugin"
import { NamedError } from "@opencode-ai/util/error"
import { Auth } from "@/auth"

export namespace ProviderAuth {
  const state = Instance.state(async () => {
    const methods = pipe(
      await Plugin.list(),
      filter((x) => x.auth?.provider !== undefined),
      map((x) => [x.auth!.provider, x.auth!] as const),
      fromEntries(),
    )
    return { methods, pending: {} as Record<string, AuthOuathResult> }
  })

  export const MethodPromptOption = z
    .object({
      label: z.string(),
      value: z.string(),
      hint: z.string().optional(),
    })
    .meta({
      ref: "ProviderAuthMethodPromptOption",
    })
  export type MethodPromptOption = z.infer<typeof MethodPromptOption>

  export const MethodPrompt = z
    .object({
      type: z.union([z.literal("select"), z.literal("text")]),
      key: z.string(),
      message: z.string(),
      placeholder: z.string().optional(),
      options: MethodPromptOption.array().optional(),
      conditional: z.string().optional(), // Serialized condition: "key:value"
    })
    .meta({
      ref: "ProviderAuthMethodPrompt",
    })
  export type MethodPrompt = z.infer<typeof MethodPrompt>

  export const Method = z
    .object({
      type: z.union([z.literal("oauth"), z.literal("api")]),
      label: z.string(),
      prompts: MethodPrompt.array().optional(),
    })
    .meta({
      ref: "ProviderAuthMethod",
    })
  export type Method = z.infer<typeof Method>

  function serializeCondition(condition: unknown): string | undefined {
    if (typeof condition === "string") return condition
    if (typeof condition !== "function") return undefined
    const source = condition.toString()
    const match = source.match(/inputs\.(\w+)\s*===?\s*["'`]([^"'`]+)["'`]/)

    if (!match) {
      console.warn(`[ProviderAuth] Failed to serialize condition: ${source.slice(0, 100)}`)
      return undefined
    }

    return `${match[1]}:${match[2]}`
  }

  export async function methods() {
    const s = await state().then((x) => x.methods)
    return mapValues(s, (x) =>
      x.methods.map(
        (y): Method => ({
          type: y.type,
          label: y.label,
          prompts: y.prompts?.map(
            (p: {
              type: string
              key: string
              message: string
              placeholder?: string
              options?: MethodPromptOption[]
              condition?: unknown
            }): MethodPrompt => ({
              type: p.type as "select" | "text",
              key: p.key,
              message: p.message,
              placeholder: p.placeholder,
              options: p.options,
              conditional: serializeCondition(p.condition),
            }),
          ),
        }),
      ),
    )
  }

  export const Authorization = z
    .object({
      url: z.string(),
      method: z.union([z.literal("auto"), z.literal("code")]),
      instructions: z.string(),
    })
    .meta({
      ref: "ProviderAuthAuthorization",
    })
  export type Authorization = z.infer<typeof Authorization>

  export const authorize = fn(
    z.object({
      providerID: z.string(),
      method: z.number(),
      inputs: z.record(z.string(), z.string()).optional(),
    }),
    async (input): Promise<Authorization | undefined> => {
      const auth = await state().then((s) => s.methods[input.providerID])
      const method = auth.methods[input.method]
      if (method.type === "oauth") {
        const result = await method.authorize(input.inputs ?? {})
        await state().then((s) => (s.pending[input.providerID] = result))
        return {
          url: result.url,
          method: result.method,
          instructions: result.instructions,
        }
      }
    },
  )

  export const callback = fn(
    z.object({
      providerID: z.string(),
      method: z.number(),
      code: z.string().optional(),
    }),
    async (input) => {
      const match = await state().then((s) => s.pending[input.providerID])
      if (!match) throw new OauthMissing({ providerID: input.providerID })
      let result

      if (match.method === "code") {
        if (!input.code) throw new OauthCodeMissing({ providerID: input.providerID })
        result = await match.callback(input.code)
      }

      if (match.method === "auto") {
        result = await match.callback()
      }

      if (result?.type === "success") {
        const saveProvider = result.provider ?? input.providerID

        if ("key" in result) {
          await Auth.set(saveProvider, {
            type: "api",
            key: result.key,
          })
        }
        if ("refresh" in result) {
          const info: Auth.Info = {
            type: "oauth",
            access: result.access,
            refresh: result.refresh,
            expires: result.expires,
          }
          if (result.accountId) {
            info.accountId = result.accountId
          }
          await Auth.set(saveProvider, info)
        }
        return { provider: saveProvider }
      }

      throw new OauthCallbackFailed({ providerID: input.providerID })
    },
  )

  export const api = fn(
    z.object({
      providerID: z.string(),
      key: z.string(),
    }),
    async (input) => {
      await Auth.set(input.providerID, {
        type: "api",
        key: input.key,
      })
    },
  )

  export const OauthMissing = NamedError.create(
    "ProviderAuthOauthMissing",
    z.object({
      providerID: z.string(),
    }),
  )
  export const OauthCodeMissing = NamedError.create(
    "ProviderAuthOauthCodeMissing",
    z.object({
      providerID: z.string(),
    }),
  )

  export const OauthCallbackFailed = NamedError.create(
    "ProviderAuthOauthCallbackFailed",
    z.object({
      providerID: z.string(),
    }),
  )
}
