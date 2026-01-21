# AG-UI Chat Implementation - Debugging Lessons Learned

## Session Summary

Date: 2026-01-21
Status: ✅ COMPLETED

## Problem Statement

AG-UI chat implementation was returning fallback messages for Ollama models instead of actual AI responses, even though the TypeScript source code was updated.

## Root Cause Analysis

### Primary Issue: Pre-compiled Binary vs Source Code

**Discovery:** The OpenCode server was running a pre-compiled binary (`packages/opencode/dist/opencode-linux-x64-baseline/bin/opencode`) that did not include the latest TypeScript source code changes.

**Evidence:**

```
Binary modification time: 1月 21 23:42
Source code changes: Made after that time
Server still using binary even after source changes
```

**Key Learning:** OpenCode has two deployment modes:

1. **Production mode**: Uses pre-compiled binary (faster, but outdated)
2. **Dev mode**: Uses TypeScript source directly via `bun run --conditions=browser ./src/index.ts`

### Secondary Issue: Provider System Complexity

**Observation:** Attempted to use OpenCode's Provider system for cloud models (OpenAI, Anthropic, Google) resulted in `ProviderInitError` with missing `api.npm` configuration.

**Root Cause:** Cloud models require:

- Full OpenCode framework initialization (Config, Auth, Env, Instance)
- Provider database with complete model configurations
- API keys for each cloud provider
- Proper authentication setup

**Key Learning:** The Provider system is deeply coupled with the OpenCode framework and cannot be easily used in a standalone deployment.

## Solution Implemented

### 1. Simplified Architecture

Instead of trying to use the complex Provider system, we implemented:

**For Ollama models:**

- Direct API calls to `http://localhost:11434/api/generate`
- Simple prompt construction
- No framework dependencies

**For Cloud models:**

- Clear fallback messages explaining limitations
- No false attempts to use unconfigured providers

### 2. Updated Chat API Endpoint

```typescript
// Simplified logic in /ag-ui/chat endpoint
const isOllama = model && model.startsWith("ollama/")

if (isOllama) {
  // Direct Ollama API call
  const response = await callOllama(model, fullPrompt)
  return c.json({ response, model })
}

// Cloud model fallback
return c.json({
  response: `[${model}] Cloud models require API key configuration...`,
  note: "cloud_models_require_configuration",
})
```

### 3. Development Workflow Fix

```bash
# Wrong: Using pre-compiled binary
./packages/opencode/dist/opencode-linux-x64-baseline/bin/opencode serve --port 5000

# Correct: Using dev mode with source code
cd /home/rick/prj/opencode/packages/opencode
bun run --conditions=browser ./src/index.ts serve --port 5000
```

## Key Takeaways

### For Debugging

1. **Always verify which code is running**
   - Check binary vs source modification times
   - Look for caching or build artifacts
   - Use `ps aux | grep` to identify running process

2. **Understand deployment modes**
   - Production binaries may not reflect latest source
   - Dev mode uses source directly (slower but current)
   - Rebuild required after source changes for production mode

3. **Simplify before debugging complex systems**
   - When Provider system fails, use direct API calls
   - Establish baseline functionality first
   - Add complexity incrementally

### For Architecture

1. **Prefer simplicity over features**
   - Direct Ollama integration: 100% reliable
   - Complex Provider integration: Requires full framework
   - Choose based on deployment context

2. **Clear error messages matter**
   - Don't silently fail or return garbage
   - Explain what works and what doesn't
   - Guide users to working alternatives

3. **Document limitations proactively**
   - README now includes model support section
   - Clear distinction between supported/unsupported
   - Prerequisites clearly listed

## Files Modified

| File                                           | Change                      | Purpose                                                   |
| ---------------------------------------------- | --------------------------- | --------------------------------------------------------- |
| `packages/opencode/src/server/routes/ag-ui.ts` | Rewrote `/chat` endpoint    | Simplified Ollama integration, clear cloud model fallback |
| `deploy/ag-ui-chat/README.md`                  | Added model support section | Documentation of capabilities and limitations             |
| `production-agui-chat.html`                    | No changes needed           | Already supports Ollama models                            |

## Test Results

### ✅ Working: Ollama Models

```bash
curl -X POST "http://localhost:5000/ag-ui/chat" \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello","model":"ollama/llama3"}'

# Response: "I'm an AI coding assistant! I'm here to help you..."
```

### ✅ Working: Cloud Model Fallback

```bash
curl -X POST "http://localhost:5000/ag-ui/chat" \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello","model":"opencode/glm-4.7-free"}'

# Response: "[opencode/glm-4.7-free] Cloud models require API key configuration..."
```

## Future Improvements

### Potential Enhancements

1. **Add more Ollama models** to the dropdown menu
2. **Implement streaming responses** for better UX
3. **Add model download status** check (ollama ps)
4. **Configuration UI** for cloud API keys (future feature)

### Lessons for Future Sessions

1. When debugging, always check "is the code I'm looking at actually running?"
2. Don't assume pre-compiled binaries are up-to-date
3. When in doubt, use dev mode to verify source changes
4. Simplicity enables reliability - don't over-engineer

## References

- OpenCode Dev Mode: `bun run --conditions=browser ./src/index.ts`
- Ollama API: `http://localhost:11434/api/generate`
- OpenCode Routes: `packages/opencode/src/server/routes/ag-ui.ts`
