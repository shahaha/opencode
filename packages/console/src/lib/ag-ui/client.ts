// packages/console/src/lib/ag-ui/client.ts
import { createSignal } from "solid-js"
import type { AGUIConfig, AGUIEvent, ConnectionStatus } from "./types"
import { createAGUIConfig, validateAGUIConfig } from "./config"

export class AGUIClient {
  private ws: WebSocket | null = null
  private eventTarget = new EventTarget()
  private config: AGUIConfig
  private reconnectAttempts = 0
  private maxReconnectAttempts: number
  private reconnectDelay: number
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null

  private _connectionStatusSignal = createSignal<ConnectionStatus>("disconnected")

  get connectionStatus() {
    return this._connectionStatusSignal[0]
  }

  constructor(config: Partial<AGUIConfig>) {
    this.config = createAGUIConfig(config)

    if (!validateAGUIConfig(this.config)) {
      throw new Error("Invalid AG-UI configuration")
    }

    this.maxReconnectAttempts = this.config.reconnectAttempts || 5
    this.reconnectDelay = this.config.reconnectDelay || 1000
  }

  async connect(): Promise<void> {
    if (this._connectionStatusSignal[0]() === "connecting") {
      return
    }

    this._connectionStatusSignal[1]("connecting")

    try {
      await this.establishConnection()
      this._connectionStatusSignal[1]("connected")
      this.reconnectAttempts = 0
    } catch (error) {
      this._connectionStatusSignal[1]("error")
      throw error
    }
  }

  private async establishConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = this.buildWebSocketUrl()

      this.ws = new WebSocket(url)

      this.ws.onopen = () => {
        this.sendAuthentication()
        resolve()
      }

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data.toString())
          this.handleMessage(message)
        } catch (error) {
          console.error("Failed to parse AG-UI message:", error)
        }
      }

      this.ws.onclose = () => {
        this._connectionStatusSignal[1]("disconnected")
        this.handleReconnection()
      }

      this.ws.onerror = (error) => {
        console.error("WebSocket error:", error)
        reject(error)
      }
    })
  }

  private buildWebSocketUrl(): string {
    const baseUrl = this.config.serverUrl.replace(/^http/, "ws")
    return `${baseUrl}/api/ag-ui/ws?sessionId=${this.config.sessionId}`
  }

  private sendAuthentication(): void {
    if (!this.ws) return

    this.send({
      jsonrpc: "2.0",
      method: "authenticate",
      params: {
        token: this.config.authToken,
        sessionId: this.config.sessionId,
      },
      id: Date.now(),
    })
  }

  private handleMessage(message: any): void {
    if (message.method) {
      // Handle server-sent events
      this.eventTarget.dispatchEvent(
        new CustomEvent(message.method, {
          detail: message.params,
        }),
      )
    } else if (message.id) {
      // Handle responses to our requests
      this.eventTarget.dispatchEvent(
        new CustomEvent("response", {
          detail: message,
        }),
      )
    }
  }

  private handleReconnection(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)

      this.reconnectTimeoutId = setTimeout(() => {
        this.connect().catch(() => {
          // Reconnection failed, will retry in next attempt
        })
      }, delay)
    } else {
      this.eventTarget.dispatchEvent(new CustomEvent("maxReconnectAttemptsReached"))
    }
  }

  send(message: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    } else {
      console.warn("WebSocket is not connected, message not sent:", message)
    }
  }

  on(event: string, handler: (data: any) => void): void {
    this.eventTarget.addEventListener(event, (e: any) => {
      handler(e.detail)
    })
  }

  disconnect(): void {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId)
      this.reconnectTimeoutId = null
    }

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this._connectionStatusSignal[1]("disconnected")
  }

  isConnected(): boolean {
    return this._connectionStatusSignal[0]() === "connected"
  }
}
