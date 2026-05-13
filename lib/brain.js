/**
 * Brain Router - Core Brain Loading System
 *
 * Single source of truth for brain loading.
 * Implements dual-brain architecture:
 *   1. Load public (models/public) - OS template
 *   2. Layer private (models/private) - runtime overrides
 *
 * All modules should require this, not manage paths themselves.
 */

const fs = require('fs');
const path = require('path');

// ==================== MIDDLEWARE CHAIN ====================
// These are lazy-loaded to avoid circular deps
let _sandbox = null;
let _vaf = null;
let _qos = null;
let _escrow = null;

function _getSandbox() {
    if (!_sandbox) { try { _sandbox = require('./sandbox'); } catch (e) {} }
    return _sandbox;
}

function _getVAF() {
    if (!_vaf) { try { _vaf = require('./vaf'); } catch (e) {} }
    return _vaf;
}

function _getQoS() {
    if (!_qos) { try { _qos = require('./qos'); } catch (e) {} }
    return _qos;
}

function _getEscrow() {
    if (!_escrow) { try { _escrow = require('./escrow'); } catch (e) {} }
    return _escrow;
}

// ==================== MODE SWITCH ====================
// Brain loading modes: 'dual' (default), 'public', 'private', 'remote'
// 'remote' = tunnel to remote brain server
let _mode = 'dual';
let _remoteURL = null;

function getMode() { return _mode; }
function setMode(mode) { 
    if (['dual', 'public', 'private', 'remote'].includes(mode)) {
        _mode = mode;
    }
}
function getRemoteURL() { return _remoteURL; }
function setRemoteURL(url) { _remoteURL = url; }

// ==================== REMOTE TUNNEL ====================
// Fetch from remote brain server
async function _fetchRemote(name) {
    if (!_remoteURL) return null;
    const url = _remoteURL.replace(/\/$/, '') + '/brain/' + name + '.json';
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        return null;
    }
}

// ==================== SECURITY CHECKS ====================
function _checkRead(name) {
    const sandbox = _getSandbox();
    if (sandbox?.can) {
        if (!sandbox.can('canRead')) throw new Error('Sandbox: canRead not allowed');
    }
    const vaf = _getVAF();
    if (vaf?.check) {
        vaf.check(name, { type: 'string', maxLength: 100 });
    }
}

function _checkWrite(name) {
    const sandbox = _getSandbox();
    if (sandbox?.can) {
        if (!sandbox.can('canWrite')) throw new Error('Sandbox: canWrite not allowed');
    }
}

async function _checkRate() {
    const qos = _getQoS();
    if (qos?.check) await qos.check('brain');
}

async function _checkEscrow(op, params) {
    const escrow = _getEscrow();
    if (escrow?.approve) {
        await escrow.approve(op, params);
    }
}

// ==================== PATH CONSISTENCY ====================
// Must align with storage.js MODELS_PATH for consistency
// SECURITY: Block path traversal (same as storage.js)
function getBrainPath() {
    let brainPath = process.env.MODEL_PATH || process.env.VANT_BRAIN_PATH || process.env.VANT_STORAGE_PATH || 'models/private';
    if (brainPath.startsWith('/') || brainPath.includes('..')) {
        brainPath = 'models/private';
    }
    return brainPath;
}

/**
 * Get public directory path (read-only base)
 */
function getPublicPath() {
    // Must align with storage.js models base relative to cwd
    return 'models/public';
}

/**
 * Load a single brain file
 * @param {string} name - Brain name (without .md)
 * @returns {Promise<Object|null>} Brain object or null
 */
async function loadBrain(name) {
    // Security: validate input
    _checkRead(name);
    
    // Mode switch: routing
    if (_mode === 'public') {
        const publicFile = path.join(getPublicPath(), name + '.md');
        if (fs.existsSync(publicFile)) {
            return { name, content: fs.readFileSync(publicFile, 'utf8'), source: 'public' };
        }
        return null;
    }
    
    if (_mode === 'private') {
        const privateFile = path.join(getBrainPath(), name + '.md');
        if (fs.existsSync(privateFile)) {
            return { name, content: fs.readFileSync(privateFile, 'utf8'), source: 'private' };
        }
        return null;
    }
    
    // Remote mode: tunnel to remote server (fallback to local)
    if (_mode === 'remote' && _remoteURL) {
        try {
            const remote = await _fetchRemote(name);
            if (remote) {
                return { name, content: remote.content, source: 'remote' };
            }
        } catch (e) { /* fall through to local */ }
    }
    
    // Default: dual (private overrides public)
    const brainPath = getBrainPath();
    const publicPath = getPublicPath();
    const privateFile = path.join(brainPath, name + '.md');
    const publicFile = path.join(publicPath, name + '.md');
    
    // Check private first (overrides)
    if (fs.existsSync(privateFile)) {
        return { name, content: fs.readFileSync(privateFile, 'utf8'), source: 'private' };
    }
    // Fall back to public
    if (fs.existsSync(publicFile)) {
        return { name, content: fs.readFileSync(publicFile, 'utf8'), source: 'public' };
    }
    return null;
}

/**
 * Load all brains as merged corpus
 * @returns {Array} Array of brain objects
 */
function loadCorpus() {
    // Rate limit check
    _checkRate().catch(() => {});
    
    const brainPath = getBrainPath();
    const publicPath = getPublicPath();
    const brain = {};
    
    // Mode: public only
    if (_mode === 'public') {
        if (fs.existsSync(publicPath)) {
            fs.readdirSync(publicPath)
                .filter(f => f.endsWith('.md'))
                .forEach(file => {
                    const name = file.replace('.md', '');
                    brain[name] = { 
                        content: fs.readFileSync(path.join(publicPath, file), 'utf8'),
                        source: 'public'
                    };
                });
        }
        return Object.entries(brain).map(([name, { content, source }]) => ({
            id: name,
            title: name,
            content,
            source,
            type: 'brain'
        }));
    }
    
    // Mode: private only
    if (_mode === 'private') {
        if (fs.existsSync(brainPath)) {
            fs.readdirSync(brainPath)
                .filter(f => f.endsWith('.md'))
                .forEach(file => {
                    const name = file.replace('.md', '');
                    brain[name] = { 
                        content: fs.readFileSync(path.join(brainPath, file), 'utf8'),
                        source: 'private'
                    };
                });
        }
        return Object.entries(brain).map(([name, { content, source }]) => ({
            id: name,
            title: name,
            content,
            source,
            type: 'brain'
        }));
    }
    
    // Default: dual (public base + private overrides)
    // 1. Load public as base
    if (fs.existsSync(publicPath)) {
        fs.readdirSync(publicPath)
            .filter(f => f.endsWith('.md'))
            .forEach(file => {
                const name = file.replace('.md', '');
                brain[name] = { 
                    content: fs.readFileSync(path.join(publicPath, file), 'utf8'),
                    source: 'public'
                };
            });
    }
    
    // 2. Layer private on top (overrides)
    if (fs.existsSync(brainPath)) {
        fs.readdirSync(brainPath)
            .filter(f => f.endsWith('.md'))
            .forEach(file => {
                const name = file.replace('.md', '');
                brain[name] = { 
                    content: fs.readFileSync(path.join(brainPath, file), 'utf8'),
                    source: 'private'
                };
            });
    }
    
    // Convert to array
    return Object.entries(brain).map(([name, { content, source }]) => ({
        id: name,
        title: name,
        content,
        source,
        type: 'brain'
    }));
}

/**
 * Check if brain exists
 * @param {string} name - Brain name
 * @returns {string|null} Source ('public'|'private'|null)
 */
function hasBrain(name) {
    const brainPath = getBrainPath();
    const publicPath = getPublicPath();
    
    if (fs.existsSync(path.join(brainPath, name + '.md'))) {
        return 'private';
    }
    if (fs.existsSync(path.join(publicPath, name + '.md'))) {
        return 'public';
    }
    return null;
}

/**
 * Get list of available brains
 * @param {string} [type] - Filter by type ('public'|'private')
 * @returns {Array} Array of brain names
 */
function listBrains(type) {
    const brainPath = getBrainPath();
    const publicPath = getPublicPath();
    const names = new Set();
    
    if (!type || type === 'public') {
        if (fs.existsSync(publicPath)) {
            fs.readdirSync(publicPath)
                .filter(f => f.endsWith('.md'))
                .forEach(f => names.add(f.replace('.md', '')));
        }
    }
    
    if (!type || type === 'private') {
        if (fs.existsSync(brainPath)) {
            fs.readdirSync(brainPath)
                .filter(f => f.endsWith('.md'))
                .forEach(f => names.add(f.replace('.md', '')));
        }
    }
    
    return Array.from(names).sort();
}

module.exports = {
    // Paths
    getBrainPath,
    getPublicPath,
    // Core loading
    loadBrain,
    loadCorpus,
    hasBrain,
    listBrains,
    // Mode switch
    getMode,
    setMode,
    getRemoteURL,
    setRemoteURL
};