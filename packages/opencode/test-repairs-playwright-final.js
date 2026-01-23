import { test, expect } from "@playwright/test"

test.describe("AG-UI Chat 修復驗證", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://100.94.136.15:9102/")
    await page.waitForLoadState("networkidle")
  })

  test("CORS 修復驗證", async ({ page }) => {
    const mcpResponse = await page.evaluate(async () => {
      try {
        const response = await fetch("http://100.94.136.15:5000/mcp", {
          mode: "cors",
        })
        return response.ok
      } catch {
        return false
      }
    })

    expect(mcpResponse).toBe(true)
    console.log("✅ CORS 修復驗證通過")
  })

  test("重複渲染問題修復驗證", async ({ page }) => {
    for (let i = 0; i < 5; i++) {
      await page.click("#settingsBtn")
      await page.waitForTimeout(200)
    }

    const workspaceItems = await page.locator(".workspace-item").count()
    expect(workspaceItems).toBeLessThan(10)

    console.log(`✅ 重複渲染修復驗證通過 (項目數: ${workspaceItems})`)
  })

  test("Workspace CRUD 功能驗證", async ({ page }) => {
    await page.click("#settingsBtn")
    await page.waitForSelector(".settings-panel.visible")

    await page.fill("#newWorkspacePath", "/test/workspace")
    await page.click("#addWorkspaceBtn")
    await page.waitForTimeout(500)

    const workspaceItems = await page.locator(".workspace-item").count()
    expect(workspaceItems).toBeGreaterThan(5)

    console.log("✅ Workspace CRUD 功能驗證通過")
  })

  test("設置面板切換驗證", async ({ page }) => {
    await page.click("#settingsBtn")
    await page.waitForSelector(".settings-panel.visible")

    const panelVisible = await page.locator(".settings-panel.visible").isVisible()
    expect(panelVisible).toBe(true)

    await page.click("#settingsCloseBtn")
    await page.waitForTimeout(300)

    const panelHidden = await page.locator(".settings-panel.visible").isVisible()
    expect(panelHidden).toBe(false)

    console.log("✅ 設置面板切換驗證通過")
  })
})
