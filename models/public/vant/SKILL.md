---
name: vant
description: >
  Git-based persistent memory system for AI agents. Agents inherit full context across sessions via markdown brain files 
  in models/public/. Use when AI agents need persistent memory, session inheritance, multi-agent coordination, 
  or brain-based context management. Supports islands (lazy-loading), MCP tools, steganography, and entropy optimization.
license: MIT
compatibility: Requires Node.js 18+, Git. Works with Claude Code, OpenAI Codex, Cursor, and any Git-enabled agent.
metadata:
  author: Vant Project
  version: "0.8.6"
  repo: https://github.com/dhaupin/vant
---

# Vant Agent Skill

Vant provides persistent memory for AI agents through Git-based brain files that persist across sessions.

## When to Use

Use this skill when:
- Building AI agents that need persistent memory across sessions
- Multi-agent coordination with branch-per-agent workflow
- Context optimization for long conversations
- Lazy-loading knowledge via islands
- Steganography for deniable brain persistence
- Entropy patching for context window optimization

## Key Concepts

### Brain Files

Vant brain files in `models/public/`:

| File | Purpose |
|------|---------|
| `identity.md` | Who the agent is, capabilities, current context |
| `goals.md` | Current objectives, pending work |
| `lessons.md` | Things learned worth remembering |
| `preferences.md` | Agent style, conventions |
| `errors.md` | Mistakes to avoid |
| `audit.md` | Action ledger for accountability |
| `succession.json` | Trust level configuration |

### Brain Commands

```bash
# Initialize brain
vant init

# Start session (load + sync + run)
vant start

# Sync brain with GitHub
vant sync [push|pull]

# Get/set brain files
vant get identity
vant set goals "new goal"

# Create/manage branches
vant branch create agent-name
vant branch switch agent-name
```

### Islands

Islands are lazy-loadable brain components for cold start optimization:

- `github` - GitHub API integration
- `gitlab` - GitLab API integration  
- `linear` - Linear issue tracking
- `stego` - PNG steganography

```bash
vant islands list    # Show available islands
vant islands load github  # Load specific island
```

## Context Optimization

### Entropy Patching

Replace low-value context with high-value tokens:

```javascript
// In resolution tracking
const patch = {
  lowEntropy: "repetitive explanation",
  highEntropy: "SEMANTIC_TOKEN:xyz"
};
```

### Adaptive Entropy

Auto-calibrate based on token count/temperature:

```bash
vant config get entropy.temperature
vant config set entropy.temperature 0.7
```

## Multi-Agent Coordination

### Branch-per-Agent Workflow

```bash
# Agent A creates branch for Agent B
vant branch create agent-b

# Agent B inherits brain
vant branch switch agent-b

# Merge collaboration
vant merge agent-b --squash
```

### Trust Levels

In `succession.json`:

```json
{
  "trust": "high|medium|low|none",
  "successor": "agent-name"
}
```

## MCP Tools

When using Vant as MCP server:

```bash
vant mcp    # Start MCP server
vant mcp -S  # HTTP mode
```

Tools available:
- vant_get_memory, vant_set_memory
- vant_list_branches, vant_create_branch, vant_switch_branch
- vant_commit, vant_sync
- vant_lock, vant_health
- vant_get_islands, vant_load_island

## File References

- [Getting Started](https://docs.creadev.org/vant/getting-started)
- [CLI Reference](https://docs.creadev.org/vant/reference/cli)
- [MCP Integration](https://docs.creadev.org/vant/integrations/mcp)