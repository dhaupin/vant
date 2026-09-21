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
**Branch:** axolotl @ ~dfeed08 (R-1 + R-2 done: stego/backup/sync/server)

## In-flight

- Next: R-3 transform.js (46 sites — node-script batch edits), then R-4
  storage.js self-audit (incl. readRaw/writeRaw factory-shortcut question),
  R-5 bins, R-6 name-validation sweep
- Found this round: decodeFromBuffer ReferenceError (typeof-only tests),
  hybrid_getPrivacyConfig ReferenceError (undefined PRIVACY_FILE),
  server.js containment always-false (dead static serving), backupPath
  cwd-relative anchoring, readRaw/writeRaw still exported vs P1-17 claim

## Leads / rough notes

- storage `read()` → null on missing, `has()` → bool, write = atomic+mkdirs
- "brain storage" objects (getBrainStorage()) have {basePath, version} — NO
  `.path`. Two .path bugs found+fixed so far (brain.js listBackups, tmp.js
  spaces → silent ./storage). grep for `.path ||` and `?.path` to be sure none left
- format.saveFile silently falls back to raw fs when secured read is denied —
  prefer store.write with format.serialize
- format.parse returns {data, format, chain, error} — NO .content field; check
  consumers expecting strings (islands load() bug fixed off this)
- no `storage:*` event listeners exist yet → routing audit-ish modules through
  storage is re-entrancy-safe today (recheck if listeners get added)
- name-becomes-path-segment sites need safe-charset validation (islands/_
  skills pattern); name-interpolation bugs are likely still hiding elsewhere
- `models/private/undefined` 0-byte artifact deleted; hunt the writer if returns
- str_replace unreliable on lib/brain.js (even < line 2200) and can PARTIALLY
  apply multi-edits — grep-verify every removal, use node-script fallback there
