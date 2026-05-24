# Islands

Modular integrations. Load on-demand.

---

## What Are Islands

Islands = lazy-loaded integrations:

- GitHub API
- Linear issues
- MCP tools
- Git operations

---

## Using Islands

```bash
vant islands list           # Show available
vant islands load github  # Load one
vant islands load all    # Load all
```

---

## Island Files

Each island in `islands/`:
- config.json - credentials
- boot.js - loader

---

## Lazy Loading

Islands load when needed:
- Not at boot (slow)
- When called (fast)

That's efficiency.