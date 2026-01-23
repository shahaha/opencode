// packages/console/app/src/lib/production-checks.ts
export interface ProductionCheck {
  name: string
  description: string
  check: () => Promise<{ passed: boolean; message: string; severity: "error" | "warning" | "info" }>
  required: boolean
}

export class ProductionChecker {
  private checks: ProductionCheck[] = [
    {
      name: "Environment Variables",
      description: "Check if all required environment variables are set",
      required: true,
      check: async () => {
        const required = ["VITE_OPENCODE_API_URL"]

        const missing = required.filter((key) => !import.meta.env[key])

        if (missing.length > 0) {
          return {
            passed: false,
            message: `Missing environment variables: ${missing.join(", ")}`,
            severity: "error",
          }
        }

        return {
          passed: true,
          message: "All required environment variables are set",
          severity: "info",
        }
      },
    },

    {
      name: "API Connectivity",
      description: "Verify API endpoint is reachable",
      required: true,
      check: async () => {
        try {
          const response = await fetch(`${import.meta.env.VITE_OPENCODE_API_URL}/health`, {
            method: "GET",
            signal: AbortSignal.timeout(5000),
          })

          if (!response.ok) {
            return {
              passed: false,
              message: `API health check failed: ${response.status}`,
              severity: "error",
            }
          }

          return {
            passed: true,
            message: "API is reachable and healthy",
            severity: "info",
          }
        } catch (error) {
          return {
            passed: false,
            message: `API connectivity failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            severity: "error",
          }
        }
      },
    },

    {
      name: "WebSocket Support",
      description: "Check if WebSocket connections are supported",
      required: true,
      check: async () => {
        if (typeof WebSocket === "undefined") {
          return {
            passed: false,
            message: "WebSocket is not supported in this environment",
            severity: "error",
          }
        }

        // Test WebSocket connection briefly
        try {
          const ws = new WebSocket(`${import.meta.env.VITE_OPENCODE_API_URL?.replace(/^http/, "ws")}/ag-ui/ws`)
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              ws.close()
              reject(new Error("WebSocket connection timeout"))
            }, 3000)

            ws.onopen = () => {
              clearTimeout(timeout)
              ws.close()
              resolve(true)
            }

            ws.onerror = () => {
              clearTimeout(timeout)
              reject(new Error("WebSocket connection failed"))
            }
          })

          return {
            passed: true,
            message: "WebSocket connections are working",
            severity: "info",
          }
        } catch (error) {
          return {
            passed: false,
            message: `WebSocket test failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            severity: "warning", // Warning because SSE fallback exists
          }
        }
      },
    },

    {
      name: "Browser Compatibility",
      description: "Check current browser compatibility",
      required: false,
      check: async () => {
        const checks = [
          { name: "ES2020", supported: typeof BigInt !== "undefined" },
          { name: "WebSocket", supported: typeof WebSocket !== "undefined" },
          { name: "localStorage", supported: typeof localStorage !== "undefined" },
          { name: "ResizeObserver", supported: typeof ResizeObserver !== "undefined" },
          { name: "IntersectionObserver", supported: typeof IntersectionObserver !== "undefined" },
        ]

        const failed = checks.filter((c) => !c.supported)

        if (failed.length > 0) {
          return {
            passed: false,
            message: `Browser compatibility issues: ${failed.map((f) => f.name).join(", ")}`,
            severity: "warning",
          }
        }

        return {
          passed: true,
          message: "Browser is fully compatible",
          severity: "info",
        }
      },
    },

    {
      name: "Performance Baseline",
      description: "Check if performance meets minimum requirements",
      required: false,
      check: async () => {
        const startTime = performance.now()

        // Simple performance test
        for (let i = 0; i < 1000; i++) {
          Math.random()
        }

        const endTime = performance.now()
        const duration = endTime - startTime

        if (duration > 50) {
          // 50ms threshold
          return {
            passed: false,
            message: `Performance baseline not met: ${duration.toFixed(2)}ms (expected < 50ms)`,
            severity: "warning",
          }
        }

        return {
          passed: true,
          message: `Performance baseline met: ${duration.toFixed(2)}ms`,
          severity: "info",
        }
      },
    },

    {
      name: "Memory Usage",
      description: "Check current memory usage",
      required: false,
      check: async () => {
        // @ts-ignore - performance.memory is Chrome-specific
        const memInfo = performance.memory

        if (!memInfo) {
          return {
            passed: true,
            message: "Memory information not available (expected in Chrome)",
            severity: "info",
          }
        }

        const usedMB = Math.round(memInfo.usedJSHeapSize / 1024 / 1024)
        const limitMB = Math.round(memInfo.jsHeapSizeLimit / 1024 / 1024)

        if (usedMB > limitMB * 0.8) {
          return {
            passed: false,
            message: `High memory usage: ${usedMB}MB / ${limitMB}MB (${((usedMB / limitMB) * 100).toFixed(1)}%)`,
            severity: "warning",
          }
        }

        return {
          passed: true,
          message: `Memory usage normal: ${usedMB}MB / ${limitMB}MB`,
          severity: "info",
        }
      },
    },
  ]

  async runAllChecks(): Promise<{
    passed: boolean
    results: Array<ProductionCheck & { result: Awaited<ReturnType<ProductionCheck["check"]>> }>
  }> {
    const results = await Promise.all(
      this.checks.map(async (check) => ({
        ...check,
        result: await check.check(),
      })),
    )

    const allPassed = results.every((r) => !r.required || r.result.passed)

    return {
      passed: allPassed,
      results,
    }
  }

  async runCheck(
    checkName: string,
  ): Promise<(ProductionCheck & { result: Awaited<ReturnType<ProductionCheck["check"]>> }) | null> {
    const check = this.checks.find((c) => c.name === checkName)
    if (!check) return null

    const result = await check.check()
    return { ...check, result }
  }

  getAvailableChecks(): string[] {
    return this.checks.map((c) => c.name)
  }
}

// Global production checker instance
export const productionChecker = new ProductionChecker()
