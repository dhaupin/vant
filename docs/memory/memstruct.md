---
version: 0.8.6
permalink: /memory/memstruct
layout: default
title: memstruct Interchange
nav_order: 23
description: The vant brain as a memstruct store - the record grammar git-backed memory shares with any system, and the adapter that bridges them.
---

# memstruct Interchange

> Your brain, in the one record grammar any memory system can read.

The brain is markdown files in your repository, so git history becomes the memory lineage. That is the *store* tier. The *record grammar* - what a memory IS - is owned by [memstruct](https://github.com/dhaupin/memstruct), a language-neutral standard: one envelope, one merge contract, no transport.

`lib/adapters/memstruct.js` is the bridge. It exports your brain as a memstruct store and imports a store back into the brain. Same place as the LangChain adapter, because it is the same kind of thing: a pure data conversion, no service and no key.

## The mapping

| vant | memstruct |
|------|-----------|
| the file path | `id` (opaque; `<side>/<brain>/<rel>`) |
| the file's git history | `createdAt` / `updatedAt` (epoch ms) |
| the brain side (`private` / `public`) | `scope` |
| the markdown body | `body` |
| the basename (or top dir) | `kind` |
| (host policy) | `ttl` (null) |
| a delete | `deletedAt` (a tombstone, not an erase) |

The envelope (`id`, `createdAt`, `updatedAt`, `deletedAt`) is memstruct's. Every body field is host-owned and carried through, never refused.

## Export and import

```js
const connectors = require('./lib/connectors');
const memstruct = connectors.memstruct();      // defaults to ./models

const store = memstruct.exportStore();         // { memstruct: 1, records: [...] }
memstruct.lint(store);                         // { ok, records, violations }
memstruct.importStore(store);                  // writes live records back
```

`exportStore()` is deterministic: records are sorted by id, so the store is diffable and lint-stable across runs. `importStore()` refuses any id that escapes the brain root and any id that does not name a markdown file, so a store from a foreign system never writes outside `models/`.

## Sync (the replicated tier)

Two installs of the same brain merge without a translation layer, because the merge is part of the grammar:

```js
const merged = memstruct.sync(localStore, remoteStore);   // or memstruct.sync(null, remoteStore)
```

`sync()` is memstruct's reference merge (SPEC section 4): records are keyed by id and each id resolves to the winner of the total order - the later of the last edit and the deletion (the clock), then a canonical content hash as the tie-break. So the merge is commutative and associative (same inputs, same output, any device or order), a newer edit never loses to an older one, and a tombstone (`deletedAt`) is carried forward so a deletion propagates. The first argument may be a store or `null` (this brain's own export).

## Validation

The store validates with the memstruct CLI:

```bash
node -e "require('./lib/connectors').memstruct().lint()"
npx memstruct lint store.json
```

`memstruct` is a dev dependency (the family validator), so `lint()` uses it when present and degrades to a dependency-free structural check when it is not. The runtime never hard-depends on it.

## Where it sits

This is the vant side of the interchange, filed under the packstruct `memory` profile (SPEC v1.2.0). The replicated tier is the `sync` profile: `sync()` binds memstruct's own reference merge over the same grammar, so a store written here merges with a store from any other device or system without a translation layer.

## Related

- [The Brain](/vant/memory/brain) - the memory files and where they live
- [Memory store](/vant/memory/memory-store) - facts as they happen
