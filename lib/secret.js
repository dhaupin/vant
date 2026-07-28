/**
 * Vant Secret Manager (v0.8.6)
 * Unified secret/password handling for Vant
 * WITH SECURITY CHAIN INTEGRATION
 * 
 * Features:
 * - Multiple secret types (brain, github, openai, etc.)
 * - Read from env vars (VANT_BRAIN_PASSWORD, GITHUB_TOKEN, etc.)
 * - Prompt user via stdin if not provided
 * - Don't store in config or memory long-term
 * - Auto-clear after use
 * - INTEGRATED with sandbox, vaf, qos, escrow
 * 
 * Usage:
 *   const secret = require('./lib/secret');
 *   const pwd = await secret.get('brain');
 *   const token = await secret.get('github');
 */

const readline = require('readline');
const errors = require('./error');

// Lazy-load security chain
let _sandbox = null;
let _vaf = null;
let _qos = null;
let _escrow = null;
let _event = null;

function _getSandbox() {
    if (!_sandbox) { try { _sandbox = require('./sandbox'); } catch(e) {} }
    return _sandbox;
}

function _getVaf() {
    if (!_vaf) { try { _vaf = require('./vaf'); } catch(e) {} }
    return _vaf;
}

function _getQos() {
    if (!_qos) { try { _qos = require('./qos'); } catch(e) {} }
    return _qos;
}

function _getEscrow() {
    if (!_escrow) { try { _escrow = require('./escrow'); } catch(e) {} }
    return _escrow;
}

function _getEvent() {
    if (!_event) { try { _event = require('./event'); } catch(e) {} }
    return _event;
}

function _emit(event, data) {
    const ev = _getEvent();
    if (ev && ev.emit) {
        ev.emit(event, data);
    }
}

/**
 * Check if operation is allowed via security chain
 */
function _checkSecurity(operation, type) {
    const sandbox = _getSandbox();
    const vaf = _getVaf();
    const qos = _getQos();
    
    // Sandbox capability check
    if (sandbox && !sandbox.canRead) {
        throw new errors.VantError('Sandbox: read permission required', { code: errors.CODES.CAPABILITY_NOT_ALLOWED });
    }
    
    // VAF input validation - validate secret type
    if (vaf && vaf.validateString) {
        const validation = vaf.validateString(type, { 
            maxLength: 50, 
            pattern: /^[a-zA-Z0-9_-]+$/ 
        });
        if (!validation.valid) {
            throw new errors.VantError('VAF: invalid secret type', { code: errors.CODES.CONFIG_INVALID });
        }
    }
    
    // QoS rate limiting for secret operations
    if (qos && qos.RateLimiter) {
        const limiter = new qos.RateLimiter({ windowMs: 60000, max: 10 });
        if (!limiter.tryConsume(operation)) {
            throw new errors.VantError('QoS: rate limit exceeded', { code: errors.CODES.RATE_LIMIT_EXCEEDED });
        }
    }
    
    return true;
}

// In-memory cache (type -> secret)
const _cache = new Map();

// Default env var prefix
const DEFAULT_PREFIX = 'VANT_';

// Secret type -> env var mapping
const SECRET_CONFIG = {
    brain: {
        env: 'VANT_BRAIN_PASSWORD',
        prompt: 'Enter brain password: ',
        description: 'Brain/horcrux encryption',
        useConfig: true // Use config.brain.passwordTimeout
    },
    github: {
        env: 'GITHUB_TOKEN',
        prompt: 'Enter GitHub token: ',
        description: 'GitHub API access'
    },
    openai: {
        env: 'OPENAI_API_KEY',
        prompt: 'Enter OpenAI API key: ',
        description: 'OpenAI API access'
    },
    anthropic: {
        env: 'ANTHROPIC_API_KEY',
        prompt: 'Enter Anthropic API key: ',
        description: 'Anthropic/Claude API access'
    },
    telegram: {
        env: 'TELEGRAM_BOT_TOKEN',
        prompt: 'Enter Telegram bot token: ',
        description: 'Telegram bot authentication'
    },
    slack: {
        env: 'SLACK_BOT_TOKEN',
        prompt: 'Enter Slack bot token: ',
        description: 'Slack bot authentication'
    },
    default: {
        env: null, // Will be constructed from type
        prompt: 'Enter secret: ',
        description: 'Generic secret'
    }
};

/**
 * Get configuration for a secret type
 */
function _getConfig(type) {
    return SECRET_CONFIG[type] || { ...SECRET_CONFIG.default, env: `${DEFAULT_PREFIX}${type.toUpperCase()}_PASSWORD` };
}

/**
 * Check if cached secret has expired (like sudo timeout)
 */
function _isCachedExpired(type) {
    const cached = _cache.get(type);
    if (!cached || !cached.timestamp) return true;
    
    let config;
    const secretConfig = _getConfig(type);
    
    if (secretConfig.useConfig) {
        // Use Vant config system
        try {
            const vantConfig = require('./config');
            config = vantConfig.get('brain') || {};
        } catch (e) {
            config = {};
        }
    } else {
        config = secretConfig;
    }
    
    const timeout = config.passwordTimeout || 0;
    
    if (timeout <= 0) return false; // No timeout
    
    return (Date.now() - cached.timestamp) > timeout;
}

/**
 * Get a secret (from cache, env, or prompt)
 * SECURITY: Validates input, checks sandbox, rate limits
 */
async function get(type = 'default', options = {}) {
    const { forcePrompt = false } = options;
    const config = _getConfig(type);
    
    // SECURITY: Check security chain
    _checkSecurity('secret:get', type);
    
    // 1. Check cache (with timeout check)
    if (_cache.has(type) && !forcePrompt) {
        if (!_isCachedExpired(type)) {
            _emit('secret:accessed', { type, source: 'cache' });
            return _cache.get(type).value;
        }
        // Expired - clear and re-prompt
        _cache.delete(type);
    }
    
    // 2. Check env var
    const envKey = config.env;
    if (!forcePrompt && envKey && process.env[envKey]) {
        const secret = process.env[envKey];
        _cache.set(type, { value: secret, timestamp: Date.now() });
        _emit('secret:accessed', { type, source: 'env' });
        return secret;
    }
    
    // 3. Prompt user
    return new Promise((resolve, reject) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        rl.question(config.prompt, (secret) => {
            rl.close();
            
            // SECURITY: Validate input
            const vaf = _getVaf();
            if (vaf && vaf.validateString) {
                const validation = vaf.validateString(secret, { maxLength: 1000 });
                if (!validation.valid) {
                    reject(new Error('VAF: invalid secret'));
                    return;
                }
            }
            
            // Store with timestamp for timeout tracking
            _cache.set(type, { value: secret, timestamp: Date.now() });
            resolve(secret);
        });
        
        rl.on('close', () => {
            if (!_cache.has(type)) {
                reject(new Error('Secret prompt cancelled'));
            }
        });
    });
}

/**
 * Set a secret programmatically
 * SECURITY: Validates input
 */
function set(type, secret) {
    // SECURITY: Check security chain
    _checkSecurity('secret:set', type);
    
    // SECURITY: Validate input
    const vaf = _getVaf();
    if (vaf && vaf.validateString) {
        const validation = vaf.validateString(secret, { maxLength: 1000 });
        if (!validation.valid) {
            throw new errors.VantError('VAF: invalid secret', { code: errors.CODES.CONFIG_INVALID });
        }
    }
    
    _cache.set(type, secret);
    _emit('secret:set', { type });
}

/**
 * Clear a specific secret from cache
 */
function clear(type) {
    _checkSecurity('secret:clear', type);
    _cache.delete(type);
    _emit('secret:cleared', { type });
}

/**
 * Clear all secrets from cache
 */
function clearAll() {
    _checkSecurity('secret:clear', 'all');
    _cache.clear();
    _emit('secret:cleared', { type: 'all' });
}

/**
 * Check if a secret is available (cached or env, not expired)
 */
function has(type) {
    const config = _getConfig(type);
    if (config.env && !!process.env[config.env]) return true;
    if (!_cache.has(type)) return false;
    return !_isCachedExpired(type);
}

/**
 * Get all available secret types
 */
function types() {
    return Object.keys(SECRET_CONFIG).filter(t => t !== 'default');
}

/**
 * Get secret config info (without secrets)
 */
function info(type) {
    const config = _getConfig(type);
    return {
        type,
        description: config.description,
        envKey: config.env,
        hasSecret: has(type)
    };
}

/**
 * Get security layer status
 */
function getLayerStatus() {
    return {
        sandbox: !!_getSandbox(),
        vaf: !!_getVaf(),
        qos: !!_getQos(),
        escrow: !!_getEscrow()
    };
}

/**
 * Parse password from filename (consolidated from stego.js, transform.js)
 * 
 * Filename schema: p_[password]-b_[bootstrap]_[flags]_[extra].[ext]
 *   p_       = password prefix
 *   -b_      = bootstrap (optional file to load next)
 *   -[flags]  = single char flags: e=encrypted, n=nested, d=diff
 *   _<extra>  = optional notes
 * 
 * Examples:
 *   p_hello.svg → password: hello
 *   nova-p_nova2026.svg → password: nova2026
 *   p_key-b_ocean.svg → password: key, bootstrap: ocean
 *   p_key-b_art-n_e_note.svg → password: key, bootstrap: art, flags: n,e, extra: note
 * 
 * @param {string} filename - Filename to parse
 * @returns {Object} { password, bootstrap, flags, extra, raw }
 */
function parseFilenamePassword(filename) {
    if (!filename || typeof filename !== 'string') {
        return { password: null, bootstrap: null, flags: [], extra: null, raw: filename };
    }
    
    const meta = { password: null, bootstrap: null, flags: [], extra: null, raw: filename };
    
    // Extract just filename from path
    const basename = filename.split(/[\\/]/).pop();
    const nameWithoutExt = basename.replace(/\.[^.]+$/, '');
    
    // Method 1: Rich schema p_PASSWORD-b_BOOTSTRAP_FLAGS_EXTRA
    const hasPasswordPrefix = nameWithoutExt.includes('p_');
    if (nameWithoutExt.includes('_')) {
        const parts = nameWithoutExt.split(/[-_]/);
        
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            
            // p_PASSWORD
            if (part === 'p' && parts[i + 1]) {
                meta.password = parts[i + 1];
                meta.extra = null; // Clear extra when password found
                i++;
            }
            // b_BOOTSTRAP
            else if (part === 'b' && parts[i + 1]) {
                meta.bootstrap = parts[i + 1];
                i++;
            }
            // flags: single chars after bootstrap
            else if (part.length === 1 && /[endcv]/i.test(part)) {
                meta.flags.push({ flag: part, enabled: true });
            }
            // anything else = extra (if not password or bootstrap, and no p_ pattern)
            else if (part && !meta.password && !meta.bootstrap && !hasPasswordPrefix) {
                meta.extra = part;
            }
        }
    }
    
    // Method 2: Simple pattern password_is_xxx.svg
    if (!meta.password) {
        const simple = /(?:password|secret|neuron|public)_is_(.+)/i.exec(nameWithoutExt);
        if (simple) meta.password = simple[1];
    }
    
    // Method 3: Direct p_PASSWORD anywhere in filename (e.g., nova-p_nova2026)
    // Matches p_PASSWORD pattern without setting extra
    if (!meta.password) {
        const directMatch = nameWithoutExt.match(/p_([^.\-]+)/);
        if (directMatch) {
            meta.password = directMatch[1];
            // Don't set extra for direct matches
        }
    }
    
    return meta;
}

module.exports = {
    get,
    set,
    clear,
    clearAll,
    has,
    types,
    info,
    getLayerStatus,
    parseFilenamePassword,
    // Legacy compatibility
    getPassword: (opts) => get('brain', opts),
    hasPassword: () => has('brain'),
    clearPassword: () => clear('brain'),
    PASSWORD_ENV_KEY: 'VANT_BRAIN_PASSWORD'
};
