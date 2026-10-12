---
version: 0.8.6
permalink: /reference/entropy
layout: default
title: Entropy Patching Protocol
nav_order: 125
---

# Entropy Patching Protocol

> Token-aware latent transport for Vant v0.8.6+

## What is Entropy Patching?

**Entropy Patching** is a compression protocol that separates high-entropy data (unique, random-looking content) from low-entropy data (repeated, predictable patterns). It transforms Vant from a "Context Storage" system into a "Latent Transport" system.

### Why Does It Exist?

LLMs are token-limited. Loading 60+ brain files on startup is expensive. Entropy Patching enables:

1. **Token reduction** - Agents load one `.vpatch` file instead of 19 `.md` files
2. **Git-native diffs** - Tracks entropy spikes instead of line changes
3. **Selective hydration** - Load only the high-entropy portions needed

## How It Works

### 1. Windowed Entropy Scan

The algorithm scans data with a sliding window (default 8 bytes), calculating Shannon entropy for each position:

```text
Input: "aaaaaaaaXYaabcdefg..."
         ↓ entropy scan
Output: [stable][spike][stable][spike]...
```

**Shannon Entropy Formula:**
```text
H = -Σ P(x) log₂ P(x)  (normalized 0-1)
```

- `H < 0.5` = predictable, repetitive (stable)
- `H > 0.85` = unique, random-looking (spike)

### 2. Stable vs Spike

| Type | Description | Example |
|------|-------------|---------|
| **stable** | Low entropy, repetitive | `aaaaaaaa`, `00000000` |
| **spike** | High entropy, unique | binary data, encrypted content |

### 3. Latent Seed

The seed is a semantic summary - not the data itself, but a summary:

```text
"spikes:0.92,0.88,0.91"  →  3 high-entropy regions
"stable:AAAA...BBBB"    →  all low-entropy
```

This enables lightweight "what changed" queries without full hydration.

## Use Cases

### Use Case 1: Brain Compression

Compress Vant's brain files for faster loading:

```bash
# Compress all brain files (use $MODEL_PATH or models/private/)
vant compress ${MODEL_PATH:-models/private}/ --output models/latent

# Now agents can load:
# - models/latent/*.vpatch  (instead of models/private/*.md)
```

### Use Case 2: Generational Evolution

When updating a chapter in your novel, only the spike that changed gets a new commit:

```bash
# Update chapter 4 (creates new spike commit, not full file)
vant compress novel/chapter4.md --output novel/latent
git commit -m "Updated chapter 4"
```

### Use Case 3: Delta Queries

Ask lightweight questions without full hydration:

```bash
# Get stats on any file (use $MODEL_PATH or models/private/)
vant compress ${MODEL_PATH:-models/private}/goals.md --stats
```

## CLI Commands

### Statistics

```bash
vant compress <file> --stats

# Output:
# File: goals.md
# Size: 2,547 bytes
# Overall Entropy: 0.6234
# Compression Potential: LOW
```

### Compress

```bash
vant compress <file>              # Single file
vant compress <dir>/               # Directory
vant compress <file> -o <output>  # Custom output
vant compress <file> -w 16         # Custom window size
vant compress <file> -t 0.9       # Custom threshold
```

### Decompress

```bash
vant compress <file.vpatch> --decompress
```

## API Reference

The implementation is `lib/entropy-patch.js` (require it directly):

```javascript
const entropy = require('./lib/entropy-patch');
```

### scan()

Windowed entropy scan (the classifier behind everything else):

```javascript
const scanned = entropy.scan(buffer, { windowSize: 8, threshold: 0.85 });
// scanned.chunks: [{ offset, length, entropy: H(n), kind: 'stable'|'spike' }...]
// scanned.stats: { min, max, mean, overall, stableCount, spikeCount,
//                  totalPatches, byteCount, windowSize, threshold }
```

### getEntropyStats()

```javascript
const stats = entropy.getEntropyStats(buffer, opts);
// { byteCount, overall, min, max, mean, stableCount, spikeCount,
//   totalPatches, windowSize, threshold }
```

### compress() and decompress()

Lossless: segments store the ORIGINAL bytes verbatim (base64 in the
envelope); `decompress()` concatenates them back and verifies the seed.

```javascript
const result = entropy.compress(bufferOrPath, outputDir, { windowSize, threshold });
// { path: '<out>/<name>.vpatch', latentSeed: <sha256 of ORIGINAL>, metadata }

const back = entropy.decompress(vpatchPath, outputPath);
// { path, byteCount } - original byte length restored exactly
```

Tamper-EVIDENCE: the latent seed is `lib/hash.sha256` of the original
content. `decompress()` recomputes it over the restored bytes and REFUSES
on mismatch - a mutated .vpatch fails loudly, never restores silently.

### shannonEntropy()

```javascript
entropy.shannonEntropy(buffer); // H(bytes), normalized 0-1
```

## Configuration

### Defaults

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `windowSize` | 8 | 1-1024 | Bytes per sliding window |
| `threshold` | 0.85 | 0-1 | Entropy cutoff (H below = stable) |

### Adaptive Mode

Self-calibrating threshold from the data itself:

```javascript
const patch = entropy.createAdaptivePatch(buffer, { sensitivity: 1.5, windowSize: 8 });
// pass 1: mean/stddev of chunk entropies; threshold = mu + k*sigma
// patch.stats: { threshold, mu, sd, windowSize, sensitivity }
// patch.metadata: spike/stable counts at the calibrated threshold
```

**Algorithm:** `threshold = μ + k × σ` (rolling mean + k × standard deviation)

| Option | Default | Range | Description |
|--------|---------|-------|-------------|
| `sensitivity` | 1.5 | 0.1-10 | k-factor for threshold (lower = more spikes) |
| `windowSize` | 64 | 1-1024 | Bytes per sliding window |
| `historyLimit` | 1000 | 10-10000 | Max entropy history to track |

**CLI Usage:**
```bash
vant compress file.md --adaptive         # auto threshold
vant compress file.md -a -k 2.0         # custom sensitivity
vant compress file.md --stats           # view entropy stats first
```

### Tuning

- **Lower threshold** (`0.7`) = more segments labeled spike
- **Higher threshold** (`0.9`) = fewer spikes, faster processing
- **Larger window** = fewer chunks, coarser detection

## File Format

### .vpatch Structure (real envelope, lib/entropy-patch.js)

```json
{
  "version": 1,
  "format": "vpatch",
  "source": "identity.md",
  "createdAt": "2026-10-12T00:00:00.000Z",
  "params": { "windowSize": 8, "threshold": 0.85 },
  "latentSeed": "<sha256 of the ORIGINAL bytes>",
  "metadata": {
    "byteCount": 1714, "windowSize": 8, "threshold": 0.85,
    "min": 0.125, "max": 0.375, "mean": 0.3367, "overall": 0.3367,
    "stableCount": 215, "spikeCount": 0, "totalPatches": 215
  },
  "segments": [
    { "kind": "stable", "offset": 0, "length": 8, "entropyMax": 0.125 }
  ],
  "segmentsData": ["<base64 of the EXACT original bytes, per segment>"]
}
```

Lossless by construction: the concatenation of `segmentsData` (in
`segments` offset order) IS the original file. `decompress()` restores
it exactly and verifies the latent seed.

## Security

- Capability gate: output requires sandbox `canWrite`. A fresh default
  sandbox self-grants with a printed notice (same posture as `vant
  snapshot`/`vant clean`); an explicitly locked-down sandbox refuses.
- Tamper-EVIDENCE: latent seed (sha256 of original) is verified on every
  `decompress()`; a mutated envelope refuses loudly.
- Writes go to the requested output dir only (`models/latent` default).
- Hash source: `lib/hash.js` (the one hash source).

## Related

- [CLI Reference](/vant/reference/cli) - compress command

---

## Generational Optimization Guide

Tips for tuning Entropy Patching in production autonomous sessions.

### 1. The Sensitivity Sweet Spot

The `k` factor (sensitivity) controls threshold = μ + k×σ:

| k Value | Behavior | Use Case |
|--------|----------|----------|
| 0.5-1.0 | Lower threshold, more spikes | Token-limited agents |
| 1.5 | Default (balanced) | General use |
| 2.0+ | Higher threshold, less pruning | Agents feel "forgetful" |

**Tuning tips:**
- Agent feels "forgetful" -> increase k (pruning too much)
- Hitting token limits -> decrease k (too many spikes)

### 2. Calibration Phase (Recommended)

Run a quick calibration on first autonomous session:

```javascript
const patch = entropy.createAdaptivePatch(sample, { sensitivity: 1.5 });
console.log('Auto-calibrated threshold:', patch.stats.threshold);
```

Recommended: Add to `vant start` sequence for auto k-detection.

### 3. Semantic Seed (Anchoring)

The latent seed is a CONTENT anchor (sha256 of the original bytes),
used for tamper evidence on restore. If you want a LLM-facing semantic
anchor ("where to place" restored high-entropy data), store a summary
in your brain alongside the .vpatch - the envelope is byte-discipline,
not prose.

### 4. Generational Evolution

Track entropy drift across sessions by comparing the `overall` stat of
two .vpatch files for the same source:

```javascript
const a = entropy.getEntropyStats(oldContent);
const b = entropy.getEntropyStats(newContent);
// |b.overall - a.overall| small = stable evolution; large = review
```
- [schema.md](/vant/reference/schema) - brain file schema