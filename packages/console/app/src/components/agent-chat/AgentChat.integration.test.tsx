// packages/console/app/src/components/agent-chat/AgentChat.integration.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup, waitFor } from "@solidjs/testing-library"
import { AgentChat } from "./AgentChat"

// Mock the AGUI client
const mockClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn(),
  send: vi.fn(),
  on: vi.fn(),
  connectionStatus: vi.fn().mockReturnValue("connected"),
  isConnected: vi.fn().mockReturnValue(true),
}

vi.mock("../../hooks/useAgentSession", () => ({
  useAgentSession: vi.fn(() => ({
    session: () => ({
      id: "test-session",
      agentId: "test-agent",
      messages: [
        {
          id: "1",
          role: "user",
          content: "Hello",
          timestamp: Date.now() - 1000,
        },
        {
          id: "2",
          role: "assistant",
          content: "Hi there!",
          timestamp: Date.now(),
        },
      ],
      status: "idle",
      tools: [],
      metadata: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
    isLoading: () => false,
    sendMessage: vi.fn(),
    isConnected: () => true,
  })),
}))

describe("AgentChat Integration", () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it("should render complete chat interface", () => {
    render(() => <AgentChat sessionId="test-session" agentId="test-agent" maxMessages={100} autoSave={true} />)

    expect(screen.getByText("Agent Chat")).toBeInTheDocument()
    expect(screen.getByText("Ready")).toBeInTheDocument()
    expect(screen.getByText("Hello")).toBeInTheDocument()
    expect(screen.getByText("Hi there!")).toBeInTheDocument()
    expect(screen.getByPlaceholderText("Type your message...")).toBeInTheDocument()
  })

  it("should display connection status", () => {
    render(() => <AgentChat sessionId="test-session" agentId="test-agent" />)

    expect(screen.getByText("Ready")).toBeInTheDocument()
  })

  it("should handle message sending", async () => {
    const mockSendMessage = vi.fn()
    const { useAgentSession } = await import("../../hooks/useAgentSession")

    // Override the mock to return our sendMessage function
    ;(useAgentSession as any).mockReturnValue({
      session: () => ({
        id: "test-session",
        agentId: "test-agent",
        messages: [],
        status: "idle",
        tools: [],
        metadata: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
      isLoading: () => false,
      sendMessage: mockSendMessage,
      isConnected: () => true,
    })

    render(() => <AgentChat sessionId="test-session" agentId="test-agent" />)

    const input = screen.getByPlaceholderText("Type your message...")
    const button = screen.getByRole("button")

    fireEvent.input(input, { target: { value: "Test message" } })
    fireEvent.click(button)

    expect(mockSendMessage).toHaveBeenCalledWith("Test message")
  })

  it("should show loading state initially", () => {
    const { useAgentSession } = require("../../hooks/useAgentSession")
    ;(useAgentSession as any).mockReturnValue({
      session: () => null,
      isLoading: () => true,
      sendMessage: vi.fn(),
      isConnected: () => false,
    })

    render(() => <AgentChat sessionId="test-session" agentId="test-agent" />)

    expect(screen.getByText("Loading conversation...")).toBeInTheDocument()
  })

  it("should display empty state when no messages", () => {
    const { useAgentSession } = require("../../hooks/useAgentSession")
    ;(useAgentSession as any).mockReturnValue({
      session: () => ({
        id: "test-session",
        agentId: "test-agent",
        messages: [],
        status: "idle",
        tools: [],
        metadata: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
      isLoading: () => false,
      sendMessage: vi.fn(),
      isConnected: () => true,
    })

    render(() => <AgentChat sessionId="test-session" agentId="test-agent" />)

    expect(screen.getByText(/Start a conversation/)).toBeInTheDocument()
  })

  it("should disable input when not connected", () => {
    const { useAgentSession } = require("../../hooks/useAgentSession")
    ;(useAgentSession as any).mockReturnValue({
      session: () => ({
        id: "test-session",
        agentId: "test-agent",
        messages: [],
        status: "idle",
        tools: [],
        metadata: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
      isLoading: () => false,
      sendMessage: vi.fn(),
      isConnected: () => false,
    })

    render(() => <AgentChat sessionId="test-session" agentId="test-agent" />)

    const input = screen.getByPlaceholderText("Connecting...")
    expect(input).toBeDisabled()
  })

  it("should show error state", async () => {
    const { useAgentSession } = require("../../hooks/useAgentSession")
    ;(useAgentSession as any).mockReturnValue({
      session: () => ({
        id: "test-session",
        agentId: "test-agent",
        messages: [],
        status: "error",
        tools: [],
        metadata: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
      isLoading: () => false,
      sendMessage: vi.fn(),
      isConnected: () => true,
    })

    render(() => <AgentChat sessionId="test-session" agentId="test-agent" />)

    expect(screen.getByText("Error")).toBeInTheDocument()
  })
})
