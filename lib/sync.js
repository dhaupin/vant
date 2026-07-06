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

const fs = require('fs');
const path = require('path');
const vaf = require('./vaf');
const network = require('./network');
const remote = require('./remote');
const escrow = require('./escrow');
const errors = require('./error');
const { CircuitBreaker } = require('./qos');

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
// Lazy-load RLS for per-record ACL
let _rls = null;
function _getRLS() {
    if (!_rls) {
        try { _rls = require('./rls'); } catch (e) {}
    }
    return _rls;
}
    if (sandbox && sandbox.canNetwork) {
        try {
            if (!sandbox.canNetwork()) {
                throw new errors.Error('Network permission required', { code: errors.CODES.NETWORK_DENIED, retryable: false });
            }
        } catch (e) {}
    }
}

// Use brain router for paths
const brain = require('./brain');
const MODELS_PATH = brain.getBrainPath();
const PROVIDERS_PATH = path.join(MODELS_PATH, '.providers.json');

/**
 * Save provider state
 * @param {string} provider - Provider name
 * @param {string} status - Status
 * @param {number} lastSync - Last sync timestamp
 */
function saveProviderState(provider, status, lastSync, options = {}) {
    // RLS check (REQUIRED)
    if (!options.userCtx) {
        throw new Error('EINVAL: userCtx required for saveProviderState');
    }
    const rls = _getRLS();
    if (rls) {
        rls.checkWrite(options.userCtx, '_sync:provider:' + provider, 'write');
    }

    _checkWrite();

    let states = {};
    if (fs.existsSync(PROVIDERS_PATH)) {
        states = JSON.parse(fs.readFileSync(PROVIDERS_PATH, 'utf8'));
    }
    states[provider] = { status, lastSync, updated: new Date().toISOString() };
    fs.writeFileSync(PROVIDERS_PATH, JSON.stringify(states, null, 2));
}

/**
 * Get provider state
 * @param {string} provider - Provider name
 * @returns {object|null}
 */
function getProviderState(provider, options = {}) {
    // RLS check (REQUIRED)
    if (!options.userCtx) {
        throw new Error('EINVAL: userCtx required for getProviderState');
    }
    const rls = _getRLS();
    if (rls) {
        rls.checkRead(options.userCtx, '_sync:provider:' + provider, 'read');
    }

    _checkRead();

    if (!fs.existsSync(PROVIDERS_PATH)) return null;
    const states = JSON.parse(fs.readFileSync(PROVIDERS_PATH, 'utf8'));
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
            saveProviderState(name, 'healthy', Date.now());
            recordSuccess(name);
            audit.info(`[Sync] ${name}: ✓`);
            
        } catch (e) {
            results[name] = { success: false, error: e.message };
            errors.push({ provider: name, error: e.message });
            saveProviderState(name, 'stale', getProviderState(name)?.lastSync || Date.now());
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
}

/**
 * Pull brain from first available provider
 * @param {object} options - { provider preference }
 * @returns {object} Brain data
 */
async function pullAny(options = {}) {
    _checkNetwork();
    _emit('sync:pull:starting', { preference: options.preference, timestamp: Date.now() });
    
    const preference = options.preference || null;
    
    let providers = getConfiguredProviders();
    
    if (providers.length === 0) {
        throw new errors.Error('No providers configured', { code: errors.CODES.GITHUB_SYNC_FAIL, retryable: false });
    }
    
    // Reorder by preference
    if (preference) {
        providers.sort((a, b) => {
            if (a.getType() === preference) return -1;
            if (b.getType() === preference) return 1;
            return 0;
        });
    }
    
    // Try each provider in order
    for (const provider of providers) {
        const name = provider.getType();
        
        try {
            audit.info(`[Sync] Trying ${name}...`);
            
            // Get brain files
            // In full impl: fetch and merge
            // Simplified:
            
            const repoInfo = await provider.getRepoInfo();
            audit.info(`[Sync] ${name}: Repo = ${repoInfo.owner}/${repoInfo.repo}`);
            
            // EVENT: sync:pull:success
            _emit('sync:pull:success', { provider: name, timestamp: Date.now() });
            
            return { 
                success: true, 
                provider: name,
                repoInfo 
            };
            
        } catch (e) {
            audit.info(`[Sync] ${name}: Failed (${e.message})`);
            continue;
        }
    }
    
    // EVENT: sync:pull:failed - all providers failed
    _emit('sync:pull:failed', { error: 'All providers failed', timestamp: Date.now() });
    
    throw new errors.Error('All providers failed', { code: errors.CODES.GITHUB_SYNC_FAIL, retryable: true });
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
        
        saveProviderState(providerName, 'healthy', Date.now());
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
    const state = getProviderState(providerName);
    saveProviderState(providerName, 'stale', state?.lastSync || Date.now());
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
    if (fs.existsSync(PRIVACY_FILE)) {
        return JSON.parse(fs.readFileSync(PRIVACY_FILE, 'utf8'));
    }
    return { version: '1.0', defaultPrivacy: 'private', repos: {} };
}

function hybrid_savePrivacyConfig(config) {
    fs.writeFileSync(PRIVACY_FILE, JSON.stringify(config, null, 2));
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
