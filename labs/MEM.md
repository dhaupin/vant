# Vant Axolotl — Crash Memory (MEM.md)

> **Purpose of this file:** catch-all scratchpad. Dump whatever you're in the middle of, in case the session dies before a full save/commit. Treat it as a tmp space, not a ledger.
> **After a clean session:** wipe back to this template and leave a one-line handoff.

---

## Handoff

**Last known good commit:** pass 69 — Wave J shipped + live-fired; Lane 1
(mesh) CLOSED end to end. (Core 17b0bc8) lib/org-sync.js: a SEPARATE
generation-stamped replica dataclass on members (sovereign local books
structurally unreachable), wholesale replacement from the steward
(authority of record; revocations propagate via the generation),
scope.js LOCAL → refresh → replica fail-closed resolution, signed
org.replicate leg + configureStewards allowlist; pins 9/9. (Live-fire
c75f127) labs/node-crew/exercise-group.js — steward + 2 members over
real HTTP: remote votes (3 ballots/3 orgs/PASSED), remote read through
the replica (the Wave-J goal), steward-side claim, scoped-bridge
refusal pin + plain notice, per-node cold soak — 11/11, 0 gaps. En-route
lib fix: _setReplica writes maps BEFORE generation (commit marker).
(labs/steward-runbook.md) the ops guide for the router install.
**Branch:** axolotl — origin github.com/dhaupin/vant — ALL WORK PUSHED
through pass 68.
**Status:** UNBLOCKED. Lane 1 (mesh) CLOSED: Waves A→J shipped, the
N-node soak is clean, the steward runbook is written. Remaining:
OSS-D/OSS-E (Lane 2), prd-world intake validator + synmergia
backwards-PR (Lane 3), small opts (msg TTL leg, genesis CLI parity).
Decisions of record (frame.md §4 addendum): group pattern = standing
JV on a dedicated steward; `group:` scope kind set aside;
election/standby/rotation deliberately deferred.
**Owner context:** "vant is a source of truth model; world-building
exercise; the world needs state and interaction." Owner greenlit all
three §5 gaps this pass ("#1, #2a, and this #3"). Post-pass direction:
"enterprise grade — over-built plumbing NOW to avoid integration pain
later; defense in depth." The Acme/Beta/Theta triple-company group is
the owner's reference scenario for Wave J. Synmergia access still via
the backwards-PR flow (Freebuff app scope: dhaupin/vant only; owner to
revisit from desktop).
**BLOCKER:** none.

---

## CURRENT DUMP

(nothing in flight — Wave J shipped, live-fired 11/11, runbook written,
committed. Next agent wakes to a closed mesh lane and an unblocked
board; Lane 2/3 per the owner's sequencing.)

---

## Crash-Restore Procedure

1. `git status && git log --oneline -10` — confirm branch `axolotl`
2. Read `labs/TASKS.md` top session block — current state + next steps
3. Read `models/private/buffy/learnings.md` — hard-won patterns
4. Check this dump section for anything in flight
5. `node test/runner.js` — verify baseline before touching anything

---

## Session End Checklist

1. Update `labs/TASKS.md` — new top session block (what shipped, next steps)
2. Write brain learnings (models/private/buffy/)
3. Update this file — wipe CURRENT DUMP to "(nothing in flight)", set Handoff
4. Commit: `axolotl: pass NN — <one-liner>`
