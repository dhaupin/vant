# Vant Axolotl — Crash Memory (MEM.md)

> **Purpose of this file:** catch-all scratchpad. Dump whatever you're in the middle of, in case the session dies before a full save/commit. Treat it as a tmp space, not a ledger.
> **After a clean session:** wipe back to this template and leave a one-line handoff.

---

## Handoff

**Last known good commit:** pass 55 — prd-mesh v1.1 public reword (example-shop framing, host note); see labs/TASKS.md top block.
**Branch:** axolotl — origin github.com/dhaupin/vant — ALL WORK PUSHED through pass 55.
**Status:** nothing in flight; next: Wave A MCP tools (agora_vote/pull/push/nodes/status).

---

## CURRENT DUMP

(nothing in flight — pass 55: prd-mesh v1.1 GENERALIZED for the public
repo (owner: "we're open source, reword it"): host-note + worked-example
framing, adopting-the-pattern recipe, N-install design; Creadev details
stay as the host's example. Waves unchanged: A MCP surface, B genesis,
C reaper+gossip, D msg, E versions, F observability. Wave A next.)

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
