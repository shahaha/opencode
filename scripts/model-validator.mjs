#!/usr/bin/env node

// Model Configuration Validation System
// Prevents configuration issues like the GLM-4.7-Flash memory problem

import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'

// Model configuration interfaces
const ModelConfigStructure = {
  id: '',
  name: '',
  family: '',
  memory: {
    minimum: 0,
    recommended: 0,
    required: 0
  },
  limit: {
    context: 0,
    output: 0
  }
}

class ModelValidator {
  private configPath: string
  private outputPath: string

  constructor() {
    this.configPath = join(process.cwd(), 'packages', 'opencode', 'test', 'tool', 'fixtures', 'models-api.json')
    this.outputPath = join(process.cwd(), 'logs', 'model-validation.log')
  }

  private log(level: 'info' | 'warning' | 'error', message: string): void {
    const timestamp = new Date().toISOString()
    const logEntry = `[${timestamp}] ${level.toUpperCase()}: ${message}\n`
    
    try {
      writeFileSync(this.outputPath, logEntry, { flag: 'a' })
    } catch (error) {
      console.error('Failed to write validation log:', error)
    }
    
    console.log(`ModelValidator ${level}: ${message}`)
  }

  private loadModelConfig(): any {
    try {
      if (!existsSync(this.configPath)) {
        throw new Error(`Configuration file not found: ${this.configPath}`)
      }
      
      return JSON.parse(readFileSync(this.configPath, 'utf-8'))
    } catch (error) {
      throw new Error(`Failed to load model configuration: ${error}`)
    }
  }

  private validateMemoryRequirements(model: ModelConfig): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    if (!model.memory) {
      errors.push('Missing memory requirements specification')
    } else {
      const { minimum, recommended, required } = model.memory

      // Validate memory values are reasonable
      if (minimum < 0 || recommended < 0 || required < 0) {
        errors.push('Memory values must be positive')
      }

      if (minimum > recommended || recommended > required) {
        errors.push('Memory requirements should follow: minimum ≤ recommended ≤ required')
      }

      // Check for reasonable ranges based on model type
      if (model.id.includes('flash') || model.id.includes('lightweight')) {
        if (minimum > 4) {
          warnings.push('Flash/lightweight models typically have minimum ≤ 4GB')
        }
        if (recommended > 8) {
          warnings.push('Flash/lightweight models typically have recommended ≤ 8GB')
        }
      }

      if (model.id.includes('large') || model.id.includes('70b') || model.id.includes('100b')) {
        if (minimum < 16) {
          warnings.push('Large models typically have minimum ≥ 16GB')
        }
        if (recommended < 32) {
          warnings.push('Large models typically have recommended ≥ 32GB')
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      model
    }
  }

  private validateModelBasics(model: ModelConfig): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    // Basic field validation
    if (!model.id) {
      errors.push('Missing model ID')
    }

    if (!model.name) {
      errors.push('Missing model name')
    }

    if (!model.family) {
      errors.push('Missing model family')
    }

    // ID format validation
    if (model.id && !/^[a-z0-9.]+[a-z0-9.-]+(-[a-z0-9]+)?$/.test(model.id)) {
      errors.push('Invalid model ID format (should follow provider/model-pattern)')
    }

    // Family consistency check
    if (model.id && model.family && !model.id.startsWith(model.family.split('-')[0])) {
      warnings.push('Model family should be consistent with ID prefix')
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      model
    }
  }

  private validateLimits(model: ModelConfig): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    if (!model.limit) {
      errors.push('Missing limit specification')
    } else {
      const { context, output } = model.limit

      if (!context || !output) {
        errors.push('Both context and output limits must be specified')
      }

      if (context && output && context < output) {
        errors.push('Context limit should be greater than or equal to output limit')
      }

      // Reasonable range checks
      if (context && (context < 1024 || context > 2097152)) { // 1K to 2M tokens
        warnings.push('Context limit outside typical range (1K-2M tokens)')
      }

      if (output && (output < 256 || output > 131072)) { // 256 to 128K tokens
        warnings.push('Output limit outside typical range (256-128K tokens)')
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      model
    }
  }

  private getValidationRules(): ValidationRule[] {
    return [
      {
        name: 'Basic Field Validation',
        description: 'Validates required fields and ID format',
        validate: (model) => this.validateModelBasics(model)
      },
      {
        name: 'Memory Requirements',
        description: 'Validates memory specifications are reasonable and consistent',
        validate: (model) => this.validateMemoryRequirements(model)
      },
      {
        name: 'Limits Specification',
        description: 'Validates context/output limits are appropriate',
        validate: (model) => this.validateLimits(model)
      }
    ]
  }

  public validateAllModels(): { [modelId: string]: ValidationResult } {
    const results: { [modelId: string]: ValidationResult } = {}
    
    try {
      const config = this.loadModelConfig()
      this.log('info', 'Starting comprehensive model validation')
      
      // Extract all models from all providers
      Object.values(config).forEach((provider: any) => {
        if (provider.models) {
          Object.values(provider.models).forEach((model: ModelConfig) => {
            if (model.id) {
              const rules = this.getValidationRules()
              let validationResult: ValidationResult = { valid: true, errors: [], warnings: [], model }
              
              // Apply all validation rules
              for (const rule of rules) {
                const ruleResult = rule.validate(model)
                validationResult.errors.push(...ruleResult.errors)
                validationResult.warnings.push(...ruleResult.warnings)
                validationResult.valid = validationResult.valid && ruleResult.valid
              }
              
              results[model.id] = validationResult
              
              // Log results
              if (validationResult.errors.length > 0) {
                this.log('error', `${model.id}: ${validationResult.errors.join(', ')}`)
              }
              
              if (validationResult.warnings.length > 0) {
                this.log('warning', `${model.id}: ${validationResult.warnings.join(', ')}`)
              }
              
              if (validationResult.valid) {
                this.log('info', `${model.id}: Validation passed`)
              }
            }
          })
        }
      })
      
      this.log('info', `Validation complete: ${Object.keys(results).length} models validated`)
      return results
      
    } catch (error) {
      this.log('error', `Validation failed: ${error}`)
      return {}
    }
  }

  public validateSpecificModel(modelId: string): ValidationResult | null {
    try {
      const config = this.loadModelConfig()
      
      // Find specific model
      let targetModel: ModelConfig | null = null
      
      Object.values(config).forEach((provider: any) => {
        if (provider.models) {
          Object.values(provider.models).forEach((model: ModelConfig) => {
            if (model.id === modelId) {
              targetModel = model
            }
          })
        }
      })
      
      if (!targetModel) {
        this.log('error', `Model not found: ${modelId}`)
        return null
      }
      
      const rules = this.getValidationRules()
      let validationResult: ValidationResult = { valid: true, errors: [], warnings: [], model: targetModel }
      
      // Apply all validation rules
      for (const rule of rules) {
        const ruleResult = rule.validate(targetModel)
        validationResult.errors.push(...ruleResult.errors)
        validationResult.warnings.push(...ruleResult.warnings)
        validationResult.valid = validationResult.valid && ruleResult.valid
      }
      
      return validationResult
      
    } catch (error) {
      this.log('error', `Model validation failed: ${error}`)
      return null
    }
  }

  public generateValidationReport(): string {
    const results = this.validateAllModels()
    
    const summary = {
      timestamp: new Date().toISOString(),
      total_models: Object.keys(results).length,
      valid_models: Object.values(results).filter(r => r.valid).length,
      invalid_models: Object.values(results).filter(r => !r.valid).length,
      total_errors: Object.values(results).reduce((sum, r) => sum + r.errors.length, 0),
      total_warnings: Object.values(results).reduce((sum, r) => sum + r.warnings.length, 0),
      models_by_status: {
        valid: Object.entries(results).filter(([_, r]) => r.valid).map(([id, r]) => ({ id, errors: r.errors, warnings: r.warnings })),
        invalid: Object.entries(results).filter(([_, r]) => !r.valid).map(([id, r]) => ({ id, errors: r.errors, warnings: r.warnings }))
      }
    }
    
    return JSON.stringify(summary, null, 2)
  }
}

// CLI interface
async function main() {
  const validator = new ModelValidator()
  const command = process.argv[2]
  const modelId = process.argv[3]
  
  switch (command) {
    case 'all':
      console.log(validator.generateValidationReport())
      break
      
    case 'model':
      if (!modelId) {
        console.log('Error: Model ID required for specific validation')
        process.exit(1)
      }
      const result = validator.validateSpecificModel(modelId)
      if (result) {
        console.log(JSON.stringify(result, null, 2))
        process.exit(result.valid ? 0 : 1)
      } else {
        process.exit(1)
      }
      break
      
    case 'rules':
      const rules = validator.getValidationRules()
      console.log(JSON.stringify(rules, null, 2))
      break
      
    default:
      console.log(`
Model Validator Commands:
  all                    - Validate all models and generate report
  model <model-id>       - Validate specific model by ID
  rules                 - Show validation rules

Usage Examples:
  node model-validator.mjs all                    # Validate all models
  node model-validator.mjs model glm-4.7-flash   # Validate specific model
  node model-validator.mjs rules                   # Show validation rules
      `)
  }
}

if (import.meta.url) {
  main().catch(console.error)
}

export { ModelValidator }