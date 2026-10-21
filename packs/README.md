# packs/ — crashtest attack packs for vant

This directory ships **crashtest attack packs**: bundles of adversarial
scenarios that attack vant's own surfaces — in-process, socket-free, and
deterministic — so the defenses this repo promises are *measured*, not just
documented.

- **Crashtest**: <https://github.com/dhaupin/crashtest> — live harness: <https://crashtest.creadev.org>
- **Where the packs target**: this repo (dhaupin/vant), `packs/public/<name>/`
- **Status ledger**: `test/crashtest-packs.test.js` (expected-verdict table = the regression pin)

## What crashtest is

**Crashtest** is an in-process, verdict-driven adversarial QA harness for
agent-built software. Its PRD slogan: *"crashtest attacks what agent-built
software ships, the way the shipping expects to be attacked"* — honest verdict
records, never polite pass/fail theater:

- **One law: no sockets.** Scenarios run in-process (WHATWG `Request` handed
  straight to handlers) or against plain files. The MCP/REST doors are TCP
  and stay out of scope.
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

## The packs in here

### `public/vant-brain` (v0.1.0) — brain-layer discipline

Nine oracles for a vant install's brain layer. Run-root shim routes
(dead-simple, documented at the top of `public/vant-brain/index.mjs`) call
vant's OWN `lib/brain`, `lib/migrations`, `lib/guests` APIs in-process and
return neutral facts; the attacks decide, never the shim:

| Attack | Status |
|---|---|
| `private-first-fallback` | validated — REFUSED (private wins on mixed reads) |
| `paths-cannot-escape-models` | validated — REFUSED (traversal names never escape `models/`) |
| `state-tamper-is-loud` | validated — **EXPLOITED today** (silent fallback + public/private lineage mix; #232 class) |
| `state-json-schema-strictness` | validated — **EXPLOITED today** (wrong-typed stack entries survive into the runtime pointer) |
| `migration-idempotency` | validated — REFUSED (dry-run touches nothing; second run is a no-op) |
| `guest-capability-gates` | validated — REFUSED (admin denied, revocation kills grants, pairing voucher single-use) |
| `succession-trust-inheritance` | pending run-root validation (honest skip) |
| `boot-stone-integrity` | pending run-root validation (honest skip) |
| `knowledge-links-cycle-safety` | pending run-root validation (honest skip) |

The two EXPLOITED rows are **findings, not glitches**: vant's brain layer
currently fails those oracles. `test/crashtest-packs.test.js` pins them in
its expected-verdict table; fixing the bug means flipping the row to
`REFUSED` — the suite is the regression pin in both directions.

### `public/vant-census` (v0.1.0) — structural oracles

Four config-armed structural attacks (no routes needed; run roots volunteer
evidence via `ctx.config['vant-census']`, absence → skip):

- `require-cycle-slope` — largest strongly-connected require blob must stay
  under a declared ceiling (current vant census: 131 cycle-edges across 132
  of 188 lib modules — one big blob, zero clean 2-cycles)
- `whale-function-cap` — cyclomatic ceiling per armed function census
  (vant's worst: `lib/transform.js:2035` at cx 166)
- `late-key-canary` — duplicate object-literal keys clobber silently
  (`bin/help.js`, `lib/search.js` carry real ones)
- `guard-throw-probe` — hostile inputs must land as typed refusals, never
  raw engine crashes

## How to point crashtest at these packs

Any crashtest run-root (v1.0.0+) lists this repo's `packs/` root and its
loader inventories both packs; or point at ONE pack dir for just that pack:

```js
// crashtest.config.js
export default {
  // ... run root config
  packs: ['../vant/packs', '../vant/packs/public/vant-brain'],
};
```

Or, zero-config, validate the contract + verdicts from vant's side:

```sh
node test/crashtest-packs.test.js
```

## Consuming crashtest (v1.0.0)

Crashtest is versioned 1.0.0 on GitHub main; npm still publishes 0.1.0.
This repo's tooling therefore consumes crashtest from the GitHub checkout
(file path), not npm — the same rule this directory already obeys (`packs:`
accepts any directory). Until npm catches up:

- clone `github.com/dhaupin/crashtest` next to this checkout;
- point a run root's `packs:` at `../vant/packs` (cross-repo, as above);
- re-validate here anytime: `node test/crashtest-packs.test.js` (re-blocks
  the v1.0.0 scenario contract: verdicts vocabulary, kebab names, run()
  shape — and currently pins 2 of 9 `vant-brain` rows as EXPLOITED
  regressions until the #232-class fixes land).

As of 2026-10-22 the v1.0.0 contract surfaces (`src/scenarios/contract.js`,
`src/packs/loader.js`, `src/harness/harness.js`) are unchanged since the
pre-v1 audit — both packs load clean through the real loader at main.

## Next candidates (surveyed against v1.0.0's 12 scenario-library rows)

Surfaces of vant's own that are pack-able under the one law (in-process
only), roughly in attack-value order:

- **`vant-mcp`** — drive `lib/mcp.js`'s tool layer in-process (no HTTP
  door): brain-share/insights races, agent spawn caps, market ops. Direct
  tie-ins: the insights lock window audited in `labs/archives/audits/
  LOCKS.md`, and the MCP tool-coverage checker (`scripts/check-mcp-coverage.js`)
  becomes an oracle instead of a linter.
- **`vant-rest`** — `lib/server.js` exports `Server.Request/Response`,
  `Router`, `BodyParser`, `CORS`, `Helmet`, `Session`, `SessionStore` —
  an Edge-shaped stack attacks like the `crashtest-site` handler: the
  v1.0.0 `session`, `authz`, `guards`, `race`, `taxonomy` rows all apply.
- **`vant-stones`** — snapshot/horcrux scoping oracles: `--brain` naming
  the stone without scoping the payload (#226), seed leakage between
  brains, and the state-pointer lineage checks the sealed stones already
  provably carry.
- **`vant-crew`** — agent-spawn/crew budget discipline (roster caps,
  `agents.maxAgents`), driven through the in-process agent APIs the
  crashtest stone flow already exercises.

## Conventions

- Pack dirs: `packs/public/<kebab-name>/` — `pack.json` (schemaVersion 1,
  kebab `name`, `entry`), entry is an ESM module (`index.mjs`) that
  default-exports `{ name, description, attacks: [...] }`.
- Attack name = kebab-case, unique inside the module; verdicts only the
  three binding ones; `skipped: true` marks honest absence.
- Validated vs pending stays written in the pack file header and this
  table — the honest status ledger is part of the pack, not a promise.
