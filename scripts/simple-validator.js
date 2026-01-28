#!/usr/bin/env node

// Simple Model Configuration Validation
// Checks for common configuration issues

import { readFileSync, existsSync, writeFileSync } from "fs"
import { join } from "path"

// Simple model validation without TypeScript interfaces
function validateModel(model) {
  const errors = []
  const warnings = []

  // Basic field checks
  if (!model.id) errors.push("Missing model ID")
  if (!model.name) errors.push("Missing model name")
  if (!model.family) errors.push("Missing model family")

  // Memory validation
  if (!model.memory) {
    errors.push("Missing memory requirements")
  } else {
    const { minimum, recommended, required } = model.memory

    if (minimum < 0 || recommended < 0 || required < 0) {
      errors.push("Invalid memory values (must be positive)")
    }

    if (minimum > recommended || recommended > required) {
      errors.push("Invalid memory hierarchy (minimum ≤ recommended ≤ required)")
    }

    // Reasonable ranges
    if (model.id.includes("flash") && minimum > 4) {
      warnings.push("Flash models typically need minimum ≤ 4GB")
    }
  }

  // Limits validation
  if (!model.limit) {
    errors.push("Missing limit specification")
  } else {
    const { context, output } = model.limit
    if (context < output) {
      errors.push("Context should be ≥ output limit")
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    model,
  }
}

function loadConfig() {
  try {
    const configPath = join(process.cwd(), "packages", "opencode", "test", "tool", "fixtures", "models-api.json")
    if (!existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`)
    }
    return JSON.parse(readFileSync(configPath, "utf-8"))
  } catch (error) {
    throw new Error(`Failed to load config: ${error}`)
  }
}

function validateSpecificModel(modelId) {
  try {
    const config = loadConfig()

    // Find the model
    let targetModel = null
    Object.values(config).forEach((provider) => {
      if (provider.models) {
        Object.values(provider.models).forEach((model) => {
          if (model.id === modelId) {
            targetModel = model
          }
        })
      }
    })

    if (!targetModel) {
      console.log(`Model not found: ${modelId}`)
      return false
    }

    const result = validateModel(targetModel)

    console.log(`Validation for ${modelId}:`)
    console.log(`Valid: ${result.valid}`)
    if (result.errors.length > 0) {
      console.log(`Errors: ${result.errors.join(", ")}`)
    }
    if (result.warnings.length > 0) {
      console.log(`Warnings: ${result.warnings.join(", ")}`)
    }

    return result.valid
  } catch (error) {
    console.error(`Validation failed: ${error}`)
    return false
  }
}

// CLI interface
const command = process.argv[2]
const modelId = process.argv[3]

switch (command) {
  case "model":
    if (!modelId) {
      console.log("Usage: node simple-validator.js model <model-id>")
      process.exit(1)
    }
    const success = validateSpecificModel(modelId)
    process.exit(success ? 0 : 1)
    break

  default:
    console.log(`
Simple Model Validator
====================

Usage:
  node simple-validator.js model <model-id>

Examples:
  node simple-validator.js model glm-4.7-flash
  node simple-validator.js model gpt-4
    `)
}
