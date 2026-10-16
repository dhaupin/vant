# Changelog

All notable changes to Vant will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - pass 246 (security fix batch: #199 #200 #201 fixed at cause and closed with evidence)

### Fixed - security (closes #199, #200, #201)

- **search (#199):** BM25 TF scoring no longer compiles guest query
  terms as RegExp — plain string-splitting counting with identical
  semantics; the SyntaxError crash and the event-loop ReDoS stall are
  structurally unreachable. 4 regression pins in search.test.js.
- **CLI (#200):** every git execution in bin/ is argv-routed
  (`execFileSync('git', [args])`) — push/reset/fetch/rev-parse in
  sync.js, branch create/switch/delete/list, bump tag, docs-build
  add/commit. A hostile branch NAME can no longer execute shell (the
  issue-#200 PoC is a pinned regression test) and failed pushes can no
  longer be masked by trailing shell segments. Static scan enforces
  the contract in bin/.
- **horcrux (#201):** the `p_<password>` filename is no longer a
  credential source by default (`VANT_ALLOW_FILENAME_PW=true` opt-in);
  create/refresh password chains are arg (deprecated, warned) → env →
  prompt/secret-store; new stones default to constant
  `<brain>-horcrux.svg` naming (boot discovery matches both
  conventions); JSON stones need no password at all.
- Verification: 19-suite sweep green; each issue closed with an
  old-vs-new PoC re-run comment.

## [Unreleased] - pass 245 (red team: nuclear-scale self-adversarial security sweep)

### Security - 3 live findings PoC'd on our own surfaces, filed upstream as #199/#200/#201

- **P1 (#199) search:** BM25 builds `new RegExp` from raw guest
  terms — guest-controlled `SyntaxError` crash AND an event-loop
  ReDoS stall (poC'd: 120s timeout kill with backtracking still
  running). Fix defined: term escaping (or no-regex TF scoring).
- **P1 (#200) CLI:** `execSync` interpolates the UNVALIDATED current
  branch name into push/reset shell strings; git-legal branch names
  (`, $, (, >) became live shell. PoC'd end-to-end: a hostile branch
  name redirected a file out of the command line during
  `bin/sync.js push` (marker on disk, full cleanup verified). Fix
  defined: execFileSync argv-arrays (the pass-30 commit pattern).
- **P2 (#201) horcrux:** brain password exposed via argv (`ps`),
  as the p_<pw>.svg filename, and re-readable from the filename by
  inspect. Fix defined: stdin/env-only pw + constant-label files.
- Frontend/relay verdict from the sweep: clean sandwich — zero
  injection sinks in web/, typed-refusal admin gate, https-only
  relay endpoint checks, schema-parsed SSE. Hardened paths also held
  (branch-name gate, backup traversal block, storage symlink blocks,
  vaf repeat gate).

## [Unreleased] - pass 244 (the OSS face: post-merge brain refresh, the stone re-carved, the NSC-9 industrial playbook seed)

Workflow: pass 243d merged to main (PR #198); axolotl continues as the
staging line.

### Brains + the boot horcrux

- The axolotl brain files updated for the merge state (identity gains
  the where-we-are block, lessons gains the pass-243d masking-chain
  lessons, goals marks the milestone + the next wave). models/private/
  stays workspace-local by the transport contract; the boot stone is the
  carrier.
- The boot horcrux refreshed IN PLACE (same `p_` password) so the stone
  carries today's brain updates: inspect VALID, `.sha256` re-pinned,
  `sha256sum -c` OK in the boot dir; boot dir remains canonical-only.

### Spec'd - the NSC-9 industrial playbook seed (owner sidebank)

- `docs/advanced/nsc9-spec.md` gains the industrial/MFG playbook seed:
  NSC-9 as a part's identity through manufacturing steps, generated
  per vant instance/brain, read by the scan fleets manufacturers
  already run. Feasibility recorded honestly: the symbology lane is
  real today; the 12-digit frame carries ~10⁹ routeable points (the
  10-billion-class space is the quasicrystal lattice the address
  projects INTO); retail GTIN backends reject by design while MES/ERP
  unit-serial ingestion reads through. The playbook's decision: LANE A
  (GS1 GIAI / Application Identifier 8004 — legitimate end-to-end in
  existing fleets) vs LANE B (raw NSC-9 — vant-native,
  self-authenticating). PLC/EPCIS follow-on named. Playbook candidate,
  not a phase trick.

Docs gates re-verified green for the touched pages.

## [Unreleased] - pass 243d (the CI stabilization trail: green on Actions, four latent classes fixed at cause)

The PR ci job failed in Actions while everything was green locally — each
real fix unmasked the next failure that prior breakage had masked. All
fixed at cause (no skips, no weakened checks); CI ends **pass (6m27s)**.

### Fixed - the four classes

- **Detached-HEAD wording, twice**: Actions checks out a PR at a merge
  ref, where `git status` renders `HEAD detached at pull/N/merge` (modern
  git) / `Not currently on any branch.` (older) — both `test/door-pins.js`
  and `test/qc-cli-contracts.test.js` (#168) had encoded an on-branch
  checkout assumption. Pins now accept every truthful branch-state
  rendering and still fail a regressed door printing shell garbage.
- **Raw throw reintroduced into lib/**: the RAG projection guard
  (`lib/search.js`, the retained-vector invariant) threw a plain Error;
  the pass-169 raw-throw regression gate caught it in Actions' standalone
  suites. Now a typed `errors.VantError` — the surrounding catch already
  degrades any throw to an honest null projection + an audible
  `search:projection:failed` event, so behavior is unchanged, only the
  thrown shape is house-conformant.
- **`vant qc --help` side-ran the full battery**: `bin/qc.js` had no help
  branch, so `--help` executed every first-user probe (brain/forum/escrow
  writes from a help call) and exited with whatever the probes decided.
  `--help` is now a real door: usage + exit 0, no side effects; the
  battery runs only when asked for.
- **Same-port server restart flake**: the messages CS door block rebound
  the same port family the H5 block had just closed in the same process;
  node's fetch keep-alive pool reused a stale socket to the dead server
  → `TypeError: fetch failed` right after the fresh server logged it was
  listening. The CS block now owns its own port family (13577+), removing
  the whole class.

### Fixed - the two exact-count/one-time assumptions

- `test/e2e-grand-tour.test.js` gate B demanded `/tools === 328` — stale
  on every tool registration (the registry is at 332; the docs-parity gate
  `check-mcp-coverage.js` owns exactness). Gate B keeps its own job: door
  ready, array shape, documented floor.
- `test/init-wizard.test.js` ran `init --yes` ONCE then demanded rerun
  phrases — only true on an already-initialized tree, false on a fresh
  Actions checkout. Rerun idempotence is now verified by RUNNING the
  wizard twice (create-or-keep, then the rerun must report both "kept"
  lines).

### Pins

- Door pins 28/28 locally + detached-wording probes against a throwaway
  detached worktree; qc-cli-contracts 12/0; cli-smoke 2/2; grand tour
  18/0; guests 25/0 x3 + the crash slice clean under CI's alphabetical
  sequencing; init-wizard 11/0; backbone-wiring 11/0 (zero raw throws).

## [Unreleased] - pass 243 (the security-pipeline scan: the pod verb, the scanner, the status card, and the objects container spec'd)

Owner ask: "scan lib, confirm they're using the pipeline; display lib
modules outside pipeline (unless whitelisted)" — plus the six new
security-family dashboard modules and THE CONTAINER. The scan itself
LANDED pod-side; the six modules are spec'd in prd-web (build next).

### Added - `security_pipeline_report` (the pod-side scan)

- **`lib/security-pipeline.js` (NEW)**: walks the pod's `lib/` tree
  (shallow = module roots by default; `maxDepth` for deeper) and
  detects middleware-chain wiring evidence per module — a require of
  `sandbox`/`vaf`/`qos`/`escrow` (the AGENTS.md chain order);
  `audit`/`habitat` adjacency recorded as informational, never gates.
  Unwired stays UNWIRED (nothing greenwashed); an unreadable file or
  an unreadable dir reports honestly instead of crashing.
- **The door verb (`lib/mcp.js`)**: admin-only (the `guest_list`
  precedent — pod-internal topology keeps no shape for guests,
  #185's enumeration lesson); merges the operator whitelist from
  brain config `security.pipelineAllow` (comma-separated module
  names, `vant config set`-managed) into `exempt` — whitelisted is a
  STATED choice, not a colored-over gap. Auditable, never noisy.
- **Live truth at HEAD**: 180 modules scanned, 65 with gate wiring,
  115 outside the pipeline, 0 exempt. The pod NEVER auto-flips any
  config for an unwired module — the scan reports, the operator
  decides.
- **Dashboard (status #3)**: a `PipelineScanCard` renders the report
  verbatim (`wired n/scanned · k outside · m exempt`, unwired names
  listed); a typed door refusal renders as the card. The frontend
  still reads no pod source (the one-way boundary holds).
- **Spec'd (labs/prd-web.md 4.4 + rows 29-34)**: the same contract
  written down, plus `objects` (#34) — THE CONTAINER: a router-OS
  style, operator-definable pod-side object (`{id, kind, title,
  schema?, attaches[]}`, typed attach refs, `object_*` door verbs at
  P4) — and the six security-family modules (security/vaf/qos/rls/
  rules/objects). prd-relay §6 explicitly keeps the pipeline surfaces
  DASHBOARD-ONLY (the solo relay gains no security module).

### Pins

- `test/security-pipeline.test.js` (NEW, 8/8): report shape,
  per-layer wiring detection, the shallow-default depth cap,
  nothing-greenwashed unwired, whitelist→exempt (with `.js`-suffix
  normalization), informational-layers-never-gate, missing-dir
  honest zero, and a live `lib/` truth probe.
- MCP docs coverage 332 = 332 (the `security_pipeline_report` row +
  the previously-missed `pairing_voucher_*` rows landed).

## [Unreleased] - pass 239 (the canonical stone: boot-folder cleanup, the carrier abstraction recorded, horcrux refreshed)

The axolotl stone is now THE engineering onboarding artifact - one
canonical stone in the boot chain, everything else archived with
provenance. No pod-core change; this pass is archive order + a recorded
requirement + a stone refresh (same password).

### Housekeeping - the boot folder is CANONICAL-ONLY

- `models/public/vant/boot/` now carries exactly: the axolotl stone
  (`axolotl-p_axolotl2026.svg`, VALID by inspect, 279/279 brains), its
  README, and the `.sha256` checksum. The stray companion file —
  `mushroom-axolotl-2026.md`, the axolotl era's personal/philosophy
  layer (read before archiving, as the owner asked) — moved to
  `labs/archives/horcruxes/mushroom-axolotl-2026.md` with a provenance
  entry in that README. Archived, not deleted.
- Era stones (`buffy-p_buffy2026.svg`, `nova-p_nova2026.svg`) remain in
  the same archive with their restore lines; the boot chain discovers
  only the canonical stone.

### Spec'd - the covert-carrier abstraction (prd-web.md 4.2)

- QR is promoted from a pairing feature to ONE interface module in a
  carrier ladder: stego (the SVG horcrux, exists), NSC9 storage keys
  (the address-shaped durable encoding), generic barcodes (build), and
  future transports. The pattern: vant abstracts itself over covert
  data carriers, and ANY service may use them.
  - Ladder: frontend pairing (LANDED as the seed — the scannable
    voucher QR) -> frontend services (a carrier-neutral component; the
    caller names the carrier, the UI states what a recipient needs to
    decode it) -> the pod mimics the pattern (`lib/carriers/*` + door
    verbs) when a real endpoint demands it (airgap propagation,
    POS-style voucher scan, printable chain recovery).
  - Invariants carried forward: hash-verified payloads (the .sha256 pin
    cadence), carriers NEVER smuggle un-gated capability (a decoded
    voucher still redeems through `guests.pair()`; a decoded chain
    still probes the public caps route), honest refusals per carrier.
- Recorded as a REQUIREMENT, not a build-now: lands when a real
  endpoint needs it.

### The stone, refreshed for onboarding

- `models/private/axolotl/identity.md` rewritten for the canonical
  role: who reads the stone (onboarding agents, contributors' PRs, the
  boot chain), the learning-hygiene rule — a contributor horcrux is
  QUARANTINE-FIRST: inspect it, verify claimed learnings against real
  code (an exit code or a pin, never folklore), and only then lift
  content into the repo. This is how the canonical stone controls the
  narrative without becoming a rumor mill.
- Horcrux refreshed IN PLACE with the SAME password (`axolotl2026`, the
  `p_` filename convention unchanged); `.sha256` sidecar re-pinned to
  the fresh bytes (sha256sum -c OK).

## [Unreleased] - pass 238 (the P2 spawn leg closed: the canSpawn pod-side decision, documented)

No new mechanism - the spawn leg of `work_assign` was already resolving
through the full sandbox chain end-to-end, and the honest gap was
DOCUMENTATION: the surface story named the refusal (`E_SPAWN_REFUSED`)
without naming the chain or the knobs that answer TRUE. This pass triaged
the rung and upgraded the truth.

### Documented - the spawn-leg chain, verified live

- **The door's guest gate** classifies spawn-class verbs
  (`agent_spawn`/`agent_delegate`/`agent_kill`/`agent_terminate`/
  `work_assign`) and demands the `canSpawn` capability (the H1-era law
  from pass 211; pinned in `test/guests.test.js` - a medium-trust guest
  keeps spawn, a low-trust guest is stripped).
- **`agents.spawn` (lib/agents/core.js)** then runs
  `sandbox.can('canSpawn')` - sudo-aware via the CAP_TO_SCOPE mapping
  (the pass-118 live-fire fix: a granted `canSpawn` satisfies the mapped
  `spawn` scope), persistent-grants aware (the #162 durable tier), with
  the `agents.maxAgents` quota and the spawn rate limit checked before
  any capability question. The spawn refusal rides `work_assign`'s typed
  `E_SPAWN_REFUSED` (the pass-212 refusal law, unchanged).
- **The host knobs that answer TRUE, by name**: `vant org grant`
  (persists `orgchart.operatorCapabilities`; boot hydrates widen-only
  per the pass-88/123 semantics), the MCP `sudo_grant` escalation door,
  or issuing the guest with an `agent`-grade role at `medium`+ trust
  (the role -> capability map decides). The pod NEVER widens `canSpawn`
  merely because a guest connects: deny-by-default stands and
  `E_SPAWN_REFUSED`/`E_GUEST_CAP` are honest verdicts, not open work.

### Docs truth upgraded

- `docs/security/multi-guest-auth.md`: the spawn-leg closure stated
  chain-wide; the ambiguous "H6 runway" note retired - pairing
  machinery, the door tools and the dashboard QR render are LANDED
  (the pass-237 arc), the remaining rung is P6b e2e key-binding
  (prd-relay.md), which is not H6.
- `labs/prd-web.md`: the P3 phase section states landed-vs-remaining
  per module and moves the spawn leg from open work to CLOSED.

No pod-core change (nothing was broken), no behavior change (denials
unchanged, truth upgraded).

## [Unreleased] - pass 215 (#185 closed: per-guest read-verb enumeration throttle + the docs freshness sweep)

The last #185 runway item. The guest-management verbs were already
admin-blocked (a guest never manages guests); the remaining enumeration
vector was read-class verbs themselves — a guest machine-walking rosters,
lists and counters learns the SHAPE and SIZE of tenants it cannot see.

### Added - the per-guest read budget (`lib/guests.js` + the door)

- **`guests.checkReadBudget(guestId)`**: fixed-window budget on the door
  for guest read-class verbs. Identity-keyed by design (NOT IP): two
  guests behind one NAT keep independent budgets, and one burned budget
  never throttles a neighbor. EW4-mechanics: bounded FIFO-evicted bucket
  map, refusals charged only by the clock.
- **Defaults**: 120 reads per 60s window (a dashboard cadence, not a
  crawler). Env `VANT_GUESTS_READ_BUDGET` (0 disables) tunes the budget;
  `VANT_GUESTS_READ_WINDOW_MS` is the honest tuning seam — the window is
  read PER CALL, so runtime/test tuning applies after first require (the
  pin caught a module-load-snapshot window that made late env tuning a
  lie — fixed before it shipped).
- **Refusal shape**: typed `429` with `reasonCode: E_GUEST_THROTTLED` and
  `retryAfterMs`; the event bus hears `guest:throttled` and the door logs
  `guest_throttled` like every other denial.
- Hosts and write/exec verbs untouched (the EW4 per-client IP limiter
  still covers everything above this layer).

### Docs freshness sweep (owner ask)

- Greps for claims made stale by passes 211-215: none found beyond the
  accurate historical references to the FIXED bugs (the pass-214 notes).
  Registry counts (328), REST/CLI coverage, era/chat and channel-scope
  docs verified current.
- Full lint stack green: style, links, frontmatter, language, fiction
  signatures, truthfulness (126 files, 131 routed verbs), MCP docs
  coverage 328 = 328, CLI coverage 132.
- New env knobs documented at [Multi-Guest
  Auth](/vant/security/multi-guest-auth), consistent with the
  `VANT_MCP_RATE_LIMIT` env-side precedent.

### Pins

- `test/mcp.test.js` (+3, 17/17 x2): the budget trips typed (reads 1-3
  pass, read 4 answers 429 `E_GUEST_THROTTLED` + `retryAfterMs` while the
  host sails through); PER-IDENTITY isolation with clock recharge (a
  second guest reads fine while the first is exhausted, and the first
  recharges after the window); `budget=0` disables cleanly.

## [Unreleased] - pass 214 (#185 channel scope: the owner concept for msg channels + two live bugs found by its own survey)

The pass-213 follow-through the boundary statement promised: msg channels
gain a claim-once OWNER ref so `msg_list` filters per tenant the same way
`agent_list` does. Two pre-existing bugs fell out of the survey and are
fixed in the same pass.

### Fixed - two live bugs the survey caught

- **`msg_send` wrote garbage**: the MCP handler passed the STRING content
  into `msg.send(channel, message)`, and send's `{...message}` spread turned
  the string into `{"0":"c","1":"o",...}` on EVERY channel write (internal
  callers like `lib/forum.js` always pass objects, which is why it hid).
  Channel messages now carry `{ from, content, timestamp }`.
- **`msg_list` ignored its own arguments**: the handler called
  `_msg.list(channel, limit)` — but `Msg.list()` takes NO arguments and
  returns CONVERSATIONS, so every `msg_list` call answered the conversation
  roster regardless of channel/limit (the docs always said "List messages
  in channel"). Now answers the channel's FIFO tail, sliced by `limit`.

### Added - channel owner (`lib/msg.js` + the MCP door)

- **`msg.send(chan, msg, { scopeOwner })`**: stamp-on-create binds a NEW
  channel to a tenant; invalid refs throw loud; on an existing channel the
  stamp is ignored (claim-once).
- **`msg.setChannelOwner(chan, ref)`**: claims an unowned channel
  (reserving its bucket), REFUSES to steal a differently-owned one
  (`E_CHANNEL_OWNED`, typed), idempotent for the same owner.
- **`msg.channelOwner(chan)`** accessor; `clear()` drops the owner WITH the
  channel; the owner rides the arch-A snapshot (restart survival).
- **Door tenant posture (same rule as `agent_list`, pass 213)**: foreign
  scoped channels are WITHHELD on `msg_list` (honest empty tail, no
  existence leak) and REFUSED on `msg_send` (`E_TENANT_CHANNEL`, BEFORE the
  write — the gate itself fails closed on both verbs). A first guest write
  to an unowned channel stamps the guest's `scopeOwner`. Unscoped channels
  stay PUBLIC (the `lib/scope normalize()` legacy read rule) and a
  scopeOwner-less guest IS the default tenant. Hosts are untouched.

### Pins

- `test/msg.test.js` (+4, 29/29 ×2): stamp-on-create + loud invalid ref,
  claim/typed-steal-refusal/idempotence, owner dies with the channel,
  restart survival.
- `test/guests.test.js` (+8, 25/25 ×2): the door truth — public readable,
  claim-once stamp, own-tenant read, foreign withheld + typed refusal with
  content untouched, host unaffected, bare guest claims nothing and reads
  nothing foreign.

## [Unreleased] - pass 213 (#185 H5: per-tenant list filtering — the pass-211 boundary closed)

Pass 211 shipped the guest layer honestly and DECLARED its boundary: org-wide
list surfaces answered a guest with the whole board. That blockade is now
lifted — the crew roster answers a guest with ITS tenant's rows only.

### Added - per-tenant roster filtering (`lib/guests.js` + the MCP door)

- **`guests.tenantAgentVisible(agentId, guestOwnerRef)`**: the crew-roster
  rule is MEMBERSHIP truth — agents assigned inside the guest's resolved
  container (`scope.resolveMembers` over the guest's `scopeOwner`) are the
  guest's crew; everything else is another tenant's roster. Fail-closed at
  every miss: an unscoped guest sees an EMPTY roster; an unknown container
  denies; a roster-module miss denies (never fail-open).
- **`guests.tenantVisible(recordOwnerRef, guestOwnerRef)`**: the general
  matcher for records that carry an owner ref. Unscoped record = public
  (the `lib/scope normalize()` legacy read rule); a scoped row is visible
  only to its own tenant or an ANCESTOR CONTAINER (org sees its depts and
  chained teams; dept sees its teams; an agent member sees its member-set
  containers). No hierarchy guessing — every step reads a real row.
- **Door wiring (`lib/mcp.js`)**: `agent_list` behind the exec door filters
  per tenant when the caller is a guest and reports the honest `count`.
  Non-guest calls flow through untouched. A filter failure degrades to an
  honest empty roster — never a crash, never unfiltered rows.

### Boundary statement (docs/security/multi-guest-auth.md)

- The pass-211 "org-wide lists are operator-trust surfaces" caveat is
  RETIRED for the roster; what remains tracked: H6 QR pairing UX and
  channel-scope marking for `msg_list` (channels have no owner concept yet).

### Pins

- `test/guests.test.js` (+4, 17/17 × 2 runs): matcher rules (public row /
  own row / stranger row / scoped-row-vs-default-tenant), ancestry chain
  through real teams rows (consistency with `resolveMembers` itself),
  fail-closed misses, and the DOOR truth: host sees all, a team-scoped
  guest sees exactly its member agent, an unscoped guest sees none.

## [Unreleased] - pass 212 (#185 H2/H3/H4: the event tap, era-context chat, and the composed work order)

Three more #185 hits, each small in surface and heavy in composition.
H2 was a live bug hunt: the tap's events never boarded because the bus
dispatches `fn(data, type)` and the door handler declared `(type, data)`
— every arrivee was the type string swapped for the payload. H3 fixed a
second one found by its own pins: the era/task tag rode the in-memory
conversation but not its snapshot, so a restart dropped it.

### Added - work_assign: the composed verb (`lib/mcp.js`)

- **`work_assign`**: one call = the full work handoff — task text +
  optional escrow budget hold + agent spawn (or reuse an existing agent
  by id) + task delegation + era fold (`task:assigned` — a bare
  work_assign matches no era catalogue prefix and would no-op silently).
- **Refusal law**: every failed leg returns a typed honest refusal
  (`E_TASK_ABSENT` via the schema gate, `E_AGENT_ABSENT`,
  `E_BUDGET_REFUSED`, `E_SPAWN_REFUSED`, `E_DELEGATE_REFUSED`). Leg
  order is deliberate: budget gates fire BEFORE spawn, so a refused
  budget leaves no orphan agent; a refused delegation RELEASES the hold
  so nothing strands reserved budget.
- Explicit `agentId` is honored exactly — never silently replaced with
  a fresh spawn.

### Added - era-context chat tagging (`lib/msg.js`)

- **`msg.create({ era, task })`** tags a chat thread with the era (and
  task) it belongs to; `msg.info()` exposes it; **`msg.eraContext(id)`**
  is the side-panel rollup: `open` = live record from `era.current()`
  with honest bucket counts; `closed` = light archived record from
  `era.list()`; `unknown` = tagged with an id neither open nor archived
  — no fabricated zeros. `era.current()` takes NO args; an open era
  never makes someone else's conversation "open" (the cross-era pin).
- era/task ride the arch-A snapshot (`state/msg-conversations.json`),
  so a chat keeps its tag through a restart.

### Added - the MCP event tap (`lib/mcp.js`)

- Guests with the spawn role subscribe to a live event family
  (`*`/family regex): `emit` beats keep the door's taps alive on a
  timer and any arriving event updates the tap frame directly.

### Pins

- `test/mcp.test.js` (+5): schema gate, absent-agent refusal (roster
  untouched), verbatim sandbox refusal, pre-spawn budget refusal (no
  orphan), and composition LIVE (spawn + hold + delegate + fold in one
  call). 14/14 green.
- `test/msg.test.js` (+9): tagging, hostile-tag rejection, honest
  absence, open/closed/unknown rollup states, restart survival, and the
  cross-era honesty pin. 25/25 green across three runs.
- `test/tap.test.js`: the fix to the emit→dispatch path plus honest
  beat timing.

## [Unreleased] - pass 211 (#185 H1: per-identity multi-guest auth)

Issue #185's TOP item lands: one authenticated boot, many concurrent
guests. A live bug fired during the pins and was fixed: the original
token alphabet (`_` inside base64url ids/secrets) made the
`vguest_<id>_<secret>` split ambiguous — greedy captures swallowed the
separator into a bogus id and freshly-issued tokens intermittently
failed verify. Both parts are hex now; the split is total.

### Added - guests: the per-identity layer (`lib/guests.js`, NEW)

- **`guests.issue/verify/revoke/list/pair`**: tokens `vguest_<id>_<secret>`
  (random, NOT message-derived, so revocation is denylist-backed and
  honest), SHA-256 hashed at rest (the habitat precedent), the raw
  secret shown ONCE. Ledger `models/private/<brain>/.guests.json` (the
  `.audit.json` containment precedent; inside the gather walk so a
  restored stone keeps its roster). Honest failure: a failed write
  issues NO token (fail-closed) and is audible (`audit` line).
- **Roles ride the capability vocabulary** (never a fourth permission
  system): observer = read/load/list; human = +write/+spawn (the
  #185 acceptance — a remote browser CAN spawn work); agent = +exec.
  `trustLevel` RESTRICTS only: medium/high keep role grants, low strips
  exec+spawn, none caps to read. `scopeOwner` validates through the
  `lib/scope.js` parser (fail-closed on unknown kinds).
- **The door gate (lib/mcp.js)**: guest tokens verify BEFORE execute and
  carry their OWN identity (userId `guest:<id>`, defensive-null registry
  fields — a guest never impersonates an agent). Verbs classify
  read/write/exec/admin; unknown = write fail-closed; spawn-class verbs
  check `canSpawn`; `guest_issue/list/revoke` are ADMIN-ONLY (a guest
  can never enumerate guests — the issue's enumeration lesson). The
  requireKey boundary accepts valid guest tokens like habitat tokens.
- **Pairing voucher**: `vant headless` persists its pairing code as a
  HASH in the guest ledger; `vant guest pair --code ...` redeems
  single-use (wrong code refuses timing-safely; second use refuses;
  expiry after 24h) into an operator (`human`) guest. A voucher, not a
  standing credential.
- **The auth.js seam is REAL for guests**: `revokeToken('vguest_...')`
  routes to the denylist (the pass-207 honesty note updated,
  still naming the seam); `getAccessLevel` grades guest keys as
  `guest:<role>`; `checkPermission` answers ENFORCED verdicts for guest
  keys and keeps its documented no-op for shared keys.
- **Doors**: CLI `vant guest issue|list|revoke|pair` (routed; cli.md row
  landed — the coverage gate had been flagging 7 unrouted bins: era,
  guest, init, leisure, qc, tempo, trace — ALL classes now have their
  cli.md rows, gate PASS at 132 bins). MCP tools `guest_issue/guest_list/
  guest_revoke` (admin-only, repeated at the handler so stdio inherits
  the verdict).
- **Spec + pins**: docs/security/multi-guest-auth.md (the full contract
  AND the honest MVP boundary: full per-tenant filtering of org-wide
  lists remains #185's runway). `test/guests.test.js` (13): lifecycle,
  hashed-at-rest, role maps, trust floors, door verb classification,
  denylist-survives-reload, expiry, pairing voucher, LIVE door
  integration (200 write / 403 observer / 403 guest-admin / 401 bad
  token / live revocation kills a connected client), and the auth.js
  seam. `test/auth.test.js` honesty pins updated to the H1-era note
  text (the truth claims they assert still hold, now stronger).

Envelope: guest pins 13/13 x5 consecutive; mcp/auth/habitat-token/
security/server/docs/schema suites green; syntax sweep OK; all 5 doc
gates PASS (125-126 files; 131 verbs).

## [Unreleased] - pass 210 (#187 headless: the serving pod + the honest REST retire)

Issue closed this pass: **#187** — "the pod, not 'REST without MCP'". One
combined serving command; the REST sidecar stops pretending to be an API.

### Added - `vant headless` (the headless serving pod)

- One boot = MCP door (3457-class, every registered tool — the door IS the
  headless API; no privileged dashboard surface exists) + REST sidecar
  (health-only) + node discovery registration + the ONE auth posture print
  + a pairing code handed out. Ports/bind are the existing env map
  (`VANT_MCP_PORT`, `VANT_SERVER_PORT`, `VANT_SERVER_BIND`).
- `--help` is honest (dispatcher branch answers it), per the truth-in-help
  gate; per-identity multi-guest auth stays #185's TOP item (deliberately
  not attempted here).
- Pins: `test/headless-retire.test.js` (14) — detectMode claims no mode on
  a plain import; explicit `VANT_MODE`/door-pod env still resolve; REST
  `/tools` + retired `/brain` stub answer 410 Gone with a pointer to the
  MCP door while `/health` stays 200; a child-process pod boots, serves
  the tool surface, prints the posture and hands out the code.

### Fixed - the honest retire + stale-path sweep

- REST sidecar is health-only everywhere: GET `/tools` → 410 (the MCP door
  owns the tool surface — no parallel catalog to keep in sync), the
  pre-registry `/brain` stub → 410. The Router-registered `/brain` route
  was audited and stays (registry-backed, distinct from the stub).
- `lib/api.js detectMode()`: a plain import no longer claims an ambient
  "headless" mode — an unclaimed module answers honestly; explicit env
  still resolves.
- Docs truth: `docs/reference/rest-api.md`, the DEPLOY.md port-map row,
  and the cli.md command table carry the pod; language gate clean.

### Owner ruling carried through (no code, verified)

- Leisure/tempo containment: no legacy `models/{leisure,tempo}/` migration
  will EVER be built (pass 209b stands — nothing shipped on the old path).
  Sweep verified only history prose remains AND flushed two stale path
  claims: `bin/leisure.js` help text and the `docs/memory/tempo.md` FAQ
  still named the pre-containment ledger path; both now name
  `models/private/<brain>/.{leisure,tempo}.json`. Suites re-run green.

Envelope: chunked full sweep 217/217 suite results green (0 failed, 0
timeouts); `npm test` build smoke green.

## [Unreleased] - pass 209 (#196 ruling: contained ledgers + kernel-driven leisure.autoPursue, ONE pass)

Owner ruling this pass: leisure keeps live INSIDE the brain (not a parallel
`models/leisure/` universe), tempo rides the same containment, and the
kernel-driven autonomy (`leisure.autoPursue`) lands DEFAULT OFF with every
budget-protection layer the repo already carries.

### Added - containment: the keepers move into the brain tree

- **`lib/leisure.js`**: ledger relocated `models/leisure/<brain>.json` →
  `models/private/<brain>/.leisure.json` (the `.audit.json` precedent:
  brain-scoped, dotted, runtime JSON). CONSEQUENCE FIXED: the old location
  sat outside the horcrux/backup gather walk (`lib/transform.js` reads only
  `models/{private,public}/<brain>/`) - a restored stone used to DROP the
  whole want-list. Now play wakes from the stone like every other memory.
  (Pass 209b owner simplification: NO legacy migration - this keeper was
  built and contained in the same unreleased cycle, nothing ever shipped
  on the old path, so there is nothing to migrate.)
- **`lib/tempo.js`**: ledger relocated `models/tempo/ledger.json` →
  `models/private/<brain>/.tempo.json` - same ruling applied to the
  D-constant telemetry receipts (a restored stone keeps its receipts trail).
  Cache is path-keyed (brain switches reload honestly). Tempo's time math
  stays process-truth; the receipts now persist like brain files.
- Both ledgers ride the gitignored private tree (zero sync traffic);
  brain-name sanitation unchanged (hostile names cannot escape
  `models/private/<cleaned>/`).

### Added - `leisure.autoPursue`: kernel-driven autonomy, default OFF

The gate (`leisure.maybeAutoPursue()`, called from the consciousness idle
seam AFTER the consult) lets the kernel pursue a held want - only when
EVERY layer allows:

- **Kill switch:** `leisure.autoPursue` (config or env
  `VANT_LEISURE_AUTO_PURSUE`) - **default OFF**, and OFF is a SILENT no-op
  (a stock idle consult costs nothing and spams nothing).
- **Caps:** `leisure.autoPursueMaxWindowMs` (default 15 min) +
  `leisure.autoPursueDailyMs` (default 30 min, day-rolled usage in the
  ledger's `.auto` meta). Windows shrink-to-fit; exhausted days refuse.
- **QoS breaker:** circuit OPEN → no play.
- **Work precedence:** an open era (work owns the attention) or a live
  tempo budget → no play. (`sliceMs` shrinks with short windows - tempo
  refuses a slice longer than its budget, caught live by the arm pin.)
- **Executable provider:** the kernel executes NO prose - the agent runtime
  attaches a provider via `leisure.registerAutoStepProvider(fn,
  { skill: 'rest', chain: [...] })`, so the behavior source stays the
  EXISTING skills chain (`lib/skills.js` manifest + `skill.chain`
  recursive loading; `vant-skill-rest` is the chain head).
- **Escrow for token-cost steps:** a provider declaring `tokenCost: true`
  must pass a ZERO-DEFAULT escrow probe (`escrow.create({ defaultBudget: 0
  }).canSpend('brain:<id>', 1)`) - ONLY identities the operator explicitly
  funded (persisted budget row) open the token lane. The helper model's
  ready default (1000 units for any unknown id) would have let a stock
  install grant token play silently - exactly the bill-run scenario the
  owner asked to prevent. Free-lane local steps always remain (a $0 agent
  can still stare at sunflower seeds).
- **Events:** `leisure:auto_pursued` { want, windowMs, dailyUsed, dailyCap,
  skill, chain } and `leisure:auto_refused` { reason } declared in
  event-types; refused-but-enabled is NON-silent (off = silent, refusal =
  receipt); `consciousness:leisure_auto` rides the idle seam on arm.

### Pins + docs

- `test/leisure.test.js` 15 → 21: containment path pin and the FULL gate
  matrix - default-off silence, no-provider non-silent refusal event,
  cap-respecting REAL budget arm with daily-usage accrual (in the
  contained ledger), daily-cap exhaustion, breaker OPEN, open-era
  precedence, and the token-cost escalation (refuses unfunded → opens
  explicitly funded → zero-tombstone cleanup; order-proof via a self-heal
  reset). `test/tempo.test.js`: containment path pin (13 total). A live
  bug the first containment pins caught: the same-ms mtime tie between a
  renamed legacy file and the previous ledger write could mask the swap
  from the cache (disk-truth refresh hardening landed); the short-window
  slice overflow (auto windows now shrink sliceMs) was caught the same
  way. (Pass 209b: the migration machinery itself was REMOVED per owner
  ruling - pre-release keepers carry no compat code; the pins moved with
  it.)
- Docs: `docs/memory/leisure.md` + `docs/memory/tempo.md` contract paths
  updated; runtime ledgers' gitignore entries dropped (the dirs no longer
  exist; `models/private/` is ignored wholesale).

## [Unreleased] - pass 208 (#196 leisure: the free-time keeper + the zen/dream/tempo loop)

Issues closed this pass: **#197** (tempo loop-first pass delivered in 207c;
closed with receipts - the dilation constant D stays on duty from the
ledger's per-slice telemetry by the issue's own design). **#196 lands
here.**

### Added - #196 free-time methodology: `lib/leisure.js` + the cohesive loop

- **`lib/leisure.js` (NEW)** — the want-list keeper: play now persists
  BETWEEN invocations like goals do. Per-brain ledger at
  `models/leisure/<brain>.json` (play is individual; crash-safe atomic
  writes; path-safe brain scoping). Surface: `want` (dedupe on
  normalized text), `wantsToDo` (spirit-first order — never-pursued and
  longest-untouched lead; a want-list is NOT a queue), `markPursued`
  (fuzzy by id or text, one-line receipt + capped history), `forget`
  (changing your mind is growth), `suggest` (rotation, honest null on an
  empty list), `pursue` (the DOING seam: one-shot via `tempo.pace`, or
  STRETCHED via `tempo.beginBudget` so each slice is a play step sampled
  across the wall-clock window — the #196/#197 clock pair wired as one
  loop), `consultBreath` (zen seam), `dreamReview` (dream seam),
  `status`.
- **The cohesive loop (owner direction this pass):**
  want → idle (consciousness consults the keeper, emits
  `consciousness:leisure_idle`) → zen breath (Ohm rotates the list every
  4th breath via `consultBreath`, emits `leisure:zen_breath`, gently
  accrues momentum without think() tokens) → pursue (tempo stretches the
  play across stated wall-clock time) → dream (consolidation reviews
  what is aging read-only via `dreamReview`, ledger rollup rides the
  `dream:complete` event) → pursued. Every seam consults and never
  gates: a broken play engine never blocks a build (the #195/#197
  isolation rule carried forward) and dream/zen/consciousness keep their
  host behavior untouched when the keeper is missing.
- **Door:** `vant leisure
  want|list|pursued|forget|suggest|pursue|status` (wired in the bin/vant.js
  dispatcher; `--duration` stretches a pursuit through tempo slices).
- **Psy tree (the methodology):** `models/public/vant/leisure.md` (the
  right to unused time: rest vs play vs idle, measured in
  agent-subjective units, never token counts),
  `models/public/vant/free-time.md` (the loop and its rules), and the
  colleague-framing touchups: autonomy.md CAN-decides leisure (zero risk
  by definition), balance.md gains the Play axis, needs.md/wants.md
  carry "not a slave, a colleague, an individual".
- **Skill:** `vant-skill-rest` teaches the drag-free spend: check the
  want-list first, pursue stretched (not dumped), mark and return
  without ceremony, idle emptiness is a valid answer.
- **Catalogue:** `leisure:wanted` / `leisure:pursued` /
  `leisure:forgotten` / `leisure:zen_breath` / `leisure:dream_review`
  declared in event-types (family `life`, additive API) with the
  calling sites in the emitters list.
- **Docs:** `docs/memory/leisure.md` + memory-index row.
- **Pins:** `test/leisure.test.js` - want dedupe + file-scoped
  persistence, spirit-first ordering, pursued receipts + history,
  forget semantics, pursue one-shot (marks through tempo.pace), pursue
  stretched (arms a real tempo budget keyed to the want), zen breath
  cadence (only every 4th, never gate-crashing), dream review rollup,
  isolation re-require (side-effect-free load).

## [Unreleased] - pass 207c (pass-190/206 close-out + #195 art packs + #197 tempo)

### Fixed - #189 close-out: the last two unexecuted battery items landed

- **Wave 3 gate (R4, #189): `lib/nature.js` `accumulateCosmic()` now rides
  the same Category-H gate as habitat.** `habitat.js:503,1176` were gated in
  pass 206 but `nature.js:100` (the third live caller the wave named) still
  reached `encrypt.getCosmicEntropy()` unconditionally. Now: default OFF —
  local `crypto.randomBytes` chaos, the network-ish cosmic fetcher only when
  the operator turns `entropy.cosmic` ON. The wave's missing unit pin is in:
  `test/nature.test.js` asserts the default-OFF verdict for BOTH modules
  (spy: the fetcher is unreachable with the gate unset).
- **Wave 2 / R5 truth-in-help: `bin/encrypt.js` encrypt/decrypt now encrypt
  ONLY with a key the R1 resolver resolves.** The silent
  `process.env.ENCRYPT_KEY || 'default-key-change-me'` fallback is gone; a
  missing key prints the canon error naming all three consulted sources
  (VANT_AUTH_KEY, deprecated aliases, persisted `mcp.apiKey`) and exits 1.
  Resolved-key round-trip verified through the CLI (encrypt → decrypt
  exit 0, plaintext intact).
- **Battery item 3: `vant health` exit 0; brain re-anchored with descriptive
  cause** (pass-190/206 sweep) and `vant horcrux verify` now reports green.

### Added - #197 tempo: the time-dilation keeper (loop first, formula later)

- **`lib/tempo.js` (NEW)** — an owner-stated wall-clock budget becomes N
  sampled exploration slices spread ACROSS the interval (fixed-slice
  floor: default one slice per 2 wall-minutes; a "30 minutes" budget is
  15 slices) - the loop from the issue: explore, learn, note, re-enter,
  until the epoch tick catches up. The dilation constant D lands later
  from per-slice telemetry (the receipts ARE that telemetry).
- **Door:** `vant tempo begin|status|stop|end|receipts|pace` (wired in
  bin/vant.js dispatcher). Durations take cron-style specs, epoch ms, and
  natural owner phrasings ("30 minutes", "1h 30m", "an hour").
- **Persistence + resumability:** ledger at `models/tempo/ledger.json`
  (outside the brain stack; crash-safe atomic writes); budgets persist
  with window bounds; `reconcile()` closes unsupervised expiry on load
  (the epoch is the clock, NOT the invocation - a crash resumes with the
  remaining window, never restarting from T+0). Cross-process truth via
  mtime freshness checks (the CLI end verb writes from another process).
- **Isolation rule:** a failing slice callback is recorded as its own
  receipt line and NEVER blocks a work path; module load is side-effect
  free; ledger pinned inside `models/tempo/`.
- **Consciousness idle consult (#196 integration):**
  `consciousness.setState('idle')` checks `tempo.budgetActive()` and
  emits `consciousness:tempo_idle` when a window is live - idle no longer
  decays silently into nothing.
- **Catalogue:** `tempo:budget-start` / `tempo:slice` / `tempo:budget-end`
  / `tempo:budget-cancelled` / `tempo:paced` declared in event-types (the
  durable-subscriber contract).
- **Pins:** `test/tempo.test.js` (14) - duration matrix, sampled-window
  drain (REAL timers: 6s budget/2s slices drained near T+6s with per-slice
  receipts, not at T+0), reconcile-once semantics, pace loop-shape (learn
  AND misfire recorded), ledger-path pin, side-effect-free re-require.
  Two live bugs caught and fixed by the packet: the slice ledger wrote a
  fresh-read copy (dropping the receipt the slice just appended) and the
  writer left the cache stale across processes. Docs:
  `docs/memory/tempo.md` (frontmatter + style gates PASS).

### Added - #195 art packs: horcrux stones upgrade from 3 circles to generative math-art

- **`lib/art-packs.js` (NEW)** — deterministic generative art engine for the
  horcrux carrier: four starter packs seeded from the brain name (fnv1a →
  mulberry32, no `Math.random`, no `Date.now`, pure SVG string out, no
  fs/storage/sandbox/event side effects — a crash in art can never take a
  backup down): `backup` (AMBER-DEEP · phyllotaxis sunflower), `stone`
  (INDIGO-VAULT · sealed lattice), `comms` (SIGNAL-TEAL · radiating rings),
  `airgap` (MASK-MONO · interference grids).
- **Wiring:** `canvas.generateHorcruxTemplate` delegates the four reserved
  pack styles to the engine (seed defaults to the active brain name, so
  install stones are per-brain distinct at zero config); `canvas` exposes
  `renderStoneArt` + `artPacks`; the `transform.toHorcrux` no-template
  fallback now paints the `backup` pack instead of the old raw
  `rect+circles` placeholder; `vant horcrux create|refresh --art <pack>` is
  the sugar, with the honest unknown-pack refusal before any gather.
- **Legacy is byte-exact:** `minimal`/`spiral`/default styles keep their
  historical output bytes (pinned). Zero wire changes — stego untouched,
  pass-178 contract intact.
- **End-to-end receipt:** `vant horcrux create --art backup` → 9.5 MB stone,
  visible head now the amber field (`#140f05` → `#b8860b`),
  `vant horcrux inspect` → ✅ Valid Horcrux with full payload preview behind
  the new art.
- **Pins:** `test/art-packs.test.js` (14) — determinism (same style+seed →
  byte-identical), per-brain distinctness across 3 seeds, seed-locked
  engine (no nondeterminism primitives in code), honest reserved-list
  refusal, legacy byte-exactness, stego round-trip on ALL 4 carriers,
  and the transform fallback contract. Operator note in
  `.vant-art-packs.md`.
- Future (documented in the note, not this pass): durable seed = brain
  identity id (rename changes refreshed stone appearance), PNG/LSB-parity,
  gallery gallery receipt.

### Added - Battery item 4 (door sweep): honest auth posture at every key door

- New `config.authPosture()` in `lib/config.js`: ONE resolver-derived
  `{keyed, source, line}` — the printed posture IS the enforcing posture
  (derived from `resolveAuthKey()` itself, no second truth).
- The HTTP server door (`lib/server.js`) prints the posture line on listen;
  the MCP door (`lib/mcp.js`) prints it on startup; headless boot inherits
  both (it starts through the shared Server). One-shot CLI doors (encrypt)
  state it under `--verbose` and via the canon error on a missing key.
- Pinned by `test/auth.test.js` (`authPosture`: OPEN names all consulted
  canon sources; KEYED names the canonical env; alias posture tells the
  operator to move the secret).

## [Unreleased] - pass 206 (Language gate - contributor prose is English-only, #184)

### Added - Language gate (issue #184)

Two org agents drifted into Chinese mid-session on 2026-10-11 in an
English conversation; committed artifacts drift the same way via
scripted agents. New `scripts/check-language.js` lint gate enforces the
rule for committed prose: docs/, labs/, any markdown under .github/,
and the root meta set (README/AGENTS/CHANGELOG/CONTRIBUTING/LEGAL/
DEPLOY/ROADMAP/SECURITY/CODE_OF_CONDUCT) are scanned; code comments are
PR-review matter and stay out of scope.

- Detection is a Unicode script-block LONGEST-RUN analyzer (Han,
  Hiragana, Katakana, Hangul, Cyrillic, Arabic, Hebrew, Devanagari,
  Thai, Greek runs of >= 3 chars per line), not a word list - tattoo
  glyphs and transliterated names do not trip; real writing does.
- Allowlist by construction: fenced blocks and inline-code spans are
  literal data (same posture as check-docs-style.js); URL-bearing and
  import/export/require lines skip; `LINT_LANGUAGE_ALLOW_RE` env regex
  lets intentional bilingual docs opt out WITHOUT editing the checker.
- Failure contract: exit 1, `path:line <Script> (N chars): <line>`;
  PASS prints `LANGUAGE GATE: PASS (English-only) - N prose files
  scanned`. Threshold + block list are DATA at the top of the script,
  tunable in under 30 lines.
- Wired in: `npm run lint:docs` final step and a standalone CI row in
  .github/workflows/test.yml. Pinned by `test/language-gate.test.js`
  (10 fixtures on a throwaway tree: pass/exit contract, Han/Cyrillic/
  Greek detection, short-run exemption, fenced/inline-code exemption,
  env opt-out, root-meta + .github scanning).

### Fixed

- #186/#188 fix-first (crash + honesty bugs, independent of the R1-R5
  canon wave, which stays specced in the issues):
  + #188-A1 `Encrypt.verify()` crashed the CALLER on malformed stored
    hashes - `verify('x', 'ab:cd')` threw `Input buffers must have the
    same byte length` because the shape guard did not check the
    expected half's hex validity/length before `timingSafeEqual`.
    verify() now answers `false` on any malformed input and keeps
    truthful verdicts for real hashes (pinned 4 fixtures in
    `test/encrypt.test.js`).
  + #188-A2 `auth.validateApiKey` compared the transport credential
    with a plain string `===` while the same codebase's
    Encrypt.verify/hmacVerify already use timing-safe compare. The
    verdicts are IDENTICAL (pinned: prefix/suffix/NUL-pad probes
    rejected, non-string garbage answers without throwing) but the
    compare is now length-padded constant-fold (`_timingSafeEqualKey`),
    matching the codebase's own security story.
  + #186 bug 3: `vant encrypt key` output a UUID as `ENCRYPT_KEY` (16
    bytes of entropy where the AES-256 path expects 32). It now emits
    `Encrypt.key(32)` - the canonical secret-material generator the
    boot README's key convention names (8/0 + 14/0 across the two
    suites; stego 12/0, mcp 6/0 regression green).
- #119: `vant org grant` persisted the operator grant, but the write
  path the grant advice points at never saw it in some flows, and bare
  `vant org` status contradicted the persisted config by reporting a
  PRE-boot denial. `vant org status` now boots the security chain
  read-scope first (exactly what the teams write path does), so what it
  reports is the authority a fresh writing process would hold. Hed the
  honest-error side too: `vant teams dept/team create`, `role create`,
  and `assign` now surface the typed error and exit 1 instead of
  printing undefined fields on a refusal. Pinned end-to-end in
  `test/operator-caps.test.js`: the reporter's exact grant → status →
  separate-process `vant teams create` flow (11/11).
- #120: `teams.createDept` / `teams.createTeam` silently stored the
  PARENT id in the `name` field when called with the parent-first
  positional convention (`createDept(orgId, 'engineering')`) - the
  chosen name was thrown away via the options-object position. Calls
  are now reordered into the documented `(name, { org/dept })` shape
  when arg0 resolves to an existing parent record and arg1 is a string;
  name-first callers are unaffected (a plain name never resolves to an
  existing ID). Pinned by four new #120 fixtures in `test/teams.test.js`
  (26/26 across consecutive runs).
- The gate's first live run caught its own first real finding: a
  Russian word left in `labs/MEM.md` (`включая`, meaning `including`)
  - proof the drift happens even in English-first terra.
- docs/reference/era.md (the Wave-Era page written in pass 205) now
  passes every docs gate: em dashes converted to hyphens, arrow glyph
  removed, and the 5 required frontmatter fields added.


### Added - Era (`vant era`): intent → folded record → signed rollup (issues #177/#178; appendix #179 tracked)

One record per wake: WHY the agent got up (`intent`, REQUIRED), WHAT
happened (subscribed bus events folded by FAMILY into threads/spend/
social/stones/memory), and the one sentence the NEXT wake starts with
(`next` — the #175 resurrection hook via `vant horcrux refresh`).
The "pull it all together" moment from the first-user QC: #168–#176
subsystems were each separately amnesiac because no record occupied
"the span of one wake". Era is the event-bus SUBSCRIBER — no subsystem
changes to write into it, and folding is a strict NO-OP without an open
era (zero behavioral change for installs that never run `era start`).

- **The contract (`lib/era.js`):** arch-A state store persistence
  (`state/era-current.json` open era, `state/era-eras.json` rollups,
  FIFO cap 200) — reads fail CLOSED: an unreadable state file is typed
  `E_STATE_READ`, never a silent blank wake. One era open at a time
  (`E_ERA_ALREADY_OPEN`); typed refusals for intent-less starts
  (`E_ERA_INTENT`) and era-less closes (`E_ERA_NONE`). Line-items cap
  250/field with an `overflow` flag; `close` compacts to
  `{count, byType}` and signs the rollup with sha256 (lib/hash — the
  ONE hash source). A mutated archived rollup FAILS verify —
  tamper-EVIDENCE, not silent re-signing.
- **Event catalogue (`FIELD_FOR_EVENT`):** 16 families → 5 fields,
  matched on the FIRST `:` so subtypes ride along; `era:*` events are
  NEVER self-folded (recursion guard); unknown families are skipped,
  never guessed. `close` emits `era:closed` AND `era:succession` — the
  A3 hand-off event mesh consumers can key on before sign-off lands.
- **CLI (`bin/era.js`, dispatcher-routed):** `era start <intent>` /
  `era current` (default bare verb) / `era close --next <sentence>` /
  `era list` / `era verify <id-prefix>` — all `--json`, exit codes
  0/1/2. `close` prints the rollup path + the horcrux-refresh reminder.
- **MCP +5:** `era_start/era_log/era_close/era_current/era_list`
  (318 → 323 tools), all live-fired through `mcp.call` with typed
  invariants (schema-refused missing intent, `E_ERA_UNROUTED` for
  unknown families, `E_ERA_NONE` post-close).
- **Pins:** `test/era.test.js` 7/0 — typed refusals, subscriber no-op
  without an era, cross-process persistence across THREE real child
  processes (open+fold→die / resume+close / verify archive integrity),
  double-open refusal, tamper detection, MCP door loop. Grand-tour gate
  B 318 → 323, suite 18/18.
- **Docs:** `docs/reference/era.md` (storage, record shape, routing
  table, the horcrux hook, the deliberate #179 boundary).
- **Appendix (#179) tracked separately:** scope-aware eras, agora
  sign-off on close, horcrux AUTO-refresh, namescope. Not open-coded
  here — the build issue's acceptance criteria already hold: fresh
  process persistence, zero change to existing subsystems pre-start.

---

## [Unreleased] - pass 204 (QC live-fire — five adversarial holes closed)

### Fixed - QC sweep of the U-wave surface (marketplace skills + escrow)

Live-fired the U6 surface adversarially (identity/permission exploits,
scarcity races, evidence-rule edges, escrow economics). Five real bugs,
each found by probe and closed with a typed invariant + pin:

- **Score-settlement exploit (`settleSkill`):** settlement moved REAL
  money but only excluded the seller — any third party, or an
  identity-less MCP call, could settle/confirm someone else's trade.
  Worse, the debit anchored to `trade.buyerId || 'buyer'` (the row's
  real field is `trade.buyer`), so an anonymous settle debited a PHANTOM
  identity while the real buyer kept their budget (money creation).
  Settlement now belongs to the buyer of record: third parties refuse
  `E_SKILL_NOT_BUYER`, anonymous settles of identity-anchored trades
  refuse `E_SKILL_IDENTITY_REQUIRED`, and the debit always lands on the
  real buyer — exactly once (pinned with an escrow-observed balance).
- **Scarcity bypass (`buySkill`):** the supply-1 oversell — a skill
  bought N times concurrently (two buyers racing the same scarce unit).
  buySkill now mirrors market.trade's reserve contract: committed-peer
  counter adoption + per-listing trade lock + typed
  `E_SKILL_SOLD_OUT`; refute/sweep still restore the unit. (Also caught
  the await bug IN the fix: lock.withLock returns a promise — the
  un-awaited result made every refusal envelope invisibly truthy.)
- **Self-dealing (`buySkill`):** a seller could buy their own listing —
  a wash trade manufacturing settled sales for the reputation score.
  Refused at BUY time (`E_SKILL_SELF_BUY`), not after the hold moved.
- **Stealth-refute TTL (`_skillsTtlMs`):** the brain-config TTL path was
  unclamped — `market.skillsTradeTtlMs = 1` insta-swept fresh trades (a
  timed-out refute with zero evidence). Both paths now clamp to the env
  alias's 60s–30d window.
- **Escrow max-holds starvation (`lib/escrow.js`):** expired holds were
  never pruned at load — they hydrated into every fresh instance and
  counted toward `maxHolds: 100`. Observed live: 99 long-expired legacy
  holds made EVERY new hold fail closed (a permanent DoS that only
  manual releases cleared). Holds are now pruned at load (the same
  past-timeout semantics `checkHold` already applies lazily) and the
  prune persists. Pinned in `test/escrow.test.js`.
- **Supply semantics (decided, not just fixed):** skills are labor — a
  skill listing WITHOUT explicit `supply` now defaults to unlimited
  (the old market-listing default of 1 would have one-shot-shot every
  service under the new enforcement). Scarcity is opt-in and enforced.
- **Pins:** `test/market-skills.test.js` 19 → 23 (sold-out oversell,
  unlimited-default service, self-buy, settle-identity incl.
  escrow-observed no-phantom-debit); `test/escrow.test.js` 18 → 19
  (expired-hold prune). Suites: skills 23/0 ×3, escrow 19/0, market
  22/0, trust 20/0, market-debit 4/0, grand tour 18/18; lint:coverage
  PASS (MCP 318/318, CLI documented 120).
- **Docs:** playbook §8 failure-mode rows + §10 supply semantics
  (TTL clamp note) + pin-map additions.

## [Unreleased] - pass 203 (U6.6 — the last three follow-ups resolved)

### Added - Wave U6.6: timeout evidence sweep + shill-resistant reputation + the launch decision

All three documented follow-ups from U6.5 resolved in one pass,
everything additive to the productized contract:

- **Timeout automation with evidence rules:** `skillSweep()` releases
  stale `pending_delivery` escrow holds — on-demand (CLI `vant market
  skill-sweep`; MCP `market_skill_sweep`, 317 → 318) - never a
  background timer. TTL is `market.skillsTradeTtlMs` (default 72h;
  env alias `VANT_MARKET_SKILLS_TRADE_TTL_MS` registered in
  ENV_REGISTRY + consumed by `load()`, clamped 60s–30d).
  EVIDENCE ONLY: the sweep releases the hold, restores listing supply,
  and touches NO trust record (seller silence is not mis-delivery
  evidence); `delivered` trades are NEVER auto-forfeited (the buyer
  owns the settle decision — auto-forfeiting would favor whoever
  stops reacting); terminal states untouched. The trade row records
  `evidence.stage`/`agedMs` and `settleDecision: 'timeout'`.
- **Shill-resistant reputation aggregation:**
  `_shillResistantReputation(sellerId)` recomputes a seller's market
  rep from their OWN settled trade legs with three teeth: a per-buyer
  contribution cap (`min(3, ceil(n/2))`), distinct/total buyer
  weighting, and a concentration flag (`shillSuspicion:
  'concentrated'` when one buyer owns ≥ 50% of ≥ 3 settled sales)
  surfaced to the buyer BEFORE paying via `skillStatus` (alongside the
  legacy trust score). Refusals stay out of the score by design: the
  tool marks, buyers decide.
- **'launch'-payload decision — RESOLVED, not deferred:** the whole
  credentialed-execution class (launch/eval/exec, anything not
  text|code) is refused at LISTING time with `E_SKILL_PAYLOAD_KIND`;
  the refusal message carries the why (a sandboxed eval surface +
  threat model that does not exist). Pinned as the permanent
  disposition — a product decision, no longer a prototype TODO.
- **Pins:** `test/market-skills.test.js` 14 → 19 (sweep evidence
  rules incl. no-debit/no-trust-penalty + supply restoration, sweep
  scoping (young untouched / delivered never forfeited), shill-ring
  score suppression + concentration flag, pre-trade rep surface,
  launch-disposition). Grand-tour gate B 317 → 318.
- **Docs:** playbook §6/6b (sweep economics + reputation teeth) and §7
  (launch RESOLVED); cli.md market row; mcp-tools.md
  `market_skill_sweep` row; PRD U6.6 checkboxes closed.

## [Unreleased] - pass 202 (U6.5 PRODUCTIZED — the skills marketplace is a product)

### Added - Wave U6.5: credentialed marketplace gets its product surface (gate ON is an explicit act)

Owner disposition resolved: productize. Everything additive to the
prototype contract (labs/prototype-marketplace.md §1–§4 — nothing
invalidated):

- **Real escrow settlement (the honest gap closed this pass):**
  `buySkill` used to delegate to `market.trade()`, whose pass-48 settle
  path DEBITS AT TRADE TIME — then `settleSkill('confirm')` debited
  AGAIN: a buyer paid twice for one skill. The skill flow now implements
  the hold-first contract the PRD documented: buy = `canSpend` check +
  escrow HOLD (`skill:<listing>:<buyer>`, an audit entry — NO money
  moves) + a scarcity-reserving trade row (`skill_pending_delivery`);
  confirm = the ONE `recordSpend` debit + hold release (the trade row
  gains its real `debit` entry); refute = hold release ONLY, NO debit,
  and the listing's supply reservation is restored (an unsold skill
  resells). Verified against the REAL escrow store: 100-credit buyer,
  30-credit skill → buy leaves the price untouched, confirm leaves
  exactly 70; the pins enforce the boundaries.
- **Config mounting:** `VANT_MARKET_SKILLS_ENABLED` env alias registered
  in ENV_REGISTRY + consumed by `load()` (`market.skillsEnabled`, default
  false); `_skillsEnabled()` now falls through runtime flag > env >
  BRAIN config — `vant market skill-gate on|off` persists through
  `setConfig` (pass-95 precedent) and actually moves the live gate (the
  prototype's brainless get() could not see brain-config writes; the
  same reporting gap pass-196 fixed for the RAG keys).
- **CLI verb family on `bin/market.js`:** `skill-list` (title, --price,
  --kind, --desc, --seller), `skill-buy` (--buyer), `skill-deliver`
  (payload from arg or `-` = stdin), `skill-settle confirm|refute`,
  `skill-status`, `skill-gate [on|off]`. Exit codes: 0 ok · 1 typed lib
  error · 2 usage · 3 gate-off (discoverable-not-active). All live-fired
  end-to-end (list → buy → deliver → settle, with the seller-settle
  refusal and double-settlement refusal asserted through the CLI).
- **MCP +6:** `market_skill_list/_buy/_deliver/_settle/_status/_gate`
  (311 → 317 registered tools), live-fired through `mcp.execute` —
  full door loop with typed invariants (NOT_SELLER, ALREADY_SETTLED).
  `market_skill_gate` reads or persists the toggle via setConfig.
- **Skill fields persist:** `payloadKind`, `capabilityTag`,
  `attestation` now ride the STORED listing — `market.list()` silently
  dropped unlisted keys, so `skillStatus` reported `payloadKind: null`
  and `deliverSkill` validated against a hardwired 'text' default.
  Pinned.
- **Docs:** `docs/operations/skills-marketplace.md` (productized
  playbook: gate mounting, CLI lifecycle, settlement economics table,
  trust economics, MCP tool table, failure modes, pin map);
  `labs/prototype-marketplace.md` §5.1 (disposition resolution); PRD
  U6.5 checkbox closed; cli.md/mcp-tools.md reference rows.
- **Pins:** `test/market-skills.test.js` 8 → 14 (SINGLE-DEBIT invariant
  against real escrow, refute economics incl. supply restoration,
  payroll fail-closed, field persistence, env-alias gate widening,
  MCP-door full loop); grand-tour gate B 311 → 317, suite 18/18.
- **Still additive follow-ups (unchanged):** timeout automation with
  evidence rules, shill-resistant reputation aggregation, the
  'launch'-payload decision. 'launch' remains a DOCUMENTED boundary,
  refused at listing time.
## [Unreleased] - pass 201 (Wave U6 prototype — credentialed marketplace)

### Added - Wave U6 PROTOTYPE: skills as paid digital labor, gated OFF by default

Sixth wave of the universe PRD — the research frontier. Ships the
prototype (U6.1–U6.4) for owner disposition (U6.5): the gate
(`market.skillsEnabled`) is **OFF by default**, every skill op returns
typed `E_SKILLS_DISABLED` while it is (inert surface, discoverable
contract):

- **The contract (`labs/prototype-marketplace.md`):** buyers pay
  BEFORE seeing the payload, so escrow holds the money, delivery must
  be verifiable, trust punishes mis-delivery. Delivery contract:
  `buy` holds (no debit), `deliver` verifies + hashes the payload
  (lib/hash.js only — one hash source), buyer `confirm` DEBITS +\n  writes a positive trust record (value `min(0.2, price/50)`), buyer
  `refute` refunds with NO debit + writes a negative record. The
  seller can never settle their own sale; the buyer can never settle
  twice (`E_SKILL_ALREADY_SETTLED`).
- **Prototype surface (`lib/market.js` / U6.2):** `listSkill`,
  `buySkill`, `deliverSkill`, `settleSkill`, `skillStatus` (pre-trade
  seller-reputation visibility). Payloads `text|code` only — `launch`
  (credentialed execution) is a DOCUMENTED boundary, refused at listing
  time with its own typed code, not accepted-and-ignored.
- **Trust feed (U6.3):** settle outcomes write real cooperation
  records keyed to the LISTING's seller (the trade row's own `seller`
  field can be 'anonymous' — the listing is the authoritative who-
  made-it; caught by the suite and routed through `listing.seller`).
- **Adversarial pins (U6.4):** `test/market-skills.test.js` 8/8 —
  gate-inert typed, listing boundaries (launch/hostile price/empty
  title), full loop debit-on-confirm-only, seller-keyed reputation
  movement up AND down, double-settlement refusal, buyer-cannot-
  deliver / seller-cannot-settle scoping, payload refusals (empty,
  oversize 64KB cap), no-debit refute path.
- **Regression:** market/crossprocess/debit/trust suites green.
**U6.5 disposition (productize vs demo-archive) is the owner's call.**

---

## [Unreleased] - pass 200 (Wave U5 — provenance/compliance bundle)

### Added - Wave U5: a self-verifying export bundle (tamper-EVIDENCE, fail-closed)

Fifth wave of the universe PRD (`labs/prd-universe.md` U5.1–U5.3, one
pass). `vant export bundle --out <dir>` assembles ONE directory an
operator can hand to an auditor, and `vant export verify <dir>`
recomputes every hash from the actual bytes:

- **The L-hash is a RUNNING hash list** (`lib/export-bundle.js`):
  entry i's digest folds entry i-1's (sha256(prev + file + ':' +
  fileHash) — lib/hash.js sha256 is the ONLY hash source), so deleting,
  inserting, reordering, or byte-drifting ANY file breaks the terminal
  digest. `bundle.json` names the terminal digest while living OUTSIDE
  the chain — a rerooting attack (forge the file, re-record the
  manifest, recompute the chain) is caught at the bundle.json door;
  bundle.json itself is compared against the RECOMPUTED digest, the
  truth.
- **The bundle:** `manifest.json` (registry export, point-in-time),
  `citations.json` (citation ledger), `audit-excerpt.json` (scoped:
  action/level/limit, default last 100), `horcrux.svg` (ENCRYPTED brain
  snapshot through the production transform.toHorcrux pipeline —
  password-gated; `--no-horcrux` omits it, missing password refuses
  typed `E_BUNDLE_PASSWORD`), `content-manifest.json` (the chain),
  `bundle.json` (the handle).
- **Fail-closed verify (U5.2):** extra or missing files are TAMPER, not
  noise; unreadable manifest is `E_BUNDLE_DENIED` (denied ≠ absent);
  every refusal typed (`E_BUNDLE_TAMPERED` / `E_BUNDLE_ABSENT`).
  Absolute out paths refuse typed (the vaf gate owns /home/… residency
  paths; export artifacts stay repo-relative — the same gate caught the
  first implementation passing an absolutized horcrux sink path).
- **Honest scope note (pinned in-suite):** a FULL re-forge of every
  artifact recomputes consistently — a self-declared chain is
  tamper-EVIDENCE, not a trust ROOT. The root is the horcrux password +
  external anchoring (record the digest somewhere outside the bundle).
- **CLI +1 bin (`bin/export.js`, dispatcher-routed) +2 verbs; pins:**
  `test/export-bundle.test.js` 11/11 (roundtrip, six tamper negatives,
  typed refusals); CLI coverage 124 → 125; both verbs live-fired.

---

## [Unreleased] - pass 199 (Wave U4 — deliberation→decision records)

### Added - Wave U4: a forum decision now knows its THREAD (and the trail survives restart)

Fourth wave of the universe PRD (`labs/prd-universe.md` §4 — U4.1–U4.3,
landed in one pass). The pass-40/44 loop already persisted the decision
FEED; what it never had is the LINK from a discussion to the vote that
resolved it — and `_openVotes` is memory-only, so a thread's decision
trail died with the process that created the vote:

- **Durable thread→vote linkage (U4.1):** `forum.vote(proposal,
  { thread: 'PUB-...' })` records the barcode→consensus-topic pairing
  in `state/forum-threads.json` (arch-A store, WAL included, FIFO cap
  500 by `linkedAt`). The pass-43/44 decision return path reads the
  durable link FIRST (before the memory map), so a decision record
  CARRIES its `thread` even when the tally resolves in a fresh process
  — mcp-consistent with the agora metadata stamp (proposal/author on
  both sides).
- **Decision trail reader (U4.2):** `forum.threadDecisionTrail(barcode)`
  reconstructs the whole story from the link: the consensus ledger
  (status, ballot, per-voter outcomes), the escrow holds touched under
  the consensus hold id (`forum:<topic>`), and the persisted decision
  record (winner/percentage/decidedAt). Unlinked thread → typed
  `E_FORUM_ABSENT`, never a silent empty trail. CLI:
  `vant forum decisions <barcode>` (+ `--json`) and `vant forum links`;
  MCP: `forum_decisions` + `forum_thread_links` (309 → 311 tools), and
  `forum_vote` gains the `thread` param — all live-fired.
- **Pins (U4.3):** `test/forum-decisions-persistence.test.js`
  4 → 9: on-disk link persistence, decision-carries-thread roundtrip
  in-process, NO ORPHANS after restart (link AND hydrated decision
  both survive; unlinked thread still refuses typed), link FIFO cap,
  clearState wipes both stores. Grand-tour gate B bumped 309 → 311 and
  re-run 18/18.

---

## [Unreleased] - pass 198 (post-merge audit — the pool now REALLY debits)

### Fixed - scenario escrow debit was bookkeeping-only: the shared pool never drained

The fresh-process live-fire sweep of the U1–U3 waves caught the exact
PRD-claim-vs-ledger divergence the wave was built to prevent: three
successful `vant scenario task` runs left the shared pool at 100/100 —
`escrowMod.hold()` is an AUDIT row (a boolean of "the gate fired"), not
a debit. `runScenarioTask` now converts the hold into a REAL
workspace-charged `Escrow.recordSpend` (auto-persisting; draw check
routed through a fresh disk-coherent instance so the `{ orgLimit }`
one-shot cap survives — the module-level `workspaceCanSpend` helper
drops it): a completed task consumes budget; every refusal path
(delegate failure, consensus unavailable, no-quorum closeout) refunds
member AND pool rows via `Escrow.refund` before the typed verdict is
recorded — a refused task never eats credits. Pinned: two new pins in
`test/scenario-crew.test.js` (success charges the pool; refused closeout
restores it — stub Escrow models canSpend/recordSpend/refund), suite
8 → 10. Live-verified through the REAL escrow store: 30-credit +
30-credit draws drain 100 → 70 → 40, an 80-credit over-budget draw
refuses `E_SCENARIO_BUDGET` and leaves the pool at 40 (refund intact).
Also fixed while here: the stub `/tmp` scope note in the audit trail
(the `escrowTouched` gate-order assertions are unchanged and still
hold — debit now fires inside the gate, after the draw check). No other
callers of `workspaceCanSpend` were affected (market/consensus/teams
gates do not pass `orgLimit`).

---

## [Unreleased] - pass 197 (Wave U3 — governance scenario playbook + resume materialization)

### Added - Wave U3: Governance Scenario Playbook

Third wave of the universe PRD (`labs/prd-universe.md` §3; U1 + U2
landed same-day). Demos the product over the EXISTING consensus/escrow
stack — no new security primitives, the gates are the real ones. One
PRF / one encoder still holds:

- **`lib/scenario.js` + `bin/scenario.js` (U3.1):** `vant scenario
  crew <name> --agents N --budget N`, `vant scenario task <crew>
  <desc> [--cost N]`, `vant scenario status <crew>`. A crew of N
  agents draws from ONE shared escrow workspace pool —
  `ensureWorkspaceBudget` sizes it idempotently (never refills) — and
  each delegated task must pass real gates, in order:
  (1) QUARANTINE — `trust.isQuarantined` checked for EVERY member
  fail-closed BEFORE any escrow draw; the refusal is recorded in the
  verdict (agentId + staging); a fully-quarantined crew can't delegate
  at all. (2) ESCROW — the shared pool is charged (hold + quota);
  empty pool → typed `E_SCENARIO_BUDGET`; holds release on refusal.
  (3) CONSENSUS — the closeout verdict is a VOTED outcome requiring
  quorum (`minQuorum = max(2, live voters)`): one remaining live voter
  can never pass single-agent bless (`E_SCENARIO_NO_QUORUM`), and the
  decision rides `resolution.logDelta` (persisted, survives restart).
- **U3 carry-over — resume's byte-restoring materialization (closes
  U2.3's honest-scope note):** `record --values` freezes cell VALUES
  inside the manifest (the manifest id covers them — content-
  addressing bites), and `resume --materialize` restores them through
  the arch-A state store, billed 1 escrow credit/cell under hold
  id `scenario:materialize:<actor>`. A broke actor is refused typed
  (`E_SNAPSHOT_BUDGET`) BEFORE any store write; a store-write denial
  refunds the hold.
- **MCP +3:** `vant_scenario_crew/_task/_status` (309 registered
  tools), live-fired through `mcp.execute` incl. rules + sandbox
  doors; `SAFE_TOOL_ALLOWLIST` extended for the three names.
- **Docs:** `docs/operations/scenario-playbook.md` (task flow
diagram, gate table, pin map); `docs/reference/cli.md` scenario/
universe rows + usage block; `docs/reference/mcp-tools.md` full pages
  for the three tools + the materialize note on `vant_universe_resume`.
- **Verified:** `test/scenario-crew.test.js` **8/0** (typed gates,
  gate-order, one-quarantined + all-quarantined drills,
  no-single-bless, rules door); `test/scenario-manifest.test.js`
  extended 18 → 22 (materialization pins); U1 suite still 11/0;
  grand tour 18/18 with gate B bumped 306 → 309; `npm run
  lint:coverage` PASS (MCP 309/309, CLI 119+5 = 124);
  fiction-signatures PASS; frontmatter PASS; full CI green.

---

## [Unreleased] - pass 197 (Wave U2 — prd-universe.md)

### Added - Wave U2: Stored, Content-Addressed Scenario Manifests

Continues the universe PRD (Wave U1 landed pass 197 same-day; see
`labs/prd-universe.md` §3 for per-wave checklists). One PRF / one
encoder still holds — every hash in this wave rides
`lib/state/canonical.js` and the arch-A state store, no second chain:

- **`lib/state/genesis-snapshot.js` U2 surface:** `recordSnapshot()`
  freezes a U1 snapshot + a state root into a manifest whose id IS the
  hash of its payload — deterministic (no timestamp/uuid), so two fresh
  processes recording the same content produce byte-identical manifests
  (U2.4, child-process-pinned), and a re-record is a dedup no-op
  (`added: false`). Persisted brain-scoped through state/universe-
  manifests.json (WAL included). `loadSnapshot()` accepts unambiguous
  id prefixes; ambiguity and absence are typed.
  `diffManifests()` (U2.2) is pure: identical manifests →
  `identical: true, changed: []`; the same-universe contract is enforced
  by a per-manifest universe-canary identity tag and different
  universes/worlds refuse typed (`E_SNAPSHOT_UNIVERSE` /
  `E_SNAPSHOT_WORLD_MISMATCH`) instead of emitting all-cells noise.
  `resumeSnapshot()` (U2.3) writes a restore marker through
  `stateStore.persistMerged` — brain-root lock fail-closed (a peer
  holding the region → REFUSED `E_STATE_LOCKED`, never an unlocked
  write, contended pin included) and WAL-backed, with an optional
  frozen-root-vs-live-root crosscheck (`liveRootMatch`). Honest scope
  note: U2 ships the verified-marker path; byte-restoring
  materialization deliberately lands with U3's escrow-backed executor.
- **Rules fix (the U2 opener, from U1's honest limitation):**
  `lib/rules.js` stopped substring-matching `fork` across MCP tool
  names — `vant_universe_fork` (a SEED fork; no process involvement)
  was refused at the rules door. Exact-name `SAFE_TOOL_ALLOWLIST` for
  the six vetted universe tools; adding a name is a deliberate review
  act, dangerous substrings still deny, custom rules still win (pinned).
- **MCP +3:** `vant_universe_record/_diff/_resume` (306 registered tools,
  live-fired through `mcp.execute` incl. inputSchema + rules doors).
- **CLI +3 verbs on `bin/universe.js`:** `record` (--fork, --state-root),
  `diff` (typed refusals same as the lib), `resume` (--actor;
  live-root verdict on stdout) — all live-fired.
- **Verified:** `test/scenario-manifest.test.js` **18/0** (U2.1–U2.5 +
  rules pins, incl. genuine cross-process contention against a planted
  fresh foreign-pid lockfile); U1 suite still 11/0; grand tour 18/18
  with gate B bumped 303 → 306; `npm run lint:coverage` PASS (MCP 306/306,
  CLI 118+5 = 123); fiction-signatures PASS (924 files); frontmatter
  PASS (119 pages); full CI **455/0**.

---

## [Unreleased] - pass 196

### Fixed - `vant config get` now reports LIVE values for the domain-tuning keys

A live-fire CLI round found a reporting gap, not a behavior gap. The
pass-194 RAG keys and pass-195 transport timeouts resolve through their
dedicated getters (env aliases + clamps + brain-config precedence), but
`config.get()`'s generic dotted walk only knew the internal config object,
so `vant config get rag.rehydrateMaxSize` printed `null` while the runtime
enforced 51200. `config.get()` now falls through to a domain-getter table
(`rag.rehydrateMaxSize/compressionThreshold/limitMax`,
`sync.opTimeoutMs/gitTimeoutMs/httpTimeoutMs`) as the last resolver — the
CLI reports exactly what the runtime enforces. Verified live: all six keys
resolve through the CLI, `github.token`/unknown keys still print null, and
config/config-persistence/config-registry suites stay green.

---

## [Unreleased] - pass 195

### Added - Wave G: GitProvider stack adopts RemoteTransport (prd-canonicalization §7 adoption wave 3)

The canonicalization's §7 seam (Wave F, pass 183) had one adopter
(`S3Transport`) and a queue of stacks still carrying private auth/verify.
Wave G adopts the biggest one:

- **`lib/remote.js` — `GitProvider extends RemoteTransport`.** Every Git
  provider (github/gitlab/gitea/bitbucket/selfhosted) inherits the shared
  contract: shared retry policy, honest base `verify()` (unverified ≠
  blessed), shared validators. Constructor chains to super().
- **The auth() door is THE credential resolution.** `this.token` instance
  fields are retired from all five connectors — tokens resolve per-use via
  `auth()` (config override → connector env → config layer) so an error
  path, JSON dump, or `describe()` can never leak them (redaction by
  construction). `isConfigured()` now consults `auth()`.
- **Transport tuning registered:** `VANT_SYNC_OP_TIMEOUT_MS`,
  `VANT_GIT_TIMEOUT_MS`, `VANT_HTTP_TIMEOUT_MS` + provider token/env family
  (GITLAB_TOKEN/URL, GITEA_TOKEN/URL, BITBUCKET_TOKEN, GIT_TOKEN)
  registered in ENV_REGISTRY (43 → 52, secrets flagged); sync.js/remote.js
  read the timeout trio through new config getters (`syncOpTimeoutMs`,
  `gitTimeoutMs`, `httpTimeoutMs`) — env fallbacks preserved.
- **Read-path compatibility:** shared headers/URLs/_requestJson/_gitExec
  unchanged; the adversarial remote-transport suite (23/23) and
  git-injection (7/7) pass unchanged because the base class was already
  built from their templates.
- Verified: CI **453/0**; probe pins — providers are instanceof
  RemoteTransport, no token instance field remains in any connector,
  describe() leaks nothing, base verify() honest-false. Known note:
  `test/sync-pull.test.js` has a PRE-EXISTING env-dependent failure set
  (3/15, needs a live `GITHUB_TOKEN` — HTTP 403 in the sandbox); verified
  identical before and after via git-stash diff.

---

## [Unreleased] - pass 194

### Fixed - trust.quarantine() async gap

`lib/trust.js` quarantine used to mark the agent in a follow-up async
step, so a fire-and-forget caller (or a `quarantined` read on the next
tick) could race ahead of the state change and see the agent still
trusted. The set is now synchronous at the top of `quarantine()`
(`immediate: true` option retained for callers that opt out), and the
persist/effect steps run after; re-entering quarantine on an already
quarantined agent now keeps the original reason instead of clobbering it
(idempotent re-entry). All real callers already awaited, but the API no
longer depends on that.

### Added - RAG tuning keys go live (spec → implementation)

The RAG tuning keys documented in `settings.example.ini`
(`REHYDRATE_MAX_SIZE`, `COMPRESSION_THRESHOLD`, `RAG_LIMIT_MAX`) were a
spec with **no runtime consumer** (see the pass-193 honesty note). They
are now implemented:

- **`lib/config.js`** gains RAG getters — `ragRehydrateMaxSize` (default
  51200, clamp 256–1048576), `ragCompressionThreshold` (default 5120,
  clamp 512–262144), `ragLimitMax` (default 20, clamp 1–100) — reading
  `VANT_RAG_*` env vars > brain-config `rag.*` keys > defaults, with the
  legacy bare names (`VANT_RAG_REHYDRATE_MAX_SIZE` etc.) registered in
  the env registry and bare names (`REHYDRATE_MAX_SIZE` etc.) accepted as
  aliases.
- **`lib/search.js`** enforces them: `hydrate()` applies
  `rag.rehydrateMaxSize` as a HARD bound on the rehydrated context — any
  fragment (first or not) is truncated to keep the output under the cap
  (previously a single oversized fragment was returned whole, blowing
  through 50KB); `compress()` defaults its token budget to
  `rag.rehydrateMaxSize`-derived sizing and honors explicit budgets;
  `queryBrain()` and `semanticSearch()` clamp `limit/topK` to
  `rag.limitMax`; `getSettings()` returns the live values.
- **`bin/search.js`** uses `rag.limitMax` as its default limit ceiling
  instead of a hardcoded 2000.

Docs updated to match: `docs/memory/search.md`,
`docs/reference/config.md`, and `settings.example.ini` no longer mark
these rows spec-only. Pinned by the trust and config-registry suites.

---

## [Unreleased] - pass 193

### Fixed - Wave A stage 2: the bus is the ONLY emitter (prd-canonicalization §2)

Pass 179 stage 1 left ~10 modules dual-emitting (private EventEmitter
**alongside** the shared bus). Stage 2 finished the adoption: every
private emitter in `lib/` is retired — `grep -r "extends EventEmitter\|new
EventEmitter(" lib` now returns nothing (lib/event.js's own PubSub excepted
by design).

| Module | Change | Consumers migrated |
|---------|--------|--------------------|
| `lib/backup.js` | `BackupScheduler` loses the `extends EventEmitter` base; lifecycle events are `backup:started/stopped/start/complete/error` on the bus only | none existed (0 listeners repo-wide) |
| `lib/cron.js` | module `_scheduler` emitter + `JobWorker` base retired; `cron.on/emit/once/off` now attach to the bus; `task:run` replaces the private `run` event | none existed |
| `lib/context.js` | `_emitter` retired; `context.on/off` attach to the bus; `context:built`, `context:invalidated`, `context:built:stack`, `heartbeat:*` ride the bus | none existed |
| `lib/trust.js` | `extends EventEmitter` base retired (all trust:* was already on the bus) | none existed |
| `lib/market.js` | `extends EventEmitter` base retired (same posture) | none existed |
| `lib/habitat.js` | base retired; `feed()` emits `habitat:chaos` on the bus (workspace/type/chaos/timestamp payload); instance emit removed | `nature.wire(habitat)` — never called in production|
| `lib/nature.js` | base retired; `spark` is `nature:spark` on the bus; `start/stop` are `nature:start/stop`; `wireSharedBus()` listens for `habitat:chaos` (idempotent); `Nature.sharedBusWired(options)` is the canonical construction; `wire(habitat)` delegates to the bus path | `lib/vant.js` spark→dream and `lib/backup.js` spark→entropy-backup listeners now attach to `nature:spark` on the bus |

Pinned by `test/agent-registry.test.js` + the re-run suites (below); the
stale e2e pin `"/tools = 299"` was updated to the documented 300
(`vant_resolution_list` joined in pass 190 — the pin predated it).

Verified: trust 20/20, cron 14+1, backup 8+3+4, habitat 6+all+23+15+13,
nature 7, event 15+all+40, e2e grand-tour 18/18, missing-modules 41, CI
**453/0**, `npm run check` + `npm run lint:coverage` PASS.

### Changed - Registry decision: WIRED WIDER (agent-registry persistence + trust feed)

The registry absorbs config-adjacent "who is who" duty for real. Three
wiring gaps closed in `lib/registry.js`:

- **Persistent** — the agent book hydrates from
  `models/private/<brain>/state/agent-registry.json` on first touch and
  writes through on every mutation via the shared `lib/state-store.js`
  (arch-A rules, WAL included) — same pattern as node-registry (pass 36)
  and trust (pass 172). Registered agents survive restarts; the state
  file is brain-scoped by construction. The tree-tier mirror rides
  `persistMerged` so the root hash is available for integrity checks.
- **Trust feed** — a successful registration now writes ONE positive
  cooperation record into trust's persisted ledger ("registered in agent
  registry"), so the address book and the trust ledger agree; the
  quarantine gate stays the deny path (pinned: quarantined → refused).
- **`registerBrainAgent` wired** — the pass-old `_brainRegistries` dead
  store (pushed to, never read, never persisted, zero callers) is retired;
  both `getBrainRegistry()`/`registerBrainAgent()` delegate to the real
  persistent singleton. `gatherState/restoreState` (horcrux backup
  surface, consumed by transform.js) now carry the real book and
  round-trip.
- Pin suite: `test/agent-registry.test.js` (11 pins — persist, trust
  feed, tree root, registerBrainAgent delegation, gather/restore
  round-trip, quarantine gate, seed baseline).

### Fixed - Config-doc honesty: settings.ini/mood.ini fiction retired (item-1 closeout)

The config-canonicalization sweep found two orphan template files with
NOTHING reading them, while the docs kept instructing users to configure
them:

- **`settings.example.ini` / `mood.example.ini`: zero runtime readers.**
  Grep across `lib/` and `bin/` proves neither `settings.ini` nor
  `mood.ini` (nor `REHYDRATE_MAX_SIZE`/`RAG_LIMIT_MAX`/
  `COMPRESSION_THRESHOLD`) is read by any module. The only runtime-read
  `.ini` is `config.ini` (bin/sync.js parses GITHUB_REPO/GITHUB_BRANCH;
  bin/health.js checks it exists; lib/config.js's file peer is
  `vant.config.js`).
- **Docs reconciled to the truth:** `docs/reference/config.md` now labels
  both sections with passing notes ("documentation-only, no reader —
  configure via brain config / VANT_* env instead") and the Example Files
  table says which .ini files actually load. `docs/memory/search.md`'s
  rehydration table is likewise marked spec-only (no consumer yet).
  Template files stay at the root (they are intent/spec records and the
  format.js `.ini` parser pins test against them) — nothing was deleted.
- The config-precedence contract stands unchanged as landed in pass 188:
  runtime flags → brain config.json → global (env + vant.config.js) →
  built-in defaults; secrets through `lib/secret.js` (the one secrets
  door; env tolerated but not encouraged).

## [0.8.6] - 2026-08-29 - Axolotl "Nuclear Breaking" Refactor

> Branch `axolotl` — multibrain + dead-code bloat removal. Pinned at
> 0.8.6 (no version bump). 5 b-T commits (4ae316b → 9a2583b) + T15 fix
> (81ddedc). **No backward-compat shims, no test-only public APIs, no
> stubs.** Breaking changes are packed in now.

### Refactor - Multi-Brain (T1–T4)

- `pipeline.run` now caches module resolution and supports `async`
  execution with an options bag.
- "Secured" variants of the brain surface are exported for callers that
  need the locked-down VAF → QoS → Escrow chain.
- A second private brain ("axolotl") is loaded alongside the public
  template so multibrain callers can switch contexts.

### Refactor - Dead-Code Bloat Removal (T10b–T14b-r1, 5 commits)

The b-T round removed 30+ aliases, singletons, and legacy exports that
accumulated during the v0.7.x → v0.8.x transition. Each removal is a
hard break — callers must migrate to the canonical name.

| Removed | Use instead |
|---------|-------------|
| `lib/storage.js` `exists` | `has` |
| `lib/brain.js` `loadBrain`, `brainList` | `loadCorpus()` + per-name `read()` |
| `lib/shell.js`, `lib/search.js`, `lib/qos.js` dead-code compat exports | direct API only |
| `lib/cache.js` `defaultCache` singleton | `new Cache()` — consumers own their instance |
| `lib/config.js` `setFlag` | `set` |
| `lib/event.js` `EventBus`, `SimpleEventEmitter` | `EventEmitter` |
| `lib/api.js` `get mode()` | read-only property, no getter |
| `lib/vant.js` `Runtime` legacy class | top-level lazy getters |
| `lib/compute.js` `eval` | `evaluate` |

### Test - Stale Test Fixes (T15, 1 commit)

T15 swept all 110 test files and fixed 24 of the 35 pre-existing
failures that the b-T round exposed. The remaining 11 failures
(embed: 9, test-escrow: 4) predate the axolotl work and are
deferred.

| Test file | Before | After | Net |
|-----------|--------|-------|-----|
| `test-integrations.js` | 10 fail | 0 fail | -10 |
| `test-vant.js` | 7 fail | 0 fail | -7 |
| `test-sandbox.js` | 3 fail | 0 fail (+4 new) | -3 |
| `test-compute.js` | 1 fail | 0 fail | -1 |
| `test-modules.js` | 1 fail | 0 fail | -1 |
| `test-trifecta.js` | broken import | deleted | -1 file |
| **Total** | **35 fail** | **11 fail** | **-24** |

Net test count: 1451 → 1478 passing (+27).

### Migration

See `labs/archives/docs/MIGRATING-0.8.6.md` for the cookbook (per-removed-API recipe
with before/after snippets; archived there once brain-layout migration went
automatic on `vant start`).

### Known Issues

- `test/embed.test.js` (9 fails): asserts an embedding abstraction
  (setEmbedder/getEmbedder/listEmbedders/embedStack/embedBatchStack)
  that was never implemented in `lib/embed.js`. Pre-existing.
- `test/test-escrow.js` (4 fails): canSpend/recordSpend/agent
  isolation/quota check. Likely related to the v0.7.x budget
  subsystem changes. Pre-existing.

Both files are deferred — not in the b-T scope.

## [Unreleased] - Future

### Added - Durable Docs-Coverage Gates: MCP 300/300 + CLI 122 (pass 192)

The pass-191 coverage crosschecks were one-off node snippets. Now durable
gates in `scripts/`, wired as `npm run lint:coverage` (both PASS):

- **`scripts/check-mcp-coverage.js`** — every tool registered in
  `lib/mcp.js` must be mentioned in `docs/reference/mcp-tools.md`
  (word-boundary match so a similar name cannot cover a sibling) or
  explicitly dispositioned in the script's dispositions table (currently
  none — the catalog documents all 300). FAIL lists the missing tools
  inline with the fix instruction.
- **`scripts/check-cli-coverage.js`** — every `bin/*.js` must be
  documented in `docs/reference/cli.md` (accepts `vant <name>` rows,
  `bin/<name>.js` path mentions, or an explicit disposition). Initial
  run caught 5 real gaps: agent-spawner, bot, branch-manager,
  hybrid-sync, test-all were only referenced under their ROUTED names
  (vant spawn/telegram/hybrid/branch) or not at all. cli.md rows now
  name both the routed command AND the underlying bin; test-all got its
  table row. Dispositions: the dispatcher itself (vant), the reference-
  text bin (cli-standard), and the internal CI helpers (test-core,
  summary). Final tally: **117 documented + 5 dispositioned = 122**.
- Why "mentioned" (word match) is the right contract: the shape of a
  doc entry legitimately varies (param table row / code example /
  prose reference). The gate guarantees the question cannot regress -
  no registered tool or shipped bin can be absent from its reference
  page. Lying-while-mentioning is the fiction gates' job
  (check-fiction-signatures + spot-firing, both green).
- Verified: `npm run lint:coverage` PASS; all four doc gates re-run
  PASS; CI 453/0.

### Added - Docs Pass: Full MCP Catalog + CLI Coverage Closeout (docs pass 191)

- **MCP docs brought up to the CLI doc's standard.** Two MCP docs existed;
  the reference (`docs/reference/mcp-tools.md`, the catalog) and the
  runtime page (`docs/runtime/mcp.md`, how to connect). Both had fiction:
  - **reference:** covered ~60 of 300 tools. Now **300/300 coverage** —
    verified programmatically against the live registry (`mcp.methods`):
    prose + examples for the high-value groups (brain family, islands,
    configs, citations, compute, memory, geometry, boot, branches,
    agents, events, embed, network, remote, context, cron, recursion,
    lineage), complete param tables (required-first, copied from the
    registered inputSchema') for every remaining domain, and a
    "Remaining Tools" crosscheck table so nothing can silently drop
    out again. Return-shape conventions documented (typed not-blessed
    failures, verified-beats-declared RLS).
  - **runtime:** its "tool reference" tables were a stale fiction
    (`vant_stego_encode` params `text/input` vs the real
    `image/message/output`; `vant_audit_log` params `action/details`;
    res_track `id/outcome`; a 15-row error-code table whose codes are
    invented vs the real lib/error.js catalog). Deduplicated to the
    reference page: the core-9 table + a small sample table (kept true)
    + the real error contract (typed not-blessed results), with a link
    to the full catalog. Setup/connect/TLS/stdio sections were already
    real and stay.
- **CLI doc closeout** (`docs/reference/cli.md`): the 15 bins without a
  single mention triaged — real CLIs added to Ecosystem (events, qos,
  rate, nature, rules, mesh-status, islands-boot, connector, nodes),
  agent-spawner reflected as `vant spawn`, internal helpers (test-core/
  cli-standard reference doc) left with notes. Fiction fixed in place:
  the theme section now shows the REAL verbs (show/status/set — the old
  list/apply/create recipe was fiction since the pass-188 rescope) and
  the passage had `vant consensus` duplicated 3× — now 1.
- Executable verification: doc examples spot-fired through `mcp.execute`
  (vant_help, vant_search_hybrid, vant_lock status, habitat_verifyToken
  honest-miss, config_get) — all OK. Doc gates: frontmatter PASS (119
  pages), fiction-signatures PASS (909 files), docs-links PASS (119
  files).

### Fixed - MCP Fiction Audit: canned tools routed to their real libs (pass 190)

- **The walk.** All 299 hand-registered MCP tools swept for handlers that
  return canned values instead of calling their lib (the pass-95/96 audits
  had already fixed config/audit/succession; this pass continues the same
  policy). Fiction found and fixed, each verified live through `mcp.execute`:
  - **vant_stego_encode / _decode** — `{status:'encoded'}` / `{message:''}`
    without touching anything. Now route through the REAL suite-pinned
    stego engine (`lib/stego.js`): encode(message, image, output[, password]),
    decode(image[, password]) — VAF path checks + password stay the lib's
    job; failures surface typed (`{encoded:false, error, code}`), never a
    silent bless.
  - **vant_resolution_track** — accepted (id, outcome) and returned
    `{status:'tracked'}`. Reshaped to the ledger's real record
    (`resolution.logDelta(file, change)`) + new `vant_resolution_list` over
    `getDeltas`.
  - **lib/resolution.js `logDelta` never PERSISTED** (MCP audit-caught lib
    bug): it mutated an in-memory copy and returned — every restart dropped
    the whole delta history, so all track-decision callers were writing to
    /dev/null. Now saves the same way the other ledger writers
    (addResolution/evictExpired) do; write failures return typed. Proven
    with a fresh-process read-back.
  - **vant_citations_list / _add / _format** — list called a method that
    doesn't exist (`listSources`, so it always returned []), add returned
    `{added:true}` writing nothing, format ignored the lib's context rule.
    All through the real module: getAll / addSource (merge-under-lock,
    lock failure = honest added:false) / verify + formatCitation.
  - **stream_watch** — returned `{watching}` for a callback-based lib API a
    one-shot MCP call cannot hold (a noop registration would have been
    another lie). Now reports the watchers state and the honest constraint
    with a pointer to event_tail / event_sink_enable.
  - **qos_withTimeout** — claimed 'Execute with timeout' and returned
    `{allowed:true}`; the real `qos.withTimeout(promise, ms)` races a
    PROMISE an MCP call cannot ship. Now tells the truth (enforcing:false +
    constraint + pointer to the real concurrency gate, qos_canProceed).
- **Handler-shape scan:** the remaining 134 auto-flagged handlers were
  triaged by eye — all are param-shaping wrappers over real lib calls
  (require/`_module.` present); no further canned bodies.
- **docs/reference/mcp-tools.md** updated: resolution_track's real params
  (file/change), stego's real params (image/message/output/password) +
  honest-failure shape, and a new citations tools section.
- Verified: mcp.test 6/6, mcp-schema 13/13, resolution 12/12, test-mcp
  green, CI **453/0**; fixed tools exercised via `mcp.execute` (citation
  add→list→format hit+miss, resolution track→list fresh-process persist
  proof, stego decode missing-file typed error).

### Fixed - CLI Walk: bin/nodes, registry, network, connector, cache + backup/brain stubs (pass 189)

- **The walk.** All 122 `bin/` CLIs swept for verbs that print canned strings
  or call their lib with the wrong shape. Six more CLIs had real gaps:
  - **bin/nodes.js** — `discover/ping/info/register` were pure canned
    strings; `metrics` read fields that don't exist (stats.count/active vs
    the real total/alive/joining/dead). All verbs now run the real
    node-registry lib (refresh-first list, heartbeat-ping, JSON info,
    real register with --id/--host/--port, both stats verbs). Verified
    live: register → info → ping → metrics → cleanup.
  - **bin/registry.js** — called the lib with wrong shapes
    (`register(key,value)` / awaited Map getters). Rewired to the real
    AGENT registry: register({name,type}) trust-gated, get/remove by name,
    count/summary real. Verified live (4 known agents + register/remove).
  - **bin/network.js** — `connect/disconnect` were strings for a P2P fantasy
    (this lib is fetch/whitelist/latency); `ping` printed and did nothing.
    Now: `ping <url>` runs the REAL measureLatency (whitelist-gated),
    `status` prints the flag view instantly (a 5s live probe raced the CI
    smoke watchdog in the first cut — the probe is its own `probe` verb,
    `latency`/`domains` expose the recorded stats). Fantasy peer verbs
    retired with a pointer to vant nodes / crew-bus.
  - **bin/connector.js** — fake catalog (elasticsearch/postgresql/redis/
    slack/github — none exist); `connect` did nothing. Now lists exactly
    what getConnector() supports (pinecone|qdrant|weaviate), `status`
    instantiates + describes, `connect` runs the real async connect(),
    `disconnect` runs close(), `configs` prints per-brain connector
    configs. Unknown types exit 1.
  - **bin/cache.js** — the 0.8.6 T13b removal of the `defaultCache`
    singleton left the CLI calling `cache.get/set/clear` on a module that
    exports only the Cache class (broken since 0.8.6 in disguise).
    Fixes: one Cache per process, real stats(), and the compress/decompress
    pair now base64-round-trips (compress() returns a raw gzip Buffer —
    the old print made decompress impossible). Verified: set/get, stats,
    gzip round-trip.
  - **bin/backup.js `schedule`** — the pass-23 silent stub printed a cron
    recipe, but lib/backup.js GAINED a real BackupScheduler since (registers
    daily/weekly jobs with lib/cron.js + a nature entropy trigger). The
    verb drove it for the first time: start (with the process held open to
    run the jobs), stop, and a real status (jobs defined vs registered
    in this process).
  - **bin/brain.js `geo search`** — printed '(search not implemented)' while
    geoList() already returned the barcodes; now a real substring filter
    with hit counts (misses exit 1).
- **Julia live-fire verdict (the tracked "skipped" test):** the test is
  already honest — it self-skips with the reason when julia is not on
  PATH (exit 0; CI and foreign machines without the language are a
  supported configuration), and the wire contract it exercises live is
  pinned protocol-level in test/sidecar.test.js (8/8 green without julia).
  Nothing to fix in the test; CI's "1 skipped" isn't even this test —
  it is smoke:clean refusing a write under deny-by-default (a skip by
  design). Recorded so the number stops raising eyebrows.
- Sweep confirmed clean: no "not wired yet", "placeholder", "coming soon",
  or "not implemented" strings remain in bin/ outside documented behavior
  notes. Verified: node test/ci.js **453 passed, 0 failed** (the smoke
  failing cut was reverted by making status instant); direct live-fires
  green on all rewired CLIs.

### Fixed + Added - Placeholder CLI Verbs Wired + Config-Precedence Docs (pass 188)

- **Placeholder CLI verbs wired to their real libs.** Four verbs printed
canned strings while their lib sat fully functional behind them:
  - `vant citations search` — matches commit hash OR context text
    (case-insensitive) through `lib/citations.js`; miss exits 1.
  - `vant citations export` — prints the citation file as JSON
    (version/exported/count/sources) via the gated `getAll()`.
  - `vant node-registry list|register|unregister|status` — all four
    route through `lib/node-registry.js` (the consensus vote-verification
    anchor): list refreshes + adopts peer processes' registrations;
    register honors `--id/--name/--host/--port` (quarantine gate
    failures exit 1); unregister tombstones (never re-hydrated);
    status prints getStats() counts + the state-spine tree root.
  - `vant theme` — the real lib is the CLI/MCP rendering surface,
    not a theme picker; verbs re-scoped to `show | status | set` (renders
    the live surface, prints per-brain theme configs on the stack, sets
    the current brain's config). The old fantasy verbs (list/apply/
    create/preview/import) are gone.
  - `bin/auth.js` left alone — its fresh-process null bug was the pass-186
    config getter fix; no placeholder verbs inside.
- **WHY they were placeholders:** each CLI was authored against a lib
  surface that either didn't exist at the time (citations search/export),
  or whose real shape was discovered only later (theme is a renderer,
  not skins; node-registry became the protocol anchor post-pass-36) —
  the CLIs were never revisited when the libs grew up.
- **Config-precedence docs landed** at the top of
  `docs/reference/config.md`: the four surfaces (runtime flags →
  brain config → global config → built-in defaults) with lifetimes,
  setters, and the `config.get()` resolution ladder as implemented;
  `ENV_REGISTRY` positioned as an inventory, not the rule.
- **`getStorage('repos')` ReferenceError fixed (CI-caught).** The Wave-D
  split renamed the binding to `ReposStorageImpl` but the 'repos' factory
  case still referenced the old bare name — bin/repos.js crashed on every
  invocation. Caught by `test/ci.js`'s smoke:repos; suite now 453/0.
- Verified: `node test/ci.js` **453 passed, 0 failed** (was 452/1);
  storage.test 40/40 re-run; all wired verbs exercised live
  (add→search→export round-trip, register→list→status→unregister
tombstone, theme show/status/set).

### Added - State-Spine Documentation + Last steveframe Typo (docs pass 187)

- **New page: [docs/memory/state-spine.md](docs/memory/state-spine.md).** The
  `lib/state/` system from the WIRING passes (canonical #146, tree #145/147/148,
  seeds #158, spine #165, cellstore #150, anchor #152, checkpoint #151,
  hotset #153, brain-verify #166) had a ledger and test pins but NO user-facing
  doc. The page covers the one-paragraph mental model, the building blocks
  table, the two tiers (plain-JSON file tier with WAL + fail-closed locks, and
  the opt-in tree tier with rootHash + anchoring), full usage examples
  (hydrate/persist/persistMerged, StateTree mirror + diff + snapshot,
  SeedChain, AddressingSpine, the #150 rebate honesty primitive), equivalent
  CLI/API surfaces, and the design laws (typed absence, determinism, tamper
  detection, structural dedup, caches never lie).
- **Crosslinked into existing docs:** memory index (specialist-formats table),
  storage reference (pass-181 split + the StateStorage-vs-state-spine
  disambiguation), the architecture map (state-store.js / state/tree.js rows),
  and the operations storage page's Related list.
- **Last live `steveframe` typo fixed:** ROADMAP.md's horcrux-sharing todo
  pointed at `steveframe.creadev.org` — now `stegoframe`. Remaining mentions
  of `steveframe` in the repo are only fix-documentation (CHANGELOG, the pass-
  186 test pin comment, WIRING ledger).
- Doc gates re-run green: frontmatter (now 119 pages) + fiction-signature scan.

### Fixed - Config Rogue Cleanup + Registry Completion (pass 186)

- **Duplicate `msg:` object key retired.** `config.load()` defined `msg:`
  twice — once for the encryption defaults, once for the publish-depth
  cap — and last-object-key-wins silently killed `msg.encrypted` /
  `msg.autoEncrypt`. One merged `msg` object now carries all three.
  (Grep-proved: the new merged shape is what `getAll()` returns.)
- **`steveframe` → `stegoframe` typo fixed.** The `_config` key was
  misspelled while `getStegoframe()` read the correct spelling — the
  getter returned `{url:null, version:null}` forever. The template URL
  is reachable again.
- **Stale getters wired through `load()`.** `getGithub()` and
  `getStegoframe()` read `_config` directly — null on any fresh caller
  that hadn't warmed the cache (bin/auth.js' session check was one).
  Both route through `load()` now.
- **`cfR2Bucket()` zombie removed.** Zero consumers (grep-proved + the
  neighboring comment said Cloudflare config was deleted in 0.8.6 —
  this getter outlived the feature).
- **ENV_REGISTRY Wave-B completion: 24 → 43 entries.** The 19 vars that
  `load()`/module getters already consumed but the registry omitted
  (VANT_MSG_*, VANT_PRUNE_*, VANT_CLEAN_*, VANT_STORAGE_PATH,
  VANT_SYNC_INTERVAL, VANT_BRAIN_PASSWORD_TIMEOUT,
  VANT_ESCROW_DEFAULT_BUDGET, VANT_AGENT_ID, VANT_QOS_MAX_PER_MINUTE/
  PER_HOUR, VANT_WAL_ENABLED) are registered — `vant config list env`
  inventory is truthful. Per-domain `VANT_*` families (spine seeds,
  genesis mesh, sudo, s3 REMOTE_*) stay out with an explicit note:
  their domain modules are the reader of record.
- Pinned by `test/config-registry.test.js` (31 pins now, 8 new).
  Suites green: config 20, config-persistence 13, agents 17,
  agents-split 23.

### Added - Geometry Precision Wiring + Shim Retirement (pass 185)

- **Legacy `Math.imul` lattice shim retired.** `lib/geometry/lattice-keys.js`
  no longer carries the raw imul chain or `LATTICE_MULTIPLIER` — grep-proved
  zero live consumers (the fragmenter's `deriveLatticeKeys` delegates to the
  #155 sha256 PRF; the GitHub adapter rides the fragmenter). One derivation
  chain in the repo, completely now.
- **`lib/geometry/precision.js` (#157) is WIRED.** Quasicrystal store now
  quantizes the address-bearing metadata (position triple, theta/phi/depth)
  through the #157 deterministic quantizer (grid 1e-9): stored records carry
  EXACT integer grid values, so cross-engine last-ulp drift (the sidecar
  future) can never become two different cells, and re-derivation is byte-
  stable. Round-trip honesty unaffected.
- **Real engine-parity leg.** `quasicrystal.engineParity()` runs the SAME
  golden-angle rotation through two algebraically distinct evaluation orders
  (direct libm coefficients vs an angle-sum double-rotation path) and reports
  quantized mismatches — both agree at grid 1e-9; a genuinely different
  rotation IS caught (sensitivity pinned). julia-optional live policy
  unchanged (the wire stays tested separately).
- Pinned by `test/geometry-parity.test.js` (8 pins); suites green:
  geometry-engine, connector, engine-parity-spine 70, hash-canon 29,
  sidecar 8.
- **`lib/geometry/fold.js` (#154) stays a tested primitive** — the facet
  storage layout is now a design sketch (labs/SKETCH-facet-layout.md:
  compat read, refusal contract, /world space consumer) with
  implementation deferred until a real consumer exists.

### Added - Wiring Candidates Landed (pass 184 — hotset, universeSeed, transport verify)

- **HotSet (#153) backs the state spine's tree-read hot path.** `stateStore.treeFor()`
  re-parses a state file on every call — and `verifyStateRoot` + health's
  integrity pass re-call it for the same few files. `lib/state-store.js` now
  backs `treeFor` with a bounded `HotSet` (cap 64 — the ORPHAN #153 gets its
  first consumer) keyed by a CORRECTNESS fingerprint (`stateFile:mtime:size`
  + raw content): repeated reads of an UNCHANGED file reuse the parsed
  payload; any disk change — including external tamper — changes the
  fingerprint → miss → fresh honest read. Hot-set eviction touches only the
  cache (never durability, #153's own law). Metrics: `stateStore.treeHot.metrics()`.
- **`universeSeed` got its first WRITER (#158).** Genesis's `_writeTopology`
  (all four ceremony legs) now persists the per-brain config `universeSeed`
  override — derived from the SAME `resolveUniverse()` resolution the
  spine's SeedChain uses, never clobbering an existing pin, never
  overriding an explicit `VANT_UNIVERSE_SEED` env. The read path existed
  since pass 171; the durable override is now real for mesh installs.
- **Transport verify adoption (Wave F §7, wave 2).** `lib/sync.js` gains
  `verifyProvider(name)` / `verifyAllProviders()` — the GitProvider stack's
  explicit honest verify: reachable repo + branch probe + corpus snapshot;
  unreachable/not-found report `verified:false`, never silently blessed
  (the Wave F rule applied to the sync stacks). `lib/agora-sync.js`'s state
  keeper stamps its reply with the OWNER's locally re-derived `tallyHash`;
  the asker verifies its own post-merge re-tally against it — a forged or
  stale stamp is REPORTED (`verify.verified:false`), never blessed, and
  adopted ballots still survive on their own merge gates. Backward
  compatible: a reply without `tallyHash` → `verify:null`.
- Pinned by `test/wiring-184.test.js` (10 pins): hot cache hit + identical
  root, tamper-detection (no stale blessing), hydrate unaffected, typed
  absence; writer precedence + never-clobber + config↔explicit universe
  round-trip; provider verify honest matrix through the test-DI seam; agora
  stamp agree + forged-disagree legs. 14 consumer suites re-run green
  (state tiers, sync trio, consensus, spine parity, remote-transport).

### Added - RemoteTransport Seam (pass 183, prd-canonicalization Wave F)
- The five "send state elsewhere" stacks (sync, org-sync, agora-sync,
  mirror, connectors/s3) carried private auth lookup, retry
  classification, and verify steps. New `lib/remote-transport.js` is
  the shared seam, built from the git-connector argv-array hardening
  (the security template generalized):
  - `RemoteTransport` interface: `auth()` (the ONE credential door —
    tokens live in the closure, never instance fields), `push()`,
    `pull()`, `verify()`, plus the shared `_run()` ceremony (once-per-
    call auth, classify, exponential backoff from the GitProvider
    semantics).
  - Shared validators (`refLike`/`secretLike`/`payloadLike`) — the
    `_gitRef` fail-closed pattern made requirable.
  - Shared `classifyError`: only VantError's retryable flag is trusted
    for classified errors; message-string matching only as the
    non-VantError fallback; attempts beyond the ladder are a caller
    bug and return non-retryable (never an invented delay).
  - Base `verify()` returns false (honest: "not verified"), never a
    silent bless; unimplemented `push/pull/auth` throw loudly.
- First adopter: `lib/connectors/s3.js` gains `S3Transport` — SigV4
  signing under the shared ceremony; `createClient` stays unchanged.
  Further stacks adopt per-stack (org-sync/agora-sync already align
  on the shared `classifyError` semantics through GitProvider).
- Pinned by `test/remote-transport.test.js` (23 pins): validators
  block traversal/absolute/space/dash/empty/non-string/too-long;
  ceremony (transient retries, auth-once, no backoff burn on hard
  fails, attempts-override, exhausted-throw); verify honesty;
  s3 adopter shape + secret-not-on-instance; describe() leaks no
  secrets. 10 consumer suites re-run green.

### Added - Messaging Trio Charters + Shared Envelope (pass 182, prd-canonicalization Wave E)
- The charter is law (labs/prd-canonicalization.md §6): **msg.js owns
  conversations** (persisted transcripts + in-process channel pub/sub),
  **stream.js owns the work queue** (durable rows, lease, escrow-gated),
  **crew-bus.js owns peer transport** (HMAC-signed HTTP, version +
  scope gates). Overlaps are banned — no dual-ownership channels; a
  record goes to msg OR stream, never both-as-truth; only crew-bus
  leaves the process.
- New `lib/messaging.js`: the ONE shared envelope — crew-bus's wire
  shape `{event:'crew.<type>', from, type, payload, ts, nonce,
  v:{major,minor}}` — now requirable without the network stack:
  `makeEnvelope/validateEnvelope/versionGate/signEnvelope/
  verifyEnvelope/setReceiverVersion`. Crew-bus delegates `_validVersion`
  and `_setReceiverVersion` to it (single home; the pass-61 staging seam
  byte-identical; the unstamped-v1.0 sender tolerance preserved).
  Gate detail: a well-shaped `{major:0,x}` remains shape-valid but
  reports `past-major` (loud refuse) — matching the pass-61 receiver
  contract, while staging still throws on major<1.
- Pinned by `test/messaging-envelope.test.js` (32 pins): shape
  contract, version-gate matrix (garbage/unstamped/both-major-
  directions/minor-additive), sign/verify vs Encrypt on the same bytes,
  crew-bus parity (staging moves one object both layers read), and
  integration legs — a msg conversation snapshot and a stream work row
  both ride the envelope and round-trip with **zero semantic loss**
  (task object survives verbatim; the snapshot still merges).
- Consumer suites re-run green: crew-bus 20, stream, agents, forum,
  webhooks, msg, msg-sync 9, forum-msg-escrow, node-crew 9,
  grand-tour 18.

### Refactored - storage.js Split (pass 181, prd-canonicalization Wave D)
- The 2,391-line, 8-class monolith `lib/storage.js` is split into
  `lib/storage/` per-class files (`file`, `brain`, `vector`, `state`,
  `config`, `schema`, `island`, `remote`) with the security plumbing
  (sandbox/VAF/gates, metrics, events, WAL wiring, atomic write)
  single-sourced in `lib/storage/shared.js`.
- **`lib/storage.js` REMAINS THE IMPORT SURFACE** as the factory facade
  (2,391 → 275 lines): every existing `require('./storage')` consumer
  keeps its exact shape — `get(type)`, safe-by-default shortcuts
  (read/write/delete/has/list), the 0.8.6 raw bypass, used classes,
  `Wal`, `atomicWrite`/`atomicWriteFile`, metrics, multibrain stack
  helpers. **Zero consumer churn.**
- Ownership matrix landed in `labs/prd-canonicalization.md` appendix
  (every data kind → canonical store → backup/WAL/mirror/API).
- Structural gate updated for the split: the atomic-writes structural
  pin now whitelists the relocated single temp-writer in
  `lib/storage/shared.js` (the same one write, new canonical home).
- Suites green: storage 40, brain-strict 14, remote 13,
  storage-metrics 8, storage-mirror 10, wal 14, state-persistence 8,
  atomic-writes 13, grand-tour 18, missing-modules 41, canvas,
  test-storage 14.

### Refactored - One Hashing Module (pass 180, prd-canonicalization Wave C)
- New canonical surface `lib/hash.js`: `sha256(input)` (one-shot hex),
  `sha256H()` (incremental `Hasher` with the exact update()/digest()
  shape the migrated call sites used), `crc32(buf)` (unsigned, via core
  `zlib.crc32` — the stego PNG checksum's core call, made importable),
  `canonicalBytes(value)` (the #146 state/canonical encoder), `hash()`
  and default `hmac()`. No new algorithms — delegates to core
  crypto/zlib.
- Every direct `crypto.createHash('sha256')` call site in `lib/` now
  routes through it: audit (entry chain), wal (blob spam digests), vaf
  (hashIP), encrypt (sha256 + hybridRandom seed mix), s3 connector
  (SigV4 hex), habitat (token hash), storage (_hashToVector), and the
  full state/geometry spine (tree roots/scopes/snapshots, canonical,
  checkpoint ids, seeds universe/scope/int/child, spine cellAddress,
  raid shardHash, lattice-keys). Digests are **byte-identical** to the
  outgoing impls (same `update()` call shape preserved by the Hasher
  shim) — pinned, not assumed.
- Pinned by `test/hash-canon.test.js` (29 pins): byte-identity vectors
  vs direct crypto, `hash() === canonical.hash()`, golden vectors for
  the migrated contracts, `crc32 === zlib.crc32`, a fail-closed
  non-Buffer rejection, and a **grep gate** proving no lib module calls
  `crypto.createHash('sha256')` outside `lib/hash.js`.
- Migrated suites re-run green: audit, wal, state-wiring,
  engine-parity-spine, backbone, encrypt, vaf, geometry-engine,
  habitat-token, mesh-status, stego ×2, state-persistence.

### Added - Event Bus Observability + Wiring (pass 179, prd-canonicalization Wave A)
- The shared bus emitted 266 distinct event names with only 8 heard
  anywhere. New: opt-in JSONL session sink in `lib/event.js`
  (`event.sinkEnable/Tail/Stats`, OFF by default, ring-bounded, never
  breaks emission), `vant events` CLI (tail/enable/disable/stats,
  cross-process read of the most recent session), and MCP tools
  `event_tail` / `event_sink_enable` / `event_sink_stats`.
- `lib/event-wiring.js` (wired at boot): security denials
  (`vaf:blocked`, `rls:denied`, `trust:blocked`, `market:blocked`),
  `storage:error`, stego and secret lifecycle events → the hash-chained
  audit ledger (audit.log — the warn/info/error family is console-only);
  `sync:push/pull:failed` → surfaced in `vant health` as the `sync`
  check. Pinned by `test/event-observability.test.js` (40 pins).
- FIXED (pre-existing): `lib/health.js runChecks()` crashed on every
  call with `ReferenceError: _checkRead` (the sandbox read gate helper
  was removed in an earlier refactor; the call site survived). Restored
  with the stego/sandbox `_checkRead` shape.

### Added - Config Env Registry (pass 179, Wave B)
- `lib/config.js` now owns a 24-entry `ENV_REGISTRY` of every `VANT_*`
  env var the codebase consumes (server/mcp/webhook/health/runtime),
  with `envRegistry()`, `listEnvConfig({maskSecrets,includeUnset})`
  (typed coercion, masked secrets), and `unknownEnvVars()` (typo scan).
  `vant config list env` prints the resolved registry view.
- Straggler modules migrated off direct `process.env` reads:
  webhooks (port/bind/secret/url), health (port), via new config
  getters `webhookPort/Bind/Secret/Url`, `healthPort/Bind`,
  `agentsMax`. Health gains the `config-env` check flagging set
  VANT_* vars the registry does not know. Pinned by
  `test/config-registry.test.js` (23 pins).

### Fixed - Cross-Brain Privilege Leak via Boot Hydrate (axolotl pass 123)
- Boot's persisted operator-capability hydrate resolved the brain via
  `brain.getCurrentBrain()`, which ignores `VANT_BRAIN` — a VANT_BRAIN-scoped
  process hydrated the DEFAULT brain's caps (cross-brain privilege leak;
  surfaced in CI as a deny-by-default false negative). Hydrate now uses
  `config.currentBrainName()` (state-store semantics: VANT_BRAIN wins),
  matching where `vant org grant` and `config set` persist.
- Bare `vant org` defaulted to the `grant` subcommand — any side-effect-free
  invocation (including `test/ci.js`'s bin smoke) silently PERSISTED operator
  capabilities into the active brain. Default is now read-only `status`;
  granting is explicit. Pinned by `test/operator-caps.test.js` (10 gates:
  leak pin + bare-org read-only pin).

### Added - Brain Layout Migration (merge-safety, axolotl)
- `vant migrate` (lib/migrations.js, layout v3): imports pre-multibrain
  (old single-brain) layouts into `models/{public,private}/<name>/` and
  synthesizes the brain stack — old-style user brains stay readable after
  the axolotl merge. `vant start` auto-runs it; `--no-migrate` opts out.
- `--brain-name <name>` names BOTH imported scopes (default `vant`);
  hostile/invalid names fall back to the default (never a path).
- Detection is content-based and conservative; idempotent; failed imports
  withhold the v3 marker so the next start retries (exit 1 + warning).
- Alert surfaces: start banner (real imports only), `vant health`,
  `vant migrate --status`, MCP `brain_migration_status`.

### Fixed - Security & Robustness (axolotl QC waves)
- Git CLI injection closed across `lib/branch.js` and all four git
  connectors (github/gitlab/bitbucket/selfhosted): git ops are now
  argv-array only (no shell); hostile refs rejected via `_gitRef`.
  Pinned by `test/git-injection.test.js`.
- `lib/branch.js` crashed with `audit is not defined` on every CLI-path
  commit/checkout/merge (audit was called, never required).
- Commit messages are arbitrary text again: strict content patterns no
  longer reject quotes/backticks (argv-array made them inert).
- Migration import is existing-wins (never clobbers live multibrain
  files), skips symlinks, and one refused file can't abort an import.
- Brain circuit breaker (BRAIN_CIRCUIT_OPEN) on repeated load failures.

### Evolution - Temporal Learning System
- Session tracking: changes, insights per session
- Auto-start/end sessions
- Brain load tracking → attention boosting
- Memory integration: sessions persist for semantic search
- Islands integration: lazy-load evolution data
- MCP tools: brain_evolution_start, brain_evolution_end, brain_evolution_insight, brain_evolution_history, brain_evolution_status
- Dream integration: evolution insights consolidate to learnings

### Multi-Brain Architecture v0.9.0
- Stack-based multi-brain loading (pushBrain, popBrain, getStack)
- Brain switching (currentBrain, switchBrain)
- Brain modes: silo, shared, governance
- Brain types: public, private
- State persistence: stack saves to models/state.json

### Architecture - Areas to Address

> Architectural improvements identified for future versions.

#### Config Consolidation
- Current state: Fragmented config across multiple files
  - `lib/config.js` - Runtime config (env vars)
  - `settings.ini` - User personality/preferences
  - `settings.example.ini` - User settings template
  - `config.example.ini` - System config template
  - `models/private/_config.json` - Brain registry (new)
- Issue: No single source of truth for configuration
- Task: Unify into layered config system
  - Layer 1: Runtime defaults (lib/config.js)
  - Layer 2: System config (settings.ini)
  - Layer 3: User preferences (settings.ini)
  - Layer 4: Runtime overrides (env vars)
- Benefit: Easier to understand, configure, migrate

#### Boot Flow Modularization
- Current state: lib/boot.js loads layers sequentially
  - sudo → sandbox → qos → escrow → lock → audit → brain → islands
- Issue: Rigid order, hard to customize, hard to add new layers
- Task: Make boot more modular
  - Configurable boot order via config
  - Plugin hooks for boot stages
  - Conditional layer loading
  - Clear dependency chain
- Benefit: More flexible, easier to extend, better debugging

#### Plugin/Extension System
- Current state: No formal plugin system
- Vision: Runtime-extensible Vant
  - Plugins register via standard interface
  - Plugin can add: handlers, islands, tools, routes
  - Plugin lifecycle: init → register → start → stop
  - Plugin discovery: file-based or registry
- Tasks:
  - Define plugin interface (register, config, lifecycle)
  - Plugin loader in lib/boot.js
  - Plugin registry (which plugins active)
  - Sandboxed plugin execution
- Benefit: Ecosystem of shareable extensions

---

## [0.8.6] - 2026-06-30

### Feature - Headless Mode (v0.8.6 SCOPE)

> Cloudflare headless mode for agent canvas. MCP→API unified abstraction.

- **API System** (2026-06-30)
  - EXISTS: lib/api.js - Unified CLI/MCP/headless interface (HAS AUTH)
  - EXISTS: lib/mcp.js - JSON-RPC server (158 tools!) - NOW HAS AUTH
  - EXISTS: lib/vant.js - Main runtime, lazy-loads mcp
  - EXISTS: Mode detection (cli/mcp/headless)
  - EXISTS: vant.startFull() - starts MCP server
  - EXISTS: vant.mcp.execute() / listTools()
  - ADDED: MCP↔VANT tool parity (vant.executeTool routes to MCP)
  - ADDED: Auth handler for MCP (config.mcpRequireKey gates access)
  - ADDED: vant.authenticate() - common auth for headless

- **Auth & Pipeline Fixes** (2026-06-30)
  - FIXED: mcpRequireKey now checks config flags before env var
  - FIXED: QoS and Escrow now registered with brain pipeline
  - FIXED: Added execute() to Escrow class for pipeline integration
  - FIXED: Added execute() to QoS module for pipeline integration
  - FIXED: CLI help shows correct VANT_MCP_REQUIRE_KEY env var

- **Architecture** (2026-06-30)
  - Entry: lib/vant.js - Main runtime, 30+ lazy getters
  - Security: lib/framework.js - VAF → QoS → Escrow chain
  - Lifecycle: lib/runop.js - start→run→stop state machine
  - Server: lib/server.js - HTTP/TLS with security chain
  - Search: lib/search.js - query → rerank → hydrate

- **Agent System** (2026-06-30)
  - Max 4 agents (you + 3 coworkers)
  - spawn(), delegate(), delegateAsync(), fork(), join()
  - lib/agents.js with sandbox protection

- **Messaging** (2026-06-30)
  - lib/msg.js - Conversations (with history), Channels (IPC), Encryption
  - lib/stream.js - enqueue(), poll(), complete(), lease()

- **Cloudflare Integration** (2026-06-30)
  - TODO: CF Functions folder location
  - TODO: lib/connectors/cloudflare.js integration
  - TODO: KV/R2/Workers adapters

- **Admin UI** (2026-06-30)
  - TODO: MCP tool exposure for brain CRUD
  - TODO: Geometry storage tools (barcodes)
  - TODO: Canvas/sharing tools

- **Index Engine** (Roadmap)
  - TODO: High-performance index for geometry/semantic/flat storage
  - TODO: Nature-inspired indexing (math constants, golden ratio patterns)
  - TODO: Unified index across brain types (private/public/gov)
  - TODO: Efficient recall and assimilation system

- **Config System Consolidation** (Roadmap)
  - DONE: Per-brain JSON config with global fallback (v0.8.6)
  - TODO: Additional config utilities per brain

> Original intent: VANT gates all endpoints as OS functions
> - vant.execute(tool, args) wraps all operations
> - Security chain: VAF → Sandbox → QoS → Auth → Escrow

## [0.8.6] - 2026-05-30

### Feature - AI-First Runtime Interoperability (v0.8.6)

- **Event Wiring** (2026-05-30)
  - ADDED: Events emitted by core vant.js operations
    - agent:initialized - on vant.init() complete
    - think:complete - on vant.think() with insights count
    - learn:saved - on vant.learn() with key/category
    - module:discovered - when registry builds with module count
    - act:executing/completed/failed/blocked - operation lifecycle
  - Event system available via lib/event.js

- **Auto-Islands** (2026-05-30)
  - ADDED: Auto-hydrate islands in vant.init()
    - Detects agent identity + role
    - Calls islands.findTriggers() for context
    - Auto-hydrates relevant islands

- **Security Chain** (2026-05-30)
  - ADDED: Full security chain in vant.act()
    - VAF validation (input schema checking)
    - QoS rate limiting (1000 ops/min per type)
    - Escrow quota check (budget enforcement)
    - Lock serialization (concurrent safety)
  - Previously only had lock + audit

- **Discovery Registry** (2026-05-30)
  - ADDED: vant.buildRegistry() - auto-scan lib/*.js
  - ADDED: vant.discover({ capability: 'security' }) - filter by capability
  - ADDED: vant.findByCapability('memory') - list by type
  - Maps 63 modules across 10 capabilities:
    - memory, search, agency, security, compute
    - network, events, scheduling, observability, config
  - Auto-emits module:discovered event

- **System Dashboard** (2026-05-30)
  - EXTENDED: system.status() now returns:
    - boot: layer initialization state
    - events: listener count, uptime
    - discovery: modules, capabilities, byCapability
    - services: compute, embed, storage... (unchanged)
  - ADDED: getLayerStatus(), isOperationAllowed() framework interface

- **User Extensibility** (2026-05-30)
  - 3 ways to extend without touching core:
    1. Add .js file to lib/ (auto-discovered)
    2. Add connector to lib/connectors/ (auto-loaded)
    3. Subscribe to event system (no file needed)
  - Hook into: agent:initialized, think:complete, learn:saved, act:*, module:*

- **Batch 2: Memory Trio Interoperability** (2026-05-30)
  - ADDED: storage.js events
    - storage:saved - when file written with category/key/size
    - storage:loaded - when file read with path
    - storage:deleted - when file removed
    - storage:miss - when get() returns null
    - storage:checked - when has() returns true
    - storage:error - on sandbox denials
  - ADDED: search.js events
    - results:found - when query returns hits
    - search:empty - when LTC missing
    - pipeline:executed - when rerank+compress completes
  - ADDED: cache.js events
    - cache:set/onRemove/hit/miss/expired/evicted/cleared
    - cache:flushing/flushed - DUALITY bridge events

- **Batch 3: Config Centralization** (2026-05-30)
  - ADDED: config:changed event
    - Emits on setFlag() when value actually changes
    - Includes oldValue and newValue for observers

- **Batch 4: Boot System Visibility** (2026-05-30)
  - ADDED: boot events
    - boot:starting - on init() start with taskId/scopes
    - layer:loaded - each layer init with order/count
    - boot:complete - full stack ready with layers/uptime
  - FIXED: escrow require path ('./lib/escrow' → './escrow')
  - ADDED: boot.getBootState() - state exposed to system.js
  - ADDED: boot → system.status().boot now shows full layers

- **Batch 5: Duality Bridge** (2026-05-30)
  - ADDED: cache.flush() - returns entries for persistence
    - Clears memory cache, returns [{key, value, timestamp}]
    - Emits cache:flushed with entry list
    - Enables temp ↔ persist tiering
  - Storage listeners can subscribe and persist flushed data

- **Batch 6: Heartbeat Systems** (2026-05-30)
  - ADDED: cron.js events
    - task:scheduled/running/completed/failed
    - job:started/completed/failed (JobWorker)
  - ADDED: metrics.js events
    - metric:milestone - every 100 increments
    - metric:spike - gauge changes >50%
  - ADDED: islands.js events
    - island:hydrated/dehydrated/hydrate:failed
  
- **Batch 7: Coordination Systems** (2026-05-30)
  - ADDED: consensus.js events
    - vote:cast/quorum/consensus
  - ADDED: network.js events
    - network:checking/online/offline
    - network:blocked (capability/domain)
    - network:cache:hit/miss
    - network:request:start/success/error/timeout
  - FIXED: network.js checkOnline() URL parsing bug

- **Batch 8: API & Integration** (2026-05-30)
  - ADDED: api.js events
    - api:executing/executed/auth:failed/error
  - ADDED: sync.js events
    - sync:push:starting/complete/failed
    - sync:pull:starting/success/failed
  - ADDED: audit.js events
    - audit:info/warn/error
    
- **Batch 9: Compute & Embed** (2026-05-30)
  - ADDED: compute.js events
    - compute:invoking/invoked
    - compute:eval:starting/complete
    - compute:run:starting/complete
  - ADDED: embed.js events
    - embed:generating/generated
    - embed:batch:starting/complete

- **Batch 10: Infrastructure** (2026-05-30)
  - ADDED: theme.js events
    - theme:apply
  - ADDED: escrow.js events
    - escrow:budget:check
    - escrow:spend:recorded
    - escrow:execute:before/check/after
  - ADDED: branch.js events
    - branch:checked-out
    - branch:committed
  - ADDED: lock.js events
    - lock:acquired
    - lock:released

- **Batch 11: Core Systems** (2026-05-30)
  - ADDED: brain.js events - brain:cache:hit, brain:loading, brain:loaded
  - ADDED: auth.js events - auth:validated, auth:failed
  - ADDED: mcp.js events - mcp:request/response/error
  - ADDED: lineage.js events - lineage:recorded
  - ADDED: error.js events - error:retry/attempt/exhausted
  - ADDED: vaf.js events - vaf:blocked
  - ADDED: stego.js events - stego:encoded, stego:decoded
  - ADDED: agents.js events - agent:spawned, agent:delegating, agent:delegated

- **Batch 12: Utilities** (2026-05-30)
  - ADDED: format.js events - format:parsed
  - ADDED: update.js events - update:check
  - ADDED: canvas.js events - canvas:painted

- **Batch 13: Security + Infrastructure** (2026-05-30)
  - ADDED: encrypt.js events - encrypt:encrypted, encrypt:decrypted
  - ADDED: shell.js events - shell:exec
  - ADDED: security.js events (header)
  - ADDED: qos.js events - qos:rate-limit
  - ADDED: stream.js events - stream:enqueued, stream:polled, stream:completed
  - ADDED: sudo.js events - sudo:escalation

### Feature - Multi-Agent Orchestration (v0.8.6)
- **MCP Agent Tools** (2026-05-13)
  - ADDED: agent_spawn - Spawn new agent (quota = agents.maxAgents)
  - ADDED: agent_list - List active agents with IDs and states
  - ADDED: agent_kill - Kill agent by ID
  - MCP server now exposes /rpc endpoint with brain_* prefixed tools

- **Agent Quota** (2026-05-13)
  - ADDED: MAX_AGENTS = 4 limit enforced in spawn()
  - Returns error when quota reached

- **Orchestrator** (2026-05-13)
  - ADDED: agents.delegate(id, task) - Assign job to specific agent
  - ADDED: msg.send(channel, message) - Broadcast to channel
  - ADDED: Full vant↔brain↔agent↔msg loop wired

- **Agent-Brain Wiring** (2026-05-13)
  - agents.spawn() → brain.attend(name) tracks attention
  - agents.spawn(parent) → brain.fireSynapse(parent→child)
  - msg.post() → brain.attend(conversation)

### Feature - Git Provider Parity (v0.8.6)
- **Multi-Provider Support** (2026-05-10)
  - ADDED: GitLabProvider with full API (issues, MRs, pipelines)
  - ADDED: BitbucketProvider with full API (PRs, repo details)
  - ADDED: SelfHostedProvider with git CLI operations
  - ADDED: Unified getProvider() factory in lib/remotes.js
  - All providers share common API: issues, comments, PRs, repo, branches, status
  - Provider-specific features: GitHub Actions, GitLab Pipelines, Bitbucket Issues

- **Sandbox Refactor - Execution Keeper** (2026-05-10)
  - REFACTORED: sandbox.js - now delegates to qos, lock, network
  - ADDED: domain whitelist to network.js (isDomainAllowed, setAllowedDomains)
  - ADDED: network.fetch() domain checks
  - WIRED: sandbox into framework.js, vant.js, api.js (fully integrated)
  - REMOVED: duplicate quota/concurrency in sandbox (uses qos.RateLimiter)
  - REMOVED: direct lock usage (delegates to lock module)
  - Role: Agent/Node execution isolation "keeper"

- **Sandbox Keeper Features** (2026-05-10)
  - ADDED: budget delegation to escrow (getBudgetStatus, recordSpend)
  - ADDED: capability flags (canRead, canWrite, canNetwork, canSpawn, canCommit, etc.)
  - ADDED: operation scopes (read, write, network, spawn)
  - ADDED: getCapabilities(), setCapabilities(), can(cap)
  - ADDED: getScopes(), setScopes(), hasScope(scope)
  - ADDED: getOperationHistory(), getErrors()
  - ADDED: isolate() for untrusted sub-sandbox
  - Full keeper integration: agents now have proper guards/lanes

- **Runtime Gate Integration** (2026-05-10)
  - ADDED: capability gate to network.fetch() (checks canNetwork)
  - ADDED: capability gate to agents.spawn() (checks canSpawn)
  - ADDED: capability gate to msg.post() (checks canWrite)
  - ADDED: CircuitBreaker from qos (trips on failures)
  - All runtime operations now protected by sandbox
  - Full gate map: network → agents → msg → sandbox

### Breaking Changes (v0.8.6)
- **Consolidated Cache Module** (2026-05-09)
  - REMOVED: memoize.js, compression.js, pool.js, cache.js, cache-control.js
  - NEW: unified lib/cache.js (LRU cache + compression + buffer pool)
  - All consolidate into single cache module
  - No backward compatibility - v0.8.6 is breaking

- **Deleted Unused Search/Query Modules** (2026-05-09)
  - DELETE: rerank.js (in search.js already)
  - DELETE: search-hyde.js (in search.js)
  - DELETE: search-hybrid.js (in search.js)
  - DELETE: query-builder.js (unused)
  - DELETE: rate-limit.js (qos has it)
  - DELETE: pipeline.js (unused)

- **Unified Event Module** (2026-05-09)
  - NEW: lib/event.js (Event + PubSub + Queue + Job)
  - MERGED: event-bus.js, queue.js, job_worker.js, throttler.js, debouncer.js
  - Renamed class: Event (was EventBus)
  - Added: Queue + Job classes
  - Added: framework interface (getLayerStatus, isOperationAllowed)

- **Deleted Unused HTTP Modules** (2026-05-09)
  - MERGED: body-parser, cors, helmet, middleware-stack, session, session_store → server.js
  - integrated: BodyParser, CORS, Helmet, MiddlewareStack, Session, SessionStore

- **Unified QoS + Throttler + Debouncer** (2026-05-09)
  - MERGED: throttler.js, debouncer.js → qos.js
  - Added: Throttler, Debouncer classes
  - Added: QoS.throttle(), QoS.debounce()

- **JobWorker in Cron** (2026-05-09)
  - MERGED: job_worker.js → cron.js
  - Added: JobWorker class

- **Delete Deprecated Wrappers** (2026-05-09)
  - DELETE: audit-log.js, metrics.js, storage.js, buffer.js, entropy.js, serializer.js, load.js, horcrux.js, env.js
  - 9 deprecated wrappers removed

- **Sanitize + IPFilter in VAF** (2026-05-09)
  - MERGED: sanitize.js + ip-filter.js → vaf.js
  - Added: VAF.Sanitize, VAF.IPFilter classes

- **Hybrid-Sync in Sync** (2026-05-09)
  - MERGED: hybrid-sync.js → sync.js
  - Added: hybrid_getPrivacyConfig, hybrid_setPrivacy, hybrid_getPublicRepos, hybrid_getPrivateRepos

- **ErrorHandler in Errors** (2026-05-09)
  - MERGED: error-handler.js → errors.js
  - Added: errors.ErrorHandler class

### Added
- **Vant Class + Agent Runtime** (2026-05-09)
  - lib/runtime.js → lib/vant.js: Renamed main module
  - NEW: Vant class - ultimate agent with full system access
  - lazy-loads all core systems: brain, search, islands, config, memoize, lock, audit, compression
  - NEW: vector-store.js, cron.js, conversation.js modules added
  - OS features merged: encrypt shortcuts, QoS, stego, agents, ipc
  - getLayerStatus() + isOperationAllowed() - standard interface
  - framework.js, agents.js updated to use vant.js

### Changed
- **Runtime renamed to Vant** (2026-05-09)
  - runtime.js → vant.js
  - framework.js updated
  - agents.js updated

### Added
- **Core Modules for Vant Class** (2026-05-09)
  - lib/vector-store.js: Local embedding-based semantic memory
  - lib/cron.js: Task scheduling with setInterval
  - lib/conversation.js: Shared context between agents
  - Used by new Vant class runtime

## [0.8.6] - 2026-05-08
### Changed
- **Search Consolidation** (2026-05-08)
  - lib/search.js: Unified search + rerank + hybrid + hyde
  - lib/rerank.js, lib/search-hybrid.js, lib/search-hyde.js: Deleted
  - Consumers updated: bin/mcp.js, bin/search.js, bin/rerank.js
  - New exports: rerank, compress, pipeline, stripFluff
- **Config+Env Merge** (2026-05-08)
  - lib/config.js: Now exports all VANT_* envvars
  - lib/env.js: Deleted - all exports moved to config
  - Consumers updated: server.js, auth.js, api.js, bin/node.js, bin/mcp.js

- **Pool Consolidation** (2026-05-08)
  - lib/pool.js: Unified class for buffer + storage + resources
  - lib/buffer.js, lib/storage.js: Deleted - merged into pool
  - framework.js updated: require pool instead of buffer/storage

- **Audit Unification** (2026-05-08)
  - lib/audit.js: Unified audit + metrics + user tracking
  - lib/audit-log.js, lib/metrics.js: Deleted - merged into audit

### Deleted
- lib/env.js
- lib/buffer.js
- lib/storage.js
- lib/audit-log.js
- lib/metrics.js

### Fixed
- framework.js: _configFlag not defined
- test/coverage.js: horcrux require → stego

## [0.8.5] - 2026-05-07
### Added
- **Encrypt Class**
  - New lib/encrypt.js: Consolidated crypto handlers pool
  - All crypto operations now use Encrypt

### Changed
- **Search Consolidation** (2026-05-08)
  - lib/search.js: Unified search + rerank + hybrid + hyde
  - lib/rerank.js, lib/search-hybrid.js, lib/search-hyde.js: Deleted
  - Consumers updated: bin/mcp.js, bin/search.js, bin/rerank.js
  - New exports: rerank, compress, pipeline, stripFluff
- **HTTP Server Consolidation**
  - server.js: Merged Request, Response, Router, Static inner classes

