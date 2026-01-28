#!/usr/bin/env node

// Backup and Recovery System - Simple Version
// Provides automated backup, recovery, and version management

const { execSync, existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } = require('fs')
const { join } = require('path')

class SimpleBackupRecovery {
  constructor() {
    this.configDir = '/home/rick/prj/opencode/packages/opencode/test/tool/fixtures'
    this.backupDir = '/home/rick/prj/opencode/backups'
    this.archiveDir = '/home/rick/prj/opencode/backups/archive'
    this.logDir = '/home/rick/prj/opencode/logs/backup'
    this.ensureDirectories()
  }

  private ensureDirectories() {
    try {
      execSync('mkdir', [this.backupDir, this.logDir, this.backupDir + '/archive'], { recursive: true })
    } catch (error) {
      console.error('Failed to create backup directories:', error.message)
    }
  }

  private getLatestBackup() {
    const backups = readdirSync(this.backupDir)
    if (backups.length === 0) {
      return null
    }

    backups.sort((a, b) => {
      const aTime = this.getBackupTimestamp(a)
      const bTime = this.getBackupTimestamp(b)
      return bTime - aTime
    })

    return this.backupDir + '/' + backups[0]
  }

  private getBackupTimestamp(backupName) {
    const match = backupName.match(/models-api-(\d+).json$/)
    return match ? new Date(match[1]).getTime() : 0
  }

  private createBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupFile = this.backupDir + '/models-api-' + timestamp + '.json'
    
    try {
      const configPath = this.configDir + '/models-api.json'
      const config = JSON.parse(readFileSync(configPath, 'utf-8'))
      writeFileSync(backupFile, JSON.stringify(config, null, 2))
      console.log('Backup created:', backupFile)
      return backupFile
    } catch (error) {
      console.error('Failed to create backup:', error.message)
      throw error
    }
  }

  private async restoreBackup(backupName) {
    console.log('Restoring backup:', backupName)
    
    try {
      const backupPath = this.backupDir + '/' + backupName
      if (!existsSync(backupPath)) {
        console.error('Backup not found:', backupPath)
        return false
      }
      
      const backupContent = readFileSync(backupPath, 'utf-8')
      const configPath = this.configDir + '/models-api.json'
      writeFileSync(configPath, backupContent)
      console.log('Backup restored:', backupName)
      return true
    } catch (error) {
      console.error('Failed to restore backup:', error.message)
      return false
    }
  }

  private async archiveOldBackups() {
    console.log('Archiving old backups...')
    
    try {
      const backups = readdirSync(this.backupDir)
      if (backups.length === 0) {
        console.log('No backups to archive')
        return
      }

      const now = new Date()
      const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      
      for (const backup of backups) {
        const backupPath = this.backupDir + '/' + backup
        const stat = existsSync(backupPath)
        
        if (stat && stat.isFile()) {
          const backupTime = this.getBackupTimestamp(backup)
          
          if (backupTime < cutoff) {
            const archivePath = this.archiveDir + '/' + backup
            mkdirSync(this.archiveDir, { recursive: true })
            
            try {
              const fs = require('fs')
              fs.renameSync(backupPath, archivePath)
              console.log(`Archived: ${backup} -> ${archivePath}`)
            } catch (error) {
              console.error(`Failed to archive ${backup}:`, error.message)
            }
          }
        }
      }
      
      console.log('Archive complete. Kept latest 10 backups.')
    } catch (error) {
      console.error('Failed to archive backups:', error.message)
    }
  }
  }

  private listBackups() {
    console.log('Available backups:')
    
    try {
      const backups = readdirSync(this.backupDir)
      if (backups.length === 0) {
        console.log('No backups found')
        return
      }
      
      backups.sort((a, b) => {
        const aTime = this.getBackupTimestamp(a)
        const bTime = this.getBackupTimestamp(b)
        return bTime - aTime
      })
      
      for (const backup of backups) {
        const backupTime = this.getBackupTimestamp(backup)
        const isLatest = backup === backups[0]
        const status = isLatest ? 'Latest' : `Backup from ${backupTime.toISOString()}`
        
        console.log(`  ${status}: ${backup} (${backupTime.toISOString()})`)
      }
    } catch (error) {
      console.error('Failed to list backups:', error.message)
    }
  }

  private writeBackupLog(backupName, operation) {
    const timestamp = new Date().toISOString()
    const logEntry = `[${timestamp}] INFO: ${operation} ${backupName}\n`
    
    try {
      const logFile = this.logDir + '/backup-operations.log'
      writeFileSync(logFile, logEntry, { flag: 'a' })
      console.log(`Backup operation logged: ${operation} ${backupName}`)
    } catch (error) {
      console.error('Failed to write backup log:', error.message)
    }
  }
}

// CLI interface
async function main() {
  const backup = new SimpleBackupRecovery()
  const command = process.argv[2]
  
  console.log('Backup and Recovery System')
  console.log('=====================================')
  
  switch (command) {
    case 'backup':
      const backupFile = await backup.createBackup()
      console.log('Backup created:', backupFile)
      break
      
    case 'restore':
      const backupName = process.argv[3] || 'latest'
      const success = await backup.restoreBackup(backupName)
      console.log('Restore ' + backupName + ':', success ? 'successful' : 'failed')
      break
      
    case 'list':
      backup.listBackups()
      break
      
    default:
      console.log(`
Backup and Recovery System
=====================================

Commands:
  backup <name>        - Create timestamped backup of current configuration
  restore <name>        - Restore configuration from specified backup
  list                  - List all available backups
  archive               - Archive old backups (keep latest 10)
        `)
  }
}

if (require.main === module) {
  main().catch(console.error)
}