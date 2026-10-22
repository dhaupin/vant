# Vant Kernel Extensions — Companion PRD (evidence-backed port plan)

**Version:** 0.1 (companion to prd-kernel.md, its slow-distillation posture inherited)
**Branch:** axolotl
**Date:** 2026-10-21
**Status:** Evidence-backed extension plan. Ports are PROPOSED, never scheduled
by this document alone; each lands as its own pass with its own pinned
test, per prd-kernel §8's verification law.
**Source of evidence:** the §5b sibling sighting (second coding of the
substrate under far harder load), the pass-333 deep crawl (hands on
source, findings recorded in prd-kernel §5b), and this repo's own
upstream loop (#92-#95, fixed pass 71).

---

## 1. Why a companion doc

prd-kernel.md is the constitution: verbs, laws, consumers, open
questions. This companion is the construction plan: HOW each kernel concept
lands in vant's actual lib/ tree, guided by shapes that already
survived a harder runtime than ours. Every extension row here maps to:

1. a kernel concept (§ number in prd-kernel),
2. a verified reference shape (per the deep-crawl evidence, architecture
   level — citable receipts only, closed-source posture respected),
3. the vant surfaces it touches (lib/ modules, by name),
4. the pin that proves the port (a test invariant).

Rule inherited from pass 331/332/333: **no port lands bug-for-bug**;
we port the LAW, both against the sibling's bugs AND our own rewrite
risks. And nothing ports until its section's owner-question stops
buzz-sawing (see §4 sequencing notes).

## 2. The extension plan (E-rows)

### E1 — Per-rule gate semantics (kernel §2 attest/retire gating)

- **Reference shape:** one generic evaluator; five infrastructure
  services become thin wrappers emitting rule requests; PER-RULE
  resolution strategies (top-wins / bottom-wins / predicate-gated /
  all-wins-with-effect) declared at the rule level, not global, not
  per-service. Answer shape for prd-kernel open question 2.
- **Vant surfaces:** lib/qos.js, lib/sandbox.js, lib/vaf.js, lib/gate.js
  (each currently owns its own decision logic; the pattern consolidates
  the DECISION, never the refusal law — fail-closed stays fail-closed).
- **Port discipline:** predicates stay OUTSIDE the journaled content
  (pass-333 design note: runtime behavior is not content-addressable —
  the reference's own fix for callable round-trip breakage).
- **Pin:** a gate test asserting per-rule semantics across a two-scope
  vant stack (brain, system) — the vant-scale analogue of the
  reference's two-scope evaluation.
- **Watch for:** the reference's own bug sighting #2 (predicate bypass
  under the all-wins path). Port the LAW (predicate decides in its own
  resolution strategy), not the marker-shortcut behavior.

### E2 — Dedup-by-content journal (kernel §2 attest, honest mass)

- **Reference shape:** folded-shell intersection rebate: facts stored
  once by content hash; removal is intersection-aware (removing one
  claimant never erases state another still claims); honest mass is
  PUBLISHED as counters (distinct facts vs attempted stores, a
  savings ratio).
- **Vant surfaces:** the kernel journal itself (lib/kernel.js K1),
  plus a candidate aftermarket: lib/brain.js public/private gather
  (post #92's type:'both' merge, gather already dedups by tag — the
  journal dedup is the same law at event scale).
- **Port discipline:** kernel journal events whose CONTENT is identical
  share bytes (dedup by canonical event hash), counters published the
  way T3 publishes savings_ratio — the kernel's census must be able to
  show its own honest mass.
- **Pin:** the mass test — journal.product after N redundant events
  equals the distinct-event count; the savings ratio is asserted, not
  implied.

### E3 — Succeed receipts (kernel §2 succeed)

- **Reference shape:** state diffs verified by root hash at the
  receiver, resync-on-mismatch, with a full-scope snapshot as the
  typed escape hatch when divergence is detected (the machinery the
  deep crawl found works end-point verified on both sides).
- **Vant surfaces:** lib/horcrux.js + bin/horcrux.js (the restore
  ceremony), lib/backup.js, the sync arc (lib/sync.js, lib/wal.js).
- **Port discipline:** the boundary crossing carries the hash TOGETHER
  with the bytes; the destination verifies FIRST, fails loudly on
  divergence, and escalates to full-snapshot resync rather than
  applying partial diffs against unknown bases.
- **Watch for:** the reference's bug sighting #1 (silent EMPTY diff on
  evicted bases). Our succeed port MUST refuse loudly when the base
  root is out of the retention window — never render "cannot know" as
  "no change." This single refusal pattern (typed out-of-window) is
  the PASS-333 finding with the highest port value.
- **Pin:** a restore test with a deliberately too-old base asserting
  the typed refusal path (not empty-diff, not silent success).

### E4 — Zone authority contract (kernel §6b, open q10)

- **Reference shape:** frame authority (decision D030, DONE in the
  sibling): transient scoped environments where rules differ
  (dream/tutorial/jail analogues), authoritative seed issued at ENTRY,
  the zone environment garbage-collected at END, cross-zone state
  leak PROHIBITED by law, persistent state living in the state tree,
  never the zone.
- **Vant surfaces:** the kernel zone award from prd-kernel §6b; the
  natural vant analogues are session scopes (guests, ownership
  sessions, frame equivalents for MCP tool invocations where a
  scoping boundary already exists in sandbox/RLS).
- **Port discipline:** the zone contract is: entry = seed issuance;
  life = never persisted as its own truth; end = GC with leak
  prohibition as a TESTED invariant (not a comment).
- **Pin:** a leak test — persistent state mutated inside a zone ends
  where the zone does, and a post-zone census shows the persistent
  tree untouched.
- **Sequencing note:** this port waits for open question 10 (peer vs.
  property) to stop tussling, because the zone contract ITSELF answers
  the question (authoritative seed implies an issuer ABOVE the zone:
  peer-with-teeth, not kernel-property).

### E5 — One-wheel law for kernel rhythms (kernel §5a momentum line)

- **Reference shape:** a single canonical chaos primitive; every
  rhythmic system (the cosmic wheel, per-actor anomaly wheels) spins
  through ONE law — accumulate, decay, spark, snapshot/RESTORE pairs
  for persistence, caps per-wheel as overrides of the same law.
- **Vant surfaces:** lib/nature.js already works (spark/signal on the
  shared bus); law adoption = any future kernel pulse (journal
  compaction, census cadence, the audit rhythm from §5a) rides
  nature's wheel rather than minting new timers.
- **Port discipline:** one wheel name-space; kernel pulses register as
  wheels (they get decay, thresholds, snapshots like everything
  else).
- **Pin:** a pulse test — a synthetic kernel audit rhythm spins
  through nature and fires exactly once per threshold crossing under
  the shared bus law.

### E6 — Load-validated recursion (kernel open q4)

- **Reference shape:** hierarchy is DATA, validated at boot: no
  cycles, all parents declared, one root; consumer-defined trees are
  extended without changes to the walker itself.
- **Vant surfaces:** kernel.register() consumer declarations become a
  validated tree (consumer parent links, surface scopes).
- **Port discipline:** recursion is checked at REGISTRATION, not
  guessed at runtime; split-horizon rules emerge from validated
  shape, not heuristic depth limits.
- **Pin:** register-refusal tests for cycles, orphan parents, and
  multi-root consumer trees — coded VantErrors (the pass-169 gate
  teeth law).

### E7 — The coalesce/critical lane law (kernel open q8, FOEC at scale)

- **Reference shape:** non-critical parameters coalesce through a
  window; flagged-critical parameters bypass immediately (both lanes
  attested, per that decision's own law).
- **Vant surfaces:** kernel journal write pressure under FOEC —
  genesis and stone restore mint bursts of events; mass handling of
  event emission needs the two-lane shape.
- **Port discipline:** criticality is PER-EVENT declared at emit time
  (a census event that respects the ledger is critical; a redundant
  attach event is not); neither lane drops, the slow one coalesces.
- **Pin:** burst test — a generated FOEC burst journals every event
  (nothing silently dropped), criticals land immediately, non-
  criticals land within the window; the ledger attests both.

### E8 — The uninvited FOEC posture (kernel open q11, port-candidate)

- **Reference shape (suspected, per prd-kernel q11's hunch): "death
  loses at most the in-flight unit, never the ledger."** The crash-
  safety suite here (WAL, atomic writes, fail-closed gates, brain
  locks, audit chains) is already kernel-SHAPED; mapping it is the
  port.
- **Vant surfaces:** lib/wal.js, lib/brain-lock.js, lib/audit.js,
  lib/error.js (coded-error spine), the events bus (lib/event.js).
- **Pin:** the crash-recovery test suite already holds most of this;
  the port's new surface is the KERNEL's own journal — same posture:
  an interrupted journal append must leave the previous coherent head
  reachable, never a half-entry, never a silent tail-cut.

### E9 — The observe-then-file pipeline (the #92-#95 law, formalized)

- **What:** the loop that actually paid from the sibling back to us —
  a colleague agent's fresh viewpoint surfaced four real bugs (three
  real code fixes + one onboarding friction), all fixed in pass 71.
  The kernel extension is to make this ordinary: the failure-register
  (prd-kernel §6a) sightings flow through issues (never silent
  patches, never carried hotfixes once the upstream is fixed), and
  the mesh's two-way return lane becomes a named process the kernel
  census can see.
- **Vant surfaces:** the pass-328 scratch-heap sweep's lesson, the
  marketing dept check cadence, and this very document's bug
  sightings (three, pass 333) are the pipeline's current tariffs.
- **Note:** the three deep-crawl bug sightings are future issue
  filings per the return lane — owner choreographs timing and the
  destination form (their private tracker, not this repo's issues).

## 3. What NOT to port

- **Bug-for-bug shapes** (predicate bypass in all-wins; empty-diff on
  evicted bases; absent-vs-emptied subtree hash equivalence). The LAW
  ports; the bug does not.
- **GDScript-specific memory discipline** (RefCounted idealization,
  Resource serialization quirks) — vant has its own GC world.
- **Any closed-source surface internals**: names, payloads, game
  domains, telemetry. Ports cite laws and shapes; receipt-level
  details stay in the reference workspace.

## 4. Sequencing (un-scheduled, evidence-ordered)

The E-rows are a MAP, not a timeline. Evidence-ordered priority (from
this deep crawl's payoff ranking):

1. **E3's typed out-of-window refusal** — highest immediate port
   value; succeeds across vant surfaces (stones, backups, sync) get a
   loud refusal where they currently have quiet assumptions.
2. **E2's journal dedup + published mass** — cheap once K1 lands;
   honest mass becomes a printed number.
3. **E1's per-rule gates** — the consolidation play; biggest breadth,
   touches four existing lib modules, needs the careful mapping
   conversation first.
4. **E6's load-validated registration** — tiny, first-mover for K1
   consumers.
5. **E4/E7 — zone contract + lane law** — wait for open questions 10
   and 8 to settle beneath them.
6. **E5/E8/E9 — rhythm, crash, and pipeline laws** — opportunistic,
   ride whoever opens each door next.

Every row respects prd-kernel §8: lib/ + tests first, no consumer
rewrites, no docs until the pattern is owned.

## 5. The crew clause (why this matters beyond ports)

The mesh reality recorded 2026-10-21: multiple organizations run vant
installs alongside this repo's engineering (the frame builder now on
ancillary npms and next builds — prestruct.shipped, freestruct
brewing; the crash-test harness advanced by Rook; an allied-org
colleague wiring a festival manager plugin). Every one of those
surfaces is a kernel consumer candidate, and every one is a fresh
viewpoint for E9's observe-then-file return lane. The kernel's
portability clause (zero-import core, per prd-kernel §3) is the piece
that makes the contracts SHARED rather than CENTRALLY OWNED — the
treaty shape for a mesh that is growing seams we can see from here.

Not a promise, a posture: the kernel is the substrate the crew can
build on together WITHOUT renting each other's runtime.
