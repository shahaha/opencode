// packages/console/vitest.config.ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/lib/ag-ui/**/*.{test,spec}.{ts,js}"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/build/**", "packages/opencode/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/lib/ag-ui/**/*.{ts,js}"],
      exclude: [
        "src/lib/ag-ui/**/*.test.{ts,js}",
        "src/lib/ag-ui/**/*.spec.{ts,js}",
        "src/lib/ag-ui/**/*.d.ts",
        "src/test/**",
      ],
      thresholds: {
        global: {
          statements: 80,
          branches: 75,
          functions: 80,
          lines: 80,
        },
      },
    },
  },
})
