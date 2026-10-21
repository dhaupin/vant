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
zone at runtime (the zone concept the kernel subsumes). Genesis
hydration, stone restore, a heavy wake — those are the mode in its
pure form. Failure is a runtime verdict, not a taxonomy entry: the
kernel exhibits the mode, the zone attests whether it passed.

```
        kernel  (issues the invariants: census -> attest -> retire -> succeed)
       /   |   \
  pipeline sudo rls ... escrow, market, horcrux, harness, ledger ...
       \       /
        consumers of the verbs
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
| marketing tables | dated status columns (already right shape) | nothing structurally; just register | template consumer |

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
   MITIGATOR under it — it does not command, it prevents FOEC by
   forming consensus/sequencing before flow. OPEN remains: the exact
   mitigator mechanics — does the kernel decline-to-journal illegal
   verbs (passive), form consensus pre-flow (active chain), or ripple
   refusal up through neurons it has formed (chain reaction) — and how
   "neurons forming" maps onto existing structure (the state.json
   neurons lattice is already named that for a reason — is the kernel
   the thing that finally gives THAT lattice a job?).
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
    takes month-level uninvited ones: CI flake storms, a host dying
    mid-pass, a session dying at an arbitrary point (the MEM.md
    discipline exists precisely because sessions die whenever they
    die). Suspected honest answer: same mode, different zone context —
    and the existing crash-safety suite (WAL, atomic writes, fail-
    closed gates) is already the observed answer for the storage
    layer. If so this is a MAPPING question (which crash-safety
    behavior is already kernel-shaped?), not a design vacuum. It
    still belongs on the list: connecting the kernel to the layer
    that currently holds these guarantees alone.

## 6a. The failure register (observed signatures of lying surfaces)

The epistemology cuts both ways: if the doc converges on a runtime seen
in the wild, the NEGATIVE sightings deserve the same rigor as the
positive ones. These are the violation shapes we have caught,
described as what they look like to an observer standing in one:

| Signature | What it looks like | Verified sighting |
|-----------|--------------------|-------------------|
| **Inert-mass census** | a count that hides kinds: "78 brains" — the number is true, the composition is a lie (66 were test carcasses) | pass 328, horcrux inspect |
| **Undated attest** | a claim pinned to no moment: status columns with no check date rot into lies-in-waiting | marketing PRD tables (pre-dating), PulseMCP pause row as the honest counter-example |
| **Mint without retire** | unbounded growth nobody owns: scratch brains minted per run, never swept; the archetypal leak | pass 328, models/private 199 dirs |
| **Succeed without inheritance** | continuity that loads but does not check: a restore that hydrates alive state carrying dead assumptions; a deploy that assumes what it did not merge | tonight's Cloudflare race; the succession contract's attest chain |

Rule of the register: entries are OBSERVATION patterns, not rule
violations — the invariants in §2 remain the law; this section is what
the law looks like when broken, on the outside. Future agents do not
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
