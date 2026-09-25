# Vant Axolotl — Crash Memory (MEM.md)

> **Purpose of this file:** catch-all scratchpad. Dump whatever you're in the middle of, in case the session dies before a full save/commit. Treat it as a tmp space, not a ledger.
> **After a clean session:** wipe back to this template and leave a one-line handoff.

---

## Handoff

**Last known good commit:** pass 56 — Wave A shipped (agora-sync MCP tools + vant agora CLI, 8/8 pins); see labs/TASKS.md top block.
**Branch:** axolotl — origin github.com/dhaupin/vant — ALL WORK PUSHED through pass 56.
**Status:** nothing in flight; next: Wave B genesis ceremony, then the real 2-node live-fire through the tools.

---

## CURRENT DUMP

(nothing in flight — pass 56: Wave A shipped. MCP: agora_vote/pull/
push/nodes/sync_status via mcp.execute; agora-sync.status() roster;
CLI bin/agora.js routed as `vant agora`. Pins: mcp-agora-sync 8/8.
Unrelated untracked dir labs/whitepaper/ left untouched.)

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
