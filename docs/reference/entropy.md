# Entropy-Patch Protocol

> Token-aware latent transport for Vant v0.8.4+

## What is Entropy-Patch?

**Entropy-Patch** is a compression protocol that separates high-entropy data (unique, random-looking content) from low-entropy data (repeated, predictable patterns). It transforms Vant from a "Context Storage" system into a "Latent Transport" system.

### Why Does It Exist?

LLMs are token-limited. Loading 19 brain files on startup is expensive. Entropy-Patch enables:

1. **Token reduction** - Agents load one `.vpatch` file instead of 19 `.md` files
2. **Git-native diffs** - Tracks entropy spikes instead of line changes
3. **Selective hydration** - Load only the high-entropy portions needed

## How It Works

### 1. Windowed Entropy Scan

The algorithm scans data with a sliding window (default 8 bytes), calculating Shannon entropy for each position:

```
Input: "aaaaaaaaXYaabcdefg..."
         ↓ entropy scan
Output: [stable][spike][stable][spike]...
```

**Shannon Entropy Formula:**
```
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

```
"spikes:0.92,0.88,0.91"  →  3 high-entropy regions
"stable:AAAA...BBBB"    →  all low-entropy
```

This enables lightweight "what changed" queries without full hydration.

## Use Cases

### Use Case 1: Brain Compression

Compress Vant's brain files for faster loading:

```bash
# Compress all brain files
vant compress models/public/ --output models/latent

# Now agents can load:
# - models/latent/*.vpatch  (instead of models/public/*.md)
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
# Get stats on any file
vant compress models/public/goals.md --stats
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

### generatePatches()

```javascript
const entropy = require('./lib/entropy');

const patches = entropy.generatePatches(buffer, {
    windowSize: 8,     // sliding window (default: 8)
    threshold: 0.85,  // entropy threshold (default: 0.85)
});

// Returns: [{ type: 'stable'|'spike', data: base64, start, end, entropy? }]
```

### generateVPatch()

```javascript
const vpatch = await entropy.generateVPatch(input, outputPath, options);

// Returns: { version, created, type, latentSeed, patches, metadata }
```

### hydratePatches()

```javascript
const hydrated = entropy.hydratePatches(patches);
// Returns: Buffer (lossless reconstruction)
```

### getEntropyStats()

```javascript
const stats = entropy.getEntropyStats(buffer);

// Returns: { overall, min, max, mean, chunkCount, byteCount }
```

## Configuration

### Defaults

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `windowSize` | 8 | 1-1024 | Bytes per sliding window |
| `threshold` | 0.85 | 0-1 | Entropy cutoff for spike detection |

### Tuning

- **Lower threshold** (`0.7`) = More spikes detected, better compression
- **Higher threshold** (`0.9`) = Fewer spikes, faster processing
- **Larger window** (`16`) = Slower but more accurate entropy detection

## File Format

### .vpatch Structure

```json
{
  "version": "1.0.0",
  "created": "2024-01-15T10:30:00.000Z",
  "type": "vant-patch",
  "latentSeed": "spikes:0.92,0.88",
  "patches": [
    { "type": "stable", "data": "YWFhYWE=", "start": 0, "end": 100 },
    { "type": "spike", "data": "eDhVkjRt", "entropy": 0.92, "start": 100, "end": 108 },
    { "type": "stable", "data": "YWJjZGVm", "start": 108, "end": 200 }
  ],
  "metadata": {
    "totalPatches": 3,
    "spikeCount": 1,
    "stableCount": 2
  }
}
```

## Security

All paths are validated through VAF (Vant Application Firewall):
- Path traversal blocked
- No arbitrary file writes outside latent dir

## Related

- [CLI.md](../CLI.md#compress) - compress command
- [LIBS.md](../LIBS.md#entropyjs) - module reference
- [schema.md](./schema.md) - brain file schema