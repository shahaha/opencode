import { createMemo, createResource, onCleanup, type Accessor } from "solid-js"
import { isUsageProvider } from "@/usage/registry"
import { useLocal } from "@tui/context/local"
import { useSDK } from "@tui/context/sdk"
import { useSync } from "@tui/context/sync"
import type { UsageResult } from "./usage-data"

type UsageScope = "current" | "all"

type UsageResource = {
  data: Accessor<UsageResult | undefined>
  refetch: () => void
  scope: () => UsageScope
  provider: () => string | null
}

export async function fetchUsage(
  sdk: ReturnType<typeof useSDK>,
  params: { provider?: string; refresh?: boolean },
): Promise<UsageResult> {
  const response = await sdk.client.usage.get(params)
  return {
    entries: (response.data?.entries ?? []) as UsageResult["entries"],
    errors: response.data?.errors ?? [],
    error: response.data?.error,
  }
}

export function resolveUsageProvider(options: {
  scope: UsageScope
  providerOverride?: string | null
  modelProviderID?: string | null
}): string | null {
  if (options.providerOverride) return options.providerOverride
  if (options.scope !== "current") return null
  if (!options.modelProviderID) return null
  if (!isUsageProvider(options.modelProviderID)) return null
  return options.modelProviderID
}

export function useUsageResource(): UsageResource {
  const sync = useSync()
  const local = useLocal()
  const sdk = useSDK()

  const scope = createMemo<UsageScope>(() => sync.data.config.tui?.show_usage_scope ?? "current")
  const provider = createMemo(() =>
    resolveUsageProvider({
      scope: scope(),
      modelProviderID: local.model.current()?.providerID ?? null,
    }),
  )

  const [data, { refetch }] = createResource(
    () => ({ scope: scope(), provider: provider() }),
    async ({ scope, provider }) => {
      if (scope === "current" && !provider) {
        return { entries: [], errors: [] }
      }
      return fetchUsage(sdk, { provider: provider ?? undefined, refresh: false })
    },
    { initialValue: { entries: [], errors: [] } },
  )

  const unsubscribe = sdk.event.on("usage.updated", (evt) => {
    const currentScope = scope()
    const currentProvider = provider()
    if (currentScope === "current" && currentProvider && evt.properties.provider !== currentProvider) return
    refetch()
  })
  onCleanup(() => unsubscribe())

  return {
    data,
    refetch,
    scope,
    provider,
  }
}
