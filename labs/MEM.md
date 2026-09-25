# Vant Axolotl — Crash Memory (MEM.md)

> **Purpose of this file:** catch-all scratchpad. Dump whatever you're in the middle of, in case the session dies before a full save/commit. Treat it as a tmp space, not a ledger.
> **After a clean session:** wipe back to this template and leave a one-line handoff.

---

## Handoff

**Last known good commit:** pass 48 — escrow debit-on-trade SHIPPED (candidate 1 of the next-wave shortlist); see labs/TASKS.md top block.
**Branch:** axolotl — origin github.com/dhaupin/vant — ALL WORK PUSHED through pass 46.
**Status:** pass 47 complete (PRD closeout); commit + push pending at session end.

---

## CURRENT DUMP

(nothing in flight — pass 48: market trades now DEBIT the buyer's escrow
budget at the settle point (escrow.recordSpend; the old hold/release dance
never moved budget — credit was reserved, never spent). Numeric prices
debit (missing/zero price costs default 1, mirroring _checkBudget); barter
strings stay free; debit refusal (runaway guard) unwinds reservation+hold
before settlement; trade.debit records the settlement. NOTE: market's
_getEscrow returns the MODULE — recordSpend is instance-level, so the
debit builds a fresh persisted Escrow() per trade. Pin:
test/market-debit.test.js 4/4 (debit+persist, barter-free, insufficient-
budget refusal, unwind-on-refusal; runaway 31st spend itself refused →
recorded spend is 30, not 31). Sweep: market 22/22, agora 7/7, live-fire
26/26. PRD next-wave candidate 1 marked SHIPPED; candidates 2 (cross-
machine state sync) + 3 (distributed agora) remain, in that order.)

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
