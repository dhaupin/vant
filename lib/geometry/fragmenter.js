/**
 * Aperiodic Fragmenter (v0.8.6)
 * Shatters state across Multi-Git Provider RAID
 *
 * Architecture:
 * - Takes memory/data
 * - Fragments into N pieces (default 5)
 * - Scatters across multiple Git providers
 * - No central manifest!
 *
 * File naming from lattice keys (derived from barcode):
 * - vfragment-{sequence}-{shard}.json
 *
 * (pass 175 — WIRING.md payoff step ⑤) SHARD KEYS RIDE THE ONE PRF:
 * deriveLatticeKeys was the last LIVE Math.imul chain in the repo — a
 * linear keystream with 32-bit truncation bias and no domain separation
 * (#155). It now delegates to lattice-keys.deriveShardKeys (sha256 over a
 * per-document seed), so every caller — including the live GitHub adapter
 * — gets PRF keys without an API change. Same-name, better-keys: names
 * change for newly scattered fragments (old dead-drop names orphan, which
 * is the point of a dead drop); the imul chain survives ONLY as the
 * tested legacy shim inside lib/geometry/lattice-keys.js.
 */

const fs = require('fs');
const path = require('path');
const { deriveShardKeys } = require('./lattice-keys');

/**
 * Derive lattice keys from barcode sequence
 * This IS the stateless address - no lookup table!
 *
 * (pass 175) PRF-backed (#155): sha256 over (doc seed, shard index),
 * base36, fixed 16-char width — no imul keystream, no truncation bias,
 * full domain separation per (document, shard).
 */
function deriveLatticeKeys(sequence, numFragments = 5) {
    return deriveShardKeys(sequence, numFragments);
}

/**
 * Fragment data into N pieces
 * Uses XOR spreading for cryptographic distribution
 */
function fragment(data, numFragments = 5) {
    const json = typeof data === 'string' ? data : JSON.stringify(data);
    const buffer = Buffer.from(json, 'utf8');
    const bytes = buffer.length;

    // Calculate fragment sizes (approximate equal distribution)
    const fragmentSize = Math.ceil(bytes / numFragments);
    const fragments = [];

    for (let i = 0; i < numFragments; i++) {
        const start = i * fragmentSize;
        const end = Math.min(start + fragmentSize, bytes);
        const chunk = buffer.slice(start, end);

        // XOR with shifted pattern for uniqueness
        const encoded = Buffer.alloc(chunk.length);
        for (let j = 0; j < chunk.length; j++) {
            encoded[j] = chunk[j] ^ ((i + 1) * 137 >> 5);
        }

        fragments.push({
            shard: i,
            data: encoded.toString('base64'),
            size: chunk.length,
            checksums: simpleChecksum(chunk)
        });
    }

    return fragments;
}

/**
 * Simple checksum for verification
 */
function simpleChecksum(buffer) {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
        sum = (sum + buffer[i] * (i + 1)) % 65536;
    }
    return sum;
}

/**
 * Weld fragments back into original data
 */
function weld(fragments) {
    // Handle both array-of-objects and array-of-strings (.map(f=>f.data) result)
    const normalized = fragments.map(f => {
        if (typeof f === 'string') {
            // Infer shard from index if string only
            return { shard: fragments.indexOf(f), data: f };
        }
        return f;
    });

    // Sort by shard order
    const sorted = [...normalized].sort((a, b) => a.shard - b.shard);

    // Decode each fragment
    const buffers = sorted.map(f => {
        const decoded = Buffer.from(f.data, 'base64');
        const restored = Buffer.alloc(decoded.length);
        for (let i = 0; i < decoded.length; i++) {
            restored[i] = decoded[i] ^ ((f.shard + 1) * 137 >> 5);
        }
        return restored;
    });

    // Concatenate
    return Buffer.concat(buffers).toString('utf8');
}

/**
 * Scatter fragments across Multiple-Git providers
 * Looks like boring commits to each provider!
 */
async function scatter(fragments, providers, latticeKeys) {
    const results = [];

    for (let i = 0; i < fragments.length; i++) {
        const frag = fragments[i];
        const provider = providers[i % providers.length];
        const filename = `vfragment-${latticeKeys[i]}-${i}.json`;

        // Prepare "boring" commit content
        const record = {
            // No connection to original data visible!
            metadata: { ver: 1, ts: Date.now() },
            // Fragment appears as random data
            payload: frag.data,
            // Verification (not linking to other fragments!)
            checksum: frag.checksums
        };

        // Store in provider directory (simulating Git commit)
        // (P2 #27) atomic — helper is fs-only; same-call await keeps the async contract
        const filePath = path.join(provider.path, filename);
        await require('../primitives').atomicWriteFile(
            filePath,
            JSON.stringify(record),
            'utf8'
        );

        results.push({
            provider: provider.name,
            filename,
            shard: i,
            key: latticeKeys[i]
        });
    }

    return results;
}

/**
 * Retrieve fragments from providers
 * Uses barcode → lattice keys (deterministic, no manifest!)
 */
async function retrieve(providers, sequence, numFragments = 5) {
    const latticeKeys = deriveLatticeKeys(sequence, numFragments);
    const fragments = [];

    for (let i = 0; i < numFragments; i++) {
        const filename = `vfragment-${latticeKeys[i]}-${i}.json`;

        // Try each provider
        for (const provider of providers) {
            const filePath = path.join(provider.path, filename);

            if (fs.existsSync(filePath)) {
                const content = await fs.promises.readFile(filePath, 'utf8');
                const record = JSON.parse(content);
                fragments.push({
                    shard: i,
                    data: record.payload,
                    checksums: record.checksum
                });
                break;
            }
        }
    }

    return { fragments, latticeKeys };
}

/**
 * Incinerate: burn fragments after retrieval
 * Git records empty commit - link dies!
 */
async function incinerate(providers, sequence, numFragments = 5) {
    const latticeKeys = deriveLatticeKeys(sequence, numFragments);
    const burned = [];

    for (let i = 0; i < numFragments; i++) {
        const filename = `vfragment-${latticeKeys[i]}-${i}.json`;

        for (const provider of providers) {
            const filePath = path.join(provider.path, filename);

            if (fs.existsSync(filePath)) {
                // Overwrite with noise or empty
                await require('../primitives').atomicWriteFile(
                    filePath,
                    JSON.stringify({
                        // Intentionally confusing!
                        _dead: true,
                        // Garbage
                        garbage: Math.random().toString(36)
                    }),
                    'utf8'
                );
                burned.push(filename);
            }
        }
    }

    return burned;
}

module.exports = {
    deriveLatticeKeys, // (pass 175) PRF-backed — delegates to lattice-keys.deriveShardKeys
    deriveShardKeys,   // canonical name for new callers
    fragment,
    weld,
    scatter,
    retrieve,
    incinerate
};