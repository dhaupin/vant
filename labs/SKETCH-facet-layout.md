# SKETCH — Facet Layout for Quasicrystal Storage (geometry/fold #154)

> **Status:** DESIGN ONLY — pass 185 lands this sketch as a document.
> NOTHING here changes storage yet. `lib/geometry/fold.js` stays ORPHAN
> until a consumer lands **behind a compat read**. Implementation only
> after re-measuring consumer load on the tree.

## The idea (measured on the tree, pass 185)

`lib/geometry/quasicrystal.js` lays records out flat:

```
<basePath>/<key[0:2]>/<key>.json     (key = FACILITY SEQUENCE CHECK)
```

Inventory assertion (from the sketch survey): every stored record can
derive `getStorageKey(barcode) = FACILITY_SEQUENCE_CHECK` deterministically —
the re-derivation is the addressing (that part never changes).

`geometry/fold.js` gives the repo a law for a BOUNDED facet layout:
20 faces × 4^11 cells, packed `face * capacity + localCell`, overflow
refused (never wrapped). **What a facet layout would give quasicrystal
storage:** a stated-per-facet capacity + a refusal contract for any
consumer that wants bounded region allocation (a brain's geometry space
gets a hard cap per shard, disk fill becomes a loud refusal rather than
a silent crawl).

## Wiring shape (when it happens)

| Field | Status | Detail |
|---|---|---|
| Space claim | IDEAL | Each facet claims cells via the AddressingSpine's `/world/<w>` grammar (the **last named-but-absent `SPACE_CONSUMERS` leg**) — one PRF for all three named consumers, geometry would join mesh + raid |
| Record addressing | KEEP | `getStorageKey(barcode)` never changes; facet layout is only the PHYSICAL path under `<basePath>` |
| Compat read | REQUIRED | existing flat paths must stay readable: (a) try the facet path, (b) fall through to the flat `<key>.json` path exactly like today — one read path coexisting with a two-path write path for a bounded migration window |
| Refusal contract | NEW | over-capacity facet writes flat-out refuse (a typed `E_FACET_FULL`) — the #154 "overflow refused, not wrapped" law applied to disk layout |

## Consumer that actually needs it

The readiness test: does anything WANT bounded facet allocation today?
Measured survey says **not yet hard**: memory store + canvas + horcrux
all address byte-addressably through the same `getStorageKey` contract
with no capacity pressure. The honest wiring trigger would be:
- a brain's geometry space actually filling up under a backup/
  replication policy that shards per region, **or**
- the `/world/` space getting a live consumer (mesh PRD's world frame,
  still orphan).

Until one of those exists, fold's law is TESTED MATH WAITING (the
engine-parity series's own posture — primitives before consumers).

## Compatibility goals (when implementing)

1. `getFilePath(barcode)` per-adapter NOT changed: the flat path stays
   the primary for existing records.
2. New facet paths coexist via a resolver: lookup tries facet, falls
   back to flat (never the reverse — no silent split-brain).
3. Over-capacity refuses a WRITE without ever mutating an existing
   region's records (eviction/copy semantics stay out of scope).
4. The cellStore rebate (#150) applies verbatim: identical records
   across facets pay bytes once.
