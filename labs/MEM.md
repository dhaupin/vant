# Vant Axolotl — Crash Memory (MEM.md)

> **Purpose of this file:** catch-all scratchpad. Dump whatever you're in the middle of, in case the session dies before a full save/commit. Treat it as a tmp space, not a ledger.
> **After a clean session:** wipe back to this template and leave a one-line handoff.

---

## Handoff

**Last known good commit:** pass 71 — Cairn's four issues triaged and
fixed (4e450db). #92 HIGH: horcrux gather dropped dual-scope private
files (public pass clobbered the result key); now merges with
per-file scope tags (type 'both') and restore routes per-file scope
with private-wins-overwrite / public-skip-if-exists intact — verified
cold end to end. #93: horcrux create password ReferenceError (chain
mirrored from refresh, resolved before the default-path template).
#94: wake() bare config() ReferenceError → getConfig();
brain-registry CLI de-fictionalized (real brainDirs + stack).
#95: E_SANDBOX messages explain the per-process grant model +
onboarding docs section; genesis matches on code not prose. Mesh
re-proven post-fixes: exercise-group 11/11 four consecutive runs
(one initial cold-start race, 0 gaps, all tails healthy). Owner
context: airgap/stego mechanics flagged KEY-LATER — proposed next
exercise is the airgap leg (cairn-brain node creates stego horcrux,
file-copy hand-carry, restore+boot on second node). Whitepaper v0.2
has the agent testimony as §3.1 + §2 thesis.
**Branch:** axolotl — origin github.com/dhaupin/vant — ALL WORK PUSHED
through pass 70.
**Status:** UNBLOCKED. Lane 1 closed (Waves A→J); Lane 2 shipped;
Cairn's issue queue (#92-#95) CLOSED. Remaining: airgap exercise
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

(nothing in flight — pass 70 committed: asymmetry fix + pins + funnel
page + whitepaper PRD. Next agent: TASKS.md top block has the seams;
owner answers on prd-whitepaper §9 unblock the paper.)

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
