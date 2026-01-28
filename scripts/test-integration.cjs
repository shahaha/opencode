#!/usr/bin/env node

// Memory Monitoring Integration Test
// Simple test to verify integration works

const { execSync } = require("child_process")
const { join } = require("path")

console.log("🧪 Testing memory monitoring integration...")

const serverDir = "/home/rick/prj/opencode/packages/opencode/src/server"
const serverFile = join(serverDir, "server.ts")

// Check if server file exists
try {
  const stats = require("fs").statSync(serverFile)
  console.log("✅ Server file found:", serverFile.isFile())
} catch (error) {
  console.error("❌ Server file not found:", error.message)
  process.exit(1)
}

console.log("🔧 Testing memory monitor path...")

const memoryMonitorPath = "/home/rick/prj/opencode/scripts/memory-monitor.mjs"
// Check if memory monitor exists
try {
  const test = execSync("test", ["-f", memoryMonitorPath])
  console.log("Memory monitor test exit code:", test.status)
  console.log("✅ Memory monitor exists:", test.status === 0)
} catch (error) {
  console.error("❌ Memory monitor test failed:", error.message)
}

console.log("🎯 Integration test complete!")
