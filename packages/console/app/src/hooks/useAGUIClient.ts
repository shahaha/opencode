// packages/console/src/hooks/useAGUIClient.ts
import { createSignal, createEffect, onMount, onCleanup } from "solid-js"
import { AGUIClient } from "../lib/ag-ui/client"
import type { AGUIConfig, ConnectionStatus } from "../lib/ag-ui/types"

export function useAGUIClient(config: () => AGUIConfig) {
  const [client, setClient] = createSignal<AGUIClient | null>(null)
  const [isConnecting, setIsConnecting] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const connectionStatus = (): ConnectionStatus => {
    const c = client()
    return c ? c.connectionStatus() : "disconnected"
  }

  const connect = async () => {
    if (isConnecting()) return

    setIsConnecting(true)
    setError(null)

    try {
      const newClient = new AGUIClient(config())
      await newClient.connect()
      setClient(newClient)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed")
    } finally {
      setIsConnecting(false)
    }
  }

  const disconnect = () => {
    const c = client()
    if (c) {
      c.disconnect()
      setClient(null)
    }
  }

  // Auto-connect when config changes
  createEffect(() => {
    const currentConfig = config()
    if (currentConfig && !client() && !isConnecting()) {
      connect()
    }
  })

  // Cleanup on unmount
  onCleanup(() => {
    disconnect()
  })

  return {
    client,
    connectionStatus,
    isConnecting,
    error,
    connect,
    disconnect,
    isConnected: () => connectionStatus() === "connected",
  }
}
