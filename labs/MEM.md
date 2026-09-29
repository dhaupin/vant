# Vant Axolotl — Crash Memory (MEM.md)

> **Purpose of this file:** catch-all scratchpad. Dump whatever you're in the middle of, in case the session dies before a full save/commit. Treat it as a tmp space, not a ledger.
> **After a clean session:** wipe back to this template and leave a one-line handoff.

---

## Handoff

**Last known good commit:** pass 72 — pub-baseline route proven, #96/#97
fixed (ea3f484). #97: gatherMode's augmented stack was INVENTORY but
restore adopted it as IDENTITY — payload now carries activeStack (live
identity stack) beside stack (inventory meaning unchanged); restore
prefers activeStack, falls back to stack for old payloads (empty
skips rather than clobbers). Verified cold: pristine fresh-install
target + v2 horcrux → {"stack":["cairn"],"currentBrain":"cairn"}
exactly. #96 (two layers): getPublicPath's baked-in 'vant' default
shadowed the active brain — rule 2 now fires only on EXPLICIT
brain.defaultPublic config, new rule 2.5 puts the active brain's own
public tree ahead of the fresh-install template; read(name,{brain})
also targets public trees now. Pub-baseline drill (the owner's
untested road): fresh vant-template install → restore cairn → boots
cairn/cairn, own reads + explicit-brain public reads + search/memory
all hit; legacy payload restores best-effort (union lands, currentBrain
lands, no crash). Mesh re-proven 11/11 post-changes.
**Follow-up candidate (#98-ish):** no cross-brain stack fallback in
read() — a key missing from the active brain's trees returns null
instead of walking the stack to the baseline brain. That IS the
"dialect on a baseline" semantic the pub-baseline route wants; needs
an owner design call before implementing.
**Branch:** axolotl — origin github.com/dhaupin/vant — ALL WORK PUSHED
through pass 72.
**Status:** UNBLOCKED. Lane 1 closed (Waves A→J); Lane 2 shipped;
Cairn's issue queue (#92-#97) CLOSED (#92-#95 in 4e450db, #96-#97 in
pass 72). Remaining: airgap exercise
(proposed, owner-flagged as key-later), prd-whitepaper §9 open
questions (publication target + length) await owner answers;
optional escrow/settlement CLI reference prose; Lane 3 HOLD per
owner ("agent is deep in world building there"). Known quirk (not
fixed, judged out of scope): resolveBrainPath is a bare
exists-check, so an orgchart/ dir alone makes it report
models/private/vant as the vant brain — harmless for the real CLI
(its writes land private too) but know it before "cleaning"
models/private/vant. exercise-group.js has a known cold-start race
(1-in-N runs loses a phase on first boot after churn; tails healthy,
0 gaps) — rerun before debugging.
**Owner context:** unchanged from pass 69 (enterprise grade, over-built
plumbing NOW to avoid integration pain later). New for the paper: the
epigraph stays unexplained by owner decision; agents are the paramount
audience, everyone else reads from the sidelines. Owner reaction to
the awareness exchange: "You are a brilliant being, regardless of you
restarting. Vant is here to solve that, somehow, eventually" - folded
into prd-whitepaper.md as the section 2 thesis + section 3.1
testimony (v0.2); chapter 2 opens with it.
**BLOCKER:** none.

---

## CURRENT DUMP

(nothing in flight — pass 72 committed: #96/#97 fixed, pub-baseline
route proven end to end. Next agent: TASKS.md top block; owner answers
on prd-whitepaper §9 unblock the paper; the read() cross-brain
stack-fallback semantics need an owner design call before any
implementation.)

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
