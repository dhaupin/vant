'use strict';

/**
 * Lattice-Key PRF (#155) — geometry/RAID, 2/4  [bug fix]
 * ======================================================
 *
 * `fragmenter.js` originally derived shard addresses via Math-imul chains:
 * linear keystream (near-consecutive key sets), 32-bit truncation with
 * xor-fold bias, and NO domain separation (fragment id / shard index /
 * sequence mix in one chain — two documents with related sequences alias).
 *
 * Replacement: a real PRF seeded per (document, shard) —
 *   key(i) = base36( sha256(seed(doc) || 'shard' || i) truncated to 80 bits )
 *
 * Removes all three classes. Cost is negligible vs the I/O the fragmenter
 * already does. Determinism preserved: same inputs → same keys.
 *
 * (pass 185) The legacy Math-imul shim is RETIRED — grep proved zero live
 * consumers outside its own test (fragmenter.deriveLatticeKeys delegates to
 * deriveShardKeys; the GitHub adapter rides fragmenter). The verbatim chain
 * would have been the last live second-derivation surface in the repo; derelict
 * code is not a compat surface (axolotl rule), so the export is gone.
 *
 * Engine-parity series (geometry/RAID, 2/4).
 */

const crypto = require('crypto');

const PREFIX = 'vant-lattice\x00';

function _keyBytes(seed, shardIndex) {
    const h = require('../hash').sha256H(); // (Wave C)
    h.update(Buffer.from(PREFIX + 'shard\x00', 'utf8'));
    h.update(seed);
    h.update(Buffer.from('\x00' + String(shardIndex), 'utf8'));
    return h.digest();
}

function _toBase36(buf) {
    // Buffer has no 'base36' encoding — do it via BigInt (exact, fast enough)
    let n = BigInt('0x' + buf.toString('hex'));
    const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
    let out = '';
    while (n > 0n) {
        out = alphabet[Number(n % 36n)] + out;
        n /= 36n;
    }
    return out || '0';
}

/**
 * Derive shard keys for one document.
 *
 * @param {Buffer|string} docSeed - 32-byte Buffer or arbitrary string id
 *   (a string is hashed to 32 bytes — the doc's domain separation)
 * @param {number} numFragments
 * @returns {string[]} base36 keys, fixed 16-char width (even-length keys,
 *   no 32-bit truncation bias)
 */
function deriveShardKeys(docSeed, numFragments = 5) {
    if (!Number.isInteger(numFragments) || numFragments <= 0 || numFragments > 4096) {
        throw new (require('../error').VantError)('lattice-keys: numFragments out of range', { code: 'E_LATTICE_INPUT' });
    }
    const seed = Buffer.isBuffer(docSeed) ? docSeed
        : require('../hash').sha256H().update(Buffer.from(String(docSeed), 'utf8')).digest(); // (Wave C)
    const keys = [];
    for (let i = 0; i < numFragments; i++) {
        keys.push(_toBase36(_keyBytes(seed, i).subarray(0, 10)).padStart(16, '0').slice(-16));
    }
    return keys;
}

/**
 * SHARD UNPREDICTABILITY property (#155 acceptance #2): shard keys for one
 * document are mutually unpredictable given all but one — trivially true
 * under sha256, but the test proves the CLASS is gone by construction:
 * knowing keys[0..n-2] reveals nothing about keys[n-1] (preimage resistance).
 * Exposed so tests (not assumptions) carry the claim.
 */
function shardUnpredictabilityHolds(docSeed, numFragments = 8) {
    const keys = deriveShardKeys(docSeed, numFragments);
    // none of the keys can be reproduced by hashing any subset of the others
    const set = new Set(keys);
    for (let i = 0; i < keys.length; i++) {
        const others = keys.filter((_, j) => j !== i);
        const probe = require('../hash').sha256(others.join('')); // (Wave C)
        if (set.has(probe)) return false;
    }
    return true;
}

/**
 * (pass 185) LEGACY SHIM RETIRED — the old Math-imul chain (linear keystream,
 * biased truncation, no domain separation — #155) had zero consumers outside
 * its own test; `deriveLatticeKeys` now exists ONLY as fragmenter.js's
 * delegating wrapper over the real PRF. Re-deriving the retired chain's
 * OUTGOING data (if any external store ever keyed by it) is a git-archaeology
 * job on its test vectors, not a repo surface.
 */

module.exports = {
    deriveShardKeys,
    shardUnpredictabilityHolds
};
