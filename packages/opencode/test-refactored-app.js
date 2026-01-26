#!/usr/bin/env node
import fs from "fs"
import path from "path"

const __dirname = path.dirname(process.argv[1])
const publicDir = path.join(__dirname, "public")

console.log("🧪 Testing AG-UI Refactored Application...")
console.log("📁 Public Directory:", publicDir)

const testModule = async (modulePath, expectedExports) => {
  try {
    const fullPath = path.join(publicDir, modulePath)
    const content = fs.readFileSync(fullPath, "utf8")

    if (!content.includes("export ")) {
      throw new Error("Missing export statements")
    }

    if (!content.includes("class ")) {
      throw new Error("Missing class definitions")
    }

    console.log(`✅ ${modulePath} - Valid module structure`)
    return true
  } catch (error) {
    console.log(`❌ ${modulePath} - Error: ${error.message}`)
    return false
  }
}

const testFileExists = (filePath) => {
  const fullPath = path.join(publicDir, filePath)
  const exists = fs.existsSync(fullPath)
  console.log(`${exists ? "✅" : "❌"} ${filePath} - ${exists ? "Exists" : "Missing"}`)
  return exists
}

console.log("\n📋 Testing File Structure...")
const filesExist = [
  testFileExists("index.html"),
  testFileExists("js/app.js"),
  testFileExists("js/models/model-manager.js"),
  testFileExists("js/settings/settings-manager.js"),
  testFileExists("js/diagnostics/diagnostics-manager.js"),
  testFileExists("css/chat.css"),
  testFileExists("css/settings.css"),
  testFileExists("css/models.css"),
]

console.log("\n🧩 Testing Module Imports...")
const modulesValid = [
  await testModule("js/app.js", ["AGUIChat"]),
  await testModule("js/models/model-manager.js", ["ModelManager"]),
  await testModule("js/settings/settings-manager.js", ["SettingsManager"]),
  await testModule("js/diagnostics/diagnostics-manager.js", ["DiagnosticsManager"]),
]

console.log("\n🔗 Testing HTML Module References...")
const htmlContent = fs.readFileSync(path.join(publicDir, "index.html"), "utf8")
const hasModuleScript = htmlContent.includes('type="module" src="/js/app.js"')
const hasCSSImports =
  htmlContent.includes("/css/chat.css") &&
  htmlContent.includes("/css/settings.css") &&
  htmlContent.includes("/css/models.css")

console.log(`${hasModuleScript ? "✅" : "❌"} Module script reference`)
console.log(`${hasCSSImports ? "✅" : "❌"} CSS file references`)

const allPassed = filesExist.every(Boolean) && modulesValid.every(Boolean) && hasModuleScript && hasCSSImports

console.log("\n" + "=".repeat(50))
if (allPassed) {
  console.log("🎉 ALL TESTS PASSED! Refactored AG-UI application is ready.")
  console.log("🌐 Access at: http://localhost:3005/")
} else {
  console.log("❌ Some tests failed. Please review the issues above.")
}
console.log("=".repeat(50))

process.exit(allPassed ? 0 : 1)
