# OpenCode Skills System Analysis

## 🎯 Current Skills Capability

### ✅ Available Skills

#### 1. **playwright** - Browser Automation

- **Status**: ✅ Available via MCP server
- **Capabilities**:
  - Browser navigation and interaction
  - Screenshot capture
  - Element interaction and form filling
  - Network request monitoring
  - Dialog handling
- **Usage**: `skill_mcp` with `mcp_name="playwright"`

#### 2. **test-skill** - Testing Skill

- **Status**: ✅ Locally available
- **Location**: `/home/rick/prj/opencode/.opencode/skill/test-skill/`
- **Description**: Test skill implementation

### ❌ Not Currently Available

#### **librarian** - Research & Documentation

- **Status**: ❌ Not found in local skills
- **Note**: Previously used in conversations, may be available through other means

#### **explore** - Code Exploration

- **Status**: ❌ Not found in local skills
- **Note**: Codebase exploration tools available through standard tools

### 🔧 Skills Architecture

OpenCode uses a hybrid skills system:

1. **Local Skills**: Stored in `.opencode/skill/` directories with `SKILL.md` files
2. **MCP Skills**: External MCP servers providing specialized capabilities
3. **Built-in Tools**: Standard OpenCode tools available without skill loading

### 📋 Skills Discovery Process

```typescript
// From src/skill/skill.ts
const OPENCODE_SKILL_GLOB = new Bun.Glob("{skill,skills}/**/SKILL.md")
const CLAUDE_SKILL_GLOB = new Bun.Glob("skills/**/SKILL.md")

// Scans multiple directories:
- Project-level: .opencode/skill/
- Global: ~/.claude/skills/
- OpenCode-specific locations
```

### 🚀 Current Status Summary

**✅ We DO have skills capability:**

- Playwright browser automation via MCP
- Local skill system infrastructure
- Skill loading and management tools

**⚠️ Limitations:**

- Limited number of available skills
- Some skills referenced in conversations may not be locally available
- MCP server dependencies for advanced skills

**🎯 Recommendations:**

1. Expand local skill collection
2. Document available MCP servers
3. Create skill development guidelines
4. Add skill testing and validation procedures
