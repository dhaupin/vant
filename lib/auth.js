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
const fs = require('fs');
const sudo = require('./sudo');
const path = require('path');
const audit = require('./audit');

const LOCKOUT_FILE = '.circuit-auth.json';

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
function _saveLockedAuth(failedAttempts) {
    try {
        const lock = require('./lock');
        let failure = null;
        lock.withLock(lock.pathForGlobal('auth-lockout'), () => {
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
                _getStore().write(LOCKOUT_FILE, JSON.stringify(merged, null, 2));
            } catch (e) { failure = e; }
        }, { staleMs: 10000, waitMs: 8000 });
        if (failure) throw failure; // body errors surface through the outer catch
    } catch (e) {
        audit.info(`[Auth] Could not save lockouts: ${e.message}`);
    }
}

/**
 * Auth Class
 * Provides authentication with API key validation and lockout
 */
class Auth {
    /**
     * Create Auth instance
     * @param {object} options - Configuration
     */
    constructor(options = {}) {
        this.options = {
            apiKeyRequired: options.apiKeyRequired !== false,
            tokenExpiry: options.tokenExpiry || 3600000,
            maxAttempts: options.maxAttempts || 5,
            lockoutDuration: options.lockoutDuration || 60000,
            // Secret for token signing - use config or env or generate
            tokenSecret: options.tokenSecret || config.tokenSecret() || Encrypt.generateShortId(32),
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
        // Get configured key
        const configuredKey = config.apiKey() || config.mcpApiKey();

        // If no key configured, allow (for development)
        if (!configuredKey) {
            _emit('auth:validated', { valid: true, reason: 'no_key_configured', timestamp: Date.now() });
            return { valid: true, reason: 'no_key_configured', layer: 'Auth' };
        }

        // Validate key
        if (!apiKey) {
            _emit('auth:validated', { valid: false, reason: 'no_api_key_provided', timestamp: Date.now() });
            return { valid: false, reason: 'no_api_key_provided', layer: 'Auth' };
        }

        if (apiKey === configuredKey) {
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

        // Lockout if max attempts reached
        if (record.count >= this.options.maxAttempts) {
            record.lockoutUntil = now + this.options.lockoutDuration;
            // (pass 111) Persist the LOCKOUT ITSELF — the old code returned
            // without saving, so the lockout lived in memory only and a
            // restart (or a peer process) never saw it.
            _saveLockedAuth(this._failedAttempts);
            return { locked: true, until: record.lockoutUntil };
        }

        this._failedAttempts.set(identifier, record);
        _saveLockedAuth(this._failedAttempts);
        return { locked: false };
    }

    /**
     * Clear failed attempts (on successful auth)
     */
    clearFailedAttempt(identifier) {
        this._failedAttempts.delete(identifier);
        _saveLockedAuth(this._failedAttempts);
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
        // No-op - just delete client-side
    }

    /**
     * Get access level
     */
    getAccessLevel(key) {
        const validation = this.validateApiKey(key);
        if (!validation.valid) return 'none';
        return 'admin';
    }

    /**
     * Check permission
     */
    checkPermission(key, permission) {
        const level = this.getAccessLevel(key);
        if (level === 'none') return { allowed: false };
        return { allowed: true };
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

    isOperationAllowed(op) {
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
    requireAuth: (req, res, next) => { const a = new Auth(); /* middleware pattern */ },

    //便利 constructor
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
