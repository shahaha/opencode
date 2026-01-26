// packages/console/app/src/lib/ag-ui/event-batcher.ts
import type { AGUIEvent } from "./types"

export class EventBatcher {
  private queue: AGUIEvent[] = []
  private timeoutId: ReturnType<typeof setTimeout> | null = null
  private batchSize: number
  private batchDelay: number

  constructor(
    private onBatch: (events: AGUIEvent[]) => void,
    options?: {
      batchSize?: number
      batchDelay?: number
    },
  ) {
    this.batchSize = options?.batchSize ?? 10
    this.batchDelay = options?.batchDelay ?? 50
  }

  addEvent(event: AGUIEvent): void {
    this.queue.push(event)

    if (this.queue.length >= this.batchSize) {
      this.flush()
    } else if (!this.timeoutId) {
      this.timeoutId = setTimeout(() => this.flush(), this.batchDelay)
    }
  }

  flush(): void {
    if (this.queue.length === 0) return

    const batch = [...this.queue]
    this.queue = []

    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }

    this.onBatch(batch)
  }

  clear(): void {
    this.queue = []
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }
  }

  getQueueSize(): number {
    return this.queue.length
  }

  destroy(): void {
    this.clear()
  }
}
