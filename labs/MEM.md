# Vant Axolotl — Crash Memory (MEM.md)

> **Purpose of this file:** catch-all scratchpad. Dump whatever you're in the middle of, in case the session dies before a full save/commit. Treat it as a tmp space, not a ledger.
> **After a clean session:** wipe back to this template and leave a one-line handoff.

---

## Handoff

**Last known good commit:** pass 47 — naming + PRD closeout (agora "all mode", agora/vant-os PRDs refreshed); see labs/TASKS.md top block.
**Branch:** axolotl — origin github.com/dhaupin/vant — ALL WORK PUSHED through pass 46.
**Status:** pass 47 complete (PRD closeout); commit + push pending at session end.

---

## CURRENT DUMP

(nothing in flight — owner's 4-step plan EXECUTED: (1) naming — the agora
rename was already done pass 40; the COLLIDING second "trifecta" (MCP+API
server mode via `vant all`) retired pass 45; (2) ALL commits pushed to
origin/axolotl through pass 46 (a3e9c7c); (3) agora MCP surface pass 46:
4 stale forum_* tools RE-WIRED (they called pre-agora signatures —
forum_vote's (forumId,userId,topic,vote) into vote(proposal,options)
meant an MCP "up vote" silently CREATED a vote), forum_castVote added,
consensus_create/vote/tally/get/list added (zero consensus tools before);
pinned test/mcp-agora.test.js 5/5 via real mcp.execute door; (4) PRDs
refreshed pass 47: prd-agora.md v1.1 closeout + Wave 7 section,
prd-vant-os.md v1.2 forensics table corrected (encounter/spirit/realm now
DELETED rows) + "Next Wave — candidates" section with owner shortlist:
escrow debit-on-trade → cross-machine state sync → distributed agora,
recommended in that order (each is a dependency of the next); owner to
confirm sequencing. Docs style+links PASS (118 files). RLS audit (skipped
test-rls tests; two-permission-systems delineation) parked as a standalone
item. rls summary delivered in chat: rls.js is a thin adapter over
habitat.js (workspaces/roles/boundaries), wired live at boot via
sandbox.initRLS, pipeline stage capability→vaf→qos→rls→escrow, fails open
without habitat.)

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
