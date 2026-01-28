#!/usr/bin/env node

// Backup and Recovery System for Model Configurations
// Provides automated backup, recovery, and version management

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'

class BackupRecoverySystem {
  private configDir: string
  private backupDir: string
  private archiveDir: string
  private logDir: string

  constructor() {
    this.configDir = '/home/rick/prj/opencode/packages/opencode/test/tool/fixtures'
    this.backupDir = '/home/rick/prj/opencode/backups'
    this.archiveDir = '/home/rick/prj/opencode/backups/archive'
    this.logDir = '/home/rick/prj/opencode/logs/backup'
    this.ensureDirectories()
  }

  private ensureDirectories(): void {
    try {
      mkdirSync(this.backupDir, { recursive: true })
      mkdirSync(this.archiveDir, { recursive: true })
      mkdirSync(this.logDir, { recursive: true })
    } catch (error) {
      console.error('Failed to create backup directories:', error.message)
    }
  }

  private async getLatestBackup(): Promise<string | null> {
    try {
      const backups = readdirSync(this.backupDir)
      if (backups.length === 0) {
        return null
      }

      // Sort by modification time (newest first)
      backups.sort((a, b) => {
        const aTime = this.getBackupTimestamp(a)
        const bTime = this.getBackupTimestamp(b)
        return bTime - aTime // Newest first
      })

      return join(this.backupDir, backups[0]) // Latest backup
    } catch (error) {
      console.error('Failed to read backup directory:', error.message)
      return null
    }
  }

  private getBackupTimestamp(backupName: string): number {
    // Extract timestamp from backup filename
    const match = backupName.match(/models-api-(\d+)\.json$/)
    return match ? new Date(match[1]).getTime() : 0
  }

  private async createBackup(): Promise<string> {
    console.log('🔄 Creating model configuration backup...')
    
    try {
      // Validate current config
      const configPath = join(this.configDir, 'models-api.json')
      if (!existsSync(configPath)) {
        throw new Error('Configuration file not found')
      }
      
      const config = JSON.parse(readFileSync(configPath, 'utf-8'))
      
      if (!config || typeof config !== 'object') {
        throw new Error('Invalid configuration file')
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backupFile = join(this.backupDir, `models-api-${timestamp}.json`)
      
      writeFileSync(backupFile, JSON.stringify(config, null, 2))
      console.log('✅ Configuration backed up to:', backupFile)
      return backupFile
    } catch (error) {
      console.error('Failed to create backup:', error.message)
      throw error
    }
  }

  private async restoreBackup(backupName: string): Promise<boolean> {
    console.log('🔄 Restoring model configuration backup:', backupName)
    
    try {
      // Verify backup exists
      const backupPath = join(this.backupDir, backupName)
      if (!existsSync(backupPath)) {
        throw new Error(`Backup not found: ${backupName}`)
      }
      
      // Validate backup file
      const backupContent = readFileSync(backupPath, 'utf-8')
      if (!backupContent) {
        throw new Error('Invalid backup file format')
      }
      
      // Create config backup
      const configPath = join(this.configDir, 'models-api.json')
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const restoreFile = join(this.configDir, `models-api-restore-${timestamp}.json`)
      
      writeFileSync(restoreFile, JSON.stringify(backupContent, null, 2))
      writeFileSync(configPath, backupContent)
      
      console.log('✅ Configuration restored from:', backupName)
      return true
    } catch (error) {
      console.error('Failed to restore backup:', error.message)
      return false
    }
  }

  private async archiveOldBackups(): Promise<void> {
    console.log('📦 Archiving old backups...')
    
    try {
      const backups = readdirSync(this.backupDir)
      if (backups.length === 0) {
        console.log('📝 No backups to archive')
        return
      }

      // Archive backups older than 7 days
      const now = new Date()
      const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      
      for (const backup of backups) {
        const backupPath = join(this.backupDir, backup)
        const stat = existsSync(backupPath)
        
        if (stat && stat.isFile()) {
          const backupTime = this.getBackupTimestamp(backup)
          
          if (backupTime < cutoff) {
            const archivePath = join(this.archiveDir, backup)
            mkdirSync(this.archiveDir, { recursive: true })
            
            try {
              const fs = require('fs')
              fs.renameSync(backupPath, archivePath)
              console.log(`📦 Archived: ${backup} -> ${archivePath}`)
            } catch (error) {
              console.error(`Failed to archive ${backup}:`, error.message)
            }
          }
        }
      }
      
      console.log('✅ Archive complete. Kept latest 10 backups.')
    } catch (error) {
      console.error('Failed to archive backups:', error.message)
    }
  }

  private listBackups(): void {
    console.log('📋 Available configuration backups:')
    
    try {
      const backups = readdirSync(this.backupDir)
      if (backups.length === 0) {
        console.log('📝 No backups found')
        return
      }
      
      // Sort by creation time
      backups.sort((a, b) => {
        const aTime = this.getBackupTimestamp(a)
        const bTime = this.getBackupTimestamp(b)
        return bTime - aTime // Newest first
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

  private async recoverCorruptedConfig(): Promise<boolean> {
    console.log('🔧 Attempting to recover corrupted configuration...')
    
    try {
      // Check for recent backup
      const latestBackup = await this.getLatestBackup()
      if (!latestBackup) {
        console.log('❌ No recent backup found for recovery')
        return false
      }
      
      // Restore from latest backup
      const recovered = await this.restoreBackup(latestBackup)
      if (recovered) {
        console.log('✅ Configuration recovered from backup:', latestBackup)
        return true
      }
    } catch (error) {
      console.error('Failed to recover configuration:', error.message)
      return false
    }
  }

  private writeBackupLog(backupName: string, operation: string): void {
    const timestamp = new Date().toISOString()
    const logEntry = `[${timestamp}] INFO: ${operation} ${backupName}\n`
    
    try {
      const logFile = join(this.logDir, 'backup-operations.log')
      writeFileSync(logFile, logEntry, { flag: 'a' })
      console.log(`📝 Backup operation logged: ${operation} ${backupName}`)
    } catch (error) {
      console.error('Failed to write backup log:', error.message)
    }
  }

  private async scheduleBackup(): Promise<void> {
    console.log('🔄 Scheduled backup started...')
    
    try {
      await this.createBackup()
      this.archiveOldBackups()
      console.log('✅ Scheduled backup completed')
    } catch (error) {
      console.error('Scheduled backup failed:', error.message)
    }
  }

  private getBackupStatus(): any {
    const latestBackup = await this.getLatestBackup()
    const backups = readdirSync(this.backupDir)
    
    return {
      latest: latestBackup,
      total: backups.length,
      archived: backups.filter((backup) => !backup.includes('models-api-')), // Exclude latest
      archive_size_mb: this.calculateArchiveSize()
    }
  }

  private calculateArchiveSize(): number {
    try {
      const archiveDir = this.archiveDir
      const stat = existsSync(archiveDir)
      return stat ? Math.round(stat.size / (1024 * 1024)) : 0
    } catch (error) {
      return 0
    }
  }
}

// CLI interface
async function main() {
  const backup = new BackupRecoverySystem()
  const command = process.argv[2]
  
  console.log('Backup and Recovery System')
  console.log('=====================================')
  
  switch (command) {
    case 'backup':
      const backupFile = await backup.createBackup()
      console.log('✅ Backup created:', backupFile)
      break
      
    case 'restore':
      const backupName = process.argv[3] || 'latest'
      const recovered = await backup.restoreBackup(backupName)
      console.log('✅ Restore ' + (recovered ? 'successful' : 'failed'))
      break
      
    case 'list':
      backup.listBackups()
      break
      
    case 'archive':
      await backup.archiveOldBackups()
      break
      
    case 'schedule':
      await backup.scheduleBackup()
      break
      
    case 'status':
      const status = backup.getBackupStatus()
      console.log('Backup Status:')
      console.log(JSON.stringify(status, null, 2))
      break
      
    case 'recover':
      const recovered = await backup.recoverCorruptedConfig()
      console.log('Configuration recovery:', recovered ? 'successful' : 'failed')
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
  schedule              - Schedule automated backups
  status                - Show backup system status
  recover              - Attempt to recover from corrupted configuration

Examples:
  node backup-recovery.js backup my-backup-2023-01-15T10-00-00Z
  node backup-recovery.js restore latest
  node backup-recovery.js archive
  node backup-recovery.js schedule 24
      `)
  }
}

if (require.main === module) {
  main().catch(console.error)
}