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

**When:** 2026-09-21, fs→storage wave F-1 (axolotl)
**Branch:** axolotl @ 1c6f145 — wave F-1 pushed; docs commit in flight

## In-flight

- **BIG FIND: transform restore() called UNDEFINED helpers** — R-3's batch
  edit landed _safeBrainName/_modelsRel/_getStore() call sites without
  definitions → legacy privateBrains horcrux restores silently swallowed
  ReferenceErrors per file (0 files restored, no visible failure). Defined
  + verified (c7412a4). LESSON: after node-script batch edits, grep the
  function name across lib/ to confirm a definition exists somewhere.
- Wave F-1 done: vibe (mood.ini), schema (brain.json/_core.json), context
  (_gatherStatic), search dead helpers — all through FileStorage, per-commit
- Census after wave: lib/ remaining fs = storage/brain/transform layer
  itself, enumerated metadata (readdir withFileTypes), binary artifacts
  (stego/backup), codebase introspection (legal/compute/vant/.git) — all
  documented exceptions per prd-storage #7
- Next: this was the last easy meat. Remaining low-pri queue: bin/sync.js
  axolotl-branch awareness, dead-export removal (DEAD_EXPORTS.md), test
  gaps (concurrent agents / malicious restore / sync recursion)

## Leads / rough notes

- **Buffy horcrux exported 2026-09-21**: `models/public/vant/boot/buffy-p_buffy2026.svg`
  (password `buffy2026`, 801KB, VALID — 4 brains, buffy = identity + learnings).
  bin/snapshot.js STALE (absolute-path vaf trip); use `bin/horcrux.js create`
- Wrong-pw UX fixed 81d7daa: validateHorcruxFile dataStr.includes crash →
  clean invalid-password error; p_<pw> filename convention verified end-to-end
- sandbox: teams/agents deny-by-default; grant via bin/org.js (scopes + caps
  + sudo task — BOTH layers needed; boot scopes alone don't flip caps)
- storage `read()` → null on missing, `has()` → bool, write = atomic+mkdirs
- "brain storage" objects have {basePath, version} — NO `.path` (2 bugs found)
- format.saveFile silently falls back to raw fs when secured read denied
- format.parse returns {data, format, chain, error} — NO .content field
- no `storage:*` event listeners exist yet → audit↔storage re-entrancy safe today
- name-becomes-path-segment sites need safe-charset validation
- `models/private/undefined` 0-byte artifact deleted; hunt the writer if returns
- str_replace unreliable on lib/brain.js — grep-verify every removal, prefer
  exact-match-or-throw node-script fallback on giant files
