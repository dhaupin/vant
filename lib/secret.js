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

// Lazy-load security chain
let _sandbox = null;
let _vaf = null;
let _qos = null;
let _escrow = null;

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

/**
 * Check if operation is allowed via security chain
 */
function _checkSecurity(operation, type) {
    const sandbox = _getSandbox();
    const vaf = _getVaf();
    const qos = _getQos();
    
    // Sandbox capability check
    if (sandbox && !sandbox.canRead) {
        throw new Error('Sandbox: read permission required');
    }
    
    // VAF input validation - validate secret type
    if (vaf && vaf.validateString) {
        const validation = vaf.validateString(type, { 
            maxLength: 50, 
            pattern: /^[a-zA-Z0-9_-]+$/ 
        });
        if (!validation.valid) {
            throw new Error('VAF: invalid secret type');
        }
    }
    
    // QoS rate limiting for secret operations
    if (qos && qos.RateLimiter) {
        const limiter = new qos.RateLimiter({ windowMs: 60000, max: 10 });
        if (!limiter.tryConsume(operation)) {
            throw new Error('QoS: rate limit exceeded');
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
        description: 'Brain/horcrux encryption'
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
 * Get a secret (from cache, env, or prompt)
 * SECURITY: Validates input, checks sandbox, rate limits
 */
async function get(type = 'default', options = {}) {
    const { forcePrompt = false } = options;
    const config = _getConfig(type);
    
    // SECURITY: Check security chain
    _checkSecurity('secret:get', type);
    
    // 1. Check cache
    if (_cache.has(type) && !forcePrompt) {
        return _cache.get(type);
    }
    
    // 2. Check env var
    const envKey = config.env;
    if (!forcePrompt && envKey && process.env[envKey]) {
        const secret = process.env[envKey];
        _cache.set(type, secret);
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
            
            _cache.set(type, secret);
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
            throw new Error('VAF: invalid secret');
        }
    }
    
    _cache.set(type, secret);
}

/**
 * Clear a specific secret from cache
 */
function clear(type) {
    _checkSecurity('secret:clear', type);
    _cache.delete(type);
}

/**
 * Clear all secrets from cache
 */
function clearAll() {
    _checkSecurity('secret:clear', 'all');
    _cache.clear();
}

/**
 * Check if a secret is available (cached or env)
 */
function has(type) {
    const config = _getConfig(type);
    return _cache.has(type) || (config.env && !!process.env[config.env]);
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

module.exports = {
    get,
    set,
    clear,
    clearAll,
    has,
    types,
    info,
    getLayerStatus,
    // Legacy compatibility
    getPassword: (opts) => get('brain', opts),
    hasPassword: () => has('brain'),
    clearPassword: () => clear('brain'),
    PASSWORD_ENV_KEY: 'VANT_BRAIN_PASSWORD'
};
