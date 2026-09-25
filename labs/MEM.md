# Vant Axolotl — Crash Memory (MEM.md)

> **Purpose of this file:** catch-all scratchpad. Dump whatever you're in the middle of, in case the session dies before a full save/commit. Treat it as a tmp space, not a ledger.
> **After a clean session:** wipe back to this template and leave a one-line handoff.

---

## Handoff

**Last known good commit:** pass 54 — prd-mesh.md drafted (4-install shop mesh; Wave A = agora-sync MCP surface); see labs/TASKS.md top block.
**Branch:** axolotl — origin github.com/dhaupin/vant — ALL WORK PUSHED through pass 54.
**Status:** nothing in flight; next: Wave A MCP tools (agora_vote/pull/push/nodes/status).

---

## CURRENT DUMP

(nothing in flight — pass 54: labs/prd-mesh.md v1.0 — the owner's 4-
install shop mesh (Buffy/Synmergia/Roving/Creadev-Ops) mapped to waves:
A MCP surface, B genesis ceremony, C TTL reaper + gossip, D msg sync,
E envelope versions, F HQ observability; org-model sync leg standing/
optional. 3 owner decisions open with proposals (per-pair secrets, msg
snapshots, version drop-on-major). Wave A next: agora-sync MCP tools
through the real mcp.execute door.)

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
