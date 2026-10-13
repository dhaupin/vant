/**
 * Vant Auth Class (v0.8.6)
 * WITH EVENT EMISSIONS - auth operations emit globally
 *
 * Authentication system - API key validation, token management, access control
 * Includes lockout after failed attempts
 *
 * Usage:
 *   const { Auth } = require('./auth');
 *   const auth = new Auth();
 *
 *   // Validate API key
 *   const result = auth.validateApiKey(key);
 *
 *   // Check allowed
 *   auth.isOperationAllowed('read');
 *   auth.getLayerStatus();
 */

// ==================== EVENT SYSTEM ====================
let _event = null;
function _emit(event, data) {
    if (!_event) {
        try { _event = require('./event'); } catch (e) { return; }
    }
    if (_event && _event.emit) {
        _event.emit(event, data);
    }
}

const config = require('./config');
const Encrypt = require('./encrypt');
const _fs = require('fs');
const _sudo = require('./sudo');
const _path = require('path');
const audit = require('./audit');

const LOCKOUT_FILE = '.circuit-auth.json';

// (pass 206, issue #188-A2) Timing-safe compare for transport credentials.
// Length-padded XOR fold: the compared truth is a folded byte (0 = equal),
// so the result does not leak either length or first-mismatch position.
function _timingSafeEqualKey(a, b) {
    const crypto = require('crypto');
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const ba = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    const len = Math.max(ba.length, bb.length);
    if (len === 0) return ba.length === bb.length;  // both empty = equal
    const pa = Buffer.alloc(len, 0); ba.copy(pa, 0);
    const pb = Buffer.alloc(len, 0); bb.copy(pb, 0);
    let diff = ba.length ^ bb.length;               // length mismatch folds in
    for (let i = 0; i < len; i++) diff |= pa[i] ^ pb[i];
    // Sync token as a barrel for the digest-timed branch (constant work).
    crypto.timingSafeEqual(Buffer.alloc(32), Buffer.alloc(32));
    return diff === 0;
}

// Lazy storage — lockout persistence rides the storage/security chain
// (vaf path-check + capability gate + containment). Repo-root scoped.
let _store = null;
function _getStore() {
    if (!_store) {
        // (pass 24) anchor: repo-root scoped store honors VANT_REPO_ROOT.
        _store = new (require('./storage').FileStorage)({ basePath: require('./anchor').getRepoRoot() });
    }
    return _store;
}

// Auth class - load failed attempts from file (survives restarts)
function _loadLockedAuth() {
    try {
        const raw = _getStore().read(LOCKOUT_FILE);
        if (raw !== null) {
            const data = JSON.parse(raw);
            // Filter expired lockouts
            const now = Date.now();
            const valid = new Map();
            for (const [id, entry] of Object.entries(data)) {
                if (entry.lockoutUntil > now) {
                    valid.set(id, entry);
                }
            }
            audit.info(`[Auth] Loaded ${valid.size} lockouts from ${LOCKOUT_FILE}`);
            return valid;
        }
    } catch (e) {
        audit.info(`[Auth] Could not load lockouts: ${e.message}`);
    }
    return new Map();
}

// Save lockouts to file
// (pass 111, S5/F12) MERGE-UNDER-LOCK, not a blind snapshot replace: two
// processes recording failures for different identifiers would otherwise
// clobber each other's whole map, silently un-locking a peer's locked-out
// identity (the lockout IS the brute-force defense). The lock file is
// repo-global (this state is not brain-scoped), so the lock root is too.
// (pass 116, parity sweep) _saveLockedAuth now returns the HONEST outcome:
//   {ok:true} | {ok:false, reason, aborted?:true}
// The old version discarded withLock's return entirely, so a fail-closed
// abort (lock unavailable/held) was not merely unreported to callers — it
// was not even logged, and a brute-force LOCKOUT could silently stay
// memory-only while recordFailedAttempt reported `{locked:true}` as if the
// hold were durable. A restart then unlocked the attacker. Callers surface
// this as {persisted:false, code:'E_SAVE_REFUSED'}.
// (pass 116 second finding) This is a SYNC function with a SYNC body, so
// the save MUST use withLockSync — the async withLock returns a PROMISE,
// and reading `.aborted` off a Promise is always undefined (the exact
// pass-115 lesson: a promise wrapper hides a synchronous decision).
function _saveLockedAuth(failedAttempts) {
    try {
        const lock = require('./lock');
        let failure = null;
        const out = lock.withLockSync(lock.pathForGlobal('auth-lockout'), () => {
            try {
                // Re-read the disk state and adopt peers' entries: keep the
                // record with the LATER lockoutUntil per id (tie → higher count).
                let disk = {};
                try {
                    const raw = _getStore().read(LOCKOUT_FILE);
                    if (raw) disk = JSON.parse(raw) || {};
                } catch (e) { /* unreadable disk — in-memory wins */ }
                const merged = Object.fromEntries(failedAttempts);
                for (const [id, entry] of Object.entries(disk)) {
                    const mine = merged[id];
                    if (!mine) { merged[id] = entry; continue; }
                    if ((entry.lockoutUntil || 0) > (mine.lockoutUntil || 0)
                        || (entry.lockoutUntil === mine.lockoutUntil && (entry.count || 0) > (mine.count || 0))) {
                        merged[id] = entry;
                    }
                }
                // (EW7, #190) Ring-trim: this file is a global favorite for
                // attackers who rotate identities (one entry per probe id).
                // Cap it: expired entries drop first, then oldest-by-lockout
                // beyond the cap. Keeps the brute-force defense and bounds
                // growth at the same time.
                const LOCKOUT_CAP = process.env.VANT_AUTH_LOCKOUT_CAP
                    ? Math.max(100, parseInt(process.env.VANT_AUTH_LOCKOUT_CAP, 10) || 1000)
                    : 1000;
                const now = Date.now();
                for (const id of Object.keys(merged)) {
                    if ((merged[id].lockoutUntil || 0) <= now && !(failedAttempts.get(id))) delete merged[id];
                }
                const ids = Object.keys(merged);
                if (ids.length > LOCKOUT_CAP) {
                    // (pass 226, EW7 pin finding) The cap-trim must not drop an
                    // ACTIVE failed-attempt streak: a record that has not
                    // reached its lockout yet carries `lockoutUntil: 0`, which
                    // sorts FIRST by oldest-lockout — the raw sort evicts
                    // exactly the identity this process is counting right now.
                    // Guard on NEVER-LOCKED (lockoutUntil === 0), not on
                    // in-process membership: a fresh process's constructor
                    // loads the attacker's junk lockouts into its own map, so
                    // in-process protection would make the bound unenforceable.
                    // Locked-out junk stays droppable regardless of origin; the
                    // overflow can then exceed droppable supply (logged below).
                    const droppable = ids.filter(id => (merged[id].lockoutUntil || 0) !== 0);
                    droppable.sort((a, b) => (merged[a].lockoutUntil || 0) - (merged[b].lockoutUntil || 0));
                    const overflow = ids.length - LOCKOUT_CAP;
                    const dropped = droppable.slice(0, Math.max(0, Math.min(overflow, droppable.length)));
                    for (const id of dropped) delete merged[id];
                    audit.info(`[Auth] Lockout ring-trim: capped at ${LOCKOUT_CAP} (dropped ${dropped.length})`);
                }
                _getStore().write(LOCKOUT_FILE, JSON.stringify(merged, null, 2));
            } catch (e) { failure = e; }
        }, { staleMs: 10000, waitMs: 8000 });
        if (failure) throw failure; // body errors surface through the outer catch
        if (out && out.aborted) {
            audit.info(`[Auth] Lockout lock ${out.reason} — refusing unlocked write (fail-closed)`);
            return { ok: false, reason: out.reason, aborted: true };
        }
        return { ok: true };
    } catch (e) {
        audit.info(`[Auth] Could not save lockouts: ${e.message}`);
        return { ok: false, reason: 'write-failed: ' + e.message };
    }
}

/**
 * Auth Class
 * Provides authentication with API key validation and lockout
 */
// (pass 211, #185 H1) Guest tokens parse id from their own shape
// (vguest_<id>_<secret>, lib/guests.js is the shape authority); this helper
// only extracts the id for auth-layer routing, never verifies secrets.
function guestRecordFromToken(rawToken) {
    if (typeof rawToken !== 'string' || !rawToken.startsWith('vguest_')) return null;
    // ids are hex (the token split is hex_hex, unambiguous)
    const m = /^vguest_([a-f0-9]{6,32})_/.exec(rawToken);
    return m ? { id: m[1] } : null;
}

class Auth {
    /**
     * Create Auth instance
     * @param {object} options - Configuration
     */
    constructor(options = {}) {
        // (F6, #189/A3) Token secret resolution: explicit option >
        // VANT_TOKEN_SECRET (already the resolver-env via config.tokenSecret)
        // > EPHEMERAL fallback. The fallback was silent: tokens signed with
        // a fresh generateShortId die on restart, and nothing told the
        // operator why auth stopped sticking. Warn ONCE, saying the
        // consequence and the fix.
        const _ephemeralWarned = (config._ephemeralTokenSecretWarned = config._ephemeralTokenSecretWarned || { done: false });
        let _tokenSecret = options.tokenSecret || config.tokenSecret();
        if (!_tokenSecret) {
            _tokenSecret = Encrypt.generateShortId(32);
            if (!_ephemeralWarned.done) {
                _ephemeralWarned.done = true;
                try {
                    const audit = require('./audit');
                    audit.warn('[auth] No VANT_TOKEN_SECRET configured — using an EPHEMERAL in-memory signing key. Tokens DO NOT survive a restart; clients must re-login every boot. Fix: export VANT_TOKEN_SECRET=<32-byte key> (generate one with `vant encrypt key`).', {});
                } catch (e) {
                    console.warn('[auth] No VANT_TOKEN_SECRET configured — using an EPHEMERAL in-memory signing key. Tokens DO NOT survive a restart.');
                }
            }
        }
        this.options = {
            apiKeyRequired: options.apiKeyRequired !== false,
            tokenExpiry: options.tokenExpiry || 3600000,
            maxAttempts: options.maxAttempts || 5,
            lockoutDuration: options.lockoutDuration || 60000,
            // Secret for token signing - use config or env or generate
            tokenSecret: _tokenSecret,
        };

        // State - load from file (survives restarts)
        this._startTime = Date.now();
        this._initialized = true;
        this._failedAttempts = _loadLockedAuth();  // ip → { count, lockoutUntil }
    }

    /**
     * Validate API key
     * Uses VANT_API_KEY or MCP_API_KEY from environment
     */
    validateApiKey(apiKey) {
        // (#186-R1/#189 Wave 2) ONE resolver on the auth path — the canon
        // order: explicit > VANT_AUTH_KEY > deprecated aliases (warn-once) >
        // persisted mcp.apiKey > null. Provider keys never enter this path.
        const configuredKey = config.resolveAuthKey();

        // (#189 Wave 2, dev-fallback honesty) If no key is configured there
        // are two honest answers: a NOT-required door still opens (local dev
        // convenience, unchanged), but an AUTH-REQUIRED door refuses — a
        // server started with `--auth` and no key configured must never
        // accept “anything-presented” (the old implicit dev fallback turned
        // required-auth-without-config into accept-all, the exact bug class
        // the R1 resolver wave exists to close).
        if (!configuredKey) {
            if (this.options.apiKeyRequired) {
                _emit('auth:validated', { valid: false, reason: 'no_key_configured', timestamp: Date.now() });
                return { valid: false, reason: 'no_key_configured', layer: 'Auth' };
            }
            _emit('auth:validated', { valid: true, reason: 'no_key_configured', timestamp: Date.now() });
            return { valid: true, reason: 'no_key_configured', layer: 'Auth' };
        }

        // Validate key
        if (!apiKey) {
            _emit('auth:validated', { valid: false, reason: 'no_api_key_provided', timestamp: Date.now() });
            return { valid: false, reason: 'no_api_key_provided', layer: 'Auth' };
        }

            // (pass 206, issue #188-A2) Timing-safe compare on the transport
        // credential. The old `apiKey === configuredKey` was a raw string
        // compare while the same codebase's Encrypt.verify/hmacVerify already
        // use timingSafeEqual - the codebase's own security story says
        // timing-safe, so the auth door answers to the same tooling:
        // length-padded buffers (never leak length via an early bail). No
        // observable behavior change: same valid/invalid verdicts.
        if (_timingSafeEqualKey(apiKey, configuredKey)) {
            _emit('auth:validated', { valid: true, reason: 'ok', timestamp: Date.now() });
            return { valid: true, reason: 'ok', layer: 'Auth' };
        }

        // Invalid key
        _emit('auth:validated', { valid: false, reason: 'invalid_api_key', timestamp: Date.now() });

        return { valid: false, reason: 'invalid_api_key', layer: 'Auth' };
    }

    /**
     * Record failed attempt and check lockout
     */
    recordFailedAttempt(identifier) {
        const now = Date.now();

        // EVENT: auth failed
        _emit('auth:failed', { identifier, timestamp: Date.now() });

        const record = this._failedAttempts.get(identifier) || { count: 0, lockoutUntil: 0 };

        // If currently locked out, check if expired
        if (record.lockoutUntil > 0 && now < record.lockoutUntil) {
            return { locked: true, until: record.lockoutUntil };
        }

        // Increment failed count
        record.count++;

        // (pass 116) The save outcome is part of the truth: a fail-closed
        // refusal means the lockout exists ONLY in this process and a
        // restart would unlock the attacker. Surface it instead of lying.
        let save;
        // Lockout if max attempts reached
        if (record.count >= this.options.maxAttempts) {
            record.lockoutUntil = now + this.options.lockoutDuration;
            // (pass 111) Persist the LOCKOUT ITSELF — the old code returned
            // without saving, so the lockout lived in memory only and a
            // restart (or a peer process) never saw it.
            save = _saveLockedAuth(this._failedAttempts);
            return this._lockoutResult(record.lockoutUntil, save);
        }

        this._failedAttempts.set(identifier, record);
        save = _saveLockedAuth(this._failedAttempts);
        const base = { locked: false, persisted: !!save.ok };
        return save.ok ? base : { ...base, code: 'E_SAVE_REFUSED', reason: save.reason };
    }

    /**
     * (pass 116) Uniform lockout result: the lockout decision is real (the
     * identity IS locked in this process) but `persisted:false` +
     * {code:'E_SAVE_REFUSED'} says so honestly when the durable hold could
     * not be written.
     */
    _lockoutResult(until, save) {
        const base = { locked: true, until, persisted: !!save.ok };
        return save.ok ? base : { ...base, code: 'E_SAVE_REFUSED', reason: save.reason };
    }

    /**
     * Clear failed attempts (on successful auth)
     */
    clearFailedAttempt(identifier) {
        this._failedAttempts.delete(identifier);
        return _saveLockedAuth(this._failedAttempts);
    }

    /**
     * Generate token
     */
    generateToken(userId, options = {}) {
        return Encrypt.signToken(
            { userId, role: options.role || 'user' },
            this.options.tokenSecret,
            options.expiresIn || this.options.tokenExpiry
        );
    }

    /**
     * Validate token
     */
    validateToken(token) {
        const payload = Encrypt.verifyToken(token, this.options.tokenSecret);
        if (!payload) {
            return { valid: false, reason: 'invalid_or_expired' };
        }
        return { valid: true, payload };
    }

    /**
     * Revoke token
     */
    revokeToken(token) {
        // (#186-R2, pass 207 status-honesty contract) This method EXISTS to
        // be honest about what revocation is possible.
        // (pass 211, #185 H1) The named seam is now real for GUEST tokens:
        // vguest_ tokens are denylist records, so revocation routes to
        // lib/guests.js and actually kills access in every future process.
        // Habitat and shared keys keep their honest statelessness.
        if (typeof token === 'string' && token.startsWith('vguest_')) {
            const byIdName = guestRecordFromToken(token);
            if (byIdName && byIdName.id) {
                const revoked = require('./guests').revoke(byIdName.id);
                try { _emit('auth:token_revoked', { kind: 'guest', id: byIdName.id, timestamp: Date.now() }); } catch (e) { /* bus never blocks */ }
                return { revoked, denylist: true, kind: 'guest', note: 'guest tokens are denylist-backed; revocation is immediate and durable' };
            }
        }
        try { _emit('auth:token_revoke_attempted', { timestamp: Date.now() }); } catch (e) { /* bus never blocks */ }
        return {
            revoked: false,
            stateless: true,
            note: 'shared keys and habitat tokens are not server-side revocable here (single-key/HMAC-era statelessness); guest (vguest_) tokens ARE - the denylist-backed H1 (#185) seam; this auth layer stays honest about the difference'
        };
    }

    /**
     * Get access level
     *
     * (#186-R2, pass 207 status-honesty) Single-key era semantics, said
     * out loud: there is ONE shared transport key, so every VALID key is
     * 'admin' — that is the entire truth, not a placeholder pretending
     * per-permission grading exists. H1 (#185) lands per-identity tokens
     * with scope maps; these methods are the future `can(key, scope)`
     * seam and keep their shapes until then.
     */
    getAccessLevel(key) {
        // (pass 211, #185 H1) Guest keys answer through their OWN identity
        // (role/trust graded), not the shared-key 'admin' canon.
        if (typeof key === 'string' && key.startsWith('vguest_')) {
            const rec = guestRecordFromToken(key);
            if (!rec) return 'none';
            const verified = require('./guests').verify(key);
            return verified ? ('guest-' + verified.guest.role) : 'none';
        }
        const validation = this.validateApiKey(key);
        if (!validation.valid) return 'none';
        return 'admin'; // single-key canon: one valid key = full access
    }

    /**
     * Check permission
     *
     * (#186-R2, pass 207 status-honesty) In the single-key era this
     * answers ONLY on the key-level verdict (valid → allowed); the
     * second argument is intentionally UNENFORCED and documented as
     * such — it is H1's (#185) future `can(key, scope)` seam, kept so
     * callers can name a permission today and not have the door pretend
     * it was checked.
     */
    checkPermission(key, permission) {
        // (pass 211, #185 H1) For guest keys this is the REAL verdict: the
        // module's door-gate function runs the role capability map + admin
        // block. Permission names as capability tokens (canRead/canWrite/
        // canExec/canSpawn) or door verb classes (read/write) both work.
        if (typeof key === 'string' && key.startsWith('vguest_')) {
            const verified = require('./guests').verify(key);
            if (!verified) return { allowed: false, reason: 'invalid, expired, or revoked guest token' };
            const perm = String(permission || '');
            if (/^can(os)?(Read|Write|Exec|Spawn|Network|Load|List)$/i.test(perm) || /^can[A-Z]/.test(perm)) {
                return { allowed: verified.caps.includes(perm), permissionEnforced: true, layer: 'guests' };
            }
            const gate = require('./guests').authorize(perm, verified);
            return { allowed: gate.allowed, permissionEnforced: true, layer: 'guests', reasonCode: gate.reasonCode || null };
        }
        const level = this.getAccessLevel(key);
        if (level === 'none') return { allowed: false };
        return { allowed: true, permissionEnforced: false, note: 'single-key era: permission argument is a documented no-op for shared keys; GUEST (vguest_) keys enforce for real via the H1 (#185) lib/guests.js door gate' };
    }

    getLayerStatus() {
        return {
            name: 'Auth',
            type: 'authentication',
            enabled: true,
            config: {
                apiKeyRequired: this.options.apiKeyRequired,
                tokenExpiry: this.options.tokenExpiry,
                maxAttempts: this.options.maxAttempts,
                lockoutDuration: this.options.lockoutDuration,
            },
            state: {
                startTime: this._startTime,
                failedAttemptsCount: this._failedAttempts.size
            }
        };
    }

    isOperationAllowed(_op) {
        return { allowed: true, layer: 'Auth' };
    }

    getStatus() {
        return { enabled: true };
    }
}

module.exports = {
    Auth,

    // Standalone functions (matching actual class methods)
    verifyToken: (token) => { const a = new Auth(); return a.validateToken(token); },
    hashPassword: (pwd) => Encrypt.hash(pwd),  // pass 79: was new Encrypt().hash() - hash is STATIC; phantom export, TypeError on any call
    requireAuth: (_req, _res, _next) => { const _a = new Auth(); /* middleware pattern */ },

    // convenience constructor
    create: (opts) => new Auth(opts),

    // Multibrain Stack
    getStackAuthStatus
};

// ==================== MULTIBRAIN STACK SUPPORT ====================

/**
 * Get auth status from all brains in the stack
 * @returns {Object} Combined auth info
 */
function getStackAuthStatus() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = {
        source: 'stack',
        brains: stack,
        byBrain: {}
    };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            results.byBrain[brainName] = { status: 'ok' };
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }

    return results;
}
