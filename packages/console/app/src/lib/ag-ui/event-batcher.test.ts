// packages/console/app/src/lib/ag-ui/event-batcher.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { EventBatcher } from "./event-batcher"
import type { AGUIEvent } from "./types"

describe("EventBatcher", () => {
  let batcher: EventBatcher
  let mockOnBatch: (events: AGUIEvent[]) => void
  let mockEvents: AGUIEvent[]

  beforeEach(() => {
    mockOnBatch = vi.fn()
    mockEvents = []
    batcher = new EventBatcher(mockOnBatch, { batchSize: 3, batchDelay: 100 })
  })

  afterEach(() => {
    batcher.destroy()
    vi.restoreAllMocks()
  })

  it("should batch events until batch size is reached", () => {
    const event1: AGUIEvent = { id: "1", type: "test", timestamp: Date.now(), data: {} }
    const event2: AGUIEvent = { id: "2", type: "test", timestamp: Date.now(), data: {} }
    const event3: AGUIEvent = { id: "3", type: "test", timestamp: Date.now(), data: {} }

    batcher.addEvent(event1)
    batcher.addEvent(event2)
    batcher.addEvent(event3)

    expect(mockOnBatch).toHaveBeenCalledWith([event1, event2, event3])
  })

  it("should batch events after delay", async () => {
    const event: AGUIEvent = { id: "1", type: "test", timestamp: Date.now(), data: {} }

    batcher.addEvent(event)

    // Wait for delay
    await new Promise((resolve) => setTimeout(resolve, 150))

    expect(mockOnBatch).toHaveBeenCalledWith([event])
  })

  it("should not batch if destroyed", () => {
    const event: AGUIEvent = { id: "1", type: "test", timestamp: Date.now(), data: {} }

    batcher.destroy()
    batcher.addEvent(event)

    expect(mockOnBatch).not.toHaveBeenCalled()
  })

  it("should flush remaining events on destroy", () => {
    const event1: AGUIEvent = { id: "1", type: "test", timestamp: Date.now(), data: {} }
    const event2: AGUIEvent = { id: "2", type: "test", timestamp: Date.now(), data: {} }

    batcher.addEvent(event1)
    batcher.addEvent(event2)
    batcher.destroy()

    expect(mockOnBatch).toHaveBeenCalledWith([event1, event2])
  })

  it("should return correct queue size", () => {
    const event1: AGUIEvent = { id: "1", type: "test", timestamp: Date.now(), data: {} }
    const event2: AGUIEvent = { id: "2", type: "test", timestamp: Date.now(), data: {} }

    batcher.addEvent(event1)
    expect(batcher.getQueueSize()).toBe(1)

    batcher.addEvent(event2)
    expect(batcher.getQueueSize()).toBe(2)
  })

  it("should handle flush correctly", () => {
    const event1: AGUIEvent = { id: "1", type: "test", timestamp: Date.now(), data: {} }
    const event2: AGUIEvent = { id: "2", type: "test", timestamp: Date.now(), data: {} }

    batcher.addEvent(event1)
    batcher.addEvent(event2)
    batcher.flush()

    expect(mockOnBatch).toHaveBeenCalledWith([event1, event2])
    expect(batcher.getQueueSize()).toBe(0)
  })
})
