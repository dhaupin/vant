/**
 * Gate - shared safe-by-default security chain helpers (v0.9.0)
 *
 * Extracts the capability/rate-limit gate pattern that was cloned inline in
 * trust.js, market.js, memory.js (and mirrors storage.js). One implementation
 * instead of four divergent copies.
 *
 * SAFE-BY-DEFAULT SEMANTICS (single source of truth):
 * - Sandbox missing entirely            -> allow (standalone usage)
 * - Sandbox is the untouched default stub -> allow with ONE-TIME warning
 * - Sandbox explicitly configured       -> enforce (deny throws/returns blocked)
 *
 * Stub detection uses Sandbox._explicitlyConfigured (set true by constructor
 * options, setCapabilities(), setScopes()). The previous per-module clones
 * compared captured `sandbox.can` method references - but can() is a PROTOTYPE
 * method shared by every instance, so the comparison was always true and the
 * gate allowed everything even after explicit configuration. That hole is
 * closed here (see test/security-hardening.test.js regression coverage).
 */

const WARN_INTERVAL_MS = 60000; // re-warn occasionally so misconfig isn't silent forever

let _lastWarnAt = {};
let _sandboxMod = null;
let SandboxClass = null;

function _getSandboxMod() {
    if (!_sandboxMod) {
        try { _sandboxMod = require('./sandbox'); } catch (e) { return null; }
    }
    return _sandboxMod;
}

function _getSandboxClass() {
    if (!SandboxClass) {
        const mod = _getSandboxMod();
        SandboxClass = mod && mod.Sandbox ? mod.Sandbox : null;
    }
    return SandboxClass;
}

/**
 * Is this sandbox the untouched default stub?
 * True when it is NOT explicitly configured and its `can` is the prototype
 * method (i.e. no per-instance override was installed).
 */
function _isUntouchedStub(sandbox) {
    if (sandbox._explicitlyConfigured === true) return false;
    if (sandbox._explicitlyConfigured === false) return true;
    // Sandbox without the flag (foreign object): fall back to prototype check
    const S = _getSandboxClass();
    if (S && sandbox instanceof S) return true;
    return false;
}

function _warn(scope, message) {
    const now = Date.now();
    if (!_lastWarnAt[scope] || now - _lastWarnAt[scope] > WARN_INTERVAL_MS) {
        _lastWarnAt[scope] = now;
        // eslint-disable-next-line no-console
        console.warn(`[${scope}] ${message}`);
    }
}

/**
 * Capability check -> { allowed, error? }
 *
 * @param {string} capability - e.g. 'canWrite'
 * @param {Object} options - { scope: 'trust'|'market'|..., sandbox: override }
 */
function checkCapability(capability, options = {}) {
    const scope = options.scope || 'gate';
    let sandbox = options.sandbox;

    if (!sandbox) {
        const mod = _getSandboxMod();
        sandbox = mod && mod.defaultSandbox;
    }
    if (!sandbox || typeof sandbox.can !== 'function') {
        return { allowed: true }; // standalone usage, no sandbox in process
    }

    // Untouched default stub: allow (safe-by-default) with a warning
    if (_isUntouchedStub(sandbox)) {
        _warn(scope, 'Sandbox not configured; allowing by default. Configure sandbox capabilities to enforce.');
        return { allowed: true };
    }

    // Explicitly configured sandbox: enforce
    try {
        return { allowed: !!sandbox.can(capability) };
    } catch (e) {
        return { allowed: false, error: e.message };
    }
}

/**
 * Throwing variant - throws VantError CAPABILITY_NOT_ALLOWED when denied.
 *
 * @param {string} capability
 * @param {Object} options - { scope, sandbox, operation }
 */
function requireCapability(capability, options = {}) {
    const scope = options.scope || 'gate';
    const check = checkCapability(capability, options);
    if (!check.allowed) {
        const errors = require('./error');
        throw new errors.VantError(`ECAP: ${options.operation || capability} not allowed`, {
            code: errors.CODES.CAPABILITY_NOT_ALLOWED,
            retryable: false
        });
    }
    return true;
}

/**
 * Rate limit via QoS -> { allowed, error? }
 * Missing QoS or QoS without check() allows (degraded but functional).
 *
 * @param {string} key - rate limit key, e.g. 'trust:record:agent-1'
 * @param {number} limit
 * @param {Object} options - { scope, qos: override }
 */
function checkRateLimit(key, limit, options = {}) {
    let qos = options.qos;
    if (!qos) {
        try { qos = require('./qos'); } catch (e) { return { allowed: true }; }
    }
    if (!qos || typeof qos.check !== 'function') {
        return { allowed: true };
    }
    try {
        return qos.check(key, limit);
    } catch (e) {
        return { allowed: false, error: e.message };
    }
}

/**
 * Sandbox null-guarded accessor for service modules.
 * Returns the module-level defaultSandbox or null.
 */
function getSandbox() {
    const mod = _getSandboxMod();
    return (mod && mod.defaultSandbox) || null;
}

module.exports = {
    checkCapability,
    requireCapability,
    checkRateLimit,
    getSandbox,
    _isUntouchedStub
};
