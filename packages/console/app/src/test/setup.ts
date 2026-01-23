// Test setup file - simplified for now
// TODO: Set up proper testing infrastructure with jest-dom matchers
import { vi, afterEach } from "vitest"
import { cleanup } from "@solidjs/testing-library"

// Set up minimal globals
;(globalThis as any).vi = vi
;(globalThis as any).afterEach = afterEach

// Clean up after each test
afterEach(() => {
  cleanup()
})
