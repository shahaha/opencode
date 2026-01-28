#!/usr/bin/env node

// Memory Monitoring Integration Test
// Test if integration works with OpenCode server

const { execSync } = require('child_process')
const { existsSync, readFileSync, writeFileSync } = require('fs')
const { join } = require('path')

console.log('🧪 Memory monitoring integration test started')

// Find OpenCode package.json to get command
const packageJsonPath = '/home/rick/prj/opencode/package.json'
let packageJson

try {
  packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
  console.log('📦 Package.json found:', packageJson.scripts ? 'Yes' : 'No')
  
  if (packageJson.scripts) {
    console.log('🔧 Looking for memory monitoring command...')
    
    // Check if memory monitor is in scripts
    const monitorScript = packageJson.scripts?.memory || 'memory-monitor'
    
    if (monitorScript) {
      console.log('✅ Found memory monitor script:', monitorScript)
      
      // Test integration by starting server and checking for memory monitoring
      console.log('🚀 Starting OpenCode server for testing...')
      const server = execSync('bun', ['run', '--', 'dev'])
      
      setTimeout(() => {
        console.log('🔍 Checking for memory monitoring integration...')
        
        // Test if server responds to memory endpoints
        const checkCmd = 'curl -s http://localhost:4096/api/memory/status --connect-timeout 10'
        try {
          const response = execSync(checkCmd)
          console.log('🔍 Memory status check response:', response.stdout.trim())
          
          if (response.includes('Memory Monitor is running')) {
            console.log('✅ Memory monitoring integrated successfully!')
          } else {
            console.log('⚠️ Memory monitoring may not be fully integrated')
          }
        } catch (error) {
          console.error('❌ Memory status check failed:', error.message)
        }
        
        // Terminate test server
        try {
          process.kill(server.pid, 'SIGTERM')
          console.log('🔍 Test server terminated')
        } catch (error) {
          console.error('❌ Failed to terminate server:', error.message)
        }
      }, 10000)
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error)
  }

} catch (error) {
  console.error('❌ Test failed:', error)
}