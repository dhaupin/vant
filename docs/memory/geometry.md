---
version: 0.8.6
permalink: /memory/geometry
layout: default
title: Geometry
nav_order: 27
description: Quasicrystal addressing for memory - collision-free spatial keys. Experimental.
---

# Geometry

> Memory addressed by position in a quasicrystal instead of by name.

Geometry stores data at geometric addresses derived from content. Keys
spread across a quasicrystal projection, which means addresses do not
collide the way hashed keys can, and neighbors in space tend to be related
in content. **Experimental:** the format and spec may change.

## Store and locate

From code, the geometry module (`lib/geometry/`) exposes the NSC9
projection and storage layer:

```javascript
const geometry = require('./lib/geometry');

// Generate a barcode for content (content-hash based)
const barcode = geometry.generateBarcodeFromContent('some content');

// Store/retrieve operate on (barcode, data) pairs
await geometry.store(barcode, 'the value');
const recovered = await geometry.retrieve(barcode);
```

The memory store wraps this with brain-aware addressing:

```javascript
const { address, locate } = require('./lib/memory');
await address('The quasicrystal spreads keys without collisions.');
const hit = await locate('the barcode you got back');
```

Key-value convenience lives behind `vant geometry`:

```bash
vant geometry store <key> <value>    # stored as a memory document
vant geometry retrieve <key>         # read back
vant geometry barcode <content>      # quasicrystal barcode
vant geometry address <data>         # store at a random barcode
vant geometry locate <barcode>       # read by barcode
```

## CLI via memory

The memory command family exposes the same addressing:

```bash
vant memory address <data>
```

Stores data at its geometric address and returns the barcode. Then:

```bash
vant memory locate <barcode>
```

Reads it back.

## Spec

The projection math, address space, and collision properties are specified
in [NSC9-SPEC](/vant/advanced/nsc9-spec). Treat the spec as the source of
truth for the format; this page only covers use.
