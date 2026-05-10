/**
 * Vant Config (v0.8.6)
 * Unified config registry + environment
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
        storage: { type: 'file', path: process.env.VANT_STORAGE_PATH || 'models/public' },
        log: { level: process.env.VANT_LOG_LEVEL || 'info' },
        msg: { 
            encrypted: process.env.VANT_MSG_ENCRYPTED !== 'false', // Default: true (enabled)
            autoEncrypt: process.env.VANT_MSG_AUTO_ENCRYPT !== 'false'
        },
        sync: { interval: parseInt(process.env.VANT_SYNC_INTERVAL || '300000'), branch: null },
        mcp: { port: parseInt(process.env.VANT_MCP_PORT || '3100'), bind: process.env.VANT_MCP_BIND || '127.0.0.1', requireKey: process.env.VANT_MCP_REQUIRE_KEY || 'false', apiKey: process.env.VANT_MCP_API_KEY || null },
        server: { port: parseInt(process.env.VANT_SERVER_PORT || '3456'), bind: process.env.VANT_SERVER_BIND || '127.0.0.1', cert: process.env.VANT_SERVER_CERT || null, key: process.env.VANT_SERVER_KEY || null, insecure: process.env.VANT_SERVER_INSECURE === '1', authRequired: process.env.VANT_SERVER_AUTH_REQUIRED === '1' }
    };
    const configPath = process.env.VANT_CONFIG || path.join(process.cwd(), 'vant.config.js');
    if (fs.existsSync(configPath)) {
        try { _config = { ..._config, ...require(configPath) }; } catch (e) { /* ignore */ }
    }
    return _config;
}

function get(key, defaultValue = null) { if (_flags.has(key)) return _flags.get(key).value; const cfg = load(); const parts = key.split('.'); let v = cfg; for (const p of parts) { v = v?.[p]; if (v === undefined || v === null) break; } return v ?? defaultValue; }
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

function getSecretKeys() { return ['github.token', 'linear.apiKey', 'anthropic.apiKey', 'openai.apiKey', 'elevenlabs.apiKey', 'notion.apiKey', 'slack.token', 'datadog.apiKey', 'vant.tokenSecret', 'vant.apiKey', 'vant.mcpApiKey']; }
function maskIfSecret(key, value) { if (!value) return null; const secrets = getSecretKeys(); if (secrets.includes(key) || key.includes('token') || key.includes('apiKey') || key.includes('secret')) return value.substring(0, 4) + '****'; return value; }

function clearCache() { _config = null; }

// Env-style functions
function apiKey(options = {}) { return options?.secret || process.env.VANT_API_KEY || null; }
function hasApiKey() { return !!apiKey() || !!process.env.VANT_API_KEY || !!process.env.ANTHROPIC_API_KEY; }
function mcpApiKey(options = {}) { return options?.secret || process.env.VANT_MCP_API_KEY || null; }
function hasMcpApiKey() { return !!mcpApiKey() || !!process.env.VANT_MCP_API_KEY; }
function tokenSecret() { return process.env.VANT_TOKEN_SECRET || null; }
function mcpPort() { return parseInt(process.env.VANT_MCP_PORT || '3100'); }
function mcpBindAddress() { return process.env.VANT_MCP_BIND || '127.0.0.1'; }
function mcpRequireKey() { return process.env.VANT_MCP_REQUIRE_KEY || 'false'; }
function serverPort() { return parseInt(process.env.VANT_SERVER_PORT || '3456'); }
function serverBind() { return process.env.VANT_SERVER_BIND || '127.0.0.1'; }
function serverCert() { return process.env.VANT_SERVER_CERT || null; }
function serverKey() { return process.env.VANT_SERVER_KEY || null; }
function serverInsecure() { return process.env.VANT_SERVER_INSECURE === '1'; }
function serverAuthRequired() { return process.env.VANT_SERVER_AUTH_REQUIRED === '1'; }
function githubToken() { return process.env.GITHUB_TOKEN || process.env.VANT_GITHUB_TOKEN || null; }
function githubRepo() { return process.env.VANT_GITHUB_REPO || 'dhaupin/vant'; }
function agreeAutoSync() { return process.env.VANT_AGREE_AUTO_SYNC || 'false'; }
function storagePath() { return process.env.VANT_STORAGE_PATH || 'models/public'; }
function logLevel() { return process.env.VANT_LOG_LEVEL || 'info'; }
function isProduction() { return process.env.NODE_ENV === 'production'; }
function isDevelopment() { return process.env.NODE_ENV === 'development'; }
function isTest() { return process.env.NODE_ENV === 'test' || process.env.VANT_TEST; }

module.exports = {
    get, getAll, getGithub, getStegoframe, clearCache,
    set: setFlag, getFlag, isEnabled, enable, disable, toggle,
    getSecretKeys, maskIfSecret,
    getLayerStatus, isOperationAllowed, getStatus,
    apiKey, hasApiKey, mcpApiKey, hasMcpApiKey, tokenSecret,
    mcpPort, mcpBindAddress, mcpRequireKey,
    serverPort, serverBind, serverCert, serverKey, serverInsecure, serverAuthRequired,
    githubToken, githubRepo, agreeAutoSync,
    storagePath, logLevel, isProduction, isDevelopment, isTest
};
