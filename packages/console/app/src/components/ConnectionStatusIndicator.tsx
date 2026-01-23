// ConnectionStatusIndicator.tsx
import { createSignal, onMount, onCleanup } from "solid-js"

interface ConnectionStatusIndicatorProps {
  status: "connecting" | "connected" | "disconnected" | "reconnecting"
  reconnectAttempts?: number
  maxReconnectAttempts?: number
  metrics?: {
    lastConnected: number
    totalReconnects: number
    connectionUptime: number
  }
}

export default function ConnectionStatusIndicator(props: ConnectionStatusIndicatorProps) {
  const [currentTime, setCurrentTime] = createSignal(Date.now())

  // Update time every second for uptime display
  onMount(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)

    onCleanup(() => clearInterval(interval))
  })

  const getStatusIcon = () => {
    switch (props.status) {
      case "connected":
        return "🟢"
      case "connecting":
        return "🟡"
      case "reconnecting":
        return "🟠"
      case "disconnected":
        return "🔴"
      default:
        return "⚪"
    }
  }

  const getStatusText = () => {
    switch (props.status) {
      case "connected":
        return "已連接"
      case "connecting":
        return "連接中..."
      case "reconnecting":
        return `重連中... (${props.reconnectAttempts}/${props.maxReconnectAttempts})`
      case "disconnected":
        return "未連接"
      default:
        return "未知狀態"
    }
  }

  const getStatusColor = () => {
    switch (props.status) {
      case "connected":
        return "text-green-600 dark:text-green-400"
      case "connecting":
        return "text-yellow-600 dark:text-yellow-400"
      case "reconnecting":
        return "text-orange-600 dark:text-orange-400"
      case "disconnected":
        return "text-red-600 dark:text-red-400"
      default:
        return "text-gray-600 dark:text-gray-400"
    }
  }

  const formatUptime = (uptimeMs: number) => {
    const seconds = Math.floor(uptimeMs / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  }

  return (
    <div
      class={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm font-medium transition-colors ${getStatusColor()}`}
    >
      <span class="text-lg">{getStatusIcon()}</span>
      <span>{getStatusText()}</span>

      {props.status === "connected" && props.metrics && (
        <span class="text-xs opacity-75 ml-2">運行時間: {formatUptime(props.metrics.connectionUptime)}</span>
      )}

      {props.metrics && props.metrics.totalReconnects > 0 && (
        <span class="text-xs opacity-60 ml-2">重連: {props.metrics.totalReconnects}次</span>
      )}
    </div>
  )
}
