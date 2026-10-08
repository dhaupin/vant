# Geometry Module (v0.9.0-exp)

**Aperiodic Quasicrystal Memory Addressing for Vant**

## Motivation

Standard linear storage has inherent collision problems:
- Birthday Paradox: ~65K collisions in 32-bit space with 10M items
- "Ravaged" nodes lose index coherence
- Central hash tables = single point of failure

Quasicrystal addressing solves this by distributing across infinite aperiodic surface.

## Mathematical Foundation

### Icosahedral Coordinate System

The icosahedron has 20 faces, 30 edges, 12 vertices.

For addressing, we use the **dual** (dodecahedron) with:
- 12 pentagonal faces
- 30 edges  
- 20 vertices

Each unique (θ, φ, depth) triple maps to a unique position on the convex hull.

### Projection Formula

```
barcode: 1-31814-04200-8

31814 (digits 2-6) = rotational axis (θ = arctan(sin, cos))
04200 (digits 7-11) = projection depth into icosahedron
8     = checksum (ignored for addressing)
```

### Penrose P3 Tiling Distribution

The rhombus tiling P3 guarantees:
- ∞ unique positions
- No periodic repetition
- φ-ratio of thick/thin = 1.618...

## Directory Structure

```
lib/geometry/
├── index.js           # Main export + convenience wrappers (store/retrieve/has/list/stats)
├── engine.js          # Barcode generation from content hash
├── fragmenter.js      # Chunked fragment encode/decode
├── icosahedral.js    # 3D coordinate system
├── projection.js      # Barcode → coord projection
├── tilings.js         # Penrose P3 distribution
└── quasicrystal.js   # Storage extension
```

## Usage

```javascript
const geometry = require('./geometry');

// Project barcode to icosahedral surface
const coords = geometry.project('1-31814-04200-8');
// { theta: 2.34, phi: 0.72, depth: 0.418 }

// Store data AT a barcode address (store takes the BARCODE, not coords)
await geometry.store('1-31814-04200-8', { type: 'memory', content: '...' });

// Recover from barcode (any node can recompute the same address!)
const recovered = await geometry.retrieve('1-31814-04200-8');
```

The lower-level `geometry.quasicrystal()` module is also exposed
(init-storage pattern), but the wrappers above are the intended API.

## Security Properties

1. **No collision attacks**: Geometric addressing = ∞ address space
2. **Self-authenticating**: Position computed from barcode, no lookup table to corrupt
3. **Distributed reconstruction**: Any node with same barcode computes same position

## Version

Experimental: 0.9.0-exp
Reference: Penrose 1974, Shechtman 1984, de Bruijn 1981