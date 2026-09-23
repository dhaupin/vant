---
version: 0.8.6
permalink: /memory/geometry
layout: default
title: Geometry
nav_order: 26
description: Quasicrystal addressing for memory - collision-free spatial keys. Experimental.
---

# Geometry

> Memory addressed by position in a quasicrystal instead of by name.

Geometry stores data at geometric addresses derived from content. Keys
spread across a quasicrystal projection, which means addresses do not
collide the way hashed keys can, and neighbors in space tend to be related
in content. **Experimental:** the format and spec may change.

## Store and locate

From code:

```javascript
const geometry = require('./lib/geometry');
geometry.store('a-key', 'the value');
```

Retrieve by address or barcode:

```javascript
geometry.retrieve('a-key');
```

Generate a barcode for content:

```javascript
geometry.barcode('some content');
```

Locate what a barcode refers to:

```javascript
geometry.locate('the-barcode');
```

## CLI

The geometry surface is available through the memory command family:

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
in [NSC9-SPEC](../advanced/nsc9-spec). Treat the spec as the source of
truth for the format; this page only covers use.
