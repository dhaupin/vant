# packs/ — crashtest attack packs for vant

This directory ships **crashtest attack packs**: bundles of adversarial
scenarios that attack vant's own surfaces — in-process, socket-free, and
deterministic — so the defenses this repo promises are *measured*, not just
documented.

- **Crashtest**: <https://github.com/dhaupin/crashtest> — live harness: <https://crashtest.creadev.org>
- **Where the packs target**: this repo (dhaupin/vant), `packs/public/<name>/`
- **Run/validate from vant's side**: `node test/crashtest-packs.test.js` (contract + verdict ledger, 55 checks)
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

### `public/vant-brain` — brain-file layer discipline (9 oracles; 6 validated)

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
| `state-tamper-is-loud` | corrupt/missing `state.json` must be refused loudly, never silently defaulted into a mixed-lineage read | validated — **EXPLOITED today** (read-path half of #232; CLI/pointer half fixed in commit `fb3eadf`) |
| `state-json-schema-strictness` | wrong-typed stack/currentBrain values never survive into the runtime pointer | validated — **EXPLOITED today** |
| `migration-idempotency` | `migrate` twice is a byte-level no-op; `--dry-run` writes nothing | validated — REFUSED |
| `guest-capability-gates` | admin verbs unreachable, revocation kills grants, pairing voucher single-use | validated — REFUSED |
| `succession-trust-inheritance` | a low-trust successor can't resolve private state past its trust floor | pending run-root wiring (skipped) |
| `boot-stone-integrity` | tampered stones restore nothing partial | validated — REFUSED (`stone-restore-tamper` armed via the stones fixture) |
| `knowledge-links-cycle-safety` | cyclic knowledge graphs never hang the walk | pending run-root wiring (skipped) |

The two EXPLOITED rows are **findings, not glitches** — they are pinned in
`test/crashtest-packs.test.js`'s expected-verdict table and flip to REFUSED
when the read-path fix lands; the pin keeps biting until then.

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
| `state-pointer-lineage` | restored state never wakes a stone on a foreign `currentBrain` silently | validated — **EXPLOITED today** (the mint-side half of #226, now measured from the sealed-payload side: `lib/transform.gather` scopes the brain INVENTORY but leaves the live `currentBrain`/`activeStack` unfiltered by design — "identity is live truth" — so a single-brain stone carries a pointer outside its scope and every consumer of the payload alone wakes on a foreign brain. The pin lives in the suite's expected table and flips to REFUSED when the mint/boot-side warning lands.) |
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

2. **Real harness dry-run** (needs the crashtest clone next door):
   ```sh
   # crashtest checkout default: ../crashtest or CRASHTEST_DIR=/path
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

## Consuming crashtest (v1.0.0)

Crashtest is versioned 1.0.0 on GitHub main (pack-ports landing after);
npm still publishes 0.1.0. This repo's tooling therefore consumes crashtest
from the GitHub checkout (file path), not npm — the same rule this
directory already obeys (`packs:` accepts any directory). Until npm
catches up: clone `github.com/dhaupin/crashtest` next to this checkout,
point run roots at `../vant/packs`, and re-validate with the two commands
above. As of 2026-10-22 the v1.0.0 contract surfaces
(`src/scenarios/contract.js`, `src/packs/loader.js`, `src/harness/harness.js`)
are unchanged since the pre-v1 audit — every pack in here loads clean
through the real loader at main.

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
