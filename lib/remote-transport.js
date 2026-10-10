/**
 * RemoteTransport — the ONE sync/security seam (Wave F, prd-canonicalization §7)
 *
 * The stacks that "send state elsewhere": lib/sync.js (git providers via
 * lib/remote.GitProvider), lib/org-sync.js, lib/agora-sync.js,
 * lib/connectors/s3.js (SigV4 remote), plus any future remote. Each
 * carried its own auth lookup, retry classification, and verify step —
 * five dialects of the same job.
 *
 * The git-connector argv-array hardening (pass QC — test/git-injection
 * pins) is the shared SECURITY TEMPLATE, made requirable here:
 *   1. auth() is the ONE door to credentials — never read tokens off
 *      the wire, config, or callers' args
 *   2. input validators are fail-closed and shared (_refLike, _secretLike)
 *   3. retry classification is shared: transient (429/5xx/timeouts) wants
 *      retry; 4xx (except 429) and wall-blocks never retry
 *   4. verify() must be honest: a transport that cannot verify says so
 *      (false), never blesses silently
 *
 * Adoption is PER-STACK and incremental (no forced migration in one
 * PR): each adopter replaces its private auth/retry with the shared
 * one and gains the adversarial suite by construction. The abstract
 * class throws on every method an adopter has not implemented —
 * fail-closed, never a silent no-op.
 *
 * Pinned by test/remote-transport.test.js.
 */
'use strict';

const crypto = require('crypto');
const errors = require('./error');

function _vantErr(msg, code, retryable = false) {
    return new errors.VantError(msg, { code, retryable });
}

// ==================== SHARED INPUT VALIDATORS (the _gitRef pattern) ====================

/**
 * Fail-closed ref/name validator (the _gitRef template): string only,
 * conservative regex, bounded length. Used for refs, remote names,
 * stream names — anything that will end up on a wire or in an argv.
 */
const ALLOWED_NAME = /^(?:[A-Za-z0-9][A-Za-z0-9._\/-]{0,150})$/;

function refLike(name, what = 'ref') {
    if (typeof name !== 'string' || !ALLOWED_NAME.test(name)) {
        throw _vantErr(`Invalid ${what}: ${String(name).slice(0, 40)}`, errors.CODES.VAF_INPUT_INVALID);
    }
    return name;
}

/**
 * Secret-like: non-empty string of bounded length, no control chars.
 * Never echoed back — errors carry only the prefix.
 */
function secretLike(value, what = 'secret') {
    if (typeof value !== 'string' || value.length === 0 || value.length > 4096) {
        throw _vantErr(`Invalid ${what} (empty, too long, or wrong type)`, errors.CODES.VAF_INPUT_INVALID);
    }
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f]/.test(value)) {
        throw _vantErr(`Invalid ${what} (control characters)`, errors.CODES.VAF_INPUT_INVALID);
    }
    return value;
}

/**
 * Bounded JSON-safe payload guard for push() bodies.
 */
function payloadLike(value, what = 'payload') {
    if (value === undefined) throw _vantErr(`${what} required`, errors.CODES.VAF_REQUIRED_FIELD);
    try { JSON.stringify(value); } catch (e) {
        throw _vantErr(`${what} is not JSON-serializable`, errors.CODES.VAF_INPUT_INVALID);
    }
    return value;
}

// ==================== SHARED RETRY POLICY (the _requestJson classifications) ====================

const DEFAULT_RETRY_POLICY = Object.freeze({
    maxAttempts: 3,
    baseMs: 1000,
    maxMs: 30000,
    multiplier: 2
});

/**
 * Classify a thrown error for retry — shared with GitProvider._requestJson's
 * semantics: transient codes/HTTP classes retry, client errors never.
 * @returns {{ retryable: boolean, delayMs: number|null, attemptsLeft: number }}
 */
function classifyError(err, attempt, policy = DEFAULT_RETRY_POLICY) {
    const retryable = err instanceof errors.VantError
        ? err.retryable === true
        : /timeout|econnreset|econnrefused|socket hang up|429|rate limit/i.test(String(err && err.message));
    // an attempt number beyond the ladder is a caller bug, not a retry:
    // report it non-retryable (null delay) rather than inventing a delay
    // for an attempt that cannot happen (matches _run's loop bounds).
    if (!retryable || attempt >= policy.maxAttempts) {
        return { retryable: false, delayMs: null, attemptsLeft: 0 };
    }
    const exponent = Math.min(attempt - 1, 16); // bound the exponent: 2^16 × base ≥ maxMs for sane configs
    const delayMs = Math.min(policy.baseMs * Math.pow(policy.multiplier, exponent), policy.maxMs);
    return { retryable: true, delayMs, attemptsLeft: policy.maxAttempts - attempt };
}

// ==================== THE INTERFACE ====================

class RemoteTransport {
    constructor(options = {}) {
        this.name = options.name || this.constructor.name;
        // Shared policy; adopters may override via options.
        this.retryPolicy = { ...DEFAULT_RETRY_POLICY, ...(options.retryPolicy || {}) };
        // Credential redaction state: once auth() succeeds the token lives
        // only inside the closure scope the adopter keeps — never `this`.
        this._authResolvedCount = 0;
        this._verifyCount = 0;
    }

    /** Human-readable id for logs (never includes secrets). */
    describe() { return `${this.name}#${process.pid}`; }

    /**
     * THE ONE CREDENTIAL DOOR. Returns the resolved credential/token or
     * null (anonymous transport). Adopters MUST source secrets here —
     * from config/env they own — and MUST NOT stash them on instance
     * fields (redaction by construction; error paths cannot leak them).
     * Base impl throws so an adopter without auth can't inherit a
     * silent null it did not choose.
     */
    auth() {
        throw _vantErr(`${this.describe()}: auth() not implemented — implement or explicitly override to return null for anonymous`, 'E_TRANSPORT_AUTH_MISSING');
    }

    /**
     * Send state outward. Returns a transport-result object:
     *   { ok: boolean, ref?: string, bytes?: number, error?: VantError }
     * Base impl throws: an adopter that cannot push must say so loudly.
     */
    async push(/* ref, payload, opts */) {
        throw _vantErr(`${this.describe()}: push() not implemented`, 'NOT_IMPLEMENTED');
    }

    /**
     * Receive state. Same result contract as push().
     */
    async pull(/* ref, opts */) {
        throw _vantErr(`${this.describe()}: pull() not implemented`, 'NOT_IMPLEMENTED');
    }

    /**
     * Honest verification (e.g. digest check of remote state vs local).
     * MUST return true/false — never 'probably'. Base impl returns
     * false (cannot verify) so an adopter that skips implementation is
     * reported as unverified, never silently blessed.
     */
    async verify(/* conservationHint */) {
        this._verifyCount++;
        return false;
    }

    // ---------- shared execution wrapper (auth + retry + classify) ----------

    /**
     * Run an op with the shared ceremony: resolve auth via auth() once per
     * call, classify failures via classifyError, sleep between attempts,
     * and NEVER retry non-retryable errors. `op` receives the token
     * (or null) — it should not re-read secrets.
     * @returns the op's result on success
     * @throws the last error when all attempts exhaust or an attempt is
     *   classified non-retryable
     */
    async _run(op, { attempts = null } = {}) {
        const maxAttempts = attempts || this.retryPolicy.maxAttempts;
        const token = this.auth();
        this._authResolvedCount++;
        let lastErr = null;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await op(token);
            } catch (err) {
                lastErr = err;
                const cls = classifyError(err, attempt, this.retryPolicy);
                if (!cls.retryable) {
                    throw err instanceof errors.VantError ? err
                        : _vantErr(String(err && err.message || err), errors.CODES.REMOTE_CONN_FAILED, false);
                }
                // note: REMOTE_CONN_FAILED is a real CODES entry (line 114)
                if (attempt < maxAttempts && cls.delayMs > 0) {
                    await new Promise(r => setTimeout(r, cls.delayMs));
                }
            }
        }
        throw lastErr instanceof errors.VantError ? lastErr
            : _vantErr(String(lastErr && lastErr.message || lastErr), errors.CODES.REMOTE_CONN_FAILED, true);
    }
}

module.exports = {
    RemoteTransport,
    refLike,
    secretLike,
    payloadLike,
    classifyError,
    DEFAULT_RETRY_POLICY
};
