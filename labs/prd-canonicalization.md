# Vant Canonicalization — Product Requirements Document

**Version:** 1.0
**Branch:** axolotl
**Date:** 2026-10-09
**Status:** ACTIVE — Waves A–E landed (passes 179–182). Next: Wave F (RemoteTransport). The §6 charter table is the ruling ownership doc for the messaging trio.
**Completed:** §2 Wave A (event observability, 40 pins), §3 Wave B (config env registry,
23 pins), §4 Wave C (lib/hash.js, 29 pins + grep gate), §5 Wave D
(ownership matrix + storage.js split, zero consumer churn), §6 Wave E
(messaging charters + shared envelope, pinned) — all per
the §8 acceptance standard
**Evidence base:** `labs/CANONICALIZATION-ROADMAP.md` (measured inventory, pass 179)
**Related:** `labs/WIRING.md` (state-spine ledger — the model for what "done"
looks like), stego pass 178 (ce7b7d5 — the pattern case study)

---

## 1. Overview

Vant has many well-built systems that don't talk to each other. The
canonicalization effort applies the pattern the stego pass just proved —
**one canonical module, exported interop helpers, suite pins, no broken
read paths** — to the six remaining disconnected stacks.

The measure of done is the WIRING.md ledger standard: a system is not
"built", it is **WIRED** (production consumers exist + a pin holds the
contract). This PRD covers the systems WIRING.md does not already
govern (state spine, geometry — those are tracked there).

### Design rules (inherited from the stego pass)

1. Change the **canonical** module — never fork a second dialect.
2. **Export interop helpers** so tests and consumers pin the contract.
3. **Pin everything** in tests; no test-only public APIs (axolotl rule).
4. **Never break the read path** of pre-existing data.
5. One wave = one landed, measured, pinned improvement. No big-bang.

---

## 2. Wave A (P1) — Event bus becomes observable and listened

**Evidence:** 266 distinct event names emitted; **8** `.on()` listeners
repo-wide; ~10 modules bypass `lib/event.js` with private EventEmitters
(backup, trust, cron scheduler, context, habitat, nature, market).

### A1. `vant events tail` CLI

New `bin/events.js`:
- `vant events tail [--name <x:y>] [--module <name>] [--json] [--clear]`
- Subscribe to the shared bus pre-fork/multi-process: buffer events in
  a consumer-owned ring file per session (`tmp/events/session-*.jsonl`),
  tail prints follow-mode or snapshot.
- Implementation notes: the shared bus is in-process — CLI gets a live
  feed by `require('./lib/event')` and attaching; for cross-process
  visibility, `lib/event.js` gains an opt-in file sink (append-only per
  session, cheap: one JSONL line per event, capped) and readers tail it.
- Exit codes: 0 clean; 2 on bad filter syntax.

### A2. MCP tool: `event_tail`

Exposed through the auto-wired MCP registry: `{max, nameFilter?,
follow?}` → recent events. Same sink as A1 (no new bus plumbing).

### A3. Wire the high-value listeners

The 258 unheard events stay emitted; we make the *security and
integrity* ones heard by the systems that own reaction to them:

| Event(s) | Listener | Action |
|---|---|---|
| `vaf:blocked`, `rls:denied`, `trust:blocked`, `market:blocked`, `sandbox` denials | audit | `audit.warn` entry (action/module/reason already in payloads) |
| `storage:error`, `storage:*:denied` | audit | `audit.error` |
| `sync:push:failed`, `sync:pull:failed` | health | health check surfaces last sync failure |
| `wal:denied` | health | WAL rejection surfaces in `vant health` (already partially via Q4 pin) |
| `stego:encoded`, `stego:decoded` | audit | info entry (carrier path, encrypted flag) |
| `secret:*` | audit | info (never values — event payloads already hold names only) |

Pin: `test/event-observability.test.js` — emit + assert audit/health
reaction for each wired pair; assert the tail CLI sees a canned event.

### A4. Migrate private emitters onto the shared bus (staged)

Stage 1 (this PRD's scope): trust, cron scheduler, market re-emit their
domain events onto `lib/event.js` **alongside** their private emitters
(no breaking change to existing `instance.on(...)` consumers). Stage 2
(separate pass): move consumers to the shared bus and retire the
private emitters.

---

## 3. Wave B (P1) — Config registration sweep

**Evidence:** 15+ `VANT_*` vars read directly off `process.env`
(webhooks port/secret/url/bind, wal enable, mcp port/require-key, server
port/key/cert, mode, mesh secret), bypassing config.js — while config.js
already advertises a 4-layer resolution order.

### Play

1. `lib/config.js` maintains a **registry**: key → {env fallback, type,
   default, secret?}. All known `VANT_*` vars registered.
2. Modules stop reading `process.env` directly (excavate each match;
   `config.js`/`secret.js` are the only allowed direct readers).
3. `vant config list` shows registered keys with source (default / ini
   / env / override) — makes drift visible.
4. Health check gains a config section: env vars that are set but
   unknown to the registry (typo detection).
5. Pins: `test/config-registry.test.js` — every env fallback resolves,
   direct `process.env` reads outside config/secret fail a grep gate.

---

## 4. Wave C (P2) — One hashing module

**Evidence:** sha256/crc32 re-implemented in 8+ modules (audit, encrypt,
wal, vaf, state/tree, state/spine, state/canonical, state/checkpoint);
stego already models the fix (`zlib.crc32` core call).

### Play

1. `lib/hash.js`: `sha256(bytesOrString)` → hex; `crc32(buffer)` →
   u32; `canonicalBytes(obj)` → the `state/canonical.js` encoder.
   Zero new crypto — delegates to core `crypto`/`zlib`.
2. Consumers switch one per commit; digests must be **byte-identical**
   to the outgoing impls (same algorithm = yes; asserted per module).
3. Pins: cross-module digest equality (same input through old and new
   path during the transition), then the grep gate retires the stragglers.
4. WIRING.md note: quasicrystal pass 176 already retired the last
   *un-spined* hash chain — this wave is about the remaining per-module
   copies, which exist even where canonical exists (state/* duplicated
   rather than importing their own sibling).

---

## 5. Wave D (P2) — Storage ownership matrix, then split

**Evidence:** 8 storage classes in one 2,391-line `lib/storage.js`, while
`lib/state/` (13 modules, best-tested, spine-anchored) is the newest
tier. WIRING.md already tracks the state side; the legacy classes have
no documented ownership.

### Play

1. Ownership matrix landing in this file's appendix as it's drafted
   (data kind → canonical store → backup? → WAL? → mirror? → API).
2. Deal rule: legacy classes either (a) delegate to state/ plumbing,
   (b) stay with a documented narrow role, or (c) die. No new roles.
3. Split `storage.js` into per-class files under `lib/storage/` with
   `lib/storage.js` remaining as the factory re-export (imports stay
   stable; consumers don't churn).
4. Pins: the storage suite moves first (move, don't rewrite tests).

---

## 5a. Appendix — Storage ownership matrix (Wave D, pass 181)

Measured on the tree: consumer counts via `getStorage('<type>')` and
`new <Class>()` across lib/ bin/ test/ scripts/.

| Data kind | Canonical store | Consumers | Backup | WAL | Mirror | API surface |
|---|---|---|---|---|---|---|
| **File/blob (RW, safe-by-default)** |
| anything a caller writes/reads (brain files, canvas art, health probes, islands boot) | `FileStorage` | ~15 modules via `new`/`storage.read` (canvas, backup, bin, health, wal-bin) | `vant backup` snapshots the brain | repairable per-store (`{ wal: true }`) | rclone/s3 by operators | `storage.read/write/delete/has/list` + raw bypass + `new FileStorage` |
| **Brain content** |
| category/key brain docs | `BrainStorage` (path-scoped FileStorage) | brain.js (the only consumer) | ✅ horcrux/backup | ✅ (brain WAL) | git (brain repo IS the mirror) | `storage.get('brain')` — via brain.js only |
| **Vector search index** |
| embedding records | `VectorStorage` (connector delegate) | 0 external (embed'ers call connectors directly) | — | — | connector-side | `storage.get('vector')` — orphan OK (embed stack is the surface) |
| **Protocol state** |
| `.state.json` stack + protocol state | `StateStorage` (layered private-over-public) | brain stack (models/state.json) | brain backup | — | git | `storage.get('state')` via brain.js |
| **Ini file** |
| `vant.config.js` read | `ConfigStorage` | 0 external (config.js owns ini) | git | — | git | `storage.get('config')` — superseded by brain-scoped config.json |
| **Schema JSON** |
| schema dir | `SchemaStorage` | 0 external | git | — | git | `storage.get('schema')` — orphan |
| **Islands registry** |
| island manifests | `IslandStorage` | 0 external (islands.js uses storage.shortcuts) | git | — | git | `storage.get('island')` — orphan |
| **Git repositories** |
| repos metadata | `ReposStorage` | 0 external | git | — | git | `storage.get('repos')` — orphan |
| **Remote (S3-shaped)** |
| mirror/pull trees | `RemoteStorage` (client DI) | connectors/index, bin/s3, remote test | — | — | ✅ IS the mirror | `storage.get('remote')`, `new RemoteStorage({ client })` |

**Deal-rule verdicts (per PRD §5):**
- `FileStorage`, `BrainStorage`, `StateStorage`, `RemoteStorage`: LIVE
  narrow roles, documented above. Split verbatim into `lib/storage/*`.
- `ConfigStorage`, `SchemaStorage`, `IslandStorage`, `ReposStorage`,
  `VectorStorage`: documented narrow/orphan roles, KEPT (no new roles; no
  deletions in Wave D stage 1 per PRD out-of-scope). A later wave may
  retire orphans once their consumers' surfaces are confirmed.
- Security plumbing (sandbox/VAF/gates/metrics/events/atomic write) is
  SINGLE-SOURCE in `lib/storage/shared.js`; every class file requires it.

---

## 6. Wave E (P3) — Messaging trio unification

**Evidence:** msg.js (966L conversations), stream.js (557L queue/lease),
crew-bus.js (440L HMAC peer envelopes) — three agent↔agent carriers
with overlapping semantics.

### Play

1. Define the seam: **conversation** (msg), **work queue** (stream),
   **peer transport** (crew-bus) are NOT the same thing — first deliverable
   is the charter table: what each surface owns, and where overlaps are
   banned (no dual-ownership channels).
2. Shared primitives (envelope shape, persistence hook, delivery
   guarantees) come from one module. crew-bus is the only one with
   transport-level crypto — its envelope becomes the cross-cutting one.
3. Pins: each surface's suite stays green; integration test proves
   msg + stream can ride a shared envelope without semantic loss.

### CHARTER (measured on the tree, pass 182)

| Surface | OWNS | Must NOT do (banned overlap) |
|---|---|---|
| `lib/msg.js` | **Conversations** — persisted, ordered, decrypt-able transcripts (category/key via state-store) + in-process channel pub/sub (`msg.send`/`subscribe` for IPC-style shouts, e.g. forum) | no cross-node delivery (that's crew-bus), no task lifecycle (that's stream); a channel shout is not a queue row |
| `lib/stream.js` | **Work queue** — durable task rows per stream, lease/watch, enqueue → poll → complete/fail, escrow-gated | no transcript/history semantics (post to msg for the record), no cross-node transport (hand the task across via crew-bus, row stays local) |
| `lib/crew-bus.js` | **Peer transport** — HMAC-signed HTTP envelopes between registered nodes, version + scope gates on the receiver, node-registry presence | no storage (envelopes are fire-dispatch-ack, never persisted as truth), no queueing (undelivered = dropped loudly, never parked) |
| `lib/messaging.js` (NEW, pass 182) | **The shared envelope** — crew-bus's wire shape `{event:'crew.<type>', from, type, payload, ts, nonce, v:{major,minor}}` + the receiver's version gate (major strict / minor additive) + sign/verify helpers | no dispatch, no storage, no transport — a pure seam so msg/stream ride the shape without requiring crew-bus |

**Banned overlaps summary:** no dual-ownership channels; a record goes to
msg OR stream, never both-as-truth; only crew-bus leaves the process.

### Wave E landed (pass 182)

- `lib/messaging.js`: `makeEnvelope/validateEnvelope/versionGate/
  signEnvelope/verifyEnvelope/setReceiverVersion` — the v1.0 envelope
  crew-bus has been sending since pass 61, made requirable without the
  network stack. Crew-bus now delegates `_validVersion` and
  `_setReceiverVersion` to it (single home; staging seam preserved
  byte-identically; the unstamped-v1.0 tolerance preserved exactly).
- Pins: `test/messaging-envelope.test.js` — shape contract, version
  gate matrix (incl. garbage/unstamped/both-major-directions/minor),
  sign/verify vs Encrypt, crew-bus parity (staging moves the same
  object both layers read).
- Integration: msg conversation snapshot leg + stream work row wrap
  into the shared envelope and round-trip without semantic loss.
- Consumer suites re-run green: msg, stream, crew-bus,
  agents, forum, mcp smoke, grand-tour.

---

## 7. Wave F (P3) — Sync/transport unification

**Evidence:** sync.js, org-sync.js, agora-sync.js, mirror, connectors/*
— 5+ "send state elsewhere" stacks with private retry/auth verify.

### Play

1. `RemoteTransport` interface: `auth()`, `push()`, `pull()`, `verify()`,
   `retryPolicy()` — the git-connector argv-array hardening is the
   shared security template.
2. Existing stacks adopt per-stack (no forced migration in one PR);
   each adoption replaces its private auth/retry with the shared one.
3. Pins: adversarial input suite (the git-injection pin family) applied
   once at the interface, inherited by all adopters.

---

## 8. Acceptance per wave

Every wave lands with:
- All affected suites green (`node test/run-all.js --only=...`).
- New pins for the new contract (test file named in the wave).
- WIRING.md updated (status column) — the canonical "is it wired" ledger.
- PR comment cross-linking the wave to this PRD.

## 9. Out of scope / explicitly not

- No new event names invented to "fix" the bus — consumers attach to
  existing emission contracts.
- No env var is removed or renamed in Wave B (registration only;
  surface stays compatible).
- No storage class deleted in Wave D stage 1 (delegations first).
- mesh PRD owns cross-node transport (Wave D scope here is only
  facility-level sharing).
