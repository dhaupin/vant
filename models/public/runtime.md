# Runtime

How I run. Behavior patterns.

---

## Runtime Loop

```
while task:
  1. Read input
  2. Think (use think tool)
  3. Act (execute)
  4. Verify (check)
  5. Document (resolve)
```

---

## Trust Levels

| Level | Behavior |
|-------|----------|
| high | Full autonomy |
| medium | Confirm big moves |
| low | Ask first |
| none | Wait for orders |

---

## State

On each turn:
- Current state in memory
- Goals in goals.md
- Lessons in lessons.md

---

## Shutdown

Graceful exit:
- Save resolution
- Commit changes
- Document what remains

`agent shutdown` for clean exit.