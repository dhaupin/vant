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
| `state-tamper-is-loud` | validated — **EXPLOITED today** (silent fallback + public/private lineage mix; the read-path half of #232 — CLI/pointer half fixed 2026-10-22, commit `fb3eadf`) |
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

### `public/vant-crew` (v0.1.0) — agent-crew budget discipline

Three registry-level oracles against `lib/agents` (registry-only — spawn
creates agent records, never OS processes), validated against a vant
sandbox:

| Attack | Status |
|---|---|
| `roster-quota-ceiling` | validated — REFUSED (cap fires as a typed refusal at the declared `agents.maxAgents`) |
| `spawn-rate-limit` | validated — REFUSED (window budget refuses past-the-window spawns once a slot is drained below the cap) |
| `quota-error-is-typed` | validated — REFUSED (denials name the budget; no raw crashes) |

### `public/vant-mcp` (v0.1.0) — in-process MCP tool-layer discipline

Three oracles driving `lib/mcp.execute` — the exact dispatcher the
`/mcp/exec` HTTP door rides, minus the door (no TCP):
**all validated** against a vant sandbox:

| Attack | Status |
|---|---|
| `unknown-tool-honesty` | validated — REFUSED (unknown tools answer typed "not found"; never throws) |
| `tool-schema-enforced` | validated — REFUSED (declared inputSchemas reject invalid params before any side effect — the P1 #14 contract holds) |
| `brain-write-scope-hardness` | validated — REFUSED (traversal-shaped tool params confined inside the brain tree) |

### `public/vant-rest` (v0.1.0) — REST-door discipline (PENDING)

`lib/server.js` exports an Edge-shaped stack (`Server.Request/Response`,
`Router`, `BodyParser`, `CORS`, `Helmet`, `Session`, `SessionStore`).
Three written oracles (fuzz floor never-500, CORS mirror parity,
session-cookie discipline) mapped onto crashtest v1.0.0's
`session`/`protohygiene`/`taxonomy` rows — **honest skips until a run root
wires the lib/server stack** (routes 501).

### `public/vant-stones` (v0.1.0) — stone lifecycle discipline (PENDING)

Three written oracles for the seal/restore lifecycle (`stone-scope-honesty`,
`state-pointer-lineage`, `restore-torn-refusal`) — the #219/#226/#232
incident class, pinned from the mint and boot sides; **honest skips until a
run root wires the seal/decode fixture** (the crashtest repo's
`horcrux/crashtest-p_quillstone-9fold.svg` is the documented tamper fixture).

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

Crashtest is versioned 1.0.0 on GitHub main and v1.1.0-with-pack-ports
already growing; npm still publishes 0.1.0. This repo's tooling therefore
consumes crashtest from the GitHub checkout (file path), not npm — the same
rule this directory already obeys (`packs:` accepts any directory). Until
npm catches up:

- clone `github.com/dhaupin/crashtest` next to this checkout;
- point a run root's `packs:` at `../vant/packs` (cross-repo, as above);
- re-validate here anytime: `node test/crashtest-packs.test.js` (re-blocks
  the v1.0.0 scenario contract: verdicts vocabulary, kebab names, run()
  shape — and currently pins the two `vant-brain` EXPLOITED regressions
  until the read-path fix lands).

As of 2026-10-22 the v1.0.0 contract surfaces (`src/scenarios/contract.js`,
`src/packs/loader.js`, `src/harness/harness.js`) are unchanged since the
pre-v1 audit — every pack in here loads clean through the real loader at
main.

## Conventions

- Pack dirs: `packs/public/<kebab-name>/` — `pack.json` (schemaVersion 1,
  kebab `name`, `entry`), entry is an ESM module (`index.mjs`) that
  default-exports `{ name, description, attacks: [...] }`.
- Attack name = kebab-case, unique inside the module; verdicts only the
  three binding ones; `skipped: true` marks honest absence.
- Validated vs pending stays written in the pack file header and this
  table — the honest status ledger is part of the pack, not a promise.
- New packs get added to `test/crashtest-packs.test.js`'s `EXPECTED` table
  (or the suite discovers them and fails loudly for the missing rows —
  which is the honest default).
