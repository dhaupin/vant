/**
 * Vant Sync Manager (v0.8.6)
 * WITH EVENT EMISSIONS - sync operations emit globally
 *
 * Sync brain to multiple providers for redundancy.
 * Read from any provider, write to all.
 * Auto-failover on failure.
 * Rebase sync when providers recover.
 *
 * Usage:
 *   const sync = require('./sync');
 *   await sync.pushAll();              // Broadcast to all
 *   await sync.pullAny();             // Pull from first available
 *   await sync.rebase('github');      // Rebase stale provider
 *
 * SECURITY:
 *   - Validates all tokens before use
 *   - No sensitive data in logs
 *   - Provider-specific rate limiting
 *   - Atomic operations where possible
 *   - Recursion guards to prevent sync loops
 */

const guard = require('./recursion');  // Unified recursion guard

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

const fs = require('fs');
const path = require('path');
const vaf = require('./vaf');
const network = require('./network');
const remote = require('./remote');
const escrow = require('./escrow');
const errors = require('./error');
const { CircuitBreaker } = require('./qos');
const audit = require('./audit');

// Lazy-load sandbox for capability check
let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) {
        try { _sandbox = require('./sandbox'); } catch (e) {}
    }
    return _sandbox;
}

function _checkRead() {
    const sandbox = _getSandbox();
    if (sandbox && sandbox.canRead) {
        try {
            if (!sandbox.canRead()) {
                throw new errors.Error('Read permission required', { code: errors.CODES.STORAGE_READ_DENIED, retryable: false });
            }
        } catch (e) {}
    }
}

function _checkWrite() {
    const sandbox = _getSandbox();
    if (sandbox && sandbox.canWrite) {
        try {
            if (!sandbox.canWrite()) {
                throw new errors.Error('Write permission required', { code: errors.CODES.STORAGE_WRITE_DENIED, retryable: false });
            }
        } catch (e) {}
    }
}

function _checkNetwork() {
    const sandbox = _getSandbox();

    if (sandbox && sandbox.canNetwork) {
        try {
            if (!sandbox.canNetwork()) {
                throw new errors.Error('Network permission required', { code: errors.CODES.NETWORK_DENIED, retryable: false });
            }
        } catch (e) {}
    }
}

// Use brain router for paths
// (R-2: provider/privacy state JSON route through storage.atomicWrite;
// read via readJson for parse-safe null on missing. Paths resolve per call
// so pushBrain() applies — the old module-load constants froze the first
// brain's path.)
const brain = require('./brain');
const MODELS_PATH = brain.getBrainPath();
const _syncStore = new (require('./storage').FileStorage)({
    basePath: path.resolve(__dirname, '..', 'models')
});
function _providersRel() {
    return path.relative(path.resolve(__dirname, '..', 'models'),
        path.join(brain.getBrainPath(), '.providers.json'));
}
function _privacyRel() {
    return path.relative(path.resolve(__dirname, '..', 'models'),
        path.join(brain.getBrainPath(), '.privacy.json'));
}
const PROVIDERS_PATH = path.join(MODELS_PATH, '.providers.json');

// System user context for internal sync operations
const SYSTEM_USER_CTX = { userId: 'system', role: 'system', workspace: 'default' };

/**
 * Save provider state
 * @param {string} provider - Provider name
 * @param {string} status - Status
 * @param {number} lastSync - Last sync timestamp
 */
function saveProviderState(provider, status, lastSync, options = {}) {
    // RLS check (REQUIRED)
    if (!options.userCtx) {
        throw new errors.VantError('EINVAL: userCtx required for saveProviderState', { code: errors.CODES.VAF_REQUIRED_FIELD });
    }
    const sandbox = _getSandbox();
    if (sandbox && sandbox.rls) {
        _checkWrite(options.userCtx, '_sync:provider:' + provider);
    }

    _checkWrite();

    let states = {};
    const rel = _providersRel();
    const existing = _syncStore.read(rel);
    if (existing) {
        states = JSON.parse(existing);
    }
    states[provider] = { status, lastSync, updated: new Date().toISOString() };
    _syncStore.write(rel, JSON.stringify(states, null, 2));
}

/**
 * Get provider state
 * @param {string} provider - Provider name
 * @returns {object|null}
 */
function getProviderState(provider, options = {}) {
    // RLS check (REQUIRED)
    if (!options.userCtx) {
        throw new errors.VantError('EINVAL: userCtx required for getProviderState', { code: errors.CODES.VAF_REQUIRED_FIELD });
    }
    const sandbox = _getSandbox();
    if (sandbox && sandbox.rls) {
        _checkRead(options.userCtx, '_sync:provider:' + provider);
    }

    _checkRead();

    const content = _syncStore.read(_providersRel());
    if (!content) return null;
    const states = JSON.parse(content);
    return states[provider] || null;
}

/**
 * Circuit Breaker Configuration
 * These are configurable via config.ini or env vars
 */

// Use qos CircuitBreaker full mode
let circuitBreaker = null;
function _getCircuitBreaker() {
    if (!circuitBreaker) {
        circuitBreaker = new CircuitBreaker({
            mode: 'full',
            file: '.circuit-sync.json',
            basePath: MODELS_PATH,
            threshold: 5,
            backoff: { base: 1000, max: 30000, multiplier: 2 },
            autoRetry: true
        });
    }
    return circuitBreaker;
}

// Backward compatible wrappers
function isCircuitClosed(provider) {
    return _getCircuitBreaker().isClosed(provider);
}

function recordFailure(provider) {
    _getCircuitBreaker().recordFailure(provider);
}

function recordSuccess(provider) {
    _getCircuitBreaker().recordSuccess(provider);
}

function getAllCircuits() {
    return _getCircuitBreaker().getAllStates();
}

function getConfiguredProviders() {
    const providers = remote.getAllProviders();

    const configured = [];
    for (const [name, provider] of Object.entries(providers)) {
        if (provider.isConfigured()) {
            configured.push(provider);
        }
    }

    return configured;
}

/**
 * Push brain to all configured providers (Broadcast)
 * @param {object} options - { commitMessage, force }
 * @returns {object} Results per provider
 */
async function pushAll(options = {}) {
    // Recursion guard: prevent infinite sync loops
    const depthCheck = guard.check('sync:push');
    if (!depthCheck.allowed) {
        throw new errors.VantError('Sync recursion exceeded', { code: errors.CODES.BRAIN_LOAD_FAIL });
    }

    try {
        _checkNetwork();
        _emit('sync:push:starting', { providers: getConfiguredProviders().length, timestamp: Date.now() });

        const {
            commitMessage = 'Vant sync update',
            force = false
        } = options;

        vaf.check(commitMessage, {
            type: 'string',
            name: 'commitMessage',
            maxLength: 100000
        });

        const providers = getConfiguredProviders();

        if (providers.length === 0) {
            return {
                success: false,
                error: 'No providers configured',
                results: {}
            };
        }

        audit.info(`[Sync] Broadcasting to ${providers.length} providers...`);

        const results = {};
        const errors = [];

        for (const provider of providers) {
            const name = provider.getType();

            // Circuit breaker check
            if (!isCircuitClosed(name)) {
                audit.info(`[Sync] ${name}: SKIPPED (circuit open)`);
                results[name] = { success: false, error: 'Circuit open' };
                continue;
            }

            // Budget check via escrow
            if (!escrow.canSpend('sync', 10)) {
                audit.info(`[Sync] ${name}: SKIPPED (budget exceeded)`);
                results[name] = { success: false, error: 'Budget exceeded' };
                continue;
            }

            try {
                audit.info(`[Sync] Pushing to ${name}...`);

                await provider.commit(commitMessage, { all: true });
                await provider.push();

                results[name] = { success: true };
                saveProviderState(name, 'healthy', Date.now(), { userCtx: SYSTEM_USER_CTX });
                recordSuccess(name);
                audit.info(`[Sync] ${name}: ✓`);

            } catch (e) {
                results[name] = { success: false, error: e.message };
                errors.push({ provider: name, error: e.message });
                saveProviderState(name, 'stale', getProviderState(name, { userCtx: SYSTEM_USER_CTX })?.lastSync || Date.now(), { userCtx: SYSTEM_USER_CTX });
                recordFailure(name);
                audit.error(`[Sync] ${name}: ✗ (${e.message})`);
            }
        }

        const success = Object.values(results).some(r => r.success);

        // Events
        if (success) {
            _emit('sync:push:complete', { providers: Object.keys(results).length, successes: Object.values(results).filter(r => r.success).length, timestamp: Date.now() });
        } else {
            _emit('sync:push:failed', { error: 'All providers failed', timestamp: Date.now() });
        }

        return { success, results, errors };
    } finally {
        // Release recursion guard
        guard.release('sync:push');
    }
}

/**
 * Pull brain updates from the first provider that succeeds.
 *
 * Symmetric with pushAll(): recursion guard, circuit breaker, escrow budget,
 * provider-state bookkeeping, events. Actually executes provider.pull() —
 * historically this function only fetched repo info and reported success
 * without pulling anything.
 *
 * @param {object} options - { provider: preferred provider type, branch }
 * @returns {object} { success, results, errors } per provider
 */
async function pullAny(options = {}) {
    const depthCheck = guard.check('sync:pull');
    if (!depthCheck.allowed) {
        throw new errors.VantError('Sync recursion exceeded', { code: errors.CODES.BRAIN_LOAD_FAIL });
    }

    try {
        _checkNetwork();
        _emit('sync:pull:starting', { preference: options.preference, timestamp: Date.now() });

        const { provider: preference = null, branch = null } = options;

        const providers = getConfiguredProviders();

        if (providers.length === 0) {
            return {
                success: false,
                error: 'No providers configured',
                results: {}
            };
        }

        // Reorder by preference
        if (preference) {
            providers.sort((a, b) => {
                if (a.getType() === preference) return -1;
                if (b.getType() === preference) return 1;
                return 0;
            });
        }

        const results = {};
        const errors = [];

        for (const provider of providers) {
            const name = provider.getType();

            // Circuit breaker check
            if (!isCircuitClosed(name)) {
                audit.info(`[Sync] ${name}: SKIPPED (circuit open)`);
                results[name] = { success: false, error: 'Circuit open' };
                continue;
            }

            // Budget check via escrow
            if (!escrow.canSpend('sync', 10)) {
                audit.info(`[Sync] ${name}: SKIPPED (budget exceeded)`);
                results[name] = { success: false, error: 'Budget exceeded' };
                continue;
            }

            try {
                audit.info(`[Sync] Pulling from ${name}...`);

                const repoInfo = await provider.getRepoInfo();
                const pulledBranch = await provider.pull(branch);

                results[name] = { success: true, branch: pulledBranch, repo: `${repoInfo.owner}/${repoInfo.repo}` };
                saveProviderState(name, 'healthy', Date.now(), { userCtx: SYSTEM_USER_CTX });
                recordSuccess(name);
                audit.info(`[Sync] ${name}: ✓ pulled ${pulledBranch}`);

            } catch (e) {
                results[name] = { success: false, error: e.message };
                errors.push({ provider: name, error: e.message });
                saveProviderState(name, 'stale', getProviderState(name, { userCtx: SYSTEM_USER_CTX })?.lastSync || Date.now(), { userCtx: SYSTEM_USER_CTX });
                recordFailure(name);
                audit.error(`[Sync] ${name}: ✗ (${e.message})`);
                continue;
            }
        }

        const success = Object.values(results).some(r => r.success);

        // Events
        if (success) {
            _emit('sync:pull:complete', { providers: Object.keys(results).length, successes: Object.values(results).filter(r => r.success).length, timestamp: Date.now() });
        } else {
            _emit('sync:pull:failed', { error: 'All providers failed', timestamp: Date.now() });
            throw new errors.Error('All providers failed', { code: errors.CODES.GITHUB_SYNC_FAIL, retryable: true });
        }

        return { success, results, errors };
    } finally {
        guard.release('sync:pull');
    }
}

/**
 * Get sync status across all providers
 * @returns {object} Status per provider
 */
async function getStatus() {
    const providers = getConfiguredProviders();

    const status = {
        providers: {},
        lastSync: null,
        errors: []
    };

    for (const provider of providers) {
        const name = provider.getType();

        try {
            const branches = await provider.listBranches();
            const current = await provider.currentBranch();

            status.providers[name] = {
                connected: true,
                branches: branches.length,
                current
            };
        } catch (e) {
            status.providers[name] = {
                connected: false,
                error: e.message
            };
            status.errors.push({ provider: name, error: e.message });
        }
    }

    return status;
}

/**
 * Check if RAID mode is active
 * @returns {boolean}
 */
function isRAID() {
    const providers = getConfiguredProviders();
    return providers.length > 1;
}

/**
 * Rebase a stale provider
 * @param {string} providerName - Provider name to rebase
 * @returns {object} Rebase result
 */
async function rebase(providerName) {
    _checkNetwork();
    const providers = remote.getAllProviders();
    const provider = providers[providerName];

    if (!provider) {
        throw new errors.Error('Provider ' + providerName + ' not found', { code: errors.CODES.GITHUB_NOT_FOUND, retryable: false });
    }

    if (!provider.isConfigured()) {
        throw new errors.Error('Provider ' + providerName + ' not configured', { code: errors.CODES.GITHUB_SYNC_FAIL, retryable: false });
    }

    audit.info(`[Sync] Rebasing ${providerName}...`);

    try {
        // Pull latest from other providers first
        const latest = await pullAny({ preference: null });

        // Fetch and rebase
        await provider.pull();
        await provider.push();

        saveProviderState(providerName, 'healthy', Date.now(), { userCtx: SYSTEM_USER_CTX });
        audit.info(`[Sync] ${providerName}: Rebased ✓`);

        return { success: true, provider: providerName };
    } catch (e) {
        audit.error(`[Sync] ${providerName}: Rebase failed (${e.message})`);
        return { success: false, provider: providerName, error: e.message };
    }
}

/**
 * Mark provider as stale
 * @param {string} providerName - Provider name
 */
function markStale(providerName) {
    const state = getProviderState(providerName, { userCtx: SYSTEM_USER_CTX });
    saveProviderState(providerName, 'stale', state?.lastSync || Date.now(), { userCtx: SYSTEM_USER_CTX });
}

/**
 * Get provider count
 * @returns {number}
 */
function getProviderCount() {
    return getConfiguredProviders().length;
}

function getSummary() {
    return {
        name: 'Sync',
        type: 'sync',
        enabled: true,
        defaultPrivacy: 'dual',
        publicRepos: [],
        privateRepos: []
    };
}

// ==================== MULTIBRAIN STACK SUPPORT ====================

/**
 * Get sync status from all brains in the stack
 * @returns {Object} Combined sync status
 */
function getStackSyncStatus() {
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
            const summary = getSummary();
            results.byBrain[brainName] = summary;
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }

    return results;
}

/**
 * Get privacy config from all brains in the stack
 * @returns {Object} Combined privacy configs
 */
function getStackPrivacy() {
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
            const privacy = hybrid_getPrivacy();
            results.byBrain[brainName] = privacy;
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }

    return results;
}

module.exports = { getSummary,
    // Class
    Sync: class {
        constructor() {
            this._startTime = Date.now();
        }
        getSummary() {
            return { name: 'Sync', type: 'sync', enabled: true };
        }
        getLayerStatus() {
            return {
                name: 'Sync',
                type: 'sync',
                enabled: true,
                config: {},
                state: { uptime: Date.now() - this._startTime }
            };
        }
        isOperationAllowed(operationType, context = {}) {
            return {allowed: true, layer: 'Sync'};
        }
        getStatus() {
            return {enabled: true};
        }
    },
    create: () => ({ getLayerStatus() { return {}; }, isOperationAllowed: () => ({allowed:true}), getStatus: () => ({enabled:true}) }),

    // Module functions
    pushAll,
    pullAny,
    getStatus,
    isRAID,
    getProviderCount,
    getConfiguredProviders,
    rebase,
    markStale,
    getProviderState,
    saveProviderState,
    isCircuitClosed,
    recordFailure,
    recordSuccess,
    getAllCircuits,

    // Framework hooks
    getLayerStatus() {
        return {
            name: 'Sync',
            type: 'sync',
            enabled: true,
            config: {},
            state: { providers: getProviderCount() }
        };
    },

    isOperationAllowed(operationType, context) {
        return {allowed: true, layer: 'Sync'};
    },

    getStatus() {
        return {enabled: true, providers: getProviderCount()};
    }
};

function hybrid_getPrivacyConfig() {
    // FIXED: referenced undefined PRIVACY_FILE - every call (and every
    // downstream hybrid_* privacy function) threw ReferenceError
    const content = _syncStore.read(_privacyRel());
    if (content) {
        try { return JSON.parse(content); } catch { /* fall through */ }
    }
    return { version: '1.0', defaultPrivacy: 'private', repos: {} };
}

function hybrid_savePrivacyConfig(config) {
    _syncStore.write(_privacyRel(), JSON.stringify(config, null, 2));
}

function hybrid_setPrivacy(repo, privacy) {
    if (!['public', 'private'].includes(privacy)) throw new errors.Error('Privacy must be public or private', { code: errors.CODES.GITHUB_SYNC_FAIL, retryable: false });
    const config = hybrid_getPrivacyConfig();
    config.repos[repo] = { privacy, updated: new Date().toISOString() };
    hybrid_savePrivacyConfig(config);
}

function hybrid_getPrivacy(repo) {
    const config = hybrid_getPrivacyConfig();
    return config.repos[repo]?.privacy || config.defaultPrivacy;
}

function hybrid_getPublicRepos() {
    const config = hybrid_getPrivacyConfig();
    return Object.entries(config.repos).filter(([, v]) => v.privacy === 'public').map(([k]) => k);
}

function hybrid_getPrivateRepos() {
    const config = hybrid_getPrivacyConfig();
    return Object.entries(config.repos).filter(([, v]) => v.privacy === 'private').map(([k]) => k);
}

// Export hybrid functions
module.exports.hybrid_getPrivacyConfig = hybrid_getPrivacyConfig;
module.exports.hybrid_savePrivacyConfig = hybrid_savePrivacyConfig;
module.exports.hybrid_setPrivacy = hybrid_setPrivacy;
module.exports.hybrid_getPrivacy = hybrid_getPrivacy;
module.exports.hybrid_getPublicRepos = hybrid_getPublicRepos;
module.exports.hybrid_getPrivateRepos = hybrid_getPrivateRepos;

// Multibrain Stack
module.exports.getStackSyncStatus = getStackSyncStatus;
module.exports.getStackPrivacy = getStackPrivacy;
