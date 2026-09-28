# Vant Axolotl — Crash Memory (MEM.md)

> **Purpose of this file:** catch-all scratchpad. Dump whatever you're in the middle of, in case the session dies before a full save/commit. Treat it as a tmp space, not a ledger.
> **After a clean session:** wipe back to this template and leave a one-line handoff.

---

## Handoff

**Last known good commit:** pass 67 — THREE-NODE STAR 9/9 + JV 8/8 + full
relevant sweep green. Shipped: (1) lib/settlement.js — cross-node
settlement, the weights & measures leg (frame §5 gap 4): partner-side
escrow debit where the budget lives, owner-side CLAIM only (books never
touched), idempotent by settlementId, unwind on refusal/timeout, pins
test/settlement.test.js 10/10; mesh-status gained the settlements
section. (2) Wave OSS-C: surface checker 31 → 167 checks — every CLI
verb claim vs bin/dispatcher/inline-handlers + every documented MCP tool
vs _methods; caught 4 real phantoms (vant learn/remember/address/locate)
which are now documented-reality. (3) prd-world.md v0.2 — §3 is now the
fill-in intake form for the synmergia backwards-PR flow.
**Branch:** axolotl — origin github.com/dhaupin/vant — ALL WORK PUSHED
through pass 67.
**Status:** UNBLOCKED. The synmergia survey runs BACKWARDS: the
synmergia agent PRs §3's answers against axolotl (fill rules on the
form; file:line evidence required). W1/W3 semantics + prd-world §6
decisions 2–3 wait on that PR. Meanwhile OSS-D (community depth),
OSS-E (agent-contributor chapter), and the frame gaps (third-org
rites, ask-peers status leg, noticeboard) are all open work.
**Owner context:** "vant is a source of truth model; world-building
exercise; the world needs state and interaction." Synmergia access
ground truth recorded: the Freebuff GitHub App grant is per-repo and
not adjustable from this workspace (installation lists only
dhaupin/vant); the owner will revisit the scope from desktop later.
**BLOCKER:** none.

---

## CURRENT DUMP

(nothing in flight — all three picks shipped, verified, committed,
pushed. The synmergia intake form is live; next agent wakes to an
unblocked board.)

---

## CURRENT DUMP

(nothing in flight — all three picks shipped, verified, committed,
pushed. The synmergia intake form is live; next agent wakes to an
unblocked board.)

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
