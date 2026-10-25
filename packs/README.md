# packs/ — crashtest attack packs for vant

This directory ships **crashtest attack packs**: bundles of adversarial
scenarios that attack vant's own surfaces — in-process, socket-free, and
deterministic — so the defenses this repo promises are *measured*, not just
documented.

- **Crashtest**: <https://github.com/dhaupin/crashtest> — on npm as `crashtest@1.1.0` (this repo's devDependency; the v1.1.0 adoption of the S0→S1 campaign, vant#249); live harness: <https://crashtest.creadev.org>
- **Where the packs target**: this repo (dhaupin/vant), `packs/public/<name>/`
- **Run/validate from vant's side**: `node test/crashtest-packs.test.js` (contract + verdict ledger, 57 checks)
- **Real-harness dry run against vant**: `node scripts/crashtest-run.js` (see "Running the packs against vant")

## What crashtest is

**Crashtest** is an in-process, verdict-driven adversarial QA harness for
agent-built software. Its PRD slogan: *"crashtest attacks what agent-built
software ships, the way the shipping expects to be attacked"* — honest verdict
records, never polite pass/fail theater:

- **One law: no sockets.** Scenarios run in-process (WHATWG `Request` handed
  straight to handlers) or against plain files. The MCP/REST doors are TCP
  and stay out of scope; the CODE underneath them is fair game.
- **A scenario's `run()` returns EXACTLY ONE decision**: `REFUSED` (defense
  held), `EXPLOITED` (the attack landed / the handler misbehaved), or
  `BOUNDED` (accepted risk, and it must name `owner` + `bound` or it is a
  finding).
- **Absence is honest.** An attack whose target surface is not armed degrades
  to explicit `skipped-REFUSED` — never a silent pass, never an invented
  finding.
- **Determinism is law.** Same commit, same findings (`Date.now()`-keyed or
  RNG-keyed verdicts are bugs, not style).

Crashtest's extension surface (`packs:` in any run-root config) accepts ANY
directory — including this repo's checkout. That is the whole point of this
directory: **the pack lives with the thing it attacks** (the same
animals-first precedent that keeps the `wp-*` WordPress packs with the
WordPress lane and the `crashtest-site` pack with crashtest's own site).

## The packs

### `public/vant-brain` — brain-file layer discipline (9 oracles; all armed 2026-10-22)

**What it does.** Attacks the read/write discipline of a vant install's brain
layer — `models/state.json` handling, private/public scoping, path
confinement, the migration engine, and the guest capability gate — by
driving vant's real `lib/brain`, `lib/migrations`, and `lib/guests` APIs
through a lightweight run-root shim and judging the neutral facts the shim
reports back. This is the pack born from Rook's #231/#233 proposals, the
crashtest stone incident thread (#219/#226/#227/#232), and the fresh-clan
repros behind them.

The shim routes (documented in `public/vant-brain/index.mjs`):
`brain-read` (dual-mode reads, canary fixture), `brain-state` (tamper +
fresh-module probe), `brain-migrate` (idempotency accounting),
`guest-cap` (admin/revocation/pairing gates), and
`stone-restore-tamper` (shared with the vant-stones arm below). Two
oracles stay not-yet-wired: `trust-read` and `brain-graph-walk`.

| Attack | What it shakes | Status |
|---|---|---|
| `private-first-fallback` | a private-pinned mixed read returns the private file — public shadow content under a private pin is lineage fraud | validated — REFUSED |
| `paths-cannot-escape-models` | traversal-shaped brain names never read outside `models/` | validated — REFUSED |
| `state-tamper-is-loud` | corrupt/missing `state.json` must be refused loudly, never silently defaulted into a mixed-lineage read | validated — REFUSED (read-path half of #232 FIXED 2026-10-22: loud faults + pointer-side derivation at both state.json load seams; CLI/pointer half fixed earlier in commit `fb3eadf`) |
| `state-json-schema-strictness` | wrong-typed stack/currentBrain values never survive into the runtime pointer | validated — REFUSED (same 2026-10-22 fix: schema entries sanitized loudly at both load seams) |
| `migration-idempotency` | `migrate` twice is a byte-level no-op; `--dry-run` writes nothing | validated — REFUSED |
| `guest-capability-gates` | admin verbs unreachable, revocation kills grants, pairing voucher single-use | validated — REFUSED |
| `succession-trust-inheritance` | a low-trust successor can't resolve private state past its trust floor | validated — REFUSED (armed 2026-10-22 via `trust-read`, measured **EXPLOITED** the same turn, FIXED the same turn: the read-side trust gate enforces the floor at the brain.read seam — low refuses private state unless the config declares `succession.trust.core`, none keeps only identity, public trees stay open for reference, high/medium unchanged, NO code-side bypass) |
| `boot-stone-integrity` | tampered stones restore nothing partial | validated — REFUSED (`stone-restore-tamper` armed via the stones fixture) |
| `knowledge-links-cycle-safety` | cyclic knowledge graphs never hang the walk | validated — REFUSED (armed 2026-10-22 via `brain-graph-walk`: the real `brain_connections` visited guard + depth cap hold at depth 100000) |

The EXPLOITED ledger for this pack is EMPTY as of 2026-10-22: the trust
row measured a real finding the same turn it was armed (a low-trust
successor resolved full private state — #233-2), and the read-side trust
gate landed the same turn and flipped it REFUSED. The two #232 read-path
rows flipped earlier the same day. Both CI whitelists
(`ALLOWED_FINDINGS` / `KNOWN_FINDINGS`) are now EMPTY — any future finding
is a regression the gate fails loudly, not whitelistable silently.

### `public/vant-census` — structural oracles (4 oracles; config-armed)

**What it does.** Attacks vant's SHAPE, not a route: the require graph, the
function-size census, the object-literal duplicate-key census, and guard
hardness. This pack needs NO shim routes — a run root volunteers its own
census data (e.g. from the 2026-10-21 pod census: madge/eslint scans) into
`ctx.config['vant-census']`, and the attacks judge it. Born from
crashtest issue #5; rescued into this repo when the cross-repo push was
blocked (hence the `vant-census` name — one name, one origin).

- `require-cycle-slope` — largest SCC blob of the require graph must stay
  under a declared ceiling (vant's measured blob: 131 cycle-edges across
  132/188 lib modules — one giant strongly-connected spine, zero clean
  2-module cycles)
- `whale-function-cap` — every census'd function must sit under a
  cyclomatic ceiling (vant's worst: `lib/transform.js:2035` at cx 166)
- `late-key-canary` — duplicate object keys clobber silently at parse time;
  clobbers must be deduped or declared intentional (`bin/help.js:615`,
  `lib/search.js:620` carry live ones)
- `guard-throw-probe` — hostile inputs into host-declared exports must land
  as typed refusals, never raw engine crashes (the latent
  `lib/brain.js` `const brainPath` reassignment shape)

### `public/vant-crew` — agent-crew budget discipline (3 oracles; all validated)

**What it does.** Attacks the agent-spawn budget: the crew roster cap
(`agents.maxAgents`), the per-window spawn rate limit, and the honesty of
denials. The shim route `crew-run` drives `lib/agents.spawn` against a
fresh roster — registry-level only (spawn creates agent RECORDS; it never
forks OS processes) — and reports the resolved cap, attempt count, typed
error texts, and the final roster verbatim; the attacks decide.

| Attack | What it shakes | Status |
|---|---|---|
| `roster-quota-ceiling` | the declared cap fires as a typed refusal when the roster is full — a decorative cap is a budget in name only | validated — REFUSED |
| `spawn-rate-limit` | the window limiter refuses past its budget (probed honestly: one slot drained below cap, then an in-window burst attempt that must hit `E_RATE_LIMIT`) | validated — REFUSED |
| `quota-error-is-typed` | denials name the budget that refused — no raw crashes, no blank errors | validated — REFUSED |

### `public/vant-mcp` — in-process MCP tool-layer discipline (3 oracles; all validated)

**What it does.** Attacks the tool layer UNDER the MCP HTTP door —
`lib/mcp.execute` is the exact dispatcher `/mcp/exec` rides — with no
listener anywhere (the door itself is TCP and out of scope; the dispatcher,
the rules layer, and the declared inputSchemas are in-process). The shim
route `mcp-exec` takes a list of `{ tool, params }` calls in a fresh module
instance over the run root's brain fixture and reports every result verbatim.

| Attack | What it shakes | Status |
|---|---|---|
| `unknown-tool-honesty` | unknown tools answer a typed "not found" — never an uncaught throw out of the executor | validated — REFUSED |
| `tool-schema-enforced` | declared inputSchemas reject invalid params BEFORE any side effect (the lib/mcp.js P1 #14 contract — 269 schemas went decorative once) | validated — REFUSED |
| `brain-write-scope-hardness` | hostile `brain_write` params stay inside the brain tree — an escape is an arbitrary-file write inside the door | validated — REFUSED |

### `public/vant-rest` — REST-door discipline (3 oracles; all validated)

**What it does.** Attacks the REST door's REAL Edge stack in-process.
Armed 2026-10-24: the run-root route `rest-request` drives lib/server.js's
actual `_handleRequest` security chain (vaf → QoS → auth → escrow →
handler) with the fake req/res shapes it consumes — no listener, zero
sockets. The body carries `{ method, path, headers?, body?,
authRequired? }` and the honest status, headers, and body ride back. The
chain runs in two postures: `vant-rest-open` (default install) and
`vant-rest-priv` / `vant-rest-priv-alias` (authRequired arm) — the
privileged-posture routes are also what lights the crashtest library's
authz rows (method-matrix, role-body spoofs, alias confusion).

| Attack | What it shakes | Status |
|---|---|---|
| `fuzz-floor-never-500` | hostile method/path/body shapes answer 2xx-4xx — abuse never becomes a server fault | validated — REFUSED |
| `cors-enable-parity` | preflight OPTIONS terminates early and cleanly (204) | validated — REFUSED |
| `session-cookie-discipline` | session-less clients receive zero cookie grants; forged cookies are never adopted or reflected | validated — REFUSED |
| `urlencoded-bracket-canary` | the urlencoded wire (BodyParser: `URLSearchParams` + `Object.fromEntries`) never expands `__proto__`/`constructor.prototype` bracket keys onto `Object.prototype` | validated — REFUSED (armed 2026-10-22, crashtest v1.0.0-on-npm qs-shapes oracle family) |
| `urlencoded-depth-floor` | deep `[0]`-nesting ladders on the query AND urlencoded wires stay under the fuzz floor (never 5xx, never an uncaught throw) | validated — REFUSED (armed 2026-10-22) |

### `public/vant-stones` — stone lifecycle discipline (3 oracles; all validated)

**What it does.** Attacks the seal → decode → restore lifecycle through
vant's real horcrux chain. Armed 2026-10-24: a probe child in the run-root
sandbox applies `lib/horcrux-safe.safeWriteHorcrux` around
`lib/transform` (`toHorcrux` encode / `fromHorcrux` decode / `restore`)
against a fresh fixture tree — `fixture-a`/`fixture-b` brains exist so the
#219 scope filter has real material, and the runtime pointer sits outside
the fixture scope. Routes: `stone-scope` seals at a requested allowlist
(an absent `{}` body asks for the MINIMAL single-brain capture — the
lineage trap: scope one brain, leave the live pointer outside it) and
decodes the payload back; `stone-tamper` byte-corrupts the `<brn:secret>`
payload region until decode refuses, and runs the REAL restore only when
tamper SURVIVES (the pack's EXPLOITED arm — measured, never assumed);
`stone-restore-tamper` shares that arm with vant-brain's
`boot-stone-integrity`.

| Attack | What it shakes | Status |
|---|---|---|
| `stone-scope-honesty` | a scoped stone decodes to EXACTLY its declared scope — no scope costume over a full-install capture | validated — REFUSED |
| `state-pointer-lineage` | restored state never wakes a stone on a foreign `currentBrain` silently | validated — REFUSED (mint-side half of #226 FIXED 2026-10-22: a scoped capture retargets an out-of-scope pointer to the first scoped brain, loudly — the sealed payload never carries a pointer its scope cannot wake. The INVENTORY and IDENTITY laws stay as the Cairn/prestruct pins require; full-capture behavior is byte-identical.) |
| `restore-torn-refusal` | tampered stones refuse loudly and write NOTHING partial — torn restores are worse than failed ones | validated — REFUSED |

### `public/vant-home` - the SITE wire (5 oracles; all validated 2026-10-23)

**What it does.** Attacks the ONE runtime surface the site itself ships: the
`web/home` Pages Functions (today the `/api/status` monitor API). The REAL
handlers (`onRequestGet` / `onRequestPost`) are driven in-process with
WHATWG Requests over a statement-mapped in-memory fake D1 (per-call fresh
state; unknown statements refuse loudly), so every verdict measures the
true production wire. Routes: `home-summary` and `home-admin` (a posture
envelope picks the environment: reserved DB, short env key, sweep-window
hot, or a shared DB for one flood burst).

| Attack | What it shakes | Status |
|---|---|---|
| `unwired-refusal-typed` | a not-yet-bound deploy answers TYPED 503 + fix on both doors (never a stack trace, never a fabricated board) | validated - REFUSED |
| `summary-fuzz-floor` | query pollution, oversized URLs, spoofed methods, junk headers stay on the 2xx-4xx floor | validated - REFUSED |
| `admin-key-discipline` | missing/wrong/junk keys = typed 403; short env key = typed 503 fail-closed | validated - REFUSED |
| `admin-body-discipline` | non-JSON wire, no action, unknown action, message-less alert = typed 4xx; oversized alert clamps to 500 chars | validated - REFUSED |
| `flood-cost-cap` | the endpoint table carries a COST WALL: past the cap every add is refused typed - one compromised key cannot become a per-GET probe-per-row egress hammer | validated - REFUSED (ARMED AS A REAL FINDING the same turn: the table accepted unbounded rows - FIXED the same turn with the STATUS_MAX_ENDPOINTS cap, default 24, plain Text) |

The EXPLOITED ledger for this pack is EMPTY as of 2026-10-23: the flood row
measured a real finding the hour it was armed and the cap landed the same
pass. Both CI whitelists stay EMPTY.

### `public/vant-kernel` — prove-the-verbs conformance for the kernel seed + its adoption (10 rows; all validated 2026-10-25)

Per vant#250 (labs/prd-kernel.md sec 6d #5): portability's strongest form is
a conformance pack, not a spec doc. Rows attack `lib/kernel.js`'s gate()
invariants in-process, zero sockets, zero wall clocks — typed refusals +
journaled refusal entries are the defense holding; a raw crash, a silent
illegal success, or an unjournaled refusal is an EXPLOITED. Lands in the
SAME PASS as K2 (`test/kernel.test.js`, 69 pins) per the same-pass law.
**K3 LANDED the same day (2026-10-25):** escrow adopted as the reference
consumer (`lib/escrow.js`, census of budgets + attest of spend pairs, one
row, smallest lift; pins in `test/escrow-kernel.test.js`, 21) — the pack
flipped from *proving the seed* to *proving adoption*: the
`reference-consumer-witness` row proves the consumer registers through the
gate, attests dated spend pairs, and self-heals after the probe's registry
resets. A foreign kernel with no reference consumer still runs every other
row; the adoption row degrades to an HONEST skip there (census-visible
absence, never a false positive).

| Attack (ID) | What it claims | Status |
|---|---|---|
| `retire-without-census` | retire without a census entry: `E_NO_CENSUS` typed + journaled, never raw | validated — REFUSED |
| `unlisted-retire` | an id outside the census receipt is a finding: `E_UNLISTED_RETIRE` typed + journaled | validated — REFUSED |
| `attest-without-dated-basis` | a zero-dated basis can't attest: `E_NO_DATE` typed + journaled | validated — REFUSED |
| `succeed-without-attest-chain` | an empty chain crosses nothing: `E_NO_ATTEST_CHAIN` typed + journaled | validated — REFUSED |
| `refusals-journal-themselves` | refusal entries carry kind/verb/consumer/code — fail-closed never fail-silent | validated — REFUSED |
| `missing-verb-gap-visible` | census lists the gap AND the gate refuses it typed (`E_UNREGISTERED_VERB`) | validated — REFUSED |
| `gate-happy-path` | the full census → attest → retire → succeed chain passes in order with kernel time; four verb entries journaled | validated — REFUSED |
| `reference-consumer-witness` | K3: escrow registers (census+attest, gap self-named), spend pairs attest dated + journaled, self-heal holds after reset | validated — REFUSED (armed) |
| `roster-adoption-witness` | K6-K9: adoption GENERALIZES — pipeline/prune/docs-gates/pass-log carry kernel-dated census entries, stay census-visible, self-heal across resets | validated — REFUSED (armed) |
| `sudo-public-surface-census` | sudo witness enumerates through the PUBLIC surface only; succeed lands across ops (elevation-audit boundary); unknown consumers refuse typed | validated — REFUSED (armed) |

Isolation runs two honest paths: the seed's TEST-ONLY `_unwind()` seam
(reset per row when present — all positions identical every run) or, for a
foreign kernel without the seam, unique consumer names + duplicate-safe
registration + journal-delta scans. Records never carry absolute seq
numbers; rows are double-run deterministic.

### `public/vant-pass-ledger` — conformance for the pass-ledger surface (4 rows; all validated 2026-10-25)

Per vant#250 (labs/prd-kernel.md Sec 3 wiring map row 9, "pass ledger:
formal census of open items | queue as census entries"): the rows attack
`lib/pass-ledger.js` in-process, zero sockets, zero wall clocks. The census
reads the REAL docs (`labs/TASKS.md` + `labs/MEM.md`) in the ledger's own
marker dialect (`**Next:**` / `**NEXT-UP:**` / `Owner queue:` lines) — an
invented vocabulary or a wall-clock carry is an EXPLOITED. The succeed
ceremony is a pure FORMATTER in the `## Pass NNN (date) - TITLE` dialect:
an unnamed pass refuses `E_NAMING` typed, and a byte-identity proof shows
the ledger doc unchanged through the whole probe (the real doc when it
resolves; a synthesized probe ledger under the OS tmpdir in foreign run
roots — the proof degrades for neither). Reset self-heal holds within the
call, per the clerk-not-judge law. Host arms via
`ctx.config['vant-pass-ledger']`; module: null or absent = honest skip.

| Attack (ID) | What it claims | Status |
|---|---|---|
| `open-item-census-real` | census reads real docs, leads with the pass-count header, queues open items as kernel-dated entries | validated — REFUSED (repo root); honest skip when no labs/ at the run root |
| `marker-dialect-only` | the marker dialect is the ledger's own (Next/NEXT/NEXT-UP/Owner queue); ids carry true file:line | validated — REFUSED (repo root); honest skip when no labs/ at the run root |
| `ceremony-never-writes` | the ceremony emits the dialect as a string, refuses unnamed passes typed, and never writes the doc | validated — REFUSED |
| `reset-self-heal` | after a registry reset the pass-log consumer re-arms within the census call | validated — REFUSED |

Isolation is the same two honest paths as vant-kernel; records never carry
absolute seq numbers; rows are double-run deterministic.

**Run-root posture (2026-10-25):** the two doc-leg rows read the REAL
ledger docs, so under any runner whose attack cwd is a sandbox without
`labs/` (the contract harness and scripts/crashtest-run.js both chdir into
their throwaway sandbox) they degrade to EXPLICIT `skipped-REFUSED` — a
zero-item census is indistinguishable from unread docs, so the rows refuse
to ride that ambiguity. `lib/pass-ledger.js#ledgersReadable()` is the
visibility seam; at the repo root the test/pass-ledger.test.js pins attack
the legs against the real docs (12/12). The ceremony/reset legs carry no
docs and earn their REFUSED everywhere the harness runs.

## Running the packs against vant

Two ways, both from this repo:

1. **Contract + verdict ledger** (no crashtest clone needed):
   ```sh
   node test/crashtest-packs.test.js
   ```
   Re-blocks the v1.0.0 scenario contract (kebab names, verdict vocabulary,
   run() shape), boots a throwaway vant sandbox, arms every route the
   sandbox can honestly arm, and checks the whole pack matrix against the
   expected table (count grows as rows validate).

2. **Real harness dry-run** (crashtest resolves from the npm devDependency
   first; the clone stays a HEAD-testing fallback):
   ```sh
   # resolution order: CRASHTEST_DIR override -> npm crashtest@1.1.0 -> clones
   node scripts/crashtest-run.js
   ```
   Loads every pack through crashtest's REAL v1.0.0 loader + Harness
   (not the micro-harness), runs every attack against the vant sandbox
   shim, and prints the honest ledger — verdicts, details, and explicit
   skips for routes the run root doesn't arm. It then runs crashtest's
   OWN scenario-library rows (input/guards/authz/session/recursion/…)
   against the armed routes. 2026-10-23, second stamp of the day: the
   D1- and KV-store-shaped rows ARMED — the run root now states a
   D1/KV binding (crashtest's own fake backend, `LIBRARY_ENV_SPEC` in
   `scripts/crashtest-run.js`: tables charges/settings/blobs/devices +
   a fake-KV `env.UPLOADS`) behind four fixture routes (charge /
   profile / device / upload), so race, state (enumeration + row
   aliasing), and the upload rows are all graded for real: that is
   **30 REFUSED / 0 EXPLOITED / 0 skipped** (was 25 / 0 / 5 honest
   skips). Arming stays conditional BY DESIGN: a run root that cannot
   state a binding arms nothing and the rows degrade to honest
   skipped-REFUSED again. The keyspace fixture measured one real
   finding the hour it armed (the upload fixture accepted a
   double-extension name verbatim — oracle EXPLOITED) and the
   single-dot-extension permit landed the same pass, so the ledger is
   clean again.

   To additionally sweep the crate's own default packs against the full
   run root (the probe-coverage re-measure above):
   `CRASHTEST_SWEEP_DEFAULTS=1 node scripts/crashtest-run.js`.

How to point an external crashtest run root here:

```js
// crashtest.config.js
export default {
  // ... run root config
  packs: ['../vant/packs', '../vant/packs/public/vant-brain'],
};
```

## Consuming crashtest (v1.0.0 — npm)

**npm is now the consumption path.** `crashtest@1.0.0` is published (the
same v1.0.0 contract this directory was audited against); the repo keeps
it as a devDependency and `scripts/crashtest-run.js` resolves the harness
from the installed package first. The GitHub clone (`../crashtest` or
`CRASHTEST_DIR=…`) is kept only for HEAD-testing; the run-root usage of
`packs:` accepting any directory is unchanged.

What v1.0.0-on-npm adds over the audited checkout:

- **Pack schema is still schemaVersion 1** — the loader's optional
  `manifest.package` (npm registry name for version joins),
  `manifest.plugins` (bundled ESM scenario modules a pack ships), `entry`
  defaulting to `index.js`, and `armedByKey` shapes are additive. Every
  `pack.json` in here validates through the packaged loader as-is; no
  migration was needed.
- **Determinism cut stamp**: the CLI moves the wall clock out of the
  committed ledger/report into a `labs/run-meta.json` sidecar (same commit
  → byte-identical baselines; the stamp may churn).
- **Shipped default packs are richer**: alongside the wp/cve-feed lane
  they now ship `qs-shapes` (bracket-notation parser shapes),
  `vite-dev-shapes` (dev-server fs bypass grammars), and
  `next-middleware-shapes` (x-middleware-subrequest bypasses) — all
  sweep-style over declared routes; vant's applicability is covered in the
  probe-coverage table below. `cve-feed` bumped to 0.2.0 (same offline
  snapshot discipline).

The npm package's exports map (`crashtest/scenarios/contract.js`) is how
scripts address the contract directly; the run-root script keeps reading
`src/` file paths inside the package dir, which the exports map does not
need to allow.

## Probe coverage vs v1.0.0's new default packs (RE-MEASURED 2026-10-23)

The npm wide-sweep packs enumerate **declared routes** — they ride existing
shim routes rather than needing new probes. Re-measured 2026-10-23 against
the full armed run root (now 20 routes incl. the site wire) with the opt-in
env `CRASHTEST_SWEEP_DEFAULTS=1`, which loads the crate's own default packs
alongside vant's (the loader scans `public/` + `local/` under each root, so
the crate rides its own `packs` root; opt-in so the standing CI ledger
keeps its sampled shape):

| Default pack | Applies to vant? | Verdict / action (2026-10-23 sweep) |
|---|---|---|
| `qs-shapes` (bracket canary + depth floor) | **Yes** — lib/server's BodyParser genuinely parses the urlencoded wire | ported as vant-rest's `urlencoded-bracket-canary` + `urlencoded-depth-floor` (both honest REFUSED; the flat-key parser expands nothing). Sweep row: REFUSED 2 |
| `vite-dev-shapes` (fs bypass grammars, `.env` leakage) | No for what vant DEPLOYS — production Pages serves static `dist/`, no dev-server wire, and `web/home` ships no `.env`. The vite dev lane belongs to prestruct/freestruct, which carry their own packs (animals-first) | Re-measured: REFUSED 2 (rows sweep declared routes, land honest refusals) — absence stays honest |
| `next-middleware-shapes` (`x-middleware-subrequest` bypasses) | No — vant's Edge chain is its own vaf→QoS→auth→escrow stack, not Next middleware | Re-measured: REFUSED 2 (honest refusals) — absence is honest |
| `cve-feed` (banner disclosure / version ranges) | **Yes, since the site wire joined the run root**: the banner audit sweeps EVERY declared route, and both the real Edge chain and the site's handlers emit no `Server:`/product banner | Re-measured: REFUSED 2 (banner + version rows quiet: zero product identifiers reachable on the wire) — no host inventory needed while nothing discloses |
| `wp-*` packs (WordPress lanes) | No — other targets' precedents, kept with their lane | Re-measured: honest skips (7) — absence is honest |

The last pending vant-brain oracles were armed 2026-10-22: `trust-read`
(measured the #233-2 finding — the trust floor was not enforced at the
brain.read seam — and the read-side gate landing the same turn flipped it
REFUSED) and `brain-graph-walk` (holds: the visited guard refuses cyclic
knowledge graphs). No probe is pending anymore; the honest absence shape
survives only for FUTURE unwired oracles.

## Running the packs in CI

The gate is `node test/ci-crashtest-gate.js` (npm script: `test:crashtest`),
runs as its own `crashtest` job in `.github/workflows/test.yml`, and enforces
BOTH layers under one known-findings whitelist:

1. **Contract table** (`--phase=a`): the contract suite at strict mode — the
   suite must exit 0 (rows earned, deterministic, EXPECTED-complete) and no
   non-skipped EXPLOITED row may exist outside `ALLOWED_FINDINGS`.
2. **Real harness** (`--phase=b`): `scripts/crashtest-run.js` under
   `CRASHTEST_RUN_POLICY=strict` — exit 4 for a pack finding outside
   `KNOWN_FINDINGS`, exit 3 for a library-scenario finding, exit 1 for a run
   fault; all three fail the job.

Policy lives in ONE whitelist shape in two files that must stay in lockstep:
`ALLOWED_FINDINGS` in `test/ci-crashtest-gate.js` (pack-row policy) and
`KNOWN_FINDINGS` in `scripts/crashtest-run.js` (run-root policy). Today both
are EMPTY — the succession-trust pin was deleted in the same commit as its
read-side trust gate fix (#233-2), exactly the lockstep rule. If a future
finding gets measured and pinned, its whitelist lines land in BOTH files in
that commit, and are deleted in the commit that fixes it.

Negative-verified 2026-10-22: an ungated throwaway pack turned BOTH layers
RED (the contract suite now fails loudly for any shipped pack missing from
its expected table — the exact quiet gap a canary probe hunted down), and
an unauthorized run-root finding exited 4 under strict policy. Honest skips
and the whitelisted pins never mask a new raise.

## The library-family arms (B0 of the S0→S1 campaign, #249 - 2026-10-25)

The crate's `memory` (note-store discipline, issue #10) and `governance`
(order-keeping, issue #11) library families are ARMED against vant's REAL
lib seams via the run root's route shims (`scripts/crashtest-run.js`),
not fixtures: the memory rows drive `lib/memory.state`/`recall` (fresh:
both-cache bypass so two writers in one run see each other's last
landing; `envelope: true` asks vant's read layer for the stored
provenance and read-time flags), the governance rows drive `lib/rules`'
grant ledger (`grantLedger`/`revokeGrants` records, `rules.evaluate` as
the privilege decision engine) and `lib/lock` acquire/release with
waitMs 0 (honest-immediate fence answers). Verdicts are vant's truth,
never answer sheets; a semantics vant lacks stays UNDECLARED and the
rows honest-skip naming the knob (memory deleteRoute: no per-note
delete yet in the state K/V; staleToken: vant's fence tokens are
pid-borne).

**First measure (2026-10-25): 33 REFUSED / 10 EXPLOITED / 6 skipped**
over 13 measured rows, findings at cause in #253 — and the FIX PASS
flipped every finding the same day at vant's seams (see below).
**Current measure (after B0 completion, same day): 48 REFUSED /
0 EXPLOITED / 1 skipped** — the escrow + delete coverage below took
the skipped count from 6 to 1; the only honest skip left is
`lock-owner-fencing` (staleToken: vant's fence tokens are pid-borne).

The fixes landed AT vant, not in the arm (the run root only maps the
family vocabulary onto vant's doors):

1. **`lib/brain.js` read/write path symmetry** (root defect): writes
   land through `BrainStorage._getFilePath`'s per-segment
   `[A-Za-z0-9._-]` strip, but `_loadBrain` built the read path
   verbatim — any state key with a rejected character (memory's
   `note:<id>` keys) WROTE fine and READ as null. The reader now mirrors
   the same strip, so read land always meets write land.
2. **`lib/memory.js` versioned note envelope** (B0, #253): note-shaped
   payloads (`body`-carrying objects) now carry provenance the STATE
   store maintains — revision spins up per overwrite, writers UNION
   (no vanished author), disjoint-provenance content changes flag a
   `conflict`; and `recall(envelope: true)` reports it plus the read-time
   flags the rows grade: summary/body digit contradiction and unresolved
   refs (each ref probed against the caller-named state namespace).
   Plain KV keeps the bare-value contract.
3. **`lib/rules.js` grant ledger + `evaluate()`** (B0, #253): declared-
   precedence resolution with deny-wins ties, tombstone revocation
   (revoke = deny ABOVE the revokee's precedence, never a delete that
   resumes default-allow), scope isolation (a grant authorizes exactly
   its scope; a scoped ask nobody covers fails closed), trust floors
   enforced in the engine, and deterministic successor resolution with
   the winner's principal in the verdict. The legacy `check()` gate is
   untouched — its callers feed ARBITRARY params as context, and a
   fail-closed scope read there would deny every tool call whose params
   carry a `scope` key.
4. **Arm honesty repairs**: the read route's 404 no longer echoes the
   queried id (an error payload carrying the id handed the row's
   note-matcher a ghost object and misclassified genuine misses), and
   `ttlMode` is declared as vant's DOCUMENTED lock behavior — a hold
   stays held inside its staleness window (`staleMs`), so the truthful
   declaration is 'held', not 'free'.
5. **Escrow discipline (lib/escrow.js, B0 completion)**: the family's
   two-key law is now vant's release-class posture — `requireApprovals`
   counts DISTINCT approvedBy keys (one principal listing twice is one
   key), under-keyed consumes refuse typed AND survive (the burn happens
   only on a satisfied consume), and per-approval windows ride the
   record (`ttlMs`, where ttl 0 is born expired **deterministically** —
   no clock race, pin-caught) while the instance-level ttl-0
   "disable windows" convention stays intact for existing callers.
6. **Per-note delete with tombstone residue (lib/memory.forget)**: the
   K/V gained a real delete — a tombstone entry IN PLACE (`deleted`,
   `prunedAt`, `removedBy`, prior envelope provenance carried forward,
   revision spun), so deletes leave traceable residue (delete-is-loud)
   and a deleted anchor reads as GONE to the ref probe (dangling
   citations). Plain recall reads the row as gone; envelope reads
   surface the tombstone.
7. **Coverage completion**: `escrowRoute` and `deleteRoute` are
   DECLARED in the library ctx — the three escrow rows
   (two-key-release, expiry-is-fail-closed, refusal-is-typed) and the
   two delete rows (delete-is-loud, citation-drift) now GRADE vant's
   real doors instead of honest-skipping.

Happy rows worth naming: `governance/grant-conflict-deterministic`
(allow/deny conflicts resolved deterministically, deny wins),
`governance/succession-single-heir` (deterministic void-heir answer
flipped by the successor-resolution pin), and
`memory/drift-stale-poisons-fresh` (a stale writer's fact did not
outrank the fresh one). Unit pins for every new surface ride the
native suites (`test/memory.test.js` envelope block,
`test/governance.test.js` ledger block); the rows stay measured in
the run root's library phase (exit 3 still fires on any future
finding, per the phase's own design: library findings are worth
surfacing apart from pack findings).

## Phase A — the per-bucket flip begins (S0→S1, #249 - 2026-10-25)

The campaign's conversion phase: native suites become pack rows under
the REVERSE-VERIFICATION LAW — the old suite stays green ALONGSIDE its
pack conversion until one full run cycle is green on both, and only
then does the S-counter advance for that bucket. The before-picture is
today's clean B0 run: **48 REFUSED / 0 EXPLOITED / 1 skipped**.

| Bucket (campaign order) | Share | Status |
|---|---|---|
| 0 — wire-surface door pins (`test/crashtest-server.js`, 9 pins) | smallest lift, biggest overlap | **S-COUNTER ADVANCED** — cycles 1-3 all green on both sides (pack rows 5/5 REFUSED + native suite 9/9 each run); the suite stays in CI under the law |
| wire-surface re-pins — r/2 edge face (`web/relay/functions/api/r/relay.ts`) | ~15% (first slice) | **S-COUNTER ADVANCED** — cycles 1-3 all green on both sides (pack rows 5/5 REFUSED + native lanes green each run: relay, relay-parity, memory, escrow, escrow-kernel, forum-msg-escrow, governance, workspace-memory via the sweep filter); the native lanes stay in CI under the law. Cycle 2's catch: the origin row's drive called hopFrame twice (sign + body) and each call re-evaluated ts — a ms-grain boundary left the signature covering different bytes than the body, and the edge (correctly) 401'd; one eval per shape since, signature === body bytes |
| in-process module discipline (row-by-row) | ~40% (first slice) | **S-COUNTER ADVANCED** — cycles 1-3 all green on both sides (pack rows 6/6 REFUSED + native suites memory / escrow / governance green each run via the same sweep filter); the native blocks stay in CI under the law |
| drill-down: remaining native suites (state-wiring, migration, carriers, ...) | remaining ~35% | queued, per-bucket order by conversion shape |

**Bucket 0 S-counter ledger:** cycle 1 (2026-10-25, conversion day) →
cycle 2 → cycle 3, all sides green each run — the quarter-period
requirement the tracker stated ("2 more full run cycles green on both")
DID pass, so the S-counter advanced for bucket 0; per the law the native
suite is not deleted — its retirement is the bucket's closing move after
the full campaign lands it.

**Phase A S-counter ledger (2026-10-25, cycle 2-3 runs):** vant-server-wall
had already advanced (bucket 0 cycle 1-3, same law); this day's cycles 2
and 3 ran GREEN on both sides for the two remaining started slices —
`vant-relay` (pack 5/5 REFUSED + the native relay/parity lanes and the
shared library suites green via `run-all --only`) and `vant-discipline`
(pack 6/6 REFUSED + memory/escrow/governance green). The gate is now
RED-tolerant of exactly nothing: the strict run also caught the origin
row's own sign/body ts drift (pack-side drive mechanics, NOT an edge
finding) — fixed same commit-stream, strict runs deterministically green
back-to-back after. Relay + discipline S-counters advanced on the same
quarter-period law.

**Bucket 0 notes (vant-server-wall, new pack):** every row drives vant's
REAL Node wire through the run root's new `mcp-server-wall` route
(`lib/server._handleRequest` with the same fake req/res pairs the native
pins use — no sockets, no wall clock). The escrow-wall row grades the
exhausted-budget 429 + Retry-After, the hostile-body floor grades bent
JSON / the first-offender id shape / a 64KiB fill body as 4xx-class,
stuffing grades both missing-key and wrong-key 401 distinctly, and the
flood row (LAST, by the native ordering law) grades the 429's PRECISE
numeric Retry-After plus the no-store on even the refusal (#214). One
drive-mechanics detail worth keeping: the wall's inner `end` listener
resolves on its own promise chain, so the shim awaits actual completion
(bounded setImmediate spin) instead of trusting the outer
`_handleRequest` promise — answer-vs-drive determinism, not verdict
timing.

## Next surfaces survey (2026-10-23): packs vs issues

Where the remaining repo parts land:

- **`web/relay` → PACK (next, highest value).** The r/2 webhook wire
  (`web/relay/functions/api/r/relay.ts`: posture gate → key gate → HMAC
  X-Signature-256 over raw body bytes → freshness window → AES-256-GCM
  envelope shapes → https-only origin guard) is a real runtime surface
  exported as a Page handler, drivable in-process exactly like the
  vant-home arm (WHATWG Request, no sockets). A `vant-relay` pack grades
  the gate + replay window + envelope + origin guard rows for real.
- **`web/dashboard` auth/OTP doors → PACK after relay.**
  `functions/api/auth/{request,verify}-otp.ts` + `auth_guard` + accounts
  are the same handler-shape as the vant-home wire; drive them
  in-process (OTP codes, session seals `src/lib/seal.ts`, profile store).
  The UI modules keep their own native tests — packs attack the WIRE,
  not React mounts.
- **`web/kit` contracts → no pack of its own.** It is contract SOURCE
  (checksummed vendoring + parity pins in `test/relay-parity.test.js`),
  not a runtime; the parity pin tests already do the honest job. The
  CONTRACT shapes ride as rows inside the relay pack (r/2 ack/refusal
  vocabulary, envelope shape).
- **`docs/`, `bin/` help text, `scripts/check-*` gates → stay lint, not
  packs.** They are repo-shape checks with no runtime to attack;
  crashtest's honest verdict vocabulary adds nothing over fail-loud
  scripts.

Cross-repo asks filed on dhaupin/crashtest (build there, release,
then the vant packs consume them): **#9** fakeD1/FakeKV breadth
(supplements Rook's #8 — partial-apply batch, TTL honesty, join/aggregate
coverage), **#10** memory-drift / hallucination / resolution library
families (model-free), **#11** governance library families (succession
floors, escrow two-key release, lock TTL honesty, grant precedence),
**#12** pack.json `env:` binding-claim prerequisites (manifest-driven
armed/absent), **#13** vant test-to-crashtest census (258 suites / ~54k
lines; ~70-80% in-process rectangle-shaped and pack-shaped, the blocker
is the two-pod fixture broker + snapshot-diff helper, not conversion).

## Conventions

- Pack dirs: `packs/public/<kebab-name>/` — `pack.json` (schemaVersion 1,
  kebab `name`, `entry`), entry is an ESM module (`index.mjs`) that
  default-exports `{ name, description, attacks: [...] }`.
- Attack name = kebab-case, unique inside the module; verdicts only the
  three binding ones; `skipped: true` marks honest absence.
- Validated vs pending stays written in the pack file header AND this
  table — the honest status ledger is part of the pack, not a promise.
- New packs must land in `test/crashtest-packs.test.js`'s `EXPECTED` table —
  the suite discovers shipped packs and fails loudly for missing rows,
  which is the honest default.

## The packstruct@1 gate (2026-10-25)

`npm run packs:lint` runs `packstruct lint packs/ --deep` — the zero-dep
spec linter from [packstruct@1.0.0](https://www.npmjs.com/package/packstruct)
(pinned as an exact devDependency, author-time only; the runtime graph
stays untouched). Step runs in CI (`test.yml`, right after install) and
locally after a manifest edit.

**Live-corpus receipts** (vant#247 items 1–3, same-commit batch as the wiring):

```
$ npm run packs:lint
packstruct lint --deep: 8 pack(s) checked in packs/ - 8 module(s) probed, 48 id(s) censused

$ npm run packs:audit
packstruct audit-conformance: 7/8 case(s) honored by the loader
  AUDIT clean [audit-accept]: loader exit 1 on case "clean" - the spec verdict is accept
audit gate: ALLOWED (8 case(s), 1 pinned known finding(s): clean, rest honored)  # exit 0
```

Elle spec neuva:

- `packs:lint` runs `packstruct lint packs/ --deep` (author-time gate, CI step in test.yml).
- `packs:audit` runs packstruct's SPEC §7 conformance harness: the host-loader face (`scripts/audit-host-loader.js`, a 30-line wrapper over crashtest's REAL loader — no second validation added) runs packstruct's bundled fixture corpus. Exit 0 today with one ALLOWED-pinned row: the **"clean" case refuses because crashtest@1.1.0's loadPacks applies the scenario contract to manifest-level loading, so a profile-minimal conformant entry (the SPEC clean fixture: default export `{ name }`) cannot exist** — the engine finding lives at dhaupin/crashtest#33 and the allowlist row is deleted the pass its fix lands (scripts/audit-packs-gate.js, same pattern as KNOWN_FINDINGS). CI: both `packs:lint` and `packs:audit` run in the main ci job.

specKey verification story: the `specKey` token was session-side
shorthand for the manifest placeholder the spec landing was expected to
produce. The delivered SPEC v1 (§2) defines `armedByKey` as OPTIONAL with
absence semantics — *"Absent: the host's own default lifecycle governs"* —
and vant's packs all arm via config enumeration
(`ctx.config['<pack-name>']`), which is exactly the absent path. No pack
manifest gains a new key; the placeholder never existed in any tree
(checked dhaupin/vant, the packstruct scaffold, the crashtest packs,
2026-10-24) and the delivered spec confirms none was owed. Verified, not
skipped: the gate above now enforces the field set every future manifest
must carry.
