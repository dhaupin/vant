const errors = require('./error');
/**
 * Vant Config (v0.8.6)
 * Unified config registry + environment
 * WITH EVENT EMISSIONS - config changes emit for reactivity
 *
 * Usage:
 *   const config = require('./config');
 *   config.get('github.repo')      // Static config
 *   config.set('debug', true)      // Runtime flag
 *   config.apiKey()           // Environment retrieval
 *   config.mcpPort()          // MCP config
 */

const fs = require('fs');
const path = require('path');

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

// Lazy-load sandbox for capability check
let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) {
        try { _sandbox = require('./sandbox'); } catch (e) {}
    }
    return _sandbox;
}

// Lazy-load logger (audit) for optional logging
let _logger = null;
function _getLogger() {
    if (!_logger) {
        try { _logger = require('./audit'); } catch (e) {
            _logger = { warn: () => {} };
        }
    }
    return _logger;
}

function _checkRead() {
    // Permission check - integrate with sandbox permission system
    // Only enforce if sandbox is explicitly set to restrict (not default DENY)
    const sandbox = _getSandbox();
    if (sandbox && sandbox.canRead) {
        // Only block if sandbox explicitly returns false (enforcing mode)
        // Default sandbox returns false for everything - don't block by default
        try {
            const canRead = sandbox.canRead();
            // Only block if explicitly set to false (not undefined)
            if (canRead === false) {
                throw new errors.VantError('Read permission denied by sandbox for config loading', { code: errors.CODES.CAPABILITY_NOT_ALLOWED });
            }
        } catch (e) {
            // Only log in debug mode, don't block
            const logger = _getLogger();
            if (logger.warn) logger.debug?.('[Config] Sandbox check: ' + e.message);
        }
    }
}

let _config = null;
let _flags = new Map();
let _brainConfigs = new Map();  // Per-brain config cache
let _startTime = Date.now();

// ==================== BRAIN CONFIG ====================
/**
 * Load brain-specific config from brain directory
 * @param {string} brain - Brain name
 * @returns {Object} Brain config object
 */
function loadBrainConfig(brain) {
    if (_brainConfigs.has(brain)) {
        return _brainConfigs.get(brain);
    }
    
    const brainInfo = _resolveBrainPath(brain);
    if (!brainInfo) {
        return {};
    }
    
    const configPath = path.join(brainInfo.path, 'config.json');
    let brainConfig = {};
    
    if (fs.existsSync(configPath)) {
        try {
            const content = fs.readFileSync(configPath, 'utf8');
            brainConfig = JSON.parse(content);
        } catch (e) {
            // Invalid config, use empty
        }
    }
    
    _brainConfigs.set(brain, brainConfig);
    return brainConfig;
}

/**
 * Save brain-specific config to brain directory
 * @param {string} brain - Brain name
 * @param {Object} config - Config object to save
 */
function saveBrainConfig(brain, config) {
    // SECURITY: RLS check for config write
    const sandbox = _getSandbox();
    if (sandbox && sandbox.rls) {
        try {
            sandbox.rls.checkWrite({}, 'config', 'write');
        } catch (e) {
            return { error: 'RLS denied: ' + e.message, code: 'E_RLS' };
        }
    }
    
    const brainInfo = _resolveBrainPath(brain);
    if (!brainInfo) {
        return false;
    }
    
    const configPath = path.join(brainInfo.path, 'config.json');
    
    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        _brainConfigs.set(brain, config);
        _emit('config:brain:saved', { brain, config });
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Resolve brain path (lazy-load to avoid circular deps)
 */
function _resolveBrainPath(brainName) {
    const brain = require('./brain');
    return brain.resolveBrainPath(brainName);
}

function load() {
    _checkRead();
    if (_config) return _config;
    _config = {
        github: { token: process.env.GITHUB_TOKEN || null, repo: null },
        steveframe: { url: 'https://app.all-hands.dev', version: require('./version') },
        linear: { apiKey: process.env.LINEAR_API_KEY || null, teamId: null },
        anthropic: { apiKey: process.env.ANTHROPIC_API_KEY || null },
        openai: { apiKey: process.env.OPENAI_API_KEY || null },
        elevenlabs: { apiKey: process.env.ELEVENLABS_API_KEY || null },
        notion: { apiKey: process.env.NOTION_API_KEY || null },
        slack: { token: process.env.SLACK_TOKEN || null, webhook: null },
        datadog: { apiKey: process.env.DATADOG_API_KEY || null, appKey: process.env.DATADOG_APP_KEY || null },
        database: { url: process.env.DATABASE_URL || 'sqlite::memory:' },
        storage: { type: 'file', path: process.env.VANT_STORAGE_PATH || 'models/private' },
        log: { level: process.env.VANT_LOG_LEVEL || 'info' },
        msg: { 
            encrypted: process.env.VANT_MSG_ENCRYPTED !== 'false', // Default: true (enabled)
            autoEncrypt: process.env.VANT_MSG_AUTO_ENCRYPT !== 'false'
        },
        sync: { interval: parseInt(process.env.VANT_SYNC_INTERVAL || '300000'), branch: null },
        prune: { 
            staleDays: parseInt(process.env.VANT_PRUNE_STALE_DAYS || '90'),
            maxSize: parseInt(process.env.VANT_PRUNE_MAX_SIZE_MB || '100'),
            autoClean: process.env.VANT_PRUNE_AUTO_CLEAN === 'true'
        },
        clean: {
            logs: process.env.VANT_CLEAN_LOGS !== 'false',
            tmp: process.env.VANT_CLEAN_TMP !== 'false',
            cache: process.env.VANT_CLEAN_CACHE !== 'false',
            maxLogSize: parseInt(process.env.VANT_CLEAN_MAX_LOG_MB || '10'),
            maxLogAge: parseInt(process.env.VANT_CLEAN_MAX_LOG_AGE_DAYS || '7')
        },
        mcp: { port: parseInt(process.env.VANT_MCP_PORT || '3457'), bind: process.env.VANT_MCP_BIND || '127.0.0.1', requireKey: process.env.VANT_MCP_REQUIRE_KEY || 'false', apiKey: process.env.VANT_MCP_API_KEY || null },
        cloudflare: { 
            accountId: process.env.CF_ACCOUNT_ID || null,
            apiToken: process.env.CF_API_TOKEN || null,
            pagesUrl: process.env.CF_PAGES_URL || null,
            kvNamespace: process.env.CF_KV_NAMESPACE || null,
            r2Bucket: process.env.CF_R2_BUCKET || null,
            workerUrl: process.env.CF_WORKER_URL || null,
            workerName: process.env.CF_WORKER_NAME || null
        },
        server: { port: parseInt(process.env.VANT_SERVER_PORT || '3456'), bind: process.env.VANT_SERVER_BIND || '127.0.0.1', cert: process.env.VANT_SERVER_CERT || null, key: process.env.VANT_SERVER_KEY || null, insecure: process.env.VANT_SERVER_INSECURE === '1', authRequired: process.env.VANT_SERVER_AUTH_REQUIRED === '1' },
        brain: {
            // Brain password timeout (like sudo) - 15 min default
            passwordTimeout: parseInt(process.env.VANT_BRAIN_PASSWORD_TIMEOUT || (15 * 60 * 1000))
        },
        escrow: { 
            // Budget settings
            defaultBudget: parseInt(process.env.VANT_ESCROW_DEFAULT_BUDGET || '1000'),
            creditMode: process.env.VANT_ESCROW_CREDIT_MODE !== 'false',
            persistBudgets: process.env.VANT_ESCROW_PERSIST !== 'false',
            // Runaway protection (prevents infinite loops)
            runaway: {
                maxPerMinute: parseInt(process.env.VANT_ESCROW_RUNAWAY_MAX_PER_MINUTE || '30'),
                maxPerHour: parseInt(process.env.VANT_ESCROW_RUNAWAY_MAX_PER_HOUR || '1000'),
                alertThreshold: parseInt(process.env.VANT_ESCROW_RUNAWAY_ALERT_THRESHOLD || '20')
            }
        },
        agents: {
            // Agent limits
            maxAgents: parseInt(process.env.VANT_AGENTS_MAX || '10'),
            spawnRateLimit: parseInt(process.env.VANT_AGENTS_SPAWN_RATE || '10'),
            maxDelegateDepth: parseInt(process.env.VANT_AGENTS_MAX_DELEGATE_DEPTH || '10')
        },
        event: {
            // Event recursion protection
            maxEmitDepth: parseInt(process.env.VANT_EVENT_MAX_EMIT_DEPTH || '10')
        },
        msg: {
            // Message publish recursion protection
            maxPublishDepth: parseInt(process.env.VANT_MSG_MAX_PUBLISH_DEPTH || '10')
        },
        recursion: {
            // Unified recursion protection (used by all modules)
            maxDepth: parseInt(process.env.VANT_RECURSION_MAX_DEPTH || '10'),
            // Per-operation overrides
            emit: parseInt(process.env.VANT_RECURSION_EMIT || '10'),
            publish: parseInt(process.env.VANT_RECURSION_PUBLISH || '10'),
            delegate: parseInt(process.env.VANT_RECURSION_DELEGATE || '10'),
            search: parseInt(process.env.VANT_RECURSION_SEARCH || '10'),
            sync: parseInt(process.env.VANT_RECURSION_SYNC || '10'),
            island: parseInt(process.env.VANT_RECURSION_ISLAND || '10'),
            compute: parseInt(process.env.VANT_RECURSION_COMPUTE || '10'),
            brain: parseInt(process.env.VANT_RECURSION_BRAIN || '10'),
            mcp: parseInt(process.env.VANT_RECURSION_MCP || '10')
        }
    };
    const configPath = process.env.VANT_CONFIG || path.join(process.cwd(), 'vant.config.js');
    if (fs.existsSync(configPath)) {
        try { _config = { ..._config, ...require(configPath) }; } catch (e) { /* ignore */ }
    }
    return _config;
}

/**
 * Get config value
 * @param {string} key - Config key (dot notation)
 * @param {Object} options - Options including brain name
 * @param {string} options.brain - Brain name for brain-specific config
 * @param {*} defaultValue - Default if not found
 * @returns {*} Config value
 */
function get(key, defaultValue = null, options = {}) {
    if (!key || typeof key !== 'string') return defaultValue;
    
    // Check runtime flags first (highest priority)
    if (_flags.has(key)) return _flags.get(key).value;
    
    // Check brain-specific config if brain option provided
    if (options.brain) {
        const brainConfig = loadBrainConfig(options.brain);
        const parts = key.split('.');
        let v = brainConfig;
        for (const p of parts) {
            v = v?.[p];
            if (v === undefined || v === null) break;
        }
        if (v !== undefined && v !== null) {
            return v;
        }
        // Fall through to global config
    }
    
    // Global config
    const cfg = load();
    const parts = key.split('.');
    let v = cfg;
    for (const p of parts) {
        v = v?.[p];
        if (v === undefined || v === null) break;
    }
    return v ?? defaultValue;
}
function getAll() { return load(); }
function getGithub() { return { token: _config?.github?.token, repo: _config?.github?.repo }; }
function getStegoframe() { return { url: _config?.steveframe?.url, version: _config?.steveframe?.version }; }

function setFlag(name, value) { 
    const oldValue = _flags.get(name)?.value;
    _flags.set(name, { value, timestamp: Date.now() }); 
    
    // EVENT: config:changed
    if (oldValue !== value) {
        _emit('config:changed', { key: name, oldValue, newValue: value });
    }
}
function getFlag(name, defaultValue = null) { return _flags.get(name)?.value ?? defaultValue; }
function isEnabled(name) { return !!getFlag(name); }
function enable(name) { setFlag(name, true); }
function disable(name) { setFlag(name, false); }
function toggle(name) { setFlag(name, !isEnabled(name)); }

function getLayerStatus() { return { name: 'Config', type: 'registry', enabled: true, state: { flags: _flags.size, uptime: Date.now() - _startTime } }; }
function isOperationAllowed(operationType) { return { allowed: true, layer: 'Config' }; }
function getStatus() { return { enabled: true, flags: _flags.size }; }

function getSecretKeys() { return ['github.token', 'linear.apiKey', 'anthropic.apiKey', 'openai.apiKey', 'elevenlabs.apiKey', 'notion.apiKey', 'slack.token', 'datadog.apiKey', 'vant.tokenSecret', 'vant.apiKey', 'vant.mcpApiKey']; }
function maskIfSecret(key, value) { if (!value) return null; const secrets = getSecretKeys(); if (secrets.includes(key) || key.includes('token') || key.includes('apiKey') || key.includes('secret')) return value.substring(0, 4) + '****'; return value; }

function clearCache() { _config = null; }

// Env-style functions
function apiKey(options = {}) { return options?.secret || process.env.VANT_API_KEY || null; }
function hasApiKey() { return !!apiKey() || !!process.env.VANT_API_KEY || !!process.env.ANTHROPIC_API_KEY; }
function mcpApiKey(options = {}) { return options?.secret || process.env.VANT_MCP_API_KEY || null; }
function hasMcpApiKey() { return !!mcpApiKey() || !!process.env.VANT_MCP_API_KEY; }
function tokenSecret() { return process.env.VANT_TOKEN_SECRET || null; }
function mcpPort() { return parseInt(process.env.VANT_MCP_PORT || '3457'); }
function mcpBindAddress() { return process.env.VANT_MCP_BIND || '127.0.0.1'; }
function mcpRequireKey() { 
    // Check config flags first (set via vant config set), then env var
    const flagValue = getFlag('mcp.requireKey');
    if (flagValue !== undefined) return flagValue ? 'true' : 'false';
    return process.env.VANT_MCP_REQUIRE_KEY || 'false'; 
}
function serverPort() { return parseInt(process.env.VANT_SERVER_PORT || '3456'); }
function serverBind() { return process.env.VANT_SERVER_BIND || '127.0.0.1'; }
function serverCert() { return process.env.VANT_SERVER_CERT || null; }
function serverKey() { return process.env.VANT_SERVER_KEY || null; }
function serverInsecure() { return process.env.VANT_SERVER_INSECURE === '1'; }
function serverAuthRequired() { return process.env.VANT_SERVER_AUTH_REQUIRED === '1'; }
function githubToken() { return process.env.GITHUB_TOKEN || process.env.VANT_GITHUB_TOKEN || null; }
function githubRepo() { return process.env.VANT_GITHUB_REPO || 'dhaupin/vant'; }
function agreeAutoSync() { return process.env.VANT_AGREE_AUTO_SYNC || 'false'; }

// Cloudflare config getters
function cfAccountId() { return process.env.CF_ACCOUNT_ID || null; }
function cfApiToken() { return process.env.CF_API_TOKEN || null; }
function cfPagesUrl() { return process.env.CF_PAGES_URL || null; }
function cfKvNamespace() { return process.env.CF_KV_NAMESPACE || null; }
function cfR2Bucket() { return process.env.CF_R2_BUCKET || null; }
function cfWorkerUrl() { return process.env.CF_WORKER_URL || null; }
function cfWorkerName() { return process.env.CF_WORKER_NAME || null; }

// Use brain router for paths
const brain = require('./brain');

// Write path (agents write here - keeps their brain separate from user's public brain)
function storagePath() { return brain.getBrainPath(); }

// Read path (user's runtime brain - agent loads from private)
function brainPath() { return brain.getBrainPath(); }

// Public path (user's template for fresh installs - read only)
function publicPath() { return brain.getPublicPath(); }
function logLevel() { return process.env.VANT_LOG_LEVEL || 'info'; }
function isProduction() { return process.env.NODE_ENV === 'production'; }
function isDevelopment() { return process.env.NODE_ENV === 'development'; }
function isTest() { return process.env.NODE_ENV === 'test' || process.env.VANT_TEST; }

// ==================== MULTIBRAIN STACK SUPPORT ====================

/**
 * Get config from all brains in the stack
 * @returns {Object} Combined config
 */
function getStackConfig() {
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
            const conf = getAll();
            results.byBrain[brainName] = conf;
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }
    
    return results;
}

/**
 * Get a specific flag from all brains in the stack
 * @param {string} flag - Flag name
 * @returns {Object} Combined flag values
 */
function getStackFlag(flag) {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = {
        source: 'stack',
        brains: stack,
        flag,
        byBrain: {}
    };
    
    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const value = getFlag(flag);
            results.byBrain[brainName] = value;
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }
    
    return results;
}

module.exports = {
    get, getAll, getGithub, getStegoframe, clearCache,
    set: setFlag, getFlag, isEnabled, enable, disable, toggle,
    setFlag,  // Named export for docs compatibility
    getSecretKeys, maskIfSecret,
    getLayerStatus, isOperationAllowed, getStatus,
    apiKey, hasApiKey, mcpApiKey, hasMcpApiKey, tokenSecret,
    mcpPort, mcpBindAddress, mcpRequireKey,
    serverPort, serverBind, serverCert, serverKey, serverInsecure, serverAuthRequired,
    githubToken, githubRepo, agreeAutoSync,
    // Cloudflare
    cfAccountId, cfApiToken, cfPagesUrl, cfKvNamespace, cfR2Bucket, cfWorkerUrl, cfWorkerName,
    storagePath, brainPath, publicPath, logLevel, isProduction, isDevelopment, isTest,
    // Brain config
    loadBrainConfig, saveBrainConfig,
    
    // Multibrain Stack
    getStackConfig,
    getStackFlag
};

/**
 * Adjust lock timeout settings
 * @param {object} options - Lock configuration
 * @param {number} options.maxAttempts - Max retry attempts
 * @param {number} options.baseBackoffMs - Base backoff in ms
 * @param {number} options.maxBackoffMs - Max backoff in ms
 */
function setLockOptions(options = {}) {
    try {
        const lock = require('./lock');
        if (lock && lock.LOCK_CONFIG) {
            if (typeof options.maxAttempts === 'number') {
                lock.LOCK_CONFIG.MAX_ATTEMPTS = options.maxAttempts;
            }
            if (typeof options.baseBackoffMs === 'number') {
                lock.LOCK_CONFIG.BASE_BACKOFF_MS = options.baseBackoffMs;
            }
            if (typeof options.maxBackoffMs === 'number') {
                lock.LOCK_CONFIG.MAX_BACKOFF_MS = options.maxBackoffMs;
            }
            return { success: true, config: lock.LOCK_CONFIG };
        }
    } catch (e) {
        return { success: false, error: e.message };
    }
    return { success: false, error: 'Lock module not available' };
}

module.exports.setLockOptions = setLockOptions;
