# PRD — The Crashtest Two-Engine System (packs + canonical vant rigging)

> Spec family: extends [prd-kernel.md](prd-kernel.md) (the test/ci canon),
> [prd-security.md](prd-security.md) (verdict semantics), and the
> packs/README.md ledger. Cross-repo context: dhaupin/crashtest issues
> **#8** (fakeD1 v0.2, Rook), **#9** (fakeD1/FakeKV breadth, us),
> **#10** (memory-drift/hallucination/resolution rows), **#11** (governance
> rows), **#12** (pack.json env-claim prerequisites), **#13** (vant
> test-to-crashtest census), **#14** (chaining/step-scoped verdict
> primitive, filed with this PRD). Census facts (2026-10-23): `test/` =
> 258 suites / ~54k lines; library rows on the vant run root: 30 REFUSED /
> 0 EXPLOITED / 0 skipped, both CI gate layers green.

## 1. The one idea

**Two engines, one marriage, neither owns the other.** Crashtest owns the
verdict engine: scenarios, verdicts, honest-skip grading, whitelists,
ledger/reporting, and the shared scenario libraries the world writes once.
Vant owns its rigging canon: the run-root fixtures, the shim routes that
drive vant's real code in-process, and a small native runner for the
buckets crashtest cannot grade (live infra, deploy gates, child-process
probes until the crate grows a fixture for them).

Neither side forces the other:

- **vant never builds a verdict engine** — verdict semantics, determinism
  law, whitelists, honest-skip contracts stay in the crate. A vant-local
  re-implementation of any of those is a bug, not a feature.
- **crashtest never depends on vant** — no crate file requires anything
  under vant's tree; scenario libraries are general (any agent-memory-
  shaped app), vant-specific discipline rides in `packs/*` shipped *with*
  the thing it attacks (the animals-first precedent, packs/README).
- The one-way boundary lives here too: packs consume vant's surfaces via
  run-root fixtures as facts on the wire; the pod's lib graph never
  imports pack code, and the pod suite staying green with `packs/` present
  is the check that keeps this true (same law as `web/`).

Rework next (P3 of this PRD): vant's OWN rigging becomes the consistent,
canonical vant system — one runner, one whitelist source, one fixture
config crate — *not* a shadow verdict engine.

## 2. Roles (who owns what)

| Concern | Owner | Rationale |
|---|---|---|
| Verdict vocabulary, contract, `run()` shape | **crashtest** | v1.0.0 contract is the standard; vant conforms |
| Honest-skip / armed-vs-absent grading | **crashtest** (#12 adds manifest claims) | coverage follows the fixture, never a false positive |
| Determinism law (no wall clock in verdicts) | **crashtest** | cross-repo reproducibility beats per-repo convention |
| Whitelist bookkeeping, ledger, exit codes | **crashtest** shapes vant wires | KNOWN_FINDINGS/ALLOWED_FINDINGS lockstep stays vant-side glue until the crate takes manifest expectations |
| Scenario libraries (memory, governance, input, race, state, upload, …) | **crashtest** (rows) + **vant** (packs) | general families in the crate; vant-specific attackers beside the attacked code |
| Run-root fixtures: shim routes over vant's real libs, fake env bindings | **vant** | only vant knows how `lib/brain` wants to be driven |
| The native runner (`test/runner.js`), live/deploy gates | **vant** (P3 rework) | the buckets crashtest cannot grade stay ours, done canonically |
| Packs: `packs/public/<name>` with the thing they attack | **vant** | the pack lives with the thing it attacks |

## 3. The migration matrix (census → phases)

Buckets from issue #13's census, each with a landing phase and the crate
capability it depends on. **Nothing is forced**: a bucket converts when
(its crate capability exists) AND (its native run is green on both layers
for a full cycle — the reverse-verification rule, §6).

| Bucket (census estimate) | Share | Phase | Depends on |
|---|---|---|---|
| In-process module discipline (brain/storage/locks/escrow/guests/auth/trust/teams) | ~40% | **P1 — convert now** | nothing; the run-root pattern (vant-brain/crew/mcp arms) already proves it |
| Wire-surface doors (REST/MCP/relay/webhook) | ~15% | **P2 after packs** | #9 (fakeD1/FakeKV breadth), #12 (env claims); `vant-relay` pack first (packs/README survey) |
| Structural / census oracles | ~5% | **done** (vant-census) | #5, landed |
| Novel families (memory drift, hallucination, resolution, governance) | — | **P4 adopt** | #10, #11 rows land in the crate, vant adopts + arms |
| Stateful conversations (sync/backup/federation/forum flows) | ~20% | **P4 — wait, then convert** | **#14 chaining primitive** + the two-pod fixture broker (§4) |
| Child-process module probes (fresh-module buses) | ~10% | **P3 stays native; P5 adopts if fork fixture lands** | a crashtest `fork` fixture (§4, ask #5) |
| Live infra (docker, deploy, gh workflows, sidecars) | ~10% | **never moves** | by design — sockets/externals are outside the crate's law |

## 4. What unlocks the remaining conversion surface

The census named ~70–80% rectangular. Here is the exact shopping list that
takes conversion from "the easy 60%" toward "everything that can move",
with the bucket each item unlocks. Filed as crate issues; each is small.

1. **Chaining / step-scoped verdicts (issue #14, filed with this PRD).**
   Unlocks the ~20% stateful bucket. The primitive: a conversational run —
   `harness.runChain([step, step, ...])` where each step is
   `{ name, route, init?, expect?, state: (bag) => init? }`, the bag is a
   deterministic shared state object across steps, and every step grades
   its OWN verdict record (per-step REFUSED/EXPLOITED + the chain-level
   summary verdict). No wall clock in the bag; findings stay step-named
   (`chain-step 'token-2' of 'otp-conversation'`). Without it, stale flows
   smear into one blob verdict; with it, step 4 of 6 names itself.
2. **Two-pod fixture broker.** The broker stages two runs roots (or two
   sets of shim routes) sharing deterministic fake bindings — the
   federation/backup/relay-ride conversations are two-party by nature. A
   `harness.podB()` sibling namespace with a typed mailbox unlocks the
   multi-party half of the stateful bucket; without it, even chains
   simulate both sides in one handler.
3. **Snapshot-diff helper.** `harness.snapshot(env.DB)` + `diff(before,
   after)` with a typed shape: vant hand-rolls store diffs in at least
   four arms today (row aliasing, idempotency ledger, stone restore,
   flood cap). Uniformity here is what makes state/conversion rows
   expressible WITHOUT per-pack store fixtures.
4. **fakeD1/FakeKV breadth (issues #8 + #9).** Unlocks retiring vant's
   statement-mapped fake (`web/home` status arm) onto the crate backend,
   and lets the rollup/percentile SQL shapes run as-written instead of
   JS-hand-cast — the wire-surface bucket's static bottom.
5. **Manifest env claims (issue #12).** `pack.json` declares binding/route
   prerequisites; armed-vs-absent becomes manifest-driven rather than
   five hand-probes per attack. Cheap, high leverage, unlocks clean
   diagnostics for any external run root adopting the packs.
6. **Determinism lint.** `--lint-determinism`: grep pack/library sources
   for `Date.now`/`Math.random`/`performance.now` in verdicts. Cheap
   insurance that keeps the now-pattern from creeping back as more
   converters port suites.
7. **Expectation tables as data.** Pack rows carry declarative
   expectation records (ledger/EXPECTED-style table) so CI keeps the
   "the table is complete" property vant's gate enforces by hand in
   `test/crashtest-packs.test.js` today.
8. **Fork fixture (child-process probes).** Vant's fresh-module probes
   (brain-state tamper, crew bus, MCP executor boot) exec probe children
   per route to dodge module caches. A crate `fork` fixture (an in-scope
   child with the same JSON/stdout contract as the vant probes) would let
   those become library rows rather than per-run-root shim routes. This
   is the LAST ask — everything above already precedes it.

**Bottom line:** asks 1–3 unlock the stateful ~20%; asks 4–5 unlock the
wire's static bottom + adoption ergonomics; ask 8 converts the last
in-repo-native bucket. What NEVER moves: docker/deploy/live-federation
gates and the two live sidecar suites (~10%) — externals/sockets stay
outside crashtest's one law, and that layer is the wrong home for them.

## 5. The vant rigging canon (P3: our own system, reworked)

Vant keeps a native rigging for what crashtest cannot grade — reworked
from today's organic accretion into one consistent system:

1. **One runner.** `test/runner.js` stays the single native runner; the
   ad-hoc per-script runners (`run-all.js`, `ci.js` glue) unify under it
   with one config surface (suite list, allowlist, timeout policy — the
   same set `test/ci.js` hard-codes today, promoted to a manifest).
2. **One whitelist source.** `ALLOWED_FINDINGS` (contract suite) and
   `KNOWN_FINDINGS` (run root) become ONE policy file
   (`packs/findings-policy.json`) read by both consumers — the lockstep
   rule ("both in the same commit, deleted together") becomes enforced by
   sharing the file, not by convention prose.
3. **One fixture config crate.** The run-root env specs (library rows',
   vant-home's, future vant-relay's) move to a shared module
   (`test/fixtures/bindings.js`) exporting named binding specs — the same
   objects the fake backend instantiates. A pack author wanting the
   vant-arm shapes imports the spec instead of hand-copying tables.
4. **One census gate.** The structural scripts (`scripts/check-*`) stay
   lint-based (per packs/README: repo-shape checks with no runtime; not
   packs) but get one standard entrypoint in the manifest with the same
   allowlist shape as everything else.
5. **Anti-goal (stated twice on purpose): the canon is NOT a verdict
   engine.** It orchestrates, configures, and stages; the verdict
   vocabulary, determinism law, and honest-skip grading remain crashtest's
   alone. Any vant-side code that starts producing "verdicts" is deleted,
   not extended.

## 6. Staged plan (P0–P5, reverse-verified, nothing forced)

| Phase | Land | Gate to pass |
|---|---|---|
| **P0** | the asks filed (#9–#14 exist), the census issue up | ledger green, both whitelist sets empty |
| **P1** | convert the in-process module-discipline bucket, first 10 suites as the pilot (`packs/public/vant-convert/` working name), one shared manifest entry per converted suite | pilot green on BOTH layers (native + crashtest) for one full CI cycle before the native run is retired |
| **P2** | `vant-relay` pack (web/relay r/2 wire, in-process, per the packs/README survey); test-kin wire bucket converts | same reverse-verification |
| **P3** | the rigging canon (§5): manifest, policy file, fixture crate | the two hard-coded whitelists die; `docs/operations/testing.md` updated |
| **P4** | crate adoption: memory/governance rows (#10/#11) armed; stateful bucket converts behind chaining + broker (#14 + §4 ask 2) | step-level verdicts green; per-pod flows keep native runs until parity shown |
| **P5** | fork fixture adoption of the fresh-module probes if the crate lands it | probes run as library rows; vant shim routes retired |
| **anywhere** | live/deploy/static buckets stay native forever | they live in the manifest like everything else |

Success criteria (whole program): crashtest ledger is the PRIMARY record
for everything but the never-move bucket; the native runner exists for
live gates + whatever the crate has not grown yet; upgrading
`crashtest@1.x` is a dependency-bump with zero vant-side migration code.

## 7. Anti-goals / non-goals

- **No big-bang switch.** Not "crashtest instead of tests" — packs where
  the engine is right, rigging where ours is right.
- **No sockets, ever** (inherits crashtest's one law; deploy/docker gates
  stay native precisely because they break it).
- **No verdict-theater in vant.** The canon staging code never scores.
- **No new fixture-shape dialect per pack.** Binding claims (#12) and the
  fixture crate (P3) keep one vocabulary.
- **No forcing crashtest's roadmap.** The asks are proposals with vant
  standees; vant ships what the crate has and keeps native rigging for
  what it does not.

## 8. Risks

| Risk | Mitigation |
|---|---|
| crate contract churn breaks vant CI (coupling) | schemaVersion-1 discipline + the census's per-bucket staging; contract-audit exists (`test/crashtest-packs.test.js`) and fails loudly on manifest drift |
| conversion loses fidelity (native `it()` asserts a nuance a row cannot see) | reverse-verification rule; a suite that cannot be expressed as rows stays native — no Judgment Theater |
| stateful smears before chaining lands | the stateful bucket stays native until #14; no smeared one-blob chains |
| whitelists rot into a dump | one policy file (P3) + the same-commit rule already in packs/README |
| two engines drift on vocabulary | §2 division is structural: vant produces no verdicts |
