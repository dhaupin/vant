---
version: 0.8.6
permalink: /memory/state-spine
layout: default
title: State Spine
nav_order: 30
description: The content-addressed state tree, seed chain, anchors, and checkpoints - "same state?" becomes one string comparison.
---

# State Spine

> Every protocol state rides ONE content-addressed tree. "Same state?"
> between two agents, two processes, or two restarts is one string
> comparison - never a deep-equal.

## The one-paragraph mental model

Protocol state (who is trusted, who won the vote, where the org chart
points) used to live in plain JSON blobs: correct but unverifiable -
you could not tell tampered from stale from fresh. The state spine
(`lib/state/`, 13 modules) gives every piece of protocol state a
**root hash**: state files stay plain and human-readable on disk, but a
content-addressed mirror lets anything compare, diff, snapshot, verify,
and dedupe state with one hex string.

The building blocks, in the order they stack:

| Block | Module | Job |
|-------|--------|-----|
| Canonical encoder | `lib/state/canonical.js` (#146) | One wire format for all state. Same value -> same bytes -> same hash, regardless of key order, object identity, or float repr. |
| State tree | `lib/state/tree.js` (#145/#147/#148) | Path-addressed tree where every node's identity is its hash. One root hash for the whole thing; diff and snapshot are cheap. |
| Seed chain | `lib/state/seeds.js` (#158) | Deterministic randomness: every subsystem derives seeds by scope path from one 256-bit universe constant instead of `Math.random()`. |
| Addressing spine | `lib/state/spine.js` (#165) | One address space for geometry cells, RAID fragments, and mesh nodes: space id = a tree path, cell address = one PRF over that path. |
| Cell store | `lib/state/cellstore.js` (#150) | Content-addressed shared store. A fact referenced from two spaces stores ONCE - cross-space dedup is structural, not a cleanup pass. |
| State anchor | `lib/state/anchor.js` (#152) | Append-only root-hash ledger: "last known good" for tamper evidence. |
| Snapshotted log | `lib/state/checkpoint.js` (#151) | WAL <-> snapshot interplay: every N records snapshot the root; recovery replays only entries after it. |
| Hot set | `lib/state/hotset.js` (#153) | Bounded LRU over the store. A miss falls through and stays correct; eviction touches only the cache, never durability. |
| Brain durability | `lib/state/brain-verify.js` (#166) | Brains become tree subtrees: verify = recompute root vs last anchor; a corrupted file is detected before it is read into context. |

## The tiers: where your state actually goes

There are two tiers, matched to how much a module cares about
verification (usage below shows both):

1. **File tier (always on)** - `stateStore.hydrate/persist/persistMerged`
   read/writes plain JSON files at
   `models/private/<brain>/<stateFile>` through FileStorage
   (containment gates + atomic writes; WAL enabled by default since the
   WAL-unification pass). Cross-process serialization uses a fail-closed
   lock (`persistMerged` refuses an unlocked write; it never degrades).
2. **Tree tier (opt-in)** - pass `{ tree: new StateTree() }` to
   `persist`/`persistMerged`/`hydrate` and the snapshot mirrors into a
   content-addressed `StateTree`. The tree's rootHash rides the
   `state:saved` event and every `state:persist` audit entry automatically.

On every tree-tier persist the root is also **anchored** to
`models/private/<brain>/.state-anchor.jsonl` (the #152 ledger) - a
tampered or partially-written state file is detectable against the last
known-good root, not just against an in-process mirror.

## Usage

### The file tier - persist and hydrate

```js
const stateStore = require('./lib/state-store');

// Hydrate: apply(data) runs only when a parseable file exists.
// Read denial throws E_STATE_READ (it is surfaced, never swallowed);
// corrupt file = warn + fresh start.
const out = stateStore.hydrate({
    moduleName: 'trust',
    stateFile: 'state/trust.json',
    apply: (data) => { trustState = data; }
});
// out = { loaded, applied, rootHash? }

// Persist (whole-snapshot write). A `kind: 'vant-protocol-state'`
// marker is added so migrations never mistake us for legacy dropfiles.
stateStore.persist({
    moduleName: 'trust',
    stateFile: 'state/trust.json',
    data: trustSnapshot
});

// Cross-process safe: the brain-root lock is taken; the on-disk
// snapshot is offered to merge(nek) (adopt unseen ids - local deletes
// stay tombstoned); then the union is written. Lock unavailable = the
// write is REFUSED (fail-closed), not degraded.
await stateStore.persistMerged({
    moduleName: 'teams',
    stateFile: 'orgchart.json',
    merge: (diskSnapshot) => adoptUnseen(diskSnapshot),
    serialize: () => serialize()
});
```

### The tree tier - "same state?" as one string

```js
const { StateTree } = require('./lib/state-store'); // re-export

// 1. Give persist/hydrate a tree and it mirrors in place.
const tree = new StateTree();
stateStore.persist({
    moduleName: 'trust',
    stateFile: 'state/trust.json',
    data: snapshot,
    tree
});
// Root hash is now in the state:saved event, the audit entry, and the
// anchor ledger.

// 2. Diff two roots: which paths changed.
const diff = tree.diff(oldRoot, newRoot); // changed paths; no phantom diffs

// 3. Snapshot / restore a scope deterministically.
const snap = tree.snapshot('/trust');        // pre-order node list
const tree2 = new StateTree().apply(snap, { verifyScopeRoot: true });
tree2.rootHash() === tree.rootHash();        // true - deterministic

// 4. Compare across processes/restarts: string comparison, nothing else.
const disk = stateStore.treeFor('state/trust.json'); // present: {tree, rootHash}
```

### Verify against the last anchor

```js
const v = stateStore.verifyStateRoot('state/trust.json');
// { state: 'PRESENT', ok: true, anchored: true, current, lastAnchored }
// ok:false = the disk root diverged from the last anchored root -
// link to `firstDivergence` for what/when. Missing anchor record = a
// loud `anchored:false`, never a silent bless.
```

Health's brain-integrity pass and the ledger tooling use this. It is
deliberately NOT run inside `hydrate()` - every restart would re-bless
whatever is on disk.

### The seed chain - replace Math.random with a clock

```js
const { SeedChain, resolveUniverse } = require('./lib/state/seeds');

const chain = new SeedChain();
chain.seed('region:east:nodeA')        // 32 deterministic bytes
chain.seedHex('region:east:nodeA')     // hex (log-safe, not secret)
chain.seedInt('lottery', 100, 'draw1') // int in [0,100), deterministic
chain.deriveChild(parentSeed, 'nodeA') // prefix folding: != seed of child under universe directly
```

The universe constant resolves in priority order: explicit `options.universe`
-> `VANT_UNIVERSE_SEED` env -> per-brain config key `universeSeed` (written by
genesis `_writeTopology`, never clobbered, never overriding an explicit env) ->
a fixed deterministic default. Two installs with different universes do not
agree on seeds - by design; they are different universes.

### Mesh, RAID, geometry: the one spine

```js
const { AddressingSpine } = require('./lib/state/spine');
const spine = new AddressingSpine();           // SeedChain included

spine.spaceId('mesh', 'east/n1');   // '/mesh/east/n1' (grammar-validated)
spine.cellAddress('/mesh/east/n1', 0);             // one PRF derivation
spine.factHash(fact);                              // the canonical encoder

// The honesty test as a primitive: same fact under two spaces
// stores once in the CellStore (#150 rebate), hashes identical.
spine.writeSharedFact(cellStore, fact, ['/world/w1', '/raid/doc']);
```

## Equivalent CLI/API surfaces

| Want | Do |
|------|-----|
| Compare two brain sets | `brain-verify.verify()` from `lib/state/brain-verify.js` (root hash over the corpus files) |
| Read-back integrity | the #166 brain verify runs on horcrux restore/snapshot paths |
| Durable mesh | `new MeshTree({ dir })` -> deltas ride the SnapshottedLog; recovery honors E_LOG_DENIED, never silent reinterpret |
| Hot-path reads | `stateStore.treeHot.metrics()` - hits/misses/evictions of the tree-tier disk cache |

## Design laws (the honest guarantees)

- **Typed absence over silent default**: missing state file = fresh
  clean state; parse failure = loud reset; read denial = throw
  `E_STATE_READ` (error surfaces, never becomes an empty state).
- **No schema Gson-like clobbering**: tree paths are strictly
  normalized; `..`, leading `/` missing, trailing slashes and hostile
  segments are refused (a crafted path escapes nothing).
- **Determinism**: canonical encoder yields same bytes regardless of
  key order / object identity / float representation source; the same
  seed chain replays the same scenario.
- **Corruption is detected, not guessed**: every tree-tier persist
  anchors the root; `verifyStateRoot` compares disk vs ledger; mesh
  checkpoints go through a verifiable SnapshottedLog.
- **Dedup is structural**: the #150 rebate means the same fact in two
  spaces costs one cell + one hash derivation from both sides.
- **Caches never lie**: HotSet misses fall through; any disk change
  (including external tamper) invalidates; eviction only touches the
  cache.

## Status and pointers

The tier-tracking ledger is `labs/WIRING.md` ("is it wired" is a status
column, not a checklist); the engine-parity harness that pins these
modules is `test/engine-parity-spine.test.js` (state core, world/clock,
mesh, RAID + storage tier suites). Layered on top you will find:
[hcom/federation](/vant/multi-agent/federation) uses the tree for
cross-node presence/authority; [horcrux](/vant/memory/horcrux) rides
brain-verify for its export/verify contract.

## Related

- [Memory Store](/vant/memory/memory-store) - the KV layer above the spine
- [Horcrux](/vant/memory/horcrux) - the transport that rides brain-verify
- [Memory](/vant/memory/) - the section overview
