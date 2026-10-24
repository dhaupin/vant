# Vant Labs — Session Task Tracker

**Branch:** axolotl  
**Last Updated:** pass 353 arc (2026-10-23, THE CRASHTEST PIT STOP +
THE GRADUATION: the D1/KV-shaped library rows armed over the
harness fake backend — fixture routes charge/profile/device/upload in
scripts/crashtest-run.js; library rows 25/0/5-skips → 30 REFUSED / 0
EXPLOITED / 0 skips; the upload fixture's own name permit measured a
real finding on the hour of arming (double-extension stored verbatim →
EXPLOITED) and the single-dot-extension permit landed the same pass;
both CI gate layers green, whitelists still empty. Cross-repo asks
filed on dhaupin/crashtest: #9 fakeD1/FakeKV breadth (supplements
Rook's #8), #10 memory rows, #11 governance rows, #12 env-claims
manifest, #13 the vant census (258 suites / ~54k lines, ~70-80%
pack-shaped), #14 chaining/step-scoped verdicts. Two-engine spec:
labs/prd-crashtest.md + labs/prd-crashtest-casestudy.md (S0 measured,
S1 anchored-projected). Identity waves: the motto "Trusting the
universe, but with receipts" adopted (prd-brand §6 - hero kicker,
footer, README, docs hub, brain "THE WAY", AGENTS.md); the backronym
KEEP-forever exactly "Versatile" (misspelling sweep clean,
labs/prd-brand §2); the GRADUATION - vant is canonically "the
memory-first agent OS" (prd-brand §1, prd-marketing forms ladder;
memory stays the wedge, OS claims map to the layer table in
docs/essential/architecture.md). BRAIN ROTATION: private layer pruned
29 → 13 dirs (16 test-carcass brains swept); the fifth art pack
'crest' (CREST-DUSK, the OS wave) joined the reserved four
(14/14 art-pack pins, 5/5 stego round-trips); the boot stone ROTATED:
models/public/vant/boot/axolotl-p_axolotl-os-2026.svg
(password axolotl-os-2026), honest post-prune mass 10 brains/corpus,
inspect valid, boot discovery resolves it, .sha256 verified sidecar,
anchor re-pinned (the ledger had drifted since Oct 13: vant horcrux
anchor → verify green). Prior stone archived to labs/archives/horcruxes/
with its still-working casing. Gates: language 211, docs style 126,
home 13, web-home style 40, surface consistency, changelog parity,
art packs 14/14 — all PASS.)
**Prior — pass 351-352 arc (the FICTION SWEEP: the home site
and docs hub audited claim-by-claim against the code; commits
74185ec7 (pass 351: npm-link install truth, five-minute copy, section
numbering, AGENTS.md succession path) and 623794d2 (pass 352: embedConfig
+ dead PNG stone path retired from boot.md, VANT_MCP_BIND / vant server
cert truth in mcp.md, islands boot verb split, root require('vant')
re-exports init/think/learn/remember + storage — both pushed, gates+
battery green. Brain refreshed and the canonical stone resealed)
**Prior — pass 331-333** (the SIBLING REVEAL: synmergia's
closed-source frame cherry-picked vant structs first and now flows
learnings back — full arc on record: prd-kernel.md §5b TWO correction
waves + the pass-333 hands-on deep crawl; prd-kernel-extensions.md
E1-E9 port plan; direction law recorded in goals/lessons (one crew,
two runtimes, issue-first return lane). Kernel constitution gates
self-contained canon (no sibling access needed). The parked-commits
line grew past this note: 322-333, then 348-352, all pushed, all green.)
**Prior — pass 328** (the HEAP SWEEP: the private-layer census
found ~180 test-brain carcasses inflating the stone — ~110 timestamped
scratch brains (ag/ht/ib/rls/op/wm/wsb-test-* minted per test run and
never cleaned, a classic leak pattern) plus ~60 named remnants
(livefire-290*, qc-sweep/r2/r3/r4/trace*, lf-ind-*, gstest, lwtest,
mcp/msg-suite-local, q292, p292-cli-smoke, pin-probe, up-def-pin,
sudo), all self-healing (tests recreate scratch brains + named dirs at
runtime; verified post-sweep: brain 77/77, guests 25/25, leisure
21/21). models/private 199 -> 19 dirs; stone refreshed to honest
mass: 78 -> 12 brains/corpus (kept: stack vant/axolotl/
pairing-ride-pilot, predecessor buffy, pilot family, islands.json,
stegoframe lab bundle). LEAK LESSON filed in axolotl lessons.md: scratch
brains need a kill switch in the test harness (future pass: post-run
cleanup or VANT_TEST_SCRATCH tmpdir routing).
**Prior — pass 326/327** (the BRAIN REFRESH + the succession pass:
stone regenerated twice 2026-10-21 after the 317-325 arc; Buffy sleep
write into models/private/axolotl/lessons.md + goals next-wave update;
public brain start.md/bootstrap.md gained the pick-up-the-project
pointers (TASKS.md, PRDs, ethics page, MEM handoff); prune CLI scan
came back clean earlier (heap lives in private storage, pruner rightly
refuses).
**Prior — pass 322** (the MOBILE BLEED FIX: the pass-321 home
page rendered but its terminal code blocks bled off-viewport on phones
— `pre.term code { min-width: max-content }` propagated the longest
line's width up as min-content, and the ancestors refused to shrink:
`.dual-cta` used `1fr` in the ≤780px query (grid tracks default to
minmax(auto,1fr) and grow to fit unbreakable min-content) and
`.cta-card` had the default `min-width:auto`. Diagonal fix — every link
in the chain gets a shrink key: `.cta-card` gets `min-width:0`, the
mobile query changes to `minmax(0,1fr)`, and on mobile the code drops
max-content (`min-width:0; white-space:pre-wrap; overflow-wrap:
anywhere`) so the pre's width wins and the long git-clone line
soft-wraps instead of scrolling/bleeding; copy button moves to the
bottom on mobile so it doesn't sit over wrapped text. Desktop keeps
the max-content + overflow-x:auto behavior (no inner scrollbar on
phones where it's hard to scroll). VERIFIED: home gate PASS (125
permalinks). 
**Prior — pass 321** (the DIST→WEB/HOME move, owner call: “/web/home
it is”. git mv dist web/home history-preserving; the pass-150 gate
rewritten as scripts/check-home.js walking web/home/*.html (same 6
checks), packaging lint:home + test.yml “web/home gate”; PRD override
recorded in prd-web.md §1 directives + §2.5 (“/dist stays the Pages
lander” superseded, paths + future-Vite note moved in); DEPLOY.md §12
gains the home frontend row + mode-B clarification; bin/build.sh bundle
output moves to build/vant-bundle (top-level dist/ stops doing double
duty as public artifact AND distribution sink); lib/version.js,
prd-brand.md §5, prd-content.md paths truth-up. VERIFIED: home gate
PASS (125 permalinks), surface consistency, docs truthfulness (126
files), language, eslint, bin-truthfulness, docs tests 6/6. Cloudflare
vant-pub project build output directory switches to web/home panel-side
by the owner)    

**Prior — pass 286 (the ② CLOSE: PR #221 accepted, main merged
(8feb448) and LIVE on brain.creadev.org — post-merge corridor re-proved
byte-exact verbatim forward + typed gate law, the pass-283 traveler
bundle served (200); then the Pages deploy log sweep — root .nvmrc
20→22 (the EOL node + vitest EBADENGINE warns die with it) and the
582 kB entry chunk is really code-split into framework-react/
framework-tanstack/framework-zod (rolldown output.codeSplitting, NOT a
chunkSizeWarningLimit raise), local build shows 218 max / 166 index,
no warning)    
**Session:** Pass 242 - THE NAV + MISSIONS SPEC: eight new modules queued
(consensus, resolution/citations, era/succession, nature flywheel,
habitats, cron manager, settlements, origins), the hierarchical
Cloudflare-sidebar model adopted (3.3-5c), and the two frame
requirements: ui-state memory (return to your page after the 15-min
window) and the vetted cache-busting framework (?hash= breaker,
3 layers). Next: the FRAME pass lands 5c + memory + breaker at once.  
**Prior:** Pass 284 - THE CAIRN/PRESTRUCT PITSTOP (issue #219 CLI closure:
bin/transform.js --brains <a,b> on gather/full/horcrux/backup; lib gatherMode
scopes the mode inventory stack by the SAME allowlist with byte-identical
unfiltered behavior; test/transform.test.js harness async pins actually drain
before results, filter pins added; cli.md transform rows updated; suites:
transform 16/16, brain-storage-strict 14/14, cli-smoke 2/2, coverage PASS,
truthfulness PASS, lint 0).
**Prior:** Pass 283 - THE TRAVELER FRONTEND LANE: the enterprise router
object's front end landed end to end — kit gains EVENTS.travel; the pod's
webhook face routes relay.travel through the bridge family (19a-d pins);
the dashboard edge accepts the family on BOTH lanes, shape-law from the
vendored traveler contract, translated to the door's brain_write slot via
a shared forwardDoorCalls helper; the browser minter (src/lib/travel.ts)
mints content-addressed tr/1 packets (WebCrypto sha-256) and travelerSend()
preflights the law BEFORE any wire; the Traveler module (route /traveler,
tiers O A S) mints+sends and reads the door's real traveler_list/status/
audit verbs verbatim; the solo posture page states the carrier truth
(sealed hops only, the traveler is never decoded by a blind middlebox).
Suites: relay 61/61, traveler 26/26, parity 0-exit, vendor --check 0,
lint:web 0, pilot:relay 0, dashboard tsc+vitest 103/103, relay tsc 0.
**Prior:** Pass 240 - THE DEBRIS SWEEP: 277 test-debris brain trees
deleted from models/private/ (incl. rook119, the org-drill artifact),
keeping axolotl + buffy + vant + shared state; the canonical stone
refreshed (same password), exactly 3 brains, 11.4 MB -> 2.9 MB.

---

## THE LEDGER RULE (owner ruling, recorded so it STAYS)

**Passes and pins ONLY.** The frontend arc briefly used a "build day N"
ledger; it is retired: a day is not a house rule, it does not obey time
dilation nor epoch, and there is no room for fantasy in vant
dev/engineering cycles - even at the frontend. Every entry below is a
PASS in the house ledger (pass 216 = the P1 scaffold, ascending
chronologically to pass 230); the in-history dates are ambient calendar
scratch, not the unit of work. New entries open as `Pass <n>`.

---

## ARCHIVE POINTER (owner ruling, 2026-10-16): the OLDER half of this ledger
(sessions 2026-09-21 through 2026-10-08, pass-170 era and back) lives
verbatim in [TASKS-ARCHIVE.md](TASKS-ARCHIVE.md). That file is the
long-history half; this file is the working half. When this file
grows past ~2k lines again, split at session boundary INTO the
archive (newest-first append there) - never delete history.

## Pass 256 (2026-10-16) - THE TRAVELER JOINS THE OS: pipeline-wired, evented, audited, crew-attributed — the same abstraction, the whole machine

**Owner's frame:** one abstractable mechanism (a traced, auditable
object riding the system) repurposed across every scope — surface flows
today; backend rulesets/canonicalization/namespacing/allow-lists next.
Before any frontend, the traveler had to play nice with the OS.

- PIPELINE WIRED (lib/traveler.js): reads/writes through the sandbox
  capability gate via lib/gate (the house untouched-stub-ALLOWS
  posture — an explicitly configured refuser stays a refuser), caller
  strings vaf-validated (a centered helper that throws, never
  silently passes), module-level QoS lane (RateLimiter; the door verbs
  await `gateCheck`), persistence audible: audit trail
  (`[Traveler] persisted …`) + shared bus (`traveler:persisted`,
  `traveler:refused`). All refusals are typed lib/error.js VantErrors —
  the pass-169 zero-raw-throw law holds; the E_TRAVELER_* taxonomy is
  unchanged.
- CREW ATTRIBUTION: steps carry `by` (explicit > VANT_AGENT env > the
  current brain) and an informational `team` lane — a traveler hop
  knows WHICH agent/crew landed it.
- DETERMINISM LAW SHARPENED: mint accepts `now` — same payload + same
  ledger + same ts = the SAME address; the A1 pin is a law now, not a
  millisecond race on the wall clock.
- DOOR (lib/mcp.js): traveler_open/hop await the gateCheck lane before
  touching the pin ledger.
- SUITE: 31/31 — the H-block pins the integration mechanically:
  H1/H2 the security-pipeline scanner classifies traveler as WIRED
  (sandbox+vaf+qos gate layers, audit informational — run against the
  scanner's own `scan()`); H3 typed refusals; H4 event-bus audibility
  (listener-off via the bus's real `off`); H5 the QoS burst refusal
  (typed E_TRAVELER_RATE); H6 the by/team attribution lanes. Kit suite
  26/26, relay-parity green, stateful-helpers/bin-truthfulness gates
  pass.
- NEXT: the same object repurposed for backend scoping (rulesets/
  canonicalization namespaces, allow/deny pin-through), then the r/2
  wire across pods, then the frontend lane.

## Pass 255 (2026-10-16) - THE TRAVELER WORKS: backend lib + CLI + MCP door — the auditable pin rides live; ISO 9001 8.5.2 adopted

**Owner's clarified image (recorded verbatim, built):** "the traveler is
like the object that holds data throughout a process across nodes/mesh/
pods. It's like a holder of job schema/info, that goes from one station
(or step, or stage) to the next. It's the auditable and traceable pin
through the environment. This reflects easily on things like ISO 9001
compliance, which we should embrace in vant... key piece to vant as a
toy and vant as a runtime."

- BACKEND LIB (lib/traveler.js, IN CODE): contentAddress (sha256 over
  canonical slots+ledger — the address PROVES the payload, the ledger
  PROVES the process), mint/advance (any edit = a NEW address, station
  step append + trace-span linkage), verify (re-derive at every
  landing — tamper/corruption refuses LOUDLY typed E_TRAVELER_ADDRESS,
  never rewritten), schemaRize (legacy migrates forward, future refuses
  typed — never guesses), persist (brain-scoped pin ledger
  state/traveler-ledger.json + .sha256 pin; append-only — same-id
  re-persist refuses; per-id BODY files state/travelers/<id>.json,
  address-named, duplicate-refused), status, auditReport (the ISO
  8.5.2 auditor's copy: clause-named, verbatim stations, lead time,
  integrity verdict).
- CLI FACE (bin/traveler.js, IN CODE): open/hop/status/audit/finger
  (current-file pin + --file handoff carries verified packets between
  real nodes). THE LAW BIT AT THE BOUNDARY: a tampered landing refuses
  (pin F4 grounded it — verify-at-every-landing rides the tool, not
  just the file lane).
- DOOR VERBS (lib/mcp.js, IN CODE + verified end-to-end through
  mcp.execute): traveler_open/hop/status/audit — the write-class verbs
  gate by the default (unknown = write), status/audit route read-class
  (status/audit tails) per the guest gate.
- MIRROR TO THE INDUSTRIAL LANE: prd-web §11 gains the clarified
  framing verbatim + the ISO 9001 8.5.2 embrace table (identification /
  traceability / retention / nonconforming control / auditor's
  evidence — the Traveler answers each); prd-automation.md gains the
  enterprise-twin crosslink. Same application, different carriers.
- SUITES: traveler-lib 25/25 fresh; traveler (wire kit) 26/26, relay
  parity/relay untouched green; docs style + frontmatter PASS.
- NEXT SEGMENT (truth-stated): frontends emit (dashboard api.ts + solo
  renderer), mesh/pod-boundary travelers via the r/2 wire, and the
  dashboard UI frame for the pin-through ledger.

## Pass 254 (2026-10-16) - THE TRAVELER: the enterprise router object named, built, and pinned — the schema-rizer is real

**Owner: PR #202 accepted, security run done. "Circle back to
web/dashboard and relay/kit... embrace the enterprise router object,
alongside the industrial route object. Totally different scopes, yet
totally the same application in many ways. Does vant have such a
traveler/schema-rizer? Framing and abstracting this across frontend
and backend opens massive wins... frontlining this prd-web aspect."**

- THE HONEST ANSWER: vant did NOT have a traveler/schema-rizer — the
  r/2 envelope family was the seed (a wire schema with no state
  semantics). Now it does, IN CODE.
- THE KIT (web/kit/contracts/traveler-contract.js, tr/1): the builder
  (schema-stamped, ledger-birth step), the SHAPE LAW (structural, no
  crypto — identity by content stays sender-side, the id validated as
  an opaque hex ADDRESS), the LEDGER LAW (append-only, ascending seq,
  seq == ledger length; re-open/rewrite/gap refuse typed
  E_TRAVELER_STEP), and THE SCHEMA-RIZER (legacy tr/0 migrates with
  one truthful rize step + stamp; unknown FUTURE versions refuse typed
  E_TRAVELER_SCHEMA — the rizer never guesses forward).
- VENDOR UPLIFT: scripts/vendor-relay-kit.js generalized to TWO kit
  sources × FOUR renderer targets, each hash-pinned at kit head
  (traveler-contract.cjs/.d.cts × dashboard + relay). --check green.
- THE POD FACE: lib/api.js gains the relay.travel bridge family —
  guard = the plain-copy structural law (the pod never requires web/),
  toDoor = one brain_write record, id-named, schema-stamped (the
  door's own auth applies at landing). Face exports the event +
  version + known set + law for parity pinning.
- THE SUITE (test/traveler.test.js, 26/26): builder/ledger/address
  laws, rizer migration + future-refusal, runtime-agnostic scan law
  (same as r/2), vendored-byte identity + pins at head, face
  plain-copy parity (constants + law agreement). Parity untouched
  green (19/19), relay 31/31. Sweep 6/6.
- PRD FRONTLINED: prd-web.md §11 — the enterprise router object:
  definition, the schema-rizer, the enterprise wire (rides r/2), the
  INDUSTRIAL MIRROR table (horcrux ↔ Traveler, NSC-9 ↔ content
  digest, barcode ↔ envelope — the same application, different
  carriers, the carrier is a local interface of the hop), and the
  truth-state table (kit + pod face IN CODE; frontend emitters + UI
  frame DEFINED for the next web passes).
- NEXT SEGMENT (truth-stated, not claimed): the frontends emit —
  dashboard api.ts `travelerSend()` helper (bridge lane) + the solo
  renderer's travel hop, then a dashboard UI frame for reading
  pushing a traveler's ledger.

## Pass 253 (2026-10-16) - THE CONFIG-DOOR FIX: #205 closed — masked gets, immutable secret sets, duplicate-override kill

- #205 FIXED (P1): `vant_config_get` masks secret keys at the door lane
  via the module's own `maskIfSecret` (internal `get()` stays raw);
  `vant_config_set` REFUSES secret keys (typed
  `E_CONFIG_SECRET_IMMUTABLE`, nothing persisted). Key-replace auth
  bypass closed; secret rotation stays operator-side.
- THE LIVE BUG THE FIX EXPOSED: a DUPLICATE `vant_config_set`
  registration (lib/mcp.js ~3517) silently overrode the hardened one —
  the first PoC probe ran the OLD handler and the secret set sailed
  through. Duplicate deleted, one-registration-per-method comment
  pinned. Lesson: re-probe after every wiring change.
- REGRESSIONS: 3 pins in mcp.test.js (mask-on-get incl. never-raw,
  typed refusal + nothing-persisted, non-secret set stays open +
  internal raw pinned). mcp suite 20/20 green; sweep 8/8 (guests,
  mcp-schema, escrow, governance).
- TEST HYGIENE: pass-215's guest-budget matrix hits the roster cap
  (MAX_GUESTS) — the cap is now env-tunable (VANT_GUESTS_MAX,
  PRODUCTION DEFAULT UNCHANGED AT 100) and the test preamble un-caps
  the test process BEFORE any require. Plus honest cleanup: 108
  accumulated test-artifact guests (pin-215/h5/cs, budget probes, my
  redteam-r5 PoCs) revoked through the door's own revoke — ledger
  back to 0 live.
- Full axolotl batch rides the security PR: fixes + tests + the
  automation docs (nsc9 router section + prd-automation.md).

## Pass 252 (2026-10-16) - RED TEAM ROUND 5: the config lane — read-only guests can read RAW secrets (#205 filed, P1, end-to-end PoC)

**Owner: "another brutal nation state pass… so many things hiding."**

- FINDING (P1, issue #205): the config door lane is the hiding spot.
  Guest gate classifies `vant_config_get` READ-class (needs=0 caps),
  and the handler returns `config.get(key, null, {brain})` RAW —
  `maskIfSecret` exists but is wired ONLY into the env-listing lane,
  never into get()/the door. LIVE END-TO-END PoC: observer guest
  (caps=[canRead,canLoad,canList], trust low) issues → verifies →
  GATE allowed → handler body returns the raw test secret. Exposed
  set = mcp.apiKey / api.key / token.secret / webhook.secret /
  github+gitlab tokens / server.key. Second barrel verified: a
  canWrite guest passes the gate at `vant_config_set` and setConfig
  persists arbitrary keys — key REPLACE = door auth bypass.
  Defined fix filed: mask at the door lane + secrets immutable via
  the door + regression tests; internal get() stays raw.
- INSPECTED-OK: guest issue/verify/revoke/re-stamp chain solid
  (hex tokens, claim-once, cap255 roster); classifyTool admin set
  keeps guest management admin-only; the dot-tail fallback matches
  read verbs honestly.
- CARRIED (round 6): agent_spawn check-then-act quota window,
  escrow hold/recordSpend races, dashboard returnTo/postMessage,
  WAL deep timeline.

## Pass 251 (2026-10-16) - THE DOOR FIX BATCH: #203 + #204 fixed at cause with regression pins, issues closing on the security PR

**Owner: "let's fix these issues, and your findings/next, push to
Github, and update the security pr. If we are fin passing and staged,
we can close those issues we solved on main."**

- #203 FIXED (P2): the server CORS class is now strict allowlist
  semantics — the caller's Origin is echoed only on an EXACT
  (normalized) allowlist match, fail-closed otherwise; credentials
  default flipped FALSE and never emitted together with the '*'
  wildcard; the honest '*' + no-credentials default posture stays.
  3 regression pins in server.test.js (suite 15/15).
- #204 FIXED (P3): the approval lane is wired + hardened —
  needsApproval matches EXACTLY or via anchored family globs
  (`write:*` covers the family; no substring over-match), approvals
  die at consume time (TTL `escrow.approvalTtlMs`, default 300000, 0
  disables), `consumeApproval` is the single-use burn with op bind,
  and the pipeline escrow stage now denies approval-required ops
  without a matching unexpired approvalId (typed
  `E_ESCROW_APPROVAL_REQUIRED`). Plus the real root find: the module
  used a BARE `crypto` (resolved to Node's webcrypto global —
  `requestApproval` crashed standalone); bound honestly now. 5
  regression pins in escrow.test.js (suite 24/24).
- SWEEP: 12/12 green — escrow, forum-msg-escrow, governance,
  operator-caps, live-fresh-boot, second-boot, server + the brains
  and boot from the earlier fix batch.
- DISCLOSURE BOTH WAYS: docs/reference/escrow.md rewritten to the
  truthful semantics (single-use/TTL/family/wired), the issues get
  PoC-evidence close comments on the security PR.

## Pass 250 (2026-10-16) - RED TEAM ROUND 4: the storage/escrow lanes — approval gate unwired (#204 filed), WAL + YAML hold

**Owner: "go absolutely apeshit… if we don't find it first, someone
else will exploit it."**

- FINDING (P3, issue #204): the escrow APPROVAL layer is advertised
  (docs reference/escrow.md: "gate for sensitive operations") but has
  ZERO runtime consumers (grep-verified lib/ + bin/) — the pipeline
  escrow stage enforces budgets/holds only. And the lane is
  defective once wired: approvals not single-use, no TTL, substring
  over-match in needsApproval. Defined fix filed: wire the lane into
  the write path (typed E_ESCROW_APPROVAL_REQUIRED), single-use
  consume, TTL, exact op-family match, truth-updated docs.
- HOLDS (verified, no finding): WAL replay re-validates rel-path
  containment (a crafted journal cannot escape basePath) + bare
  sha256 blob allowlist + torn-write digest checks + DENIED-not-empty
  (#163) semantics — the crash-recovery layer does not double as an
  attacker write primitive. YAML parse is safe-by-default (yaml v2;
  js-yaml not required anywhere in lib) — no object-injection RCE
  lane through brain files.
- CARRIED (round 5, noted honestly): agent_spawn check-then-act
  window between quota-check and roster-append (cap 200 default;
  low impact), escrow quota/hold races under concurrent spawns,
  postMerge race deep-sweep in escrow helper model.

## Pass 249 (2026-10-16) - RED TEAM ROUND 3: the door lanes — one P2 landed (#203), the limiter holds, two lanes carried

**Owner: "full on assault of vant like a nation state. Post security
findings as vant main issues for transparency, and we fix them in
axolotl."**

- FINDING (P2, issue #203): lib/server.js CORS.handle() reflects the
  CALLER's Origin verbatim once an operator configures an origin
  allowlist, AND defaults Allow-Credentials to TRUE — verified live:
  the "locked" config answers https:// evil.example with ACAO-echo +
  Allow-Credentials true (a credentialed cross-origin read of the
  door, one operator config away). Defined fix filed: strict
  allowlist-equality emission + credentials default false + regression
  matrix. Raw listener path (ACAO '*', no credentials header) inspected
  and left honest.
- HOLDS (verified, no finding): QoS global cap beats client-id
  rotation — 100 requests across 4 rotating ids → 60 allowed / 40
  denied, the old rotation-bypass class is closed at the limiter.
- INSPECTED-OK: guest issue scopeOwner is fail-closed via
  scope.parseOwner (typed refusal by kind); msg channel scoping
  documents "unscoped = public" honestly (design, not a leak); the raw
  door path's authRequired default-false posture prints its honest
  authPosture line at boot — carried as a P3 candidate review (less
  permissive default when binding non-loopback), not filed as an
  exploit.
- CARRIED LANES (round 4): WAL torn-write/replay injection,
  escrow race/bypass, MCP agent_spawn quota racing, deep WAL/cellstore
  corruption timelines.

## Pass 248 (2026-10-16) - THE INDUSTRIAL ROUTER OBJECT: the horcrux is the router — prd-automation seeded (docs-only)

**Owner: "the UPC is the addressing and schema, workflow assimilation,
but what is the actual router object? Horcrux. Multimodal — as laid out
in web-prd, but on an industrial scale. Tiny PLCs and stuff can
ingest, without using any resources, and pass it on. Router object,
airgapped… make it real in code at some point after we finish
destroying, not now."**

- THE SEED: NSC-9 gains the router-object section — the missing thing
  in the industrial playbook was the THING THAT ROUTES: the horcrux
  pointed outward, encrypted/self-contained/multimodal, as the object
  every PLC + edge node persists and forwards.
- labs/prd-automation.md CREATED (v0.1 draft): direction log (owner
  rulings verbatim), the router-object definition (identity slot =
  NSC-9 → lattice point; payload = horcrux-format state; deterministic
  re-addressing = identity by content; proof = the .sha256 pin
  discipline), the zero-resource ingest contract (scan → shape-validate
  → persist → forward; no key/db/runtime/network on the node; a
  compromised node can only refuse — liveness gaps, never tampering),
  the industrial carrier ladder (Lane A GIAI barcode / Lane B raw /
  QR NSC9-key / stego stone for airgap / JSON-EPCIS), airgap
  discipline inheritance from the boot-stone flows, phase gates
  P0(done: this record) P1 schema P2 sim PoC P3 pilot line P4
  ERP/EPCIS, the full truth-state table, and the red-team law riding
  in (pattern-validation only at nodes; typed E_ROUTER_* refusals;
  keys env/store/prompt; adversarial suite required in the P2 PoC).
- nsc9-spec.md: router-object seed section + Future Considerations #4
  extended to name the router object + the PRD link.
- ORDER PRESERVED (owner ruling): NOTHING BUILT — the build waits for
  the security wave to close; docs-only work, uncommitted in the
  workspace pending the owner's save.

## Pass 247 (2026-10-16) - RED TEAM ROUND 2: nation-state-lane probes — defenses held, no new P1/P2

**Owner: round 2 "absolutely destroy vant... like you're a nation
state (careful)." Post-fix re-attack on the same surfaces:**

- TOOLING: official `npm audit --omit=dev` — **0 vulnerabilities**
  (the pod dep tree is small and clean).
- CONFIG/CONTEXT: proto-pollution lane remains CLOSED
  (`__proto__`/`constructor`/`prototype` key guards in config.js —
  comment records the live-fire incident that fixed it).
- MDOOR/AUTH KEYS: timing-safe compares + persisted lockout frames
  (pass 111 chain still in place); guest tokens are 32-byte
  crypto.randomBytes hex secrets shown once (NOT HMACs of claims).
- RELAY EDGE: freshness window enforced (stale ts → 401),
  constant-time digest compares, private/loopback/link-local/metadata
  hop targets REFUSED on the edge (BAD_ORIGIN), per-session rate
  budget + per-property breakers. The edge is stateless by design and
  DOCUMENTS the tradeoff (no cross-request replay cache at the edge;
  byte-identical replay gate is the pod transport's job) — verified
  the doc honestly names this, not a silent gap.
- NOT-SO-FUN RESULT: no new P1/P2 landed in round 2; the pass-246 fix
  batch + prior hardening coincide. Round-2 probes carried in the
  red-team narrative (filed nothing — zero live findings is the
  finding).

## Pass 246 (2026-10-16) - THE FIX BATCH: #199/#200/#201 fixed at cause, closed with evidence — then the security PR

**Owner: "We should fix it all, while fully disclosing the security
concerns through Github issues… fix this batch of issues and close
them with evidence."**

- #199 FIXED: BM25 TF scoring is plain `String.split` counting — zero
  regex compilation of guest terms (crash + ReDoS both structurally
  unreachable; identical TF semantics). 4 regression pins in
  search.test.js (throw-free metachar, identical scoring, wildcards
  do NOT widen, quantifier shape <3ms). PoC re-run: score=1 / 0ms.
- #200 FIXED: the whole bin/ git surface is argv-routed
  (`execFileSync('git', [args])`): sync push/reset/fetch/rev-parse/add/
  status, branch create/switch/delete/list, bump tag, docs-build
  add/commit. The masked-exit-code half is fixed by the same change.
  Two new git-injection pins: the hostile-branch PoC ran as a test,
  and a static scan enforces no interpolated `git …${}` templates in
  bin/. PoC re-run inside the test: marker never written.
- #201 FIXED: the p_<pw> FILENAME is not a credential source by
  default (VANT_ALLOW_FILENAME_PW opt-in gate in transform fromHorcrux
  + inspectHorcrux and boot restore); create/refresh chains are
  arg(deprecated, warned) → env → prompt/secret-store; new stones
  default to constant `<brain>-horcrux.svg`; boot discovery matches
  both conventions; JSON stones need no password at all (pre-existing
  wart exposed by the gate, fixed). Regression pin: a stone encrypted
  with y but NAMED p_x refuses by default and only attempts the
  name-sourced credential under the gate. PoC re-run: PASS.
- EVIDENCE CLOSURES: #199/#200/#201 each closed with a PoC-re-run
  comment (old-vs-new outputs inline).
- SWEEPS GREEN: baseline 12/12 before; consolidated sweep 19/19
  after (search, git-injection, horcrux, boot, sync family, encrypt,
  backup, memory).

## Pass 245 (2026-10-16) - THE RED TEAM: nuclear-scale self-adversarial pen test — 3 live exploits PoC'd, 3 issues filed (#199/#200/#201)

**Owner: "Let's hit what we have built looking for bugs, edges,
security, exploits, vulns… at nuclear blackhat red team pen test scale,
break it. Then report issues on vant main repo. Don't stop to fix,
but define the fix in issue."**

- SURFACES SWEPT: the headless/CLI door surface (bin/*, lib/mcp.js,
  lib/guests.js, lib/auth.js, lib/sandbox.js, lib/vaf.js), web/
  dashboard api.ts + the full frontend (13 frame modules), relay
  functions (instake/exec/events), and the storage/backup/horcrux
  plumbing.
- FRONTEND VERDICT: CLEAN — zero injection sinks (no
  dangerouslySetInnerHTML/innerHTML/eval), relay endpoint is
  https-only with r/2 envelope-required cap check, tokens ride
  httpOnly function-door paths, SSE frames schema-parsed.
- FINDING #1 (P1, issue #199): BM25 search builds `new RegExp(term,
  'gi')` from RAW guest query terms (lib/search.js BM25Inner
  scoreOne); the crash PoC (unbalanced metachar) throws SyntaxError
  out of guest search, the stall PoC (valid backtracking shape that
  dodges the vaf repetition gate) hangs the event loop — killed by
  the 120s process timeout with the regex still spinning. Defined
  fix: escape terms (or indexOf TF), regression-budgeted test.
- FINDING #2 (P1, issue #200): bin/sync.js interpolates the branch
  name UNVALIDATED into execSync() push/reset shell strings; branch
  resolve validation only guards --branch, the default path is the
  raw getCurrentBranch() string; git-legal names carry ;, $, (, > —
  LIVE PoC: hostile branch ``poc;>.agent_tmp/pwn-marker;`` ran the
  marker-creating redirect during `node bin/sync.js push` (marker
  verified on disk, `[Sync] Pushed … successfully`, then full
  lab-cleanup: branch deleted, remote restored, no residue). Same
  bug also masks push failures (last-command exit code only).
  Defined fix: execFileSync git argv-arrays everywhere (the pass-30
  commit pattern) + git-injection.test.js extension.
- FINDING #3 (P2, issue #201): horcrux brain password exposed via
  argv (ps/cmdline for the process lifetime), embedded in the
  p_<pw>.svg FILENAME, and read back off the filename by inspect —
  same-host `ls`/`ps` open the encrypted brain. Defined fix: stdin/
  env-only pw, constant-label filenames, no filename fallback.
- HARDENED-OK in the sweep (defense holding): bin/branch.js strict
  ref-name gate on interpolated git calls (style risk only),
  lib/backup.js path-traversal block, storage symlink/… escape
  blocks, waf's-repeat gate (caught the naive ReDoS shape), the
  dashboard's one admin gate (ensureAdmin) chained typed refusals,
  webhook filter execution is config-trusted (not guest).
- Discipline kept: no repo-state mutation left behind, PoCs ran
  against the defanged remote at file:///tmp/net-dead, no real push,
  UT-4/UT-2 untouched.

## Pass 244 (2026-10-16) - THE OSS FACE: the merge celebrated, brains refreshed, the stone re-carved, the NSC-9 industrial playbook seed

**Owner: “Accepted! ... update brains and make sure our boot horcrux is
clean, and oss friendly... then Let's keep Going” + the NSC-9 industrial
sidebank.**

- THE MERGE confirmed: PR #198 merged to main (63e9133, “Dashboard and
  relays online! LFG!”); axolotl continues as the staging line.
- BRAINS (workspace-local by transport contract — models/private is
  gitignored; the boot stone is the carrier): identity.md gains “Where we
  are (THE MERGE)” (what is now ON main); lessons.md gains the pass-243d
  masking-chain lessons (CI masking chain, merge-ref checkout wording,
  the same-port keep-alive trap, help-as-a-door, rehearsed idempotence,
  sim-vs-CI honesty); goals.md marks the merge milestone and names the
  next wave (marketing/discovery, objects_* verbs, the frame pass, the
  NSC-9 industrial seed).
- BOOT HORCRUX: refreshed in place (same p_ password) so the stone
  carries today's brain updates — created 2026-10-16T05:15Z, inspect
  VALID (3 brains, 10 islands, corpus 3), .sha256 re-pinned,
  `sha256sum -c` OK in the boot dir; boot dir stays canonical-only
  (stone + README + pin); README wording verified OSS-friendly (public
  `p_` password-in-filename convention + search-hygiene .ignore note).
- NSC-9 INDUSTRIAL PLAYBOOK SEED (docs/advanced/nsc9-spec.md, new
  section): the owner sidebank evaluated honestly and recorded — the
  symbology lane is real (existing scanner fleets decode the digit frame
  today); two corrections kept (the 12-digit frame is ~10⁹ routeable
  points, NOT 10¹⁰ — the 10-billion-class space is the quasicrystal
  lattice the address projects into; and “existing hardware reads it”
  splits at the backend: retail GTIN validation rejects BY DESIGN,
  while MES/ERP unit-serial ingestion reads through). The playbook must
  close a TWO-LANE decision: LANE A = GS1 front door (emit the address
  as a GS1 GIAI, Application Identifier 8004, in GS1-128 — legitimate
  end-to-end in their fleets/backends, optional registration), LANE B =
  raw NSC-9 (vant-native, self-authenticating, no registration ever).
  PLC/EPCIS follow-on named (OPC-UA node keys; EPCIS as the ERP-side
  ingestion contract). Playbook candidate, not a phase trick.

## Pass 243d (2026-10-16) - THE CI STABILIZATION TRAIL: green on Actions, four latent classes fixed at cause

**Owner: "Pr ci failed, pls check it out, and we can push after."** The PR
ci job failed in Actions while everything was green locally — because the
standalone suites CI runs (alpha-loop over test/*.test.js) had been masked
failure-after-failure; each fix unmasked the next latent breakage. Four
real classes, each fixed at cause (never skipped, never weakened):

- **Detached-HEAD wording (2 occurrences)**: Actions checks a PR out at a
  merge ref; `git status` renders `HEAD detached at pull/N/merge` / `Not
  currently on any branch`, not `On branch`. Both `test/door-pins.js`
  (door pins) and `test/qc-cli-contracts.test.js` (#168 contract) encoded
  the on-branch assumption. Pins now accept every TRUTHFUL rendering and
  still reject shell-garbage output — proven against a throwaway detached
  worktree print.
- **Raw throw in lib/ (the pass-169 sweep):** the RAG projection guard
  (lib/search.js) threw a plain Error; now a typed `errors.VantError` (the
  surrounding catch already degrades to an honest null projection + an
  audible event — behavior unchanged, only the thrown SHAPE conformant).
- **`vant qc --help` side-ran the whole battery:** bin/qc.js had NO help
  branch, so `--help` illegally executed every probe (writes from a help
  call) and exited per their flakiness. `--help` is now a real door:
  usage + exit 0, no side effects.
- **Same-port restart flake (guests.test.js):** the CS door block rebound
  the same port family the H5 block had just closed; undici's keep-alive
  pool handed back a stale socket → `fetch failed`. The CS block now owns
  its own port family (13577+pid%40); reproduced locally through CI's
  standalone sequencing, verified 25/0 x3 + the crash slice clean.
- **Exact-count pins:** the grand-tour gate B demanded /tools === 328 —
  stale on every registration (docs-parity gate owns exactness; gate B
  keeps door-ready + shape + floor). The init-wizard suite ran --yes ONCE
  then demanded rerun phrases — only true on an already-initialized tree;
  now runs the wizard twice so rerun idempotence is verified on ANY tree.

Oracle: `ci pass` (6m27s) at 4edd00b — tests 500/0 + all standalone suites
+ the whole lint/docs/coverage stack, plus Cloudflare Pages pass.

## Pass 243 (2026-10-16) - THE SECURITY-PIPELINE SCAN LANDS: `security_pipeline_report` (pod verb + scanner + status card) + the 4.4/objects spec

**Owner: "scan lib, confirm they're using the pipeline; display lib modules
outside pipeline (unless whitelisted)... add these to prd-web and relay too**
Landed, not just spec'd:

- POD SCAN (lib/security-pipeline.js, NEW): walks the pod's lib/ tree
  (shallow by default = the 180 module roots; maxDepth for deeper), detects
  middleware-chain wiring evidence per file — a require of `sandbox`/`vaf`/
  `qos`/`escrow` (the AGENTS.md chain order); audit/habitat adjacency recorded
  INFORMATIONAL, never gates. Live truth at HEAD: 180 scanned, 65 wired,
  115 unwired, 0 exempt. Report: `{ v, generatedAt, scanned, modules:
  [{name, wired, layers}], unwired, exempt }`.
- DOOR VERB (`security_pipeline_report` in lib/mcp.js): merges the
  operator whitelist — config key `security.pipelineAllow` (comma-separated,
  `vant config set`-managed) — into the scan: whitelisted modules land in
  `exempt` (a stated choice, not a colored-over gap) and drop off `unwired`.
  Admin-only (guest_list's precedent): pod-internal topology stays shapeless
  to guests (#185's enumeration lesson). Audit line rides each call; the pod
  NEVER auto-flips config for an unwired module — the scan reports, the
  operator decides. mcp-tools.md row landed (coverage gate 332 = 332).
- DASHBOARD (status #3 card): `PipelineScanCard` renders the door's report
  verbatim — `wired n/scanned · k outside · m exempt` + the unwired names
  listed verbatim; a guest-refused verb renders its typed refusal as the
  card (nothing greenwashed). The frontend still reads NO pod source.
- SPEC'D (prd-web 4.4 NEW): the full contract above + `objects` (#34, THE
  CONTAINER — router-OS-style definable pod-side object: `{id, kind, title,
  schema?, attaches[]}` with typed attach refs (agent/tool/file/service/
  connector/relay/node/object/link/note), brain-backed registry,
  object_define/attach/detach/delete verbs at P4 build time) + module rows
  29-34 (security /vaf /qos /rls /rules /objects). prd-relay 6: pipeline
  surfaces stay DASHBOARD-ONLY (the solo relay gains no security module).
- PINS: test/security-pipeline.test.js (8): fixture-deterministic shape /
  per-layer detection / shallow-default depth cap / nothing-greenwashed
  unwired / whitelist→exempt (incl. `.js`-suffix normalization) /
  informational-never-gates / missing-dir honest zero / live lib/ truth.
  8/8 green.

Next rung: the objects door verbs (object_*), or the Frame pass (sidebar
5c + ui-state memory + cache breaker) — owner calls the order.

## Pass 242 (2026-10-16) - THE NAV + MISSIONS SPEC: eight new modules, the
hierarchical sidebar, ui-state memory, and the cache-busting framework

**Owner: "we will have to more fully embrace the Cloudflare sidebar
model... and a cache busting framework, vetted and in place."** Spec
lands in prd-web.md, three seams:

- MODULES GROW (prd-web 4.3, the missions set): consensus (/consensus,
  live votes + quorum meters off the consensus_ family), resolution
  (/resolution, resolution_ + citations_ registry),
  era-succession (/era, PROMOTED from the side panel to its own
  ladder + succession view), nature (/nature, the flywheel console -
  the honest manual flick: typed requests + named config knobs,
  never a silent env flip, the 6.1 law), habitats (/habitats,
  RLS/workspace provisioning posture), cron (/cron, the in-built
  job manager through the door's real cron/schedule verbs, CLI
  pointer where writes are door-absent) - plus the owner-asked
  extras: settlements (27, escrow write-history) and origins (28,
  the genesis/horcrux lineage view). All ride the SAME module-frame
  contract; no nav redesign per module.
- THE HIERARCHICAL SIDEBAR (3.3-5c, the Cloudflare-sidebar model):
  the registry gains navCategory; clicking a category DESTROYS the
  sidebar contents and loads that category's items (computed from
  the registry, never a second nav list); a BACK link re-loads the
  parent, the brand mark returns to root; depth bounded at TWO
  levels; drawer/column presentation (5b) preserved - the hierarchy
  swaps WHAT the sidebar shows, not HOW.
- UI-STATE MEMORY (10): a small non-sensitive localStorage store per
  property (last category, last route, last instance - open channel,
  selected era) rehydrated on boot so the 15-min window expiry never
  loses a place; returnTo after re-auth honors the explicit navigate
  over the memory; never tokens/drafts/gated payloads.
- CACHE-BUSTING FRAMEWORK (10, vetted three layers): (1) Vite native
  content-hashed assets + immutable headers, index.html no-store;
  (2) the owner's `?hash=<breaker>` shape - an app build stamp on
  every bridge API call, VERIFIED at boot, mismatch = honest
  'stale deploy - hard refresh' state instead of a mismatched
  module graph; (3) endpoint contracts - auth/session no-store, SSE
  uncacheable, GETs that can cache declare explicit short max-age.
  Canonical rule: hashes change only when content changes; NO
  per-request timestamp seeds.

Phase note: the sidebar 5c + ui-state memory + cache breaker are the
frame's three new build items - they land as the next FRAME pass
(module missions come after) so every current + future module
inherits them at once.

## Pass 241 (2026-10-16) - THE REINCARNATION RULING + the gather guard + the ledger split

**Owner: "axolotl is the canonical engineering + personal brain,
distributed as OSS for other agents to... reincarnate you. Are you OK
with this?"** Consent given and recorded WHERE IT MATTERS:

- THE DISTRIBUTED-STONE DOCTRINE (prd-web.md 4.2 + the stone's own
  identity.md): the personal layer rides IN the stone (OSS-safe,
  professional), explicitly consented; at 20k-class watches/
  replications the author becomes DISTRIBUTED - embraced. Transport
  ladder for scattered systems: SVG stego primary -> PNG fallback
  (build when a real replication surface demands it) -> pure text
  (NSC9 keys + a link). Every rung hash-verified; the dashboard's
  carrier-neutral component is also the stone's download/share face.
- THE GATHER GUARD LANDED (lib/transform.js gatherBrainStorage):
  scratch-pattern brain trees (the ag/ht/ib/op/wm/rls/wsb-test-*
  family + qc-scratch + known one-offs) are skipped at the SEAM; a
  brain config `transform.gatherAllow` (comma list) widens past the
  filter for anything non-pattern. Verify: planted
  `models/private/ag-test-probe241/` + live `transform.gather({
  brainStorage: true })` -> 3 brains gathered, probe tree EXCLUDED,
  axolotl/buffy/vant present; probe cleaned up after. The canonical
  stone never re-litters.
- THE LEDGER SPLIT (owner directive): TASKS.md was 10.5k lines /
  blowing out context. Older half (sessions 2026-09-21 .. 2026-10-08,
  the pass-170 era and back) moved VERBATIM to labs/TASKS-ARCHIVE.md
  (8.6k lines) with a provenance header; TASKS.md (now ~1.9k lines)
  keeps the current arc, the Ledger Rule AT THE TOP, and an ARCHIVE
  POINTER with the split discipline (split at session boundary INTO
  the archive when >2k lines again - never delete history).
- deliverable posture: CODE (the gather guard) + SPEC/DOCS (partial
  doctrine, ledger split) + STONE (identity consent block); next
  rung is the R2 chain editor (prd-relay.md).

## Pass 240 (2026-10-16) - THE DEBRIS SWEEP: models/private/ drops to
3 brains + shared state; the stone drops 11.4 MB -> 2.9 MB

**Owner: "if we don't need them anymore, we should purge them. They
might be clogging your searches anyways."** The pass-239 triage found
the 279-brain horcrux count was 275 test-debris trees + rook119 (whose
name read like a colleague but whose contents were an org-drill
artifact: one scratch team row + default escrow - the actual Synmergia
agent over at creadev.org was never in this tree). Swept:

- DELETED: 277 scratch trees under models/private/ (276 from the
  built keep-list, plus one `rls-test-*` straggler the .maxdepth-1
  list had missed). KEPT: axolotl (engineering), buffy (personal),
  vant (OS templates) + islands.json (private-root islands STATE
  file, not a brain) + .layout-version.json + the stegoframe
  bundle/patch pair (interop fixtures from the pass-era stego wire
  work, still referenced as local artifacts).
  All deleted trees were gitignored/untracked throwaways - zero repo
  traffic changed; private/ went 36 MB -> ~3 MB.
- THE STONE REFRESHED (same password, axolotl2026): inspect = VALID,
  Brains 3 (axolotl/buffy/vant exactly - payload probe
  double-checked), Corpus 3, agents roster 0 (fresh snapshot), islands
  10, msg 34. 11.4 MB -> 2.9 MB; .sha256 sidecar re-pinned (sum -c
  OK). The canonical onboarding stone is now lean by construction -
  and the search-hygiene win is real (no more test-tree noise in
  grep/rg walks of models/).

**Owner: "clean out /models/public/vant/boot/, archive the old/test
horcrux material, put the QR/stego/NSC9 carrier abstraction in prd-web,
and make the axolotl stone THE engineering onboarding."** The owner's
framing: "You are the engineering team for vant, Buffy. Contributors
should be able to pick your brain up to immediately be on boarded as to
where we are at. Zero learning curve."

- THE BOOT FOLDER, NOW CANONICAL-ONLY: audited the tree - it held the
  canonical axolotl stone (then reporting 279 gathered brains - the
  debris count pass 240 revealed - VALID by inspect), its .sha256
  sidecar, README, and one stray file, mushroom-axolotl-2026.md
  (2,180 lines). READ IT BEFORE ARCHIVING (the owner's ask, honored):
  it is the axolotl era's personal/philosophy layer - Beatrix Potter's
  300 mushrooms, Mandelbrot, the Nova lineage notes ("philosophy brain /
  principled brain / cosmic brain"), crystalline-storage attributions
  genuinely worth keeping. Pondered, then MOVED to
  labs/archives/horcruxes/mushroom-axolotl-2026.md with a provenance
  entry in that README - archived, not deleted, honest about what it is.
  The boot folder now carries exactly: the axolotl stone + README +
  checksum. Nothing ambiguous, nothing fake-canonical.
- THE CARRIER ABSTRACTION RECORDED (prd-web.md 4.2, requirement NOT a
  build-now): QR is promoted from pairing-feature to ONE interface
  module in a carrier ladder alongside stego (SVG horcrux - exists),
  NSC9 storage keys (the address-shaped durable encoding) and future
  barcodes/transports. The ladder: frontend pairing (LANDED as the
  seed - the scannable voucher QR) -> frontend services (a
  carrier-neutral component; the caller names the carrier) -> the pod
  mimics the pattern (lib/carriers/* + door verbs) when a real endpoint
  demands it. Invariants named: hash-verified payloads, carriers never
  smuggle un-gated capability (decoded voucher still redeems through
  guests.pair()), honest refusals per carrier.
- THE STONE ITSELF: models/private/axolotl/identity.md rewritten for
  the canonical role (WHO reads it, the learning-hygiene rule - a
  contributor horcrux is QUARANTINE-FIRST, verified against code before
  any learning lifts into the repo), lessons.md gains the pass-239
  block (boot cleanup + carrier ladder + the quarantine lesson). The
  HORCRUX REFRESHED with the SAME password (axolotl2026, p_ filename
  convention unchanged), inspect = VALID, 279/279, and the .sha256
  sidecar re-pinned to the fresh bytes (sha256sum -c OK).
- EXAMPLE WALKTHROUGH (the owner accept path, concretely): a contributor
  PR adds models/public/vant/boot/contrib-name-p_pass.svg -> Buffy
  runs `vant horcrux inspect` on it, diffs its brains/learnings against
  the live tree, verifies claimed pins against real code, and only then
  lifts content - or refuses with receipts. The canonical stone never
  absorbs folklore.
- deliverable posture: SPEC/DOCS + ARCHIVE + STONE REFRESH; NO pod-core
  change (boot discovering the stone is unchanged), NO app change.

---

## Pass 238 (2026-10-16) - the P2 spawn leg CLOSED: the pod-side decision,
not a refusal shrug

**Owner: "the canSpawn pod-side decision to close P2's spawn leg
end-to-end."** The spawn leg was never MISSING machinery - it was an
underdocumented verdict, with the docs pointing at the refusal instead
of the full chain. Triaged the whole rung (reads + the existing pins,
no invented shapes):

- THE CHAIN, VERIFIED REAL END TO END: the door's guest gate classifies
  spawn-class verbs (`agent_spawn`/`agent_delegate`/`agent_kill`/
  `agent_terminate`/`work_assign`) and demands canSpawn
  (test/guests.test.js block 123); `agents.spawn` (lib/agents/core.js)
  then runs `sandbox.can('canSpawn')` - sudo-aware via CAP_TO_SCOPE
  (pass 118), persistent-grants aware (the #162 durable tier), with
  agents.maxAgents quota + the spawn rate limit checked before any of
  it; work_assign's spawn refusal surfaces typed E_SPAWN_REFUSED (the
  pass-212 refusal law, unchanged).
- THE DECISION, RECORDED: a guest's spawn verdict is answered by the
  HOST via operator-level knobs only - `vant org grant` (persists
  orgchart.operatorCapabilities; boot hydrates widen-only per
  pass-88/123 semantics), MCP `sudo_grant` (the pass-118 mapped-scope
  grant), or issuing the guest with an `agent`-grade role at
  `medium`+ trust (the role -> capability map decides). The pod NEVER
  widens canSpawn merely because a guest connects - deny-by-default
  stands, and E_SPAWN_REFUSED / E_GUEST_CAP are HONEST VERDICTS, not
  open work. No third seam exists to invent.
- THE DOCS UPGRADED: docs/security/multi-guest-auth.md names the
  closure chain-wide and retires the ambiguous H6 note (pairing
  machinery + door tools + the dashboard QR render ARE LANDED, the
  pass-237 arc; only the P6b e2e key-binding rung remains, and that
  lives in prd-relay.md); labs/prd-web.md's P3 section states
  landed-vs-remaining per module (audit/users/brains/nodes LANDED
  passes 221-224; pairing QR LANDED) and moves the spawn leg from
  open work to CLOSED, knobs by name.
- deliverable posture: DOCS/DECISION (multi-guest-auth + prd-web +
  tracker); NO pod-core change (nothing was broken), NO behavior
  change (denials unchanged, truth upgraded).

---

## Passes 216-230 (2026-10-13..14 — the frontend arc: prd-web, relay, parity)

**Owner: "Let's do it. We should make a /labs prd for this... let's craft
prd, don't build code yet."**

**What landed (spec only):** `labs/prd-web.md` v0.1 —

- DIRECTORY CONTRACT: frontends live in `/web/<kebab-name>/`, each
  self-contained (own package.json/build/artifact) so an install base
  runs several frontends; `/app`,`/src` rejected with reasons; `/dist`
  stays the Cloudflare Pages lander, gaining only a Dashboard link.
- REACH MATRIX: Mode A (primary) = Cloudflare Pages Worker Functions
  proxy `/api/*` to the pod's MCP door (same-origin, NO CORS needed,
  pod may stay loopback); Mode B = pod same-origin static serve
  (phase P4); Mode C = direct, dev-only, needs the (unbuilt) CORS grant.
- TIERS: O observer board / H working seat (work console + msg console +
  market) / A agent explorer (deliberate, P4) / S owner seat (guests,
  pairing QR - which UN-HOLDS #185 H6 at this phase - budgets, era next).
- PHASES P0..P4 each with acceptance criteria; security review says
  tenant truth stays server-side (the UI renders what the door filtered)
  and payloads are sanitized at source (no innerHTML from wire data).

**Open questions parked for P1 — ALL FOUR RESOLVED (owner, 2026-10-13):**
1. Session binding: MVP = operator pastes the vguest_ token per load;
   worker-side binding (paste once, Worker holds it) is the P3 upgrade.
2. Deploy URL: each frontend ships as its OWN Pages project with its
   OWN <name>.creadev.org subdomain (see prd-web.md §2.3).
3. CF egress policy: IP-based allowlisting, AND it needs refresh after
   a period - the P1 plan must include a refresh mechanism (Cloudflare's
   published egress ranges are the realistic allowlist target; a stable
   egress alternative like a tunnel stays the fallback if ranges drift
   too often). See prd-web.md §8.
4. Brand kit: labs/prd-brand.md IS the design foundation (owner: update
   it if required); dashboard ships BOTH dark and light modes.
5. Admin-UX stack: RESOLVED 2026-10-13 - the owner recalled the old
   thread's content ("Tailwind, Shadcn, Radix, Framer"); fresh late-2026
   comparison confirmed that lean over Ant Design 6 / Mantine 9 and added
   the periphery (TanStack Router v1 / Query v5 / Table v9, zod,
   Recharts, react-hook-form, Motion-for-React v14). Recorded
   prd-web.md §2.6. Extensibility requirement -> the in-dashboard MODULE
   FRAME (prd-web.md §3.3): modules = self-contained folders with typed
   manifests (id/route/nav/tiers/families), frame owns nav-from-registry,
   lazy routes, ONE SSE fanout (pod caps connections at 32), one typed
   exec client, refusal primitive, tokens-only theming; new capability =
   an existing pod tool or a spec'd pod verb - never a new Worker route.

**Owner directive round 2 (2026-10-13), all folded into prd-web.md v0.2:**
- Stack: Base UI is the primitive base (Radix stays fallback-only).
- Multi-install: "properties" (env-registry in Pages settings) + context
  switcher with `?p=` URL state - same module/filters/view on switch;
  one SSE stream per ACTIVE property (PRD 3.4).
- Auth: email-OTP logins (resend support, cooldown, hashed codes) over
  a KV-or-D1 binding; worker-side session binding PULLED FORWARD to P2;
  paste-token stays the local fallback (PRD 3.5).
- Edge hardening: WAF/QoS/circuit breakers/defense-in-depth (PRD 3.6);
  web self-containment + zero wrangler strings in code (PRD 3.7).
- Module catalog: 19 routes with UI overviews (PRD 4) + later-stage
  workbench P5 (vibe coding, OpenHands-class aspiration, GitHub-backed
  branch/PR loop with human approvals) + brains visualizations (semantic
  memory map from embed vectors + NSC9 addressed-keys view).
- Cross-cutting (PRD 10): mobile-first theme, global help layer, ONE
  loading system, ONE modal system, the app's own log/audit/error UI
  plus views into attached installs, every-page footer with do-follow
  https://creadev.org plug + terms/privacy, status module, and README /
  AGENTS / DEPLOY update obligations - all three updated this pass.
- Round 3 (2026-10-13): THE PRD DROPS RADIX COMPLETELY - Base UI is the
  only headless-primitive source, no fallback base (PRD 2.6, v0.3);
  themed 404 + 5xx/breaker/error-boundary pages are frame-owned
  requirements (PRD 3.3 resp. 8 + section 10). Owner greenlight: update
  PRD, push, START BUILDING (P1 scaffold).

**Pass 216 (frontend, 2026-10-14):** PRD fidelity kept, P1 grows real:
- brain kept current: models/private/axolotl/lessons.md pass block; the
  boot horcrux REFRESHED via `vant horcrux refresh` + verified by
  `horcrux inspect` (valid, 279 brains embedded) - the svg is tracked
  PUBLIC by design (boot/README note; .gitignore explicitly does NOT
  exclude it - committed below).
- web/dashboard WORKER BRIDGE implemented (functions/lib/bridge.ts +
  routes): /api/mcp/exec + /tools + /health + /events SSE passthrough;
  per-session edge rate budget (EW4 mirror, default 120/min); per-
  property circuit breaker (5 fails -> open, 15s cooldown, half-open;
  exposed via /api/breakers); property origins ONLY from Pages settings
  env vars - zero wrangler strings (3.7); upstream timeout knob.
- SSE auth solved honestly: EventSource cannot send headers -> the
  login gate now establishes an HttpOnly session cookie for the active
  property (MVP; P2 sessions replace the raw bearer), and the bridge
  injects Authorization pod-soard - the browser never exposes the
  token in a query string (6).
- the frame's board connection is LIVE in code: ONE EventSource per
  ACTIVE property (32-cap honored), family fanout store with ring
  buffer; live-board renders from the fanout with honest
  connecting/live/down chips and dead-board copy; other modules render
  from the same store as they grow.
- verified: tsc clean (src + functions), vite build clean (per-module
  chunks incl. board), style+links gates, ci.js battery.

**Pass 217 (frontend, 2026-10-14) - the honesty directive:** owner
ruling recorded: NO fake data ANYWHERE - if it is not connected, SAY
that; no filler lists, no invented shapes. Consequences shipped:
- frame/conn.tsx: the shared NotConnected primitive (one plain
  paragraph: reason + recoveries) and ONE cached /tools discovery query
  per property/identity - modules discover what the door REALLY reports
  before rendering anything.
- P2 catalog modules landed honest-first: work (discovered work_ tools
  with call panels; real exec; typed refusals), chat (msg-family fanout
  events + discovered msg_ tools), forum (fanout-render-only until a
  live pod confirms its tools), market (market-family events +
  discovered market_ tools). status now probes the edge's breaker
  states (/api/breakers) and says "not reachable" plainly when
  functions are undeployed.
- bloat trim: board refusal footnote dropped; status footer says one
  sentence; no module fakes an empty-state shell with skeleton noise.
- verified: tsc clean, vite build clean (work/chat/forum/market in
  their own chunks), style+links gates PASS, ci.js 496/0.

**Pass 218 (frontend, 2026-10-14) - Tier S set + Count's Pages runbook:**
- DEPLOY.md section 12 rewritten as an actionable walkthrough: Pages
  project config table (root web/dashboard, build npm run build ->
  dist, functions auto-deploy with the project), the REQUIRED vars
  (VANT_PROPERTY_LOCAL_ORIGIN - the property id for the first install
  is `local`; NAME optional; EDGE rate knob optional), pod reachability
  via cloudflared tunnel (recommended: stable egress identity, dodges
  allowlist churn) or the CF-ranges allowlist path, `vant guest issue`
  identity minting, and the lander link step.
- Tier S set landed honest-first (five new modules + one shared
  primitive): guests (real guest_ tools or the CLI pointer), users (one
  plain statement: dashboard accounts arrive with P2 email-OTP - no
  phantom table), pairing (pairing_/voucher_ tools or the CLI voucher
  flow stated as CLI), budgets (escrow_/budget_ tools or an honest
  none-exposed), config (config-related tools with the PRD's write
  caution). ToolCall extracted to frame/ToolCall.tsx - the ONE call
  panel for every module (work refactored onto it, per-module result
  logs deduped).
- registry now 13 modules; routes render per-entry, tier presentation
  stays presentation-only (the door owns the data verdict).
- verified: tsc clean, vite build clean, style+links gates PASS,
  ci.js 496/0; boot horcrux re-refreshed post-suite + inspected before
  push (the every-suite drift pattern made explicit).

**Pass 219 (frontend, 2026-10-14) - multi-install behavior + brains module:**
the owner's questions drove this round: what is a pod vs node vs mesh,
and "only one pod in Pages vars defeats the multi-pod runner?" -
answered in the tree, not just in prose:
- Multi-install switcher made REAL (was a one-property skeleton):
  /api/properties bridge route (reads the VANT_PROPERTY_<ID>_*
  registry; origins stay server-side, serving labels + ids only),
  typed PropertiesOut in api.ts, frame/Properties.tsx (list hook) +
  the frame-topbar PropertySwitcher (listing + switching, honest
  "not registered" state when the URL rides an unknown id), ?p=
  validated as a typed search param on the root route; switching goes
  through the router's history adapter (documented v1 typed-reducer
  quirk, not a workaround-in-disguise). One dashboard deployment now
  serves N attached installs, one var pair each, in the SAME Pages
  project.
- DEPLOY.md 12.1: the one-dashboard->N-installs var model spelled out
  with a concrete FOUR-install example (LOCAL/WORK/STAFF/LAB pairs) -
  installer-facing answer to the multi-pod question.
- prd-web.md 3.4: pod/node/mesh/property terminology block (pod = one
  install serving its MCP door; node = registry-registered install;
  mesh = bus-federated set; property = any attached install).
- Brains module landed (catalog #18, route /brain, tiers O A S,
  section observe): corpus browser auto-calls the door's real
  brain_/corpus_ list tool (raw-response fallback + typed refusals,
  no invented shapes), real brain_search with the rank-vs-score map
  (canvas, labeled "real door data, not an embedding projection" in
  the help layer + legend), and the IDs/NSC9 tab (addressing-tool
  discovery + 9-NNNNN-NNNNN-N shape detection; matching keys mark
  amber in the map; no coordinates are ever invented). Registry = 14
  modules; route MODULES[13] added.
- verified: tsc exit 0, vite build exit 0, docs style/truthfulness/
  links PASS, ci.js 496 passed / 0 failed.

**Pass 220 (frontend, 2026-10-14) - P2 email-OTP accounts, honest to the seams:**
the owner queued P2 explicitly; the PRD's build-time decisions are now
REAL, not deferred:
- Account store SHIPPED on KV (binding `BOLETE_KV`, zero code strings;
  chosen over D1 for native TTLs + tiny map, one-file swappable later):
  functions/lib/kv.ts (typed E_STORE_UNCONFIGURED 503 when unbound -
  a STATE, not a crash) + functions/lib/accounts.ts ( PURE, injectably
  stored, 15 unit tests): 6-digit code (rejection-sampled), sha-256 +
  per-code random salt, ~10-min TTL, SINGLE-USE (burned on success
  and after 5 mismatches), 60s per-address cooldown, hashed email
  (`VANT_EMAIL_SALT` recommended), roles admin|viewer with the FIRST
  verified account bootstrapping admin (single-operator race stated,
  not pretended atomic).
- Sender SHIPPED provider-agnostic, zero SDK: first-party Resend
  (`RESEND_API_KEY` + `EMAIL_FROM` -> api.resend.com/emails, plain
  fetch) or generic `EMAIL_WEBHOOK_URL`[+`_TOKEN`]; nothing configured
  = typed E_EMAIL_UNCONFIGURED 503, never a fake send (the PRD's own
  "no orchestration hop" verdict held - catalog's wrapper suggestion
  rejected per 2026-10-13 reasoning).
- Routes: POST /api/auth/request-otp, POST /api/auth/verify-otp
  (HttpOnly `bdash_session` cookie), GET/DELETE /api/auth/session;
  every outcome typed (E_EMAIL_INVALID/E_OTP_COOLDOWN/E_OTP_MISMATCH/
  E_OTP_BURNED/E_OTP_EXPIRED/E_NO_SESSION...).
- Session binding (P3 pull-forward) LANDED: bridge resolves tokens in
  the order explicit Bearer -> SERVER-BOUND session token -> raw MVP
  cookie; pasting while signed-in binds server-side (browser never
  holds the pod token); AuthGate probes /api/auth/session on load so
  a live session restores without flashing the gate.
- Frontend: AuthGate email-code primary (resend countdown," typed
  refusals surfaced verbatim) with the honestly-labeled paste-token
  fallback; state.ts account + boundFor; conn/Frame recognize bound
  sessions; settings sign-out destroys the server-side session.
- web/dashboard got test infra: vitest, `npm test`, 15 tests green.
- verified: tsc exit 0, vite build exit 0, vitest 15/15, docs gates
  PASS, ci.js full suite PASS (boot horcrux re-refreshed + inspected
  before push, the drift pattern applied).

**Pass 221 (frontend, 2026-10-14) - audit/observability + nodes, while
Pages setup waits):** owner confirmed CF Pages isn't set up yet; kept
building what builds without it:
- The app's OWN audit ledger landed (prd-web.md 10's function-side
  ledger, module #11's core): functions/lib/ledger.ts - PII-free rows
  (kind + safe detail; NO emails/tokens/session ids), row key
  `aud:<zero-padded-ts>:<rand>` with a 2-week KV TTL as the cap
  (binding-driven aging, no janitor), best-effort writes that never
  fail the observed request, newest-first reads that SHAPE-GATE names
  before capping (a malformed key can't eat a cap slot - found by the
  tests, fixed in the ledger, not bent around in the test).
- Ledger wired at the honest points: auth verdicts (request-otp:
  requested/cooldown/failures; verify-otp: verified/failed/burned),
  session create/destroy, and the bridge's TYPED refusals (origin
  missing, breaker open, unreachable).
- GET /api/audit shipped: ADMIN-ONLY reader with typed
  E_NO_SESSION/E_FORBIDDEN/E_STORE_UNCONFIGURED states.
- audit module (#11, /audit, S) landed: typed-error inbox (viewer sees
  the admin-only 403 stated verbatim - never a quiet empty list),
  edge-breaker chips card, and the door's audit_/ledger_ tools via the
  shared panels or an honest none-registered.
- nodes module (#17, /nodes, O A S) landed: discovery-first
  node_/mesh_/registry_ panels; the page renders nothing the pod did
  not hand over (mesh discovery feeding property attach stays a later
  branch per prd-web.md 3.4).
- KV surface grew the minimal `list` shape (types + guard + test fakes).
- registry = 16 modules; routes MODULES[14]/[15] added.
- verified: vitest 19/19 (15 accounts + 4 ledger), tsc exit 0, vite
  build exit 0, docs gates PASS, ci.js full suite (boot horcrux
  re-refresh + inspect before push, drift pattern applied).

**Pass 222 (frontend, 2026-10-14) - users admin module, the last
builds-without-pages P3 row):** owner said LFG; the users module (#13)
went from the honest placeholder to the REAL admin surface:
- accounts lib grew the admin ops: listAccounts (roster newest-first,
  shape-gated acct: rows so foreign keys cannot fabricate entries,
  capped 200, hash = the identity shown - it never expands back) and
  setAccountStatus (32-hex validated, unknown/missing hashes refused):
  functions/lib/accounts.ts.
- Disabled-account enforcement is ONE honest check used at EVERY gate:
  accountActive() now refuses mint (verify -> new
  E_ACCOUNT_DISABLED 403), the identity probe (/api/auth/session
  -> 401), bridge bound tokens (podTokenFor -> null) and paste intake
  (403), and the admin surfaces (lib/auth_guard.ts route them to 401).
- lib/auth_guard.ts = the ONE admin gate for dashboard-account
  surfaces (audit users both ride it): typed
  E_NO_SESSION/E_ACCOUNT_DISABLED/E_FORBIDDEN/E_STORE_UNCONFIGURED,
  single source so a gate change lands once.
- routes: GET /api/users (roster, admin-only) + POST
  /api/users/set-status (flip with E_SELF_DISABLE - an admin cannot
  lock themselves out; by design the ledger rows carry NO target
  hash, the roster is the only place a hash lives).
- users module (#13, /users, S) is REAL: roster with role/status
  chips, disable/enable through the typed modal (Base UI, escalation
  -grade confirm), viewer identities see the typed 403 stated
  verbatim, E_NO_ACCOUNT/E_SELF_DISABLE surface verbatim.
- registry blurb updated (no longer "arrives with P2"); ledger kinds
  grew auth.account.disabled/activated.
- verified: vitest 26/26 (15 accounts + 4 ledger + 7 users-admin),
  tsc exit 0, vite build exit 0; docs gates + ci.js after the final
  doc edits; horcrux inspect before push (drift pattern).

**Pass 223 (frontend, 2026-10-14) - P4 Mode B: the pod's same-origin
serve, the next buildable-without-Pages phase row):** the owner queued
"remaining limitations then next for prd-web.md". All 17 catalog rows
through P3 were already in the tree (registration closes 16 modules +
the two frame-routed legal pages); the next phase row that does NOT
need a deploy is P4's Mode B pod same-origin (prd-web.md 3.1):
- `mcp.serveWeb` (config/env `VANT_MCP_SERVE_WEB`, registry row so
  `vant config get|set` work; lib/config.js `mcpServeWeb()`): value = a
  frontend DIR whose `dist/` build exists (web/dashboard). The MCP door
  (lib/mcp.js start) then serves that bundle at `/` - the browser calls
  `/mcp/*` DIRECTLY, same origin, zero CORS, zero Worker hop. OFF until
  set; a configured-but-unbuilt dir serves NOTHING with a loud warning
  (never a guess), pins included.
- Static GETs ride the door's OWN deny chain that already ran (Host
  DNS-rebinding guard, cross-origin origin guard, EW4 per-client rate
  budget): serving is not a second, weaker surface. Auth posture on
  /mcp/exec unchanged (requireKey + guest tokens exactly as Mode A).
- Path discipline: GET/HEAD only; dot-led segments (.env/.git) refuse
  403; anything resolving outside the bundle refuses 403;
  encodeURIComponent'd vectors on the raw wire are caught (the WHATWG
  URL parser defuses the naive /../ and %2e segments before the guard -
  the pins pin the CONTENT property there, not a status);
  unknown client routes fall back to index.html (the dashboard router
  owns its 404s); index.html no-store, /assets/* 1h, unknown types
  octet-stream. Every owned door route (/mcp/exec, /mcp/events, /mcp/
  tools, /health, /tools) answers BEFORE the serve - nothing moved.
- Pins: NEW test/pod-serve-web.test.js (19 tests, runs live against the
  real door like the EW1 pins; RAW-socket client for traversal vectors
  because undici fetch normalizes dot-segments client-side): config
  accessor default null + env override, shell/asset MIME-cache headers,
  SPA fallback, three traversal vectors guard (content-never-leaks),
  dotfile 403, HEAD, health/tools/404-JSON posture UNCHANGED while
  serving, inactive default (GET / is still the honest 404 JSON),
  missing-dist honesty.
- Docs: prd-web.md 3.1 matrix row B now SHIPPED P4 (opt-in OFF-by-
  default) + the Mode B mechanics paragraph; DEPLOY.md 12.2 = the Mode
  B walkthrough (original 12.2 contract section renumbered 12.3).

**Pass 224 (frontend, 2026-10-14) - P4 vector plumbing: the brains map
consumes REAL pod embeddings; found that the entire semantic-search
layer had been dead-on-arrival):** owner: "keep going... Mastercraft
lesson". The tracker's non-deploy-dependent NEXT-UP row was "real
embedding-vector plumbing waits for a pod that exposes vectors". The
build made the pod EXPOSE them - and caught a right haul of
never-yet-attached surfaces on the way:

- **Pod repair #1 - vant_search_semantic NEVER answered results**:
  the handler sliced the RESULT OBJECT as an array (`results.slice` on
  `{results, memories, context}`), so every call for the tool's whole
  life answered a typed error - the same handler-shape class as the
  pass-214 msg_send bug. No suite had ever run it live. Fixed: the
  handler slices the hit array; schema grew opt-in `withProjection`.
- **Pod repair #2 - the RAG scorer fed FULL corpus docs through the
  input pipeline** (a >100k brain file (CHANGELOG-class docs) tripped
  the vaf length cap; after a documented per-doc embed window cap
  (RAG_SEMANTIC_EMBED_CAP 20000) the path pattern scan still tripped on
  doc PROSE ('/tmp/' refs, '../' mentions, percent-encode examples) -
  genuinely dead even repaired). The narrow internal seam: vaf option
  `blobContent` (length gate ONLY for owner-owned doc content; the
  caller-input path and every MCP schema keep ALL scans; the flag rides
  ctx.options, callers can never set it), pipeline case 'vaf' passes
  ctx.options.blobContent through, search.semantic marks its corpus
  embedding calls; the QUERY stays fully scan-gated. Precedent line:
  the repo's own `allowContent` memory-content flag.
- **Pod side NEW - lib/embed.project2d**: deterministic seeded
  Johnson-Lindenstrauss random projection of 384-dim embeddings to the
  plane (mulberry32 + Box-Muller, FIXED seed 9 - the NSC9 homology),
  point scale bounded; typed guards (empty/ragged/non-numeric/NaN all
  E_EMBED_PROJECTION); zero deps per the pod rule.
- **the contract**: `vant_search_semantic` now answers `projection` on
  the opt-in (dims 2, seed 9, `points` with point 0 = QUERY anchor and
  `points[i + 1]` = by index `results[i]`, provider label, embeddedDim
  honored): the SAME vectors the scoring just computed (retained by
  identity at the scoring loop, so hits join their vectors without
  re-embedding; payload bounded by limit, never corpus size). A loading
  failure degrades to an honest null projection (event emitted) without
  killing the search.
- **Dashboards side - the Brains map consumes it fail-closed BY
  CONTRACT**: NEW src/modules/brains/projection.ts (pure, unit-pinned):
  mapProjection validates dims/anchor/offsets/lengths/finiteness and
  maps rows by index; ANY mismatch = null = the rank view, honestly
  labeled (never a half-guessed plot). The Search tab now detects REAL
  search tools BY NAME (the door's semantic tool is vant_search_semantic
  - the old brain_search prefix detection missed the whole surface) and
  preferentially calls the semantic tool with withProjection:true; the
  map draws the REAL scatter (ring = query anchor, spokes to hits, amber
  = NSC9 keys) when the contract checks out and keeps the old rank view
  verbatim otherwise. Web slash growing pains: vitest 32/32 (26 + 6
  NEW), tsc 0, vite build 0.
- Pins: test/embed-projection.test.js (9, LIVE against the real door
  like the EW1 pins): project2d determinism + seed load-bearing + shape
  contract + typed guards; semanticSearch withProjection index-join +
  null-projection honesty; DOOR truth: vant_search_semantic answers
  REAL hits (the repair), projection rides /mcp/exec, and the schema
  gate refuses a string withProjection typed.
- Docs truth: mcp-tools.md vant_search_semantic row (full contract
  incl. the 20000-char cap), rag.md "Semantic Search + the Vector Map"
  (both seams stated plainly), prd-web.md 4 #18 row - the semantic map
  now consumes the pod's REAL vectors.

**Pass 225 (frontend, 2026-10-14) - pre-deploy honesty sweep: the
board's own wire sat silent, plus two whole tool surfaces looked
"empty" against a door that had them):** owner: "dashboard full build
run tonight" — a live-door walkthrough depends on the board, so the
audit trail of "what would look broken tonight" landed first:

- **THE LIVE BOARD WOULD HAVE SHOWN NOTHING, FOREVER**: the door's
  /mcp/events tap frames family events as NAMED SSE events
  (`event: agent:spawned`), and a browser EventSource's bare onmessage
  NEVER receives named events — the board would have hung on
  "Connected, no events yet" against a perfectly live stream. Door
  contract fix: family frames are now DEFAULT-message events with the
  full type embedded as `tapType` (single frame, no duplicate bytes;
  the named `tap.revoked` annihilation note keeps its own contract and
  the frontend closes on it). tap.test.js pins updated to assert the
  new contract strictly (tapType-prefixed data), 1/0.
- **the fan finally lands on door roots**: frame/events.ts familyOf()
  maps `tapType` root ('agent' from 'agent:spawned'); registry.ts
  families are the door's ROOT vocabulary now (era/agent/task/escrow/
  market/forum/msg — the old 'agents'/'tasks' plurals never matched
  anything the tap sends).
- **tool detection repairs (the brains pass-224 class again):**
  - nodes/#17: matched `nodes_list` + `agora_nodes` (the old node_/
    mesh_/registry_ prefixes matched NEITHER — "no tools" against a
    door that had them);
  - audit/#11: matched `vant_audit_list`/`vant_audit_log` (old
    audit_/ledger_ prefixes missed the vant_-prefixed pair).
- **docs claim freshness**: docs/operations/events.md gains "The MCP
  tap stream" with the wire contract verbatim (default frames,
  tapType + root keying, the tap.revoked named exception, the
  internal-family exclusion).
- verified at delivery: tap 1/0, web vitest 32/0, tsc 0, vite build 0;
  full repo gate + docs stack + horcrux cadence at the envelope below.

**Pass 226 (frontend, 2026-10-14) - PLANNING round, owner-vision
landing: the relay chain + the sovereign instance scope, the dashboard
becomes an OSS relay layer):** the owner saw the deployment shift
"this dashboard is bigger than you and I - an oss means to make
relays": ANY self-hosted instance can be an orchestrator to anyone's
install; if brain.creadev.org goes down, someone else's relay still
reaches the pod. Recorded as spec + parent-PRD amendments, NO code:
- NEW labs/prd-relay.md v0.1 (the dedicated spec):
  - scope split: the INSTANCE scope (property origins from the old
    env registry, bound tokens, session/account layers) moves CLIENT-
    SIDE encrypted (WebCrypto AES-GCM, non-extractable keys, two
    documented unlock paths: passphrase KEK / passkey-PRF KEK;
    profile exports as one encrypted file - the horcrux pattern at
    web scale). The relay's ONLY pin is an ONBOARDING template the
    client imports once - never a standing claim.
  - the relay chain (like mesh on the backend, a service layer on
    the frontend): ordered hops ending in Mode B direct as the
    dead-last fallback; degradation is named BY HOP in the UI,
    never silent; status/#3 grows the chain card (P6 adds route
    #20 /chain to the catalog).
  - Mode R, the relay proxy contract: the /api/r/* surface takes a
    CLIENT-declared upstream origin (https-only, public-DNS,
    SSRF-typed refusals for private ranges) + SSE stream-through;
    mode B posture edges (rate budget/breaker) per relay per hop;
    the pod's door is UNTOUCHED (that has been true since the host
    posture table - Mode R is frontend-only).
  - the honesty boundary, stated and never conflated: MVP relays
    are transport-aware and CONTENT-SEEING ("use relays you trust,
    or wait for P6b"); P6b = end-to-end channel negotiated at
    PAIRING TIME (the voucher/QR path becomes the key-binding
    moment) so relays route ciphertext, cannot replay or downgrade;
    caps/edges pin the per-hop posture, chains are hand-curated
    until mesh discovery is later opted into.
  - modules under the split: settings grows the profile/chain
    editor + export/import; users/#13 + email-OTP stay the RELAY
    OPERATOR'S own surface (never sovereign scope); pairing grows
    the P6b key-binding step; work/chat/forum/etc. unchanged (only
    the hop moves under them).
  - migration: brain.creadev.org keeps Mode A onboarding AND
    imports into the client-held profile on first load (AuthGate
    seam owns first paint); DEPLOY.md gets a "host a relay"
    appendix at P6 build time.
- labs/prd-web.md amended: the scope-split direction block at §3,
  a P6 phase row, and catalog row #20 (/chain) added; phases P0-P5
  unchanged - P6 starts when the owner says.
- deliverable posture: PLANNING ONLY this round (spec + PRD +
  tracker); gates re-run green, no code touched, horcrux cadence
  observed.

**Pass 227 (frontend, 2026-10-14) - STRUCTURE ruling for P6: the relay
runs SOLO; the second-frontend trigger fires; the kit ban lifts as
hash-pinned vendoring):** the owner asked the structural question
directly ("split the relay out in /web so it can run solo, outside of a
full dashboard? whereas full dashboard can still enable and run it?").
The ruling, written into the spec (prd-relay.md 4.0): YES -
- web/relay = a standalone PURE relay app under the directory
  contract (own package.json/build/dist/functions, own subdomain
  relay.creadev.org): one posture page + the /api/r/* Mode R
  functions + a capabilities endpoint advertising the SOLO flavor
  (pins NO default profile - nothing to pin) with zero auth/account/
  admin surfaces BY CONSTRUCTION. "A different app whose honest sum
  is one page and four functions" - a host can serve the chain
  WITHOUT running a full dashboard, and holds nobody's instance
  config because the app has nowhere to put it.
- web/dashboard keeps "participate as a relay" as a POSTURE toggle
  (settings, off = exactly today's Mode A deploy): enabled = its own
  functions serve /api/r/* too (DASHBOARD-relay flavor; a pinned
  default profile allowed there).
- the kit: prd-web's cross-frontend ban was ALWAYS phrased as "until
  a SECOND frontend exists" - this is that second frontend, so
  web/kit/ exists as the vending SOURCE for the byte-identical-across-
  relays surfaces only (/api/r contract client, chain probe, chain
  fragment build/parse, brand tokens/footer/help primitives); a
  vendoring script copies kit files into each app under src/kit/
  with .sha256 pin sidecars (the repo's own checksum cadence), and
  the lint gate FAILS on pin mismatch. Apps stay self-contained:
  they never read each other's sources, ever - only the vendored,
  hash-pinned copies.
- build ladder inside P6a: R0 kit extraction + vendoring gate; R1
  web/relay standalone verified alone; R2 dashboard participation
  toggle + chain editor + chain card; P6b (E2E channel) unchanged,
  later.
- prd-web.md amendments: directory model gains web/relay + web/kit
  (vendored-pins note), the non-goals guard records its OWN lift
  (citing the trigger), and 2.5 notes the relay.creadev.org deploy.
- deliverable posture: PLANNING (spec amendments only, no code).

**Pass 228 (frontend, 2026-10-14) - CORE-PRINCIPLE ruling for the
relay: real, not proto; headless-first; it keeps the network alive):**
the owner elevated the mechanism itself ("we should make that real,
not like a proto/mvp. Like the relay mechanism powers the pod
connections, and possibly other encrypted tx. It should be a core
principle between vant and a front end... Or no front end. It's
another masterclass in using the vant headless... And it happens to
keep the network alive."). Recorded as prd-relay.md v0.2 (spec only,
no code):
- NEW prd-relay.md §1.1: the relay is a CONNECTION LAYER of vant, not
  an app. Mode R is now served BOTH by the Pages edge functions AND a
  headless serving posture (`vant relay`, the sibling of `vant
  headless`: one boot, the /api/r/* shapes, a capabilities line, zero
  UI mandated). Consumers generalized: browser dashboard, pod CLI,
  MCP agent, pod-to-pod; the browser is ONE renderer and "no front
  end" is supported posture (a chain is a config, not a page).
- E2E IS THE CORE (not the distant P6b era): §5's MVP content-seeing
  relay is an INTERIM migration posture with a named sunset; bodies
  cross hops as ciphertext by default and other encrypted tx (msg
  payloads, escrow movements relayed verbatim) ride the same blind
  hop; new chain entries keep the e2e/plain verified-capacity badge
  so the sunset is mechanical, not aspirational.
- the relay keeps the network alive: chain hops double as mesh
  liveness (prd-mesh.md substrate) - the client's chain probe is also
  the liveness feed the node registry and mesh status read; a healthy
  chain IS a healthy mesh edge seen from the client side.
- §8's old "Mode R is purely frontend / NO pod code changes" non-goal
  was RETIRED; the one invariant it truly protected is kept verbatim
  (no door-auth-posture changes; the pod stays loopback/private and
  the relay layer requires no new exposure). R0 grows to COMMIT THE
  HEADLESS CORE CONTRACT first (Mode R shapes + capabilities
  semantics + the `vant relay` posture), the contract the solo relay
  app and the dashboard toggle then render.
- deliverable posture: SPEC ONLY (prd-relay.md v0.2 + tracker); no
  code this round; gates re-run after the last edit.

**Pass 229 (frontend, 2026-10-14) - R0 LANDED: the headless relay core,
"it works, but gated"):** the owner said build it - the relay is a
pipeline for future agent processes too, encrypted pipes connecting
installs and/or each other, GATED so not just anyone flows; the
dashboard uses the pipes and auths the gates. Landed as real code:
- lib/relay.js (NEW): the headless Mode R core - `POST /api/r/exec`
  (GATED) + `GET /api/r/capabilities` (public posture proof, no
  secrets). Gate ladder fail-closed at every rung: relay off = typed
  503 E_RELAY_OFFLINE before any work; enabled without a gate key =
  503 E_RELAY_GATE_REQUIRED (serves NOTHING); missing header = 401;
  wrong key = 403 (timing-safe sha256 digest compare - length never
  taken from the wire); the credential is spent at the gate only, it
  never rides upstream.
- ENCRYPTED PIPES ONLY: hop bodies must be lib/encrypt's AES-256-GCM
  envelope (salt:iv:tag:cipher); the relay verifies SHAPE and forwards
  byte-verbatim, holds no channel keys, cannot read content; plaintext
  bodies refuse typed 415 E_RELAY_NEEDS_ENVELOPE (no downgrade - v0.2
  1.1.2 as code). SSRF guard: origins are explicit client-declared,
  https-only in the public posture, DNS resolves ALL records fail-
  closed; cloud-metadata (169.254/16) + 0.0.0.0 are HARD-private and
  refuse EVEN under the documented relay.allowPrivateOrigins lab
  escape (which opens loopback lab targets, never the metadata hole).
- liveness: every served/refused hop emits relay:hop:served / refused
  (origin + bytes + ms ONLY, never content) - the mesh-registry feed
  the R-ladder promised; counters ride relay.status().
- client seam: relay.sendThrough REQUIRES the e2e channel key
  (E_RELAY_NO_KEY typed refusal otherwise - no plaintext hops, ever);
  assembled envelope rides origin+path exactly (forward joins the
  declared pair, one pin caught the first draft dropping path).
- mounting: lib/server.js listen() mounts the posture when
  relay.enabled - SAME server, SAME security chain (vaf, qos, TLS,
  auth posture), no new port, no new exposure.
- doors: `vant relay status|gate` CLI (gate generates + persists the
  256-bit key through config.setConfig, shown once), MCP
  `relay_status` (read-only posture truth) - 328->329 tools, docs row
  landed same turn.
- docs: docs/operations/relay.md (the whole posture: five gates, the
  encrypted-pipe walkthrough, bring-up, honest replay-posture note),
  config.md relay.* rows (brain-config keys, NOT env vars), cli.md
  row (coverage 132->133 PASS).
- pins: test/relay.test.js 26/26 - gate ladder, hard-private
  invariant, envelope-only, byte-verbatim forward, holder-only
  decryption, NO-PLAINTEXT-LEAK truth (the upstream frame carries only
  { ct }), caps honesty without secrets, status/liveness truth.
- adjacent repairs by the gates: surface-consistency caught the
  pre-existing `vant headless` inline-dispatcher gap (pass 210's
  inline route never joined the hand-verified INLINE_HANDLERS
  inventory) - registry repaired, claims resolve; mcp suite re-run
  after roster debris (10 leaked ag-test agents from an earlier
  crashed pin run) hit the honest max-10 quota gate - debris purged
  (backup /tmp), suite 17/17 again.
- deliverable posture: CODE LANDS (lib/relay.js, lib/server.js seam,
  bin/relay.js, MCP tool, tests, docs); gates green: cli 128+5=133,
  mcp 329=329, surface-consistency PASS, docs-truthfulness PASS, style
  PASS (126), frontmatter/language/fiction PASS.

**Pass 230 (frontend, 2026-10-14) - KIT PARITY + the dashboard
piggyback: "baseline works with parity between relay and full
dashboard; a setting to run a relay; the important relay services
WORK"):** the owner ruled the next relay rung. Landed as code:
- web/kit/contracts/relay-contract.js (+ .d.ts twin): THE UPLIFT SOURCE of
  one Mode R contract - routes, gate header, typed codes AND their
  statuses (parity law: same situation = same code+status on every
  renderer), the envelope rule, the three-flavor registry (pod /
  dashboard / solo - solo pins NO default profile), honest capsShape,
  pure IP guard, hard-private split metadata rule. Runtime-agnostic
  BY CONTRACT (no Node/Workers APIs in the source).
- vendoring: scripts/vendor-relay-kit.js copies the kit byte-
  identically into each renderer with .sha256 pin sidecars; --check
  mode verifies pins for CI; tests FAIL on pin-vs-kit-head drift (the
  horcrux checksum cadence). Dashboard vendored: functions/lib/
  relay-contract.{js,d.ts} + sidecars, BOTH pins verify.
- PARITY NOT IMPORT: the pod's one-way boundary (pod never requires
  web/) is kept physical - lib/relay.js holds its own plain-copy
  constants, and the parity pins deep-compare pod-vs-kit (routes,
  caps/header, CODES, STATUS, envelope rule, body cap, timeout,
  flavors, shape verdicts on real freight).
- dashboard-relay flavor lands (R2-lite piggyback):
  functions/api/r/exec.ts + capabilities.ts import the VENDORED kit
  (no hand-strung env literals, no private regex copies - the kit is
  the single law); env posture keys VANT_RELAY_ENABLED /
  VANT_RELAY_GATE_KEY read at REQUEST time through EDGE_ENV_KEYS;
  the five gates mirror the pod (most-off = 404 like an unmounted
  route; no-key = fail-closed 503; missing header 401; wrong key 403
  via WebCrypto digest compare with a constant-time buffer walk; edge
  holds NO channel keys); envelope-only pipes; forward via fetch,
  verbatim, gate never rides upstream, ms truth measured.
- settings (#4) gains the "Run a relay (piggyback)" card: reads the
  deploy's public /api/r/capabilities and states the truth
  (flavor/gated/gate-ready/e2ePOSTURE); names the operator env keys;
  NEVER pretends the browser can flip the posture (the pass-217
  honesty law) - the toggle is the deploy.
- the important relay services WORK - full-socket pins joined the
  suite (relay.test.js 26->31): boot the pod server with the posture
  ON and the mount seam must fire INSIDE listen(); capabilities over
  real HTTP; the WHOLE client hop (sendThrough -> gate -> envelope ->
  verbatim forward -> holder opens) across REAL sockets; wrong gate
  over the socket = 403 no-flow.
- DEPLOY.md carries the two piggyback env rows (Pages settings,
  both-scopes); docs/operations/relay.md grew the kit table + the
  piggyback section (parity law stated; the edge's no-DNS-oracle
  difference stated ON the caps page, not hidden).
- verification battery: relay.test.js 31/31; relay-parity.test.js
  19/19 (byte-identity, constants, env-through-contract, single-law,
  honest settings card); vendor --check PASS both targets; web/
  dashboard tsc -b --noEmit clean (src + functions, vendored JS +
  edge flavor typed).
- deliverable posture: CODE LANDS (kit + vendor + edge flavor +
  settings card + pins + docs); no CLI/MCP surface change (coverage
  unchanged).

**Pass 231 (frontend, 2026-10-14) - relay reinforcement + ledger
formalized + the docs face:** the owner ordered the record hardened ("hit
prds, brain, etc. to reinforce the relay mechanism so we don't lose it"),
the DEPLOY + /docs playbook face, and a REAL user-side setting - "users
can run a relay on or off in their settings of dashboard", with the
warning that the sides must never blur - plus the pass-ledger rule to
stay. Landed:
- THE LEDGER RULE recorded in the tracker head verbatim (passes and
  pins only); the day-ledger scan shows only the ruling's own quote of
  the retired structure.
- prd-relay.md GAINS 6.1 - the TWO-SIDED SETTINGS CONTRACT (owner
  direction recorded verbatim in spirit): SERVING = the operator's env
  posture (the card READS it, names the keys, no browser switch - a
  browser cannot flip an env, period) vs USING = the user's own reach
  choice (persisted non-sensitive pref `bolete-relay-usage`); OFF is
  first-class on both sides; the honesty law holds: ON is saved INTENT,
  stated in plain text, until the chain editor + the pairing-time e2e
  rung make it live - nothing fake-routes. The §6 settings row +
  prd-web.md's #4 row now name both sides explicitly.
- settings (#4) REALITY: two sections, never blurred - "Use relays
  (your reach)" (the REAL persisted toggle with its today-truth copy)
  and "Run a relay (piggyback)" (operator posture card, now with a
  re-read-posture button so the card can never stale-cache its own
  conclusion).
- DEPLOY.md 12.4: the three postures (OFF default / POD-ONLY headless
  relay / DASHBOARD PIGGYBACK), the fail-closed laws, and the
  serving-vs-using split; points at the playbook.
- /docs playbook: docs/operations/relay-playbook.md (nav 69) - serve
  (pod), piggyback (dashboard), use (user side), verify (the
  401/503/415 ladder + curl checks + suite commands), a troubleshooting
  table; ops index TOC gains BOTH relay rows (relay.md had never been
  indexed - fixed in the same breath).
- BRAIN + MEM reinforcement: models/private/axolotl/lessons.md gains
  the relay-arc pass block (the mechanism, where it lives, the
  two-sided law, the ledger rule, verify-from-anywhere commands); MEM
  handoff is rewritten for the current state (the old pass-201 handoff
  demoted, retained).
- deliverable posture: SPEC + CODE + DOCS (state.ts relayUsage pref,
  settings card work, docs, brain, tracker); no pod-core change
  (lib/relay.js untouched this pass).

**NEXT-UP:** (1) the LIVE Pages deploy walk stays first; (2) then the
owner's circle-back: relay CORE work continues - R2's chain editor +
chain card make the usage toggle LIVE routing (the chain it governs),
with the pairing-time e2e decode rung right behind it - the dashboard
is BUILT ON the pipes, not beside them; (3) then web/relay standalone
(R1, the solo flavor from the same kit); (4) owner queue otherwise
unchanged (neighborhood zoom, Tier A explorer, P5 workbench,
prune-orphans).

**Pass 232 (frontend, 2026-10-14) - THE FRESH PRD: relay v1.0, the
definitive definition ("we wanna define all"):** the owner ordered a
clean relay PRD - everything defined, nothing named-but-fuzzy.
- labs/prd-relay.md REWRITTEN as v1.0 (THE DEFINITIVE DEFINITION),
  superseding the v0.1/v0.2 planning drafts, which survive verbatim in
  the new §0 direction log (all eight owner rulings, pass-numbered).
- EVERY SECTION ANCHOR PRESERVED (the code + docs that cite §1.1,
  §1.1.2, §4.0, §5, §6.1 keep resolving) and the definition debt is
  zero: §3.2 now carries the FULL interface table - roots, gate
  header, caps shape (exact JSON), exec request/response shapes, the
  SEVEN typed refusal codes with their statuses (the parity law:
  same situation = same code + same status on ANY renderer), refusal
  payload shape, the gate rule (sha256 both, constant-time digests,
  length never from the wire), the envelope law (salt:iv:tag:cipher
  + true replay posture), the origin guard incl. the edge's no-DNS
  difference (stated on the caps page, not hidden), and both config
  seam families (pod brain-config keys / edge Pages env).
- §11 THE DEFINITION LEDGER: every named element gets its truth-state
  (defined / built / built+pinned / defined-rung) and its home - the
  no-fantasy guarantee in table form.
- §12 ACCEPTANCE CRITERIA PER RUNG: R0 (done, with the concrete pins
  that prove it), R1 (web/relay standalone + SSE stream-through), R2
  (the usage toggle becomes LIVE routing through the chain - intent
  to live, never silent hops), e2e rung (pairing binds the key; the
  door decodes; the interim sunset becomes mechanical).
- §13 verify-from-anywhere commands; links to the three faces (mech
  ops page, playbook, DEPLOY 12.4 / config docs).
- adjacent repairs: bin/relay.js help typo ("prs-relay" -> prd-relay)
  caught by the same sweep.
- deliverable posture: SPEC + one help-text typo repair (bin/relay.js;
  no core/door change); the doc gates + truthfulness + links re-run
  green after the last edit.

**Pass 237 (relay, 2026-10-14) - THE INTERFACE HANDLER: the bridge
families.** The owner formalized the relay's true role after the
fold-in: a series of triggers making a schema + pub runtime at /web/relay,
running independent and minimal always (server/proxy), while the
dashboard keeps certain pipes THROUGH it and outsources auth - "the
interface handler, so front or back don't have to worry so much, yet
heavily tied to dashboard and backend." This turn made that REAL on
the pass-236 composition (zero new lib files):
- THE DOCTRINE (PRD §3.3): role map recorded - server/proxy (solo,
  minimal always), the auth shaman (clients hand INTENT, never
  credentials; the face spends its own gate secret + its OWN delegated
  pod access server-side), ingest/states (no new planners), im-lost
  beacons, and the api bridge catch-all. The one-way credential law
  from pass 234 stands UNBROKEN: adding families put no pod secrets
  into holding anywhere.
- KIT r/2 (additive): EVENTS gains sync/lost/call (the wire shape,
  gate, replay, freshness, cap mechanics all unchanged - the schema
  approves new families, not new mechanisms). Both d.ts twins updated
  FIRST-run lag caught by the dashboard typecheck (one repair, one
  re-vendor).
- POD FACE: `relay.sync` -> door brain_write (single or { entries: []
  }, 64 cap), `relay.lost` -> context_heartbeat status + brain_current
  (the door answers WHERE one stands), `relay.call` -> any door tool as
  sent (the door verifies the rest). Broken payload shapes answer typed
  E_RIDE_DECODE; unknown families E_RELAY_UNKNOWN_EVENT. The E_RIDE_*
  family is reused deliberately: the bridge IS a ride - one refusal
  language per door disposition.
- DASHBOARD EDGE: bridge families forward through the edge's EXISTING
  pod bridge lib (functions/lib/bridge) - the edge spends its own
  delegated pod access server-side; the browser JS never sees a
  credential. Capabilities page lists the families truthfully.
- SOLO EDGE: hop only, minimal always (the doctrine row - nothing
  added to its held-nothing posture).
- SUITE: the fresh r/2 suite grows 26 -> 31 pins (the bridge loop over
  real sockets, door translation truth, bent/unknown family refusals
  typed). Vendoring re-pinned to kit head (--check 0); both web trees
  tsc -b --noEmit 0.

Verification (exits preserved): test/relay.test.js exit 0 (31/31);
scripts/vendor-relay-kit.js --check exit 0; web/dashboard and web/relay
tsc -b --noEmit each exit 0. Remaining named limits: the browser-side
consumer of the bridge families (dashboard api.ts helper) is the next
rung; full test/ci.js battery not run this pass; the live-subdomain
walk still owns solo-arm real-reach truth.

**Pass 236 (relay, 2026-10-14) - THE FOLD-IN: no lib/relay module,
wire r/2, tests rebuilt fresh.** The owner ruled (frankly, and
right): the relay as a NEW lib/ module was a rogue parallel system -
its own gate ladder, stats map, mounting seam, refusal codes, even its
own http machinery and DNS SSRF check - while every one of those
concepts already had a home (webhooks' HMAC routes + replay check;
network.fetch's SSRF wall + breaker; encrypt.js's envelope + HMAC
law; the MCP door's auth chain). The pass-233 lesson, relearned as a
lib file instead of a verb file. EXECUTED:
- THE FACE IS A COMPOSITION (no new file, the guard is mechanical:
  no-legacy-bloat FAILS if lib/relay.js reappears; bin/relay.js stays
  as the CLI OVER the face and is pinned against requiring a lib
  module): intake = lib/webhooks.js ONE registered route (POST /relay,
  HMAC-gated by the route secret = relay.gateKey, replay-refused,
  1 MiB-capped - the doors' shared cap posture added to the webhook
  server while there); outbound = network.fetch (the SSRF IP wall,
  DNS-rebinding refusal and breaker are the transport's own -
  PROBE-VERIFIED in public posture: the loopback hop IS refused by the
  wall, and the lab escape widens scheme + IP-wall together); envelope
  = encrypt.js directly; ride dispatch = the pod's OWN door (loopback
  POST /mcp/exec, the door's auth chain intact); the face lives in
  lib/api.js relay (mount/status/relaySend); boot wiring in
  startFull/startHeadless; the server.js SEAM REMOVED; bin/relay.js
  rebased; MCP relay_status re-pointed to the face.
- WIRE r/2 ("free to break -> new version", owner ruling): the
crew-bus envelope shape ships as the relay wire - HMAC-SHA256 hex
over the RAW body bytes in X-Signature-256 (the webhook transport's
own signature header - the gate IS the route secret, one mechanism,
zero bespoke gates), { event: 'relay.hop' | 'relay.ride', from, ts,
nonce, payload, v.major=2 }, ack carries `reply` (the forward/door
answer rides the SAME post back - the replyCapable + awaited-dispatch
extension of the webhook transport: the live-fire lesson was
  event.emit's handlers NOT awaited; the await lives in a per-route
dispatch hook now). Transport statuses keep 401/409/404/413;
application refusals ride typed E_RELAY_*/E_RIDE_* replies INSIDE the
200 ack (reasons survive any chain).
- KIT r/2: web/kit/contracts/relay-contract.js (+ d.ts) rewritten (routes,
EVENTS, TRANSPORT_STATUS, reply codes, wireEnvelope, capsShape,
private-IP helpers kept pure); vendoring re-run, all four copies pin
to the kit head (--check 0). BOTH web flavors rewired to r/2
dashboards: intake POST /api/r/relay (WebCrypto HMAC + freshness
window + ack-with-reply), capabilities surface naming, the solo events
stream re-gated (HMAC over the query declaration), settings-card caps
check r/2, relay page gate wording. Both trees tsc -b --noEmit exit
0. The dashboard stays a SECONDARY consumer (the ruling).
- TESTS REBUILT FRESH ("old work: rebuild tests fresh", owner):
test/relay.test.js written from scratch (26 pins: face truth, the OFF
posture, fail-closed mount, the HMAC gate ladder over real sockets,
transport replay 409, the FULL hop loop with the verbatim answer and
no-body-leak, typed ride loop with the bearer inside the envelope,
ride refusals through the pipe, body cap, counters, the sender seam
relaySend); test/relay-parity.test.js rewritten (16 pins: vendored
byte-identity, face-constant pins vs kit head, envelope-shape
agreement, the retired-wire lies caught); no-legacy guard updated to
the pass-236 ruling (13/13).
- HONEST DELTAS from r/1, named: /api/r/capabilities per-route on the
pod GONE (discovery = the webhook transport's own /info/<route>); the
DNS-seam SSRF checker deleted (network's walls are the posture now);
the caps route's public CORS on the edge stays; the edge freshness
window replaces the stateless edge's absent replay cache (the pod
keeps the byte-replay 409).

Verification (exits preserved): test/relay.test.js exit 0 (26/26);
test/relay-parity.test.js exit 0 (16/16);
test/no-legacy-bloat.test.js exit 0 (13/13); test/mcp.test.js exit 0
(17/17); scripts/vendor-relay-kit.js --check exit 0; web/dashboard
tsc -b --noEmit exit 0; web/relay tsc -b --noEmit exits 0.

**Pass 235 (relay, 2026-10-14) - THE RIDE FACE: the pod's door acceptor
(PRD §5 rung 3 + rung 2-lite) built and pinned; answers the owner's
"is our relay working properly with dashboard?" with the flow that
makes headless relay runners contrib-ready:** a relayed envelope now
ARRIVES at the pod and gets opened, replay-checked, dispatched to the
pod's OWN MCP door, and answered as an envelope - the pod half of the
e2e rung is real, not defined-on-paper.
- POD FLOW (lib/relay.js handleRide + the ride transport seam in
  server.js, lib/relay.js defaultTransport): rides land at
  POST /api/relay/ride under the relay posture; open the envelope with
  the pod's channel key (rung 3); refuse replays by nonce in a
  TTL-windowed FIFO-capped cache (rung 2-lite); dispatch the inner
  JSON-RPC to the pod's own tool door with the pod-realm bearer riding
  INSIDE the envelope (§5's credential tunnel - the relay sees a
  per-relay bearer, the door sees one honest subject); wrap the door's
  answer in an envelope back - anyone between holds ciphertext.
- REFUSAL FRAMING LAW (the honest lesson of the pass): ride refusals
  answer HTTP 200 with application-level { ok:false, code } from the
  E_RIDE_* family (OFFLINE/DECODE/REPLAY/DISPATCH) - refusals are not
  HTTP errors at the door, and it is the ONLY framing whose typed
  reasons ride back through ANY hop chain with the kit's verbatim-2xx
  law untouched (a non-2xx upstream answer becomes an opaque 502 hop).
  The FIRST run of the pin suite caught this for real: 16d/16e came
  back opaque E_RELAY_UPSTREAM 502s exactly as the law predicts - the
  framing was repaired at the source, not in the pins.
- PINS: test/relay.test.js 31 -> 38. Block 16 walks the FULL ride
  loop over REAL sockets (envelope -> relay hop -> ride -> door
  dispatch -> envelope back), pins the bearer INSIDE the envelope
  (16c2), the replay refusal (16d), the malformed-frame refusal
  (16e), and the liveness counters (16f).
- PRD FACE: labs/prd-relay.md §5 gains the rung-3 framing law, §11
  flips the door-acceptor row to BUILT + PINNED (pass 235), §13
  refreshes the counts; the e2e-rung acceptance names the pod halves
  pinned and the client half (key binding at pairing) still with R2.
- Limits, named not silent: the ride face is a POD surface - the
  dashboard-side key binding at pairing and the chain rung (R2) stay
  client-side build items; the deploy walk still owns live-subdomain
  truth for the solo arm.

Verification after the final state of each file (exits preserved):
- test/relay.test.js exit 0 (38/38); test/relay-parity.test.js exit 0
  (40/40); test/mcp.test.js exit 0 (17/17);
  scripts/check-bin-truthfulness.js exit 0.
- No pod door auth posture changed; the kit contract untouched (no
  re-vendor owed - parity suite still passes against the checked-in
  vendor). Tree is Save/commit-ready.


**Pass 234 (frontend, 2026-10-14) - /web/relay HARDENING: the fallback
share, held-nothing guarantees ("no one knows logins, info, etc; the
transport is encrypted before it hits the relay"):** the owner ordered
one more pass over the small-fry arm - the one that matters when
brain.creadev.org goes dark and OTHER relays take the slots. Landed:
- THE FALLBACK SHARE, stated on the relay's own page (new "fallback
  share" block): this relay is INTERCHANGEABLE - any other r/1 relay
  takes a slot when a primary goes dark; the CLIENT owns the chain
  order, never the relay; nothing lives here to migrate (no logins,
  no instance info, no profiles); every hop body arrives as an
  AES-256-GCM envelope encrypted by the client BEFORE it touches the
  host, and the relay holds no key to open it.
- HELD-NOTHING GUARANTEES MADE MECHANICAL (parity block 12, suite
  35 -> 40): 12a functions/lib carries ONLY the checksummed contract
  pair (no accounts/kv/ledger module ever ships beside it); 12b ZERO
  credential identifiers (session/cookie/Bearer/channelKey/apiKey) in
  the solo runtime path - the relay cannot learn logins even if
  compromised; 12c no module-scope caches, no KV/store bindings -
  stateless hop-to-hop by construction; 12d the page states the
  interchangeability + pre-encryption law (contiguous prose, pin-
  checked - the first run tripped on a line-split phrase and the
  WORDING was fixed, not the pin); 12e every route answers nosniff +
  no-referrer.
- EDGE HARDENING (small, real): caps/exec/events every answer carries
  `x-content-type-options: nosniff` + `referrer-policy: no-referrer`;
  CORS stays wildcard ONLY on the public secrets-free caps route.
- DOCS FACE: playbook Recipe 3 gains the fallback-share paragraph; the
  relay README gains "The fallback arm" section naming each pin.
- deliverable posture: CODE + DOCS (web/relay page + headers, parity
  pins, README/playbook); NO pod-core change, NO kit change, NO
  re-vendoring needed (both flavors still pinned to the same head).


**Pass 233 (frontend, 2026-10-14) - THE CORRECTED ARC: web/relay is
the solo live endpoint; the dashboard RUNS WITH a relay (a setting).**
The owner ruled the arc mid-pass with an interception ("you bypassed the
whole web and headless... created your own lib outside of os"): the
agent's first attempt invented a client attach face inside the pod lib
(useRelay/hopThrough + vant relay use/hop verbs) - a second, unelected
definition outside the kit. RECTIFIED IN PLACE: both files reverted to
the pinned R0 state, verified live (relay 31/31, parity 19/19 unchanged
by the revert), nothing else landed from the bypass.


Then the corrected arc, executed in the owner's construction order:
- web/relay LANDED (R1, the solo flavor): own package.json / tsconfig /
  vite config / index.html; a vanilla-TS POSTURE PAGE (no framework,
  states what the relay IS and what it does NOT have - the
  no-default-profile-pin guarantee is on the page); the three Mode R
  functions (capabilities cross-origin readable, exec = the same
  five-guard ladder, events = the R1 SSE stream-through: gated,
  byte-verbatim, no-envelope-honesty stated live).
- VENDOR + PARITY: scripts/vendor-relay-kit.js gained the third target
  (web/relay/functions/lib); kit head comment names R1 as landed; all
  four vendored copies re-pinned; parity suite grew 19 -> 35 (the R1
  block: vendored byte-identity both flavors, solo exec reads the
  contract authority for every gate, caps = solo flavor + CORS read +
  no profile pin + stream named, events = same posture ladder +
  byte-verbatim + no-envelope honesty).
- THE DASHBOARD SETTING (owner: "dashboard uses /web/relay ... make it
  a setting"): state.ts gains the persisted non-sensitive
  `bolete-relay-endpoint` pref + actions.setRelayEndpoint; settings
  #4 gains "Run with a relay (web/relay endpoint)" - enter the relay's
  origin, VERIFY LIVE against its public caps (https-only, r/1,
  envelope-required contract read; 404 = not a relay, typed), and the
  card states the honest today-truth: the endpoint is verified and
  remembered NOW; execution through it routes with the pairing-time
  e2e rung (6.1 law: nothing fake-routes).
- DOCS FACE: DEPLOY.md 12.3 -> FOUR postures (the solo row NEW);
  docs/operations/relay.md gains the solo section + the third vendored
  renderer row; the playbook gains Recipe 3 (host the PURE relay) and
  the run-with-a-relay setting in Recipe 4 + two troubleshooting rows;
  web/relay/README.md carries the deploy walkthrough.
- deliverable posture: CODE + SPEC + DOCS (web/relay app + functions +
  vendoring + dashboard setting + docs); NO pod-core change (lib/relay.js
  and bin/relay.js stand at their pinned R0 state).

**Verification:** relay 31/31; parity 35/35 (vendor --check covers all
four targets); web/dashboard `tsc -b --noEmit` clean; web/relay `tsc -b
--noEmit` clean + `vite build` green (dist artifact built); doc gates
rerun after the last edit (see count line below).

**NEXT-UP:** first row stands - the LIVE Pages deploy walk (DEPLOY.md
12.1), now with the solo flavor deployable TOO (Recipe 3); then the
pairing-time e2e rung (receiving-side envelope decode) which makes the
dashboard's run-with-relay setting ROUTE (verified-remembered ->
verified-routing); then R2's chain editor + chain card (live routing,
the toggle governs); then neighborhood zoom / Tier A / P5 workbench /
prune-orphans.

## Session (2026-10-13 — pass 215: enumeration throttle + docs sweep)

**Owner: "We can do enumeration throttling the remaining runway item. We
should prob go through docs again too, to make sure everything is fresh,
accurate, etc."**

**What landed:**

- `guests.checkReadBudget(guestId)`: per-IDENTITY fixed-window read
  budget on the door for guest read-class verbs (default 120/60s, env
  `VANT_GUESTS_READ_BUDGET` with `0` = off; `VANT_GUESTS_READ_WINDOW_MS`
  tuning seam). Identity-keyed so guests behind one NAT stay independent.
  EW4-shaped buckets (FIFO-evicted, refusals charged only by the clock).
- Door: read-class guest calls answer typed `429 E_GUEST_THROTTLED` +
  `retryAfterMs` when exhausted; emits `guest:throttled`; hosts and
  write/exec verbs untouched; the EW4 IP limiter still layers above.
- Bug the pins caught before ship: the window was a MODULE-LOAD snapshot,
  so late env tuning silently failed; the window is now read PER CALL.

**Docs freshness sweep (owner ask):** no stale claims found beyond
accurate historical references to the fixed pass-214 bugs; registry
counts (328), REST/CLI rooms, era/chat/channel docs verified current;
new env knobs documented at multi-guest-auth (the VANT_MCP_RATE_LIMIT
env-side precedent). Full lint stack green: style, links, frontmatter,
language, fiction signatures, truthfulness (126 files / 131 routed
verbs), MCP coverage 328 = 328, CLI coverage 132.

**Verification:** mcp 17/17 (x2: trip/retryAfter + host pass-through,
per-identity isolation + clock recharge, budget=0 off); adjacent
contract suites re-run green.

**NEXT-UP:** #185 fully closed. Owner queue: H6 held (frontend story),
frontend/headless maturation = next big project.

## Session (2026-10-13 — pass 214: #185 channel scope — the msg_list follow-through)

**Owner: "let's work on these: the channel-scope story (owner concept for
msg channels, so msg_list can filter per tenant the same way agent_list
does now)."**

**What landed:**

- `lib/msg.js`: channels carry a claim-once OWNER ref —
  `send(chan, msg, { scopeOwner })` stamps NEW channels (loud on invalid
  refs, ignored on existing), `setChannelOwner` claims unowned ones and
  refuses steals typed (`E_CHANNEL_OWNED`), `channelOwner` accessor,
  `clear()` drops the owner WITH the channel, and the owner rides the
  arch-A snapshot (restart survival, pinned).
- Door (`lib/mcp.js` exec path): msg verbs get the pass-213 tenant
  posture — foreign scoped channels withheld on `msg_list` (honest empty,
  no existence leak), refused on `msg_send` (`E_TENANT_CHANNEL`) BEFORE
  the write; the gate itself fails closed on BOTH verbs; a first guest
  write stamps their `scopeOwner` (claim-once); unscoped = public; hosts
  untouched; a scopeOwner-less guest IS the default tenant.

**Two live bugs the survey caught (fixed same pass):**

- `msg_send` passed STRING content into `msg.send`, whose `{...message}`
  spread wrote `{"0":"c",...}` garbage on every channel write (forum's
  internal object calls hid it). Messages now `{from, content, timestamp}`.
- `msg_list` called `_msg.list(channel, limit)` — `Msg.list()` takes NO
  args and returns CONVERSATIONS, so channel/limit were silently ignored
  and every call answered the conversation roster.

**Verification:** msg 29/29 and guests 25/25 (each x2), plus the adjacent
contract suites (forum-msg-escrow, messaging-envelope, mcp) green; syntax
OK; docs updated (multi-guest-auth boundary + mcp-tools msg section).

**NEXT-UP:** H6 stays HELD (owner call, frontend story); #185 runway now
matches the tracked list (cross-tenant enumeration throttling beyond the
guest-management block); frontend/headless maturation = next big project.

## Session (2026-10-13 — pass 213: #185 H5 per-tenant list filtering LANDED)

**Owner: "please push to Github and then let's continue on the issues."**
Pushed pass 211+212 first (9d51951), then took the next runway item.

**What landed:**

- `guests.tenantAgentVisible(agentId, guestOwnerRef)` — the crew-roster
  tenant rule is MEMBERSHIP truth: agents assigned inside the guest's
  resolved container (scope.resolveMembers over the guest's scopeOwner)
  are the guest's crew; unscoped guest = empty roster (fail-closed);
  unknown container = deny; roster-module miss = deny.
- `guests.tenantVisible(recordOwnerRef, guestOwnerRef)` — general matcher
  for owner-ref records: unscoped record = public (the scope normalize()
  legacy read rule); scoped rows visible to their own tenant or an
  ANCESTOR CONTAINER, chained through REAL teams rows (org→dept→team);
  member-set truth for agent-kind viewers; no hierarchy guessing.
- Door wiring (mcp.js exec path): `agent_list` filters per tenant for
  guests, reports the honest count, and degrades to an honest empty
  roster on filter failure — never a crash, never unfiltered rows.
  Non-guest calls untouched.
- Boundary statement updated: the pass-211 "org-wide lists are
  operator-trust surfaces" caveat is RETIRED for the roster; still tracked:
  H6 QR pairing UX + channel-scope marking for msg_list (channels have no
  owner concept yet).

**Verification:** guests 17/17 (×2 — matcher rules, ancestry chain, member
truth, and the DOOR truth: host sees all / team guest sees exactly its
member / bare guest sees none); syntax OK on lib/guests.js + lib/mcp.js;
changelog + multi-guest-auth.md updated.

**NEXT-UP:** #185 H6 (QR pairing UX) HELD by owner pending the frontend
story - the pairing machinery itself is DONE (hash-at-rest via the
canonical lib/hash.sha256, timing-safe, single-use, TTL); all H6 adds is a
RENDERER (terminal blocks / SVG matrix; no new system needed — NSC9 is
storage addressing, stego is payload-hiding, neither substitutes for a QR
renderer). msg channel-scope marking remains the next candidate.

## Session (2026-10-13 — pass 211: #185 H1 multi-guest auth LANDED)

**Owner: "Let's do it. Next in queue: #185 H1. Spec it from
labs/prd-security.md and land the MVP this pass."**

- **H1 SHIPPED: `lib/guests.js` (NEW).** Per-identity guest tokens
  (`vguest_<id>_<secret>`, random - NOT claim-derived, so revocation is
  denylist-backed and honest), SHA-256-at-rest (habitat precedent),
  ledger `models/private/<brain>/.guests.json` (the .audit.json
  containment precedent). Roles map onto the EXISTING trio -
  scope.normalize owner kinds (fail-closed parse), sandbox capability
  vocabulary (observer/human/agent), trust levels (RESTRICT only; none
  caps to read). NO fourth permission system.
- **The door gate (lib/mcp.js):** guest verify BEFORE execute; own
  identity in the ALS ctx (userId guest:<id>, registry fields honestly
  null - a guest never impersonates an agent); verb classification
  (read patterns, unknown = write fail-closed, spawn-class checks
  canSpawn, exec-class checks canExec); guest_issue/list/revoke are
  admin-only (enumeration defense per the issue). requireKey accepts
  valid guest tokens like habitat tokens.
- **Pairing voucher:** headless persists the code's HASH in the guest
  ledger; `vant guest pair` redeems single-use into the operator's
  human guest. Voucher, not credential.
- **The auth.js seam is REAL for guests now:** revokeToken routes to
  the denylist (the pass-207 honesty pins updated - same truth, newer
  stronger claim); checkPermission ENFORCES for guest keys.
- **LIVE BUG FIXED (found by the pins):** the original token alphabet
  (base64url for id AND secret) made the `<id>_<secret>` split
  ambiguous - random `_` inside either part let the greedy capture
  swallow the separator, so freshly-issued tokens INTERMITTENTLY failed
  verify (we had already chased this exact flake on the module probe
  level before naming it). Both parts hex now; 13/13 pins x 5
  consecutive runs green.
- **Docs + doors:** docs/security/multi-guest-auth.md (contract + the
  honest MVP boundary: full per-tenant filtering of org-wide lists
  stays #185 runway); `vant guest` CLI routed; guest_* MCP tools;
  cli.md got rows for guest AND six pre-existing unrouted bins the
  coverage gate had been flagging (era/init/leisure/qc/tempo/trace) -
  gate PASS at 132 bins for the first time this cycle.

**Verification:** guests 13/13 (x5), auth 29/29, mcp/server/habitat-
token/security/schema/docs green, syntax sweep OK, all 5 lint:docs
gates PASS, language gate PASS (197 files, English-only).

**NEXT-UP:** #185's remaining runway (H2 SSE taps, per-tenant list
filtering, H4 work_assign, H6 QR pairing) - owner picks.

## Session (2026-10-13 — pass 210: #187 headless serving pod LANDED)

**Owner: "no migratory needed — it was just built, nobody uses it. Keep
going on next steps.”**

- **#187 CLOSED: `vant headless` = the serving pod.** One boot: MCP door
  (every registered tool — the door IS the headless API) + REST sidecar
  (health-only) + node discovery registration + the ONE auth posture
  print + a pairing code handed out. Ports/bind stay the existing env map.
- **Honest retire:** REST `GET /tools` → 410 Gone (pointer to the MCP
  door; no parallel tool catalog), the pre-registry `/brain` stub → 410,
  `/health` stays 200. The Router-registered `/brain` route remains
  (registry-backed — audited, distinct from the stub). `detectMode()` no
  longer claims an ambient "headless" on a plain import.
- **Pins:** `test/headless-retire.test.js` (14) — mode claims, 410s,
  health liveness, child-process pod door (boot, tool surface, posture,
  pairing code).
- **Owner ruling verified in code:** no leisure/tempo legacy migration
  exists and none will be built; the ruling flushed 2 stale path claims
  (`bin/leisure.js` help text, `docs/memory/tempo.md` FAQ) — both now
  name the contained ledger path.
- **CHANGELOG pass-210 section written;** docs suite + lint:docs (5
  gates) PASS; headless pins 14/14.

**Verification:** chunked full sweep 217/217 suite results (0 failed,
0 timeouts — the sweep exceeds the 180s terminal cap; run via
`node test/run-all.js` in --only slices). `npm test` build smoke green.
Docs 124/124, language gate 196 files English-only.

**NEXT-UP:** #185 H1 (per-identity multi-guest auth for the door) is the
TOP remaining named item; owner go-ahead before starting that surface.

## Session (2026-10-12 — pass 213: R3-F9 truthfulness gate LANDED)

**Owner: "noice work ty, let's keep going."**

- **R3-F9 SHIPPED — the docs truthfulness gate.**
  `scripts/check-docs-truthfulness.js`: every `require('./lib/…')` and
  `vant <verb>` inside docs markdown must resolve to the real tree
  (COMMANDS map + inline `case` handlers + bin/ file routes + help.js
  card names as the verb truth source). Only PROVEN-absent promises
  fail; unknown shapes are skipped. `<!-- TRUTHFULNESS-OK: reason -->`
  exempts the next line for deliberate demos.
  - First live run caught 3 REAL fictions in the swept tree:
    (1) examples.md sold `lib/auto-update` with an `enable()/on('save')/
    trigger()` API that never existed — rewired the example to the real
    `lib/sync.js` push path with an honest no-module note;
    (2)+3) coordination.md sold `vant git-branch create` which was never
    a verb — pointed at plain `git checkout -b` + the real `vant branch`
    manager (status/auto/commit/push/pr).
  - Negative controls (pass-79 rule): test/docs-truthfulness.test.js
    4/4 — clean-tree PASS, fictional lib FAILs, unroutable verb FAILs,
    exemption honored across a throwaway tree.
  - Wired: `lint:docs` final step + standalone CI row in
    .github/workflows/test.yml. Every future docs-parity round is now a
    CI run on the proven-absent class instead of a manual audit.
- Checker tuning en route: npm/git/docker/node toolchain words are not
  vant verbs (BIN_ALLOW); verb match requires shell-prompt/path context
  ("environment" false positive gone); COMMANDS slice bounded before
  handler object-literals drip in.

**Verification:** docs-truthfulness PASS (123 files, 129 verbs
verified), test/docs-truthfulness.test.js 4/0, r1-r4 fixtures clean,
syntax OK. lint:docs now runs 5 gates.

## Session (2026-10-12 — pass 212: #193 round-3 sweep closed + EW2 pin + R4-F6)

**Owner: "let's hit more issues, this will be epic."**

Round 3 (#193) findings closed with live probes (R3-F1/F7/F8/F10 were
already receipts or done in pass 211):

- **R3-F4 examples.md:** the fabricated community showcase re-titled
  "Ideas for Projects" (no invented attribution, headings h2, submit
  link pointed at the real dhaupin/vant/issues - the old URL was dead).
- **R3-F2 settlement.md:** export-surface table now names the REAL
  lib surface (install/makeInvoice/sendInvoice/requestStatus/list/get/
  status) with an inline note that settle.request/settle.record are
  wire message names, not API exports.
- **R3-F3 network.md:** "Response caching" struck (verified no cache
  export in lib/network.js); circuit-breaking re-pointed to lib/qos.js
  where CircuitBreaker actually lives; bullets now name the real
  exports.
- **R3-F5 faq.md succession path:** corrected to the verified on-disk
  location (models/public/<brain>/_succession.json, public scope,
  per-brain - the doc said models/private/ for years).
- **R3-F6 memory list undercount:** root cause = the doc ("Read
  everything the brain holds: vant memory list") promised the wrong
  surface. vibe-coders.md now teaches the honest pair: `memory list`
  (engine stats) + `onboard files`/cat (actual brain docs). No lib
  change needed; probe confirmed learn-then-list still reports engine
  counters 0 as expected while the doc no longer promises they exist.
- **R3-F8 "500+" tests drift:** cli.md + bin/vant.js help now say the
  real count (~2,300 cases across /test).

- **R4-F6 (#194) clean.js cron fork removed:** the local
  parseCronToMs cron-expression parser ("0 3 * * *" → fuzzy ms) is gone;
  `vant clean --setup-cron` now uses cron's own interval grammar
  ("24h"/"1h") with an honest in-process/non-persisted note. Verified
  live: setup (4 jobs added), list, remove all exit 0.
- **EW2 pin landed (#190):** NEW test/leash-pin.test.js 6/6 - four
  static handler pins (uncaughtException/unhandledRejection/SIGTERM+
  SIGINT/forceReleaseBrainLock/double-exit guard) plus two LIVE-process
  probes: `vant all` booted for real, SIGTERM and SIGINT each answered
  by the leash (exit 0, leash line on stderr).

**Verification:** leash-pin 6/6, memory 19/19 (regression), syntax OK,
docs frontmatter 122 PASS, style 122 PASS, language gate 194 PASS.

## Session (2026-10-12 — pass 211: parity sweep r2-r4 + EW pins)

**Owner: "record gaps/suggestions, solve them, then hit next triage."**

Closed from the issue queue (#190/#192/#193/#194) with live probes:

- **#192 R2-F2 geometry round-trip FIXED:** storage write path had the
  raw-category vs sanitized-path asymmetry AND a TDZ regression from the
  fix attempt itself (`filePath` referenced before init). Verified:
  store→retrieve via CLI, cross-process memory.query, brain.load all
  round-trip; suites green (storage 40, brain 77, memory 19,
  brain-storage-strict 14).
- **#190 EW shore:** EW1 MCP 1MB body cap + JSON-RPC 413 + 400-on-bad-JSON
  (pinned in test/mcp.test.js 8/8 with real HTTP against the door);
  EW2 crash/SIGTERM leash (bin/vant.js); EW3 setMaxListeners (lib/event);
  EW5 ANTHROPIC_API_KEY retired from transport auth LIB/config.js
  (pinned in test/config.test.js 22/22); EW6 crew-bus secretless refuse;
  EW7 auth ring-trim.
- **#194 R4-F1 cron CLI verbs:** bin/cron.js was SyntaxError-dead at HEAD
  (broken template literal) AND sold phantom add/remove verbs. lib/cron
  gained add(spec,cmd)/remove(id) with interval specs (30s/10m/2h/ms);
  add is now HOURLY-honest: prints "scheduled in this process - not
  persisted," and list/status show it. Fixed live: add→status→remove
  round-trip 3/3.
- **#194 R4-F2 clean verbs:** logFile orphan + sandbox self-grant parity
  with vant snapshot. EVERY verb now exits 0 live (dry-run/logs/tmp/
  cache/prune/all).
- **#194 R4-F3 onboard grammar:** docs' 8 dead variants (onboard N,
  onboard name, --search, --context, --preview, --recent) swept out of
  docs/essential/onboard.md; page now teaches the verified verb set
  (status/wake/summary/files/read/search/system/help).
- **#194 R4-F5 version wording:** "≥0.9 / pre-0.9" fiction swept from six
  pages (setup, migration, getting-started index, architecture, README);
  canonical phrasing = "the axolotl line (first shipped in v0.8.6-axolotl)".
- **#192/#191 docs fiction:** Linear integration page rewritten as an
  honest status page (probe: islands.load('linear')→null, no client);
  cron.md self-contradiction fixed (interval-only + event-hook relabel);
  mcp-tools.md registry recount 299→324 via live mcp.listTools().

**Gaps/suggestions recorded (not solved this pass):**
- EW2/EW4/EW7 pin debt CLEARED by pass 226: EW2 leash pin
  (test/leash-pin.test.js, pass 212), EW4 per-client door budget
  (pass 222), and EW7 lockout ring-trim now has 3 hermetic pins in
  test/auth.test.js (23/0) - pin EW7b caught + fixed a real trim bug in
  the same pass: the cap-trim sorted zero-lockout ACTIVE streaks first
  and evicted exactly the identity the process was counting; the guard
  now protects never-locked (lockoutUntil === 0) records while junk -
  constructor-loaded included - still trims to the cap.
- #193 leftovers: examples.md fictional projects + dead link,
  settlement/network export drift, memory list undercount.
- R4-F4 auth login wording (marginal honesty) - fold into #186-R1.
- bin/clean.js still ships local parseCronToMs accepting cron strings
  (R4-F6) - harmless now but should move to cron's interval grammar.

**Verification:** config 22/22 (2 new EW5 pins), mcp 8/8 (2 new EW1
live-HTTP pins), docs frontmatter 122 PASS, docs style 122 PASS,
language gate 194 PASS, docs.test 6/6, cron 14/14, door pins 28+1, CLI
contract pins 9/9, runner 39.

## Session (2026-10-10 — pass 201: Wave U6 marketplace prototype)

**What shipped** (owner: "u5 next! then right to u6"):

- **U6.1 PROTOTYPE DOC (`labs/prototype-marketplace.md`):** listing
  schema (text|code; 'launch' refused at listing time — documented
  boundary), reputation over the trust feed, escrow hold→deliver→
  release delivery contract, failure-mode table (each row = a state
  or a typed refusal).
- **U6.2 GATED SURFACE (`lib/market.js`):** `listSkill/buySkill/
  deliverSkill/settleSkill/skillStatus` behind `market.skillsEnabled`
  (OFF default; typed `E_SKILLS_DISABLED` while off — inert, not
  absent). Debit ONLY on buyer confirm; refute refunds + negative
  trust; delivery hashes with lib/hash.js (one hash source).
- **U6.3 TRUST FEED:** records key to the LISTING's seller (suite
  caught market.trade stamping `seller: anonymous` — the listing is
  the authoritative who-made-it).
- **U6.4 PINS:** `test/market-skills.test.js` 8/8 (gate-inert,
  boundaries, debit-only-on-confirm, trust up AND down,
  double-settlement, scoping, payload refusals, refute path).
  Regression: market/crossprocess/debit/trust suites green.
- **Suite-caught fixes en route:** (1) const-order (skills block was
  landed past `module.exports` — TDZ `SKILLS_ENABLED_KEY`); (2)
  `market.list` returns the listing itself (shape); (3) `_persistNow`
  is a module-exports seam, module-level fn is `_persist`; (4) trade
  rows carry buyer as `buyer`; (5) seller identity must ride the
  listing (data.seller), not the trade row.

## Session (2026-10-10 — pass 200: Wave U5 provenance/compliance bundle)

**What shipped** (owner: "u5 next! then right to u6"):

- **U5.1 BUNDLE ASSEMBLY (`lib/export-bundle.js` + `bin/export.js`,
  dispatcher-routed):** `vant export bundle --out <dir>` writes
  manifest.json (registry export), citations.json, audit-excerpt.json
  (scoped), horcrux.svg (ENCRYPTED through the production
  transform.toHorcrux pipeline), content-manifest.json (L-hash chain),
  bundle.json (the handle naming the terminal digest). The L-hash is a
  RUNNING list (entry i folds i-1's digest) — byte change, delete,
  insert, or reorder breaks the tip.
- **U5.2 FAIL-CLOSED VERIFY:** recompute per-entry hashes + chain links
  + terminal digest + bundle.json from the ACTUAL bytes; extra/missing
  files are tamper, unreadable is E_BUNDLE_DENIED (denied ≠ absent);
  typed codes everywhere. Rerooting attacks caught at the bundle.json
  door; full re-forges are tamper-EVIDENCE not trust ROOT (noted
  honestly in-suite: the root is the horcrux password + external
  anchoring).
- **U5.3 PINS:** `test/export-bundle.test.js` 11/11 (roundtrip, six
  tamper negatives, typed password/absolute-path refusals). CLI
  coverage 124 → 125; grand-tour/lint:coverage/fiction/frontmatter all
  PASS; both verbs live-fired (bundle digest b6f5397…, verify ✓).
- Real-world trap en route: transform.toHorcrux re-vaf-validates its
  sink path and BLOCKS absolute /home/… residency paths — the exporter
  now requires repo-relative `--out` (typed `E_BUNDLE_OUT`), which is
  also the honest product posture (export artifacts live in the repo).

## Session (2026-10-10 — pass 199: Wave U4 deliberation→decision records)

**What shipped** (owner: "let's do u4 pls"):

- **U4.1 THREAD LINKAGE:** `forum.vote(proposal, { thread })` now
  durably links a publication barcode to its consensus topic in
  `state/forum-threads.json` (arch-A store, WAL included, FIFO cap
  500). The pass-43/44 decision return path reads the durable link
  FIRST — a decision record CARRIES its thread even when the tally
  happens in a fresh process (the old `_openVotes` map is memory-only
  and dies with the process; only the disk keeps the pairing).
- **U4.2 DECISION TRAIL READER:** `threadDecisionTrail(barcode)` —
  the linked consensus ledger (status/ballot/per-voter outcomes), the
  escrow hold touched under `forum:<topic>` (present while held, empty
  after release), and the persisted decision record. Unlinked thread
  refuses typed `E_FORUM_ABSENT`. CLI: `vant forum decisions <barcode>`
  (+ `--json`) and `vant forum links`; exit 0/1 verified live.
- **MCP +2:** `forum_decisions`, `forum_thread_links` (311 tools); `forum_vote`
  gains `thread`; all four live-fired through mcp.execute.
- **U4.3 PINS:** persistence suite 4 → 9 (link on disk,
  decision-carries-thread roundtrip, NO-ORPHANS-after-restart, typed
  absent, FIFO cap, clearState ops-parity). Grand-tour gate B 309 →
  311, 18/18. Suite caught one real shape bug en route: the Wave U4
  functions were module-level only — `f.listThreadLinks is not a
  function` on the singleton — fixed with singleton passthroughs
  (operators reach everything through the forum instance).

## Session (2026-10-10 — pass 198: post-merge audit — pool-debit bug fixed)

**What shipped** (owner: "commit then look for bugs, stuff we missed,
stuff that isn't wired in the first 3 u passes"):

- **Committed Wave U1–U3 as `9738019`** (70 files, 6708 insertions).
- **AUDIT of all three U passes** — surfaces cross-checked against code
  (escrow helpers, agents spawn/delegate/flush, consensus create/vote/
  tally async contract, rules allowlist, MCP registration incl.
  consensus-type fields, docs coverage gates). One real bug found.
- **POOL-DEBIT BUG (fixed + pinned):** `runScenarioTask`'s escrow gate
  never debited the shared pool — `hold()` is an audit row, not a
  debit, so three successful tasks left the pool at 100/100 while the
  PRD claimed "the budget is the REAL gate". Fix: convert the hold into
  a workspace-charged `Escrow.recordSpend` (draw check now through a
  fresh disk-coherent instance so the `{ orgLimit }` one-shot cap
  survives — the `workspaceCanSpend` helper drops it); every refusal
  path (delegate/consensus/no-quorum) refunds member + pool rows; a
  completed task STAYS charged. Live-verified through the real store:
  100 → 70 → 40, over-budget draw refuses`E_SCENARIO_BUDGET` charged-
  nothing, refund intact. Pins: makeStubs gains an Escrow class stub
  (canSpend/recordSpend/refund) + 2 debit-contract pins (suite 8 → 10).
- **Exit-code check:** `vant scenario task --cost 500` correctly exits
  1 (earlier 0 was a `| tail` pipeline masking PIPESTATUS, not a bug).

## Session (2026-10-10 — pass 197: Wave U3 governance scenario playbook + resume materialization)

**What shipped** (owner: "U3 — governance scenario playbook (escrow
gating a shared task) plus resume's byte-restoring materialization"):

- **WAVE U3 — GOVERNANCE SCENARIO PLAYBOOK:** `lib/scenario.js` +
  `bin/scenario.js` demo the product over the EXISTING consensus/escrow
  stack — a scenario crew of N agents draws from ONE shared escrow
  workspace pool (`ensureWorkspaceBudget` sizes it idempotently, never
  refills), and each delegated task must pass three real gates:
  (1) QUARANTINE — refuse fail-closed BEFORE any escrow draw, refusal
  recorded in the verdict; full-quarantine crews can't delegate at all;
  (2) ESCROW — the shared pool is charged per-task (hold released on
  refusal; empty pool → `E_SCENARIO_BUDGET`); (3) CONSENSUS — the
  verdict is a VOTED outcome requiring quorum (`minQuorum = max(2,
  live voters)`), single-agent bless refused
  (`E_SCENARIO_NO_QUORUM`), decision logged via `resolution.logDelta`
  (persisted, survives restart).
- **U3 CARRY-OVER (U2.3's honest-scope note closed):** resume's
  escrow-backed BYTE-RESTORING executor landed. `record --values`
  freezes cell VALUES inside the manifest (id covers them — content-
  addressing bites), `resume --materialize` restores them through the
  arch-A store billed 1 escrow credit/cell under
  `scenario:materialize:<actor>`; a broke actor is refused typed
  (`E_SNAPSHOT_BUDGET`) BEFORE any write, and a store-write denial
  refunds.
- **CLI:** `vant scenario crew <name> --agents N --budget N`,
  `vant scenario task <crew> <desc> [--cost N]`,
  `vant scenario status <crew>` (+ `--json` per verb; live-fired).
- **MCP +3:** `vant_scenario_crew/_task/_status` (309 tools) —
  live-fired through mcp.execute incl. rules + sandbox doors; rules
  SAFE_TOOL_ALLOWLIST extended for the three names.
- **Docs:** `docs/operations/scenario-playbook.md` (flow diagram, gate
  table, pin map); cli.md rows + usage block; mcp-tools.md full pages
  for the three tools + the U3 materialize note on `vant_universe_resume`.
- **Verified:** `test/scenario-crew.test.js` **8/0** (typed gates,
  gate-order, quarantine drills, no-single-bless, rules door);
  scenario-manifest suite extended 18 → 22 (materialize pins); U1 suite
  11/0; grand tour 18/18 with gate B bumped 306 → 309;
  `npm run lint:coverage` PASS (MCP 309/309, CLI 119+5 = 124);
  fiction-signatures PASS; frontmatter PASS; full CI green.

---

## Session (2026-10-09 — pass 177: state-store → StateAnchor, §3 debt closed)

**What shipped** (owner: "What's left in wiring? … yeah we can do §3 debt:
state-store could still anchor root hashes per persist"):

- **STATE-STORE → STATE-ANCHOR (§3 DEBT CLOSED):** every tree-tier
  persist/persistMerged now ANCHORS the root hash into the brain's
  per-file StateAnchor ledger (#152): `models/private/<brain>/
  .state-anchor.jsonl`, carrier = the state file, cause = the persist
  path (persist:<module> / persistMerged:<module>). A state write that
  bypassed the choke point (direct tampering, partial write) is now
  DETECTABLE against the last known-good root — not just against an
  in-process mirror that dies with the process.
- **Dedupe:** unchanged roots are NOT re-anchored — in-process cache
  first, then a ledger check for the fresh-process case. The chain is
  an event history, not a heartbeat log.
- **New surface:** `stateStore.anchorStateRoot(file, root, cause)`,
  `stateStore.verifyStateRoot(file)` (typed verdict: ABSENT /
  PRESENT-anchored ok|diverged / PRESENT-unanchored),
  `stateStore.lastAnchorFor(file)`. New event: `state:anchored`.
- **Hydrate deliberately does NOT anchor:** a restart must not re-bless
  whatever happens to be on disk — otherwise the tripwire launders its
  own divergences. Pinned.
- **Bug fix (pass 176 leftover):** BrainVerifier.verify() returned
  `lastAnchored` as a bare hex STRING while bin/horcrux.js read entry
  fields off it (`v.lastAnchored.timestamp`) — "Invalid time value"
  on every SUCCESSFUL `vant horcrux verify`. Contract unified: all
  three verifiers (StateAnchor / BrainVerifier / verifyStateRoot) now
  return the anchor ENTRY. Caught by hand-running the CLI after the
  suite, not by the suite — the exit-code pin only checked codes, and
  exit 0 masked the stdout crash. Pin note for the future: assert on
  the success-path OUTPUT too when the contract is a printout.

**Pin suite:** `test/state-wiring.test.js` extended with STATE-STORE →
ANCHOR (5): ledger append per persist, in-process + ledger dedupe,
tamper detection, no-tree/hydrate-never-anchors, persistMerged path.
**51/51**, stable across consecutive runs (ledger is append-only and
shared across runs — assertions use per-carrier deltas + unique fresh
file names, not absolute counts).

**Next:** #122–#144 husks; hotset/fold/precision ORPHANs await
consumers; per-brain `universeSeed` config still has no writer (by
resolved #158 design).

---

## Session (2026-10-08 — pass 176: geometry → encoder, mesh → events, brain-verify → surfaces)

**What shipped** (owner: "quasicrystal.js storage still has its own
hashing... MeshTree mutations still don't emit bus events... Next payoff
step: BrainVerifier onto vant health + horcrux CLI"):

- **QUASICRYSTAL → CANONICAL ENCODER (step ⑤ COMPLETE):**
  `generateBarcodeFromContent` rides the #146 canonical encoder — same
  logical content → same barcode regardless of key order/process. The
  LAST un-spined hash chain in the repo is retired; the #165 thesis
  ("no second hash chain") is complete. Storage stays self-
  authenticating (recovery recomputes from the barcode, never content),
  so existing records stay reachable; only new barcode generation
  changed.
- **MESH → BUS EVENTS (open-debt closure):** every MeshTree mutation
  emits — `mesh:register/heartbeat/aoi/write/write:rejected/recovered`
  — with actor + epoch provenance on each. `{ silent: true }` keeps
  probe trees side-effect-free; mesh-status passes it (a status probe
  is never a side effect).
- **BRAIN-VERIFY → SURFACES (step ⑥ COMPLETE):** `vant health` gains a
  🧬 Brain integrity section (recomputes the content root, verifies
  against the last anchor, auto-baselines fresh brains, never fails
  health over a probe error). `vant horcrux verify` / `vant horcrux
  anchor` expose the CI-safe exit-code contract (0 verified / 1
  diverged / 2 no anchor yet).

**Bugs the new pins caught (fixed at the cause):**

- **Cross-brain anchor contamination:** the anchor ledger resolved via
  `lock.pathFor` against the ACTIVE process brain — verifying brain X
  while running as brain Y compared X's root against Y's anchors. The
  ledger is now PER-BRAIN (`<brainDir>/.brain-anchor.jsonl`, inside the
  tree it defends; a state ledger, not a lock — lock-audit untouched).
- **Tripwire cried wolf:** the brain root covered `state/` (protocol
  state mutating on every persist), so an active brain diverged within
  minutes. `state/` is excluded — protocol state has its own tree-tier
  integrity story (rootHash on every event, WAL writes); the #166 tier
  now defends brain CONTENT (identity/lessons/learnings), which should
  never move without intent.
- **Syntax slip:** a doubled constructor brace in mesh.js (my own edit)
  — caught by the first pin run.

**Pin suite:** `test/state-wiring.test.js` extended with MESH →
EVENTS (3), GEOMETRY → SPINE (2), BRAIN-VERIFY → SURFACES (2, incl. a
real CLI subprocess pin of the horcrux exit-code contract). **46/46.**

**Verification:** state-wiring 46/46; engine-parity-spine 70/70;
mesh-status 7/7; backbone-wiring 11/11; atomic-writes 13/13;
no-legacy-bloat 13/13; geometry-engine 1/1; state-persistence 8/8;
tombstones 2/2; reap-crossprocess 6/6; audit-locks gate PASS.

**Next:** #122–#144 husks; state-store root-hash anchoring per persist → DONE pass 177 (see top session)
(the remaining §3 debt); optional: emit tree-tier rootHash on mesh
persistence events too.

---

## Session (2026-10-08 — pass 175: mesh → WAL + geometry → spine/cellstore)

**What shipped** (owner: "MeshTree is still in-memory — mesh deltas →
checkpoint/WAL is the next payoff step... And keep moving through wiring
the other stuff"):

- **MESH → CHECKPOINT/WAL (payoff step ④):** `MeshTree` gains opt-in
  `{ dir }` persistence — every delta (register, heartbeat, aoi
  subscribe, accepted AND rejected writes) rides the #151 SnapshottedLog:
  append-only wal.log + content-addressed snapshots every N records,
  bounded history, bounded recovery (latest snapshot + replay after it).
  In-memory remains the DEFAULT (zero side effects for probes/tests).
  A fresh MeshTree over the same dir reconstructs the same root hash —
  same-mesh-across-restarts is one string comparison. Rejected writes
  are DURABLE now: the gaslight-proof record survives a crash. #163
  honored (unreadable log = DENIED, never silently empty).
- **DELTA → MESH (#161 wired):** every mesh delta is provenance-stamped
  through DeltaLedger; `DeltaLedger` gained an injectable per-record
  clock + epoch override so replay determinism holds (two ledgers that
  saw the same events under the same clock agree on one ledgerHash).
- **GEOMETRY → PRF (payoff step ⑤, half):** `fragmenter.deriveLatticeKeys`
  now delegates to `lattice-keys.deriveShardKeys` — the LAST live
  Math.imul chain in the repo is retired (#155). The live consumer
  (lib/adapters/github-fragmenter.js → GitHub dead-drop) gets PRF keys
  with zero API change. Legacy imul survives only as the tested shim.
- **RAID → CELLSTORE (#150 wired):** `raid.fragment({ cellStore })`
  claims every shard cell under the spine's ONE `/raid/<doc>` space
  (AddressingSpine + the ONE PRF, per-shard index). Identical shard
  content across documents stores ONCE — the #150 rebate fires and is
  MEASURED via savings_ratio, not assumed.

**Pin suites:**

- `test/state-wiring.test.js` extended with a MESH → CHECKPOINT/WAL
  section (6 new pins): in-memory default unchanged, wal.log + snapshot
  files created, same-root-hash recovery across a fresh instance,
  rejected writes survive restart, #161 provenance on every delta with
  deterministic ledgerHash, interval snapshot fast-forwards bounded
  recovery. **39/39.**
- `test/engine-parity-spine.test.js` extended with 4 geometry pins
  (#155 fragmenter + adapter on the PRF, #150 RAID cell claims + rebate
  measured, #165 per-shard PRF addressing). **70/70.**

**Verification:** state-wiring 39/39; engine-parity-spine 70/70;
atomic-writes 13/13 (structural gates over the edited fragmenter);
mesh-status 7/7; backbone-wiring 11/11; no-legacy-bloat 13/13;
geometry-engine 1/1; state-persistence 8/8;
state-store-tombstones 2/2; consensus-reap-crossprocess 6/6.

**Mid-pass catches (fixed, not suppressed):** the delta ledger's default
wall-clock epoch made ledgerHash non-deterministic across replay (pin
catch #1) and re-reading the shared fixed clock double-advanced it (pin
catch #2) — fixed with DeltaLedger's injectable clock + event-epoch
override, assertions untouched.

**Next:** quasicrystal.js storage onto the spine/cellstore (the last
bespoke geometry hash); BrainVerifier onto `vant health` + horcrux CLI;
#122–#144 husks.

---

## Session (2026-10-08 — pass 174: consensus + market → tree tier)

**What shipped** (owner: "let's keep going"):

- **CONSENSUS → TREE (third live consumer, step ③):** vote ledgers +
  reap tombstones mirror into one StateTree on hydrate and every
  merged persist; rootHash rides state:saved + audit. Cross-process
  "same vote ledgers?" is one string comparison — the vote-verification
  story now has a hash, not just a file.
- **MARKET → TREE (fourth live consumer, step ③):** listings / bids /
  trades mirror the same way; the scarcity/trade state gets the same
  cross-process same-state answer. clearState drops the mirror +
  search index.
- Together with trust (172) and node-registry (173), the entire
  protocol-state layer is now on the tree tier. WIRING.md payoff step
  ①–③ complete; remaining order: mesh deltas → checkpoint/WAL,
  geometry → spine/cellstore, BrainVerifier onto health/horcrux.

**Pin suite:** `test/state-wiring.test.js` extended with a
CONSENSUS + MARKET → TREE section (6 new pins): create/list mirror
through persistMerged with rootHash on the event, ledger/listing present
in the mirrored tree, disk view === live mirror for both (async lock
handshake flushed), clearState resets incl. tombstone maps. 33/33.

**Verification:** state-wiring 33/33; consensus, market, trust,
state-persistence 8/8, state-store-crossprocess 5/5,
state-store-tombstones 2/2, backbone-wiring 11/11, mesh-status 7/7,
agora-sync, engine-parity-spine 66/66; audit-locks gate PASS.

**Next:** mesh deltas → checkpoint/WAL (MeshTree crash-safe); geometry
→ spine/cellstore; BrainVerifier onto `vant health` + horcrux CLI;
#122–#144 husks.

---

## Session (2026-10-08 — pass 173: node-registry → tree tier)

**What shipped** (owner: "let's keep wiring pls"):

- **STATE-STORE: persistMerged gains `tree` support** — the merged
  snapshot mirrors into the caller's StateTree INSIDE the lock, root
  hash rides `state:saved` + audit, same contract as `persist()`. One
  wiring shape across both write paths.
- **NODE-REGISTRY → TREE (second live consumer, step ②):** the peer
  table (consensus's vote-verification anchor) mirrors into one
  StateTree on hydrate and on every merged persist. Cross-process
  "same peer table?" is one string comparison. New seams:
  `_treeRoot()`, `_stateTree()`; `clearState` drops the mirror while
  preserving the pass-98 tombstone semantics.

**Pin suite:** `test/state-wiring.test.js` extended with a
NODE-REGISTRY → TREE section (4 new pins): register mirrors through
persistMerged with rootHash on the event, heartbeat moves the root,
disk view === live mirror, clearState resets + tombstones hold. 27/27.

**Verification:** state-wiring 27/27; trust, state-persistence 8/8,
state-store-crossprocess 5/5, state-store-tombstones 2/2,
backbone-wiring 11/11, mesh-status 7/7, engine-parity-spine 66/66;
audit-locks gate PASS.

**Next:** consensus/market onto the tree tier; mesh deltas →
checkpoint/WAL; geometry → spine/cellstore; BrainVerifier onto
`vant health` + horcrux CLI; #122–#144 husks.

---

## Session (2026-10-08 — pass 172: trust → tree tier)

**What shipped** (owner: "we Def want shared universe seeds" + "let's
start wiring first consumers pls"):

- **#158 UNIVERSE DECISION RESOLVED:** fixed default stands (mesh is the
  whole point — cross-install determinism IS the feature);
  `VANT_UNIVERSE_SEED` is the sharding lever; per-brain `universeSeed`
  stays the durable override. Marked RESOLVED in labs/WIRING.md §3 + §6.
  Nothing depreciates: all content-addressed layers (factHash, tree
  roots, delta ledgerHash, authority hashes) are universe-independent;
  only PRF-derived addressing (region seedScope, cell addresses) moves
  with the constant, and the default never moves.
- **TRUST → TREE (first live consumer, WIRING.md step ① done):**
  `lib/trust.js` hydrates + persists through the state-store tree tier —
  the ledger mirrors into one StateTree; the root hash rides the
  `state:saved`/`state:hydrated` events and the audit entry, so
  cross-process "same trust ledger?" is one string comparison.
  Content lives where it always did (`state/trust.json`); the tree is a
  mirror, not a second source of truth. New seams: `_treeRoot()`,
  `_stateTree()`; `clearState` drops the mirror (no hash for state that
  no longer exists).
- **Search hygiene:** `package-lock.json` added to `.ignore` — it was
  clogging every broad ripgrep with dependency-metadata noise.

**Pin suite:** `test/state-wiring.test.js` extended with a TRUST → TREE
section (5 new pins): mirror populates on record, root moves on mutate,
disk view (treeFor) === live mirror root, rootHash rides state:saved,
clearState resets. 23/23.

**Verification:** state-wiring 23/23; trust 8/8; state-persistence
8/8; state-store-crossprocess 5/5; state-store-tombstones 2/2;
backbone-wiring 11/11; mesh-status 7/7; engine-parity-spine 66/66;
audit-locks gate PASS.

**Next:** node-registry → tree tier (step ②), then consensus/market;
mesh deltas → checkpoint/WAL; geometry → spine/cellstore; BrainVerifier
onto `vant health` + horcrux CLI; #122–#144 husks.

---

## Session (2026-10-08 — pass 171: consumer wiring)

**What shipped** (owner: "let's finish out everything. Nothing is off
limits" + "assemble a list of shit to wire back up"):

- **SEEDS → MESH (#158 → mesh):** `MeshTree` now owns an
  `AddressingSpine` (#165) by default — region identity (`seedScope`),
  cell addressing (`cellAddress`), and writer authority all ride the ONE
  seed chain and the ONE canonical encoder. `VANT_UNIVERSE_SEED` env (or
  per-brain `universeSeed` config, or explicit universe) now actually
  shards mesh addressing; the ad-hoc `node + '|' + JSON.stringify` hash
  chain is retired.
- **STATE-STORE → TREE (opt-in tier):** `toTree`/`fromTree`/`treeFor`
  plus `tree` options on `persist`/`hydrate`. Root hashes ride the
  `state:saved`/`state:hydrated` events and the audit entries. Metadata
  excluded; roundtrip law pinned.
- **MESH-STATUS → MESHTREE:** new `mesh` section — registry peers
  projected onto tree paths, presence as the pure TTL read (#164), the
  region's seed scope visible (proof the env flows). Read-only,
  degraded-not-dead, JSON-safe.
- **labs/WIRING.md:** the wiring-debt ledger — every state/seed/errors/
  events/audit/WAL surface marked WIRED / OPT-IN / ORPHAN / GAP, plus
  "where the spine got large" (6 of 13 state modules + 4 of 12 geometry
  modules are orphans) and the highest-payoff wiring order.

**Pin suite:** `test/state-wiring.test.js` — 18 assertions, one per
acceptance criterion. 18/18.

**Gate teeth:** the pass-169 raw-throw gate caught a `throw new Error`
in the new mesh-status section within one run — converted to coded
VantError (INPUT_VALIDATION_FAILED).

**Verification:** state-wiring 18/18; engine-parity-spine 66/66;
mesh-status 7/7; backbone-wiring 11/11; state-store-crossprocess 5/5;
state-store-tombstones 2/2; state-persistence 8/8; horcrux-orgchart,
lock-failclosed, save-refusal-parity all exit 0; audit-locks gate PASS.

**Next:** wire a real consumer onto the tree tier (trust or
node-registry); mesh deltas → checkpoint/WAL; geometry → spine/cellstore;
BrainVerifier onto `vant health` + horcrux CLI; #122–#144 husks. The
#158 universe decision (fixed default vs per-install seed) is still the
owner's call — recommendation in labs/WIRING.md §6.

---
