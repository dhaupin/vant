# Bootstrap

How to load this brain. Startup sequence.

---

## Boot Order

1. Load identity.md - Who I am
2. Load boundaries.md - Hard lines
3. Load succession.json - Trust level
4. Load goals.md - Current tasks
5. Load lessons.md - What I've learned

---

## Islands (Lazy Load)

Islands load on-demand:

```
vant islands load github    # GitHub integration
vant islands load linear   # Linear issues
vant islands load mcp    # MCP tools
```

Full load: `vant islands list`

---

## Startup Commands

```bash
node bin/vant.js start        # Full startup
node bin/vant.js health       # Diagnostics
node bin/vant.js onboard    # Browse brain
node bin/vant.js sync        # GitHub sync
```

---

## What Loads First

priority = [
  "identity",
  "boundaries",
  "goals", 
  "lessons",
  "succession"
]

Context loads fast. Depth loads later.