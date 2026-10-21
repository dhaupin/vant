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
day): NOT a failure mode. A MODE — the opposite of FOUC one layer
deeper. FOUC is unstyled content flashing on the way to style; FOEC is
everything surfacing at once on the way to coherence — all layers, all
state, all carriers up together, none of it sequenced *yet*. Whether a
FOEC moment is good or bad is NOT the label's job: that judgment
belongs to the kernel zone at runtime (the zone/license concept the
kernel subsumes). Genesis hydration, stone restore, a heavy wake —
those are legitimately FOEC-shaped moments. Failure is a runtime
verdict, not a taxonomy entry: the kernel exhibits the mode, the zone
attests whether it passed.

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

- No runtime daemon; the kernel is invoked, passive substrate.
- No UI, no MCP door until at least three consumers live (door when the
  pattern is proven, not before).
- No rewrite of pipeline/sudo/rls/escrow internals in the name of the
  kernel; adoption is registration + verb wiring, verbatim observable.
- No kernel-owned storage format; each consumer keeps its own store,
  the kernel journals events and enforces gates only.
