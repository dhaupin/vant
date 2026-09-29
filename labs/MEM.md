# Vant Axolotl — Crash Memory (MEM.md)

> **Purpose of this file:** catch-all scratchpad. Dump whatever you're in the middle of, in case the session dies before a full save/commit. Treat it as a tmp space, not a ledger.
> **After a clean session:** wipe back to this template and leave a one-line handoff.

---

## Handoff

**Last known good commit:** pass 74 — multibrain across the board
(e8b6f49). Census items 1-4 + 8 migrated: mcp brain_write scoped to the
active brain (+segment validation + extension rule), bin/succession.js
log via getPublicPath() (+ second bug: its unconditional canWrite() gate
made it unreachable on default installs — now aligns with the middleware
"unconfigured → allow" philosophy), bin/node.js loadBrain/saveBrain
through getBrainPath (MODEL_PATH stays an explicit escape), health/load
VANT_BRAIN-aware defaults, brain-unlock active-brain boot-dir scan,
version.js/canvas.js doc-rot. Census item 7 RECLASSIFIED (config.js
storage.path is root-correct — a census misread, corrected in the doc).
Harness-verified: MCP write/read round-trip in active brain, VANT_BRAIN
pin moves writes, traversal rejected, succession log seeds the ACTIVE
brain's public tree and status reads it back, health reports the active
brain. All suites green (npm test, brain 77, mcp 6, storage 40, memory
18, security-hardening 22, boot 15, vant 16, transform 5), docs gates
PASS. Design calls filed: #98 (sudo scoping) + #99 (cross-brain read
stack fallback) — owner rulings pending. Pass 72 fixed #96/#97
(ea3f484); pass 73 census at 0a6eb13; Cairn's queue CLOSED (#92-#97).
**Follow-up candidate (#98-ish):** no cross-brain stack fallback in
read() — a key missing from the active brain's trees returns null
instead of walking the stack to the baseline brain. That IS the
"dialect on a baseline" semantic the pub-baseline route wants; needs
an owner design call before implementing.
**Branch:** axolotl — origin github.com/dhaupin/vant — ALL WORK PUSHED
through pass 74.
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

(nothing in flight — pass 74 committed: census items migrated, #98/#99
filed for owner rulings. Next agent: implement #98/#99 once ruled
(recommendations are in the issue bodies); airgap leg exercise still
proposed; prd-whitepaper §9 still awaits owner answers.)

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
