/**
 * Vant Config
 * Single source of truth, no duplication
 *
 * Related: https://github.com/dhaupin/vant
 *
 * Usage: require this module
 *   const config = require('./config');
 *   config.github.token    // Gets from env automatically
 *   config.github.repo    // 'your-repo'
 *   config.stegoframe.url // Base URL
 *
 * Efficiency:
 * - Single config object (no INI parsing each time)
 * - Lazy loading
 * - Cached values
 * 
 * SECURITY:
 * - Never log secrets
 * - Prefer env vars over config file for credentials
 */

const fs = require('fs');
const path = require('path');

// Cache
let _config = null;

// Get VANT version from config.ini - single source of truth
function getVantVersion() {
    const configPath = path.join(__dirname, '..', 'config.ini');
    if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf8');
        const match = content.match(/VANT_VERSION\s*=\s*(.+)/);
        if (match) return match[1].trim();
    }
    return 'v0.0.0'; // fallback
}

/**
 * Load config once
 */
function loadConfig() {
    if (_config) return _config;

    const configPath = path.join(__dirname, '..', 'config.ini');

    if (!fs.existsSync(configPath)) {
        // Fallback defaults - safe for public use
        _config = getDefaults();
        return _config;
    }

    const content = fs.readFileSync(configPath, 'utf8');
    const lines = content.split('\n');

    const config = {};

    lines.forEach(line => {
        line = line.trim();
        if (line && !line.startsWith('#') && line.includes('=')) {
            const [key, ...rest] = line.split('=');
            config[key.trim()] = rest.join('=').trim();
        }
    });

    _config = config;
    return config;
}

/**
 * Default config - PUBLIC SAFE
 * No credentials, users must configure
 */
function getDefaults() {
    return {
        VANT_VERSION: 'v0.8.1',
        MODEL_PATH: 'models/public',
        STEGOFRAME_URL: 'https://stegoframe.creadev.org',
        STEGOFRAME_ROOM: '',       // User must configure
        STEGOFRAME_PASSPHRASE: '', // User must configure
        STEGOFRAME_MODE: 'svg',
        GITHUB_REPO: '',           // User must configure
        GITHUB_BRANCH: 'main',
        POLLING_INTERVAL: '10000',
        MAX_REQUESTS_PER_HOUR: '360'
    };
}

/**
 * Get config value
 */
function get(key) {
    const config = loadConfig();
    let value = config[key];

    // Handle environment variable substitution
    if (value && value.startsWith('${') && value.endsWith('}')) {
        const envKey = value.slice(2, -1);
        value = process.env[envKey] || '';
    }

    return value;
}

/**
 * Get all config (with processed values)
 */
function getAll() {
    const config = loadConfig();

    const result = { ...config };

    // Process env vars
    Object.keys(result).forEach(key => {
        const value = result[key];
        if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
            const envKey = value.slice(2, -1);
            result[key] = process.env[envKey] || '';
        }
    });

    return result;
}

/**
 * Get github config
 */
function getGithub() {
    return {
        repo: get('GITHUB_REPO'),
        branch: get('GITHUB_BRANCH'),
        token: process.env.GITHUB_TOKEN || '',
        apiUrl: 'api.github.com'
    };
}

/**
 * Get stegoframe config
 */
function getStegoframe() {
    return {
        url: get('STEGOFRAME_URL'),
        room: get('STEGOFRAME_ROOM'),
        passphrase: process.env.STEGOFRAME_PASSPHRASE || get('STEGOFRAME_PASSPHRASE'),
        mode: get('STEGOFRAME_MODE')
    };
}

/**
 * Clear cache
 */
function clearCache() {
    _config = null;
}

module.exports = {
    get,
    getAll,
    getGithub,
    getStegoframe,
    getVantVersion,
    clearCache
};