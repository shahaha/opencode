// packages/opencode/src/server/routes/a2a-ws.ts
// WebSocket support for A2A delegation streaming

import { Hono } from "hono"
import { upgradeWebSocket } from "hono/bun"
import { Log } from "../../util/log"

const log = Log.create({ service: "a2a-ws" })

// WebSocket connections for delegation updates
const delegationSubscriptions = new Map<string, Set<WebSocket>>()

const A2AWSRoutes = new Hono()

// CORS headers for WebSocket connections
A2AWSRoutes.use("/*", async (c, next) => {
  c.header("Access-Control-Allow-Origin", "*")
  c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  c.header("Access-Control-Allow-Headers", "Content-Type, Authorization")
  if (c.req.method === "OPTIONS") {
    return c.text("OK", 200)
  }
  await next()
})

// WebSocket handler for delegation updates
A2AWSRoutes.get(
  "/ws",
  upgradeWebSocket((c) => {
    const delegationId = c.req.query("delegationId")
    if (!delegationId) {
      return {
        onOpen(_event, ws) {
          ws.send(JSON.stringify({ error: "delegationId required" }))
          ws.close()
        },
      }
    }

    return {
      onOpen(_event, ws) {
        // Subscribe to delegation updates
        if (!delegationSubscriptions.has(delegationId)) {
          delegationSubscriptions.set(delegationId, new Set())
        }
        delegationSubscriptions.get(delegationId)!.add(ws.raw)

        log.info("Client subscribed to delegation updates", { delegationId })

        // Send initial connection success message
        ws.raw.send(
          JSON.stringify({
            type: "connected",
            delegationId,
            message: "Subscribed to delegation updates",
          }),
        )
      },
      onClose(_event, ws) {
        const subs = delegationSubscriptions.get(delegationId)
        if (subs) {
          subs.delete(ws.raw)
          if (subs.size === 0) {
            delegationSubscriptions.delete(delegationId)
          }
        }
        log.info("Client unsubscribed from delegation updates", { delegationId })
      },
      onMessage(event, ws) {
        // Handle incoming messages (currently just log them)
        log.debug("WebSocket message received", { delegationId, message: event.data })
      },
    }
  }),
)

// Function to broadcast delegation updates
export function broadcastDelegationUpdate(delegationId: string, update: any): void {
  const subs = delegationSubscriptions.get(delegationId)
  if (subs) {
    const message = JSON.stringify({
      type: "delegation_update",
      delegationId,
      ...update,
    })
    for (const ws of subs) {
      try {
        ws.send(message)
      } catch (error) {
        log.error("Failed to send WebSocket message", { delegationId, error })
      }
    }
    log.debug("Broadcasted delegation update", { delegationId, subscribers: subs.size })
  }
}

export { A2AWSRoutes as a2aWsRoutes }
