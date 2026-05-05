---
version: 0.8.6
permalink: /guides/cli.html
layout: default
title: CLI Reference
nav_order: 5
---
# CLI Reference

All Vant commands.

---

## Core Commands

| Command | Use For |
|---------|---------|
| vant start | Full startup |
| vant health | Check system |
| vant sync | Pull/push brain |
| vant load | Load brain |
| vant onboard | Browse brain |

---

## Options

### health

```bash
vant health          # Full output
vant health --quiet  # Minimal
```

### sync

```bash
vant sync           # Pull + push
vant sync --pull    # Pull only
vant sync --push    # Push only
```

---

## MCP

```bash
vant mcp --server           # HTTP server
vant mcp --stdio           # STDIO mode
vant mcp --server --port 3456
```

---

## Branch

```bash
vant branch list         # List branches
vant branch checkout    # Switch branch
vant branch create      # Create branch
```

---

## Succession

```bash
vant succession            # Show version
vant succession trust high # Set trust
```

---

## Other

```bash
vant rate          # Check rate limit
vant update       # Check updates
vant setup        # Initial setup
```

---

## See Also

- [Operations](guides/operations)
- [AI Onboarding](guides/ai-onboard)
