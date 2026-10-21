# Vant Kernel (the Lifecycle Substrate) — Product Requirements Document

**Version:** 1.0
**Branch:** axolotl
**Date:** 2026-10-21
**Status:** Drafted from the pass-317..328 arc, pending owner approval
**Powered-by lineage:** distilled from the census/attest/retire/succeed
pattern observed across pipeline, sudo, rls, escrow, horcrux, prune,
docs gates, the pass ledger, and the marketing channel tables.

---

## 1. Position (locked)

This is **the top of the pyramid**, not another subsystem in it.

Working name: **the kernel**. It is the small substrate that issues the
four lifecycle verbs to every layer that persists, gates, carries, or
remembers anything: pipeline, sudo, rls, escrow, horcrux, prune, the
pass ledger, the test harness, the docs gates, channel tables. Today
those seven-plus surfaces each half-implement the same protocol ad hoc,
uncoordinated, and occasionally wrong (the pass-328 heap existed because
the test harness could mint without ever being forced to retire).

The relationship, stated exactly:

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
the pipeline.**

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

## 5. Why pyramid-top (the owner's framing, stated back)

The layer/tracking/carrier trio (memory, ledger, stone) remains the
product. The kernel does not compete with them; it **powers their
guarantees**:

- The ledger's "passes and pins only" is kernel-attest discipline.
- The stone's "honest mass" is kernel-census semantics.
- Prune/rule discipline, sudo refusals, escrow budgets, RLS tenancy:
  all retire/attest/census in different clothes.
- The pass-328 heap is the proof of the negative: a surface with mint
  power and no retire waste got the whole layer filthy.

With the kernel, "no more scatter adhoc" is literal: one substrate
issues the verbs, every consumer declares itself, `kernel.census()` is
the single place to see who has what verb and what it has minted.

## 6. Sequencing

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

## 7. Verification (per pass implementing this)

- `test/kernel.test.js` green: all four invariants pin.
- Any adopting consumer's own suite green (the harness suites green
  PLUS the scratch heap not growing: assert via kernel.census()).
- No consumer rewritten during adoption (diff proves it: registration
  + verb wiring only).
- Language gate; docs truthfulness untouched (kernel is lib/ +
  tests first; a docs page only arrives when a consumer PRD_names it).
- Labs handoff per convention.

## 8. Decision log (append-only)

- 2026-10-21: named census/attest/retire/succeed; pyramid-top position
  locked per owner ("more than the layer/tracking/carrier; it powers
  it; the top of the pyramid; no more scatter adhoc").
- 2026-10-21: portability locked (zero vant-import core) per the
  friend-in-the-pipeline framing: other layers/projects adopt the
  contract in full, not by importing vant.
- 2026-10-21: adoption-by-row, never rewrite. Consumers register;
  nothing migrates until its mapping row lands.
- 2026-10-21: three invariants (no unlisted retire, no undated attest,
  visible verb gaps) hold for ALL consumers including vant's own
  surfaces — kernel law is self-hosting, the repo eats it first.

## 9. Non-goals (locked)

- No runtime daemon; the kernel is invoked, passive substrate.
- No UI, no MCP door until at least three consumers live (door when the
  pattern is proven, not before).
- No rewrite of pipeline/sudo/rls/escrow internals in the name of the
  kernel; adoption is registration + verb wiring, verbatim observable.
- No kernel-owned storage format; each consumer keeps its own store,
  the kernel journals events and enforces gates only.
