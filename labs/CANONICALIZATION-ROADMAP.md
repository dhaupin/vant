# Vant Canonicalization Roadmap — pass 179 (2026-10-09)

> Written after the stego pass proved the pattern: **one canonical module +
> exported interop helpers + suite pins** makes disconnected systems
> interoperate and stay fixed. The stego PNG pipeline (ce7b7d5) and the
> shared LSB wire with Stegoframe are the template. This doc inventories
> the remaining disconnects with actual evidence, ranked by payoff.

## Evidence base (measured on this tree)

| Signal | Count |
|---|---|
| Distinct event names emitted in lib/ | 266 |
| Event names with ANY `.on()` listener | 8 |
| Modules extending their own EventEmitter (bus bypass) | ~10 (backup, trust, cron scheduler, context, habitat, nature, market…) |
| `VANT_*` env vars read directly off process.env (config bypass) | 15+ across webhooks/wal/api/vant/version/genesis/secret… |
| Modules with their own sha256/crc32 impls | 8+ (audit, encrypt, wal, vaf, state/tree, state/spine, state/canonical, state/checkpoint) |
| Storage classes in lib/storage.js | 8 (File/Brain/Vector/State/Config/Schema/Island…) |
| State modules in lib/state/ | 13 (tree, mesh, delta, checkpoint, hotset, cellstore, spine, canonical, fold, orbits…) |
| Messaging/IPC surfaces | 3 (msg.js 966L, stream.js 557L, crew-bus.js 440L) |
| "Send state elsewhere" stacks | 5+ (sync, org-sync, agora-sync, mirror, connectors/) |

## P1 — Event bus is 98% write-only

266 emitted / 8 heard. ~258 events fire into a void that isn't even one
bus (10 modules bypass `lib/event.js` with private emitters).

Play:
1. `vant events tail [--name x:y]` CLI + MCP `event_tail` tool — makes
   all 266 observable instantly, zero emit-contract changes.
2. Wire the high-value listeners: `storage:error`/`vaf:blocked`/
   `rls:denied`/`trust:blocked`/`market:blocked`/`secret:*` → audit;
   `sync:push:failed`/`sync:pull:failed`/`wal:denied` → health;
   `stego:encoded`/`stego:decoded` → audit.
3. Migrate the ~10 private emitters onto the shared bus.

## P1 — Config is a three-way split

(Matches the CHANGELOG's own "Config Consolidation" backlog item.)
Modules read `process.env.VANT_*` directly, bypassing config.js.

Play: register every `VANT_*` var (webhooks, wal, mcp port, server
port/key, mesh secret…) in config.js with defaults; forbid direct
process.env reads outside config.js/secret.js. After: `vant config get`
is the truthful single surface, health checks can flag unset vars.

## P2 — One hashing module

`lib/hash.js`: sha256/crc32/canonical-bytes; every impl-consumer
switches. Stego already models this (`zlib.crc32` core call). Pins:
cross-module digest equality.

## P2 — Storage ownership matrix, then split storage.js

One page: data kind → canonical store → backup? → WAL? → mirror? →
reader/writer API. The `state/` tree is the newest/best-tested surface —
make legacy classes delegate or die. Split the 8-class monolith into
per-class files.

## P3 — Messaging trio

msg.js / stream.js / crew-bus.js overlap for agent↔agent transport.
Pick a canonical carrier; keep the others as shims.

## P3 — Sync/transport unification

Shared `RemoteTransport` interface (auth, retry, verify) underneath
sync / org-sync / agora-sync / mirror / connectors. The git-connector
argv-array hardening is the template for shared security semantics.

## Order

1. Event tail CLI + listener wiring (P1, zero-risk add)
2. Config registration sweep (P1, mechanical)
3. lib/hash.js (P2, cheap)
4. Storage ownership matrix → storage.js split (P2)
5. Messaging + transport unification (P3)

Rule for every item (from the stego pass): change the CANONICAL module,
export interop helpers, pin with tests, never break the read path of
pre-existing data.
