# CASE STUDY — vant ⇄ crashtest: the migration log

> The living record of one app moving its test frame onto the verdict
> engine. Sibling of [prd-crashtest.md](prd-crashtest.md) (the two-engine
> spec — this doc is its TIMELINE, not its design). Written for
> dhaupin/crashtest as a real adoption case study: what a young, fast,
> ♥-shaped codebase actually does in week one of adopting a crate that is
> itself new. Sample honesty: this log is DATED and MEASURED — every
> entry carries the command that reproduces its numbers. No entry exists
> that CI could not re-derive.

---

## 0. How to read this log

- Entries are named **S0..S5** and carry a DATE + the tree-state they measured. An entry without a measurement is a promise, and this log does not write promises.
- **S1 is the anchored baseline:** the state vant measures "the morning after crashtest issues #8–#14 land". Rook works them on the crate; when they land, `S1` is measured FOR REAL and the assumptions below are checked against the tree, not assumed. Until then S1 is labeled *projected, anchored* — real numbers from S0 + the crate's expected behavior, no invented coverage.
- The migration rule from prd-crashtest §6 applies wholesale: nothing converts without its reverse-verification cycle (green on BOTH layers before the native run retires).

## 1. S0 — where the migration starts (measured 2026-10-23)

**The rigging situation, unvarnished.** Vant's main CI runner is *gigantic* — and it's real, grown organically in roughly one week of the system's moving life:

| Orchestration surface | Lines | What it does |
|---|---|---|
| `test/ci.js` | 530 | the CI brain: suite orchestration, timeouts, async-wait bans |
| `test/runner.js` | 339 | the micro-runner every suite rides |
| `scripts/crashtest-run.js` | 1,208 | the crashtest run root: sandbox, 24 shim routes, fixture bindings, library-row phase, both-policy exit codes |
| `test/ci-crashtest-gate.js` | 188 | the two-layer gate (contract + real harness) |
| `test/run-all.js` | 170 | suite lister |
| `.github/workflows/test.yml` | 111 | the workflow itself |
| **Total orchestration** | **≈2,550** | vs. crashtest's crate: owned upstream |

Plus one harness-adjacent habit the census caught: **`test/` holds 258 suites (~54k lines) against a ~1-week-old verdict engine that already out-expresses most of them** — hostile-input → typed-refusal suites are written as `it()` blocks when the verdict vocabulary was BUILT for the same assertion. The runner is not wrong, it is *pre-crashtest*: it is the discipline crashtest formalized, hand-rolled three different ways in one repo.

**What's already on the engine, measured (same day):**

| Check | Command | Result |
|---|---|---|
| Packs against vant | `node scripts/crashtest-run.js` | 7 packs: 28 REFUSED / 0 EXPLOITED / 4 honest skips (vant-census's rows ride declared host census data by design) |
| Library rows | same | 30 REFUSED / 0 EXPLOITED / 0 skipped — D1/KV-shaped rows ARMED this day (race/state/upload), arming stays conditional by design |
| Contract suite | `node test/crashtest-packs.test.js` | 67 passed / 0 failed |
| Two-layer CI gate | `node test/ci-crashtest-gate.js` | GREEN, both whitelists EMPTY |
| Findings earned/fixed same-turn | ledger | 2 real findings measured + fixed the day armed (flood cost cap; upload double-extension), whitelists still empty |

**Cross-repo state:** crate asks filed and open — #8 (fakeD1 v0.2, Rook's), #9 (fakeD1/FakeKV breadth), #10 (memory rows), #11 (governance rows), #12 (env-claims manifest), #13 (the census), #14 (chaining). The vant side waits for nothing hardcoded: the run root arms what the crate has, keeps native rigging for what it doesn't.

## 2. S1 — the anchored baseline (*projected, anchored*: "the morning after #8–#14 land")

Written as the measurement that git would produce, so nothing is vague:

**Crate asks, landed (assumption rows — S1 checks them against the tree):**

1. **fakeD1/FakeKV breadth (#8+#9)** — v0.2 executes CREATE/ALTER, aggregates, JOINs, functions, upserts; batch partial-apply semantics; KV pagination + deterministic TTL. *(Vant-side delta: the web/home statement-mapped fake — ~90 hand-lined lines in `makeFakeD1()` — is deleted; the status wire rides the crate backend as-written.)*
2. **env-claims manifest (#12)** — packs declare `env:` prerequisites. *(Delta: the five per-attack hand-probes in the library collapse to one manifest read; skips render "needs DB, UPLOADS" structurally.)*
3. **memory + governance rows (#10+#11)** — drift/hallucination/ resolution/succession/escrow/lock families exist as library rows. *(Delta: vant's run root arms them over brain-file fixtures; the vant-specific ancestors in vant-brain cross-check the general rows against vant's own earlier fixes.)*
4. **chaining (#14)** — step-scoped verdicts + deterministic state bag. *(Delta: the first chain-backed pack appears — the sync round-trip row family converts from one-blob handlers to named steps.)*
5. **two-pod broker (prd §4 ask 2)** — *(Delta: federation/backup rides become two-root conversations with per-step verdicts.)*
6. **fork fixture + snapshot-diff helper + determinism lint + expectation tables (prd §4 asks 3/6/7/8)** — *(Delta: vant deletes ≥4 hand-rolled snapshot diffs; the fresh-module probe routes become library rows pending the fixture; `--lint-determinism` joins the gate.)*

**Expected S0→S1 measurable deltas (each becomes a checked line when measured):**

| Metric | S0 (measured) | S1 (expected) |
|---|---|---|
| Library rows skipped | 0 | 0 (arming proved conditional-by-design, not luck) |
| Library rows armed from crate families | 30 (input/guards/authz/race/state/upload/session/recursion/taxonomy/volume/…) | +9 (memory #10) +10 (governance #11) on file/KV/D1 fixtures |
| Hand-cast fake D1 lines | ~90 | 0 (crate backend only) |
| Whitelist files | 2 (lockstep by prose) | 1 (manifest-claims + shared policy) |
| Run-root orchestration lines | 1,208 | ≤900 (fixtures ride the crate; probes/fork fixture pending) |
| Findings earned this phase | recorded in ledger | recorded in ledger (empty whitelist is the bar) |

## 3. The progression table (S0 → S5)

| Entry | State | Gate to pass before next entry |
|---|---|---|
| **S0** | now: packs green, library rows fully armed, asks filed, rigging giant | crate asks land on the crate's own release |
| **S1** | the anchored baseline above, measured for real, assumptions checked | S1 deltas within tolerance AND both CI layers green |
| **S2** | P1 pilot: first 10 module-discipline suites convert (van-brain-family shapes), one manifest entry each | pilot green on BOTH layers one full CI cycle; findings parity with the native run (verdicts match 1:1 or the nuance is named and stays native) |
| **S3** | wire bucket converts behind `vant-relay`; rigging canon lands (policy file, fixture crate, one manifest); gigantism line itemised: orchestration lines regress by the conversion deltas BELOW while coverage regress... *read: never grows organically again* | the manifest IS the suite list; the two hard-coded whitelists are dead |
| **S4** | crate adoption of #10/#11 rows; stateful bucket converts behind chaining + broker | step-level verdicts green; no smeared chain packs remain |
| **S5** | fork-fixture adoption of fresh-module probes; live/deploy bucket confirmed permanently native | the census table has no unplaced bucket |

Per-entry line-item to track (the gigantism watch): orchestration line count, whitelist file count, hand-cast fixture lines, and converts-per-cycle. The point of S3's clause: the runner's ~2,550 lines are the baseline the migration SHRINKS from; coverage grows while orchestration cannot.

## 4. What crashtest gets out of this case study

1. **A real week-one adoption number set.** How long "first pack for a repo" takes, what a run root actually needs to state (routes, env specs, seeds), and where honest-skip catches adopters by surprise.
2. **The findings-vulnerability yield curve.** At S0, precisely the rows that measured real crashes (flood cost, double-extension) came from newly-AWNED fixtures — S1+ tracks whether armed-rate predicts crash-rate (the crate's justification for growing arms before suites).
3. **First chaining adoption.** Sync/federation/backup flows become the first exercised consumers of #14 — the one place the verdict model grew because an adopter needed it, not because the PRD predicted it.
4. **Fork-fixture demand data.** Vant's fresh-module probes are the only adoption blocker left standing at S4; measuring exactly what they need (exec, JSON contract, module-cache isolation) becomes the fixture spec.
5. **The policy-file experiment.** The shared findings-pool file (S3) is a candidate for crate-wide promotion: if two consumers in one repo converge on ONE file, the crate takes the pattern upstream.

## 5. Standing honesty clauses

- Every corroboration runs from the tree: the S-counter never advances on vibes, and a failed reverse-verification RE-WINDS the entry (native runs return; the log records both verdict tables and the nuance that kept the suite native).
- The crate's one law binds here: no sockets in converted rows, no wall clock in verdicts — the deployment/live buckets prove the law's edge, and they stay native by design, not by neglect.
- This file is the only place the migration tells stories; the ledger keeps facts — any divergence between the two is itself a finding.
