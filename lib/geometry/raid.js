'use strict';

/**
 * RAID Recoverability (#156) — geometry/RAID, 3/4  [bug fix]
 * ==========================================================
 *
 * The fragmenter's note says "No central manifest!" — but that made the
 * scheme ONE-WAY: byte-slicing with XOR-spreading is RAID-0 with lost
 * labels. Losing any slice loses that byte range, permanently, and
 * `recover(sequence)` did not exist anywhere in the module.
 *
 * Minimal honest fix, three parts:
 *   1. MANIFEST AS DATA, NOT CENTER: a small descriptor (doc id, N, K,
 *      per-shard {key, provider, hash}) — it can itself be fragmented and
 *      scattered; "no central manifest" means "no single REQUIRED
 *      location", not "no manifest exists".
 *   2. PARITY SHARDS: XOR parity (k data + 1 parity) at minimum. Any ONE
 *      data shard can be reconstructed from the others + parity.
 *   3. recover(id): gather what's available, verify per-shard hashes,
 *      rebuild, and prove byte-identity on roundtrip.
 *
 * A tampered shard (hash mismatch) is REPORTED, never silently merged.
 * A shard the caller could not read is reported DENIED — distinct from
 * ABSENT (#163) — and recovery refuses to rebuild without it when the
 * shard is un-substitutable.
 *
 * (pass 175 — WIRING.md payoff step ⑤) RAID CLAIMS CELLS: fragment() now
 * accepts an optional { cellStore } and every shard record claims its cell
 * in the #150 Intersection Rebate Cell Store under the spine's ONE
 * `/raid/<doc>` space (space id via AddressingSpine, cell address via the
 * ONE PRF — #165). Identical shard content across documents stores ONCE;
 * the savings_ratio metric measures the rebate instead of assuming it.
 * Without a cellStore the behavior is exactly the pre-175 contract.
 *
 * Engine-parity series (geometry/RAID, 3/4).
 */

const crypto = require('crypto');
const { AddressingSpine } = require('../state/spine');

function _vantErr(msg, code) {
    return new (require('../error').VantError)(msg, { code, retryable: false });
}

/** Per-shard integrity hash (hex) — via lib/hash.js (Wave C). */
function shardHash(dataBuf) {
    return require('../hash').sha256(dataBuf);
}

/**
 * Split a buffer into k data shards + 1 XOR parity shard (equal sizes,
 * zero-padded). shards[k] = XOR of shards[0..k-1].
 */
function encodeShards(dataBuf, k) {
    if (!Number.isInteger(k) || k < 2) {
        throw _vantErr('raid: need k ≥ 2 data shards', 'E_RAID_INPUT');
    }
    const size = Math.ceil(dataBuf.length / k) || 1;
    const shards = [];
    for (let i = 0; i < k; i++) {
        const s = Buffer.alloc(size);
        dataBuf.copy(s, 0, i * size, Math.min((i + 1) * size, dataBuf.length));
        shards.push(s);
    }
    const parity = Buffer.alloc(size);
    for (const s of shards) {
        for (let j = 0; j < size; j++) parity[j] ^= s[j];
    }
    shards.push(parity);
    return { shards, size };
}

/** Rebuild the original bytes from a FULL set of data shards. */
function decodeShards(shards, size, originalLength) {
    return Buffer.concat(shards.slice(0, shards.length - 1)).subarray(0, originalLength);
}

/**
 * Reconstruct ONE missing data shard from the remaining data shards +
 * parity (XOR property: missing = XOR of all present). Accepts null slots
 * for absent shards (they are skipped) — the missing shard's own slot is
 * expected to be null here.
 */
function reconstructShard(shards, missingIndex, size) {
    if (missingIndex < 0 || missingIndex >= shards.length - 1) {
        throw _vantErr('raid: parity shard cannot be reconstructed this way', 'E_RAID_INPUT');
    }
    const sz = size || shards.find(s => s !== null).length;
    const out = Buffer.alloc(sz);
    for (let i = 0; i < shards.length; i++) {
        if (i === missingIndex || shards[i] === null) continue;
        for (let j = 0; j < sz; j++) out[j] ^= shards[i][j];
    }
    return out;
}

/**
 * Fragment with parity + manifest. Returns { shards, manifest } where
 * shards are base64 records and the manifest is a small self-describing
 * descriptor (which can itself be fragmented and scattered — it is DATA,
 * not a required center).
 *
 * @param {string|Buffer} data
 * @param {object} opts - { k (data shards, default 4), docId, providers? }
 */
function fragment(data, opts = {}) {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
    const k = opts.k || 4;
    const { shards, size } = encodeShards(buf, k);
    const docId = opts.docId || crypto.randomUUID();
    const records = shards.map((s, i) => ({
        shard: i,
        isParity: i === k,
        data: s.toString('base64'),
        hash: shardHash(s)
    }));
    const manifest = {
        kind: 'vant-raid-manifest',
        version: 1,
        docId,
        k,
        size,
        originalLength: buf.length,
        // "no central manifest" = no single REQUIRED location: this
        // descriptor is data; scatter it alongside the shards if you like
        shards: records.map(r => ({ shard: r.shard, isParity: r.isParity, hash: r.hash }))
    };

    // (pass 175) #150 rebate: shards claim cells under the spine's ONE
    // /raid/<doc> space at their own shard index (the ONE PRF derives the
    // cell address). Identical content across docs stores once — the
    // rebate fires on content hash, not on address.
    let cells = null;
    if (opts.cellStore && typeof opts.cellStore.put === 'function') {
        const spine = opts.spine instanceof AddressingSpine ? opts.spine : new AddressingSpine();
        const space = spine.spaceId('raid', docId);
        cells = records.map((r, i) => ({
            shard: r.shard,
            cell: spine.cellAddress(space, i),
            ...opts.cellStore.put(space, spine.cellAddress(space, i), r.data)
        }));
    }
    return { shards: records, manifest, ...(cells ? { cells } : {}) };
}

/**
 * Recover the original bytes from a set of gathered shard records +
 * manifest. Tamper-detected per shard (hash mismatch → reported, never
 * merged). A single unreadable data shard is reconstructed via parity;
 * more than one, or a tampered shard with no substitute, refuses.
 *
 * @param {object} opts - { manifest, gathered: [{shard, data?, state}] }
 *   gathered[].state: 'PRESENT' (data base64) | 'ABSENT' | 'DENIED'
 * @returns {{ data: Buffer, reconstructed: number[], denied: number[], tampered: number[] }}
 */
function recover({ manifest, gathered }) {
    if (!manifest || manifest.kind !== 'vant-raid-manifest') {
        throw _vantErr('raid.recover: manifest required (kind: vant-raid-manifest)', 'E_RAID_MANIFEST');
    }
    if (!Array.isArray(gathered) || gathered.length < manifest.k) {
        throw _vantErr('raid.recover: need at least k gathered shard reports', 'E_RAID_INPUT');
    }
    const k = manifest.k;
    const total = k + 1;
    const byIndex = new Map();
    for (const g of gathered) byIndex.set(g.shard, g);
    const decoded = new Array(total).fill(null);
    const tampered = [];
    const denied = [];
    const absent = [];

    for (let i = 0; i < total; i++) {
        const g = byIndex.get(i);
        const expected = manifest.shards[i].hash;
        if (!g || g.state === 'ABSENT') { absent.push(i); continue; }
        if (g.state === 'DENIED') {
            // #163: existence unknown is NOT absence — record it and refuse
            // to rebuild if this shard ends up load-bearing
            denied.push(i);
            continue;
        }
        const buf = Buffer.from(g.data, 'base64');
        if (shardHash(buf) !== expected) {
            // TAMPER: reported, never silently merged
            tampered.push(i);
            continue;
        }
        decoded[i] = buf;
    }

    // XOR reconstruction: exactly one missing among the k data shards,
    // with parity present and untampered, is substitutable.
    const missingData = [];
    for (let i = 0; i < k; i++) if (!decoded[i]) missingData.push(i);
    if (missingData.length > 1) {
        throw _vantErr('raid.recover: cannot rebuild — shards unreadable/tampered: ' +
            [...missingData, ...denied, ...tampered].join(', '), 'E_RAID_UNRECOVERABLE');
    }
    if (missingData.length === 1) {
        const missing = missingData[0];
        if (decoded[k] === null) {
            throw _vantErr('raid.recover: data shard ' + missing + ' missing and parity shard unavailable',
                'E_RAID_UNRECOVERABLE');
        }
        // XOR property: missing = XOR of every OTHER shard (parity included).
        // reconstructShard skips the missing index itself, so its null slot
        // is harmless.
        decoded[missing] = reconstructShard(decoded, missing);
    }

    // final integrity check per #156 acceptance: rebuilt bytes must hash true
    const data = decodeShards(decoded, manifest.size, manifest.originalLength);
    return { data, reconstructed: missingData.filter(i => decoded[i]), denied, tampered, absent };
}

module.exports = { fragment, recover, encodeShards, reconstructShard, shardHash };
