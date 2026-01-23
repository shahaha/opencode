#!/usr/bin/env node

// Test script for auto repair verification
import { writeFile, appendFile } from "fs/promises"
import { join } from "path"

const testFile = join(process.cwd(), "test-auto-verification.html")

const testContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Test Auto Verification</title>
</head>
<body>
    <h1>Test Page</h1>
    <p>This is a test file for auto repair verification.</p>
    <script>
        console.log("Test page loaded");
    </script>
</body>
</html>
`

console.log("Creating test file:", testFile)
await writeFile(testFile, testContent)
console.log("Test file created. Wait a few seconds...")

// Wait 3 seconds
await new Promise((resolve) => setTimeout(resolve, 3000))

// Modify the file to trigger change event
console.log("Modifying test file...")
const modifiedContent = testContent.replace("Test Page", "Modified Test Page")
await writeFile(testFile, modifiedContent)
console.log("Test file modified. Wait for auto verification...")

// Wait 10 seconds to see if verification triggers
await new Promise((resolve) => setTimeout(resolve, 10000))

console.log("Test completed. Check OpenCode logs for auto verification messages.")
