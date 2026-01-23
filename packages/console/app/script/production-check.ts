#!/usr/bin/env node

// packages/console/app/script/production-check.ts
import { productionChecker } from "../src/lib/production-checks"
import { globalErrorHandler } from "../src/lib/error-handler"
import { monitoring } from "../src/lib/monitoring"

async function runProductionChecks() {
  console.log("🚀 Running OpenCode AG-UI Production Checks...\n")

  // 1. Production readiness checks
  console.log("📋 Running production readiness checks...")
  const checkResults = await productionChecker.runAllChecks()

  console.log(`✅ Checks completed: ${checkResults.results.length} total`)

  // Display results
  let errors = 0
  let warnings = 0

  checkResults.results.forEach((result) => {
    const status = result.result.passed ? "✅" : "❌"
    const severity = result.result.severity === "error" ? "🔴" : result.result.severity === "warning" ? "🟡" : "ℹ️"

    console.log(`${status} ${severity} ${result.name}`)
    console.log(`   ${result.result.message}`)

    if (!result.result.passed) {
      if (result.result.severity === "error") errors++
      else warnings++
    }

    console.log("")
  })

  // 2. Error handling test
  console.log("🔧 Testing error handling...")
  try {
    // Simulate various errors
    globalErrorHandler.handleError(new Error("Test network error"), {
      type: "network",
      recoverable: true,
      retryable: true,
    })

    globalErrorHandler.handleError("Test validation error", {
      type: "validation",
      recoverable: false,
    })

    console.log("✅ Error handling system functional")
  } catch (error) {
    console.log("❌ Error handling system failed")
    errors++
  }

  // 3. Monitoring system test
  console.log("📊 Testing monitoring system...")
  try {
    monitoring.recordMetric("production_check", 1, { type: "startup" })
    monitoring.log("info", "Production check completed", { checks: checkResults.results.length })

    const stats = monitoring.getStats()
    console.log(`✅ Monitoring active - ${stats.totalMetrics} metrics, ${stats.totalLogs} logs`)
  } catch (error) {
    console.log("❌ Monitoring system failed")
    warnings++
  }

  // 4. Performance baseline
  console.log("⚡ Checking performance baseline...")
  const perfStart = performance.now()

  // Simulate some operations
  for (let i = 0; i < 1000; i++) {
    Math.sin(i) * Math.cos(i)
  }

  const perfDuration = performance.now() - perfStart
  console.log(`⏱️  Performance test: ${perfDuration.toFixed(2)}ms`)

  if (perfDuration > 50) {
    console.log("⚠️  Performance may be slower than expected")
    warnings++
  } else {
    console.log("✅ Performance within acceptable range")
  }

  // Summary
  console.log("\n📊 Production Check Summary:")
  console.log(`   ✅ Passed: ${checkResults.results.filter((r) => r.result.passed).length}`)
  console.log(`   ❌ Errors: ${errors}`)
  console.log(`   ⚠️  Warnings: ${warnings}`)

  const overallStatus = errors > 0 ? "❌ FAILED" : warnings > 0 ? "⚠️  WARNINGS" : "✅ READY"

  console.log(`\n🎯 Overall Status: ${overallStatus}`)

  if (errors > 0) {
    console.log("\n🔴 Critical issues found. Deployment NOT recommended.")
    console.log("Please resolve all errors before proceeding.")
    process.exit(1)
  } else if (warnings > 0) {
    console.log("\n🟡 Warnings found. Deployment possible but monitor closely.")
    console.log("Consider addressing warnings for optimal performance.")
    process.exit(0)
  } else {
    console.log("\n✅ All checks passed. Ready for deployment!")
    process.exit(0)
  }
}

// Handle script execution
if (import.meta.url === `file://${process.argv[1]}`) {
  runProductionChecks().catch((error) => {
    console.error("❌ Production check script failed:", error)
    process.exit(1)
  })
}
