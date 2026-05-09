/**
 * Vant Config (v0.8.6)
 * Unified config registry - static config + runtime flags
 *
 * Usage:
 *   const config = require('./config');
 *   config.get('github.repo')      // Static config
 *   config.set('debug', true)      // Runtime flag
 *   config.isEnabled('debug')      // Check flag
 */

const fs = require('fs');
const path = require('path');

let _config = null;
let _flags = new Map();
let _startTime = Date.now();

function load() {
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
        storage: { type: 'file', path: 'models/public' },
        log: { level: process.env.VANT_LOG_LEVEL || 'info' },
        runtime: { port: parseInt(process.env.VANT_PORT || '3000'), host: process.env.VANT_HOST || '0.0.0.0' },
        sync: { interval: parseInt(process.env.VANT_SYNC_INTERVAL || '300000'), branch: null }
    };
    const configPath = process.env.VANT_CONFIG || path.join(process.cwd(), 'vant.config.js');
    if (fs.existsSync(configPath)) {
        try { _config = { ..._config, ...require(configPath) }; } catch (e) { /* ignore */ }
    }
    return _config;
}

function get(key, defaultValue = null) {
    if (_flags.has(key)) return _flags.get(key).value;
    const cfg = load();
    const parts = key.split('.');
    let value = cfg;
    for (const p of parts) { value = value?.[p]; if (value === undefined || value === null) break; }
    return value ?? defaultValue;
}

function getAll() { return load(); }
function getGithub() { return { token: _config?.github?.token, repo: _config?.github?.repo }; }
function getStegoframe() { return { url: _config?.steveframe?.url, version: _config?.steveframe?.version }; }

function setFlag(name, value) { _flags.set(name, { value, timestamp: Date.now() }); }
function getFlag(name, defaultValue = null) { return _flags.get(name)?.value ?? defaultValue; }
function isEnabled(name) { return !!getFlag(name); }
function enable(name) { setFlag(name, true); }
function disable(name) { setFlag(name, false); }
function toggle(name) { setFlag(name, !isEnabled(name)); }

function getLayerStatus() { return { name: 'Config', type: 'registry', enabled: true, state: { flags: _flags.size, uptime: Date.now() - _startTime } }; }
function isOperationAllowed(operationType) { return { allowed: true, layer: 'Config' }; }
function getStatus() { return { enabled: true, flags: _flags.size }; }

function getSecretKeys() { return ['github.token', 'linear.apiKey', 'anthropic.apiKey', 'openai.apiKey', 'elevenlabs.apiKey', 'notion.apiKey', 'slack.token', 'datadog.apiKey']; }

function maskIfSecret(key, value) {
    if (!value) return null;
    const secrets = getSecretKeys();
    if (secrets.includes(key) || key.includes('token') || key.includes('apiKey') || key.includes('secret')) {
        return value.substring(0, 4) + '****';
    }
    return value;
}

function clearCache() { _config = null; }

module.exports = {
    get, getAll, getGithub, getStegoframe, clearCache,
    set: setFlag, getFlag, isEnabled, enable, disable, toggle,
    getSecretKeys, maskIfSecret,
    getLayerStatus, isOperationAllowed, getStatus
};
