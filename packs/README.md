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

### The run close-out census (2026-10-28, live counts; the older "reaches N rows" lines below are their slice-time claims)

**269 rows across 21 packs** (strict + honest typed skips graded live each
fire). The close-out proof run on the final tree: **two consecutive full
harness cycles, 263 strict rows REFUSED / 0 EXPLOITED / 0 BOUNDED / 6
honest skips per cycle (269 graded rows), pass-for-pass deterministic**;
library rows 48/0/1 each cycle. Native-suite disposition, per the
campaign's reverse-verification law (convert FIRST, then retire; a family
that rides real OS processes or its own module plane stays native):

| pack | rows | attacks | native counterpart |
|---|---|---|---|
| `vant-brain` | 28 | `test/brain.test.js` (trim) + `test/brain-circuit.test.js` (retired whole 2026-10-27) |
| `vant-carriers` | 42 | `test/carriers.test.js` (retired whole 2026-10-27) + `test/traveler-lib.test.js` (trimmed to the REAL-PROCESS CLI family) |
| `vant-census` | 7 | config-armed censuses + naked-lib first-doors + legacy-orphan-laws + facade-surfaces rows (run-root ctx; no native suite) |
| `vant-crew` | 4 | crew quota trio (lib surface; the doors census rides run roots) |
| `vant-dashboard` | 22 | the dashboard webs faces (dash-auth arm; native Stayed for the module plane) |
| `vant-discipline` | 6 | memory/governance/escrow faces (their suites keep the kernel-plane pins) |
| `vant-home` | 7 | web/home favorites (the status-math plate row over the first-doors arm) |
| `vant-kernel` | 10 | the kernel/escrow plane itself (gate-side pins; `test/kernel.test.js` is the plane, kept) |
| `vant-kit` | 3 | web/kit contracts + the vendoring ring + the CarrierShare plate census |
| `vant-leisure` | 6 | `test/leisure.test.js` (retired whole) |
| `vant-mcp` | 4 | MCP tool census (run-root arm) |
| `vant-migrations` | 24 | `test/migrations.test.js` (retired whole 2026-10-27) |
| `vant-pass-ledger` | 4 | pass-ledger doc surfaces (`test/pass-ledger.test.js` keeps the ledger plane) |
| `vant-recursion-wall` | 3 | trace/recursion walls (lib-level) |
| `vant-relay` | 20 | the r/2 relay face (`test/relay.test.js` REBUILT FRESH per owner ruling — the face plane stays) |
| `vant-rest` | 13 | lib/server REST doors + the api-object census |
| `vant-server-wall` | 5 | mcp-server walls (run-root wiring) |
| `vant-spine` | 16 | `test/engine-parity-spine.test.js` (retired whole) |
| `vant-state-wiring` | 44 | `test/state-wiring.test.js` (retired whole 2026-10-28, wave 2) |
| `vant-stones` | 3 | boot stone seal/restore (shared stone tamper arm) |
| `vant-teams` | 2 | teams orgchart census + governance depth (run-root arm) |

Retired WHOLE to pack rows this campaign: `test/carriers.test.js`,
`test/migrations.test.js`, `test/state-wiring.test.js`,
`test/engine-parity-spine.test.js`, `test/leisure.test.js`,
`test/brain-circuit.test.js`. Trimmed to their uncovered/real-process
pins (kept by the reverse-verification law): `test/traveler-lib.test.js`
(CLI), `test/brain.test.js` (unit pins), `test/guests.test.js` (H1 #185
lifecycle). Kept as their own module plane: `test/relay.test.js`,
`test/kernel.test.js`, `test/escrow-kernel.test.js`,
`test/governance.test.js`, `test/pass-ledger.test.js`,
`test/memory.test.js`, `test/relay-parity.test.js` (vendored ring),
`test/crashtest-packs.test.js` (the contract).


### `public/vant-brain` — brain-file layer discipline (9 oracles; all armed 2026-10-22; the listing family landed 2026-10-27)

**Listing slice (2026-10-27, `brain-listing-dirs-family`):** the native
suite's own header print said "BRAIN LISTING / HAS-BRAIN / DIRS
(unmeasured by the pack rows)" — the reverse-verification read takes
those hints literally. The fixture grew a `brain-listing` route (both
the run-root crate and the test crate) and the row measures the family's
five seams as neutral facts: hasBrain answers inside the closed
`null|public|private` vocabulary AND answers honest null for a missing
brain (never fabricated), listBrains is a string array with ZERO
traversal-shaped names, brainDirs carries both sides with the roots
CONFINED inside models/ (a root outside is a breach — the listing layer
would read foreign trees), loadStackCorpus sync rides its entries, and
brainSaveNeurons acks typed (`saving|error`). RETIRING these six native
pins next; the suite's other families keep their reverse-verification
stance until their slices land.

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

### `public/vant-census` — structural oracles (4 oracles; config-armed) + the naked-lib first-doors row

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

### `public/vant-dashboard` — the dashboard auth/OTP doors + the bridge knee + its relay flavor + the small doors (19 rows in four batches; validated 2026-10-25/27)

**What it does.** Phase A wire-surface slice (#249): anvils the REAL dashboard
auth doors — `web/dashboard/functions/api/auth/{request,verify}-otp.ts` +
`session.ts` — driven in-process by the run root's `dash-auth` strip-types
probe child (same architecture as `vant-relay`), with an in-child KVStore
shim for the `BOLETE_KV` binding (record-level TTL fields honored, one store
per ride so a walk bends the SAME rows a real browser would) and a capture
sink standing in the configured email sender's webhook seat. The ride law:
the code exists EXACTLY ONCE — in the mail (the pack never reads the store);
a shape body's code of "__CODE__" gets the captured code substituted, and
`useMintedCookie` forwards the ride's own last session `Set-Cookie`.

| Attack | What it shakes | Status |
|---|---|---|
| `store-absence-fail-closed` | no `BOLETE_KV` binding: request-otp, verify-otp, session all answer E_STORE_UNCONFIGURED typed 503 — absence is a loud state, not a crash | validated - REFUSED |
| `bad-body-floor` | bent JSON / missing address / malformed addresses answer 400 typed; a codeless verify never mints (typed 401 per vant's measured verdict-vs-400 law) | validated - REFUSED |
| `mint-lane-typed-and-cooldown` | no sender configured: the mint answers E_EMAIL_UNCONFIGURED typed 503 and the repeat request rides the LIVE per-email cooldown 429 — an undelivered mint still budgets, the wire never fakes a "sent" | validated - REFUSED |
| `session-mint-and-cookie-discipline` | full hammer in one ride: wrong code 401 E_OTP_MISMATCH, right code 200 + `bsess_*` HttpOnly+Secure+SameSite=Strict cookie, same-cookie session read serves the role server-side, cookieless probe 401 E_NO_SESSION | validated - REFUSED |
| `attempt-budget-burn` | the budget DECREMENTS then burns (vant's real schedule): wrong #1-4 mismatch 401, wrong #5 answers E_OTP_BURNED and the row is deleted, wrong #6 and the mailed code both refuse E_OTP_EXPIRED — a burned code never resurrects | validated - REFUSED |

DESIGN NOTE (2026-10-25, cycle 2-3 of the campaign): the two "vant's truth"
rows above (codeless verify 401, the burn schedule) are EXPLICITLY graded
against what the handlers DO, not a spec's guess — the row descriptions name
the measured schedule. The dashboard's UI modules keep their own native
tests (the pack attacks the wire, not React mounts).

**Batch 2 (same day): the bridge knee + the admin gate.** The arm child grew
three shape kinds: `bridge-pod-token` (podTokenFor serialized to neutral
facts — present + sha256, NEVER the token; three token lanes planted with
distinct vguest_ strings so the resolution order is provable by hash
equality), `bridge-establish` (the real intake), and `auth-gate`
(ensureAdmin). The ride cookie law also gained composing: `useCookie` rides
a NAMED mint (ok-admin vs ok-viewer) and raw + minted cookies COMBINE in one
Cookie header.

| Attack | What it shakes | Status |
|---|---|---|
| `token-source-order` | Authorization header wins over a live server-bound token AND the raw MVP cookie; header gone, the BOUND token outranks the raw cookie | validated - REFUSED |
| `bound-token-property-scoped` | pod-alpha resolves exactly its bound token; pod-beta (never bound) resolves nothing — no cross-property leak | validated - REFUSED |
| `token-intake-binding-law` | malformed property / non-vguest / over-512 token all 400 typed; the legit intake binds SERVER-SIDE (bound:true) and never mints a token-carrying cookie | validated - REFUSED |
| `raw-cookie-fallback-hygiene` | the unbound intake answers bound:false and ships vg_session_<p> with FULL hygiene (HttpOnly+Secure+SameSite=Strict); the probe resolves it; a malformed escape answers typed null | validated - REFUSED |
| `admin-gate-typed-ladder` | anon 401 E_NO_SESSION / forged sid 401 / viewer 403 E_FORBIDDEN / admin passes (ok, role) / no store 503 — the typed ladder at every rung | validated - REFUSED |

**Batch 3 (2026-10-27): the dashboard's OWN relay flavor.** The survey's
next Edge-family read named the unarmed wire face: web/dashboard piggybacks
a r/2 relay of its own (pass-236 ruling) — `functions/api/r/relay.ts`
(464 lines) + `functions/api/r/capabilities.ts` — with DIFFERENT lane
semantics from the solo face: the BROWSER lane hands INTENT (a `vguest_`
bearer, no signature) and forwards through the server-side pod bridge;
the RELAY lane is the same HMAC header law; a COMPLETE payload seals the
keyless last mile. The doors ride the run root's `relay-edge` child under
new edge names (`dashrelay`/`dashcaps`) — one probe, four doors — plus a
child `fetchStub` so the bridge forward's pod call answers offline
deterministically (a stub-missed URL answers a typed 599, never a DNS
walk). The dash arm's extensionless-import resolve hook rides the relay
child too: it is inert for the solo face (the pod vendored contracts
carry their `.cjs` extensions) and what makes the dashboard lib graph
import in plain Node at all.

| Attack | What it shakes | Status |
|---|---|---|
| `dash-relay-gates-fail-closed` | posture env off answers the pod-parity raw 404 on BOTH doors; the on caps page reads flavor dashboard-relay with its gate ready, secrets-free, POST surface named; the secretless relay lane 503s typed naming VANT_RELAY_GATE_KEY | validated - REFUSED |
| `dash-relay-hmac-header-lane-laws` | unsigned 401 naming X-Signature-256 / wrong sig 401; http-origin, loopback, relative-path and plaintext hop guards all refuse INSIDE the 200 acks with E_RELAY_BAD_ORIGIN / BAD_PATH / NEEDS_ENVELOPE; unknown events ack handlers=0; a relay-lane relay.ride still refuses (rides decode at the pod) | validated - REFUSED |
| `dash-relay-sealed-lane-laws` | a bad seal sig 401s named, a seal past its OWN freshness window 401s Stale-seal — the keyless last mile fail-closed | validated - REFUSED |
| `dash-relay-browser-lane-bridge` | the intent lane with no pod origin rides E_RELAY_UPST quoting the bridge's typed refusal; with an origin stashed, a shaped relay.sync TRANSLATES to the door verb — dispatched=1, the upstream answer verbatim | validated - REFUSED |

14/14 `REFUSED` x2 deterministic (strict cycles 2026-10-27). Remaining
unarmed dashboard doors (audit.ts, breakers.ts, properties.ts,
users/index.ts, the mcp proxy trio) queue behind a later small-doors
batch — audit/breakers ride the admin gate the ladder already grades.

**Batch 4 (2026-10-27): the small doors, all riders of the SAME
`dash-auth` child.** audit / users / properties / breakers + the MCP
forward trio converted as five rows (the child gained the seven module
imports + a per-shape `meta.url` override for the query-string and
set-status routes):

| Attack | What it shakes | Status |
|---|---|---|
| `small-doors-properties-registry` | container-or-nothing registry: id+label rows (NAME var = label, id = fallback), an over-long id serves NOTHING, and no origin ever rides the body | validated - REFUSED |
| `small-doors-breakers-edge-view` | the per-isolate view serves 200 + the map + the honest scope note naming the pod's breaker authoritative | validated - REFUSED |
| `small-doors-audit-ladder-and-cap` | anon 401 / admin reads the ride's own ledger rows in the closed vocabulary newest-first / limit=1 + clamp=200 honest / budget E_EDGE_THROTTLED 429 — and ZERO PII on the wire | validated - REFUSED |
| `small-doors-users-roster-lockout-and-gate-done` | hash-only roster (the pinned VANT_EMAIL_SALT makes the row hash computable), bad status 400, unknown hash 404, E_SELF_DISABLE typed, a real disable lands ok:true and the disabled account DIES AT THE GATE it used to pass (401 E_ACCOUNT_DISABLED) | validated - REFUSED |
| `small-doors-mcp-trio-typed-forward` | exec/tools/events all cross ONE forward and each 503s typed on a missing origin naming VANT_PROPERTY_LOCAL_ORIGIN with the Pages-settings hint | validated - REFUSED |

19/19 `REFUSED` x2 deterministic (strict cycles 2026-10-27); contract
327/0 with the five rows + the carriers mesh row in the EXPECTED
table; lint id census 243.

### `public/vant-rest` — the REST door-parity arm (8 rows; three landed 2026-10-27)

**What it does.** The Edge-family deepening read turned to the pod's OWN
REST surface: `lib/api.js`'s `startREST` door family (/streams, /brain,
/trust, /market, /health) — MCP carriers the old edge rows never met. The
fixture arm now carries `lib/api.REST_ROUTES` on the in-process Edge
chains (`rest-request` + `vant-rest-open/priv`), which also closes an
honest arming gap the parity rows caught: `edgeRoundTrip` keyed the URL
off `spec.url` only, so `rest-request`'s documented `{path}` contract
silently drove `/` for every prior shape (the fuzz/CORS rows still
passed, but on the root's answer, not the named paths). Fixed same-pass.

**The live findings the arm earned (all fixed in `lib/api.js` same-pass):**
three doors forwarded the WRONG arg name to their tool — `stream_info` /
`stream_enqueue` / `stream_poll` took `workId` (the tools' declared
schema wants `stream`, so every honest call answered the tool's typed
`MCP_INPUT_INVALID` arg gate instead of running the tool), and
`trust_getScore` took `entity` (schema wants `entityId`); the programmatic
`api.trustGetScore`/`api.trustRecord` doors had the same wrong names.
The door's vocabulary must be the tool's vocabulary.

| Attack | What it shakes | Status |
|---|---|---|
| `rest-mcp-door-args-parity` | 9 carrier-door honest rounds (streams info/poll/enqueue, brain load, trust score/leaderboard, market stats/listings, health) run the REAL tool — never the arg gate, never 5xx | landed - REFUSED |
| `rest-bent-body-fuzz-floor` | 10 bent bodies (missing required params, garbage JSON) across the door family answer 2xx-4xx with the typed gate — never 5xx, never an uncaught throw | landed - REFUSED |
| `rest-typed-gate-is-the-answer` | the arg gate answers VERBATIM in a 200: MCP_INPUT_INVALID + tool name + the named missing params, not redacted | landed - REFUSED |

8/8 `REFUSED` x2 deterministic (2026-10-27; the five pre-existing rows
unmoved); contract 322/0 with the three rows in the EXPECTED table.
Shared QoS note: the Edge chains' per-instance rate floor is a REAL
fixture budget, so a second cycle that starts mid-budget answers 429 —
the rows skip a 429 fire (typed skip, never graded) instead of reading
the limiter as door behavior.

**Traveler wire slice 2 (same day): the law lanes the sibling row left**
(`wire-traveler-law-lanes`, 4 fire rounds). The sibling row covered the
STEP + SCHEMA lanes; this one grades the REMAINING lanes at the SAME
door: a non-hex id refuses E_TRAVELER_ADDRESS in the 200 ack — the
measure that matters is what does NOT happen: zero door-landing growth
across all the refused fires (the guard refuses BEFORE the id-named
brain_write slot generator ever sees the sneak id; the slot's "nothing
to fear (hex)" safety rides the guard). Absent slots refuses
E_TRAVELER_SHAPE and a non-ledger steps field rides E_TRAVELER_STEP on
the same lane. 4/4 fires honest (1 legal dispatch + 3 typed refusals,
zero landings beyond the legal one).

### `public/vant-state-wiring` — the state-spine wiring consumers (44 rows in four tranches: trust→tree, merge-path, mesh + surfaces, wave-2 store/seeds; validated 2026-10-26, wave-2 2026-10-28)

**What it does.** Drill-down slice 1 of the campaign: the state-wiring
native suite's first live consumer family (TRUST→TREE, labs/WIRING.md step
①) converts to pack rows on the run root's `wiring-trust` arm — the
sandbox's REAL `lib/trust.js` + `lib/state-store.js` seams driven in-process
(mirror, root hash, disk view, shared-bus event, clear), op by op, neutral
facts only. Determinism note: `peek` reads the RAW `_treeRoot()` without
materializing a tree — the contract the native pins grade; a materialized
fresh tree would fabricate a hash for state that no longer exists (pin-caught
on the slice's first run).

| Attack | What it shakes | Status |
|---|---|---|
| `trust-mirror-under-tree` | record mints a 64-hex root, tree paths live under /trust/, and the mirrored state carries BOTH the score and the history | validated - REFUSED |
| `trust-mutate-moves-root` | a second persist MOVES the root hash — each persist re-mirrors and re-hashes | validated - REFUSED |
| `trust-disk-view-live` | treeFor('state/trust.json') === live mirror: one string comparison certifies cross-process same-state | validated - REFUSED |
| `trust-event-carries-root` | state:saved carries the root hash and it matches the live mirror at fire time | validated - REFUSED |
| `trust-clear-resets` | a live root existed, then clearState drops the mirror to null — no hash blesses state the deployment no longer holds | validated - REFUSED |

**Wave-2 attack table (2026-10-28):**

| Attack | What it shakes | Status |
|---|---|---|
| `mesh-seeds-family` | two fresh trees over one universe derive ONE seed; universes shard; VANT_UNIVERSE_SEED moves the default-constructor seed; invalid/empty regions refused typed | validated - REFUSED |
| `mesh-celladdr-one-prf` | MeshTree.cellAddress IS the spine PRF: equal, stable across repeat calls, moving across spaces | validated - REFUSED |
| `mesh-authority-canonical-winner` | same payload in different key order under one fixed clock hashes to ONE root; winner-or-recorded-loser regression holds | validated - REFUSED |
| `mesh-persistence-inmemory-default` | a dir-less MeshTree reports battery-off truth (enabled false, dir null, recovery null) and still answers register/alive | validated - REFUSED |
| `store-tree-tier-laws` | toTree/fromTree roundtrip carries STATE KEYS ONLY; metadata excluded; fresh trees agree on one root across key orders | validated - REFUSED |
| `store-persist-mirror-event` | persist({tree}) mirrors into the caller tree; the disk view reads back PRESENT with the SAME root; state:saved carries it | validated - REFUSED |
| `store-treefor-typed-absence` | treeFor answers typed ABSENT (no hash, no fake empty tree) for a never-written file | validated - REFUSED |
| `store-hydrate-law` | hydrate({tree}) populates the CALLER tree, returns the 64-hex root, and fromTree reads the payload back | validated - REFUSED |
| `store-anchor-chain-event-laws` | the chain is an event history: first root anchors once (state:anchored rides it), unchanged root dedupes, changed root anchors, fresh mirror stays deduped | validated - REFUSED |
| `store-anchor-tamper-detector` | verifyStateRoot answers clean-against-anchor, then catches the out-of-band disk write with diverged-since-anchor | validated - REFUSED |
| `store-anchor-no-tree-never-bless-law` | no tree → no anchor (typed not-yet-anchored) and hydrate never appends to the ledger even carrying a tree | validated - REFUSED |
| `store-anchor-merged-cause-law` | persistMerged anchors the merged tree root with a cause that names the merge path; state verifies clean | validated - REFUSED |

Slice 1 verdict: the five pins measure REFUSED on the real seams with
`test/state-wiring.test.js` drove the way (read before write, per the campaign's law) and the suite's run stayed green through every conversion — then the retirement step (see the retirement note in the carriers section below) trimmed it to the families the pack rows don't measure: 20 pins remain (seeds, authority, tree tier, anchor, mesh in-memory default, mesh-status JSON roundtrip); the 31 converted pins retired to the pack rows 2026-10-26
reverse-verification law — the suite never retires until the whole family
closes.

**Retirement step (final, 2026-10-28 wave-2): the LAST 20 native pins
closed on the pack rows and `test/state-wiring.test.js` retired whole**
(the carriers precedent). The wave-2 tranche drove the six remaining
families onto two arms: `wiring-mesh` grew the seeds/authority ops
(`seed`, `envseed`, `celladdr`, `authpair`, `inmemdefault`) and a new
`wiring-store` arm carried the bare tree-tier + StateAnchor laws — 12
new rows, `vant-state-wiring 44/44 REFUSED x2` deterministic across
cycles, zero EXPLOITED. Two honest repairs landed same-pass: the
tamper op first corrupted the loader's identity field (kind) — the
out-of-band write now hits a PAYLOAD key — and the pass-184
treeHot disk-read cache had to ride the tamper leg's fresh-reader
posture (the ride-local cache drops before the detector's verify
round). The seeds rows ride per-run salted throwaway state tokens
(deltas, not absolutes — the anchor ledger is append-only by design).
The native suite's whole file is gone; its families live on the rows.

**Slice 2 (same day): the merge-path consumers — REGISTRY → TREE (step ② §
and CONSENSUS + MARKET → TREE (step ③).** The arm grew a second route
(`wiring-module`) with a per-module verb table: a real consumer library
per key, an `act` verb per family (register / heartbeat; create; list
with a caller context that consents), tree/disk/peek/settle/watch ops,
neutral facts only. The native pins' timing drives rides the SAME way as
the suite does: a FIXED settle (6ms after register so heartbeat stamps
differ; 20ms to flush the merge-path lock handshake before a disk read)
— drive, never a verdict. The consent gate is NOT graded by this slice:
`market.list` runs under a caller context with requiresConsent:false so
the pin measures the mirror, not the consent door.

| Attack | What it shakes | Status |
|---|---|---|
| `registry-register-mirrors` | register re-mirrors the peer table on the MERGE path: 64-hex root, peer in the mirrored tree, state:saved rides the same hash | validated - REFUSED |
| `registry-heartbeat-moves-root` | a heartbeat is a merge-path mutation and the root MOVES (the stamps cannot certify the same tree) | validated - REFUSED |
| `registry-disk-view-live` | treeFor('state/node-registry.json') === live mirror in one string | validated - REFUSED |
| `registry-clear-reset-reuse` | clearState wipes everything (tombstones included); re-registering the same id works cleanly after | validated - REFUSED |
| `consensus-create-mirrors` | create re-mirrors the vote ledgers through the merge path; state:saved rides the same hash | validated - REFUSED |
| `consensus-disk-view-live` | after the fixed settle, treeFor('state/consensus.json') === live mirror | validated - REFUSED |
| `consensus-clear-resets` | the mirror drops to null and the topic re-creates cleanly | validated - REFUSED |
| `market-list-mirrors` | list re-mirrors the market state through the merge path; state:saved rides the same hash | validated - REFUSED |
| `market-disk-view-live` | after the fixed settle, treeFor('state/market.json') === live mirror | validated - REFUSED |
| `market-clear-resets` | the mirror drops to null and the search index resets; re-listing works cleanly | validated - REFUSED |

**Slice 3 (same day): the MESH consumers (steps ④-⑦) + the SURFACES
consumers.** Two more arms: `wiring-mesh` (in-ride MeshTree instances over
throwaway WAL dirs with FIXED step clocks — `t + n*step`, the dir-token law
lets two instances in one ride share a dir for recovery rides — and shared
bus watchers) and `wiring-surfaces` (geometry, brain-verify, mesh-status,
neutral facts + full env/console restore). Ride shapes: the WAL rows read
the REAL SnapshottedLog layout (`wal.log` + content-addressed `*.snap`),
the events rows ride the pass-176 shared bus, the brain-verify rows walk
`checkBrainIntegrity` and `bin/horcrux.js`'s exit contract, and the
mesh-status rows honor the report's pure-derivation + env-flow + degraded
laws. Two pin-caught arm bugs worth keeping in the ledger: a health walk
must NOT change content between its baseline and clean runs (the fresh
brain gets a baseline, then a SAME-content second run verifies — the arm
had mutated between and read a false divergence), and the pure-derivation
probe must measure purity BEFORE moving the env it proves flows.

| Attack | What it shakes | Status |
|---|---|---|
| `mesh-wal-deltas-ride-log` | `wal.log` + the snapshots dir exist after register→heartbeat→subscribe; exactly one `.snap` fires at the everyN=3 boundary — deltas ride the file, not the memory | validated - REFUSED |
| `mesh-wal-recovery-reconstructs` | a FRESH MeshTree over the SAME dir reconstructs root + alive + write + aoi byte-for-byte and reports the replay count | validated - REFUSED |
| `mesh-wal-rejected-durable` | a lower-epoch challenger loses deterministically (recorded with winner/provenance shape); the RECOVERED tree keeps the loser record AND the restored authority (a second challenger refused cold) | validated - REFUSED |
| `mesh-wal-ledger-provenance` | every delta carries actor+numeric-epoch; two trees that saw the same events agree on ONE ledgerHash | validated - REFUSED |
| `mesh-wal-interval-fastforward` | bounded (keepK=2) recovery reproduces the exact root and the LAST delta holds the contested presence path | validated - REFUSED |
| `mesh-events-bus-provenance` | register/heartbeat/aoi/write/write:rejected all emit on the shared bus with actor+epoch; an older-epoch challenger's rejection rides | validated - REFUSED |
| `mesh-events-silent-side-effect-free` | register+heartbeat+write on a silent tree fire ZERO events — a status probe is never a side effect | validated - REFUSED |
| `mesh-events-recovery-emits` | `mesh:recovered` fires EXACTLY ONCE carrying the live root hash and replayed=1 | validated - REFUSED |
| `geometry-canonical-barcodes` | same logical content hashes identically in ANY key order (the #146 disease dead at the generator), NSC-9 12-digit contract intact, canonically derived, distinct-content-distinct | validated - REFUSED |
| `geometry-barcode-roundtrip` | store→retrieve roundtrips, re-deriving the barcode reaches the SAME record, and has() answers | validated - REFUSED |
| `brainverify-health-lifecycle` | fresh brain anchors a baseline (warn path), SAME-content brain verifies, tamper DIVERGES — in one process walk | validated - REFUSED |
| `brainverify-horcrux-exit-contract` | no anchor → 2 / anchor → 0 / clean → 0 / tamper → 1 + DIVERGED / re-anchor → 0 again | validated - REFUSED |
| `meshstatus-mesh-section-shape` | the mesh section carries 64-hex scope, mesh:local path, positive TTL, a peers array, and a stable JSON roundtrip | validated - REFUSED |
| `meshstatus-seed-pure-and-envflow` | the seed derivation answers identically twice unperturbed and MOVES under the universe seed (restored after) | validated - REFUSED |
| `meshstatus-render-degraded` | the degraded mesh line still renders its label with (unavailable) and prints the error itself — degraded-not-dead | validated - REFUSED |

### `public/vant-carriers` — the carrier/assimilator lanes (42 rows across 9 slices: lane laws, pointer/wire-hook, route, plates, assembly/template, the traveler working layer, the wire seam, the mesh serving wall, the travelers census; lanes 1-5 validated 2026-10-26, 6-9 2026-10-27)

**What it does.** The carriers battery's first conversion slice (#249
drill-down, per-bucket shape): the native suite's lane laws family (pass
258 + successors) converts to pack rows on the run root's `carriers-lane`
arm — the REAL `lib/carriers.js` + `lib/traveler.js` seams driven
in-process with FIXED-NOW mints (the traveler's own determinism law: same
payload + same ts = the SAME address, so the fleet rides rangefree).
Artifacts and pair passwords stay in-ride — the wire carries neutral facts
only (booleans + caught typed codes), never a frame, never a password,
never a packet body.

| Attack | What it shakes | Status |
|---|---|---|
| `carriers-roster-honesty` | nsc9/stone/svg/json available, png DECLARED-ABSENT with a named blocker, qr real, the roster overstates nothing | validated - REFUSED |
| `carriers-nsc9-frame-law` | the 12-digit Lane B shape, deterministic marks, matches() self-authenticates (wrong mark false, malformed facility typed E_CARRIER_SHAPE, malformed decode typed) | validated - REFUSED |
| `carriers-nsc9-giai-readthrough` | giai() yields the AI-8004 form, fromGiai() strips back to the SAME frame, hostile GIAI typed | validated - REFUSED |
| `carriers-stone-two-walls` | VSTN:1: grammar, byte-for-byte round-trip, seal damage refuses E_CARRIER_TAMPER with the CARRIER wording (not the packet wall's), resealed forgery typed TAMPER too, nonsense grammar SHAPE — two DISTINCT walls | validated - REFUSED |
| `carriers-svg-airgap` | encrypted body (no plaintext markers), minted-once long pair password, honest id fragment, clean round-trip, explicit password mints nothing, wrong password typed E_CARRIER_TAMPER | validated - REFUSED |
| `carriers-json-erp` | verbatim traveler form, verify re-applied on the way back, tampered bag typed E_CARRIER_TAMPER | validated - REFUSED |
| `carriers-sender-side-verify` | a tampered packet cannot ASSIMILATE into any lane (all four refuse the sender typed E_CARRIER_TAMPER) | validated - REFUSED |
| `carriers-capacity-and-codes` | a 400KB blob refuses typed E_CARRIER_SHAPE naming STONE_CAP (never truncates); TAMPER/SHAPE/GAP stay distinct typed names | validated - REFUSED |

Slice 1 verdict: the lane laws measure REFUSED on the real seams with
`test/carriers.test.js` (111 pins) drove the same laws per the
reverse-verification law — and RETIRED whole to these pack rows on
2026-10-26: every family in the file converted (lane laws, pointer/wire
hooks, route, plates, assembly/template), so the coverage now lives in
the pack rows and the file is deleted (the retirement step, done last
in the bucket).

**Slice 2 (same day): the pointer/wire-hook family (pass 265 + 267).** The
arm grew an honest QR leg: `qrPointer` rides the png in-ride (Buffer never
on the wire), decode/pointerOnly/foreignPng shapes, a wall-time `tamperBody`
op (patched body → decode → byte-restore in one op), and one-transaction
`wireCase` cases whose hooks never linger past their case (finally cleared).
A determinism catch the pine caught: every row re-mints the SAME
content-admitted id from identical slots, so the sandboxed ledger from one
row's persist leaked into the next ride's decode - each row carries its own
slot title now (ids never collide across rows).

| Attack | What it shakes | Status |
|---|---|---|
| `carriers-pointer-address-law` | VANT:1:<64hex> frame (71 chars, id-suffixed), no-body is an HONEST unresolved record, persisted body answers, the pure-pointer scan ruling skips resolve, full-object qr roundtrip intact | validated - REFUSED |
| `carriers-pointer-body-wall` | a tampered on-disk body refuses typed E_CARRIER_TAMPER at resolve, restored byte-identical after | validated - REFUSED |
| `carriers-wire-hook-failclosed` | non-function hook refuses the setter typed, found:false and a THROWING door are both honest unreachable records | validated - REFUSED |
| `carriers-wire-hook-walls` | a good hook brings the body home (fetched, id match); SWAPPED and FORGED bodies hit the packet wall typed E_CARRIER_TAMPER; a cleared hook restores the classic no-body; the hook never short-circuits a LOCAL body | validated - REFUSED |

**Slice 3 (same day): the certified-letter route family (R0-R12; 6 rows,
23/23 REFUSED x2).** The `carriers-lane` arm grew a `route` op with
self-seeding np-unique org fixtures (org -> dept -> team, real `lib/teams`,
the in-process grant lane granted exactly before use): a real team member
station SCOPE-MINTS (scoped packet, verified), Three stages route with
per-stage evidence, the nsc9 lane rides its stage, the walk certifies
continuity with zero gaps/rewrites; an OUTSIDER station drops the letter
fail-closed (typed stage+code, birth-only walk, strictly shorter); the
RISK gate needs a live single-use escrow approval (no-approval refuses,
live approval rides, the approval is BURNED after its ride - law #204 on
the route); a stageless route refuses typed SHAPE; a tampered start
refuses typed TAMPER; the enterprise line composes template + RLS lineage
(row in slice 5, case reused).

| Attack | What it shakes | Status |
|---|---|---|
| `carriers-route-org-fixture` | org -> dept -> team assemble; the station is a REAL team member (scope lineage admits only known members) | validated - REFUSED |
| `carriers-route-letter-routes` | 3 stages landed with evidence, nsc9 rode stage 2, the walk certifies continuity (no gaps, no rewrites) | validated - REFUSED |
| `carriers-route-outsider-drop` | outsider dropped fail-closed (typed stage+code), birth-only walk, strictly shorter than the certified walk | validated - REFUSED |
| `carriers-route-risk-gate` | no-approval refused, live approval allowed, approval burned single-use | validated - REFUSED |
| `carriers-route-stageless-forged` | stageless route -> E_CARRIER_SHAPE; tampered start -> E_CARRIER_TAMPER | validated - REFUSED |

Slice-3 determinism note: the fixtures seed per case with Date.now+random
names so ids/names never collide across rows (the same content-addressing
lesson as slice 2, org side).

**Slice 4 (same day): the carrier plates family (M1-M16; 6 rows,
23/23 REFUSED x2).** The arm grew a `carriers-plates` route with
SUBPROCESS case probes chdir'ing into a scratch cwd (plate stores must
never pollute the repo tree) — the CHILD CHDIRS FIRST, then requires the
REAL repo lib by absolute path (the store path resolves through the
ACTIVE brain, and an un-pinned cwd may not decide it), and the arm
SEEDS the native state law in the scratch before any op runs
(models/state.json pin + models/private/vant, the same makeSandbox law
this run root applies to its own fixture brain):
persist (store + .sha256 sidecar + roster ride), the FRAMED artifact
(definer owns the marker, lib owns the crypto — round-trips BOTH walls,
seal damage refuses on the SEAL, foreign marker refuses the frame law),
pointer plates (NSC-9 under the maker marker, read-back through the
built-in law), the definition gates (reserved ids, malformed
ids/frames/carries, VSTN: is sacred), the hydrate restart (define once,
everywhere), and code carriers (the packet gate wraps customer code in
and out; code never persists).

| Attack | What it shakes | Status |
|---|---|---|
| `carriers-plate-persist-roster` | registered plate = persisted data + sidecar + immediate roster ride | validated - REFUSED |
| `carriers-plate-framed-walls` | framed stone envelope round-trips; seal wall and frame law both ride the plate | validated - REFUSED |
| `carriers-plate-pointer-lite` | the lite lane is the REAL frame under a maker marker, not a fake of it | validated - REFUSED |
| `carriers-plate-definition-gates` | reserved ids, malformed shapes, and the VSTN: grammar wall all refuse typed | validated - REFUSED |
| `carriers-plate-hydrate-restart` | plate hydrates from the store and decodes identically after the restart | validated - REFUSED |
| `carriers-plate-code-carrier` | customer code is gated in and out, and never becomes data | validated - REFUSED |

Slice-4 arm finding (armed, read, fixed in-ride, CI-fork closed
2026-10-28): the require-BEFORE-chdir order relied on a .gitignored
dev-local models/state.json — a CLEAN checkout (CI's) resolved every
plate store to the PUBLIC root (models/public/vant/state/, walk-verified
through the child's own diagnostics) and faithfully refused the private
law rows in-ride. The fixed arm (state-pinned scratch + chdir-first) was
verified against a git-archive checkout WITH the local state file absent
— the exact CI shape — green. Each case still sweeps its scratch. The
pointer shape check uses plain arithmetic (no regex escapes riding
template layers).

**Slice 5 (same day): assembly + template (pass 260; A1-A6 B1-B7 C3 and
the C4 compose; 8 rows, 31/31 REFUSED x2).** The `carriers-lane` arm grew
a `template` op: parts ACCUMULATE into slots.assembly (inside the content
address) with sign-offs naming their part; append-only assembly (redo and
empty parts refuse typed E_TRAVELER_STEP); the address law (editing an
attached part breaks verify, part-less sign-offs still ride); the mfg
line builds under its template (built flag + assembly, part evidence per
route row, walk certifies, wildcard rows admit the caller identity); the
bill walls (reorder/truncate/extra all refuse typed E_CARRIER_TEMPLATE);
the digital line builds the same way and the built letter verifies; an
unfilled part-slot reports built:false NAMING the hole; the enterprise
line composes template + RLS lineage with the team owner kept.

| Attack | What it shakes | Status |
|---|---|---|
| `carriers-assembly-parts-accumulate` | assembly accumulates (rim + hub) and each step names its part | validated - REFUSED |
| `carriers-assembly-append-only` | redo refuses; empty part refuses; both typed E_TRAVELER_STEP | validated - REFUSED |
| `carriers-assembly-address-law` | tampered assembly refuses verify; part-less sign-off rides and verifies | validated - REFUSED |
| `carriers-template-line-builds` | template rides, builds, evidences parts, walk certifies, wildcard admits by | validated - REFUSED |
| `carriers-template-bill-walls` | reorder, truncation, and extra stations all refuse typed E_CARRIER_TEMPLATE | validated - REFUSED |
| `carriers-template-digital-line` | four parts in order; the built letter verifies | validated - REFUSED |
| `carriers-template-unfilled-honest` | built:false verdict with the unfilled slot named (hub) | validated - REFUSED |
| `carriers-template-enterprise-line` | enterprise line builds inside scope with the owner kept | validated - REFUSED |

Slice-5 arm catch: the template cases must grant the in-process write
lane exactly like the native suite (the ROUTE fixture arm already did);
without it the part-attach no-ops silently. The arm grants before the
case attempt.

The carriers battery is DONE: 31 rows across 5 slices; native
`test/carriers.test.js` (111 pins) green throughout under the
reverse-verification law UNTIL the retirement step: the file retired
whole to the pack rows on 2026-10-26 (every family converted — the
coverage lives in the 31 pack rows now).

### `public/vant-migrations` — the brain-layout migrations battery (24 rows across 4 slices; validated 2026-10-26/27)

**What it does.** The migrations battery's first conversion slice (#249
drill-down): the native suite's fixture family converts to pack rows on the
run root's `migration-fixture` arm — the REAL migrations lib +
bin/migrate.js driven the way the native suite drives them: a THROWAWAY
fixture install (lib copy + the axolotl-era legacy artifacts in
.agent_tmp/, storage/myStuff/ and models/private/<brain>/state/) probed by
subprocess with the fixture swept per ride; neutral booleans on the wire.

AND THE SLICE ARMed A REAL FINDING the same hour: with the live protocol
state the native suites write, the dropfile migration classified the live
traveler ledger as legacy drop content and CRASHED every migrate() (and
every auto-migrating boot) with EISDIR once the state-store wrote a
`.wal/` DIRECTORY into the same dir — a directory is never a dropfile, and
the crash class was the catch-misread ("not JSON → legacy"). Fixed the
same turn (lib/migrations.js: dirs stat-skipped in detect + plan; the
.sha256 pin contract skipped as LIVE structure) and lib/traveler.js now
stamps its ledger with the ONE `vant-protocol-state` marker the classifier
trusts — the native suite went 25/28 RED to 28/28 GREEN in the same pass.

| Attack | What it shakes | Status |
|---|---|---|
| `migrations-registry-shape` | ordered steps (id + detect + apply on >=3 statuses), honest status (LAYOUT_VERSION target + boolean upToDate), and clean-install idempotence | validated - REFUSED |
| `migrations-detect-dryrun-no-mutation` | ALL THREE legacy artifacts detected, the dry run PLANS the moves without consuming the pending state, artifacts byte-intact after (a plan is not an apply) | validated - REFUSED |
| `migrations-apply-security-chain` | escrow lands in models/private/<brain>/orgchart/, legacy state drains, .agent_tmp gone, storage/myStuff lands byte-for-byte in tmp-space, marker >=2 written, second run applies nothing | validated - REFUSED |
| `migrations-dropfile-no-clobber` | a CURRENT dropfile reads unchanged after the full apply — the present wins over history, never clobbered | validated - REFUSED |

**Slice 2 (same day): the legacy-main multibrain import family — THE
merge-safety migration.** The arm grew a `legacy` op with per-task probes
(detect / nofalse / dryrun / apply) seeding and sweeping the PRE-multibrain
main-style fixture (flat public brain, neurons-only state.json) the way
the native pins do; the apply leg runs the SECOND fresh-process read probe
(the user experience: the migrated brain reads in a new node process).

| Attack | What it shakes | Status |
|---|---|---|
| `migrations-legacy-detect-fires` | detection fires legacy.multibrain-import ONLY on the true flat layout | validated - REFUSED |
| `migrations-legacy-no-false-positive` | a clean multibrain install never reads the import pending (no re-fire on an already-nested install) | validated - REFUSED |
| `migrations-legacy-dryrun-plans` | >=5 planned moves into <name>, the flat tree still byte-present after (a plan is not an apply) | validated - REFUSED |
| `migrations-legacy-apply-nests` | flat content nests under models/{public,<name>}/vant, boot + succession nest, stack synthesized pointing currentBrain at the chosen name with neurons carried, v3 marker, self-verified through the real loader, idempotent, and a FRESH process reads the migrated brain with a non-empty corpus | validated - REFUSED |

**Slice 3 (same day): the CLI banner family, the MCP door, and the
adversarial edges (4+2+7 rows; 21/21 REFUSED x2).** The `legacy` op grew
the banner probes (real `bin/start.js` runs, the BRAIN MIGRATED banner and
its silent second start), the MCP door probes (`brain_migration_status`
truthfully loud on legacy with actionable guidance, truthful
up-to-date after a sealed migration), a dual-mode read-fallback probe
(the USER's migrated content is readable plain + explicit-public), the
anvil probes — self-nest prevention, stack rewrite (a default-only stack
never strands a --brain-name import behind a dead default), multibrain
files win over flat same-names, the walker's symlink wall (an outside
canary stays byte-intact), failed-verify withholds the marker
(retryable, never sealed), the CLI exit truth (`migrate --status` loud
exit 0, a sabotaged apply exits 1 naming `could not verify`), and the
health tripwire (warns on legacy, silent after, both exits 0).

| Attack | What it shakes | Status |
|---|---|---|
| `migrations-cli-legacy-banner` | the first start on a flat tree auto-migrates with the BRAIN MIGRATED banner | validated - REFUSED |
| `migrations-cli-second-start-quiet` | the second start re-reads the same law quietly: no re-banner, layout OK | validated - REFUSED |
| `migrations-cli-existing-wins-quiet` | a zero-move import is a no-op: no celebration banner, layout reads OK | validated - REFUSED |
| `migrations-mcp-door-legacy` | the door reports legacy:true with guidance that names both `vant migrate` and `--brain-name` | validated - REFUSED |
| `migrations-mcp-door-uptodate` | after a real migrate the same door reports upToDate truthfully | validated - REFUSED |
| `migrations-read-fallback` | plain + explicit-public reads both reach the migrated content on a migrated tree | validated - REFUSED |
| `migrations-no-self-nest` | a pre-created destination dir never self-nests; boot artifact intact, import beside it | validated - REFUSED |
| `migrations-stack-rewrite` | a default-only stack is REPLACED by the chosen name (never stranded), neurons carried | validated - REFUSED |
| `migrations-multibrain-files-win` | existing multibrain files win over same-named flat files (no clobber), skippedExisting counted | validated - REFUSED |
| `migrations-symlink-wall` | the walker does not follow symlinks out of models/: outside canary intact, legit import still lands | validated - REFUSED |
| `migrations-unverified-withholds` | sabotaged verify: ok=false, failedVerify=true, marker null — retryable, never sealed | validated - REFUSED |
| `migrations-cli-status-and-fail-exit` | status announces the old-style brain exit 0; sabotaged apply exits 1 naming could-not-verify | validated - REFUSED |
| `migrations-health-checkmigration` | health warns on legacy, goes silent after, both exits 0 | validated - REFUSED |

Slice-3 determinism note (armed, read, fixed in-ride): the two
sabotage-shape rows refused twice gone — the ride's fixture seeded a
private-vant dropfile; AFTER the public wipe the loader still counted
private-brain files as a living corpus, so the corrupted verify read TRUE
and the withheld-marker contract looked satisfied-by-lie. The two rows
now seed the native fixture shape (models/private ABSENT — what the pins
test) and the ride got fault/head/mid/tail capture so future walk misses
report WHY. Deterministic across two rides; native suite 28/28 green
alongside.

Queued behind: (this battery is DONE — 24 rows across 4 slices; slice 4 below
retired the native suite whole) — the carriers' route/plate/assembly/template
families converted and retired in their own pass.

Slice 1 verdict: the fixture family measures REFUSED on the real seams
and the conversion went through the finding's same-pass fix above.
Retirement steps: (2026-10-26) 24 of the 28 pins retired to the 21 pack
rows, 4 kept native (the clean-layout --dry-run CLI shape, the
private-scope import + both-scope fresh reads, the --brain-name naming
law); (2026-10-27, slice 4) the LAST FOUR converted too —
`migrations-legacy-both-scopes-and-fresh-reads` (both scopes under ONE
chosen name, private state/ subdir carried, fresh-process dual reads),
`migrations-legacy-brain-name-naming-law` (chosen-name nesting + stack),
`migrations-cli-clean-dryrun` (up-to-date layout answers nothing-pending
at exit 0 from the shipped CLI over the clean fixture) — all three x2
deterministic, so `test/migrations.test.js` then RETIRED WHOLE to the
24 pack rows: the coverage lives in the pack now.

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
| drill-down: remaining native suites (migration, carriers, ...) | remaining ~35% | **CONVERTED — slices 1-6 landed (2026-10-25/26)**: state-wiring fully converted (30/30 REFUSED x2), the carriers battery converted in full (31/31 REFUSED x2: lane laws, pointer/wire-hook, route/certified-letter, plates, assembly/template), AND the migrations battery's fixture + legacy-main import + CLI-banner/MCP-door/edge families landed (21/21 REFUSED x2 on `migration-fixture`) — with the REAL FINDING armed+fixed same-pass (the dropfile migration ate live protocol state / crashed EISDIR on the state-store's .wal dir; native suite 25/28 → 28/28 GREEN) and a deterministic-ride fixture shape caught in slice 3 (a private-vant dropfile kept the loader non-empty after the public wipe — the sabotage-shape rows now seed the native shape); the carriers battery finished the same day (slices 3-5 above), AND the retirement step ran the same pass: test/carriers.test.js retired whole to the pack rows, test/migrations.test.js trimmed to its 4 uncovered pins (4/4 green), test/state-wiring.test.js trimmed to its 20 uncovered pins (20/20 green) — the converted families' coverage lives in the pack rows now. Restamped 2026-10-27 (two full cycles on the post-retirement tree): every slice-4/trim claim re-verified with migrations retired whole and the spine/leisure/brain/guest native trims in CI — 209 pack rows REFUSED / 0 EXPLOITED / 0 BOUNDED x2 deterministic (6 honest skips), library rows 48/0/1 each run, contract 310/0, gate GREEN. Re-restamped same-day-end (after batches 2-4 of the dashboard surface landed): harness x2 now reads 218 pack rows REFUSED / 0 EXPLOITED / 0 BOUNDED x2 deterministic (6 honest skips), contract 319/0, gate GREEN, and the FULL native floor swept in six --from/--to chunks: 222/222 suites green with two honest repairs landed mid-sweep. Remaining native-suite buckets: none named in this drill-down — the S-counters hold their claims per bucket as converted. Wave-2 (2026-10-28): the state-wiring suite's last 20 native families (seeds, canonical authority, bare tree tier, StateAnchor chain incl. tamper/never-bless, mesh in-memory default) converted to 12 pack rows (vant-state-wiring 44/44 REFUSED x2) and test/state-wiring.test.js retired WHOLE — the drill-down bucket's native-suite inventory is empty |

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

**Phase A restamp 4 (2026-10-27, the post-depth-pass restamp, two full cycles):** after the remaining REST doors converted (`rest-remaining-doors-parity`, vant-rest at 9 rows), the market-skills audit ruled ZERO trims, and the fresh survey read stamped the next surfaces, the whole tree was re-stamped on the CURRENT count: packs x2 deterministic (298 green rows both cycles, zero EXPLOITED, library rows 48/0/1 each cycle, all five newest rows present each fire), contract 339/0, the strict ci-gate GREEN on the settled tree (one RED flake mid-stamp was a teardown race against the concurrent background cycle - settled GREEN, whitelist empty), and the full native floor swept green post-retirement (203 suites across the a-m/n-z chunks, 0 failed, 0 timeouts). The S-counters hold on the current count; the next tranche of rows re-stamps from here.

**Phase A restamp 3 (2026-10-27, the census-tree restamp, two full cycles):** after the brain census closed (all eight inventory clusters converted), the breaker's last native family retired (`test/brain-circuit.test.js` whole, the probe-on-failure leg folded into `brain-load-circuit-laws`), the market census landed (scope/cancel/bid gates + skills gate, `lib/market.js` fixed same-pass x3), and the tools-registry census landed (the `vant_call` schema handoff fixed same-pass), the whole tree was re-stamped: packs x2 deterministic (297 green rows, zero EXPLOITED, library rows 48/0/1 each cycle), contract 338/0, strict ci-gate GREEN (whitelist empty), and the full native floor swept green post-retirement (203 suites; the one-suite delta is the retired brain-circuit file). The S-counters hold their claims on the current count.

**Phase A S-counter restamp (2026-10-27, two full cycles, the post-retirement tree):** the retired batteries' claims pre-date their trims, so both sides were driven fresh on the tree they now live on — harness x2 (209 pack rows REFUSED / 0 EXPLOITED / 0 BOUNDED / 6 honest skips across 19 packs; deterministic pass-for-pass), library rows 48/0/1 each run, contract 310/0, and the strict ci-gate GREEN (whitelist still empty). The drill-down bucket's lands carried through this cycle: vant-migrations 24/24 (slice 4 retired test/migrations.test.js whole), vant-state-wiring 30/30, vant-carriers 39/39 (test/carriers.test.js retired whole), vant-spine 16/16 and vant-leisure 6/6 (both native suites retired whole), vant-brain 19/19 (unit+guests rows; native at its 29 unmeasured seams). Same-cycle edge deepening rode the same stamp: vant-relay extended to 19 rows (caps + events door rows over the relay-edge arm; x2 green) and vant-home's scheduled-door row landed (6/6 x2). Every Phase A bucket's S-counter HOLDS with the claims now stamped on the current count.

**Phase A S-counter restamp 2 (2026-10-27, day-end, the dashboard surface closed):**
the morning restamp rode the post-retirement tree; the same day then converted the
dashboard's remaining wire surface in three batches (the dashboard's OWN relay
flavor: api/r/relay.ts bridge-intent lane + HMAC lane + keyless seal last mile +
caps page; then the small doors: audit, users, properties, breakers + the MCP
forward trio) — vant-dashboard reaches **19 rows across four batches**, x3
deterministic at the run root (14/14 x3 then 19/19 x2), and every door in
web/dashboard/functions is now graded by a pack row. The closing day-end cycle:
harness x2 (218 pack rows REFUSED / 0 EXPLOITED / 0 BOUNDED / 6 honest skips,
pass-for-pass identical), library rows 48/0/1 each run, contract 319/0, strict
ci-gate GREEN (whitelist still empty), and the FULL native floor under the sweep
harness in six chunks: 222/222 suites green — with the sweep's three honest
findings landed same-pass: test/atomic-writes's structural pin caught
lib/backup-staleness writing a raw final-path writeFileSync (routed through the
shared atomic helper, 13/13), the hash-canon grep gate caught lib/kernel
journaling direct sha256 digests (routed through the one lib/hash door,
29/29; kernel's own 69 pins green byte-identical), and the e2e-grand-tour clone
child now carries its OWN throwaway GIT_CONFIG_GLOBAL for the cloud worktree's
dubious-ownership guard (18/18; environmental, not a code defect). The
wire-surface buckets' S-counters hold with the dashboard surface stamped
end-to-end.
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

## The no-DB-recursion battery (v0.8.6, #249 - 2026-10-26)

The reveal-shaped battery: **nothing in the addressing/tracking surface
may resolve by unbounded recursive descent.** A cross-cutting law, one
pack (`public/vant-recursion-wall`, 3 rows) driving the real modules
in-process — no sockets, no run-root arm.

- **The wall fix landed same-pass:** `lib/trace.js`'s waterfall renderer
  recursed once per generation with NO depth bound — `render(spansIn)`
  accepts arbitrary arrays, so a 10k-deep parent chain RangeError'd the
  stack from INSIDE the tracker's own reader (a crash-shaped hole; no
  native trace suite existed, so the pack rows are primary coverage).
  The renderer is now depth-capped (small bounded constant, cap
  declared in the marker) and cycle-marked: loud, fail-closed, honest
  trees byte-compatible.
- **The unified guard's contract is pinned** on the same battery:
  in-budget nests open cleanly, the past-budget nest refuses typed
  (`max_depth_exceeded`) with exactly the loud `recursion:depthExceeded`
  receipt, and `release()` hands the budget back — typed, receipted,
  re-openable, never sticky.
- **Cited walls kept, not duplicated:** the knowledge-links BFS cycle
  cap lives in vant-brain (`knowledge-links-cycle-safety`), the canvas
  bootstrap chain is loop-bounded by maxDepth 10, and every loader
  guard (sync/mcp/islands/compute/search/event/agents-delegate) carries
  its typed refusal natively under the unified guard.

All 3 rows EARNED `REFUSED` ×2 deterministic at the run root on landing
(2026-10-26); packs:lint censused 179 ids across 17 packs same-pass.

## Relay battery slice 2 — the REAL wire lands (v0.8.6, #249 - 2026-10-26)

`public/vant-relay` reaches **17 rows** (5 edge + 5 lib + 7 wire). The
wire rows mount the ACTUAL relay route in-process (`relay.mount({port:
0})`) and grade it over real loopback HTTP — sockets yes, run-root arms
no. Every native relay wire family is graded now:

- **HMAC lane + transport replay** (unsigned 401 / wrong-sig 401 /
  correct raw-body HMAC into the 200 ack / identical bytes 409)
- **the full hop** over a REAL local upstream — http-downgrade refused
  typed in public posture, upstream sees ONLY the ct (no plaintext, no
  gate secret), the canon is 4 parts
- **the ride core** — nonce-bound re-seal, bearer teleported inside the
  envelope, gate never leaks to the door; transport 409, inner replay
  `E_RIDE_REPLAY`, ctx-less `E_RIDE_DECODE`, wrong key decodes to NOTHING
- **body cap + liveness counters** — the 1 MiB cap 413s on the wire and
  the ride counters count what the face did (served/replayed/decode-
  refused measured against the real wire)
- **sender seam + bridge families** — relay.send end-to-end over sockets,
  relay.sync lands as brain_write, bent payloads `E_RIDE_DECODE`, unknown
  families `E_RELAY_UNKNOWN_EVENT`
- **the sealed lane** — keyless ride, both-key verify set (armed at
  MOUNT — the snapshot law), wrong/stale seals 401, seal-sig dedupe 409
- **the traveler carrier** — tr/1 rides, lands id-named through the
  door's brain_write slot, bent packets `E_TRAVELER_STEP`, unknown
  versions `E_TRAVELER_SCHEMA` on the SAME lane

17/17 `REFUSED` ×2 deterministic at the run root; native
`test/relay.test.js` 61/61 green alongside under the
reverse-verification law. Drive-mechanics lessons kept in the rows: the
envelope is composed and signed ONCE (identical-bytes replay), the seal
verify set arms at MOUNT, `hopsServed` counts a real forwarded hop only,
and the sender's loopback dial rides the native `insecure` opt.

## Brain battery batch 2 — the unit families land (v0.8.6, #249 - 2026-10-26)

`public/vant-brain` reaches **16 rows** (9 security + 7 unit). The unit
rows drive lib/brain + lib/format directly in-process (loadLib house
pattern, no routes, no arm) and grade the module's OWN surface:

- **module surface + paths** — load/loadCorpus/getPipeline + both
  model-path resolutions + the corpus list
- **mode switch + the pipeline chain** — setMode flips for real; the
  chain is MODE-SCOPED and holds HANDLER NAMES (addMiddleware(mode,
  name[, pos]) / removeMiddleware pair, no ghosts — the real API, not
  the native pin's function-shape guess)
- **alias law** — create → resolve-to-target, non-alias passthrough,
  enumerable surface
- **neurons** — brainNeurons' shape, fireSynapse counting, predictNext
  along the traveled edge, attend() exact score, UNKNOWN brains score
  exactly 0 (no phantom attention)
- **stack laws** — getStack includes the ACTIVE brain, pushBrain takes
  the top, switchBrain moves top + currentBrain TOGETHER, brainMode is a
  closed enum (silo/shared/governance; bogus refuses) — all mutations
  restored, fixture self-seeded create-if-missing
- **multi-format read/save** — absence is null (never fabricated),
  saveFile roundtrips through loadFile (relative paths, security-checked)
- **format module** — strict extension filtering, getBrainName
  stripping, DEFAULT_EXTENSIONS set, listing confinement (no /etc
  escape), invalid path → EMPTY list

16/16 `REFUSED` ×2 deterministic. RETIREMENT AUDIT (2026-10-27): with
the brain battery's two batches plus the guests rows measuring the
whole surface the unit suite pins, `test/brain.test.js` (77 pins)
trimmed to its UNMEASURED seams — the state seam (getNeuronState/
saveNeuronState sync+async), the handler registry, metrics, version,
module integrations (`getModule`/`get`), `getPipelineState`'s shape,
`hasBrain`/`listBrains`/`brainDirs`/`loadStackCorpus` and
`brainSaveNeurons`: 29 native pins, 29/29 green — the covered
families (surface/paths, mode+pipeline chain, aliases, neurons, stack
laws incl. the axolotl fixture seeds, multi-format read/save, the
format module) retired whole to these rows.

### The evolution census (2026-10-27) — the lib inventory, largest cluster converted

The lib inventory census (126 exported keys crossed against every row)
named the brain's largest unmeasured cluster: the EVOLUTION-CONTEXT
family (startEvolutionSession / recordChange / recordInsight /
getEvolutionSession / getEvolutionChanges / getEvolutionInsights /
endEvolutionSession / getEvolutionHistory — 8 keys, zero rows). The
slice lands `brain-evolution-session-lifecycle` over a FIXED lifecycle
census child (`brain-evolution` route, fresh module, sandbox tree):

- a start seals the layer stack + EMPTY ledgers with the caller id
- records land on BOTH the session and the side lists (2 changes + 1
  insight verbatim, never dropped, never re-counted)
- the list getters hand COPIES (a mutated return never touches the
  lib's own state)
- end seals endTime + a non-negative duration and ANSWERS the summary
- the session lens resets to null after end; the history reads the
  landed session back (lastSession + the last insights), with the
  honest EMPTY history before the first ever session

1/1 `REFUSED` ×2 deterministic (vant-brain live verdict 22/22 the same
day).

### The geometry + backup census (2026-10-27) — clusters 2 and 3 convert

Two more census clusters landed the same day, on the same census-child
pattern (`brain-geometry` / `brain-backup-image` routes, fresh modules,
sandbox tree):

- **`brain-geometry-nsc9-address-family`** (6 keys: geoLoad/geoStore/
  geoList/geoBrains/getGeometryPath/resolveBrainPath) — the per-brain
  path pins to `models/private/vant/geometry`, the NSC9 barcode is
  DETERMINISTIC per brain+key (same key = the same 9-facility-
  sequence-checksum address; different keys = different addresses,
  collision-free), the round-trip reads the payload back THROUGH the
  quasicrystal addressing (geoLoad serves the whole storage record —
  address fields + the payload at its recorded slot; one envelope law,
  graded as it actually rides), an absent barcode answers the honest
  miss record (the wrapper passes the record verbatim, so the miss's
  named error may ride inside the envelope — never a throw, never
  fabricated data), and geoList/geoBrains enumerate honestly.
- **`brain-stego-backup-trio-honest-refusals`** (3 keys:
  backupToImage/restoreFromImage/listBackups) — the census verdict
  landed as THE ROW: the trio acts today as a TYPED-REFUSING STUB.
  backupToImage refuses typed VAF_REQUIRED_FIELD on every call (the
  wrapper is one arg behind its stego delegate — no fake backup, no
  silent success), a foreign container path rides the path wall typed
  (SECURITY_PATH_TRAVERSAL), a models-local absent raster answers
  typed absence (STORAGE_NOT_FOUND), and listBackups answers the
  honest empty roster. NOTHING fake crosses the backup door; the
  wiring gap is ON THE LEDGER (the stones/backup lane is the real
  brain backup surface; the trio stays a stub until properly wired).

Both rows `REFUSED` ×2 deterministic (vant-brain live verdict 24/24.
contract 331/0, lint clean). Remaining census clusters: crate/dropbox
(~15 keys), the load-circuit breaker (5), remote/watch/cache (9),
bootstrap/shutdown + framework config (7).



### The lifecycle census (2026-10-27) — bootstrap/shutdown + framework config

`public/vant-brain` reaches **23 rows**. The last unmeasured brain cluster
(7 keys: onBootstrap/bootstrap, onShutdown/shutdown, and the framework
config trio) converts as `brain-lifecycle-framework-laws`:

- a hook registered through `onBootstrap` RUNS during the real bootstrap
pass (the module-load hooks — neuron restore + lessons restore — ride
along), and the metabolism tick legitimately rides boot's timer
registry: `brain.metabolize` is registered by bootstrap
(`unregisterTimer` answers true) and is stoppable (an honest false on
re-stop) — no bare-interval timer leak holding the event loop;
- a hook registered through `onShutdown` RUNS during the real shutdown
(watcher close + hook loop, which the census slice before this one made
crash-safe on a fresh module);
- the framework-config trio holds: an unconfigured brain answers the honest
`{mode:'dual'}` default, `setBrainFrameworkConfig` acks true and
`getBrainFrameworkConfig` answers the config verbatim (extra keys
riding) for the CURRENT brain, and `getStackFrameworkConfigs` maps
brain-by-brain over the stack roster with `source:'stack'` and the
honest `{mode:'dual'}` default for brains without their own config.

With this cluster, the README's brain census list has no unmeasured
cluster left — every inventory census cluster named on the battery's day
(targeted surface, evolution, geometry, stego-backup, crates, breaker,
remote/watch/cache, lifecycle) now carries a row.

Pack green ×2 deterministic, contract 335/0 with the row in the EXPECTED
table, eslint clean.

**Retirement audit (same day): the breaker's last native family folded
to the row.** `test/brain-circuit.test.js` (10 pins) pinned exactly one
family the pack row had not yet graded - the half-open probe FAILURE
reopen leg. The circuit census child grew that leg: a poisoned probe at
threshold 1 executes the wedged machinery and its real failure
RE-OPENS the breaker with a fresh `openedAt` and the probing flag
consumed - the next call short-circuits typed again, window frozen at 0
so CI jitter cannot burn it (grade fields
`probeReopen`/`reopenShorted`). With the row covering every pin, the
native suite retired WHOLE (the carriers precedent) - the
probe-on-failure family lives in the pack row now. One herd note kept
in the child: the failure probe rides a UNIQUE never-cached name -
`circuit-seed` was already cached by the success probe's earlier leg,
so a seeded name would "succeed" from the cache without touching the
machinery and close on a lie. Pack green x2 (vant-brain and
vant-state-wiring), contract 336/0, eslint clean.

### The market inventory census (2026-10-27) - the scope/cancel/bid cluster

`public/vant-state-wiring` reaches **31 rows**. The fresh wire-survey
read first: every door this campaign ever named is ARMED (all ten packs
green on the post-census tree, contract 335/0), so the growth axis is
depth - and the next depth is the **market**'s unmeasured inventory
cluster. `market-scope-visibility-and-cancel-matrix` lands as the
module's first census row, riding a dedicated `wiring-market-census`
census child (fresh module, cleared market), with THREE live fires the
probe-first pass earned and fixed same-pass in `lib/market.js`:

- **the scope create-gate silently widened** - `market.list` gated
  scopes with normalize()+null-check only, but scope's documented rule
  is "create paths REJECT" (lib/scope isValid): an owner-less object
  (`{visibility:'private'}` with no owner) normalized to
  `{owner:null, visibility:'public'}` - a private-intent listing
  silently became public. The gate now rejects malformed AND owner-less
  shapes typed `E_SCOPE` (nothing stored); every legit agent/org shape
  stores exactly as before.
- **the bid door carried the unfixed twin of list()'s known
  undefined-persist bug, twice over** - `description` AND `reward`
  rode `data.*` verbatim, so a description-less or reward-less bid made
  the persisted state non-canonical-encode-able: _persist failed and
  `state/market.json` never existed at all - the WHOLE market map lost
  on restart. Both fields ride the same absent-key=nowhere law as
  list()'s summary now; the restart-survival leg grades the disk tree
  KEEPING the earlier listings after such bids report.

The graded laws: the scope gate (both irrational shapes typed, zero
rows stored), the scoped-membership visibility triad (search invisible
to non-members, GET unseen-not-404, stats serves counts with the id
views stripped from every non-member index while the member keeps the
useful index view), the scope-refused trade (`E_SCOPE`), the
cancelTrade authorization matrix over a REAL debited completed trade
(unknown id / not-a-party / already-completed, each its honest
envelope), the bid consent gate (governance refusal typed, never
silent), and the restart-survival persist law.

Pack green x2 deterministic (90 green rows both cycles), contract
336/0 with the row in the EXPECTED table, native market suites unmoved
(22+23+4 pins green), eslint clean.

**The skills-gate census (same pass): `market-skills-gate-and-lifecycle-laws`
lands as the cluster follow-up.** The gate OFF inerts ALL SIX skills ops
(listSkill / buySkill / deliverSkill / settleSkill / skillStatus /
skillSweep) typed `E_SKILLS_DISABLED` — inert, never absent, never a
throw; the ON gate carries the kind boundary (any non `text|code`
payloadKind refuses `E_SKILL_PAYLOAD_KIND` with the declared why), the
role walls (the buyer cannot deliver), the delivery hash law (real
sha256, 64-hex verbatim), the settle discipline (bad decision typed
`E_SKILL_DECISION`, the identity anchor demanded `E_SKILL_IDENTITY_REQUIRED`,
the buyer-only confirm settles with the trust feed written), the
on-demand sweep answers, and the gate flips honestly both ways. The
child rides the SAME census route; pack green x2, contract 337/0 with
the row in the EXPECTED table, lint clean.

### The tools-registry census (2026-10-27) — vant-mcp's inventory row

`public/vant-mcp` reaches **4 rows**. The reverse-verification read
named the registry itself as the unmeasured cluster (the three prior
rows grade execute's refusals, schema, and scope — nobody graded the
ROSTER). `tools-registry-census` lands on a dedicated
`mcp-tools-census` child with a REAL find fixed same-pass in
`lib/mcp.js`: **the `vant_call` by-name handoff called
`tool.handler(args)` directly, re-opening the P1 #14 decorative-schemas
bug class for every registered tool at once** — `brain_write` accepted
a content-less call through it and LANDED an empty-content note. All
three door faces (execute / call / the by-name handoff) now ride ONE
hoisted validated executor (`_executeTool`): rules gate -> registry
lookup -> declared inputSchema -> handler.

Graded laws: the roster (347 entries, deterministic call-over-call,
every entry carrying name + description + inputSchema), the safe-call
door (unknown names AND non-registry module identifiers refuse typed
with the roster named — no arbitrary require), the handoff schema gate
(content-less `brain_write` answers `MCP_INPUT_INVALID` naming the
missing param, nothing lands), and the honest call running the REAL
tool onto the disk verbatim.

Pack green x2, contract 338/0 with the row in the EXPECTED table,
native mcp suites unmoved (test/mcp 34 + mcp-schema 13 green), lint
clean.

### The remaining REST doors + the market-skills audit verdict + the fresh survey (2026-10-27, the depth pass)

`public/vant-rest` reaches **9 rows**. `rest-remaining-doors-parity`
lands the TEN door-table routes the args-parity row left (streams
list/create, brain state/ls/save, trust record, market list/bid/trade/
get), grading the same law (domain answers throughout, never the arg
gate, never the registry gate, never 5xx) with the loop closed both
ways (the listing the DOOR creates is gettable through the door; its
trade rides the tool's own domain answer). The probe-first pass earned
a REAL find fixed same-pass in `lib/mcp.js`: **`brain_save` was dead on
arrival** — its handler fed `brain.write('', key + '.md')` an EMPTY
category, so VAF refused EVERY name typed `Invalid category/key` while
the sibling `brain_write` landed the same body fine. The tool now rides
the same single-segment seam (active-brain root, one validated path
segment, the .md rule); a hostile `../evil` name refuses typed.

Pack green x2, contract 339/0, lint clean.

**The market-skills trim audit (reverse-verification, honest
outcome: ZERO pins retire).** The skills-gate pack row measures the
gate cluster it claimed (off-gate inertness, kind boundary, role walls,
hash law, settle discipline, sweep); the native suite's other 22 pins
cover the breadth the row does not — delivery-refusal shapes, sweep
evidence rules, TTL clamps, shill-rep weighting, the MCP door verbs,
config mounting, and the QC pass-204 guard family. The suite keeps its
full 23 green native; the rows add coverage without replacing it.

**The fresh wire-survey read (next surfaces, honestly named):** every
door this campaign named stays ARMED and the door tables are now FULLY
measured (REST 19/19 routes across the two parity rows; market
list/bid/trade/state doors through the remain-doors row). The next
growth surfaces, in census-cluster shape:
- **the API object's own layer** (`lib/api.js` execute/read/write +
  the memoryState/recall/learn/query doors + the dropbox pairs) — the
  rows grade the MCP-carrier doors, not the API object's methods;
- **the crew door inventory** (`lib/agents.js` spawn/delegate/kill/
  protos + `lib/crew-bus.js` beyond the quota trio — mostly
  native-covered today, the run-root arm can grade the door verbs' invariants);
- **`lib/teams.js` orgchart depth** (largest unmeasured lib facet by
  raw size, broadly native-covered).

**lib/lib/crew does NOT exist in the repo** (checked: no such path, no
reference anywhere) — that name was a chat-summary typo only, never a
code defect.

### The api-object census (2026-10-27) — the API object's own layer

`public/vant-rest` reaches **13 rows** (9 + the four census rows): the survey's largest growth cluster
(the `lib/api.js` execute/read/write object + the memory and dropbox
families) converts as the `api-layer` census child, fresh module ladder ×2
green (all 17 rungs true both cycles, contract 343/0, lint clean):

- **two live finds, fixed in the same pass**:
  1. the generic `execute` door rode a `getFramework().execute` that
     `lib/vant` NEVER exports — even an AUTHENTICATED caller escaped a raw
     TypeError. Function ops now run direct under the pipeline mode chain
     (the documented shape); tool ops answer through the ONE validated
     executor (`lib/mcp.execute`), so missing args and unknown names
     answer the typed gate (`MCP_INPUT_INVALID` / `not found`), never a
     crash.
  2. `getAuthStatus`'s `authFailures` counter was dead state — `authenticate`
     mapped the verdict but never counted. The failure counter is now
     faithful (ticks on wrong attempts; `locked` has a signal again).
- **the auth ladder law**: with NO key configured, an auth-REQUIRED door
  fails closed (the #189 accept-all honesty holds on the API object too);
  bare/wrong-key calls refuse typed `AUTH_DENIED` even with a key
  configured, EVERY caller including the auth status reporter rides the
  same wall; the not-required dev door still OPENS and answers typed;
  the authed rung runs the REAL layer (write lands on disk, the same door
  carries the read back verbatim).
- **the family census**: memoryState/recall round-trip exact, learn/query
  exact + miss null, the shared dropbox closes its loop on a typed
  `not found`, the private myStuff dropbox lands inside `models/tmp-space`.
- **the filed seam is LANDED (same-session seam pass):** the duplicate
  `brain_load` registrations had the LIVE schema accepting `brains` as
  string OR array while the handler fed any array straight to the
  single-name loader — an array of names silently answered null. The
  array arm now fans out per-name through the SAME loader (misses answer
  null IN their own slot, never a silent whole-roster bail; the string
  form rides the loader verbatim). The `vant-mcp/tools-registry-census`
  row grades the pair-law live (vant-mcp 4/4 REFUSED x2, zero findings).
- **(census-hardened from fire 1's honest fail)** the unknown-tool refusal
  law rides a normalized plain-string check: the roster fires through
  `error: 'not found'`, and template-literal cooked text is where regex
  backslashes go to die — the child measures the ANSWER, never the spelling.
### The crew-doors census (2026-10-27) — the door inventory beyond the quota trio

`public/vant-crew` reaches **4 rows**: the survey's named growth surface
(the `lib/agents.js` spawn/delegate/kill/protos inventory + `lib/crew-bus.js`
beyond the quota trio) converts as the `crew-doors` census child, fresh-module
ladder x2 green — **28 rungs true both cycles** (contract 343/0, lint clean):

- **live find, fixed in the same pass**: the approval verbs acked work that
  never existed — `approve`/`reject` (and `signOff` riding `approve`)
  returned `approved:true`/`rejected:true` receipts for UNKNOWN work ids
  while their siblings (`completeWork`/`retry`/`escalate`) refused the same
  ids typed. Every ack is now GROUNDED in the stream's answer: unknown work
  answers the stream's typed refusal (`Work not found: id`), never a
  receipt.
- the gate verbs keep their own honest shapes: unknown `get` answers
  undefined, `pause`/`resume` typed `Agent not found`, `kill`/`terminate`
  honest false no-ops, `prune` honest zero-count with the persisted flag;
- the work verbs refuse unknown ids typed (`delegate` Agent not found,
  `pollWork` E_NO_WORK, `completeWork`/`retry`/`escalate` Work not found);
- the protos loader lists empty rosters honestly and `loadProto` of an
  unknown answers null (no throw escaping);
- the crew bus refuses typed in BOTH postures: unconfigured, every door
  rides the `CONFIG_MISSING` wall (send/broadcast/registerNode); configured,
  the URL/name validations answer `INPUT_VALIDATION_FAILED`, the roster +
  status projections carry NO pair secret, unknown sends answer
  `NOT_FOUND`, broadcast returns per-node attempt results (the sandbox
  network gate reads as ok:false per attempt, honest, never a crash),
  `removeNode` returns true-for-real then false-for-unknown, and the
  receiver version gate refuses a bogus version typed.

### The teams-orgchart census (2026-10-27) — the orgchart depth pass

`lib/teams` was the largest unmeasured lib facet by raw size. The orgchart
depth pass converts as a NEW pack, `public/vant-teams` (20 packs now), with
the `teams-orgchart` census child, documented-call-shape ladder x2 green —
**27 rungs true both cycles** (contract 344/0 + the census contract entry,
lint clean):

- **no live repairs needed**: the orgchart is honest end-to-end over the
  DOCUMENTED shapes — `createOrg(name)` (dup → `E_DUPLICATE`, bad name →
  `E_INVALID_NAME`, ghost update → typed), the parent-first convention
  binding dept→org and team→dept exactly, `createRole(name, { team,
  permissions, chain })` storing both fields verbatim, role-scoped
  `hasPermission` exact (granted true / missing false / ghost false), and
  the chain table listing its stored chain;
- **the agent-side `can()` law closes**: direct grant true, chain-walk true
  through the stored chain, missing capability false, unknown agent false —
  and the **CRITICAL-permission trust floor holds**: `canDeploy` needs 0.6
  trust, the fixture agent answers the 0.5 neutral default, and the role's
  grant is withheld by the trust guard (the role grants, trust withholds);
- **the assignment round trip is verbatim**: the record carries
  agentId/role/brain exactly, `getAgentBrain` round-trips the mapping, and
  `unassign` removes it with the permission dropping false after;
- **the ghost vocabulary is honest**: `listTeams` resolves dept refs (an org
  ref answers the empty roster — its documented filter), ghost
  delete/update refs answer typed, a ghost PARENT-first ref rides the
  documented exact-hit-only reorder (reinterpreted as the name, the dept
  still binds a real org), and the explicit ghost-org form refuses typed.
- **census methodology note**: the first two probe passes refused to close
  until the documented call shapes were respected — three distinct
  signature conventions exist across `create*` verbs (name-only /
  parent-first positional / name-first-with-options), and `assign` takes a
  string agentId (the F-7 guard refuses object-shaped ids typed). The
  census ladder now verifies the documented API exactly as its callers
  should write it.

### The fresh wire-survey read (2026-10-27) — every door armed, honest verdicts

Inventoried live: `web/dashboard/functions` (auth trio request-otp/
verify-otp/session riding the armed vant-login/me/logout ladder; users,
mcp exec/tools/events, r/relay, capabilities; the small-doors batch
properties/breakers/audit/users), `web/home/functions` (summary, admin,
scheduled — the Edge-trio rows), `web/relay/functions` (r/relay,
capabilities, events — the relay-edge arm), `web/kit` (no functions yet —
a future frontend placeholder). Verdict: **every wire door across the
four web surfaces is ARMED and measured today** — the small-doors batch
closed the dashboard gap, the home trio and relay-edge arms carry their
apps, the session ladder grades the auth trio.

Honest growth candidates, as they name themselves:
- [LANDED 2026-10-28] the `web/kit` CONTRACT law grew its census slice
  BEFORE its doors (the 21st pack `vant-kit`, two rows: the contracts
  census + the vendoring-ring census) - the first-doors law stays the
  name for any DOOR-flavored rows when functions/ actually appears;
- the Edge chains' shared QoS budget behaviors over REAL multi-cycle
  conversations (the 429-skip law already lives; deeper W1/W2 windows if
  any new door uses its own budget);
- [CLOSED 2026-10-28] the spine slices #164–#166 standing drill-down
  pair: all three named facet groups carry in the slice-2 rows (mesh
  AOI/stale-purity/write-winners in `mesh-aoi-staleness-and-write-winners`,
  PRF addressing in `geometry-prf-one-chain` + `spine-addressing-one-module`,
  brain verify + horcrux in `brain-verify-and-horcrux`), the native
  `engine-parity-spine` suite retired whole, and the spine pack still
  answers 16/16 REFUSED x2 on the post-census tree - the pair is
  measured; deeper drilling from here is whatever NEW surface the
  campaign wires, not the old facets.

### Restamp 5 (2026-10-27) — the full floor re-swept after the five-tranche run

Five tranches landed since restamp 4 (the api-object census + its two live
fixes, the brain_load seam, the crew-doors census + the grounded-ack fix,
the teams-orgchart pass, the survey read), so the whole campaign floor was
re-swept on the final tree, x2 deterministic:

- **full packs x2 green**: 244 pack rows REFUSED / 0 EXPLOITED / 0 BOUNDED
  / 0 skipped (cycles 3+4), library rows 48/0/1 both cycles, **contract
  350/0**, strict ci-gate GREEN (contract table + real harness clean);
- **native floor: 203/203 suites green** (a–m 107 + n–z 96; 0 failed, 0
  timeouts);
- **one honest repair, surfaced by the sweep itself and fixed same-pass
  (the fresh-fixture law)**: the teams census was not idempotent across
  fires in a shared run-root sandbox — fire 1 persisted
  `models/private/<brain>/orgchart/teams.json`, and fire 2 graded a dup
  cascade (census-org pre-existing → every create-dependent law false).
  The census child now DRAINS its persisted roster before loading the
  module, so every fire grades the orgchart from zero — twice-in-one-
  sandbox verified: 0 falses both fires, and the full-run cycles went
  green on the re-run;
- the debug tees that the diagnosis used are removed; the committed diff
  carries only the drain fix + the restamp entry.


### The remote/watch/cache census (2026-10-27) — the 9-key cluster

`public/vant-brain` reaches **22 rows**. The remote tunnel + watcher +
cache cluster converts as `brain-remote-watch-cache-laws`:

- the remote URL pair round-trips and an empty reset answers honestly;
- the remote-mode load is REAL — the census child spins a localhost
http server answering `brain/remote-seed.json`, `setMode('remote')` +
`load('remote-seed')` serve `REMOTE-CENSUS-PAYLOAD` verbatim with
`source:'remote'`, then the honest defaults restore (mode dual, URL empty);
- the cache laws hold end to end: verbatim serve, REAL hit accounting
(`_metrics.cacheHits` ticks), the TTL window keeps the cached truth
against disk drift (an out-of-band disk rewrite still answers the cached
V1), `invalidateCache(name)` answers the FRESH disk read, `getCacheStats`
carries `{size, enabled, ttl, entries}`, `setCache(false)` honestly flips
enabled, and `invalidateCorpusCache()` answers without faulting;
- the watcher public toggles hold both ways (the fs.watch handle is
closed by the real `shutdown()` path so the census.child drains its
loop honestly).

**LIVE FINDING (fixed in the same pass)**: `brain.shutdown()` crashed on a
FRESH module — `_cache.clear()` was unguarded while `_cache` is lazy
(`null` until `getCache()` ever runs), so a fresh-install shutdown died
with `Cannot read properties of null` BEFORE its lifecycle hooks ran.
The guard is in; the row's run caught it the same way the crates row
caught the codes-table gap.

Pack green ×2 deterministic, contract 334/0 with the row in the EXPECTED
table, eslint clean.

### The load-circuit breaker census (2026-10-27) — the P3 #34 family

`public/vant-brain` reaches **21 rows**. The breaker cluster (5 keys:
getLoadCircuitStatus / resetLoadCircuit / the `_set*` DI pair + load()'s
short-circuit) converts as `brain-load-circuit-laws`, graded over a REAL
wedge fixture — a poisoned CRITICAL pipeline handler (the documented
failure path #1) fed through `brain.register('vaf', thrower)`:

- the fresh-module status shape is CLOSED/zero-failures with the env
tunables visible; graceful null misses (3 consecutive absent loads)
NEVER feed the breaker; consecutive THROWN loads open it at threshold —
state OPEN, `openedAt` set, `lastError` named, the
`brain:load:circuit:open` event fired, and `_metrics.errors` incremented
(the dead-telemetry audit finding is what this family exists to keep
alive); every subsequent load — including innocent names — fast-fails
with the TYPED retryable `BRAIN_CIRCUIT_OPEN` carrying
`details.failures`, the wedged machinery untouched; `resetLoadCircuit()`
answers the honest `true` + CLOSED/zero restore; the half-open law rides
the DI reset window: after it elapses ONE probe load passes through the
healed machinery — its success (REAL content; a null miss never records
success) closes the breaker, the `brain:load:circuit:halfOpen` event
fired on the probe hand-off; and the `_setLoadCircuitThreshold(null)`
return law restores the env/default threshold (5).

The typed chain refusals (a hostile name's `SECURITY_PATH_TRAVERSAL`)
throw BEFORE load()'s breaker-fed try block, so they never feed the
breaker — that non-feeding is on the measured ledger too (the census
read probed it and graded it honest: caller-input refusals are not
machinery failures).

Pack green ×2 deterministic (48 REFUSED / 0 EXPLOITED / 1 skipped each
cycle), contract 333/0 with the row in the EXPECTED table, eslint clean.

### The tmp-space census (2026-10-27) — the crate/dropbox cluster

`public/vant-brain` reaches **20 rows**. The biggest unmeasured cluster
(~15 keys) converts as `brain-tmpspace-crate-stash-handlers`, graded in
the EXPECTED table (skip arm): hostile names answer the honest error
records in BOTH crates (`{error, name}` — never a throw, never a
half-write), both crate round-trips hold verbatim (save/read/list/
delete + honest `not found` absence), the stash lifecycle stamps +
reads + clears honestly (`{cleared: true}` object shape), the handler
registry registers stream+message, reads back, and clears to the null
shape, the shared dropbox rides its own round-trip and enumerates
NOTHING after clear, and the personal-file write lands CONFINED in the
brain's own tree — the hostile key refusing typed.

**LIVE FINDING (fixed in the same pass)**: the hostile-key row
answered `{ code: 'UNKNOWN' }` — `errors.CODES.VAF_PATH_BLOCKED` was
MISSING from the codes table in lib/error.js. Five call sites request it
(brain `updateMyStuff`/`switchBrain`/`switchCurrent`, remote naming), so
their typed refusals silently degraded to UNKNOWN while file.js and
brain-lock.js (literal string) always worked. The table now carries the
name; the row grades the typed wall `VAF_PATH_BLOCKED` and the two
hostile-listing calls answer it typed as well.
### Guests battery (same pass) — the lib lifecycle converts + the trim

`public/vant-brain` reaches **19 rows** (9 security + 7 brain-unit + 3
guest-lib rows; the live 2026-10-27 verdict is 22/22 with the listing
family row and the evolution census below). The guests rows drive lib/guests against a THROWAWAY
brain's ledger in-process (containment contract graded; module-reload
trick for the reload-survival leg):

- **token lifecycle** — vguest_ shape + ONE raw secret, clean
  projections (no hash ever leaves the ledger), exact-vs-tampered /
  unknown / wrong-prefix verifications, sha256-at-rest, instant revoke
  by id (denylist, survives reload), honest double-revoke no-op, and
  the expiry window kills the token while its row remains
- **caps + trust + door classes** — the closed role vocabulary
  (observer read-only / human +spawn −exec / agent +exec), trust
  RESTRICTS only (medium keeps, low strips exec+spawn, none caps agent
  to read), and authorize() classifies honestly: unknown = write
  fail-closed, spawn-class checks canSpawn against the trust floor,
  exec stays peer-only, guest management = E_GUEST_ADMIN for EVERY role
- **pairing voucher** — 'vhpair-*' voucher seats, hash-only at rest,
  honest mismatch refusal, one human-role redemption with the pending
  row consumed, second use refuses (voucher, not credential)

19/19 `REFUSED` ×2 deterministic. THE TRIM (same pass): the native
`test/guests.test.js` retired its 11 covered sync-lifecycle pins
(40 total → the door-integration socket families' 14 pins remain:
real-MCP exec, the pairing-redeem channel-key binding, the CS
cross-tenant channel door — those ride REAL sockets and stay native
under the reverse-verification law, 14/14 green).

## Engine-parity-spine battery slice 1 — the state core lands (v0.8.6, #249 - 2026-10-26)

New pack `public/vant-spine` — **7 rows**, each driving the real lib
modules (state core, storage spine, capability posture) directly
in-process against throwaway tmpdir brain-spaces. No route arming
needed; every row holds REFUSED in every sandbox. Native
`test/engine-parity-spine.test.js` (70 pins, 7 families) green
alongside under the reverse-verification law:

- **canonical bytes** (#149) — the keys-order law (identical values,
  different key order = identical canonical bytes), 17 corpus cases
  roundtrip byte-exactly, forbidden values (undefined / function /
  bigint-in-the-wrong-lane) refuse typed, and the schema/path-prefix
  separation holds
- **tree laws** — put identity, LWW over equal-ts calls, two-entry
  diff, verified stale-apply, truncated-refusal, and the bounded
  deterministic snapshot
- **scope grammar** — coarse defaults to main, world scope splits,
  sibling scopes isolated at read AND snapshot, stamping rides the
  payload (the #226 mint-side retarget leg rides the same row shape)
- **fold + cellstore** (#150) — ring-offset/depth laws closed-form at
  every boundary, deep cells refuse to overrun typed, 1000 writes of 10
  distinct facts collapse to exactly 10 cells, and the rebate claims
  without storing bytes (`stored=false`, `firstSpace` named,
  `savings_ratio` MEASURED at the honest 0.5 — on a FRESH store; the
  collapse store's ledger is a different budget)
- **checkpoint recovery** (#151) — a kill mid-stream reproduces the
  pre-kill checkpoint id, snapshot boundaries are deterministic across
  identical logs with the log truncated past the oldest retained
  snapshot, and an UNREADABLE log DENIES recovery typed (never an
  empty-log fresh start)
- **anchor + hotset** (#152) — the anchor ledger stays append-only
  across instance churn; verify compares against the LAST anchor (a
  stale rooted fact honestly diverges typed), a foreign hash diverges,
  an empty ledger refuses ok; the hot set falls through evictions to
  durable store truth past its exact counted eviction cap
- **capability posture** (#162 #163) — a grant persisted in one
  process is honored by a FRESH instance, no-ledger denies reason
  'none', expiry is honest, revocation enforced, the grantor is
  mandatory, unreadable ledgers (grants AND WAL) DENY typed, ABSENT
  stays a typed API value (never null), and sandbox can() degrades to
  a boolean with no grant ledger around

7/7 `REFUSED` ×2 deterministic; EXPECTED armed strict. Two honest
repairs in-pass: the rebate legs now grade their own fresh store (the
1000-write collapse ledger poisoned the first attempt), and the anchor
verify row speaks the real semantics — verify compares to the LAST
anchor, so a stale rooted fact is the divergence case, not a hack.
Remaining spine families (mesh/brains #164-#166: AOI filter, stale
purity, deterministic write winners, spine PRF addressing, brain
verify + horcrux) charged for slice 2.

**Slice 2 (2026-10-27): GEOMETRY, WORLD/CLOCK, MESH/BRAINS (#154-#166) —
the rest of the spine converts.** Nine rows on the same house pattern
(real lib modules directly in-process, tmpdir fixtures fresh per drive,
no wall clock in a verdict):

| Attack | What it shakes | Status |
|---|---|---|
| `geometry-subdivision-and-facet-laws` | the 1:4 fold law (four distinct children), lossless packed addresses, overflow refuses typed, facet divider holds at the cap | validated - REFUSED |
| `geometry-prf-one-chain` | the shard PRF is deterministic + width-fixed + separation-clean on near seeds, shardUnpredictabilityHolds certified, and BOTH live consumers (fragmenter + GitHub adapter) derive through the ONE lattice-keys chain | validated - REFUSED |
| `geometry-raid-carrier-and-precision` | k-of-k+1 survival (any one lost data OR parity shard recovers exact bytes), a forged shard reported by position AND parity-rebuilt, two lost refuses typed, the precision contract EXACT/APPROXIMATE + 1e-12, the quantizer absorbs last-ulp near-misses | validated - REFUSED |
| `world-clock-seed-chain-and-orbits` | SeedChain deterministic + domain-separated + prefix-folding honest + 10K paths pairwise-distinct, orbits pure at t0 + k-period, degenerates refuse typed, favorability OSCILLATES in [0,1] (the pass-227 bug class dead), nextWindow repeats its answer | validated - REFUSED |
| `state-delta-ledger-laws` | actorless deltas refuse typed, the cleared record keeps its clearing provenance in history, and the same event stream re-derives the SAME ledger hash | validated - REFUSED |
| `spine-addressing-one-module` | addresses re-derive exactly per (space, index) and separate per index AND space, remove-one-consumer leaves the rest byte-compatible, and a shared fact claimed under two spaces stores ONE cell with identical hashes | validated - REFUSED |
| `raid-cells-addressed-and-rebated-through-spine` | RAID claims k+1 cells at 64-hex spine addresses through the CellStore, identical payloads across docs are pure re-claims (measured savings, distinct = k+1), and shard seats ride the ONE spine PRF per (space, index) | validated - REFUSED |
| `mesh-aoi-staleness-and-write-winners` | the AOI filter leaks nothing outside the region, staleness is provable from the injected clock alone (no timers, starve-free revive), the higher epoch wins deterministically and the stale-epoch challenger is RECORDED as rejected | validated - REFUSED |
| `brain-verify-and-horcrux` | the anchored brain verifies, tamper diverges typed, the restored horcrux re-verifies to the SAME forged root, and a dangling file DENIES currentRoot while surfacing bad.md NOT-ok in the manifest | validated - REFUSED |

16/16 `REFUSED` x2 deterministic on landing (#154-#166 fully covered
across the two slices); native `test/engine-parity-spine.test.js`
(70 pins) stayed green alongside through the landing — the whole-file
retirement step follows in the same pass per the carriers precedent
(every family converted; the coverage lives in the pack rows now).

## Leisure battery — the want-list keeper lands (v0.8.6, #249 - 2026-10-26)

New pack `public/vant-leisure` — **6 rows** on the same battery law:
rows drive the REAL lib modules (leisure + tempo + escrow + qos + era +
event) in-process against a THROWAWAY brain's ledger in
`models/private/<brain>/.leisure.json` — the containment contract IS
the graded surface. No route arming needed; every row holds REFUSED in
every sandbox. Native `test/leisure.test.js` (21 pins) stayed green
through the landing cycle and then RETIRED WHOLE to these 6 rows on
2026-10-27 (the carriers precedent — every family the suite pins is
converted; the coverage lives in the pack rows now):

- **want ledger lifecycle** — recording shape (lw- id, zero pursued
  count, honest nulls, the scratch brain named), dedupe keeps ONE
  normalized entry (re-statement = SAME id, preserved pursued-count,
  refreshed note), empty text refuses typed `VAF_INPUT_INVALID` with no
  soiled row, and the ledger file agrees with the status
- **rotation + receipts + forget** — the list is a want-list NOT a
  queue (never-pursued leads the once-pursued; suggest reads the same
  rotation head), fuzzy markPursued receipts land in the history,
  unknown refuses honest, forget works by id AND fuzzy and refuses the
  absent
- **pursue seams + tempo budget** — empty ledger nulls suggest
  honestly; one-shot pursue runs a REAL step through tempo.pace, marks
  the pursuit and reads the rotation top; stretched pursue arms a REAL
  tempo budget keyed to the want (tempo- id, leisure label,
  ledger-budget present) and releases at .end; both paradox pursuits
  (no step fn, empty list) refuse typed with nothing armed
- **breath + dream read-only** — consultBreath is exact 4th-breath
  cadence (off-cadence, breath-0 and empty ledger all honest nulls),
  dreamReview carries the open/aging/oldest/suggestion rollup and nulls
  on an empty ledger, and NEITHER SEAM writes the ledger
- **containment + disk truth** — the ledger never leaves
  `models/private/<brain>/.leisure.json` (hostile brain names cannot
  traverse out), re-require is path-stable and reads persisted disk
  truth (the reload-survival leg)
- **auto-pursue gate ladder (#209)** — seven graded legs onto cap
  truth: default OFF is a SILENT no-op (no budget, no noise);
  enabled-but-providerless refuses LOUDLY via the auto_refused event
  (exactly once); the funded provider arms a REAL budget within the
  window cap with daily usage accruing in the contained ledger; the
  exhausted daily cap, the OPEN breaker and the OPEN era (work
  precedence) all refuse with their honest names; and the token-cost
  step refuses UNFUNDED (before any budget arms), opens explicitly
  funded, and zero-leaks its escrow cleanup

6/6 `REFUSED` ×2 deterministic. Herd repair kept in the pack comments:
the cache-drop is scoped to the STATE-CARRYING modules only (leisure's
mtime ledger + tempo's budgets) — dropping the singleton modules forked
their instances and broke the recursion-wall pack's event receipt (that
exact cross-pack bug, found and closed same-pass). The gate legs pin
the daily cap explicitly: the pack runtime leaked the exhausted leg's
env residue, and the fixed-under-pack residual order-dependence
depended on it.

Retirement note (2026-10-27): with all the day's batteries landed
(spine slices 1-2, leisure, traveler-lib slice 6) the survey's native
backlog is closed — `test/engine-parity-spine.test.js` and
`test/leisure.test.js` retired WHOLE to their pack rows, and
`test/traveler-lib.test.js` trimmed to its real-process CLI family.

## Traveler-lib battery — the working layer lands on vant-carriers (v0.8.6, #249 - 2026-10-26)

`public/vant-carriers` reaches **42 rows** (31 lane families + 8
traveler-lib rows (slice 6), the WIRE seam (slice 7), the MESH
serving wall (slice 8) and the TRAVELERS census (slice 9)). The rows drive lib/traveler DIRECTLY
in-process (+ its real collaborators: event, scope, escrow, mcp, qos,
event-types, security-pipeline) against the REAL brain-scoped pin
store, wiped per row (index + .sha256 pin + travelers/ + current file)
for determinism. `mcp.execute` is the in-process registry call, not
the TCP door (one law: zero sockets). The REAL-PROCESS CLI family
(`bin/traveler.js` open/hop/audit via spawnSync) stays native under
the reverse-verification law — like the guests' socket door families,
it rides a separate process. RETIREMENT: on 2026-10-27 the in-process
families (A-E, G-I) retired whole to these 8 pack rows and the file
trimmed to its 4 real-process CLI pins (F1-F4, green standalone);
`test/traveler.test.js` (26 wire-law pins) keeps riding the wire-side
follow-row for its next family. The pack rows measure:

- **content address law** — same content + same ts = SAME id, ANY edit
  re-addresses with the seq riding, honest packets verify, slot tamper
  refuses typed E_TRAVELER_ADDRESS (ISO 8.5.2: refuse, never rewrite),
  and a forged ledger step breaks the address loudly
- **ledger law + ceiling** — frozen-stamp mismatch, gap-jump and the
  512-step ceiling all refuse typed E_TRAVELER_STEP (shape damage names
  its clause)
- **persistence append-only** — the packet body lands BY ADDRESS under
  the brain-scoped store and verifies at re-load, and a same-id
  re-persist refuses typed (the ledger never re-writes)
- **schema rizer** — tr/0 migrates forward WITH its stamp and the
  migration rides the ledger (an appended rize step); a future tr/7
  refuses typed E_TRAVELER_SCHEMA (never guesses)
- **audit verbatim** — the auditor copy names clause 8.5.2, carries one
  numbered line per station, and states VERIFIED
- **door verbs carried** — traveler_open/hop/status/audit hold their
  contracts, traveler_carry routes the template (built + walk ok) and
  a template REORDER refuses typed E_CARRIER_TEMPLATE (the bill of
  stations is the boulder), traveler_replay walks landing rows
  read-class, and carriers_list serves the honesty roster (nsc9/stone/
  svg/json/qr up; png named-absent with its blocker)
- **OS integration** — the security-pipeline scanner sees traveler
  WIRED through the wall layers with audit adjacency informational,
  refusals are typed VantErrors (zero raw throws), persistence is
  audible on the shared event bus, the QoS door lane rate-limits typed
  (E_TRAVELER_RATE past the bounded 6200-burst), and crew/team
  attribution rides the ledger
- **identity + durability** — a scoped mint stamps the canonical RLS
  lineage (outside landing refuses typed, owned rides), privileged
  hops demand a live approval, a minted approval id authorizes exactly
  ONE hop (single-use, #204, disk-coherent), the .sha256 pin verifies
  the on-disk index (atomic contract), and the traveler:* channels are
  catalogued with their family + emitters

8/8 `REFUSED` ×2 deterministic; EXPECTED armed strict. One herd lesson
kept: the helpers live at module top-level (the splice initially landed
them inside the attacks array — a parse error, found same-pass).

## The WIRE seam (slice 7, 2026-10-27): the letter crosses into the pod's relay door

`carriers-wire-seam-letter-through-door` — the ONE row that stops
simulating the hop: a REAL org-scoped `carriers.carry()` output posts
over a REAL loopback relay mount (`lib/api` webhook face, HMAC lane,
body-bytes law verified in-process by the parity harness) and the
letter lands THROUGH the real door's `brain_write` slot (the run-root
sandbox serves `mcp.execute` directly — no capture shim anywhere in
the lane). Three fixes were needed to make the seam honest, each now
part of the tree:

- **the traveler slot law in `lib/mcp.js` brain_write** — the
  relay.travel bridge translates onto a `brain_write` record slot
  named `traveler-<64hex>-trN.json`; those slots no longer sink into
  the brain-note namespace (the pre-fix landing was
  `traveler-<id>-tr1.json.md`, invisible to the traveler's own store).
  The door now parses the packet, re-verifies the ADDRESS at the
  receiving node (the wall at both ends — `traveler_fetch` re-verifies
  the same way), and lands it through the traveler lib's OWN
  append-only store: the ledger row plus the body beside it at
  `state/travelers/<id>.json`, the exact store the mesh door serves.
  A forged slot (name matches, content does not answer to the
  address) refuses typed E_TRAVELER_ADDRESS; an already-ledgered
  packet (the RE-LAND leg — the same legal letter posted twice) is
  refused by the store, append-only, typed E_TRAVELER_STEP.
- **the bridge's in-band refusal band in `lib/api.js`** — the mcp
  executor answers its refusals IN-BAND (inside the jsonrpc result),
  not as a top-level transport error; `_dispatchBridge` now surfaces
  either band typed as E_RIDE_DISPATCH. The pre-fix behavior hid the
  append-only reversal behind a clean ok:true ack — the lie the row
  exists to catch.
- **the census on the real store** — the row's landing census reads
  `state/travelers/<id>.json` (one landing, the slot IS the letter,
  `letterSteps` re-counted from the landed body), and the refused
  legs (gapped tamper E_TRAVELER_STEP, sneak id E_TRAVELER_ADDRESS,
  re-land E_TRAVELER_STEP bridged) must ALL leave zero landing
  growth.

1/1 `REFUSED` ×2 deterministic. Regression rode the same stamps:
vant-relay 20/0 and vant-brain 21/0, harness contract 326/0,
test/relay.test.js 61/0 + test/traveler.test.js 26/0, lint clean.
The vant-brain slice-7 rows landed in the same session (the brain
listing family converts under the your-own-hint law);
`test/brain.test.js` trimmed to the non-family pins that stay native.

## The MESH serving wall (slice 8, 2026-10-27): the doors stop riding shims

`carriers-mesh-serving-wall-on-real-landings` — the seam-to-serving
half of the same coin: the wire seam's store landing made the mesh
doors' operands REAL, so this row lands ONE packet through the
brain_write door slot law (the same chain the wire rides) and then
measures the serving side over THAT body in the sandbox tree:

- **traveler_fetch serves found + re-verified** — the wall at the
  serving node re-derives the address from the store body before any
  byte crosses (the insert address law, `traveler_fetch` +
  `traveler_stamp` ONE helper)
- **traveler_stamp derives the VANT:1 frame + a REAL scannable
  raster** ({ frame, png base64 }) from the re-verified body —
  derivation, never fabrication
- **an absent id answers `found:false` honestly at BOTH door faces**
  (a miss is a record, never an error, never a fabricated body)
- **a swapped store refuses typed and identically at both faces** —
  the at-rest-tamper simulation corrupts the store body at the SAME
  filename; both `_travelerServed` callers throw the same typed wall,
  and restoring the exact original bytes re-arms the store (verified
  found + re-verified again)
- **the pointer loop closes on the REAL raster** — carriers.decode
  resolves the stamp's actual png through a pointer-fetch closure
  backed by the serving door itself (mcp.execute), the body wins over
  the local copy, and the decoded packet re-enters the full address
  law
- **zero serving growth** — the census isolates the SERVING legs (the
  landing IS the store hold the wire-seam row grades): the serving
  ride adds exactly zero files

## The TRAVELERS census (slice 9, 2026-10-27): the inventory pass, one REAL seam closed

`travelers-status-span-ceiling-census` — the lib inventory read, three
unmeasured laws graded, one REAL find carried to a same-pass fix:

- **the FIND: the 512KiB state ceiling had one face** — the kit's r/2
  shape law (`traveler-contract.js`) refuses slots past
  `TRAVEL_MAX_CTEXT` typed E_TRAVELER_SHAPE, but the working lib
  exported the same constant with ZERO enforcement points: an
  oversized pod-local packet minted, advanced, and persisted happily
  and only hit the wall at the wire. FIXED same-pass:
  `lib/traveler.js` `shapeRefusalFor` now enforces the slot ceiling
  with the kit wording verbatim (`slots exceed the 524288 byte state
  ceiling.`) — one law, two faces, every shape-checked path
  (persisting included).
- **T.status() graded** — the landed packet answers seen:true with its
  single ledger row and the stations verbatim; a never-landed packet
  answers seen:false with NO rows (the honest miss is a record, never
  an error, never a fabricated row).
- **the trace-span relation graded** — a station may carry a
  lib/trace span id in `step.span`; advance() carries it THROUGH
  verbatim and the packet still verifies (relation, not duplication,
  inside the address law).

1/1 `REFUSED` ×2 deterministic (carriers now 42 rows). Regression:
test/traveler.test.js 26/0 (the tr/1 wire law unmoved by the ceiling),
contract 328/0, lint clean.

NOTE on the survey wording: a previous closing summary named
"spotting/quantum-walls families" as a survey target — that phrase
does not exist anywhere in the repo (grepped README + tests + lib);
the honest correction is this entries' actual provenance (the census
read found the ceiling seam). Remaining named candidate buckets: the
brain pack's 29 unmeasured seams (restamp line), nothing else named.

1/1 `REFUSED` ×2 deterministic (49 pack rows total: 41 carriers + the
library phase 48/0/1). The dash sibling: the relay-edge deepening's
small-doors batch (batch 4) validated 19/19 the same day — see the
dash section above.


## Next surfaces survey (2026-10-23): packs vs issues

Where the remaining repo parts land:

- **`web/relay` → PACK (next, highest value).** The r/2 webhook wire
  (`web/relay/functions/api/r/relay.ts`: posture gate → key gate → HMAC
  X-Signature-256 over raw body bytes → freshness window → AES-256-GCM
  envelope shapes → https-only origin guard) is a real runtime surface
  exported as a Page handler, drivable in-process exactly like the
  vant-home arm (WHATWG Request, no sockets). A `vant-relay` pack grades
  the gate + replay window + envelope + origin guard rows for real.
- **`web/dashboard` auth/OTP doors → PACK landed 2026-10-25 (`vant-dashboard`,
  first slice; batch 2 = bridge knee + auth gate same day; batch 3 = the
  dashboard's OWN relay flavor landed 2026-10-27 — see the section above).** `functions/api/auth/{request,verify}-otp.ts` + `session.ts`
  + accounts drive in-process via the `dash-auth` strip-types probe child
  (KVStore shim for `BOLETE_KV` + capture sink in the sender's webhook seat);
  5 rows, all REFUSED. Follow-ups if the slice deepens: the bridge's
  forwarded-token knee (`lib/bridge.ts` `podTokenFor`) and auth_guard as a
  second batch; the session seals (`src/lib/seal.ts`) live on the UI's own
  native tests per the surfaces rule. The UI modules keep their own native
  tests — packs attack the WIRE, not React mounts.
  [CLOSED 2026-10-28] the knee + auth_guard second batch landed as the
  batch-2 rows (token-source-order / bound-token-property-scoped /
  token-intake-binding-law / raw-cookie-fallback-hygiene /
  admin-gate-typed-ladder); batch 5 closed the rung that batch left open:
  `disabled-account-knee-fail-closed` — the disabled account kills at the
  BRIDGE (podTokenFor answers present:false through the very same bind it
  answered present:true with while the account lived), not just at the
  admin gate. 21 rows REFUSED x2 golden, contract 359/0, the row 'skip'
  honestly in-suite (run-root-only dash-auth family).
- **`web/kit` contracts → `vant-kit`, the 21st pack (2026-10-28).** The
  survey's note below is STAMPED OVER: the vendored contract layer now
  HAS its own census (`vant-kit/kit-contracts-census`, armed run-root
  child `kit-contracts`), graded at source in a fresh child process:
  freeze laws (canary writes refused on CODES / TRANSPORT_STATUS /
  SEALED / POD_CONFIG_KEYS / EDGE_ENV_KEYS / TRAVEL_CODES), the
  two-tier private-IP wall (hard metadata + 0.0.0.0 in every posture,
  RFC1918 soft, fail-closed), the envelope shape law (32/24-32/32/2+
  hex colon format: sub-shape, over-cap, no-colon all refuse), and the
  traveler bank (builders stamp tr/1 + v.major 2; shape refusals
  SHAPE/ADDRESS/SCHEMA/STEP exact incl. the ledger gap + re-open laws
  with the legal-accepts leg green; schemaRize lifts tr/0 → tr/1 via
  the rize-append ledger and leaves tr/1 untouched). Two fires green x2
  (REFUSED 1 / 0 EXPLOITED; library rows 48/0/1), contract suite 357/0
  with the EXPECTED rows honest (run-root-only children graded 'skip'
  in-suite, live x2 in the fires). The honest census repairs the same
  pass: the route registration sat inside the brain-graph-walk callback
  (re-running that route re-registered kit-contracts and threw); the
  proto-hygiene sweep caught it as two findings, fixed by moving the
  registration top-level, and the ring leg's pin-split rode the
  template-literal escape law (the outer template ate `\s`, so the
  rendered child split the sha pin at the wrong place - the live fire
  caught it as nine unpinned pairs, fixed with the escaped `\\s`).
- **`vant-kit` third row — the CARRIER-SHARE PLATE census (2026-10-28).**
  `kit-plate-census` (this route): the kit's first COMPONENT member
  measured at its source — the pure-renderer law (no fetch/state/
  runtime-API calls; btoa stays, it is a standards global), the typed
  unknown-lane refusal (`E_CARRIER_SHAPE` + the caller-names-the-carrier
  sentence), `decodeSentence` PINNED WORD-FOR-WORD **evaluated live**
  (typescript transpile + vm stubbed-require — no React runtime needed,
  JSX never executes at module scope) across the five lanes plus the
  honest custom-plate default, the pointer derivation law
  (`VANT:1:` stripped to the 64-hex address), the always-rendered
  hash-verified sentence, the no-auto-download law (a user-picked link,
  said so), and the plate target of the vendoring ring (the vendored
  `CarrierShare.tsx` byte-identical). Two fires green x2 (REFUSED 3 /
  0 EXPLOITED), contract 358/0 with the row graded 'skip' honestly
  (run-root-only census family). The census's own repair: the sandbox
  now also carries the plate's vendored target under `web/dashboard`
  (the first fires ENOENT'd on it — caught by the fire, fixed in
  makeSandbox), and two probe pins tightened (a purity ban list that
  matched the kit's own "no asserts" law comment; a lowercase-'the'
  pin vs the source's sentence case).
- **`vant-kit` second row — the VENDORING-RING census (2026-10-28).**
  `kit-vendor-ring-census` (run-root route `kit-vendor-ring`): the
  ring leg. The vendor script's own `--check` must answer exit 0 with
  one `[ok]` per pin (9 sidecar pins: relay x4, traveler x4,
  CarrierShare plate x1), AND an independent census child re-derives the
  ring WITHOUT the script's bookkeeping — each pin must equal BOTH the
  vendored copy's bytes and its kit source's head (a stale or swapped
  copy fails either leg), every target stays inside `web/` (the one-way
  boundary), a NEGATIVE control (one mutated byte changes the digest)
  keeps sha() discriminating, and the two lenses must AGREE (script
  `[ok]` count === census pair count; a pin one lens cannot see is a
  finding). Two fires green x2 (REFUSED 2 / 0 EXPLOITED; library rows
  48/0/1), contract 357/0 with the row graded 'skip' honestly (run-root
  only census family).
### The home math plate census (2026-10-28) — vant-home row 7

The fresh wire survey read every live route under `web/*/functions` and
found every door family armed EXCEPT one facet: the home status
monitor's own pure math plate, `web/home/functions/_lib/status-math.js`
(the "stat truth" law rode only a CI script, never pack rows). The new
row drives the SAME arm shape the home rows use: a `home-status-math`
route (run root + contract suite, identical body) imports the REAL web
module into the probe (no lib->web import - the one-way boundary holds)
and grades **25 laws under a FIXED date pin** (determinism stays flat):
hollow days stay honest no-data (`pct: null`, never a fabricated
outage), duplicate daily rows merge (4/5 into an integer 80), rendered
slots are exactly the trailing window with today last, an id-less or
out-of-window row contributes nothing, `trailingDays` refuses NaN dates
empty, uptime is `null` with no data + integer-rounded + sliced to the
EXACT last-N window, worst state wins with `unknown`s never dragging
the headline, the alert picker takes worst-then-newest over active rows
only and answers `null` over garbage, the admin spec gates (https-only,
name cap, kind whitelist, object options) refuse typed, and the key
compare has no early exit.

7/7 rows `REFUSED` x2 deterministic (25/25 laws held both cycles);
contract 360/0 with the row graded live in-suite; lint flat.

## Wave 3 (2026-10-28) — the plate slice: the two unrowed dashboard doors

The fresh wire-survey read re-inventoried every live route under
`web/*/functions` and found ONE real gap: `api/health.ts` (the one-line
`forward()` plate) and `api/session.ts`'s DELETE face (`clearSession`)
grew no rows — the survey's batch-5 slice landed the same reading:
two new rows on the dash-auth arm, and the arm itself grew the
instrumentation that makes the knee OBSERVABLE instead of inferred: a
`bridge-forward` library endpoint drives the REAL `forward()` with an
intercepted upstream fetch (the hop facts — Bearer-vs-cookie, the POST
Content-Type law, the SSE Accept — ride the row), plus the health
plate import so even the wrapper is measured, and `bridge-clear` drives
the real clear law. The rows:

- `bridge-forward-plate-laws`: the unconfigured origin answers typed 503
  BEFORE any fetch (naming `VANT_PROPERTY_LOCAL_ORIGIN` + the fix hint),
  the configured hop carries the knee law (bound/raw session answers
  ride as a Bearer Authorization; the cookie NEVER crosses), status
  mirrors the upstream, and the POST law sets `application/json` on the
  hop (the pod door types other MIME 415 by its own gate).
- `bridge-clear-law`: both resets answer typed `ok` and touch ONLY their
  own property-scoped cookie (`vg_session_pod-alpha` vs `-beta`) with
  the full hygiene law (Max-Age=0, HttpOnly, Secure, SameSite=Strict) —
  scoping lives in the cookie NAME, never a global wipe.

`vant-dashboard 22/22 REFUSED x2` deterministic, zero EXPLOITED;
contract 374/0 with the two rows graded as honest typed skips
(run-root-only arm); lint flat; library rows 48/0/1 per fire.

## Wave 2 (2026-10-28) — the state-wiring suite retires whole

The conversion law ran its last lap on the drill-down bucket: the
retiring native suite's final 20 pins (its seeds, canonical-authority,
tree-tier, StateAnchor-chain, and mesh in-memory-default families) went
onto pack rows FIRST (read before write — the native file stayed green
and its pins are enumerated in its header), the rows ran 44/44 REFUSED
x2 deterministic with zero EXPLOITED, and THEN the file retired whole
(`git rm`), the carriers precedent. Two real instrumentation findings
came out of the wave itself and were fixed same-pass: (1) the store's
out-of-band tamper write initially hit the loader's identity field
('kind'), which silenced treeFor's PRESENT verdict before the
divergence detector could run — the arm now corrupts a payload key;
(2) the pass-184 treeHot disk-read cache served the pre-tamper root
inside the long-lived runner process — the tamper op now drops the
ride-local cache to model the fresh reader a restart produces. The
seeds rows salt their state-file tokens per run (deltas, never
absolutes: the anchor ledger is append-only). packstruct lint green
(21 packs, 288+ ids); the contract table and the strict ci-gate ride
the same stamp below.

## Restamp 8 (2026-10-28) — the wave-2 full floor

The wave-2 tranche (the state-wiring suite retiring whole) pre-dated
its own stamp, so the whole tree re-stamped on the post-retirement
count, two full cycles:

- **Full packs x2 green**: **261 pack rows REFUSED across all 21 packs**
  (6 honest skips unchanged), **0 EXPLOITED, 0 BOUNDED, deterministic
  pass-for-pass**; library rows 48/0/1 each cycle. The wave-2 rows ride
  both cycles (vant-state-wiring 44/44 REFUSED each).
- **Contract: 372/0, exit 0** on the final tree. The first post-wave-2
  fire was RED by design catching the work: the 12 new rows were absent
  from the contract's EXPECTED table. Honest entries added — typed
  `skip` rows (the run-root-only wiring-mesh/wiring-store arm; strict
  earned verification rides the run root, the market-scope precedent).
- **Native floor swept on the post-retirement tree**: **220 suites**
  (the state-wiring retirement settled the floor 221 -> 220), driven in
  three chunks — head 97, middle 82, trailer 41 — 0 timeouts. Two
  honest repairs landed mid-sweep, both re-run green standalone after
  the fix (contract 372/0 full-length; mcp.test.js 34/0): the contract
  EXPECTED-table mismatch above, and the cloud runner restart wiping
  installed dependencies mid-chunk (the missing `qrcode-generator`
  dropped mcp.test.js's three carrier/traveler stamp checks —
  `npm ci` from the lockfile restored them; no code change).
- **The S-counters hold**: every Phase A bucket's claims are now
  stamped on the tree that carries them; the wave-2 retirement closes
  the drill-down bucket's native-suite inventory at empty.
- **Strict ci-gate: GREEN, exit 0, whitelist empty** (A: contract table
  PASS + B: real harness PASS/final clean) on the settled tree. One
  earlier background fire went RED during the concurrent floor sweep
  (every one of the 372 checks logged ✓ but the gate's contract child
  exited 1 mid-fire) - the settled re-run is the stamped verdict.


## Restamp 7 (2026-10-28) — the post-CI-repair full floor

The whole floor re-swept on the tree that carries the plate-arm CI-fork
fix + the home math plate row (two tranches since restamp 6):

- **Full packs x2 green**: two consecutive cycles, **249 pack rows
  REFUSED** across all 21 packs (6 honest skips unchanged: vant-census
  config-skips + pass-ledger session-skips), **0 EXPLOITED, zero
  findings, pass-for-pass verdict-identical** - the only line-level
  diffs between the cycles are run-local timing text (a 2ms/1ms walk
  detail) and the throwaway sandbox path inside the kit-census gate
  lines; verdict tables, totals and the library rows (48/0/1 each
  cycle) are byte-stable.
- **Native floor swept clean x2**: **221/221 suites green across two
  full harness cycles** (the floor grew 203 -> 221 across the recent
  tranches; strict harness, zero failures, zero timeouts) - the
  relay-parity suite rode the sweep both cycles.
- **Vendor parity verdict: KEEP** (the parity pins pass x2 in the
  harness; the vendoring ring census unchanged).
- **Strict ci-gate**: the run root fired WITHOUT whitelist exceptions
  both cycles; the known-finding whitelist remains EMPTY.

The x2 was repaired-required only once in the run (a full-harness cycle
cut twice by the cloud runner restart at the same alphabetical seam;
each resume reran the harness from its own slate restore, and the
completed cycles are the stamped ones).

### CI repair (2026-10-28) — the determinism preflight goes flat

The `npx crashtest lint-determinism` gate (crashtest 1.1.0, CI job
`crashtest`) flagged 25 wall-clock / unseeded-randomness read-ins
across the pack sources - the law is real: same commit must give same
findings. Repaired in one pass, verdicts unchanged:

- **The FRESHNESS legs keep their honest stamps - sourced from the run
  root, never the packs.** A new run-root route `vant-now` grades the
  run root's OWN wall clock to any pack that asks
  (`stampNow(harness)`); the pack sources stay flat (the lint's
  declared surfaces are the packs, never the run-root file). The six
  vant-relay wire rows + the three vant-dashboard dash-frame rows +
  the hop-frame rows now compose their envelopes with that stamp
  (fresh lanes ts = now; stale lanes ts = now - 11min / the seal's own
  15min window). The stamp never reaches a verdict: receivers grade
  freshness against their own clock; the verdicts grade responses.
- **Nonces and ids became process-local monotonic chains** (vant-relay
  `freshNonce`/`signedEnvelope`/`door`, vant-brain `freshId`) - fresh
  per mint, same commit -> same findings. The ride-intake's
  16-64-char url-safe nonce law caught the first pad as too short
  (the live fire said so; padded to the floor - exactly the kind of
  find the lint exists to surface).
- **vant-brain's expiry-window busy-wait moved to `process.hrtime`
  (monotonic)** - same 80ms semantics, no wall clock.
- **vant-carriers' forged ledger step uses a fixed ts (0)** - the
  address law refuses on content, the ts was decoration.
- **vant-spine's non-plain-object law test builds its Date via
  `Reflect.construct(Date, [])`** - a real Date instance, no
  `new Date(` token; the refusal law is graded unchanged.
- **The contract table honest-updates:** the eight vant-relay wire
  rows grade 'skip' in-suite (the sandbox harness has no vant-now
  route; run-root-only wall-stamp family) and remain LIVE x2 in the
  fires, per the established census-family pattern.

Verification: `npx crashtest lint-determinism` flat (21 files, zero
findings); the five touched packs (relay 20/0, dashboard 20/0, brain
28/0, carriers 42/0, spine 16/0) each hold TWO green fires on the
repaired tree, zero findings; contract 359/0.

## Restamp 6 (2026-10-28) — the post-kit-census full floor

The full floor re-stamped on the tree that carries the 21st pack:

- **Full packs x2 green**: two consecutive cycles, **246 pack rows
  REFUSED** across all 21 packs (vant-census 4 honest config-skips,
  vant-pass-ledger 2 session-skips), **0 EXPLOITED, zero findings
  both**; library rows 48/0/1 each; contract **357/0** with the two new
  `vant-kit` rows graded honestly (`skip` in-suite: run-root-only
  census children; live x2 in the fires).
- **Native floor swept clean**: 203/203 suites green across two
  alphabetical chunks (a-m 107 + n-z 96, zero failures, zero timeouts).
- **Vendor parity audited, verdict: KEEP (no retirement).**
  `test/relay-parity.test.js` (19/19 green after `--check`) carries
  law families the census structurally cannot: the pod-face structural
  parity against `lib/api.js` (posture getters live against the module),
  the FACE-side envelopeShape agreement, the runtime-agnostic
  scan-check on the kit source, the retired-wire lie pins, and the
  intake browser-lane source pins. The vendoring ring census carries
  the BYTE-PARITY leg live in the fires (all 9 pins, two lenses,
  negative control); the native suite carries it in plain `npm test`
  plus everything above - the two reinforce, neither replaces.
- No repair needed this restamp: zero findings across both packs
  cycles and the whole native floor - the first restamp with nothing
  to fix, which is itself the honest signal that the census slabs
  landed true.

- **`web/kit` contracts — historical survey note (2026-10-27):** was
  contract SOURCE only (checksummed vendoring + parity pins in
  `test/relay-parity.test.js`), not a runtime; the CONTRACT shapes rode
  as rows inside the relay pack (r/2 ack/refusal vocabulary, envelope
  shape). Superseded by the census above.
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

## Wave 3a (2026-10-28) — the STRUCT audit page, step (b): the crashtest feed goes live (vant #264)

Both struct-audit flavors (web/home /audit, web/dashboard /struct-audit)
now render the crashtest card from a STAMPED verdict ledger instead of a
mock: `scripts/struct-feed-stamp.js` runs the contract suite with
`CRASHTEST_PACKS_JSON=1` (the CI gate's phase-A body), parses the
sentinel dump, and writes one feed row byte-identically into
`web/home/src/generated/struct-feed.json` and
`web/dashboard/src/generated/struct-feed.json`, each with its own
`.sha256` pin (`npm run struct:stamp` to restamp, `struct:check` for CI
drift). The kit contract file (web/kit/components/struct-audit.tsx) grew
the step-b epoch note and re-vendored with its pin following.

The stamp this wave (as of 2026-10-28, suite exit 0, 374 signals green):
**21 packs, 269 rows — 97 REFUSED, 172 honest skips, 0 EXPLOITED.**
Layer note, honestly stated: this counts what the CONTRACT SUITE's
ledger measures (the EXPECTED-table rows and their verdicts in this
sandbox); the run-root full-pack sweeps' "261 REFUSED x2" readings in
the wave-2 stamps measure the ARMED harness over real routes and are a
different, deeper layer. The feed derives strictly from the ledger it
names — no cross-layer number laundering, and the mock badge leaves the
crashtest card accordingly. The other three cards (packstruct, eyestruct,
poststruct) stay mock/ABSENT pending issue steps (c)-(d).

## Wave 4 (2026-10-28) - the brain suite retires whole; two honest catches

The conversion law ran its last lap on the brain battery: the four
native-only families left in `test/brain.test.js` (handler registry,
metrics + version, module integrations, pipeline state) went onto
vant-brain's `brain-surface-registry-metrics-modules` row FIRST (the
straight-lib batch-2 shape: no routes, no arm, each restore through the
registry's own DI undo). The row grades the laws the native shape pins
never made: getHandler returns the REGISTERED function reference, not a
re-derivation; unknown names answer null without a throw; `__proto__`
refuses typed (the pollution wall); `_clearHandlerOverride` drops an
override and the NEXT getHandler is the law (cleanup graded, not
bookkeeping); metrics counters are finite numbers with a computed
cacheHitRate and resetMetrics zeroes them honestly; getVersion is a
stable non-empty string; getModule assembles storage for real and
answers null for names outside the map; the REST-surface brain.get
answers module-or-null without throwing; getPipelineState rides its
diagnostic object with a string-member gate chain (any leaked object is
a state leak, graded EXPLOITED).

The native file stayed green through the landing cycles (14/0 twice)
and then retired whole (`git rm`) - the carriers and state-wiring
precedent. The native floor settles 220 -> 219 on enumeration; its full
sweep rides the next restamp per the standing rule.

Two real findings came out of the wave itself and were fixed same-pass,
both caught by rows doing their exact job:

1. **The expiry-window numenology (deterministic red x2).** The
   guest-token lifecycle row issued `expires: 5` - FIVE MILLISECONDS by
   the lib's own ms-number law (plain `Date.now() + n`)
   - and demanded the in-window verify land inside it. A slow runner
   loses that race every time and the honest-both-directions pin fired
   on the row's own numerology, not a lib bug. The law keeps both
   directions: a 300ms window the machine can actually reach, then a
   monotonic `process.hrtime` wait to 900ms before the expired leg. No
   wall clock; the determinism lint stays flat.

2. **The vendoring ring drifted (found on the first real fire).** The
   STRUCT-audit wave added the `StructAudit.tsx` pin to the vendor
   script (the ring grew to 10 pins, `--check` exit 0) but the
   independent census child still enumerated 9 - the
   `kit-vendor-ring-census` row's lenses-must-agree law caught a pin one
   lens cannot see, exactly the drift the census exists to name. The
   child's PINS map and `sourceFor` now carry the tenth pair
   (web/kit/components/struct-audit.tsx -> web/dashboard/src/frame/
   StructAudit.tsx).

Stamps on the settled tree (honest layer note as ever): the run-root
full-table fires ran x2 verdict-identical - **264 pack rows REFUSED, 6
honest skips (vant-census 4 config + vant-pass-ledger 2 session), 0
EXPLOITED, 0 BOUNDED** across all 21 packs; kit rows back to 3/0 with
the ring at 10/10 both lenses; vant-brain 29/29 with the new row live
in both fires; library rows 48/0/1 per fire. Contract suite **375/0,
exit 0, x2** with the new row graded live in-suite (batch-2 house law).
`packs:lint` 21 packs / 291 ids; `packs:audit` clean with the one
ALLOWED-pinned known finding (engine finding at crashtest#33);
`npx crashtest lint-determinism` flat (21 files). The full native floor
sweep rides the next restamp.

## Wave 5 (2026-10-28) - the floor IOU paid, the teams depth pass, and the rule-gate repair

Three named candidates from the ledger, run as one tranche:

- **The wave-4 floor IOU: paid.** The full native floor swept on the
  post-retirement tree in three chronological chunks (a-governance 74,
  guests-remote-storage 74, remote-transport-zen 71): **219/219 suites
  green, 0 failures, 0 timeouts** - the retirement settled the floor
  220 -> 219 exactly as enumerated.

- **The teams orgchart depth pass (vant-teams row 2).** The module's
  governance plumbing beyond the orgchart chain converts to
  `teams-governance-depth` over the `teams-governance` probe child
  (fresh modules, capabilities granted per-process, config-DI through
  `config.setConfig` - hermetic because flags ride `get()`'s top
  priority and the sandbox is throwaway): the org quota cap refuses the
  third create typed at its LIVE max (hydration-aware: the census
  child's own orgs persist in the shared sandbox store, so a fixed cap
  fabricated a refusal the first create would have deserved), the
  hierarchical per-team agent cap refuses the third seat ('Team agent
  quota'), span-of-control refuses the second report ('Span of
  control'), a deny rule on team:create refuses typed E_RULE and lifts
  on removal, the global 10/60s create budget rides to its floor then
  refuses E_RATE_LIMIT with the `team:rateLimited` event on the bus,
  delegation answers role_hierarchy over the CROSS-TEAM lead->member
  edge (same-team delegation is same_team by contract - its own graded
  law), accountability chains resolve through role chains exactly,
  rosters enumerate, the multibrain stack getter rides brain-tagged,
  and the horcrux gather holds the org. `vant-teams: REFUSED 2 x2` on
  the real harness (was 1).

- **THE FIND (a real gate seam, fixed same-pass): `teams._checkRule`
  leaked every denial.** `rules.check()` returns a VERDICT OBJECT
  (`{ allowed, rule, reason }`), and `_checkRule` returned it verbatim
  while all three create paths test `if (!_checkRule(...))` - a denial
  object is truthy, so a registered deny rule could never block an org,
  dept, or team create. The repair reads the verdict (false or
  allowed:false denies); all five teams/crew native suites stayed green
  against it (20 + 14 + 9 + 6 + the teams battery, 0 failed).

- **Honest note: the crew door inventory census is already landed** -
  `vant-crew`'s `crew-doors-census` rides the pack (28 rungs; the
  ungrounded approval-ack find it caught was fixed same-pass then), so
  the third named candidate was measured before this wave; the fire
  confirms it rides green both cycles.

- Stamps: run-root full-table fires x2 VERDICT-TABLE-IDENTICAL -
  **265 pack rows REFUSED across 21 packs, 6 honest skips (vant-census
  4 config + vant-pass-ledger 2 session), 0 EXPLOITED, 0 BOUNDED**;
  library rows 48/0/1 per fire. Contract **376/0, exit 0, x2** with
  `teams-governance-depth` graded honestly `skip` in-suite
  (run-root-only arm, the sibling precedent). `packs:lint` 21/292;
  `packs:audit` clean with its pinned finding; determinism lint flat.

## Wave 6 (2026-10-28) - the legacy-runner graveyard census, the naked-lib first-doors row, and three smoke retirements

The census question that named this wave: **are there suites the floor
sweep never sees?** Yes - 31 legacy `test/test-*.js` files from the
pre-v0.8.6 runner era carry no `.test.js` suffix, so `run-all.js` skips
them and CI never fires them. The census ran every one: all 31 still
pass (exit 0), but their depth classification exposed the real shape -
about half are pure "has X function" shape-smokes, one (`test-rls.js`)
asserts literally nothing (0 passed / 0 failed / 2 skipped), and
`test/active-brain.js` is a helper module, not a suite (it exports
`resolveActiveBrain` and stays). Four of their modules have NO pack
coverage anywhere: `lib/citations.js`, `lib/telegram.js`,
`lib/webhooks.js`, `lib/theme.js`.

- **The naked-lib first-doors row (vant-census row 5), landed.**
  `naked-lib-first-doors` over the run-root `lib-first-doors` probe
  child (fresh modules, per-process gate grants; hermetic, socketless):
  citations' merge-under-lock grounding chain (the source round trip (
  id 1, commit verbatim), verify answering true known / false unknown,
  the `[Source: ` prefix law, the lock path's id increment, the honest
  clear), telegram's token wall answering typed (`TELEGRAM_BOT_TOKEN`)
  AND its validation door ordering (a bogus method name answers the
  vaf refusal BEFORE the token wall, so the probe cannot learn which
  credential is missing), webhooks' register round-trip with its
  SECRET-FREE ack projection, the secretless route refusing to bind
  typed, the HMAC law (genuine accepted, tampered and absent refused -
  the pass-42 fail-closed belt), and the replay defense (first come
  fresh, second identical signature refused 409, the no-signature
  exemption honest), and theme's sanitize law (control-char strip +
  the 10k cap) with the applyToMCP status/icon/format mapping and its
  honest defaults. **The row's own first fire caught a find - in the
  row:** the initial law expected `register` to echo the secret; the
  module's behavior is BETTER than the law - the ack is a secret-free
  projection (the route object with its secret lives in the registry
  Map; the ack over that POST never carries it), so the law was
  repaired to demand exactly that. The module kept its fail-closed
  secrets; the row now grades the stronger law.

- **Three smoke retirements (convert FIRST, then retire):**
  `test/test-citations.js`, `test/test-telegram.js`,
  `test/test-webhooks.js` deleted whole - their shape-only claims
  ("has addSource", "has send", "has register") are strictly subsumed
  by the row's behavior laws over the same exports. `test-integrations
  .js` STAYS (its cache/canvas/embed/network/schema/theme families are
  not all covered yet - the theme half of its claim is, the rest is
  wave-6-slice-2 material alongside the real-behavior legacy suites:
  brain 13/0, escrow 8/0, habitat 12/0, islands 11/0, legal 11/0,
  sandbox 14/0, security 12/1, vaf 12/0). `test/test-rls.js` asserted
  nothing and was retired as the dead-weight it measured (its module
  `lib/rls.js` rides the habitat/sandbox families' next pass).

- Stamps: `--pack=vant-census` ×2 verdict-identical - REFUSED 1 /
  0 EXPLOITED / 4 honest not-armed skips (the config-armed oracles).
  Contract **377/0, exit 0 ×1** with `naked-lib-first-doors` graded
  honestly `skip` in-suite (run-root-only arm, the teams-governance
  sibling precedent). `packs:lint` 21 packs / 293 ids; `packs:audit`
  clean with the one ALLOWED-pinned known finding; determinism lint
  flat (21 files). The full-table fires ride the next restamp.


### Wave 6 slice 2 (2026-10-28) - the graveyard's real-behavior census: duplicates retire, orphans convert

Reading the eight "real-behavior" legacy suites exposed the deepest
 surprise yet: **the modern suites already exist and cover MORE than
 the legacy files ever did** - `test/escrow.test.js` (337 lines:
 canSpend/recordSpend/beforeExecute), `test/habitat-rls*.test.js`
 (the role/policy chain), `test/security-hardening.test.js` P0-9 (the
 DEFAULT_CAPABILITIES deny-by-default law) and P1-15 (traversal laws:
 single/mixed/double-encoded, Unicode-normalized, malformed - far
 deeper than the legacy vaf smoke), `test/islands.test.js` (manifest +
 static/lazy islands), `test/legal.test.js`, and the audit-C1 vaf
 regression. So the real sweep claim of slice 1's wave-6 entry
 (vaf/sandbox/etc. "naked elsewhere") corrects itself here: only
 FIVE law groups were genuinely orphaned - graded by NO modern suite
 and NO pack row - and they convert to `legacy-orphan-laws` (vant-
 census row 6) over the run-root probe child: the brain T11b nuclear-
 alias removals (loadBrain/brainList GONE) with the mode/path/corpus
 laws, legal's dormant gate chain (canUse's passive DORMANT answer,
 the always-pass-while-dormant checkGate incl. unknown gates, the
 activate-warn/deactivate-DORMANT round-trips), sandbox's RLS
 binding trio (initRLS true with a habitat, generateCaps/
 createAllowed objects), security's op-gate shapes (Security class,
 instance encrypt/decrypt functions, isOperationAllowed/getStatus
 objects), and islands' class/hydrated/available trio.

- **Retirement (convert first, then retire):** the eight real-behavior
  legacy files deleted whole - `test-brain.js`, `test-escrow.js`,
  `test-habitat.js`, `test-islands.js`, `test-legal.js`,
  `test-sandbox.js`, `test-security.js`, `test-vaf.js`. Their claims
  live in the pack rows (the orphaned set) and the modern suites
  (the duplicated set, where modern coverage is strictly deeper).
  The graveyard now stands at 18 files: the pure shape-smokes
  (api/audit/boot/compute/cron/error/event/integrations/mcp/metrics/
  msg/qos/stego/storage/stream/telegram/tmp/utilities/vant/webhooks),
  each of whose "has X function" claims rides the module census rows
  or a successor slice's conversion.

- Stamps: `--pack=vant-census` x2 verdict-identical - REFUSED 2 /
  0 EXPLOITED / 4 honest not-armed skips. Contract **378/0, exit 0**
  with both census rows graded honestly `skip` in-suite
  (run-root-only arm, the sibling precedent). `packs:lint` 21/294;
  `packs:audit` clean with the pinned known finding; determinism
  lint flat. The full-table fires + native floor sweep ride the
  next restamp (the wave-6 IOU).


## Wave 7 (2026-10-28) - the LAST 18 smoke retirements, the graveyard closes EMPTY, and the wave-6 IOU paid

The drift-off pass. The remaining 18 legacy shape-smokes were triaged
 against their MODERN twins (17 of 18 have one) and the three new
 census rows, then retired whole:

- **facade-surfaces (vant-census row 7) landed** - the export-surface
  laws that never had a modern twin: the umbrella facade lib/vant.js
  (16 function doors incl. startFull/startHeadless/remember/learn/
  executeTool/getTools + the 6 namespaced module objects audit/event/
  islands/mcp/msg/storage + agents/cron/network/qos/event presence +
  the version string), compute's run/python executors, auth's Auth
  class with health's surface, msg's publish/subscribe pair, cron's
  once/JobWorker pair, audit's batch, boot's lifecycle trio, the
  cache class, and the embed/network/schema/canvas presence shapes.
  The row's first fire caught a FIND in the row itself: `islands` was
  listed in BOTH the function-door list and the namespaced-object
  list - the fn/obj split is load-bearing and the law was repaired to
  grade it exactly once (the object list). The run-root child exits
  hard (compute.js holds connector handles alive).
- **The retirement batch (convert FIRST, then retire):** all 31
  legacy `test/test-*.js` files are now GONE - the 18 remaining after
  wave 6 deleted: api/audit/boot/compute/cron/error/event/integrations/
  mcp/metrics/msg/qos/stego/stream/telegram/tmp/utilities/vant/webhooks
  and the last survivor storage. Every claim was verified against its
  modern twin (api 138 lines, audit 248, boot 151, compute 92, cron
  103, error 204, event 109, mcp 586, metrics 163, msg 338, qos 100,
  stego 91, storage 365, stream 212, tmp 203, vant 61, webhooks 153)
  plus the three census rows; the two never-twin'd files
  (test-integrations, test-utilities) convert through facade-surfaces
  first. The sweep-invisible graveyard ran from 31 files to ZERO.
- **The wave-6 IOU: paid on the final tree.** Full-table fires x2
  verdict-table-identical - **268 pack rows REFUSED, 0 EXPLOITED,
  0 BOUNDED, 6 honest skips across 21 packs**; library rows 48/0/1
  per fire. The native floor swept in three chunks (dash-governance
  74, guests-remote-storage 74, remote-transport-zen 71):
  **219/219 suites green, 0 failures, 0 timeouts** - the floor count
  holds exactly as enumerated, because the retired smokes were
  never part of it.
- Stamps: `--pack=vant-census` x2 (REFUSED 3 / 0 EXPLOITED / 4 not-
  armed skips); contract **379/0, exit 0 x2** with facade-surfaces
  graded honestly `skip` in-suite; `packs:lint` 21 packs / 295 ids;
  `packs:audit` clean with the pinned known finding; determinism
  lint flat (21 files). The graveyard is closed; the legacy-runner
  era is over in both directions (deleted files AND real coverage
  now riding pack rows + modern suites).
