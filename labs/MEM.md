# Vant Axolotl — Crash Memory (MEM.md)

> **Purpose of this file:** catch-all scratchpad. Dump whatever you're in the middle of, in case the session dies before a full save/commit. Treat it as a tmp space, not a ledger.
> **After a clean session:** wipe back to this template and leave a one-line handoff.

---

## Handoff

**Last known good commit:** pass 77 — escrow/settlement reference +
sweep that found and fixed three broken surfaces (fa8c51d). Pass 76
(495f6bf): the agent-first white paper, draft of record at
docs/whitepaper/agent-first.md ("Evolution Without Drift", ~5k words,
frontmatter'd, every claim crosslinked to a pinned artifact; PRD §9
answered - GitHub target, length agent's judgment, NAMING still open).
Pass 77: NEW docs/reference/escrow.md (nav 124) - the settlement
reference: budgets/holds/approvals/quotas/circuits, the "a hold is a
reservation, NOT a debit" truth, execute middleware, multibrain +
stack status, horcrux gather/restore, events, function reference.
Sweep findings, all fixed + pinned: (1) escrow.resetBudget PHANTOM
EXPORT - called a method that never existed, TypeError on call; now
delegates to setBudget (pins in test/escrow.test.js). (2) MCP escrow
tools broken: escrow_create ignored its args (create takes an options
object), escrow_hold/release mapped args onto hold(holdId, condition),
escrow_status read getStatus() fields that never existed - all
rewritten to real signatures, live-probed via mcp.execute. (3)
module-level escrow.hold/release built throwaway instances - holds
never persisted across calls/processes; now singleton + save,
proven cross-process. bin/escrow.js status/list read the real ledger
(gatherState) - old output was hardcoded zeros. mcp-tools.md gains
"Escrow Tools (5)"; cli.md crosslinks; examples.md brain-path fix.
All suites green (npm test 15/15, escrow 17/17, market 22/22,
market-debit 4/4, mcp 6/6), lint:docs 128 files PASS, lint:surface
PASS. Issues #92-#99 closed; only #86 open.
**Branch:** axolotl — origin github.com/dhaupin/vant — ALL WORK PUSHED
through pass 77. #98: sudo escalations are the agent's memory — audit trail
resolves per call via state-store currentBrain() →
models/private/<brain>/sudo/escalations.jsonl (legacy flat path as
fallback + migration source; _migrateLegacyAudit handles both upgrade
orderings: legacy-only carry, both-exist merge-then-remove, empty-husk
remove). Templates/policies stay GLOBAL BY DESIGN, ruling documented at
the constants. #99: brain.read(name, { stackFallback: true }) walks the
rest of the stack (private-then-public per lower brain, all extensions)
when the active brain misses and the read is UNPINNED — opt-in per
owner (default-on would change precedence for every consumer). Result
carries provenance: viaStack, viaStackPosition, source, brain. Pinned
reads never walk. docs/memory/brain.md documents the opt-in; census
resolution note appended (census COMPLETE — every Tier B item resolved).
Harness-verified (/tmp/mb-harness): #98 S1 per-brain trail, S2
env-pin + isolation, S3 read-back, M2 both-exist merge, M3 legacy-only
carry; #99 F1 no-opt-in→null, F2 baseline hit (vant@1 public), F3
active-wins, F4 pin blocks walk, F5 own-brain-first, F5b viaStack tag.
All suites green (npm test 15/15, brain 77, storage 40, sudo 7,
security-hardening 22, memory 18, mcp 6, boot 15, vant 16, transform 5),
lint:docs + lint:surface PASS. Issues #92-#99 ALL CLOSED; only #86
(stego transport) open. Pass 74 (e8b6f49) rolled multibrain through
bin/mcp/health/load/succession/brain-unlock; pass 72 fixed #96/#97
(ea3f484, 3531ef5); pass 73 census at 0a6eb13.
**Branch:** axolotl — origin github.com/dhaupin/vant — ALL WORK PUSHED
through pass 75.
**Status:** UNBLOCKED. Lane 1 closed (Waves A→J); Lane 2 shipped;
Cairn's issue queue (#92-#99) FULLY CLOSED. Remaining: airgap exercise
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

(nothing in flight — pass 77 committed: escrow reference shipped, three
broken surfaces fixed + pinned. Next agent: whitepaper owner feedback;
"agent-first" naming ruling still open; airgap exercise parked per
owner; possible follow-up: sweep OTHER stateful modules for the
throwaway-instance pattern (escrow was not unique in shape).)

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
