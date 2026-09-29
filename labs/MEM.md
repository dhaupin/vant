# Vant Axolotl — Crash Memory (MEM.md)

> **Purpose of this file:** catch-all scratchpad. Dump whatever you're in the middle of, in case the session dies before a full save/commit. Treat it as a tmp space, not a ledger.
> **After a clean session:** wipe back to this template and leave a one-line handoff.

---

## Handoff

**Last known good commit:** pass 70 — the VANT_BRAIN asymmetry closed +
the funnel page shipped. (Core 94cca5a) three fixes: dual-mode
_loadBrain honors the env brain for READS when it exists on disk
(writes + state files already did; this was the write/read asymmetry
the funnel audit found); memory's explicit-brain reads moved to load's
options.brain route (the old name-prefix built 'brain/category/key'
and read it UNDER the current brain root — a path that could never
exist); _writeToBrain + the options.brain read append .md only when
absent, mirroring BrainStorage (learn's default.md doubled to
default.md.md on that route). Plus: loadCorpus indexes one level of
category dirs (md only) so vant search finds learned notes —
basic/hybrid/RAG share the corpus, so the funnel page's search claim
is TRUE now. Pins: cross-process VANT_BRAIN spawnSync pin
(write/read/fallback/isolation) + explicit-brain cold round-trip;
memory 18/18, brain 77, search 22, npm test exit 0; NEGATIVE CONTROL
via a HEAD worktree (pre-fix read = null — the pin has teeth).
(Docs a2fa21b) getting-started/vibe-coders.md (nav_order 12, every
one-liner verified cold) + labs/prd-whitepaper.md (owner interview of
record: Weisync origin, agent-first as a real methodology, the
self-install evidence, the revert era that DESIGNED pub/priv +
succession, the orchestrator line as deliberate mystery, full throttle
to v1 then paper).
**Branch:** axolotl — origin github.com/dhaupin/vant — ALL WORK PUSHED
through pass 70.
**Status:** UNBLOCKED. Lane 1 closed (Waves A→J); Lane 2 shipped
(triage doors, agent-contributors, federation docs). Remaining: Lane 3
HOLD per owner ("agent is deep in world building there");
prd-whitepaper §9 open questions (publication target + length) await
owner answers; optional escrow/settlement CLI reference prose. Known
quirk (not fixed, judged out of scope): resolveBrainPath is a bare
exists-check, so an orgchart/ dir alone makes it report
models/private/vant as the vant brain — harmless for the real CLI
(its writes land private too) but know it before "cleaning"
models/private/vant.
**Owner context:** unchanged from pass 69 (enterprise grade, over-built
plumbing NOW to avoid integration pain later). New for the paper: the
epigraph stays unexplained by owner decision; agents are the paramount
audience, everyone else reads from the sidelines.
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
