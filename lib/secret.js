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
// (pass 24) async: QoS rate limiting is async (RateLimiter.check). Callers
// MUST await this — an un-awaited rejection crashes on Node 18+.
// (pass 25) module-level limiter singleton — a per-call instance has an
// empty _requests Map every time, so the limit could never trip.
let _secretLimiter = null;

async function _checkSecurity(operation, type) {
    const sandbox = _getSandbox();
    const vaf = _getVaf();
    const qos = _getQos();

    // Sandbox capability check
    if (sandbox && !sandbox.canRead) {
        throw new errors.VantError('Sandbox: read permission required', { code: errors.CODES.CAPABILITY_NOT_ALLOWED });
    }

    // VAF input validation - validate secret type
    // (pass 24) vaf.validateString THROWS on invalid input and returns true
    // on valid — it never returns a {valid} result object. Reading .valid
    // off the return made every secret.get()/secret.set() throw
    // 'VAF: invalid secret type' whenever VAF was present (the env-var
    // password fallback has been dead since this check was added).
    if (vaf && vaf.validateString) {
        try {
            vaf.validateString(type, {
                maxLength: 50,
                pattern: /^[a-zA-Z0-9_-]+$/
            });
        } catch (e) {
            throw new errors.VantError('VAF: invalid secret type', { code: errors.CODES.CONFIG_INVALID });
        }
    }

    // QoS rate limiting for secret operations
    // (pass 24) RateLimiter's real API is async check(clientId, operation)
    // → bool; 'tryConsume' never existed, and 'max' is not a real option
    // (it's maxPerMinute). This throw was unreachable dead code.
    // (pass 25) singleton limiter — the per-call instance reset its request
    // window on every secret op, so the limit could never trip. 60/min
    // module-wide: RateLimiter's global bucket (anti clientId rotation)
    // uses the same number as the per-client bucket, and busy apps resolve
    // several provider secrets per minute — 10 was false-trip territory.
    if (qos && qos.RateLimiter) {
        if (!_secretLimiter) {
            _secretLimiter = new qos.RateLimiter({ windowMs: 60000, maxPerMinute: 60 });
        }
        if (!(await _secretLimiter.check(type || operation, operation))) {
            throw new errors.VantError('QoS: rate limit exceeded (60 req/min module-wide)', { code: errors.CODES.RATE_LIMIT_EXCEEDED });
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
    // (pass 31) Non-interactive detection: stdin is not a TTY under CI,
    // cron, and spawned subprocesses — a readline prompt there would hang
    // forever (stress finding B1). Fail structured instead.
    const interactive = !!(process.stdout && process.stdout.isTTY);
    const config = _getConfig(type);

    // SECURITY: Check security chain
    // (pass 24) must be awaited — _checkSecurity is async now (QoS check is
    // async); un-awaited = rejection crash on Node 18+.
    await _checkSecurity('secret:get', type);

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

    // 3. Prompt user — INTERACTIVE ONLY (pass 31: never prompt on a
    // non-TTY stdin; that hangs CI/cron/spawned agents forever).
    if (!forcePrompt && !interactive) {
        const err = new Error(
            `No secret available for '${type}': env var ${config.env || '(none)'} not set and stdin is not interactive ` +
            '(CI/cron cannot be prompted). Set the env var or run interactively.'
        );
        err.code = 'E_SECRET_NON_INTERACTIVE';
        _emit('secret:denied', { type, reason: 'non_interactive' });
        throw err;
    }

    return new Promise((resolve, reject) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question(config.prompt, (secret) => {
            rl.close();

            // SECURITY: Validate input (validateString throws on invalid —
            // see _checkSecurity note in pass 24; the old .valid read was
            // unreachable dead logic)
            const vaf = _getVaf();
            if (vaf && vaf.validateString) {
                try {
                    vaf.validateString(secret, { maxLength: 1000 });
                } catch (e) {
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
async function set(type, secret) {
    // SECURITY: Check security chain
    await _checkSecurity('secret:set', type);

    // SECURITY: Validate input (throws on invalid; .valid read was broken —
    // see _checkSecurity pass 24 note)
    const vaf = _getVaf();
    if (vaf && vaf.validateString) {
        try {
            vaf.validateString(secret, { maxLength: 1000 });
        } catch (e) {
            throw new errors.VantError('VAF: invalid secret', { code: errors.CODES.CONFIG_INVALID });
        }
    }

    _cache.set(type, secret);
    _emit('secret:set', { type });
}

/**
 * Clear a specific secret from cache
 */
async function clear(type) {
    await _checkSecurity('secret:clear', type);
    _cache.delete(type);
    _emit('secret:cleared', { type });
}

/**
 * Clear all secrets from cache
 */
async function clearAll() {
    await _checkSecurity('secret:clear', 'all');
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
    PASSWORD_ENV_KEY: 'VANT_BRAIN_PASSWORD'
};
