// packages/console/app/src/components/agent-chat/MessageInput.test.tsx
import { describe, it, expect } from "vitest"
import { render, screen, fireEvent, cleanup } from "@solidjs/testing-library"
import { MessageInput } from "./MessageInput"

describe("MessageInput", () => {
  afterEach(() => {
    cleanup()
  })

  it("should render input and button", () => {
    render(() => <MessageInput onSend={() => {}} />)

    expect(screen.getByRole("textbox")).toBeInTheDocument()
    expect(screen.getByRole("button")).toBeInTheDocument()
  })

  it("should call onSend when form is submitted", () => {
    const mockOnSend = vi.fn()
    render(() => <MessageInput onSend={mockOnSend} />)

    const input = screen.getByRole("textbox")
    const form = input.closest("form")

    fireEvent.input(input, { target: { value: "Hello agent" } })
    fireEvent.submit(form!)

    expect(mockOnSend).toHaveBeenCalledWith("Hello agent")
  })

  it("should call onSend when Enter is pressed", () => {
    const mockOnSend = vi.fn()
    render(() => <MessageInput onSend={mockOnSend} />)

    const input = screen.getByRole("textbox")
    fireEvent.input(input, { target: { value: "Hello agent" } })
    fireEvent.keyDown(input, { key: "Enter" })

    expect(mockOnSend).toHaveBeenCalledWith("Hello agent")
  })

  it("should not call onSend when Shift+Enter is pressed", () => {
    const mockOnSend = vi.fn()
    render(() => <MessageInput onSend={mockOnSend} />)

    const input = screen.getByRole("textbox")
    fireEvent.input(input, { target: { value: "Hello agent" } })
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true })

    expect(mockOnSend).not.toHaveBeenCalled()
  })

  it("should be disabled when disabled prop is true", () => {
    render(() => <MessageInput onSend={() => {}} disabled={true} />)

    const input = screen.getByRole("textbox")
    expect(input).toBeDisabled()
  })

  it("should show character count when over 500 characters", () => {
    const longText = "a".repeat(600)
    render(() => <MessageInput onSend={() => {}} />)

    const input = screen.getByRole("textbox")
    fireEvent.input(input, { target: { value: longText } })

    expect(screen.getByText("600/1000")).toBeInTheDocument()
  })

  it("should auto-resize textarea", () => {
    render(() => <MessageInput onSend={() => {}} />)

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement
    const initialHeight = textarea.style.height

    fireEvent.input(textarea, {
      target: { value: "Line 1\nLine 2\nLine 3\nLine 4\nLine 5" },
    })

    // Height should be different after input
    expect(textarea.style.height).not.toBe(initialHeight)
  })

  it("should handle composition events", () => {
    const mockOnSend = vi.fn()
    render(() => <MessageInput onSend={mockOnSend} />)

    const input = screen.getByRole("textbox")

    // Simulate IME composition start
    fireEvent.compositionStart(input)
    fireEvent.input(input, { target: { value: "你好" } })
    fireEvent.keyDown(input, { key: "Enter" })

    // Should not send during composition
    expect(mockOnSend).not.toHaveBeenCalled()

    // End composition
    fireEvent.compositionEnd(input)
    fireEvent.keyDown(input, { key: "Enter" })

    expect(mockOnSend).toHaveBeenCalledWith("你好")
  })

  it("should trim whitespace before sending", () => {
    const mockOnSend = vi.fn()
    render(() => <MessageInput onSend={mockOnSend} />)

    const input = screen.getByRole("textbox")
    const form = input.closest("form")

    fireEvent.input(input, { target: { value: "  Hello agent  " } })
    fireEvent.submit(form!)

    expect(mockOnSend).toHaveBeenCalledWith("Hello agent")
  })
})
