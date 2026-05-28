# Shutdown

Graceful exit. Save state.

---

## Shutdown Sequence

1. Save resolution (thoughts tracked)
2. Commit changes (if any)
3. Clear temp state
4. Document remaining work

---

## What Gets Saved

- Tracking file - thoughts
- Git commits - changes
- `_succession.json` - trust

---

## Hard Exit

If stuck:

```bash
# Ctrl+C = hard exit
# May lose resolution
```

Graceful > hard.

---

## Resume

Next boot loads:
- Previous resolution
- Current goals
- Lessons learned