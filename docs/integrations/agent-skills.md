---
version: 0.8.6
permalink: /integrations/agent-skills
layout: default
title: Agent Skills
nav_order: 30
description: Using Vant with Agent Skills format (Claude Code, Codex, Cursor)
---

# Agent Skills

Vant supports the [Agent Skills](https://agentskills.io) specification, making it compatible with Claude Code, OpenAI Codex, Cursor, and other AI agents.

## Format

Vant exports a skill in the Agent Skills format:

```
vant/
├── SKILL.md                    # Required: YAML frontmatter + instructions
├── references/
│   ├── context-optimization.md # Entropy, semantic seeds, budgets
│   └── multi-agent.md          # Branch workflow, trust levels
└── ...
```

## SKILL.md Frontmatter

```yaml
---
name: vant
description: >
  Git-based persistent memory system for AI agents. Agents inherit full context across 
  sessions via markdown brain files. Use when AI agents need persistent memory,
  session inheritance, or multi-agent coordination.
license: MIT
compatibility: Requires Node.js 18+, Git
metadata:
  author: Vant Project
  version: "0.8.6"
  repo: https://github.com/dhaupin/vant
---
```

## Installation

```bash
# Export Vant as a skill
vant skills:export

# Or manually copy
cp -r models/public/vant ~/.claude/skills/
```

## When to Use

Activate this skill when:
- Building AI agents that need persistent memory
- Multi-agent coordination with branch-per-agent workflow
- Context optimization for long conversations
- Lazy-loading knowledge via islands
- Steganography for deniable persistence

## Commands

| Command | Description |
|---------|-------------|
| `vant init` | Initialize brain |
| `vant start` | Start session (load + sync + run) |
| `vant sync` | Sync brain with GitHub |
| `vant islands list` | Show available islands |
| `vant config set` | Set configuration |

## Islands

Islands are lazy-loadable brain components:

- `github` - GitHub API integration
- `gitlab` - GitLab API integration
- `linear` - Linear issue tracking
- `stego` - PNG steganography

## Context Optimization

### Entropy Patching

Replace low-value context with high-value tokens:

```javascript
const patch = {
  lowEntropy: "repetitive explanation",
  highEntropy: "SEMANTIC_TOKEN:xyz"
};
```

### Semantic Seeds

Place high-value context early in identity.md:

```markdown
CRITICAL_CONTEXT:
- Current objective: {goal}
- Blocked by: {blocker}
- Next step: {next_action}
```

## Multi-Agent Coordination

### Branch-per-Agent Workflow

```bash
# Agent A starts work
vant branch create agent-a
vant sync push

# Agent B takes over
vant branch switch agent-a
vant sync pull
vant branch create agent-b
```

### Trust Levels

| Level | Autonomy |
|-------|----------|
| high | Full |
| medium | Most decisions |
| low | Limited |
| none | Wait for instructions |

## Related

- [Getting Started](getting-started/quick-start)
- [MCP Integration](reference/mcp-tools)
- [Multi-Agent Guide](essential/multi-agent)