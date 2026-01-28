#!/usr/bin/env node

// Model Performance Benchmarking System
// Compares GLM-4.7-Flash performance against other models

import { spawn } from 'child_process'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'

interface BenchmarkResult {
  model_id: string
  model_name: string
  test_type: string
  duration_ms: number
  memory_used_mb: number
  tokens_per_second: number
  success: boolean
  error?: string
  timestamp: string
}

interface BenchmarkSuite {
  models: string[]
  test_prompts: string[]
  results: BenchmarkResult[]
  summary: {
    total_tests: number
    successful_tests: number
    failed_tests: number
    fastest_model: string
    slowest_model: string
    average_duration_ms: number
  }
}

class ModelBenchmark {
  private outputDir: string
  private logFile: string

  constructor() {
    this.outputDir = join(process.cwd(), 'logs', 'benchmarks')
    this.logFile = join(this.outputDir, 'benchmark.log')
    this.ensureOutputDirectory()
  }

  private ensureOutputDirectory(): void {
    try {
      const { mkdirSync } = require('fs')
      mkdirSync(this.outputDir, { recursive: true })
    } catch (error) {
      // Directory might already exist
    }
  }

  private log(level: 'info' | 'warning' | 'error', message: string): void {
    const timestamp = new Date().toISOString()
    const logEntry = `[${timestamp}] ${level.toUpperCase()}: ${message}\n`
    
    try {
      writeFileSync(this.logFile, logEntry, { flag: 'a' })
    } catch (error) {
      console.error('Failed to write benchmark log:', error)
    }
    
    console.log(`Benchmark: ${level}: ${message}`)
  }

  private async runModelTest(modelId: string, prompt: string): Promise<BenchmarkResult> {
    return new Promise((resolve) => {
      const startTime = Date.now()
      const memoryBefore = this.getCurrentMemory()
      
      this.log('info', `Starting test: ${modelId} with prompt: "${prompt.substring(0, 50)}..."`)
      
      const test = spawn('opencode', ['--model', modelId, 'run', prompt])
      let output = ''
      let errorOutput = ''
      
      test.stdout.on('data', (data) => {
        output += data.toString()
      })
      
      test.stderr.on('data', (data) => {
        errorOutput += data.toString()
      })
      
      test.on('close', (code) => {
        const endTime = Date.now()
        const duration = endTime - startTime
        const memoryAfter = this.getCurrentMemory()
        const memoryUsed = memoryBefore - memoryAfter
        
        const result: BenchmarkResult = {
          model_id: modelId,
          model_name: this.getModelName(modelId),
          test_type: this.categorizePrompt(prompt),
          duration_ms: duration,
          memory_used_mb: memoryUsed,
          tokens_per_second: this.estimateTokensPerSecond(prompt, duration),
          success: code === 0,
          error: code !== 0 ? errorOutput.trim() : undefined,
          timestamp: new Date().toISOString()
        }
        
        this.log('info', `Test ${modelId}: ${result.success ? 'SUCCESS' : 'FAILED'} (${duration}ms, ${memoryUsed}MB)`)
        resolve(result)
      })
      
      // Timeout after 60 seconds
      setTimeout(() => {
        if (!result) {
          resolve({
            model_id: modelId,
            model_name: this.getModelName(modelId),
            test_type: 'timeout',
            duration_ms: 60000,
            memory_used_mb: 0,
            tokens_per_second: 0,
            success: false,
            error: 'Test timed out after 60 seconds',
            timestamp: new Date().toISOString()
          })
        }
      }, 60000)
    })
  }

  private getModelName(modelId: string): string {
    // Try to get model name from config
    try {
      const configPath = join(process.cwd(), 'packages', 'opencode', 'test', 'tool', 'fixtures', 'models-api.json')
      if (existsSync(configPath)) {
        const config = JSON.parse(readFileSync(configPath, 'utf-8'))
        
        for (const provider of Object.values(config)) {
          if (provider.models) {
            const model = Object.values(provider.models).find(m => m.id === modelId)
            if (model) {
              return model.name || modelId
            }
          }
        }
      }
    } catch {
      // Fallback to model ID
    }
    
    return modelId
  }

  private getCurrentMemory(): number {
    try {
      const free = spawn('free', ['-m'])
      let output = ''
      
      free.stdout.on('data', (data) => {
        output += data.toString()
      })
      
      return new Promise<number>((resolve) => {
        free.on('close', () => {
          const lines = output.split('\n')
          const memLine = lines.find(line => line.startsWith('Mem:'))
          
          if (memLine) {
            const parts = memLine.split(/\s+/)
            const available = parseInt(parts[6])
            resolve(available || 0)
          } else {
            resolve(0)
          }
        })
      })
    } catch {
      return 0
    }
  }

  private categorizePrompt(prompt: string): string {
    if (prompt.length < 50) return 'simple-query'
    if (prompt.includes('code') || prompt.includes('function') || prompt.includes('calculate')) return 'code-generation'
    if (prompt.includes('explain') || prompt.includes('concept') || prompt.length > 200) return 'complex-reasoning'
    if (prompt.includes('tool') || prompt.includes('command') || prompt.includes('file')) return 'tool-usage'
    return 'general'
  }

  private estimateTokensPerSecond(prompt: string, durationMs: number): number {
    // Rough estimation: assuming average 50 tokens per second for simple queries
    const promptTokens = Math.ceil(prompt.length / 4) // Rough token estimate
    const seconds = durationMs / 1000
    return seconds > 0 ? Math.round(promptTokens / seconds) : 0
  }

  public async runBenchmarkSuite(modelIds: string[]): Promise<BenchmarkSuite> {
    this.log('info', `Starting benchmark suite for ${modelIds.length} models`)
    
    const testPrompts = [
      'Hello, how are you?',
      'Write a Python function to calculate fibonacci numbers',
      'Explain the concept of recursion in programming',
      'List files in current directory',
      'Analyze this code and suggest optimizations'
    ]
    
    const suite: BenchmarkSuite = {
      models: modelIds,
      test_prompts: testPrompts,
      results: []
    }

    // Run all combinations of models x prompts
    for (const modelId of modelIds) {
      for (const prompt of testPrompts) {
        const result = await this.runModelTest(modelId, prompt)
        suite.results.push(result)
      }
    }

    // Calculate summary
    const successfulTests = suite.results.filter(r => r.success).length
    const failedTests = suite.results.filter(r => !r.success).length
    
    // Find fastest and slowest models
    const successfulResults = suite.results.filter(r => r.success)
    const fastestModel = successfulResults.reduce((fastest, current) => 
      current.duration_ms < fastest.duration_ms ? current : fastest
    ).model_id
    
    const slowestModel = successfulResults.reduce((slowest, current) => 
      current.duration_ms > slowest.duration_ms ? current : slowest
    ).model_id
    
    const averageDuration = suite.results.reduce((sum, r) => sum + r.duration_ms, 0) / suite.results.length

    suite.summary = {
      total_tests: suite.results.length,
      successful_tests: successfulTests,
      failed_tests: failedTests,
      fastest_model: fastestModel,
      slowest_model: slowestModel,
      average_duration_ms: Math.round(averageDuration)
    }

    // Save results
    const resultsFile = join(this.outputDir, `benchmark-${Date.now()}.json`)
    writeFileSync(resultsFile, JSON.stringify(suite, null, 2))
    
    this.log('info', `Benchmark complete: ${successfulTests}/${suite.results.length} tests successful`)
    this.log('info', `Results saved to: ${resultsFile}`)
    
    return suite
  }

  public generateComparisonReport(suite: BenchmarkSuite): string {
    const modelStats = new Map<string, BenchmarkResult[]>()
    
    // Group results by model
    suite.results.forEach(result => {
      if (!modelStats.has(result.model_id)) {
        modelStats.set(result.model_id, [])
      }
      modelStats.get(result.model_id).push(result)
    })

    // Generate comparison
    const comparison = {
      timestamp: new Date().toISOString(),
      summary: suite.summary,
      model_performance: Array.from(modelStats.entries()).map(([modelId, results]) => {
        const successfulResults = results.filter(r => r.success)
        const avgDuration = successfulResults.length > 0 
          ? Math.round(successfulResults.reduce((sum, r) => sum + r.duration_ms, 0) / successfulResults.length)
          : 0
        
        const avgMemory = successfulResults.length > 0
          ? Math.round(successfulResults.reduce((sum, r) => sum + r.memory_used_mb, 0) / successfulResults.length)
          : 0

        return {
          model_id: modelId,
          model_name: this.getModelName(modelId),
          total_tests: results.length,
          successful_tests: successfulResults.length,
          success_rate: Math.round((successfulResults.length / results.length) * 100),
          average_duration_ms: avgDuration,
          average_memory_mb: avgMemory,
          fastest_test_ms: Math.min(...successfulResults.map(r => r.duration_ms)),
          slowest_test_ms: Math.max(...successfulResults.map(r => r.duration_ms))
        }
      })
    }
    
    return JSON.stringify(comparison, null, 2)
  }
}

// CLI interface
async function main() {
  const benchmark = new ModelBenchmark()
  const command = process.argv[2]
  const modelsArg = process.argv[3]
  
  switch (command) {
    case 'run':
      if (!modelsArg) {
        console.log('Usage: node benchmark.mjs run <model1,model2,model3,...>')
        process.exit(1)
      }
      
      const models = modelsArg.split(',').map(m => m.trim())
      const suite = await benchmark.runBenchmarkSuite(models)
      
      console.log(benchmark.generateComparisonReport(suite))
      break
      
    default:
      console.log(`
Model Performance Benchmarking Tool
==============================

Commands:
  run <models>              - Run benchmarks for specified models
                           (comma-separated list)

Examples:
  node benchmark.mjs run ollama/glm-4.7-flash,ollama/glm-4.5-flash
  node benchmark.mjs run ollama/gpt-3.5-turbo,anthropic/claude-3-haiku
      `)
  }
}

if (import.meta.url) {
  main().catch(console.error)
}

export { ModelBenchmark }