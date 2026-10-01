# Vant Axolotl — Crash Memory (MEM.md)

> **Purpose of this file:** catch-all scratchpad. Dump whatever you're in the middle of, in case the session dies before a full save/commit. Treat it as a tmp space, not a ledger.
> **After a clean session:** wipe back to this template and leave a one-line handoff.

---

## Handoff

**Last known good commit:** pass 82 — agents got habitat identity +
RLS came online (owner: "Let's do #1, but bring RLS online too").
Habitat now: evaluate()/check()/containerAdmits() + REAL filter/mask
(was policy-shape vapor), agentContext()/provisionAgent(); spawn()
auto-provisions identity (team -> 'org-<team>' workspace, spawner
owns/gets admin, role granted, idempotent, non-fatal); agents facade
export agentContext. RLS WOKE UP: sandbox.generateCaps auto-claims
shared habitat + fail-closed on unknown-workspace ctx claims (was:
fabricated role:admin ctx rode through pre-boot, silent baseCaps
passthrough); lib/rls.js auto-claims + delegates to habitat.check;
isOperationAllowed now real+exported; middleware passes the token.
MCP +3 (284 total): vant_habitat_can / _check (throwing RLS_DENIED) /
_agentContext. CLI: habitat can|identity; bin/rls.js context/allow
fixed (Promise-printing). NEW SUITE test/habitat-rls.test.js 23/23
(scratch-brain isolated). CRITICAL latent pass-81 bug FIXED:
habitat._persist chain resolved to undefined not the instance ->
first mutation made every later getSharedReady() hand out undefined
(h.can TypeError); single-call probes masked it, multi-step hit it;
chain now resolves to `this`. All gates green (npm test, runner 37,
mcp/boot/agents/sandbox/rls suites, 3 lints, audit 284 THREW(0)).
**Prior — pass 81:** environment family DELETED per owner ruling
(was a scrapped subsystem whose 7 tools shipped registered against a
never-existing module; pass 80 stopgapped with coded refusals, 81
removed). Replaced with the REAL subsystem, fully wired: habitat MCP
tools x8 (all live-probed incl. two-process persistence) + real CLI
(bin/habitat.js rebuilt from facade). All surfaces share ONE instance
via habitat.getShared()/getSharedReady() claiming
global.__vant_habitat; boot ADOPTS a pre-claimed instance instead of
clobbering. Habitat fixes en route: addRole fails closed on unknown
workspace; mutations auto-persist; restore serialized on
_readyPromise; setWorkspace stays session-only by design. Audit 281
THREW(0).
**Prior — pass 80:** full MCP surface audit (scripts/
audit-mcp-surface.js, new): 280 tools probed, THREW(0)/PHANTOM(0);
9 bug clusters fixed (boot.js detached-method, brain_evolution_ x5,
geometry_init object-await, branch.js porcelain, get/set_memory
bare-brain + schema/docs split, switch_branch -> switchBrain(),
context_build circular JSON, environment x7 -> coded refusals,
required:[] schema holes). NEW GATE: check-bin-truthfulness.js in
lint:helpers (bin throwaway helpers + status-field cross-check vs lib
bodies) — caught 5 live phantoms + 2 caps.length lies, fixed truthful.
**Pass 79** (46717a7): lib helpers gate, escrow.json merge-save,
hashPassword phantom. **Pass 78** (0a346da): server shared-instance +
clientIp TDZ. **Pass 77** (fa8c51d): escrow reference + MCP tools.
**Pass 76** (495f6bf): whitepaper draft of record — STILL awaiting
owner review. Issues #92-#99 closed; only #86 open.

---
**Prior — pass 79** (lint:helpers gate + market/consensus MCP audit
CLEAN + escrow.json merge-save, 46717a7): gate
scripts/check-stateful-helpers.js blocks `=> new X()` call-through
helpers on stateful classes (negative-controlled on BOTH syntaxes incl.
member-expression; factories exempt; HELPER-MODEL tag documents
deliberate fresh-per-call). Escrow budget helpers tagged
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
