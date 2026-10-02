# Vant Axolotl — Crash Memory (MEM.md)

> **Purpose of this file:** catch-all scratchpad. Dump whatever you're in the middle of, in case the session dies before a full save/commit. Treat it as a tmp space, not a ledger.
> **After a clean session:** wipe back to this template and leave a one-line handoff.

---

## Handoff

**Last known good commit:** pass 89 — horcrux/teams/brain-naming
triage (prime #100–#104, #111, #112), all seven CLOSED. (1) #100:
repo-root `.ignore` (NEW — rg honors, git does NOT: stones stay
tracked) + boot README "Search hygiene" + `horcrux create`
auto-appends its stone dir (e2e: repo walk skips, --no-ignore finds).
(2) #101: store.write IS sync — the real race was CONSUMERS; two
wrong fix shapes tried first (async save chain broke teams-refresh's
sync exists-on-return; async restoreState broke orgflow's sync result
+ sync E_LEGACY_FORMAT throw). Final: _saveTeams inline + flush()
drain + restoreState STAYS SYNC + transform.restore awaits
restoreState/flush/agents-flush; cold-restore e2e over 3 child
processes (wipe teams.json → restore+exit → fresh process sees orgs).
(3) #102: preview.agentCount reads data.agents2 roster first (legacy
gatherAgents ALWAYS returns agents:[]), + delegationCount; CLI
"Agents (registered roster):". (4) #103: gather emits emptyDir .keep
markers; restore writes them THROUGH the storage chain (raw
fs.writeFileSync failed the atomic-writes structural pin — caught by
gate), results.emptyDirs {rel,scope}, sweep unlinks per FILE scope
(brain-TYPE scope leaked private markers on 'both' brains — fixed +
both directions tested). (5) #104: assign() reads prev BEFORE
resolution — brain = options.brain > prev.brain > currentBrain
(first assign only); the draft keepOr() checked the ALREADY-RESOLVED
value so the fallback always won (the reported smear). org/dept/
team/role preserved when absent with hierarchy guards (stale role
doesn't follow team change); quota checks self-exclude the moving
agent; escrow spend only on placement ops. (6) #111: health
initialized = markers OR any content; fresh VANT_BRAIN dirs auto-
seed orgchart/ (escrow init) before checkModel — empty branch
tested via the MODEL_PATH escape (state-store doesn't seed it).
(7) #112: brain.test stack assertion derives getCurrentBrain();
audit showed other 'vant' literals are synapse node names / self-
contained axolotl checks. Drive-bys: pass 88's docs rows had 2 em
dashes → lint:docs had been FAILING since 74ac92a (hyphens, 129
files PASS); crew-bus ~50% flake = platform `bin/mcp.js -p 4585`
squatting inside 4571+pid%40 + READY printed before the async bind
→ free contiguous port-triple pick (live probe skips MCP/orphans) +
child port probe before ready — 6/6 stable. NEW
test/horcrux-orgchart.test.js 12/12 (all seven issues; #101 across
real process boundaries, #100 with rg honoring). Gates: sweep
142/142 (chunked), lint:docs/surface/helpers PASS, eslint touched
0 errors, audit 296 THREW(0), npm test 15/15, test-all/test-core
exit 0, npm run check. Crew: Buffy + Cairn + Prime. Queued:
whitepaper rewrite, TASKS/MEM → vant-native.
Pass 88 (74ac92a): habitat/RLS call-point fairness + prime's #105–#110. Survey verdict: habitat/RLS call points
were already factory-clean (no raw state writes outside habitat.js);
the real unfairness = fresh processes didn't inherit authority +
mutations raced their own persistence. (1) BOOT HYDRATES persisted
orgchart.operatorCapabilities (widen-only, host-configured skipped)
— `vant org grant` now PERSISTS by default (--session-only opts out)
and CLI spawn/kill just work afterward (#108/#105 root fix). (2) FLUSH
discipline: agents internal serialized save chain + flushAgents()
(agents.flush() facade), habitat.flush() = _readyPromise, all
mutating CLI flows (agents spawn/kill/prune, habitat grant/init/
policy/token, org grant/demo) drain before exit (#109). (3) bin/
agents.js REBUILT real (was stub; spawn/kill/info/status/prune, --help
guarded at subcommand level, operator self-grant on mutation) and
terminate() now HYDRATES before delete — a fresh process used to
return false for on-disk agents (masked by the stub for months)
(#106/#107). (4) audit.healthCheck restored {healthy, issues, status,
entries} — validate always failed before (#110). (5) CROSS-BRAIN
AGENT BLEED fixed: _getAgentStorePath used bare getCurrentBrain()
which ignores VANT_BRAIN → every env-scoped process wrote rosters
into the vant brain (22 agents, phantom agents.maxAgents=10 quota
hits); now state-store.currentBrain() resolver (pass-53 teams seam).
Vant roster purged of probe agents. NEW test/operator-caps.test.js
8/8 (cold-process e2e). Gates: sweep 143/143, all key suites, 3
lints, audit 296 THREW(0). Crew: Buffy + Cairn + Prime (festival/event
management layer IRL). Queued: whitepaper rewrite, TASKS/MEM →
vant-native.
Pass 87 (463fcbf): #6 agora/mesh tenancy. RANKED
LIST CLOSED: verified it is EXACTLY #1–#6 (82✓ 83✓ 84✓ 85✓ 86✓ 87✓,
no #7 anywhere); only non-numbered queued items remain: whitepaper
rewrite + TASKS/MEM → vant-native (notify board/memory). Owner also
bringing up a second runtime ("Buffy + Cairn + TBA") — hence tenancy.
lib/forum.js: subject chain same as islands/memory (userCtx → current
agent identity → anonymous); commons semantics (workspaceless = global
pre-87 behavior preserved; tenant pub invisible to anonymous FAIL
CLOSED, get() found:false no leak; own ws + ANY registry role in the
pub's ws = visible); publish stamps workspace/authorAgentId, pins
enforced ('' = global, foreign pin needs role → workspace_denied,
invalid → invalid_workspace); list() filtered + tenancy meta.
CRITICAL PRE-EXISTING FIX: module shims `list: () => forum.list()` /
`get: bc => forum.get(bc)` DROPPED opts — mcp.js holds the MODULE not
the singleton, so forum_list/forum_get were always tenancy-blind
anonymous (the whole MCP member-list mystery: handler resolved userCtx
correctly, shim discarded it one frame later). Shims forward opts now.
mcp +2 forum_publish/forum_list = 296 tools audit THREW(0); bin/forum.js
rebuilt REAL (was pass-81 facade); shareableReport tenancy block +
peer workspace; node-registry register(). SECOND PRE-EXISTING FIX
(differentiated via worktree @ HEAD — pass-86 code failed identically
in clean env): Habitat never CREATED the declared default workspace →
fresh process addRole('default') threw HABITAT_UNKNOWN_WORKSPACE,
masked until now by a _habitat state containing 'default' that
disappeared. _ensureDefaultWorkspace() idempotent + PERSIST-FREE
(createWorkspace auto-persists; constructor-time save would race the
restore chain) in ctor + after restore() replace; createWorkspace
got skipPersist. SPAWN-RESTORE RACE documented: spawn provisions
sync before async restore() resolves → restore clobbers → tests must
await getSharedReady() BEFORE spawn (agora-tenancy test fixed; no
code change — spawn contract is sync). Publications memory-only across
processes (no hydrate — forum:pub:* write-only): CLI e2e posts+lists in
ONE child (argv swap); Forum hydration = follow-up. NEW SUITE
test/agora-tenancy.test.js 12/12. Docs: rls.md "Agora tenancy (pass
87)", mcp-tools forum entries, cli.md forum row. Gates: FULL sweep
142/142 (chunked per-suite — run-all exceeds 175s cap, pass-45
precedent; crew-bus + agents-split flakes re-verified standalone),
npm test 15, test-all 17, test-core 5, all key suites green, 3 lints,
eslint touched 0 errors, audit 296 THREW(0).
Pass 86 (c686c41): #4 MCP auth ctx via habitat tokens.
habitat.mintToken/verifyToken/revokeToken/listTokens: bearer tokens
anchored to habitat identities (raw shown once, sha256 hash persisted
in _habitat state row). Verify = registry-verified agentContext at USE
time (role changes apply immediately; authority not snapshot);
unknown/expired/revoked/identity-stripped → null. COLD-PROCESS
FALLBACK: agents registry is memory-only, so agentContext falls back
to _agentContextFromRegistry (durable provisionAgent role rows = the
authority; strip all rows = identity gone). MCP door accepts Bearer
vant_... / x-habitat-token IN ADDITION to shared key; valid token
satisfies mcp.requireKey alone; AsyncLocalStorage carries the verified
subject through execution; PRIORITY verified > declared userCtx >
current agent > anonymous (anti-spoof), wired into vant_memory_state/
_recall (auto-scoping), vant_habitat_can/_check, islands_canAccess.
escrow money-admin accepts token's registry identity as admin
(_verifiedAdminGate; adminId legacy path stays). NEW tools x3 (294
total): vant_habitat_mintToken/_verifyToken/_revokeToken. mcp.start()
explicit port 0 honored (falsy-|| skipped it; listen promise never
settled on bind errors) + _serverRef hook. CLI habitat token
mint/verify/list/revoke; FIXED PRE-EXISTING RACE: bare getShared()
raced restore → fresh-process mint AGENT_NOT_FOUND; token ops await
getSharedReady(). NEW SUITE test/habitat-token.test.js 15/15 (incl.
HTTP e2e: Bearer token → memory auto-scoped to org-http, spoofed
declared ctx loses). Gates green; audit 294 THREW(0).
Pass 85 (87de0a1): #5 per-workspace memory namespacing —
memory.state/recall resolve workspace subject chain (explicit
opts.workspace/userCtx -> current agent habitat identity -> anonymous)
and scope keys to ws<wsLen>.<ws>.<key> on disk (e.g. ws4.acme.proj).
KEY-SHAPE WHY: state keys become filenames; storage sanitizer strips
colons + truncates at 100, so ws:<ws>:<key> collapses and bare concat
collides — length prefix + dots + letter-start ws names parse
unambiguously; 100-char composite overflows throw VAF_INPUT_INVALID.
Namespaces ISOLATING (no flat fallback, anon never sees scoped rows);
flat keys unchanged for anonymous callers; workspace:null pins
UNSCOPED (habitat _habitat, nature _flywheel, context history all
pinned — process-global state must not fragment). MCP: vant_memory_
state/_recall gained optional workspace arg. CLI: islands load --as
<agentId> + islands boundaries. Suite test/workspace-memory.test.js
21/21.
Pass 84 (1146749): island boundaries enforced at load/hydrate/save
(_island:<name>, subject chain identical, anonymous writes fail
closed E_ISLAND_WRITE_DENIED, no policy = open); PRE-EXISTING FIX:
islands.save() called nonexistent island.write() → island.set();
MCP +1 islands_canAccess; suite 14/14; rls.md permalink frontmatter
required by docs link-checker. Pass 83 (d6c2758):
workspace budgets ws:<ws>:<agent>/ws:<ws>::org, two-rows-one-pool,
persistent member caps, registry-verified admin (RLS_DENIED), market
context.workspace pool draw, STALE-SINGLETON merge fix (hold/release
now fresh disk-coherent instances). Pass 82 (77504ff): agents got
habitat identity + RLS online (agentContext/provisionAgent,
filter/mask enforcement, generateCaps fail-closed, _readyPromise
undefined-resolution fix).
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
