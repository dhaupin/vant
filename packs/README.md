# packs/ — crashtest attack packs for vant

This directory ships **crashtest attack packs**: bundles of adversarial
scenarios that attack vant's own surfaces — in-process, socket-free, and
deterministic — so the defenses this repo promises are *measured*, not just
documented.

- **Crashtest**: <https://github.com/dhaupin/crashtest> — on npm as `crashtest@1.0.0` (this repo's devDependency); live harness: <https://crashtest.creadev.org>
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
| `succession-trust-inheritance` | a low-trust successor can't resolve private state past its trust floor | validated — **EXPLOITED today** (armed 2026-10-22 via `trust-read`; the succession trust floor is a behavioral descriptor, and NOTHING enforces it at the brain.read seam — a live finding, pinned in the suite's expected table until a read-side trust gate lands) |
| `boot-stone-integrity` | tampered stones restore nothing partial | validated — REFUSED (`stone-restore-tamper` armed via the stones fixture) |
| `knowledge-links-cycle-safety` | cyclic knowledge graphs never hang the walk | validated — REFUSED (armed 2026-10-22 via `brain-graph-walk`: the real `brain_connections` visited guard + depth cap hold at depth 100000) |

The one EXPLOITED row (succession-trust-inheritance) is a **finding, not a
glitch** — it is pinned in `test/crashtest-packs.test.js`'s expected-verdict
table and flips to REFUSED when a read-side trust gate lands; the pin keeps
biting until then. The two #232 read-path rows were EXPLOITED findings
until the 2026-10-22 fix flipped them to REFUSED.

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
   # resolution order: CRASHTEST_DIR override -> npm crashtest@1.0.0 -> clones
   node scripts/crashtest-run.js
   ```
   Loads every pack through crashtest's REAL v1.0.0 loader + Harness
   (not the micro-harness), runs every attack against the vant sandbox
   shim, and prints the honest ledger — verdicts, details, and explicit
   skips for routes the run root doesn't arm. It then runs crashtest's
   OWN scenario-library rows (input/guards/authz/session/recursion/…)
   against the armed routes: 2026-10-24 that is 25 REFUSED / 0
   EXPLOITED / 5 skipped — the skips are the D1- and KV-store-shaped
   rows (race, upload, state aliasing), which honest: vant ships no
   binding to arm.

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

## Probe coverage vs v1.0.0's new default packs

The npm wide-sweep packs enumerate **declared routes** — they ride existing
shim routes rather than needing new probes. Measured 2026-10-22 against
the armed run root:

| Default pack | Applies to vant? | Verdict / action |
|---|---|---|
| `qs-shapes` (bracket canary + depth floor) | **Yes** — lib/server's BodyParser genuinely parses the urlencoded wire | ported as vant-rest's `urlencoded-bracket-canary` + `urlencoded-depth-floor` (both honest REFUSED; the flat-key parser expands nothing) |
| `vite-dev-shapes` (fs bypass grammars, `.env` leakage) | No — vant ships no Vite dev-server wire (`/@fs/`, transform suffixes) | n/a — absence is honest |
| `next-middleware-shapes` (`x-middleware-subrequest` bypasses) | No — vant's Edge chain is its own vaf→QoS→auth→escrow stack, not Next middleware | n/a — absence is honest |
| `cve-feed` (banner disclosure / version ranges) | Half — the Edge chain emits **no** `Server:`/version banner anywhere in the chain (measured by grep + the fuzz-floor rows), so the banner half has nothing to find; the version-range half needs a host-declared component inventory vant does not wire | not ported yet — arm it (a `component-inventory` in `ctx.config['cve-feed']`) when vant publishes one |
| `wp-*` packs (WordPress lanes) | No — other targets' precedents, kept with their lane | n/a |

The last pending vant-brain oracles were armed 2026-10-22: `trust-read`
(measures a LIVE finding — the succession trust floor is not enforced at
the brain.read seam) and `brain-graph-walk` (holds: the visited guard
refuses cyclic knowledge graphs). No probe is pending anymore; the honest
absence shape survives only for FUTURE unwired oracles.

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
carry exactly one entry: the succession-trust-inheritance LIVE FINDING
(#233-2). When its read-side gate lands and the row flips REFUSED, the gate
catches the stale pin and asks loudly for the line to be deleted.

Negative-verified 2026-10-22: an ungated throwaway pack turned BOTH layers
RED (the contract suite now fails loudly for any shipped pack missing from
its expected table — the exact quiet gap a canary probe hunted down), and
an unauthorized run-root finding exited 4 under strict policy. Honest skips
and the whitelisted pins never mask a new raise.

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
