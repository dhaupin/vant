# MEM.md — scratch dump (tmp-style)

This file is a **catch-all dump space**. Dump whatever you're in the middle of
so a crash/reset loses nothing — no commits needed, no ceremony, nothing here
is precious. Think `/tmp`: scratch state, not history.

## What belongs here

- Half-finished edits and what you were about to try next
- Working hypotheses, pending greps, "check this later" leads
- Current branch/HEAD at dump time (rough, not a release note)
- Any in-flight state that a `git status` won't show

## What does NOT belong here

- Durable lessons (those go in `labs/TASKS.md` or the agent priv brain)
- Anything already committed (git remembers; don't duplicate)
- Templates, procedure docs, polished summaries

## Rules

- Dump freely, overwrite freely — it's scratch
- NO commit ceremony; update it in place whenever context is worth keeping
- When resuming: scan this file first, then `labs/TASKS.md` for durable state
- It's fine for this file to be stale — never block on cleaning it up

---
---

# CURRENT DUMP

**When:** 2026-09-21, during fs→storage cohesion pass (axolotl)
**Branch:** axolotl @ ~203caa6 (succession + audit migrated)

## In-flight

- fs→storage queue: islands.js (6 sites) → tmp.js (9) → skills.js (9) →
  stego/backup/sync/server → transform.js (46, biggest blast radius)
- bin/sync.js axolotl-branch awareness still open
- dead-export removal per DEAD_EXPORTS.md still open

## Leads / rough notes

- storage `read()` → null on missing, `has()` → bool, write = atomic+mkdirs
- stores keyed by resolved brain path when following pushBrain (succession/audit
  pattern); path constants captured at module load = multibrain bug
- no `storage:*` event listeners exist yet → routing audit-ish modules through
  storage is re-entrancy-safe today (recheck if listeners get added)
- `models/private/undefined` 0-byte artifact deleted; hunt the writer if returns
- str_replace unreliable on lib/brain.js (even < line 2200) and can PARTIALLY
  apply multi-edits — grep-verify every removal, use node-script fallback there
