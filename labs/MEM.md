# Vant Axolotl — Crash Memory (MEM.md)

> **Purpose of this file:** catch-all scratchpad. Dump whatever you're in the middle of, in case the session dies before a full save/commit. Treat it as a tmp space, not a ledger.
> **After a clean session:** wipe back to this template and leave a one-line handoff.

---

## Handoff

**Last known good commit:** pass 51 — PRD refresh + live-fire round 3 (2 wire-adversary bugs fixed); see labs/TASKS.md top block.
**Branch:** axolotl — origin github.com/dhaupin/vant — ALL WORK PUSHED through pass 51.
**Status:** next-wave shortlist fully shipped (48/49/50) + hardened (51); nothing in flight.

---

## CURRENT DUMP

(nothing in flight — pass 51: PRDs refreshed (prd-agora v1.2 Wave 8,
prd-vant-os v1.3 shortlist shipped). Live-fire found 2 real bugs, both
fixed+pinned: merge scope-filter (synced snapshots could stuff
non-member ballots into scoped topics — mergeTopic now filters through
scope.resolveMembers, unresolvable scope rejects fail-closed) and
sender-bound reply legs (vote.ack/crew.state resolved any pending reqId
from any origin — now bound to the addressed node). Escrow edges clean.
Live wire demo v0.3 (labs/node-crew/demo-v03-agora-wire.js): distributed
agora on 2 REAL processes, 4/4 ×3. Pins: agora-sync 7/7,
agora-distributed 6/6. Candidate follow-ons: agora-sync MCP surface,
synced-ledger TTL, gossip pull scheduler.)

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
