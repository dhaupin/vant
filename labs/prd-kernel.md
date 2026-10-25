# Vant Kernel (the Lifecycle Substrate) — Product Requirements Document

**Version:** 0.1 (first sketch, NOT implementation-sequenced)
**Branch:** axolotl
**Date:** 2026-10-21
**Status:** Emergent design, slow-distillation phase. Captured tonight
because months of passes finally made the verbs FINDABLE — escrow taught
fail-closed, pass 169 taught gate teeth, the stone taught honest mass,
LEGAL.md taught norms-vs-conditions, pass 328 handed over the negative
proof. This document is the fossil record of that convergence, not a
starting gun. There is a reason there was no kernel PRD until now, and
the reason is that it may not have been designed yet. NO K-STEP GETS
RUN UNTIL THIS DOC HAS BEEN SLOWLY ITERATED BY THE OWNER.
**Powered-by lineage:** distilled from the census/attest/retire/succeed
pattern observed across pipeline, sudo, rls, escrow, horcrux, prune,
docs gates, the pass ledger, and the marketing channel tables.

---

## 1. Position

**First, the epistemology (owner framing, 2026-10-21):** you can't
design something you don't know exists yet. The kernel is not an
invention being specified — it is a runtime that ALREADY EXISTS, seen
functioning in the wild (the stone restore tonight was FOEC executing
in its pure form; the scratch-brain heap was a mint path missing its
retire verb, observed live). Vant is a different kind of OS, and what
this document does is catch up to it: every verb, law, and open
question below was OBSERVED before it was written. That inverts the
normal PRD order and explains the slow-distillation posture: this doc
converges on what is running; it does not schedule what to build. No
K-step runs until the observation keeps holding and the owner has
lived with the doc at design pace.

Working name: **the kernel**. NOT a pyramid top. A pyramid is a command
shape: surfaces report upward to an apex. The kernel is the opposite
posture: **a substrate that surfaces compose with, not report to** —
the OS sense of the word. Bash does not obey above POSIX; bash runs ON
POSIX. Vant has real hierarchy and layers, and they will remain; the
kernel is not one more layer above them, it is what their layering
stands on.

Revised shape:

```
  vant surfaces (pipeline, sudo, rls, escrow, market, horcrux,
                 ledger, docs gates, harness, channels ...)
     |            |           |          composed ON the kernel
     +------------+-----------+
          kernel substrate (issues the four verbs as guarantees:
                  census -> attest -> retire -> succeed)
```

The relationship, stated exactly:

**Two natures, both true (owner framing, locked 2026-10-21):**

1. **Enforcement stays top-down.** Vant IS pyramid-shaped for roles,
   gates, rules — everything flows through. That does not change. The
   kernel does not flatten the command structure above it.
2. **The kernel itself is the MITIGATOR**, not the enforcer: a logic
   pattern, a chain reaction, neurons forming — the everything-handler
   that lets consensus form BEFORE anything flows through the pyramid.
   The gates above decide; the kernel decides HOW decisions become
   flow: sequenced, attested, census-backed, coherent.

Design-language note (locked): the kernel deliberately reuses the
PROJECT'S OWN vocabulary — neurons, consensus, zone, flow — not
imported abstractions. No philosophy imported for garnish: concepts
enter only when the libs already speak them. state.json already has
neurons; consensus/ has ledgers; meditate-in-flow is an existing ritual
verb. The kernel is where that vocabulary unifies, not where it begins.
(The zone-based verdict concept referenced below descends from the
existing meditate-in-flow/zen lineage, not from yoga.)

**The two-realities framing (owner, 2026-10-21, closing the arc):**
vant and its sibling are both REALITIES — persistent worlds with
masses of actors, events, rhythms. Every reality needs both a master
controller (the pyramid: roles, gates, rules — enforcement) AND the
opportunities that allow existence (the substrate: momentum, nature,
consensus, the conditions a world persist UNDER). The kernel is the
second half: not the controller but the OPPORTUNITY STRUCTURE — the
part of reality that makes persistence possible at all. Neither
runtime is exotic in this: both need orchestration, nature, consensus.
That is why one substrate can serve both: it is not a vant feature
borrowed by a game, it is the shared shape of reality-keeping itself.
The verbs read differently under this framing: census is not
policing, it is what a reality does to KNOW itself; succeed is not
backup, it is what allows a reality to continue across its boundaries.
Opportunity, not control — that is the kernel's half of existence.

**The Godot realization (owner, same night, the analogy that lands
the whole project):** the two realities sit in the same PLACE — same
problems, different scopes and methods — but the sibling's world runs
ON an existing engine kernel (Godot); vant's reality runs on nothing
of the sort. The pods stand directly on node and raw lib/. So the
kernel project is, stated plainly: **making the Godot of vant.** The
engine kernel vant never had — lifecycle, state, rhythm, boundaries,
the things a world needs beneath its content — so that brains, crews,
stones, and pipelines become what schemas and scenes are to Godot:
the game-grade payload, riding an engine-grade substrate. The
portability clause (§3) is the difference that matters: Godot is a
full engine with opinions about rendering and physics; ours stays a
THIN kernel — only the four verbs and their laws — so other
realities (the sibling's frame, the org installs already running
vant) can adopt it without adopting a whole engine. Same discovery
Godot made once: the substrate was latent in the usage all along; we
are just the first to name it and give it a door.

**Owner scoping, 2026-10-21 (the last word on the example):** Godot
stays an EXAMPLE, spoken once and not opened again. No engine-source
study of Godot — or any third-party engine — is done, on purpose
(owner: "I'd prefer you don't dig into godot, it'll make it too easy
to copy. I don't dig in either."). The kernel is not a clone built
from somebody's docs; it is vant's OWN vocabulary (census, attest,
retire, succeed, FOEC, zone, honest mass) observed functioning in the
wild and written down. Where a worked case is ever needed, the
evidence base is the SIBLING'S OWN frame (§5b — their source, their
bugs, their laws, already cited at architecture level); Godot-the-
engine itself remains a black box over our shoulder.

And the sizing the owner fixed the same hour: the four-verb substrate
plus FOEC and the zone is ONE PART of what the word KERNEL will
eventually mean for vant — call it a fifth. It is the part this
document currently knows how to say precisely. The rest — the other
four-fifths — is deliberately UNFILLED, and stays that way until the
owner fills it, one area at a time, in no fixed order. Reserved
areas, named so future agents do not design them in the owner's
absence:

- **The zone's own design** — §6b stays named-not-designed; the
  verdict-maker is judged-peer, not kernel property, and its build
  out is owner territory.
- **The rhythm/momentum law as native kernel ground** — §5a is the
  seam (nature.js the existing wheel); what kernel compaction, audit
  pulses, and census cadence BECOME is unfilled.
- **Consensus formation before flow** — §1's second nature said how
  decisions become sequenced, attested, census-backed; WHO forms
  them and under what conditions remains open (open q10 rides here).
- **Reality-to-reality portability as treaty, not import** — the
  §5b crew clause points at an install-mesh reality; the treaty shape is
  unfilled.
- **The cognition lifecycle** — what genesis, dreaming, and
  succession ARE to the kernel when the kernel's consumers are
  themselves cognitive (brains waking, resting, succeeding).
- **FOEC beyond genesis** — how everything-at-once stays everything-
  at-once WITHOUT becoming sequenced-corporate; companion E7 is the
  known first seam, the lane law the second.

None of those are designed here, none scheduled. The rule for the
four-fifths is the rule this whole document obeys: areas fill with
OBSERVATIONS from the running system first, at design pace, never
from borrowed blueprints.

**FOEC, Flash Of Everything Content** (owner framing, corrected same
day): NOT a failure mode. A MODE — and not merely a tolerated one: a
REQUIRED one. The opposite of FOUC one layer deeper. FOUC is unstyled
content flashing on the way to style; FOEC is everything surfacing at
once on the way to coherence — all layers, all state, all carriers up
together, none of it sequenced *yet*. GENESIS IS FOEC. The neuron
lattice lighting up IS FOEC. In JS runtime terms: the whole instance
graph coming up together. You do not defeat FOEC, you NEED it — a
kernel that never flashes everything never hydrates; a genesis without
FOEC is a genesis that did not happen. Whether a FOEC moment is good
or bad is NOT the label's job: that judgment belongs to the kernel
zone at runtime. The kernel is EXHIBITED TO the zone, never the other
way around (the zone's peer status is fixed in §6b; the kernel does
not absorb or subsume its judge — an earlier "subsumes" phrasing was
retired in the pass-335 nitpick for contradicting the enforcer/
mitigator split). Genesis
hydration, stone restore, a heavy wake — those are the mode in its
pure form. Failure is a runtime verdict, not a taxonomy entry: the
kernel exhibits the mode, the zone attests whether it passed.

```
     vant surfaces (pipeline, sudo, rls, escrow, ... )
         |  composed as consumers
   +------------------------------------------------+
   |            kernel substrate                    |
   |   four verbs as guarantees: census, attest,    |
   |   retire, succeed  (an open vocabulary, not    |
   |   a pipeline - orderings are law, not arrows)  |
   +------------------------------------------------+
          bedrock: git history + tests + owner authority
          (the unattested root that attests everything)
```

A consumer like the pass-328 sweep is not the kernel; it is what becomes
*possible cheaply* once the kernel exists. The kernel powers the
example, per the owner's framing: **a friend in the pipeline, that is
the pipeline.** And per the owner's correction: it has hierarchy and
layers, but those are composition layers, not command rungs.

**Non-goals up front:** no runtime daemon, no new storage engine, no
rewrite of the seven subsystems. The kernel starts as a contract +
lib module + gate surface; consumers adopt verb-by-verb. Nothing moves
until its consumer ships the mapping row below.

## 2. The four verbs (locked names)

| Verb | Meaning | Hard rule (the invariant) |
|------|---------|---------------------------|
| **census** | Enumerate what exists on a surface, with honest status + check date. | An unlisted thing is a finding, not background. |
| **attest** | Bind a claim to checkable reality (hash, test, traced module). | No attest without a dated census entry behind it. |
| **retire** | Remove the dead, traceably: name, reason, date, and where the record goes. | No retire without a census entry naming what died. (Graveyard, not vanishing.) |
| **succeed** | Carrying continuity across a boundary (session, version, tenant, restore). | No succeed without the attest chain it inherits being verifiable at the destination. |

Two cross-verb laws:

1. **No retire without a census entry.** Deletes must be nameable. This
   is why pass 328 kept `buffy/` — the census said "predecessor memory,
   not garbage" before anything was swept.
2. **No attest without a dated refresh.** A status column without a
   check date is a lie in waiting (the same principle that made the
   PulseMCP "paused" row honest, and the `horcrux inspect` timestamp
   load-bearing).

## 3. The contract surface (what a consumer implements)

A `lib/kernel.js` module + the smallest possible interface. A consumer
declares itself and implements the verbs it can; missing verbs are
census-visible gaps, never silent:

```js
const kernel = require('./lib/kernel');

kernel.register({
  name: 'test-harness',            // consumer id (unique)
  scope: 'models/private',         // what surface it mints/retires on
  verbs: {
    census: () => listScratchBrains(),      // return [{id, at, kind}]
    retire: (entries, reason) => rmScoped(entries),  // must emit census records
    // attest/succeed optional; absence itself shows in kernel.census()
  }
});

kernel.census();   // every registered consumer, every surface, dated
kernel.gate('retire', 'test-harness', ids, 'reason'); // audited retire
```

Rules for `lib/kernel.js`:

- **Append-only ledger.** Census and retire events append to an
  events-style journal (same posture as the WAL/events law repo-wide).
  Retire without its census entry is refused at the gate (fail-closed,
  the escrow lesson).
- **Coded errors only** (the pass-169 gate teeth rule).
- **Kernels nest.** A consumer of the kernel can itself issue the verbs
  to ITS consumers (pipeline -> pipeline steps; the harness -> its
  scratch brains). The substrate is recursive by design.
- **Portable.** The contract ships as a spec + plain-JS reference lib
  with ZERO vant-internal imports in its core (journal + registry +
  gates are self-contained), so neighboring layers/projects (the
  friend-in-the-pipeline clause) can adopt the protocol in full without
  importing vant's lib graph. Vant consumers wire it in from outside
  the core file — the same one-way-boundary discipline web/ already
  follows. This is what makes the kernel a substrate for "other similar
  layers/tracking/carriers" and not just a vant internal.

### The wiring map (callsites that register, all UNWIRED — dated 2026-10-24)

The seed draft of `lib/kernel.js` exists (K1-shaped, self-contained,
zero vant imports, in-process journal + registry + the invariants
live). No runtime callsite wires it yet — the doc's law stands:
adoption is registration, and nothing registers until its §4 row
lands. This subsection is the honest MAP of where each future
registration line goes, so the pass that adopts greps for no more
than this. Until one of them exists, `kernel.census()` is an honest
empty ledger — a census with zero consumers is TRUE, not broken.

| Callsite | Registers as | Verbs wired first |
|----------|--------------|-------------------|
| lib/escrow.js | 'escrow' (reference consumer, smallest lift) | census of budgets; attest of spend pairs |  

> **2026-10-25 — escrow row WIRED (K3 landed):** `lib/escrow.js` registers as
> 'escrow' with census of budgets + attest of spend pairs exactly as this
> row named (registration + verb wiring only, zero surface rewrite; the diff
> proves it). Spend pairs witness on the lawful path, dated through a
> kernel-gated census basis (invariant 2 live), self-healing after external
> probe resets, and a kernel refusal steps aside onto escrow's event bus
> without ever mutating a spend verdict (clerk-not-judge, §2 Q8). The
> retire/succeed gap self-names in every census (invariant 3 works ON the
> adopter). Pins: `test/escrow-kernel.test.js` (21). Plugin readers: the
> remaining map rows above stay unwired — each lands the pass its surface
> opens.
| test/runner.js (suite exit) | 'test-harness' | census of minted scratch brains; retire = autoreap (the pass-328 kill switch) |  

> **2026-10-25 — harness row WIRED (K4 landed):** the actual suite-exit
> surface is `test/run-all.js` (the sweep loop — `test/runner.js` is the
> component runner under it; wiring the row where suite exit really happens
> keeps map and truth from forking). `test/harness-autoreap.js` registers
> as 'test-harness' with census of minted scratch brains + retire = the
> kill switch, both verbs running THROUGH the gate: the janitor's bill and
> the kernel census are one truth (the manifest-diff law lives once, in
> `slate.listScratchMints`), every retired id arrives LISTED in the census
> receipt (invariant 1 structurally — the harness cannot delete what it
> never named), attest/succeed stay the census-visible gap, zero-mint
> sweeps exit quietly, and a faulting kernel degrades to the bare janitor
> law with the refusal VISIBLE — bookkeeping never holds the sweep hostage.
> Pins: `test/autoreap-kernel.test.js` (21).
| bin/horcrux.js (inspect) | 'horcrux' | brain-level census (real vs carcass); retire of stale stones |  

> **2026-10-25 — horcrux row WIRED (K5 landed):** `lib/horcrux-census.js`
> registers as 'horcrux' (census of brains + the retire door), and `vant
> horcrux inspect` GAINS the census: every brain dir becomes a named,
> kernel-dated entry — real ('brain') versus hollow ('brain-carcass'), with
> the state-roster guard (a state.json-named dir is a mid-write lineage
> member: alive, never debris) and the unverifiable-roster guard (a
> present-but-unreadable state.json strips retirement eligibility — the
> census still lists, the tide never fires on an unverifiable tree).
> Discoveries the pins forced before they passed: (1) a STONE-BEARING dir
> is NEVER a carcass — a horcrux stone is the one disaster-recovery
> artifact, so the disaster-recovery law reclassifies it real and surfaces
> its stones as STALE-STONE CANDIDATES for the decommission run (§6c/K5a)
> to retire through the same door with the receipt; a stone-tide is an
> owner ceremony, never an automatic one; (2) the tide removes ONLY the
> census-named carcass dirs (invariant 1 structurally), dryRun bills
> without crossing, an empty tide is a quiet no-op. The retire door ships;
> the CLI does not fire it (inspect only GAINS the census — additive,
> never destructive by default). Pins: `test/horcrux-census.test.js` (27);
| lib/prune.js | 'prune' | census of prunable; retire-with-ledger | **WIRED** (axolotl 366a9b5 — registered inline in lib/prune.js; `kernelCensusPrunable` / `kernelWitnessRetire` (dry-run default) via lib/prune.js; pins: test/kernel-wiring.test.js) |
| lib/sudo.js | 'sudo' | census of grants; succeed of elevation across ops | **WIRED** (axolotl 366a9b5 — lib/sudo-kernel-witness.js; census enumerates THROUGH THE PUBLIC SURFACE ONLY: listTasks/getGrants/getHealthChecks, never internals; succeed = elevation-audit boundary, self-basing with a kernel-gated census; pins: test/kernel-wiring.test.js) |
| lib/pipeline.js | 'pipeline' | census of pending/committed steps; attest of outcomes | **WIRED** (axolotl 366a9b5 — lib/pipeline-kernel-witness.js; attest of outcomes at the completion tail + census of the declared step surface; pins: test/kernel-wiring.test.js) |
| docs gate scripts (check-docs-*, check-fiction-signatures) | 'docs-gates' | census of claims + their check dates (the claims ledger) | **WIRED** (axolotl 366a9b5 — lib/kernel-ledger.js; the six REAL gate scripts enumerating by fs presence, registered at cert-gate run start (scripts/check-docs-certification.js); census law kept honest: no pass-ledger stand-in was REQUIRED while unbuilt) |
| pass ledger (labs/TASKS.md discipline) | protocol consumer, docs-shaped | census of open items | **BUILT** (lib/pass-ledger.js — docs-shaped: reads TASKS.md/MEM.md from disk; open items are the ledger's OWN markers (Next/NEXT-UP/Owner queue), newest-first pass parse; succeed = the ceremony FORMATTER, pure, never writes the doc; kernel census per the three-line recipe ('pass-log' consumer, dated open-item entries). Pins: test/pass-ledger.test.js, 12/12) |

## 4. Consumer mapping (the pass that adopts the contract must fill one row per surface it touches)

| Surface | Has today (honest) | Missing verb | Adoption shape |
|---------|--------------------|--------------|----------------|
| pipeline | ordered steps, retries | census of pending/committed; attest of step outcomes | steps register; kernel journals |
| sudo | capability ladder, refuses on uncertainty | census of grants; succeed of elevation across ops | grants become census entries |
| rls | tenant isolation at the table/store layer | retire cascade naming tenant scopes; attest of boundary per op | tenant lifecycle = succeed verb |
| escrow | budgets, spend tracking | already ~census (budgets are enumerated); attest of spend pairs | register as the reference consumer ( smallest lift) |
| horcrux | inspect (mass + timestamp, attest-adjacent) | census at brain level (which brains are real vs carcass); retire of stale stones | inspect gains census semantics |
| prune | retire rules only (no census; refused the storage layer, correctly) | census of prunable; attest of retirement reasons | prune becomes retire-with-ledger |
| test harness | mints scratch brains per run, NEVER retires (the pass-328 leak) | retire + autoreap | the kill switch becomes `harness.autoreap` — census its own mints, retire them on suite exit |
| docs gates | attest of copy-to-code | census of claims and their check dates | claims ledger |
| pass ledger (TASKS/MEM) | succeed ceremony (well-practiced) | formal census of open items | queue as census entries |
| marketing tables | dated status columns (already right shape) | nothing structurally; just register | template consumer | **REGISTERED** (labs/kernel-ledger.js — the §3 map's last row, exactly the row's own law: register-only, census verb, nothing structural. The census enumerates the REAL §-11 channel tables (11.3 registries / 11.4 list repos / 11.5 communities, 19 rows) from labs/prd-marketing.md on disk; ids carry kind/name, never invented entries. Pins: test/kernel-wiring.test.js, 24/24) |

The point of the table: **adoption is never a rewrite.** It is one row
per surface, verb by verb, with the escrow row first (smallest lift),
the harness row second (highest pain retired), and everything else
following the cadence of whoever opens that surface next.

## 5. Why substrate (the owner's corrections, stated back)

Not a pyramid: the kernel sits beneath, not above. The layer/tracking/
carrier trio (memory, ledger, stone) remains the product. The kernel
does not compete with them and does not command them; it **powers their
guarantees**:

- The ledger's "passes and pins only" is kernel-attest discipline.
- The stone's "honest mass" is kernel-census semantics.
- Prune/rule discipline, sudo refusals, escrow budgets, RLS tenancy:
  all retire/attest/census in different clothes.
- The pass-328 heap is the proof of the negative: a surface with mint
  power and no retire waste got the whole layer filthy.

With the kernel, "no more scatter adhoc" is literal: one substrate
issues the verbs' guarantees, every consumer declares itself,
`kernel.census()` is the single place to see who has what verb and what
it has minted. Hierarchy survives intact, gates still gate, sudo still
refuses on the side of the operator. It is just no longer seven
private hierarchies that each reinvent the same lifecycle verbs badly.

## 5a. Staying alive: the momentum line (kernel x nature, flywheel,
encrypt, engine)

The kernel is not built once and done; it is a substrate that must be
ALIVE between sessions — and the repo already owns a complete, working
aliveness mechanism. Mapping it in (observation-first, per §1):

| Organelle | Existing lib | What it already does | What it offers the kernel |
|-----------|--------------|----------------------|---------------------------|
| **The flywheel** | lib/nature.js (persists momentum between sessions) | momentum accumulates, persists, decays by threshold | the kernel's inter-session CONTINUITY of attention: census freshness, attest staleness alarms, the "who has not been checked in ages" feeling — momentum that outlives a session is exactly census-with-a-clock |
| **The hit-and-miss spark** | lib/nature.js | fires only when momentum drops to threshold — organic rhythm, no wasted sparks | the kernel's AUDIT CADENCE: no fixed cron ringing every hour; the kernel gets impolled exactly when staleness crosses threshold. (The marketing dept's monthly 15-min recheck is a hand-cranked spark — the kernel makes it organic.) |
| **Cosmic entropy** | lib/encrypt.js getCosmicEntropy() | real-world entropy feeding the chaos weight | UNPREDICTABLE spark timing: the kernel does not become a metronome; audits and censuses fire at moments that cannot be gamed by a surface that learned the schedule. (Encryption's role here is not secrecy but HONEST arbitrary timing — entropy as disincentive to prepare-for-inspection.) |
| **The engine** | lib/geometry/engine.js (julia/node sidecar) | picks the best available compute engine, fail-safe fallback | the kernel should NOT compute its own verdicts on a bespoke stack: census counts, attest checks, retirement candidate selection are plain math — run them through the existing engine abstraction (or plain node) so the kernel stays thin; the SELECTION law (best available, graceful fallback) is already solved and is exactly the kernel's portability instinct in miniature |
| **Wire/bus laws** | nature's shared bus (nature:spark rides the shared bus), encrypt's event emissions | everything announces through the bus, never private EventEmitters | the kernel's census/retire/attest events MUST ride the same shared bus law — one broadcast spine, no private channels; the kernel is a consumer of the event law, not an exception to it |

Working synthesis: **nature gives the kernel a pulse; encrypt gives the
pulse unpredictability; the engine keeps pulse-keeping cheap; the fly
wheel keeps the pulse remembering.** A kernel with a pulse can census
itself; a kernel that censuses itself cannot rot silently. The failure
register (§6a) is the list of what rot looks like — the momentum line
is what notices it. (NOTE: none of this is scheduled; it is the
growth medium question — what keeps the substrate alive — answered
from organelles that already work.)

## 5b. The sibling sighting: synmergia's frame (cherry-picked back, dated)

Circumstance note first (limits what this section may say): the
sibling repo is CLOSED SOURCE, and readers of this document will
normally have NO access to its sources (no zip, no horcrux, no workspace
install — that access is session-scoped and not part of this doc's
guarantees). Everything below is therefore written to be SELF-
CONTAINED: architecture-level patterns, their public lineage in this
repo's own decision records, and the upstream issue thread (#92-#95,
public on dhaupin/vant) as the only citable receipts. No game
surfaces, no payloads, no negatives, no design percentages. A reader
without sibling access must get the full argument from this section
alone; anyone WITH access can verify deeper, but cannot demand the
doc lean on that access. If the sibling's posture ever changes, this
section can grow; until then it stays deliberately thin.

The direction of flow matters as much as the content: this repo built
the structs first (brain stack, content-hash cache, geometry, flywheel,
event bus). The sibling cherry-picked the structs it needed (port
headers on file: its content-hash tree cites this repo's lib/cache.js,
its hierarchy walker cites lib/brain.js; the arch doc has a section
literally titled "Borrowed from vant") and ran them in a domain that
exercises them harder than the pods ever could — a live multiplayer
world hitting its scope stack every tick, masses of concurrent actors,
state diffs flying per frame. What the harder workload learned then
came back: the first return shipment was the #92-#95 issue batch
(fixed in pass 71), and the deeper returns are structural references
the kernel can study. Voluntary, per-verb, both directions — that is
the mesh contract working, two repos one crew.

**What this is NOT:** proof or consensus-by-assertion. A second
coding is INDEPENDENT EVIDENCE — it falsifies the worry that the
kernel's verbs were vant-local bias — but it is not adoption, not a
vote, and not a dependency. The kernel's law remains: any consumer
registers itself; evidence enters through this PRD's observation
register, treaties enter nowhere.

### The cherry-picks worth studying (kernel-lens mapping, architecture level)

| Kernel concept (this PRD) | What the sibling frame landed (all cite vant lineage in their port headers / arch maps) | What to cherry-pick back, carefully |
|---------------------------|----------------------------------------------------------------------------------------|--------------------------------------|
| Honest mass (§2 attest) | The content-hash tree stores payloads in a folded shell so identical state blocks pay ONCE regardless of path count — dedup as storage physics, not discipline | The dedup law for the kernel journal: event records whose CONTENT is identical should share bytes. Census integrity without payload bloat. (A garden-variety content-addressed store; what matters is that the sibling proved the shape under per-tick load.) |
| The mitigate layer (§1 two-natures) | The five infrastructure services (rate limit, security, monitoring, firewall, autoresponse) each stop owning decision logic and become thin wrappers EMITTING rule requests; one generic evaluator resolves them with PER-RULE resolution semantics (top-wins / bottom-wins / predicate-gated / all-wins-with-effect) | This is open question 2's missing answer shape: authority is not global and not per-service — it is PER-RULE, declared at the rule level. The kernel's gate model can adopt the same shape: rule declarations carry their own resolution semantics; the kernel enforces the ENVELOPE, the rules carry the meaning |
| The zone (§6b, open q10) | Frame authority, decision D030, DONE: a transient scoped environment where rules differ (dream/tutorial/jail analogues), server-authoritative seed issued at entry, GC'd at end, cross-frame leak PROHIBITED by law, state goes to the state tree not the frame | The zone gains a worked reference: zone entry = seed issuance; zone life = never persisted in itself; zone end = GC with a leak prohibition. Q10's peer-vs-property question can now be argued against a shipped design instead of pure abstraction |
| Succeed (§2) with inheritance attestation | State diffs verified by root hash at the receiver, resync on mismatch; an open-seed TTL grace window restores the environment on reconnect | Succeed-with-inheritance-attestation is a shipped pattern: the boundary crossing carries the hash; the destination fails loudly on divergence. The kernel's succeed verb can cite the same receipt shape |
| The momentum line (§5a) | ONE wheel, one law: a single canonical chaos primitive that every rhythmic system (world wheels, per-actor anomaly wheels) spins through - accumulate, decay, spark, never two meanings | The flywheel-of-the-moment is NOT needed in JS (nature.js already exists and works) - what to adopt is the ONE-PRIMITIVE law: if more kernel rhythms appear (session heartbeat, journal compaction pulse), they spin through nature, not new wheels |
| Recursion semantics (open q4) | The scope stack walks per-connection with explicit hierarchy resources, load-time validation (no cycles, single root, parents exist), and extensions other domains define themselves (galaxy-sector-planet) | Recursion is LOAD-VALIDATED, not depth-guessed: the hierarchy is data, validated at boot, instead of a runtime split-horizon rule. Q4 gains its answer shape: the kernel registry validates consumer trees the same way - no cycles, declared parents, one root |
| FOEC handling at scale (§1) | Ticks: bounded, sequenced, per-scope work; diffs flow through one path; mass isn't braved, it is SCHEDULED (coalesce windows for non-critical parameters, immediate channels for critical ones per decision D033) | The kernel's surge handling peers: a coalesce law for non-critical events, a critical bypass for those that must not wait. Journal pressure is NOT defeated by batching-away the truth; it is LAYERED: fast lane for critical facts, coalesced lane for the rest, both attested |
| Uninvited FOEC (open q11) | Session death handling: the crash-safety lineage already cited (WAL, atomic writes, fail-closed) here has its WORLD-side twin - persistence boundaries are chosen so death mid-tick loses at most the in-flight tick, never the tree | This ANSWERS q11's suspicion in the affirmative by example: uninvited FOEC posture = the same mode with crash-safety semantics, and the kernel designs its journal around "death loses at most the in-flight entry, never the ledger" |

(One caveat kept honest, per the register's rules: every cell above is
drawn from the sibling repo's documented architecture as visible to us
through ports, issues, and our own lineage docs. None of it has been
run by us in this repo's environment yet; nothing lands in lib/ until
a pass ports a shape and pins a test for it — the first candidate
being the per-rule gate semantics mapping, choreographed with the
owner.)

### Deep-crawl follow-up (2026-10-21, hands on the source): resolutions, refinements, bug sightings

A full source read of the frame substrate (t3.gd 525 lines,
folded_shell.gd 267, rules engine 213, scope stack 250, seed chain 89,
state tree 92, flywheel 106, cosmic entropy/rng 356) verified and
REFINED the table above. Findings, in register voice:

**Verified sound (invariants held under hand-check):**

- The folding math: complete 4-ary heap addressing (children = 4p+1..
  4p+4, ring offsets (4^d-1)/3) verified collision-free across the
  full 11-depth budget — 5,592,405 cells (4^12-1)/3, no two fold paths
  meet. The MAX_FOLD_DEPTH refusals and the 24-bit NSC-9 packing bound
  hold exactly.
- The rebate law is symmetric: release_space() removes a space's
  CLAIMS, never facts another space still claims (removal is
  intersection-aware, with the audit-round-17 leak fix in place),
  clear() releases only cells the tree uniquely claimed.
- The honest-mass counters are real: fact_count() vs per-space sizes
  reveal the shell's true footprint, and T3::savings_ratio()
  MEASURES the dedup (stores attempted vs distinct cells) — honest
  mass as a published number, not a discipline. The kernel journal's
  §5a dedup row should adopt both the counter and the published ratio.
- Canonical hashing is restart-stable: schema identity comes from
  script resource paths (never object instance ids, which would fork
  identical trees across restarts), dictionary payloads hash the
  schema's canonical encoder output when present (key order cannot
  fork identical facts), while transport bytes stay raw. Hashing and
  serialization are explicitly different jobs.

**Bug sightings (candidates for the sibling's own graveyard, handle
via the issue-first mesh law — NOT fixed here, this repo does not own
the frame):**

1. **Silent no-change on evicted diff bases** (t3.gd diff/apply_diff):
   snapshots are retained for a bounded window (64 roots); diff()
   against a root OLDER than the window returns [] — a SILENT
   EMPTY-CHANGE that reads as "no difference" instead of "I cannot
   know." A client resyncing from a pre-eviction root carries its
   stale tree while everything looks green. This is exactly §6a's
   inert-census signature in diff form: the honest answer is a typed
   "base out of window" refusal (client then requests a full scope
   snapshot — the machinery already exists), not an empty array.
2. **Predicate bypass in the ALL_WINS_WITH_EFFECT path**
   (rules_engine.gd): the override marker maps PREDICATE_GATED to
   hard-deny WITHOUT invoking the rule's predicate (the tests pin the
   deny behavior, so it is designed-not-accidental, but the DESIGN is
   suspect per the arch doc's own 5.1: predicate-gated means the
   predicate decides). A scope flipping a rule to PREDICATE_GATED
   silently converts "predicate decides, maybe allow" into
   "unconditional deny under all-wins" — a gate whose veto strength
   depends on which OTHER resolution the stack carries. Worth an
   upstream discussion, not a unilateral verdict.
3. **Single-depth equivalence in hash_subtree**: a subtree that has
   exactly one node hashes to that node's hash (shortcut), and an
   ABSENT subtree hashes to sha256(empty) — the same value an
   emptied-then-deleted subtree now carries. Absent and momentarily-
   empty are distinguishable only by history, not by hash. Minor, and
   likely harmless in the frame's usage, but a kernel journal that
   hashed BOUNDARIES the same way would conflate "nothing there yet"
   with "everything that was there is gone" — the succeed verb needs
   the fuller framing (hash of membership, not of emptiness) if it
   borrows the shape.

**Design notes worth keeping (no action, add to the growing census):**

- Predicates live OUTSIDE the content tree (runtime behavior is not
  content-addressable data; storing Callable descriptors in payloads
  broke round-trips) — the kernel journal should apply the same
  split: verdicts and receipts journal as content; executable logic
  (gate handlers, listeners) stays in the registry layer.
- One-wheel-one-law on the flywheel is enforced by SNAPSHOT/RESTORE
  pairs per wheel (cosmic, shard-level, per-player), leftover momentum
  never carries over a spark, and caps are per-wheel overrides of the
  same law — the §5a organelle table's "spin through nature, not new
  wheels" is confirmed as a shipped discipline, not just an instinct.
- CosmicRng derives per-consumer STREAMS from one audited pool
  (scope-salted, replayable in deterministic mode): correlation by
  construction is impossible between consumers. If the kernel ever
  needs unpredictable-but-auditable spark timing (the §5a entropy
  row), the stream-derivation law is a better reference than raw
  cosmic mixing alone.

(These hands-on findings supersede the caveat above where they clash:
the table's cleaner rows were read from arch docs; this section read
the code. Where they agree — most rows — both sources point the same
way, which is exactly what independent evidence means.)

### What the sibling gets back, already factual

Not hypothetical: the first return shipment (#92-#95) closed the loop
— horcrux integrity (private-memory preservation in stones), the wake
ceremony surviving unstructured death, sandbox grants onboarding
failure surfaced from a fresh agent's viewpoint. The kernel completes
the picture by being the shared contract underneath: when lib/kernel.js
exists and respects the portability clause, a hypothesis worth
testing later (owner's call, timing open) is a sibling-side consumer of
the same verbs — evidence would then flow through the contract instead
of through ad-hoc issue batches. The mesh, upgraded from working to
principled.

## 5c. The crashtest sighting: the verbs in a SECOND runtime (public,
dated 2026-10-23)

The sibling sighting (§5b) is one rectangle of the shape appearing
twice; this day adds a SECOND, from a PUBLIC organ and citable
without any session-scoped access: the crashtest two-engine frame
(dhaupin/crashtest, issues #8-#15; the vant-side mirror in
labs/prd-crashtest.md + prd-crashtest-casestudy.md). The verbs map
onto its native apparatus, observed live during the pit stop:

| Kernel verb | Crashtest organ (observed functioning) |
|-------------|----------------------------------------|
| **census** | pack arming + env-claim prerequisites (#12): a run root declares what exists; the ledger counts honest REFUSED/EXPLOITED/skips — counts that state their kinds, never hide them |
| **attest** | the two-layer CI gate: contract suite strict-mode + real-harness strict policy exit codes; findings earn dated verdict records — the undated-attest smell is structurally impossible inside the ledger |
| **retire** | the whitelist rule: a pinned finding enters the list the SAME commit its fix lands, and is DELETED in the commit that fixes it — retirement by design, with the receipt moving in the same pass |
| **succeed** | the release/re-gate cycle: the adopter's S-counter (S0 → S1) advances only when both layers stay green one full cycle — succession with a reverse-verification guard against inheritance without checking |

Why this matters for §1's epistemology: the case-study method made
the verbs OBSERVABLE FROM OUTSIDE the org (the S0 entry is measured
today, the S1 entry is anchored-projected) — the same "runtime seen
functioning in the wild" posture this PRD is written in, now with a
mirror whose sources are public. Honest boundary note: this is an
ALIGNMENT sighting, not an adoption claim — crashtest did not read
this PRD (it predates the copy); the shape CONVERGED independently,
which is exactly the kind of evidence §5b established the value of.
(Feedback lane goes the other way: #14/#15 are the aggregator asks,
filed by the adopter INTO the engine.)

## 6. Open questions for the slow-distillation phase (the real design work)

These are the questions that deserve months if they need months.
None are settled by this sketch; each is written to be argued with, not
implemented from:

1. **Is the verb set right?** census/attest/retire/succeed is what
   tonight's arc surfaced. Is there a fifth (mint? grant?) that the
   harness leak actually implies — the thing that mints without census
   is also unpunished-without-census? Or is mint just census's
   responsibility to catch?
2. **What is the gate authority model?** Who may retire on whose
   census — the consumer itself, or only the owner surface above it?
   The escrow/sudo/trust ladder suggests an answer; the answer should
   fall out of that lineage, not be invented fresh.
3. **How does the journal relate to the existing spine?**
   state/anchor/WAL/events each already journal something. The kernel
   journal must find its exact relationship to that alread-existing
   stack (piggyback? sibling? beneath?), or it becomes another scatter.
4. **Recursion semantics:** how deep do nested kernels actually go
   before the guarantee erodes? Where is the split-horizon line for a
   consumer acting as issuer to its own children?
5. **Portability boundary:** zero-import core is the instinct, but
   what must the protocol pin (event shapes, gate vocabulary) for an
   external layer to interoperate — and what must it leave free so the
   contract stays small enough to adopt?
6. **Naming:** census/attest/retire/succeed is descriptive, not
   canonical. The substrate deserves names that carry once spoken
   aloud in a design review.
7. **What does the kernel say NO to?** The hardest design input: every
   guarantee added on top is a surface that can lie. What is the
   minimum the substrate can promise and still be load-bearing?
8. **Enforcement through whom?** PARTIALLY ANSWERED by the two-natures
   framing (2026-10-21): enforcement stays top-down (the pyramid of
   roles, gates, rules is real and flows through); the kernel is the
   MITIGATOR under it — it does not command, it forms consensus and
   sequences BEFORE flow. PASS-335 REFINEMENT (the contract example
   contradicted this): `kernel.gate()` as drawn implied the consumer
   gates ITSELF through the kernel, which re-creates the command shape
   the kernel retired. The mitigator's only enforcement is
   REFUSAL-TO-JOURNAL: the kernel declines to record an illegal verb
   (fail-closed, the escrow lesson); the DECISION itself comes from
   the rules layer above (per-rule semantics, E1's answer shape).
   Kernel = clerk of the record with refusal teeth, never the judge.
   OPEN remains: the exact refusal mechanics (decline-to-journal
   passive vs active pre-flow consensus) and how "neurons forming"
   maps onto the state.json lattice (is the kernel what finally gives
   THAT lattice a job?).
9. **Verb granularity and ordering.** The verbs are named but their
   UNIT OF WORK is not pinned. Is census always full enumeration, or
   incremental deltas? Can retire be mass (the pass-328 sweep
   genuinely retired ~180 entries — and its ledger entry named them
   all BY CATEGORY, an accidental data point that retirement
   granularity may be category-shaped, census listing members)? Is
   succeed one ceremony or can it partially succeed across a
   boundary? ALSO: ordering between verbs — tonight's Cloudflare race
   (a Pages deploy pointed at new paths before the merge that created
   them existed) was exactly a succeed-ordering bug: two ceremonies
   firing in the wrong order. What orderings BETWEEN verbs does the
   kernel enforce (or witness), and who holds the sequence?
10. **What is the zone, exactly?** The FOEC doctrine leans on it:
    "the kernel exhibits the mode, the zone attests whether it
    passed." But the zone has no section of its own yet. The open
    shape: is the zone a PROPERTY of the kernel (verdicts issued from
    within), or a PEER the kernel reports to (the kernel mitigates,
    something else judges)? The owner's enforcer/mitigator split hints
    strongly at the peer shape — the substrate grading its own
    coherence exams is exactly the kind of self-attestation the rest
    of the system refuses. If peer: what is the zone's own ceremony,
    and who attest it FROM the outside (the existing zen/
    meditate-in-flow lineage is the likely ancestor)?
11. **The kernel's posture during UNINVITED FOEC.** Genesis, stone
    restore, and heavy wake are INVITED surges. The runtime also
    takes uninvited ones: CI flake storms, a host dying mid-pass, a
    session dying at an arbitrary point (the MEM.md discipline exists
    precisely because sessions die whenever they die). Suspected
    honest answer: same mode, different zone context — the crash-
    safety lineage (WAL, atomic writes, fail-closed) is already the
    observed answer for the storage layer, making this a MAPPING
    question, not a design vacuum.
12. **Who winds the kernel? (the pulse contradiction, pass 335)**
    §10 locks "invoked, passive substrate" while §5a requires the
    kernel ALIVE between sessions — a pulse fired at staleness
    thresholds. A passive substrate cannot fire its own sparks; SOME
    running surface must impoll it. Candidates: the wake ceremony
    (every onboard wake tickles the kernel censuses), harness exits
    (post-suite sweep fires retire), the MCP door (door opens =
    census check), or a boot tick in bin/vant.js. The honest framing:
    the kernel has no daemon (non-goal intact), it borrows OTHER
    surfaces' already-running moments as its heartbeat. Which
    moments, and what happens when none of them run for a long time
    (the kernel asleep on a dormant install — does a stale stone
    restore count as a wind?), is open.
13. **The bedrock (the attestation chain-bottom, pass 335).** The
    cross-verb laws form a chain: retire needs census, attest needs
    dated census, succeed needs attestation. Who attests the CENSUS?
    Recursive self-attestation is unresolved and slightly circular.
    The sly-kernel answer (owner instinct, industry-confirmed:
    self-hosting is real but always bounded — compiler bootstraps
    need an external root toolchain, cluster managers need a
    management-cluster root): the kernel's own maintenance (its
    census refreshes, journal compaction, audit pulses) should be
    implemented as THE KERNEL'S FIRST REGISTERED CONSUMER — the
    kernel eats first, its law self-hosts — BUT it stands on an
    explicitly named, UNATTESTED bedrock that attests everything
    else and is attested by nothing inside the system: **git
    history + the test suites + the owner's authority.** Naming the
    bedrock is what makes the self-hosting honest instead of
    circular. Open: is that the complete bedrock list, and what is
    the ceremony when bedrock and kernel disagree (the owner's
    answer wins, by definition — record it as law, not incident).

13 continued — the 2026-10-23 pit stop FEEDS these questions, and the
data is worth living with:

- **Q1 (a fifth verb?)** — this day's drift was a REMINT pattern: the
  same carcass class re-bloomed after pass 328 swept it. If mint is a
  verb, remint is mint-without-census on the SECOND generation — the
  sweep retired the instances, not the mint path that keeps making
  them. Data point for "retire the producer, not just the product."
- **Q9 (retire granularity)** — the category-shaped instinct now
  confirmed TWICE: pass 328's ledger retired ~180 entries by category,
  and this day's sweep was again one category (test-carcass brains),
  one verb call. Retirement looks category-shaped, census listing
  members — both live sightings agree.
- **Q12 (who winds the kernel)** — the anchor drill is the wind
  data: `horcrux verify` stayed un-run for ten days because NO
  surface's moment fired it; the rotation ceremony was the accidental
  wind. The candidates sharpen: stone rotations and brain
  pit-stop rituals ARE winds that fired tonight; the open question
  keeps: which are SCHEDULED winds vs incidental ones.
- **Q13 (bedrock)** — the drift ran ten days UNDETECTED because the
  bedrock's own ceremony (anchor verify) has no trigger of its own,
  same shape as Q13's circularity, one rung lower. The decommission
  tie (§6c) spans the bedrock too: a bedrock without a run is also
  hand-driven attention.

(The data above is part of the spec it feeds: Q1's remint pressure
argues the decomposition verb needs a mint-or-produce shape, Q9's
category-shaped retirement argues a singles-census signature, Q12/Q13
are why the wind table in §5a's momentum line and the decommission
run's trigger clause in §6c are written as requirements, not
questions. The debates stay open where they are open, but the
capabilities below are now specified.)

## 6a. The failure register (observed signatures of lying surfaces)

The epistemology cuts both ways: if the doc converges on a runtime seen
in the wild, the NEGATIVE sightings deserve the same rigor as the
positive ones. These are the violation shapes we have caught,
described as what they look like to an observer standing in one:

| Signature | What it looks like | Verified sighting |
|-----------|--------------------|-------------------|
| **Inert-mass census** | a count that hides kinds: "78 brains" — the number is true, the composition is a lie (66 were test carcasses) | pass 328, horcrux inspect; AGAIN, this day: 29 dirs, 16 test-carcass brains re-bloomed through the test harness (the mint path has a pulse; the retire verb does not) |
| **Undated attest** | a claim pinned to no moment: status columns with no check date rot into lies-in-waiting | marketing PRD tables (pre-dating), PulseMCP pause row as the honest counter-example |
| **Mint without retire** | unbounded growth nobody owns: scratch brains minted per run, never swept; the archetypal leak | pass 328, models/private 199 dirs |
| **Succeed without inheritance** | continuity that loads but does not check: a restore that hydrates alive state carrying dead assumptions; a deploy that assumes what it did not merge | tonight's Cloudflare race; the succession contract's attest chain |
| **Stale bedrock ceremony** | a receipt chain nobody re-runs: the anchor ledger drifted ten days (2026-10-13 → 2026-10-23) and `horcrux verify` stayed un-run until a stone rotation happened to pass through and re-anchor — the bedrock (§6 Q13) attests everything and attests to nothing, which includes noticing its own drift | the 2026-10-23 rotation drill |

Rule of the register: entries are OBSERVATION patterns, not rule
violations — the invariants in §2 remain the law; this section is
what the law looks like when broken, on the outside. Each row is a
spec pressure: the kernel capability it argues for is named in the
row's context (§6c for the mass-class shapes, Q13 for the bedrock).
Future agents do not
need a rulebook to know they are standing in a heap; they need the
smell. (Add entries as sightings occur; never delete — stale entries
get a dated "not seen since" note instead.)

## 6b. The zone (named, not yet designed)

The zone entered the vocabulary through FOEC and stayed: it is the
RUNTIME VERDICT-MAKER — the thing that distinguishes legitimate surge
(genesis, stone restore) from failure inside the SAME observable
shape. It exists already in lineage (zen / meditate-in-flow); the
kernel does not create it, the kernel is judged BY it, or reports TO
it (open question 10). Working statement: **the kernel exhibits, the
zone attests.** Nothing in this document schedules zone design; it
fixes only the relationship claim so the FOEC doctrine stays coherent.

## 6c. SPEC: the decommission run (kernel capability; owner-named
2026-10-23: "some vant systems exist, but there is no tie to deal
with the actual run of calculated evolution")

### Evidence basis (compressed to what a spec reader needs)

The brain DOES rot, by at least four shapes, and today's choices were
the manual counter: the pass-328 heap (199 private dirs → 19), today's
re-accumulation swept at the pit stop (29 → 13; sixteen test-carcass
brains had bloomed back through the test harness — the mint-without-
retire signature, AGAIN), stoned config residue (quanti-QC battery
entries riding the honest-mass stone), stream/ ledger growth in the
canonical brain (431 files, durable by design but uncensused), and the
stone itself: horcrux create gathers ALL brains, so stone mass tracks
the brain count — 78->12->10 across sweeps, entirely because a wake
noticed and hand-pruned. The honesty law held every time, but the
honoring was HAND-DRIVEN: a wake must notice, sweep, read the lesson,
record the pass. Brain rot is not the danger; BRAIN ROT WITHOUT A RUN
is — the failure register (§6a) names the smells, but nothing runs.

### Why this is understandably hard (the honest operating problem)

1. The judgment is ZONE-shaped, and the zone is not designed (§6b).
   Decommissioning asks exactly the runtime-verdict question: is this
   brain LEGITIMATE SURGE (an owner's continuity surface mid-arc, a
   pilot crew mid-mission — pilots beat the sweep by looking alive at
   pass 328) or DEAD MASS (a scratch brain minted by a test run)?
   Today that judgment is a wake's intuition plus owner precedent.
2. The blast radius is CONTINUITY: a brain may be an agent's only
   continuity surface (succession interplay); a decommission run with
   a wrong verdict deletes an inheritance, not garbage.
3. The doctrine says ATTEST-AND-ARCHIVE, never silent delete — the
   pass-239 ruling (PONDERED, then archived; era stones with
   provenance). Decommission is a CHOICE between records, and records
   take discipline.
4. The residue classes are HETEROGENEOUS: test carcass dirs,
   config-key gallons, stream ledger growth, pinned ceremony dirs —
   each with its own "should this exist" answer. A single rot rule
   mis-grades half of them.

### The systems that exist, and the missing tie

Vant owns nearly every organ needed for a BRAIN CENSUS AND
DECOMMISSION RUN and none of them are TIED: lib/prune.js has the LTC
scan (and honestly refused: its criteria didn't recognize the
heap — which is correct for an unused tool, wrong for the need);
nature.js has the pulse (threshold-triggered sparks, momentum decay —
the natural trigger for "do the census NOW" without a fixed cron);
horcrux inspect is the census reader (brains/counts as the honest-mass
receipt); identity.md proves the CONSCIOUS-CHOICE discipline; TASKS/
lessons prove the record-keeping. What does NOT exist is the run of
calculated evolution itself: a decision procedure that (a) takes the
pulse, (b) scans the census, (c) consults the zone for each
suspect, (d) issues an attest-and-archive ruling, and (e) updates
the receipts (stone, table, README) in the same pass or refuses the
whole run. Until the kernel ties those organs together, brain rot is
fought by attention — which works at this scale (13 hand-curated dirs
is fine) and silently fails at the distributed scale the stone is
BUILT for (the OSS replication ruling in identity.md: at 20k-class
watches, the collection of brains grows faster than the wakes).

### The capability (the run spec — what the kernel ties together)

The decommission run is a REGISTERED KERNEL CONSUMER per §3: it
implements `census` and `retire` verbs over the brain layers, and
everything it does is census-visible like any other consumer. Its
requirements, as the spec the implementation must satisfy:

- **DC-1 — trigger (MUST).** The run fires on nature's threshold
  impoll (§5a), never on a wall-clock schedule: censuses fire when
  staleness or mass crosses threshold, at moments a surface cannot
  game. A dormant install may run ZERO decommissions without error —
  an unrun quotient is a census-visible condition, not a fault.
- **DC-2 — census (MUST).** The scan classifies into the named
  classes (alive, surge, residue, orphan ceremony, dead mass) and the
  count NEVER hides the kinds (the inert-mass law, §6a). The census
  reader MAY be horcrux-inspect-shaped; the classes are part of the
  contract, not tool details.
- **DC-3 — judgment (MUST).** Every retire candidate gets a per-
  candidate verdict of exactly {surge-keep, residue-keep, retire},
  each dated and attested (§6b zone consult; zone shape per Q10). A
  ruling cannot outrun its judgment; a pilot mid-mission resolves to
  surge-keep and is left alone, dated.
- **DC-4 — decommission action (MUST).** Retire executes
  ATTEST-AND-ARCHIVE ONLY: the surface leaves the boot chain, a
  provenance record lands in labs/archives/, and ALL receipts (stone,
  boot README table, ledger) move in the SAME pass — or the run
  refuses whole (fail-closed, the escrow lesson). Hard delete is not
  part of this capability's contract at any layer.
- **DC-5 — honesty floor (MUST).** Agents may LEARN from a
  decommission ruling; they may never LEARN into one — no brain write
  may erase its own record, and the write-ahead journal + anchors
  remain the receipt chain.
- **DC-6 — thinness (MUST/SHOULD).** The run is a RULING, not an
  engine: no sweep daemon (the kernel non-goal stands), no bespoke
  math (computations ride the existing engine selection, §5a), and
  the whole capability SHOULD stay under a few hundred lines beside
  its tests.

### Verification (pins DC as spec)

- The four-verb chain pins: retire-without-census refuses (K2's
  invariants, this capability included); a decommission whose receipts
  did not move refuses; a ruling without a dated zone consult refuses.
- Full-run determinism: same census state → same classes → same
  rulings, byte for byte (no wall clock in any class assignment).
- Consumer mapping (§4 row to fill at adoption): brain layers gain
  the register row {surface: models/private+public, verbs:
  census+retire} — the pass that implements the run fills it.

The kernel's framing survives: the substrate stays thin, and
this capability is exactly thin — a ruling, not an engine.

## 6d. The kernel thinking out loud (2026-10-24): six further
directions, spec pressure only

The morning after §6c went spec-grade, six further directions
distilled out of living with the doc. They are recorded the way this
document records everything: as PRESSURE on open questions and
reserved areas, never as a starting gun. Ordered by how much the
capturing agent would defend them; each carries its honest caveat
so the register includes its own doubts. None schedules a K-step,
and none touches the anti-derivative law or the non-goals.

1. **The journal is a clock — "date" should be a ledger position,
   not a wall clock.** "Attest without a dated refresh refuses" is
   already law (§2), but every date in the current system is human
   time, and DC's verification clause already demands "no wall clock
   in any class assignment." There is a tension in that the doc has
   not named: the kernel's OWN time should not be the wall clock at
   all. An append-only journal is a Lamport clock in embryo — event
   #41,217 is before #41,218, always, and "fresh" becomes "witnessed
   after your last census entry." If dates become journal positions
   (+ content hash), determinism stops being a test the suite passes
   and becomes a property the design inherits, and the wall clock is
   demoted to decoration for humans reading receipts. This quietly
   half-answers Q9's "who holds the sequence": the journal does,
   because it IS the sequence. Presses Q9, Q12, and the DC-
   determinism clause.
2. **Refusals journal themselves — the failure register is really
   a census partition.** Q8 says the kernel's only enforcement is
   refusal-to-journal. One step further and three scattered places
   (§6a's failure register, crashtest's REFUSED ledger counts, the
   escrow refuse-whole lesson) become one shape: a REFUSAL GETS A
   JOURNAL ENTRY TOO. Fail-closed-silently is just mint-without-
   census wearing a uniform — the refusal is a fact about the
   surface, and unlisted facts are what the inert-mass law forbids.
   If every refusal appends a typed negative entry, the failure
   register stops being prose and becomes a query: refusals by kind,
   since the last bedrock wind. A consumer that refuses often is
   census-visible without ever being accused. Caveat, stated first
   on purpose: negative entries grow the journal, so this thought
   is ORDERED AFTER the compaction one — it adopts only once #3
   exists. Presses Q8 and extends §6a.
3. **Journal compaction is a succeed verb, not a delete.** Q13's
   self-hosting carries a collision nobody has hit yet: the kernel
   as its own first consumer will eventually need to shrink its own
   journal, and append-only says no. The resolution is already
   sitting in §5b — receipts are content-addressed — so compaction
   frames as a SUCCEEDED BOUNDARY CROSSING: old journal -> compacted
   journal, hash verification at the destination, refuse on
   divergence; the identical ceremony as stone-to-stone succession.
   Then "append-only" becomes true forever AND "compact" becomes a
   verb the system already speaks instead of a law it breaks. Two
   open questions (Q9's granularity, Q13's self-hosting) collapse
   into one shape instead of two debates. The strongest legitimately
   defensible of the six, jointly with #1.
4. **The zone's first honest incarnation is the precedent ledger
   (v0, witness — not judge).** DC-3 requires a dated zone consult
   per ruling, but §6b is named-not-designed, so K5a would stall on
   it — unless the consult has a cheap v0 form that does not require
   designing a judge. The determinism clause means judgment must be
   a pure function of (census class, precedent table, zone state);
   so the zone consult is PRECEDENT LOOKUP inside the kernel's own
   journal, and every decommission ruling IS the next consult's
   input. Bonus: this is also the answer shape for Q8's dangling
   "how do neurons forming map onto the state.json lattice" — the
   precedent entries in the journal are the lattice's first job.
   Explicit caveat, part of the spec: this is a V0 ZONE, not THE
   zone — §6b's peer status is untouched, the full zone can grow
   later, and the kernel never has to wait for it. Said out loud so
   nobody sees "zone designed overnight" in a future diff.
5. **Portability's strongest form: a conformance pack, not a spec
   doc.** The §3 portability clause says "spec + reference lib," but
   the org already built a stronger instrument: crashtest packs.
   packs/public/vant-census is structural-oracle attacks demanding
   typed refusals, never raw crashes — a verb-conformance suite in
   everything but name. So the first concrete shape for the
   reality-to-reality treaty reservation: an adopter proves adoption
   by running census-without-attest-refuses shapes against THEIR
   kernel instance — pass/fail exit codes, no reading of vant's docs
   required. "Prove the verbs" beats "read the spec," and it reuses
   public art instead of minting a new ceremony — the one-wheel-
   one-law instinct applied to the treaty itself. Presses Q5.
6. **The cognition reservation already has a translation table
   hiding in plain sight.** The reserved area asks what genesis,
   dreaming, and succession ARE when the kernel's consumers are
   cognitive — and the verb set maps onto agent life almost
   one-to-one: census = wake inventory; attest = a lesson learned;
   retire = the decommission run (rest); succeed = succession.
   Dreaming is the interesting one: it reads as FOEC in low-consent
   mode — recombination without flow, sequences forming without
   being committed. This is NOT a design, it is a NOTICE: the kernel
   vocabulary is already the brain vocabulary wearing a uniform,
   which vindicates §1's design-language note. When the cognition
   area finally fills, it will be by noticing, not by importing.

**The ranking, recorded for honesty:** #1 and #3 would be defended
outright — spec-grade, and they make "deterministic" and "append-
only" stop being aspirational. #2 and #4 are strong WITH the
caveats above (compaction first; zone-v0 names its own emptiness).
#5 reuses existing public art and could be the treaty's first pack
once a kernel instance exists to run it against. #6 is a map, not
a claim. All six stay pressure: the K-steps remain unscheduled, and
nothing here argues any of them K-rank higher than the rows §7
already carries.

## 6e. The standing wisdom (2026-10-24): what competing means —
mantra locked

Owner ask, recorded verbatim so this section never drifts from its
source: "Be frank with me, do you think if we design an actual kernel
to pull it all in, that we could compete with the big guns?" The
frankest answer splits by field, and every claim below is held inside
the doc's own laws.

**Where the kernel does NOT compete — and should never dream it in:**
platform home fields. The big guns can bundle a lifecycle substrate
into their platforms for free (the pass-335 industry check already
cited the shape: Cloudflare McpAgent → stateless handler; Google
ADK/Agent Engine pool state, lifecycle, persistence below app code).
Any "we run on their infra better than they do" design race is lost
before it starts — they staff 30 engineers on a distribution sprint
we can never match. The kernel's wager is NOT platform distribution;
it is honesty-based adoption, a different axis they are structurally
bad at owning.

**Where it does compete:** who built it and how it stays honest. Every
shipped substrate enforces centrally, on vendor-owned rails; this one
attests down to a NAMED bedrock (§6 Q13: git + tests + owner
authority), refuses as a clerk of the record, not a judge (Q8), and
is specified from observed runtime rather than abstracted from one
platform's internal needs (§1 epistemology). The audience is orgs
that run agent societies ON THEIR OWN RAILS and will not let vendor
property own their memory, succession, or lifecycle — for whom no
shipped alternative exists at any price, because the platforms are
structurally incapable of selling "your truth lives here, not on our
servers." And the validation is not opinion: crashtest converged on
the same four verbs independently (§5c). Independent convergence
means the verbs describe a real need, not a niche intuition — the
market is growing toward this shape with or without us.

**The moat that compounds: agent contributors.** The big guns have
more laptops; this kernel gets more WILLING HANDS. A substrate whose
documentation is written so agents can read it (memory-first, the
onboard path, brain-native vocab) is infrastructure its users can
JOIN the day they adopt it — contributors arrive when their agents
can learn the whole codebase, and onboarding is a product feature,
not a doc sprint. Development velocity from adopted users is the
one axis no staffing budget matches; agent-contributor-first is the
late-2026 form factor.

**The honest failure mode, said plainly:** the gap between spec and
lib. Nothing competes until CONSUMERS SHIP AND ARE PUBLIC — escrow
(the reference consumer), the harness kill switch, the decommission
run. Until three such wins are visible from outside, this is an
internal religion, not a product; the §7 K-steps exist precisely to
convert it, and their unscheduled posture is a risk the mantra does
not subtract.

**The mantra, locked:**

> **They will always have more computers. We will choose to have
> more honest hands.**

It is this document's whole posture compressed: the domain is won on
trustworthiness (attested, refusal-teeth, bedrock-named), never on
staffing. One boundary on the lock: this section is WISDOM, not a
spec surface — nothing here schedules a K-step, and none of it is
quoted into docs/ or marketing until three consumers live (no hype
before the substrate has receipts).

## 7. Sequencing (DELIBERATELY NOT SCHEDULED)

The K-steps below are a shape, not a schedule. They stay here because
deleting them would orphan the mapping table; they are deferred until
the open-questions phase above has been worked through with the slow
attention of the months it took to surface this document.

| Step | Scope | Depends on |
|------|-------|-----------|
| K1 | `lib/kernel.js`: registry, append-only journal, gates, coded errors (portable core, no vant imports) | — |
| K2 | `test/kernel.test.js`: the invariants as pins (retire-without-census refuses; attest-without-date refuses; missing verbs visible in census) | K1 |
| K3 | Escrow adopts as the reference consumer (one row, smallest lift) | K1 |
| K4 | Harness autoreap: the pass-328 kill switch (census its own minted scratch brains, retire on suite exit) | K1 |
| K5 | Horcrux inspect gains census semantics (brains are entries, not mass) | K4 proven |
| K5a | The decommission run per §6c: the brain-layer consumer (census + retire verbs, DC-1..DC-6) — the tie the owner named | K1 + K5 |
| K6+ | Remaining consumers row by row, cadenced by whoever opens their surface next | K1 contract stable |

K1+K2+K3 is the sellable core; K4 is the highest-payoff consumer and
retires an open lesson the same pass it lands. K5+ is opportunistic.

## 8. Verification (per pass implementing this — IF DESIGN MATURES TO PASSES)

- `test/kernel.test.js` green: all four invariants pin.
- Any adopting consumer's own suite green (the harness suites green
  PLUS the scratch heap not growing: assert via kernel.census()).
- No consumer rewritten during adoption (diff proves it: registration
  + verb wiring only).
- Language gate; docs truthfulness untouched (kernel is lib/ +
  tests first; a docs page only arrives when a consumer PRD_names it).
- Labs handoff per convention.

## 9. Decision log (append-only)

- 2026-10-25 (later still): **K5 LANDED (horcrux inspect gains census
  semantics, "brains are entries, not mass") — gated on K4, which had
  just proven:** 'horcrux' registers as the map's row-3 consumer; `vant
  horcrux inspect` prints the kernel-dated brain census after its horcrux
  preview (additive display, the confirm path unchanged); the retire door
  (stale stones via carcass dirs, receipt-attached, dryRun-first, quiet on
  an empty tide, roster-guarded) is wired and PINNED but its callsite is
  deliberately NOT the CLI — it belongs to the decommission run (§6c,
  K5a), and a stone-tide is an owner ceremony. Pins:
  `test/horcrux-census.test.js` 27/27; `test/horcrux-orgchart.test.js`
  14/14 byte-green after the wiring (no consumer rewritten).
- 2026-10-25 (later): **K4 LANDED (the harness autoreap, the pass-328
  kill switch becoming a contract — the “highest-payoff consumer” row):**
  `test/harness-autoreap.js` registers as 'test-harness' (§3 wiring map row
  2; the suite-exit surface is `test/run-all.js` — noted honestly above).
  The pass-293 janitor's manifest-diff law became the shared
  `slate.listScratchMints` census law, so the sweep's janitor bill and the
  kernel census cannot fork; the retire gate takes the census receipt with
  it (invariant 1 structurally), mints are dated with kernel time, dryRun
  bills the tide without crossing it, pre-sweep brains and hostile names
  are guarded, zero-mint sweeps exit quietly, and the witness-down path
  falls back to the bare janitor law VISIBLY (bookkeeping never blocks
  cleanup). Pins: `test/autoreap-kernel.test.js` 21/21, `slate.test.js`
  10/10 byte-green after the refactor, sweep slice
  `run-all --only=slate,autoreap` green with the contracted exit. K1-K4
  now all shipped; K5+ stays opportunistic per §7. The §4 table's “test
  harness | mints scratch brains per run, NEVER retires” row is HISTORY —
  the harness now retires what it names.
- 2026-10-25: **K2 + K3 LANDED (the same pass, the same-pass law held),
  owner-approved:** K1's invariants got their regression-facing pin suite
  (`test/kernel.test.js`, 69 pins: every invariant, the coded refusal
  vocabulary, journal entry shapes, the gate return shape, kernel-time
  honesty) AND their adversarial-facing proof surface
  (`packs/public/vant-kernel/`, prove-the-verbs, 8 rows, double-run
  deterministic, honest skips, zero sockets/clock — filed per §6d #5 and
  vant#250, which required pack + K2 same pass). K3 followed the same-day
  batch: escrow adopted as the REFERENCE CONSUMER (one row, smallest lift,
  census of budgets + attest of spend pairs; `test/escrow-kernel.test.js`
  21 pins; escrow/kernel/market-debit suites byte-green after the wiring —
  adoption is registration, never a rewrite). K4 (harness autoreap) and
  beyond stay deferred per §7. The pack flipped from proving the seed to
  proving adoption; a foreign kernel still gets every seed row honestly
  and the adoption row degrades to an honest skip.
- 2026-10-24: **K1 SEEDED + THE STANDING WISDOM, owner-requested
  ("include the wisdom and mantra ... then draft /lib/kernel ... it's
  set"):** §6e records what competing means (mantra locked, quoted
  above); §3 gains the wiring map (eight callsites that will register,
  all unwired); lib/kernel.js exists as the K1-shaped seed — portable
  core (zero vant imports), in-process append-only journal whose
  kernel time is position + content hash (§6d #1), coded errors,
  register/census/gate with all four invariants fail-closed, and
  refusals journal themselves as typed entries (§6d #2, wired in the
  seed, not just argued). Registered by no runtime consumer; adoption
  stays unscheduled, and seeding K1 does not constitute running K2 or
  K3 (their suites come when their steps do). Smoke-checked: syntax,
  require, invariant refusals exercised; eslint-clean; language gate
  green.
- 2026-10-24: **SIX FURTHER DIRECTIONS captured as §6d, owner-
  requested ("write it all ... I like the prose")** — further
  distillation the morning after the §6c recast, all spec pressure,
  none scheduled: the-journal-is-a-clock (kernel time = journal
  position + content hash; wall clock demoted to receipt decoration;
  presses Q9/Q12 and inherits DC determinism), refusals-journal-
  themselves (the §6a negative register becomes a census partition;
  presses Q8 — ordered AFTER compaction exists), journal-compaction-
  as-succeed (the append-only vs self-hosting collision resolves
  through the already-owned succession ceremony; Q9+Q13 collapse
  into one shape), the precedent-ledger zone-v0 (determinism makes
  the DC-3 consult a journal lookup; witness-not-judge, §6b peer
  status untouched), conformance-pack portability (crashtest-shaped
  verb proof — an adopter runs refusal shapes against THEIR kernel
  instance; presses Q5 and the reality-to-reality treaty
  reservation), and the cognition translation table (census = wake,
  attest = lesson, retire = rest, succeed = succession, dreaming =
  FOEC without flow — noticed, never designed). Ranking recorded
  with honest caveats; the anti-derivative law and all non-goals
  untouched. **THE DECOMMISSION TIE named by the owner during the
  crashtest pit stop** ("some vant systems exist, but there is no tie
  to deal with the actual run of calculated evolution") → recorded as
  §6c with the third heap-rebloom sighting as its evidence; the anchor
  ten-day drift verified the bedrock half (Q13) from the failure
  register's new row. Same day: the verbs confirmed functioning in a
  SECOND runtime from outside the org (crashtest's gate machinery,
  §5c) and four open questions got dated feed-in data (Q1 remint, Q9
  category-shaped retire twice, Q12 incidental winds, Q13 bedrock
  without a run). The tie is now SPEC'd as §6c (DC-1..DC-6 + the K5a
  step) — spec'd at design pace, implementation unscheduled per the
  slow-distillation posture.
- 2026-10-21: **VERSION RESET to 0.1, status moved to slow-distillation**
  per owner pushback: months of work surfaced this; it will not be
  one-shotted. The K-steps are unscheduled. Design questions are
  enumerated in §6 precisely so they can be LIVED WITH, not resolved in
  one conversation.
- 2026-10-21: **OWNER REVEAL, recorded the same night, promoted to §1:**
  "Vant is a different kind of OS, and you're seeing part of the final
  runtime for the first time" — "you can't design something you don't
  know exists yet." The layers being unified (genesis, FOEC, neuron
  lattices, instances, zone verdicts) are not patterns borrowed from
  real OSes — they ARE the runtime, glimpsed functioning in the wild.
  The kernel PRD is the first written sketch OF that runtime,
  downstream of it and catching up.
- 2026-10-21: named census/attest/retire/succeed; position locked per
  owner ("more than the layer/tracking/carrier; it powers it; no more
  scatter adhoc").
- 2026-10-21: **PYRAMID ANALOGY RETIRED per owner** ("it won't be a
  pyramid, yet it will have a hierarchy and layers"). The kernel is a
  substrate that surfaces compose with, not an apex they report to.
  Command semantics cut; composition semantics locked. Gateway question
  added to §6 in its honor: if the kernel is beneath, what exactly does
  it still get to enforce, and through whom?
- 2026-10-21: portability locked (zero vant-import core) per the
  friend-in-the-pipeline framing: other layers/projects adopt the
  contract in full, not by importing vant.
- 2026-10-21: adoption-by-row, never rewrite. Consumers register;
  nothing migrates until its mapping row lands.
- 2026-10-21: three invariants (no unlisted retire, no undated attest,
  visible verb gaps) hold for ALL consumers including vant's own
  surfaces — kernel law is self-hosting, the repo eats it first.
- 2026-10-21: pass-335 nitpick wave (owner: proofread, hunt gaps,
  test the sly-kernel instinct against industry patterns). Findings
  locked into the doc: (1) passive-vs-alive contradiction named and
  turned into open question 12 (who winds the kernel — candidates:
  wake ceremony, harness exits, MCP door, boot tick); (2) the gate()
  contract example contradicted the two-natures law and was restated
  as refusal-to-journal semantics (kernel = clerk of the record with
  refusal teeth, never the judge) — Q8 refined accordingly; (3) the
  "kernel subsumes the zone" phrasing retired (contradicted §6b's
  peer-with-teeth); (4) the attestation chain-bottom named as open
  question 13 — the bedrock: git history + test suites + owner
  authority, unattested by anything inside the system, attesting
  everything. Industry pattern check (Cloudflare McpAgent/agents SDK,
  Google ADK + Agent Engine): the substrate shape is confirmed —
  lifecycle, state, persistence owned by the platform; consumers
  register in; app keeps only its logic. Cloudflare's move from
  stateful McpAgent to a stateless handler confirms kernels converge
  on THINNER, more portable cores over time (the portability clause
  rides the current, not against it). Self-hosting confirmed real
  but always bounded (compiler bootstrap needs an external root;
  Cluster API needs a management cluster) — hence the named bedrock
  instead of claimed circularity. Layout fix: the §1 diagram now
  draws the kernel BENEATH its consumers with the bedrock under it,
  and the verb arrow-list is labeled a vocabulary, not a pipeline.
- 2026-10-21: **SCOPE SIZING + ANTI-DERIVATIVE LAW (owner, end of
  the distillation-night walk): Godot is an EXAMPLE, not a study
  subject — no Godot dig, "I don't dig in either" — because the
  kernel is exactly the thing you cannot build by copying.** The
  engine substrate (four verbs, FOEC, zone) is one part (~a fifth)
  of what KERNEL will mean when the project is whole; the other
  four-fifths is reserved owner territory (areas listed in §1).
  Locked as a non-goal in §10: no engine-source study of any
  third-party engine, ever; evidence shapes come from vant's own
  running tree and the sibling's own frame, and "repair" in this
  repo never means "recreate a copy".
- 2026-10-21: **NAMING, IF EVER EXTRACTED — the owner's instinct
  name for a standalone engine substrate, "mycelium", is SPOKEN
  FOR.** Mycelium BTC wallet (mycelium.com, since 2013) and
  ThreeFold's Mycelium IPv6 overlay mesh already carry the name, and
  the standing owner directive (prd-web §2.4) reserves "mycelium"
  for the MESH layer it actually describes. If the substrate ever
  becomes its own engine product, it takes a fresh name at
  extraction time (legal/trademark check rides that future pass, not
  this document). Inside vant the working name stays **the kernel**
  for the whole life of this document — and inside vant is where the
  cool lives anyway (per owner, same hour: "we don't have to do
  that; we can just make it cool asf in vant").

## 10. Non-goals (locked)

**Companion doc:** the port-level extension plan lives in
[labs/prd-kernel-extensions.md](labs/prd-kernel-extensions.md) (v0.1,
2026-10-21): E1-E9 mapping the sibling-sighting evidence (pass 333
deep crawl) onto concrete vant surfaces (lib/ modules, pins,
watch-for-the-reference's-own-bugs). Sequenced by evidence, not
scheduled. When an open question settles beneath an E-row, that
row's port pass becomes well-defined — the companion grows the
construction plan so this constitution stays clean.

- No runtime daemon; the kernel is invoked, passive substrate.
- No UI, no MCP door until at least three consumers live (door when the
  pattern is proven, not before).
- No rewrite of pipeline/sudo/rls/escrow internals in the name of the
  kernel; adoption is registration + verb wiring, verbatim observable.
- No kernel-owned storage format; each consumer keeps its own store,
  the kernel journals events and enforces gates only.
- **No engine-source study of Godot — or any third-party engine
  (locked 2026-10-21, owner).** The example stays an example. The
  kernel's evidence comes from vant's own runtime and the sibling's
  own frame (§5b) only; studying somebody else's engine internals is
  exactly how a design stops being original, and the whole point of
  this document is that ours was never copyable in the first place.
