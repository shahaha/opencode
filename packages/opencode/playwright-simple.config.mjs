import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./",
  testMatch: "test-repairs-simple.js",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: ["html", { name: "json", outputFile: "test-results.json" }],
  use: {
    baseURL: "http://100.94.136.15:9100/",
    trace: "on-first-retry",
    headless: true,
    actionTimeout: 15000,
    navigationTimeout: 15000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
  webServer: {
    command: "node production-server-final.mjs",
    port: 9101,
    reuseExistingServer: !process.env.CI,
  },
})
