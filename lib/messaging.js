/**
 * Vant Messaging — the shared envelope seam (Wave E, prd-canonicalization §6)
 *
 * The trio (ownership CHARTER — overlaps are BANNED, no dual-ownership
 * channels — full table in labs/prd-canonicalization.md §6):
 *   - lib/msg.js       CONVERSATION store + in-process channel pub/sub
 *   - lib/stream.js    WORK QUEUE: durable task rows, lease, complete/fail
 *   - lib/crew-bus.js  PEER TRANSPORT: HMAC-signed cross-node envelopes
 *
 * What THIS module owns: the one thing the trio shares today and must
 * not fork — the ENVELOPE SHAPE crew-bus puts on the wire:
 *   { event: 'crew.<type>', from, type, payload, ts, nonce, v: { major, minor } }
 * plus the receiver's version gate (major strict, minor additive) that
 * Wave E made the envelope's parsing contract.
 *
 * Why a separate module: msg and stream are allowed to ride an envelope
 * (msg snapshots to peers, stream tasks delegated cross-node) without
 * requiring crew-bus (which pulls webhooks/network — wrong weight for an
 * in-process conversation store). They require THIS; crew-bus imports
 * THIS for its stamp-maker. One envelope, one version gate, zero forks.
 *
 * Design rules (stego pass, carried here):
 *   1. canonical module — crew-bus's shape is THE shape, moved here
 *      verbatim (byte-identical fields; crew-bus consumes the helpers)
 *   2. interop helpers exported (make/validate/versionGate)
 *   3. pinned (test/messaging-envelope.test.js)
 *   4. never break the read path — crew-bus still accepts unstamped
 *      pre-Wave-E envelopes as v1.0 (tolerance preserved exactly)
 */
'use strict';

const crypto = require('crypto');

// The envelope version stamp: MAJOR bumps change the parsing contract
// (receivers that don't know the major refuse loudly); MINOR is additive.
const ENVELOPE_VERSION = { major: 1, minor: 0 };

function _validVersion(v) {
    // shape-valid: major ≥ 1 on the WIRE contract; a well-shaped {0,x} is
    // a shape-valid-but-unsupported claim → the GATE reports 'past-major'
    // (loud refuse), mirroring crew-bus's pass-61 matcher semantics.
    return v === null || v === undefined
        || (typeof v === 'object' && !Array.isArray(v)
            && Number.isFinite(v.major) && v.major >= 0 && v.major <= 1000
            && Number.isFinite(v.minor) && v.minor >= 0 && v.minor <= 1000);
}

// Test/ops seam: stage this receiver's version (crew-bus delegates here).
function setReceiverVersion(v) {
    if (!_validVersion(v) || !v || v.major < 1) {
        throw new (require('./error').VantError)('Invalid receiver version', { code: 'E_INPUT', retryable: false });
    }
    ENVELOPE_VERSION.major = v.major;
    ENVELOPE_VERSION.minor = v.minor;
    return { ...ENVELOPE_VERSION };
}

/**
 * Build ONE envelope of the trio's shared shape.
 * @param {string} type    - topic ('agenda.publish', 'work.offer', …)
 * @param {object} payload - opaque body (any JSON value)
 * @param {object} [opts]  - { from, nonce, receiverVersion, eventPrefix }
 * @returns {object} the envelope (fresh ts; nonce seq'd by caller or here)
 */
function makeEnvelope(type, payload, opts = {}) {
    if (typeof type !== 'string' || !type) {
        throw new (require('./error').VantError)('messaging.makeEnvelope: type required', { code: 'E_INPUT', retryable: false });
    }
    if (payload === undefined) {
        throw new (require('./error').VantError)('messaging.makeEnvelope: payload required (send null for clarity)', { code: 'E_INPUT', retryable: false });
    }
    const prefix = typeof opts.eventPrefix === 'string' ? opts.eventPrefix : 'crew';
    return {
        event: prefix + '.' + type,
        from: opts.from !== undefined ? opts.from : 'local',
        type,
        payload,
        ts: Date.now(),
        nonce: Number.isFinite(opts.nonce) ? opts.nonce : crypto.randomBytes(4).readUInt32BE(0),
        v: opts.receiverVersion ? { ...opts.receiverVersion } : { ...ENVELOPE_VERSION }
    };
}

/**
 * Validate shape only (from/type/payload present, event matches type).
 * Cross-node integrity (HMAC verify, scope gates, peer vetting) stays
 * with the transport that received it — crew-bus for the wire.
 */
function validateEnvelope(env, opts = {}) {
    const prefix = typeof opts.eventPrefix === 'string' ? opts.eventPrefix : 'crew';
    if (!env || typeof env !== 'object' || Array.isArray(env)) return false;
    if (env.from == null || env.type == null || env.payload === undefined) return false;
    if (env.event !== prefix + '.' + env.type) return false;
    return _validVersion(env.v);
}

/**
 * The receiver's VERSION GATE (crew-bus's Wave-E contract, shared):
 *   malformed v → 'invalid'
 *   future MAJOR → 'future-major' (loud refuse: contract unknown)
 *   past MAJOR → 'past-major' (loud refuse: fields may be missing)
 *   MINOR mismatch → 'minor-diff' (+ tolerated)
 *   match, or missing v (pre-stamp v1.0 sender) → 'ok'
 * @returns {{ ok: boolean, verdict: string, detail?: string }}
 */
function versionGate(v) {
    if (!_validVersion(v)) return { ok: false, verdict: 'invalid' };
    if (v && v.major !== ENVELOPE_VERSION.major) {
        return { ok: false, verdict: v.major > ENVELOPE_VERSION.major ? 'future-major' : 'past-major' };
    }
    if (v && v.minor !== ENVELOPE_VERSION.minor) {
        return { ok: true, verdict: 'minor-diff', detail: 'additive tolerated' };
    }
    return { ok: true, verdict: 'ok' };
}

/**
 * HMAC-sign/verify an envelope body — same Encrypt primitive crew-bus
 * signs with; exported so msg/stream deputies use the identical ceremony.
 */
function signEnvelope(env, secret) { return require('./encrypt').hmacSign(JSON.stringify(env), secret); }
function verifyEnvelope(env, secret, signature) {
    return require('./encrypt').hmacVerify(JSON.stringify(env), secret, signature);
}

module.exports = {
    ENVELOPE_VERSION,
    setReceiverVersion,
    makeEnvelope,
    validateEnvelope,
    versionGate,
    signEnvelope,
    verifyEnvelope
};
