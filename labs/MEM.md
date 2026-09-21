# Vant Axolotl — Crash Memory (MEM.md)

**Branch:** axolotl (origin: github.com/dhaupin/vant)
**Last restored:** 2026-09-21 (Buffy agent — compressed from the stale 2026-09-19 Kilo dump; the full 38-fix audit history lives in `labs/AUDIT_FINDINGS.md` and the session-by-session log in `labs/TASKS.md`)

---

## Crash-Restore Procedure

1. `git status && git log --oneline -10` — confirm branch `axolotl`
2. Read `labs/TASKS.md` **top session block** — that is the current state of work; anything not marked done is the resume point
3. Read `models/private/buffy/` (agent priv brain — identity, learnings) if present
4. Untracked `private/` (agent brain) and `scripts/_fix_*.js` (one-off edit helpers) are LOCAL ONLY — never commit them
5. Verify baseline before continuing: full module suite + `node test/ci.js` (expect 408/408 as of 2026-09-21)
6. When resuming: commit early, commit small (`axolotl:` prefix) — never leave a slice uncommitted across a session gap

---

## Current State (2026-09-21)

- **HEAD:** `9e09086` — labs docs updated (brain slices 4/5 + mcp scan results)
- **fs→storage migration status:**
  - DONE: brain.js (slices 1-5), citations, lock, resolution, prune, canvas, teams, mcp.js (stores + scans; raw `vant_storage_*` tools stay on fs by design: `_containedModelPath` + sudo gate), agents, storage capability gate, timer registry
  - REMAINING (next): succession.js (4 sites), audit.js (5 sites), islands.js (6), tmp.js (9), skills.js (9), stego.js, backup.js, sync.js, server.js, transform.js (46 — the big one), storage.js internals (self)
  - Rule: enumeration stays on fs (pattern-glob limitation); JSON stores + brain-file I/O go through FileStorage (`read`→null on missing, `has`→bool, write = atomic+VAF)
- **brain.js is huge (3.3k lines):** `str_replace` fails on it even below the documented ~line-2200 mark — use the exact-match-or-throw node-script fallback (`scripts/_fix_*.js` pattern), batch all edits for a file into ONE script run, grep-verify the removed pattern is gone
- `models/private/undefined` artifact (0-byte file from an unvalidated brain-name write, pre-slice-3) was deleted 2026-09-21 — if it reappears, hunt the writer

## Security Posture (unchanged, memorize)

- **Sandbox:** DENY by default; only `read` allowed; 8 caps need sudo. `can(cap)` checks sudo first, then static; `_explicitlyConfigured` distinguishes stub vs configured
- **Sudo:** `['read']` default; 7-service whitelist; TTL escalations + 30s revalidation loop (boot starts/stops it)
- **Boot:** escalates write/network/spawn/exec via `service: 'boot'` (auto-approved)
- **Gate:** cross-module capability checks MUST use `lib/gate.js` `requireCapability` — prototype-reference compare is always-true (CO-3 hole, now closed + regression-tested)
- **Storage:** `*Secured` variants route the pipeline; write escalates via sudo `storage` service. Raw bypasses (`readRaw`/`writeRaw`) were REMOVED (P1-17)
- **VAF:** iterative decode-until-stable (max 5), raw+decoded checks, NFKC, malformed encoding fails closed — route any name interpolation through it BEFORE path join

## Conventions (active)

- Commits: `axolotl:` prefix, imperative subject, `Generated with Codebuff 🤖` + `Co-Authored-By: Codebuff` trailer; one logical change per commit
- Version pinned at **0.8.6** — no bumps
- Tests: full `test/*.test.js` loop + `node test/ci.js` before every commit; check `✗` and `Failed:`, not just summary lines (formatters have lied before)
- Lessons → `models/private/buffy/` (agent priv) + `labs/TASKS.md` (shared); most important at top, date-marked
- No backwards-compat shims: clean refactors only

## Key Files

| File | Why it matters |
|------|----------------|
| `lib/brain.js` | 3.3k lines; slices 1-5 migrated; `_bfs*` helpers + bootstrap-window fallback |
| `lib/storage.js` | FileStorage: containment/symlink/VAF/atomic; `listRaw` for anchored globs |
| `lib/gate.js` | Shared capability gate — use for cross-module checks |
| `lib/boot.js` | Timer registry (`registerTimer`/`stopAllTimers`), sudo loop |
| `labs/TASKS.md` | Session tracker — the source of truth for what's next |
| `labs/DEAD_EXPORTS.md` | ~150 zero-consumer exports cataloged; removal process documented |
| `labs/COHESION_AUDIT.md` | The original gap audit driving this whole pass |

## Known Quirks

- Storage default-stub warning fires once per process — expected until boot configures
- `test/brain.test.js` self-seeds `models/private/axolotl/` (gitignored by design)
- Empty dirs: `models/tmp-space/myStuff`, `dropbox` created on demand
- CI binary smoke is compile-only via `vm.Script` — never `require()` CLI bins from tests (bump.js repo-mutation incident, C-7/C-10)

## Resume Points (pick up here)

1. **succession.js** — config + ledger through FileStorage; fix module-load path freeze (stack support reads stale brain)
2. **audit.js** — ledger + archive through FileStorage (beware: audit events fire DURING storage ops — lazy-require the store to avoid re-entrancy)
3. Then islands.js, tmp.js, skills.js; transform.js last (46 sites, biggest blast radius)
4. `bin/sync.js` axolotl-branch awareness (pushes `${DEFAULT_BRANCH}` = main)
5. Dead-export removal per `labs/DEAD_EXPORTS.md` process

---

*Restored by Buffy agent 2026-09-21. Keep this file short — details belong in TASKS.md.*
