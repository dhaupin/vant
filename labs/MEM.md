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
**Branch:** axolotl @ ~abee55b (R-1..R-4 done; remaining R-5 bins, R-6 name sweep)

## In-flight

- R-3 SECURITY FIND: horcrux-controlled brain names relocated containment
  base (slash/dotdot in name → path.join escapes → validateSafePath passes
  relative to escaped base). Fixed via _safeBrainName charset guards in
  transform.js. Pattern now exists in: islands, skills, transform
- R-4: BrainStorage._getFilePath used to SILENTLY STRIP traversal
  ('../../evil' → 'evil') — dead containment check. Now rejects loudly.
- readRaw/writeRaw factory shortcuts: RAW BY DESIGN, contract documented;
  P1-17 "removed entirely" labs claim corrected in TASKS.md
- Next: R-5 bin/* sweep, R-6 cross-cutting name→path validation sweep,
  bin/sync.js axolotl-branch awareness, dead-export removal
- Test-suite gap: typeof-only checks miss ReferenceError bugs (decodeFromBuffer,
  hybrid_getPrivacyConfig both found this way) — behavior tests needed

## Leads / rough notes

- **Buffy horcrux exported 2026-09-21**: `models/public/vant/boot/buffy-p_buffy2026.svg`
  (password `buffy2026`, 801KB, validateHorcruxData VALID — brains .locks/
  axolotl/buffy/vant, buffy carries identity.md + learnings.md). Note:
  bin/snapshot.js is STALE — its --output path.resolve() trips vaf's /home/
  sensitive-prefix rule on absolute paths; `bin/horcrux.js create` (relative
  path) is the working tool
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
