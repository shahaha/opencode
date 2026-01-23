#!/usr/bin/env node

import { readFile, writeFile, chmod } from "fs/promises"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export class GitHooksIntegration {
  constructor(config = {}) {
    this.config = {
      hooksDir: config.hooksDir || ".git/hooks",
      postCommitHook: config.postCommitHook ?? true,
      prePushHook: config.prePushHook ?? true,
      postMergeHook: config.postMergeHook ?? true,
      verifierConfig: config.verifierConfig || {},
      ...config,
    }
  }

  async install() {
    console.log("🔧 Installing Git hooks integration...")

    try {
      // Create hooks directory if it doesn't exist
      const hooksDir = this.config.hooksDir

      // Install post-commit hook
      if (this.config.postCommitHook) {
        await this.installHook("post-commit", this.generatePostCommitHook())
      }

      // Install pre-push hook
      if (this.config.prePushHook) {
        await this.installHook("pre-push", this.generatePrePushHook())
      }

      // Install post-merge hook
      if (this.config.postMergeHook) {
        await this.installHook("post-merge", this.generatePostMergeHook())
      }

      console.log("✅ Git hooks integration installed successfully")
      console.log("📋 Installed hooks:")
      if (this.config.postCommitHook) console.log("  - post-commit: 修復驗證")
      if (this.config.prePushHook) console.log("  - pre-push: 推送到遠端前的驗證")
      if (this.config.postMergeHook) console.log("  - post-merge: 合併後的驗證")
    } catch (error) {
      console.error("❌ Failed to install Git hooks:", error.message)
      throw error
    }
  }

  async uninstall() {
    console.log("🔧 Uninstalling Git hooks integration...")

    try {
      const hooks = ["post-commit", "pre-push", "post-merge"]

      for (const hook of hooks) {
        await this.removeHook(hook)
      }

      console.log("✅ Git hooks integration uninstalled successfully")
    } catch (error) {
      console.error("❌ Failed to uninstall Git hooks:", error.message)
      throw error
    }
  }

  async installHook(hookName, hookContent) {
    const hookPath = join(this.config.hooksDir, hookName)

    try {
      // Check if hook already exists
      const existingContent = await readFile(hookPath, "utf8").catch(() => null)

      if (existingContent && !existingContent.includes("# OpenCode Repair Verifier")) {
        // Backup existing hook
        const backupPath = `${hookPath}.backup`
        await writeFile(backupPath, existingContent)
        console.log(`  📋 Backed up existing ${hookName} hook to ${backupPath}`)
      }

      // Write new hook (creates file if it doesn't exist)
      await writeFile(hookPath, hookContent)
      await chmod(hookPath, 0o755) // Make executable

      console.log(`  ✅ Installed ${hookName} hook`)
    } catch (error) {
      console.error(`  ❌ Failed to install ${hookName} hook:`, error.message)
      throw error
    }
  }

  async removeHook(hookName) {
    const hookPath = join(this.config.hooksDir, hookName)
    const backupPath = `${hookPath}.backup`

    try {
      // Check if our hook exists
      const content = await readFile(hookPath, "utf8").catch(() => null)

      if (content && content.includes("# OpenCode Repair Verifier")) {
        // Check if there's a backup
        const backupContent = await readFile(backupPath, "utf8").catch(() => null)

        if (backupContent) {
          // Restore backup
          await writeFile(hookPath, backupContent)
          console.log(`  📋 Restored original ${hookName} hook from backup`)
        } else {
          // Remove our hook
          await writeFile(hookPath, "")
          console.log(`  🗑️  Removed ${hookName} hook`)
        }
      } else {
        console.log(`  ℹ️  ${hookName} hook not managed by OpenCode, skipping`)
      }
    } catch (error) {
      console.log(`  ⚠️  Could not process ${hookName} hook:`, error.message)
    }
  }

  generatePostCommitHook() {
    const configJson = JSON.stringify(this.config.verifierConfig, null, 2)

    return `#!/bin/sh
# OpenCode Repair Verifier - Post Commit Hook

# Only run verification if this is not a merge commit or amend
if [ "$GIT_AUTHOR_NAME" = "" ] || [ "$GIT_AUTHOR_EMAIL" = "" ]; then
  echo "Skipping repair verification (merge or amend commit)"
  exit 0
fi

echo "🔧 Running post-commit repair verification..."

# Get the current commit hash
COMMIT_HASH=$(git rev-parse HEAD)
DEPLOY_URL="${this.config.verifierConfig.url || "http://100.94.136.15:9100/"}"

# Run verification
node -e "
import { PostRepairHook } from './packages/opencode/repair-verifier/hooks/post-repair-hook.js';

const hook = new PostRepairHook(${configJson.replace(/"/g, '\\"')});
const result = await hook.execute({
  deployUrl: process.env.DEPLOY_URL || '$DEPLOY_URL',
  commitHash: process.env.COMMIT_HASH || '$COMMIT_HASH',
  repairId: process.env.COMMIT_HASH || '$COMMIT_HASH',
});

if (!result.success) {
  console.error('❌ Post-commit verification failed');
  process.exit(1);
}
"

if [ $? -ne 0 ]; then
  echo "❌ Post-commit verification failed - commit rejected"
  exit 1
fi

echo "✅ Post-commit verification passed"
exit 0
`
  }

  generatePrePushHook() {
    const configJson = JSON.stringify(this.config.verifierConfig, null, 2)

    return `#!/bin/sh
# OpenCode Repair Verifier - Pre Push Hook

echo "🔧 Running pre-push repair verification..."

# Get the remote and branch info
while read local_ref local_sha remote_ref remote_sha; do
  if [ "$local_sha" = $z40 ]; then
    # Branch deleted, skip verification
    continue
  fi

  DEPLOY_URL="${this.config.verifierConfig.url || "http://100.94.136.15:9100/"}"

  echo "Verifying push to $remote_ref ($local_sha)"

  # Run verification
  node -e "
  import { RepairVerifier } from './packages/opencode/repair-verifier/index.js';

  const verifier = new RepairVerifier(${configJson.replace(/"/g, '\\"')});
  const result = await verifier.verifyFrontendRepairs(process.env.DEPLOY_URL || '$DEPLOY_URL');

  if (!result.success) {
    console.error('❌ Pre-push verification failed');
    process.exit(1);
  }
  "

  if [ $? -ne 0 ]; then
    echo "❌ Pre-push verification failed - push rejected"
    exit 1
  fi
done

echo "✅ Pre-push verification passed"
exit 0
`
  }

  generatePostMergeHook() {
    const configJson = JSON.stringify(this.config.verifierConfig, null, 2)

    return `#!/bin/sh
# OpenCode Repair Verifier - Post Merge Hook

echo "🔧 Running post-merge repair verification..."

# Only run if this was a merge (not a fast-forward)
if [ $GITHEAD != $(git rev-parse HEAD) ]; then
  DEPLOY_URL="${this.config.verifierConfig.url || "http://100.94.136.15:9100/"}"

  # Run verification
  node -e "
  import { RepairVerifier } from './packages/opencode/repair-verifier/index.js';

  const verifier = new RepairVerifier(${configJson.replace(/"/g, '\\"')});
  const result = await verifier.verifyFrontendRepairs(process.env.DEPLOY_URL || '$DEPLOY_URL');

  if (!result.success) {
    console.error('❌ Post-merge verification failed - please check your merge');
    exit 1;
  }
  "

  if [ $? -ne 0 ]; then
    echo "❌ Post-merge verification failed"
    exit 1
  fi

  echo "✅ Post-merge verification passed"
else
  echo "Fast-forward merge, skipping verification"
fi

exit 0
`
  }

  // Utility method to check if hooks are installed
  async checkStatus() {
    const hooks = ["post-commit", "pre-push", "post-merge"]
    const status = {}

    for (const hook of hooks) {
      const hookPath = join(this.config.hooksDir, hook)
      try {
        const content = await readFile(hookPath, "utf8")
        status[hook] = {
          installed: content.includes("# OpenCode Repair Verifier"),
          executable: true, // We'll assume it's executable if we can read it
        }
      } catch (error) {
        status[hook] = {
          installed: false,
          executable: false,
        }
      }
    }

    return status
  }
}

// CLI interface for easy installation
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2]

  if (command === "install") {
    const integration = new GitHooksIntegration()
    integration.install().catch(console.error)
  } else if (command === "uninstall") {
    const integration = new GitHooksIntegration()
    integration.uninstall().catch(console.error)
  } else if (command === "status") {
    const integration = new GitHooksIntegration()
    integration
      .checkStatus()
      .then((status) => {
        console.log("Git Hooks Status:")
        Object.entries(status).forEach(([hook, info]) => {
          const icon = info.installed ? "✅" : "❌"
          console.log(`  ${icon} ${hook}: ${info.installed ? "已安裝" : "未安裝"}`)
        })
      })
      .catch(console.error)
  } else {
    console.log("Usage: node git-hooks-integration.js <install|uninstall|status>")
  }
}
