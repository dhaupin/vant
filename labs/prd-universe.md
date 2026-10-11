# Vant Universe & Scenario Kit — Product Requirements Document

**Version:** 1.0
**Branch:** axolotl
**Date:** 2026-10-10
**Status:** ACTIVE — Waves U1–U3 shipped (pass 197: U1 Genesis
Snapshots + U2 Stored Content-Addressed Scenario Manifests + U3
Governance Scenario Playbook incl. resume's byte-restoring executor;
CI green, MCP 309, grand-tour 18/18). Waves U4–U6 sequenced but not
started.
**Cadence note (owner correction):** the crew completes multiple passes
per day, so all effort estimates here are in **passes**, not weeks. A
"pass" = one landed, suite-pinned CI-green change (the TASKS.md unit).

---

## 1. Overview

Vant's state engine is real: SeedChain (#158) derives deterministic
per-path seeds from one universe constant; AddressingSpine (#165) makes
one namespace (`/world/`, `/mesh/`, `/raid/`) share the same PRF and
canonical hash; SnapshottedLog (#151) content-addresses state
checkpoints; HotSet (#153) bounds the hot read path; the WAL + snapshot
interplay makes recovery mechanical. What is missing is the **product
surface**: nothing lets an operator name a state, fork it, diff it,
resume it, or hand it to another agent as a shareable artifact.

This PRD is that surface. Vision pillar it serves (prd-whitepaper §3.1):
*stateful persistence of "who am I" — a scenario agent that can re-enter
the exact world state it left.*

### One sentence per tier

- **U1 — Genesis Snapshots (PASS-derived, deterministic):** a filename
  → derived seed → cellbarcodes → state root fingerprint; fork is a
  new file name on the same universe constant. Engine: `state/seeds.
  js`. No store write.
- **U2 — Checkpoint Scenario Records (STORED, content-addressed):** a
  snapshot manifest of cell hashes + cellbarcodes, content-addressed
  via `checkpoint.js`, diffable/resumable across sessions. Engine:
  `state/cellstore.js` + `state/checkpoint.js`.- **U3 — Governance Playbook (shared-budget scenario crew):** an
  untrusted multi-agent scenario with escrow + consensus as the real
  gate; engine: `consensus.js` + `escrow.js`. SHIPPED (pass 197).
  U2's build-roadmap note: U3's escrow-backed scenario executor
  delivers resume's byte-restoring materialization.
- **U4 — Deliberation→Decision Records:** forum threads linked to
  consensus outcomes as first-class, auditable decision artifacts.
- **U5 — Provenance/Compliance Bundle:** citations + audit ledger +
  horcrux + document manifest exported as one tamper-evident package.
- **U6 — Credentialed Marketplace:** skill/tool listings with escrow-
  guaranteed delivery; the research frontier — scoped into labs/
  prototypes before productizing.

### What is already real (pinned, no rebuild needed)

| Piece | Lives in | Pinned by |
|---|---|---|
| Universe seed → per-path seeds | `lib/state/seeds.js` (SeedChain) | engine-parity suites |
| Space grammar + one hashing | `lib/state/spine.js` (AddressingSpine) | engine-parity suites |
| Content-addressed checkpoints | `lib/state/checkpoint.js` (SnapshottedLog) | engine-parity suites |
| Bounded hot reads | `lib/state/hotset.js` | engine-parity suites |
| Cell store | `lib/state/cellstore.js` | engine-parity suites |
| WAL + atomic writes + anchors | `lib/wal.js`, `lib/state/anchor.js`, `lib/state-store.js` | state-wiring suite |
| Consensus (create/vote/tally) | `lib/consensus.js` | governance suite |
| Escrow (hold/check/canProceed) | `lib/escrow.js` | escrow suite |
| Forum w/ escrow gates | `lib/forum.js` | forum-msg-escrow suite |
| Agent roster + work delegation | `lib/agents/core.js` | agents suite |
| Citation ledger | `lib/citations.js` | citations suite |
| Horcrux (sealed/encrypted export) | `lib/horcrux.js` | horcrux suite |

## 2. Design decisions (approved by the host org, 2026-10-10)

1. **Use the SeedChain, do not invent a second genesis format.** A
   universe snapshot is a *derived fact about the universe constant*,
   not a new file format to maintain.
2. **Fork = filename.** Forking a world is picking a new name — no
   migration, no format change, no lock-in.
3. **Store writes only in U2+.** U1 is PASS-derived (cheap, no data at
   risk, no store churn); U2 adds the store-backed manifest.
4. **One wave = one landed, measured, pinned improvement** (stego-pass
   pattern): single-pass scoped, suite-pinned, no broken read paths.
5. **No test-only public APIs** (axolotl rule). Everything surfaces via
   `lib/state/genesis-snapshot.js` and `bin/universe.js` CLI.
6. **Cadence is per-day.** "A week" is a banned unit; estimates are
   pass-counts and shrink further once the first wave pins the
   scaffold. The pass-record backs this up (multiple passes/day cadence
   documented across 195+ passes).

## 3. Waves & checklists (TASKS.md-compatible: `- [ ]` = open, `- [x]` = shipped with pass note)

### Wave U1 — Genesis Snapshots (PASS-derived) — SHIPPED pass 197
Estimate was: **2 passes** — landed in ONE pass. No store writes;
everything is derived deterministically.

- [x] U1.1 `lib/state/genesis-snapshot.js` — `genesisSnapshot({name,
  universe})` → `{ name, spaceId, scopePath, seed, cells[5],
  fingerprint }`; `forkSnapshot({parent, child, universe})` prefix-
  folds via seeds.deriveChild; typed errors `E_SNAPSHOT_NAME` /
  `E_SNAPSHOT_UNIVERSE`; name grammar rides the spine's own
  SPACE_CONSUMERS.world (no second validator).
- [x] U1.2 Pin suite `test/genesis-snapshot.test.js` — 11 pins:
  byte-identical determinism, fresh-process agreement, fork depth-1
  and depth-2 divergence from direct derivation, universe
  sensitivity, 5-cell contract, hostile names/universes/children
  fail closed typed, spaceId namespace consumability.
- [x] U1.3 `bin/universe.js` CLI + dispatcher route: `vant universe
  snapshot <name> [--json]`, `vant universe fork <parent> <child>
  [--json]`, `vant universe status [--json]`, `--universe <seed>`
  flag. Exit contract 0 ok / 1 typed lib error / 2 usage. Live-fired
  (all verbs + hostile path → SECURITY_PATH_TRAVERSAL catch before
  the grammar gate).
- [x] U1.4 Docs: `docs/reference/cli.md` universe rows + usage block;
  CLI coverage gate 118+5 = 123 PASS. (Essential/reference
  full pages deferred to the U2 docs wave — the coverage gates and
  AGENTS-style surface are served now.)
- [x] U1.5 MCP: `vant_universe_snapshot`, `vant_universe_fork`,
  `vant_universe_status` (all live-fired through mcp.execute;
  snapshot + status return ok:true, fork-with-missing-child
  returns the honest typed refusal). Catalog documented in
  `docs/reference/mcp-tools.md`; gate 303/303 PASS. Known quirk
  (noted, not ours to bend): `lib/rules.js` default-deny blocklist
  matches the substring `fork` in ANY tool name —
  `vant_universe_fork` is refused at the rules door with
  `Default deny: dangerous operation`. A rules allowlist entry is
  the clean fix (U2 opener; the CLI path is unaffected).
- [x] U1.6 Grand-tour gate B updated 300 → 303 and re-run 18/18;
  full CI 455/0.

### Wave U2 — Checkpoint Scenario Records (STORED)
Estimate: **3–4 passes.** Builds on U1's scaffold. **Landed in one
pass (pass 197), same shape as U1.**

- [x] U2.1 `recordSnapshot({...})` — wraps U1 output in a
  content-addressed manifest (cells array + frozen stateRoot + a
  universe-canary identity tag), persisted through the ONE arch-A
  protocol-state store (`state/universe-manifests.json`, WAL included).
  The manifestId IS the canonical hash of the payload — deterministic,
  no timestamp/uuid — so a re-record is a dedup no-op. (The PRD's
  "stored via SnapshottedLog contract" is honored in spirit, routed
  past that class: the arch-A state store is the brain's own
  checkpoint infrastructure, same WAL+durable-write rules, no second
  snapshot file format.)
- [x] U2.2 `vant universe diff <a> <b>` — two manifests, per-cell delta
  + state-root crosscheck. Same-universe contract enforced by a canary
  identity tag recorded into every manifest; different universes and
  different worlds refuse typed (`E_SNAPSHOT_UNIVERSE` /
  `E_SNAPSHOT_WORLD_MISMATCH`), never noisy all-cells output.
- [x] U2.3 `vant universe resume <name>` — resume marker written via
  `stateStore.persistMerged`: brain-root lock fail-closed (a peer
  holding the region → REFUSED, `E_STATE_LOCKED`, never an unlocked
  write), WAL-backed, cross-process merge adopted. **Honest scope
  note:** the manifest freezes derived positions + a state ROOT, not
  the live payload — U2 ships the verified-marker path; byte-
  restoring materialization deliberately lands with U3's escrow-backed
  scenario executor.
- [x] U2.4 Cross-process pin: two fresh `node test/scenario-
  manifest.test.js` child processes record the same content → the
  suite asserts byte-identical manifestIds (18 pins, 0 fail).
- [x] U2.5 MCP: `vant_universe_record/_diff/_resume` (full set, live-fired
  through `mcp.execute` incl. the rules door after the U2-opener fix).
- [x] U2.6 (opener, from U1's honest limitation) rules.js default-deny
  no longer substring-matches `fork` across tool names: exact-name
  `SAFE_TOOL_ALLOWLIST` for the six vetted universe tools; custom rules
  and dangerous-substring denials unchanged (pinned).

### Wave U3 — Governance Scenario Playbook — SHIPPED (pass 197, one
pass like U1/U2)
Estimate was: **4–6 passes.** Demo product over existing
consensus/escrow. Landed in one pass (+ the U2.3 carry-over: resume's
escrow-backed byte-restoring materialization).

- [x] U3.1 `bin/scenario.js` — `vant scenario crew <name> --agents N
  --budget N`, `vant scenario task <crew> <desc> [--cost N]`, `vant
  scenario status <crew>` — engine `lib/scenario.js`: a crew spawns over
  ONE shared escrow workspace pool (`ensureWorkspaceBudget` sizes it
  idempotently, never refills), the delegated task runs end-to-end with
  escrow as the REAL gate (hold taken then released; pool-capped cost).
- [x] U3.2 Quarantine drill pinned — a quarantined agent is refused
  BEFORE any escrow draw (gate order: full-quarantine crew →
  `E_SCENARIO_QUARANTINED`, escrow never touched); the refusal is
  recorded in the verdict (agentId + staging), and a crew where every
  member is quarantined cannot delegate at all.
- [x] U3.3 Consensus closeout — the task verdict is a VOTED outcome
  (quorum ballot complete/incomplete, `minQuorum = max(2, live
  voters)`): one remaining live voter can never pass
  (`E_SCENARIO_NO_QUORUM`), and the decision rides
  `resolution.logDelta` (persisted; held released on refusal).
- [x] U3.4 Playbook doc `docs/operations/scenario-playbook.md`
  (frontmatter-conformant, task flow diagram, gate table, pin map).
- [x] U3.5 Pin suite `test/scenario-crew.test.js` (8 pins: typed gates,
  gate-order, one-quarantined + all-quarantined drills, no-single-bless,
  rules door). U2 suite extended 18 → 22 for the resume materialization.
- [x] U3.6 (carry-over, U2.3's honest-scope note) resume gains the
  escrow-backed BYTE-RESTORING executor: record with `--values` freezes
  cell VALUES inside the manifest (id covers them — content-addressing
  bites), resume `--materialize` restores them through the arch-A store,
  billed 1 escrow credit/cell (broke actor → `E_SNAPSHOT_BUDGET` before
  any write, refund on store-write denial).
- [x] U3.7 MCP: `vant_scenario_crew/_task/_status` (309 tools, live-fired
  through mcp.execute incl. rules + sandbox doors); rules allowlist
  extended for the three tool names.
- [x] U3.8 grand-tour gate B bumped 306 → 309 and re-run 18/18;
  lint:coverage PASS (MCP 309/309, CLI 119+5 = 124); fiction +
  frontmatter gates PASS; CI green (this pass's suites + live-fire).

### Wave U4 — Deliberation→Decision Records — SHIPPED (pass 199, one pass)
Estimate was: **2–3 passes.** Landed in one pass, same shape as U1–U3.

- [x] U4.1 `forum.js` gains a `decision` linkage: thread →
  `consensus.create(topic)` id → on tally, write a decision record
  (mcp-consistent with agora reasoning). Durable: `vote(proposal,
  { thread })` records the barcode→topic pairing in
  `state/forum-threads.json` (WAL-backed, FIFO cap 500 — restart-proof,
  unlike the memory-only `_openVotes`); the decision return path reads
  the link first, so a decision record CARRIES its thread even when the
  tally happens in a fresh process (`thread` field on the persisted
  decision). Escrow-hold audit rides the trail (`forum:<topic>` hold id
  surfaced when held). MCP: `forum_decisions`, `forum_thread_links`;
  `forum_vote` gains the `thread` param (311 tools).
- [x] U4.2 `vant forum decisions <thread>` — inspect the decision
  trail of any thread (votes, escrow holds touched, outcome). Typed
  `E_FORUM_ABSENT` on an unlinked thread (no silent empty trail);
  `vant forum links` roster; `--json` on both verbs. Exit codes 0/1.
- [x] U4.3 Pin suite: `test/forum-decisions-persistence.test.js`
  extension (thread→decision roundtrip, no-orphans after restart).
  Suite 4 → 9: link persistence on disk, decision-carries-thread
  roundtrip, no-orphans-after-restart (link + hydrated decision both
  survive), unlinked-thread typed refusal, link FIFO cap (500) + clearState
  ops-parity for the links store. Grand-tour gate B bumped 309 → 311,
  re-run 18/18.

### Wave U5 — Provenance / Compliance Bundle — SHIPPED (pass 200, one pass)
Estimate was: **2 passes.** Landed in one pass, same shape as U1–U4.

- [x] U5.1 `vant export bundle --out <dir>` — manifest.json (registry
  export), citations file, audit ledger excerpt (scoped), horcrux
  (encrypted, password-gated), all files L-hashed in a content
  manifest (hash.js). Landed as `lib/export-bundle.js` +
  `bin/export.js` (dispatcher-routed): the L-hash is a RUNNING hash
  list — entry i folds entry i-1's digest
  (sha256(prev + file + ':' + fileHash); lib/hash.js sha256 only) —
  so any byte change, delete, insert, or reorder breaks the terminal
  digest. `bundle.json` names the chain's terminal digest while living
  OUTSIDE the chain (verify compares the recomputed digest against it —
  a rerooting attack is caught at that door). Horcrux omission
  (`--no-horcrux`) and password absence refuse typed
  (`E_BUNDLE_PASSWORD`); absolute out paths refuse typed (the vaf
  traversal gate takes /home/… residency paths, and export artifacts
  stay repo-relative)
- [x] U5.2 `vant export verify <bundle-dir>` — recompute the manifest
  hash, fail-closed on tamper detection. Verify recomputes from the
  ACTUAL bytes: per-entry hashes + chain links + terminal digest +
  bundle.json all compared; extra/missing files are tamper, not noise
  (typed `E_BUNDLE_TAMPERED` / `E_BUNDLE_ABSENT` / `E_BUNDLE_DENIED`).
- [x] U5.3 Pin suite `test/export-bundle.test.js` — 11 pins (roundtrip
  + tamper negatives: byte-drift, chain-recompute-without-bundle, full
  reroot-vs-bundle.json, extra file, missing file, absent dir, typed
  password/absolute-path refusals). Honest scope note (in-suite): a
  FULL re-forge of every artifact recomputes consistently — a
  self-declared chain is tamper-EVIDENCE, not a trust ROOT; the root is
  the horcrux password + external anchoring (e.g. record the digest
  somewhere outside the bundle). CLI live-fired both verbs.

### Wave U6 — Credentialed Marketplace (research frontier) — PROTOTYPE SHIPPED (pass 201)
Estimate was: **6–8 passes**, split: prototype in `labs/`, productize
later. Prototype landed in one pass (U6.1–U6.4); **U6.5 (owner
disposition) is the open item.**

- [x] U6.1 Prototype `labs/prototype-marketplace.md` — skill/tool
  listing schema (text|code payloads; 'launch' a DOCUMENTED boundary,
  refused at listing time), reputation source (trust.js feed — settle
  outcomes write real `trust.record` lines keyed to the LISTING's
  seller), agreement delivery contract (escrow hold→deliver→release:
  hold at buy, DEBIT only on buyer confirm, refund-by-refutation,
  double-settlement refused), failure modes table (every row maps to a
  state or a typed refusal).
- [x] U6.2 `lib/market.js` extension: `listSkill`, `buySkill`,
  `deliverSkill`, `settleSkill`, `skillStatus` behind the
  `market.skillsEnabled` config gate (OFF by default — ops return
  typed `E_SKILLS_DISABLED` when the gate is down: inert, not absent).
- [x] U6.3 Trust feed: settle outcomes write real cooperation records
  (confirm: positive, value scaled `min(0.2, price/50)`; refute:
  negative — both visible through `getScore`, pinned).
- [x] U6.4 Pin suite lite `test/market-skills.test.js` — 8 pins
  (gate-inert typed, listing boundaries, full loop with debit-on-
  confirm-only, seller-keyed trust movement up AND down, double-
  settlement refusal, buyer-cannot-deliver / seller-cannot-settle
  scoping, payload refusals incl. the 64KB cap, no-debit refute path).
- [x] U6.5 PRODUCTIZED per owner review (pass 202): the gate mounts
  through `VANT_MARKET_SKILLS_ENABLED` (ENV_REGISTRY alias + `load()`) or
  `vant market skill-gate on|off` (persisted brain-config write; the
  reader consults runtime flag > env > brain config); `vant market
  skill-*` CLI family (list/buy/deliver/settle/status/gate, typed
  exits 0/1/2/3); six MCP tools (`market_skill_list/_buy/_deliver
  /_settle/_status/_gate`, 311 → 317, live-fired). Settlement is REAL:
  buy = canSpend + escrow HOLD (no money); confirm = the ONE debit +
  hold release (verified against the real escrow store, pinned); refute
  = release only + listing supply restored; broke buyer typed
  `E_SKILL_BUDGET` before any hold. The prototype's double-charge
  (buySkill → market.trade debited at trade time, then confirm again)
  is closed — the skill flow owns a hold-first contract, `trade.debit`
  null until confirm. Skill fields (payloadKind/capabilityTag) persist
  on the listing. Suite 8 → 14 pins; playbook:
  `docs/operations/skills-marketplace.md`. Still additive follow-ups:
  timeout automation, shill-resistant aggregation, 'launch' payloads.

## 4. Open questions (proposals attached)

- **Universe constant distribution** (U1): env (`VANT_UNIVERSE_SEED`,
  per seeds.js today) vs per-brain config key `universeSeed` (read
  supported, **no writer exists** — known husk from #158). Proposal:
  add the config writer in U1 (small), keep env as escape hatch.
- **Fork isolation for U3** (scenario crews): per-agent brains are
  already the pattern (`VANT_BRAIN`); proposal: scenario crews use one
  brain per agent, always — no shared-write state.
- **Checkpoint expiry (U2)**: `keepK` is 3 by default in checkpoint.js;
  proposal: scenario checkpoints opt `keepK` up (8) since scenarios are
  intended to be revisited.

## 5. The "base loops first, then icing" sequencing (owner-approved)

Headless runtime polish and the browser UI are EXPLICITLY POSTPONED
until U1–U5 satisfy the base loops. Rationale: the universe/surface
work is the substrate the UI visualizes — building the dashboard on an
incomplete substrate would mean re-plumbing it later. When UI work
opens it rides the MCP surface (`universe_*`, `scenario_*`, forum
decision tools), not a bespoke REST dialect.
