'use strict';

/**
 * SeedChain Derivation Hierarchy (#158) — world/clock, 1/4
 * =========================================================
 *
 * One 256-bit universe constant (config or env). Every scope's seed derives
 * by its PATH through a domain-separated chain:
 *
 *   seed(path) = H('vant-seedchain\x00' || universe || path.join(':'))
 *
 * Properties tested harder than you think:
 *   - fresh-derivation determinism: two registries from the same constant
 *     derive identical bytes (a clock you wind once),
 *   - domain separation: distinct paths → distinct seeds,
 *   - prefix folding: deriving a child from a PARENT's seed differs from
 *     deriving it from the universe seed directly.
 *
 * Every subsystem that wants randomness takes seed(scopePath) instead of
 * Math.random(). Suddenly "re-run the same scenario" is a test you can write.
 *
 * Engine-parity series (world/clock, 1/4).
 */

const crypto = require('crypto');

const PATH_SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const DOMAIN = 'vant-seedchain\x00';

function _vantErr(msg, code) {
    return new (require('../error').VantError)(msg, { code, retryable: false });
}

/**
 * Resolve the universe constant, in priority order:
 *   1. explicit options.universe (hex 64 or arbitrary string)
 *   2. VANT_UNIVERSE_SEED env
 *   3. per-brain config models/private/<brain>/_config.json key `universeSeed`
 *   4. deterministic DEFAULT (derived from a fixed install-independent
 *      constant). NOT cryptographically secret — it exists so two fresh
 *      installs of the same logical config are the SAME universe, which is
 *      the entire point of #158. Override per install to shard universes.
 */
function resolveUniverse(options = {}) {
    let u = options.universe || process.env.VANT_UNIVERSE_SEED || null;
    if (!u && options.configPath) {
        try {
            const cfg = JSON.parse(fs_read(options.configPath));
            if (cfg && typeof cfg.universeSeed === 'string' && cfg.universeSeed) u = cfg.universeSeed;
        } catch (e) { /* no config yet — fall through to default */ }
    }
    if (!u) u = 'vant-default-universe\x01';
    // normalize to 32 bytes regardless of source format
    return crypto.createHash('sha256').update(DOMAIN + 'universe\x00' + u).digest();
}

// tiny fs shim keeps this module dependency-light (no ./storage pull-in)
function fs_read(p) { return require('fs').readFileSync(p, 'utf8'); }

/** Validate a scope path: segments joined by ':'. */
function validateScopePath(scopePath) {
    if (typeof scopePath !== 'string' || scopePath.length === 0) {
        throw _vantErr('seeds: scopePath must be a non-empty string', 'E_SEED_PATH');
    }
    const parts = scopePath.split(':');
    if (parts.some(p => !PATH_SEGMENT_RE.test(p))) {
        throw _vantErr('seeds: invalid scope path segment: ' + JSON.stringify(scopePath.slice(0, 60)), 'E_SEED_PATH');
    }
    return parts;
}

class SeedChain {
    /**
     * @param {object} [options] - { universe, configPath }
     */
    constructor(options = {}) {
        this.universe = resolveUniverse(options);
    }

    /**
     * Derive a 256-bit seed for a scope path. Pure function of
     * (universe, path) — deterministic across processes and restarts.
     * @returns {Buffer} 32 bytes
     */
    seed(scopePath) {
        const parts = validateScopePath(scopePath);
        const h = crypto.createHash('sha256');
        h.update(this.universe);
        h.update(Buffer.from(DOMAIN + 'scope\x00' + parts.join(':'), 'utf8'));
        return h.digest();
    }

    /** Hex form (stable string for logs/ledger — safe to store, not secret). */
    seedHex(scopePath) { return this.seed(scopePath).toString('hex'); }

    /**
     * Derive an integer in [0, max) from a scope seed — the drop-in
     * Math.random() replacement for deterministic subsystems.
     */
    seedInt(scopePath, max, salt = '') {
        if (!Number.isInteger(max) || max <= 0) {
            throw _vantErr('seeds.seedInt: max must be a positive integer', 'E_SEED_INPUT');
        }
        const h = crypto.createHash('sha256');
        h.update(this.seed(scopePath));
        h.update(Buffer.from(DOMAIN + 'int\x00' + salt, 'utf8'));
        // rejection-free: take high 48 bits (bias < 2^-16 for sane max)
        const v = h.digest().readUIntBE(0, 6);
        return v % max;
    }

    /**
     * PREFIX FOLDING (#158 acceptance #3): derive a child from a parent's
     * seed. MUST differ from deriving the same child from the universe
     * seed directly — nesting changes bytes even when the path string is
     * identical, so a leaked parent seed does not collapse the chain.
     */
    deriveChild(parentSeedBuf, childSegment) {
        if (!Buffer.isBuffer(parentSeedBuf) || parentSeedBuf.length !== 32) {
            throw _vantErr('seeds.deriveChild: parentSeed must be a 32-byte Buffer', 'E_SEED_INPUT');
        }
        if (!PATH_SEGMENT_RE.test(childSegment)) {
            throw _vantErr('seeds.deriveChild: invalid child segment', 'E_SEED_PATH');
        }
        const h = crypto.createHash('sha256');
        h.update(parentSeedBuf);
        h.update(Buffer.from(DOMAIN + 'child\x00' + childSegment, 'utf8'));
        return h.digest();
    }
}

module.exports = { SeedChain, resolveUniverse, validateScopePath, DEFAULT_DOMAIN: DOMAIN };
