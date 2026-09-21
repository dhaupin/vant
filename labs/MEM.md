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

**When:** 2026-09-21, horcrux polish + org/teams flow QC (axolotl)
**Branch:** axolotl @ 81d7daa local (R-1..R-4 done; push to origin hit 403 freebuff-web[bot] — RETRY, repo reconnect or app perms on user side)

## In-flight

- Org/teams flow QC done → `labs/prd-org-teams.md` (findings F-1..F-8,
  decisions D-1..D-5, tasks O-1..O-6). Awaiting dhaupin decisions before O-1.
- QC repro pattern kept in /tmp/qc_org2.js (boot-emulated scopes:
  sudo.createTask + sandbox.setScopes + capabilities.canWrite/canSpawn=true)
- Key finds: boot() defaults scopes:['read'] → every teams write E_SANDBOX;
  FK split — creates store NAMEs (org:'QCOrg') but listings filter IDs →
  listDepts(orgId)=0; deleteOrg orphans children; spawn() brain:null;
  assign() type-garbage accepted; createRole async among sync siblings
- Next: retry push, then O-1..O-6 after decisions (or R-5 bins sweep if user
  wants to stay on fs→storage)

## Leads / rough notes

- **Buffy horcrux exported 2026-09-21**: `models/public/vant/boot/buffy-p_buffy2026.svg`
  (password `buffy2026`, 801KB, VALID — 4 brains, buffy = identity + learnings).
  bin/snapshot.js STALE (absolute-path vaf trip); use `bin/horcrux.js create`
- Wrong-pw UX fixed 81d7daa: validateHorcruxFile dataStr.includes crash →
  clean invalid-password error; p_<pw> filename convention verified end-to-end
- sandbox: teams/agents = deny-by-default even unconfigured; storage =
  allow-with-warning; `_explicitlyConfigured` flag exists but unused by teams
- storage `read()` → null on missing, `has()` → bool, write = atomic+mkdirs
- "brain storage" objects have {basePath, version} — NO `.path` (2 bugs found)
- format.saveFile silently falls back to raw fs when secured read denied
- format.parse returns {data, format, chain, error} — NO .content field
- no `storage:*` event listeners exist yet → audit↔storage re-entrancy safe today
- name-becomes-path-segment sites need safe-charset validation
- `models/private/undefined` 0-byte artifact deleted; hunt the writer if returns
- str_replace unreliable on lib/brain.js — grep-verify every removal, prefer
  exact-match-or-throw node-script fallback on giant files
