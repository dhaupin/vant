# Vant Axolotl — Crash Memory (MEM.md)

> **Purpose of this file:** catch-all scratchpad. Dump whatever you're in the middle of, in case the session dies before a full save/commit. Treat it as a tmp space, not a ledger.
> **After a clean session:** wipe back to this template and leave a one-line handoff.

---

## Handoff

**Last known good commit:** pass 43 — agora decision return path survives restart; see labs/TASKS.md top block.
**Branch:** axolotl — origin github.com/dhaupin/vant
**Status:** pass 43 complete and verified (live 3-phase restart probe + pins green); commit pending at session end.

---

## CURRENT DUMP

(nothing in flight — pass 43 live-fire round 2 continued: the pass-40 agora
loop's decision return path lost proposal/author across a restart (memory-only
_openVotes). Fix: forum.vote stamps { proposal, author, viaForum } into the
PERSISTED consensus ledger metadata; the vote:consensus handler falls back to
the ledger when the thread record is gone. Live-probed across a real process
restart in /tmp/vant-live-r2: ledger hydrated, 3rd vote completes quorum,
decision recovers proposal+author. Pins: agora-loop 7/7, consensus 8/8,
forum 23/23, scope 9/9. Probe script /tmp/p43-probe.js (phases 1/3; phase 2
shells out via a wrapper — direct env writes are blocked in this sandbox).

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
