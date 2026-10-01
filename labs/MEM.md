# Vant Axolotl — Crash Memory (MEM.md)

> **Purpose of this file:** catch-all scratchpad. Dump whatever you're in the middle of, in case the session dies before a full save/commit. Treat it as a tmp space, not a ledger.
> **After a clean session:** wipe back to this template and leave a one-line handoff.

---

## Handoff

**Last known good commit:** pass 79 — lint:helpers gate + market/consensus
MCP audit CLEAN + escrow.json merge-save root-cause fix (46717a7).
Gate: scripts/check-stateful-helpers.js blocks `=> new X()`
call-through helpers on stateful classes (negative-controlled on BOTH
syntaxes incl. member-expression; factories exempt; HELPER-MODEL tag
documents deliberate fresh-per-call). Escrow budget helpers tagged
fresh-by-contract (disk-coherent: every mutation persists, every
fresh instance reloads — market debit depends on it); hold/release
singleton+persist. Fifth phantom: auth.hashPassword (hash is STATIC).
MCP audit: market/consensus handlers ALL CLEAN live-probed (governance
gates + E_NOT_REGISTRY are correct fail-closed shapes). BONUS economic
fix: escrow.json was whole-file last-write-wins — stale hold-save
could silently revert a settled trade's debit; _saveEscrow now merges
per key; all 4 market-debit pins green. Pass 78 (0a346da): server
shared-instance + clientIp TDZ; pass 77 (fa8c51d): escrow reference +
3 MCP tools + resetBudget phantom; pass 76 (495f6bf): whitepaper
draft of record. All suites green; lint:helpers + lint:surface PASS.
Issues #92-#99 closed; only #86 open.
**Branch:** axolotl — origin github.com/dhaupin/vant — ALL WORK PUSHED
through pass 79. #98: sudo escalations are the agent's memory — audit trail
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

(nothing in flight — pass 79 committed: gate shipped, MCP audit clean,
escrow.json merge-save landed. Next agent: whitepaper owner feedback;
airgap parked; candidates: extend gate to bin/ + status-field
truthfulness checks, MCP surface audit for remaining tool families
(qos, config, islands).)

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
