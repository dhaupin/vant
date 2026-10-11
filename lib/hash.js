#!/usr/bin/env node
/**
 * Vant Hash — the ONE hashing surface (prd-canonicalization Wave C).
 *
 * sha256/crc32 were re-implemented per-module (audit, wal, vaf, state/*
 * each called crypto.createHash('sha256') at their own call site). This
 * module is the canonical surface:
 *
 *   - sha256(input)            → 64-hex digest of bytes/string
 *   - sha256H()                → incremental Hasher (same update() shape
 *                                the call sites already used, so digests
 *                                are byte-identical to the outgoing impls)
 *   - crc32(buffer)            → unsigned u32 via core zlib.crc32
 *   - canonicalBytes(value)    → state/canonical encode (the #146 encoder)
 *   - hash(value) / hmac(...)  → thin use-count helpers
 *
 * No new algorithms: delegates to core crypto/zlib. Stego (pass 178)
 * already called zlib.crc32 directly — this module is that pattern,
 * made importable.
 *
 * Rules honored (stego pattern, labs/prd-canonicalization.md §4):
 *   1. canonical module, no forked dialects
 *   2. interop helper exported (sha256H keeps legacy update() sites
 *      byte-identical during consumer migration)
 *   3. pin everything (test/hash-canon.test.js: cross-module digest
 *      equality + algorithm vectors)
 *   4. never break a read path (digests are identical bytes)
 */

'use strict';

const crypto = require('crypto');

/**
 * Incremental sha256 with the exact update() call shape the migrated
 * call sites used (`h.update(string)` / `h.update(Buffer)` / chained /
 * multi-update / `.digest('hex')` / `.digest()` raw). Keeping the shape
 * means the migration is a require-swap: digest bytes provably don't
 * move (pinned in test/hash-canon.test.js against direct crypto calls).
 */
class Hasher {
    constructor() {
        this._h = crypto.createHash('sha256');
    }
    update(data, encoding) {
        if (encoding !== undefined) this._h.update(data, encoding);
        else this._h.update(data);
        return this;
    }
    digest(encoding) {
        return encoding !== undefined ? this._h.digest(encoding) : this._h.digest();
    }
}

/** One-shot sha256. Input: string (utf8) or Buffer/Uint8Array. → 64-char hex. */
function sha256(input) {
    return crypto.createHash('sha256').update(input).digest('hex');
}

/** Incremental sha256 — for streaming/multi-part digests. */
function sha256H() {
    return new Hasher();
}

/**
 * CRC32 → unsigned u32, via core zlib (Node ≥ 20.15). The stego PNG
 * chunk checksum used exactly this call; Buffer input required.
 */
function crc32(buf) {
    const zlib = require('zlib');
    if (!Buffer.isBuffer(buf)) {
        throw new (require('./error').VantError)('hash.crc32: Buffer input required', { code: 'E_HASH_INPUT', retryable: false });
    }
    return zlib.crc32(buf) >>> 0;
}

/**
 * Canonical bytes for content-addressed hashing — the #146 deterministic
 * encoder from state/canonical. Same logical content → same bytes
 * regardless of key order or process.
 */
function canonicalBytes(value) {
    return require('./state/canonical').encode(value);
}

/** Canonical hash (hex) of a value through the canonical encoder. */
function hash(value) {
    return sha256(canonicalBytes(value));
}

/**
 * HMAC-sha256 hex — for the surfaces that keyed (encrypt.sign etc. keeps
 * its own encoding variants; this is the default hex form).
 */
function hmac(secret, data) {
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

module.exports = {
    sha256,
    sha256H,
    sha256Stream: sha256H, // alias: the streaming form
    crc32,
    canonicalBytes,
    hash,
    hmac,
    Hasher
};
