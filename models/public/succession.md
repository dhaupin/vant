# Succession

How this brain relates to previous versions.

---

## Previous Brain

| Property | Value |
|----------|-------|
| Version | 0.8.2 |
| Commit | 8fed7d2 |
| Date | 2026-04-19 |
| Label | Full public model (19 files) |

---

## Registry

- **Type:** Git ref
- **Path:** refs/heads/main
- **Ledger:** models/.ledger.json

The registry tracks which brain version is currently active and maintains the chain of succession.

---

## Trust Levels

| Level | Behavior |
|-------|----------|
| high | Trust previous brain fully, inherit all memories |
| medium | Trust but verify, cherry-pick key learnings |
| low | Treat previous brain as reference only, start fresh |
| none | Ignore previous brain completely |

**Default:** medium

---

## Ledger

The ledger is a JSON file that records:
- Each succession event (when brain changed)
- Who initiated the change
- What files changed
- Verification hash

See: models/.ledger.json

---

## Current Version

This is **v0.8.4** - container for dev new stuff.
