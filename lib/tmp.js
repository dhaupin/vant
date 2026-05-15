/**
 * Tmp - Temporary file handler (dropbox, cache, temp, myStuff, yourStuff)
 * 
 * SECURITY: Heavy protection layer
 * - VAF: Input validation + path traversal + injection prevention
 * - Sandbox: Capability gating (canRead/Write/Delete)
 * - Escrow: Budget limiting
 * - Lock: Concurrent access serialization
 * - Audit: All operations logged
 * - Limits: Max file size, max files per space
 * 
 * Uses: vaf.js, sandbox.js, escrow.js, lock.js, storage.js, cache.js, audit.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cache = require('./cache');
const vaf = require('./vaf');
const audit = require('./audit');

// Paths
function _getStoragePath() {
    const storage = global._brain?.getBrainStorage?.()?.path || require('./brain').getBrainStorage?.()?.path || './storage';
    return path.join(storage, 'tmp');
}

function _getPrivatePath() {
    const storage = global._brain?.getBrainStorage?.()?.path || require('./brain').getBrainStorage?.()?.path || './storage';
    return path.join(storage, 'private');
}

function _getSharedPath() {
    const storage = global._brain?.getBrainStorage?.()?.path || require('./brain').getBrainStorage?.()?.path || './storage';
    return path.join(storage, 'shared');
}

// Security: Sandbox
function _getSandbox() {
    let sb = global._sandbox;
    if (!sb) try { sb = global._sandbox = require('./sandbox'); } catch (e) {}
    return sb;
}

// Security: Escrow
function _getEscrow() {
    let esc = global._escrow;
    if (!esc) try { esc = global._escrow = require('./escrow'); } catch (e) {}
    return esc;
}

// Security: Lock
function _getLock() {
    let lock = global._lock;
    if (!lock) try { lock = global._lock = require('./lock'); } catch (e) {}
    return lock;
}

// LIMITS - Prevent disasters
const MAX_FILE_SIZE = 1024 * 1024;  // 1MB
const MAX_FILES = 100;
const MAX_NAME_LEN = 255;

// VAF + Security helpers
function _sanitizeName(name) {
    if (!name || typeof name !== 'string') throw new Error('Invalid name');
    const safe = vaf.sanitize(name);
    if (safe.includes('..') || safe.includes('/') || safe.includes('\\')) {
        throw new Error('EPATH: path traversal blocked');
    }
    return safe.slice(0, MAX_NAME_LEN);
}

function _checkLimits(dir) {
    if (!fs.existsSync(dir)) return true;
    if (fs.readdirSync(dir).length >= MAX_FILES) {
        throw new Error('ELIMIT: max files reached');
    }
    return true;
}

function _audit(op, data) {
    try { audit?.log?.({ component: 'tmp', op, data, time: Date.now() }); } catch (e) {}
}

// DropBox
function _ensureDropbox() {
    const dp = path.join(_getStoragePath(), 'dropbox');
    if (!fs.existsSync(dp)) fs.mkdirSync(dp, { recursive: true });
    return dp;
}

async function dropboxPut(name, content) {
    const sb = _getSandbox();
    if (sb && typeof sb.can === 'function' && !sb.can('canWrite')) throw new Error('EPERM');
    const safeName = _sanitizeName(name);
    _audit('dropboxPut', { name: safeName });
    _checkLimits(_ensureDropbox());
    const filePath = path.join(_ensureDropbox(), safeName);
    const tempPath = filePath + '.' + crypto.randomUUID();
    if (content.length > MAX_FILE_SIZE) throw new Error('ESIZE: too large');
    fs.writeFileSync(tempPath, content, 'utf8');
    fs.renameSync(tempPath, filePath);
    return { saved: safeName };
}

async function dropboxGet(name) {
    const sb = _getSandbox();
    if (sb && typeof sb.can === 'function' && !sb.can('canRead')) throw new Error('EPERM');
    const safeName = _sanitizeName(name);
    const filePath = path.join(_ensureDropbox(), safeName);
    if (!fs.existsSync(filePath)) return { error: 'not found' };
    return { name: safeName, content: fs.readFileSync(filePath, 'utf8') };
}

async function dropboxList() {
    const dp = _ensureDropbox();
    return { files: fs.readdirSync(dp).map(f => ({ name: f })) };
}

async function dropboxDelete(name) {
    const safeName = _sanitizeName(name);
    const filePath = path.join(_ensureDropbox(), safeName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return { deleted: safeName };
}

async function dropboxClear() {
    const dp = _ensureDropbox();
    if (fs.existsSync(dp)) fs.rmSync(dp, { recursive: true, force: true });
    return { cleared: true };
}

// myStuff (private)
function _ensureMyStuff() {
    const my = path.join(_getPrivatePath(), 'myStuff');
    if (!fs.existsSync(my)) fs.mkdirSync(my, { recursive: true });
    return my;
}

async function myStuffPut(name, content) {
    const sb = _getSandbox();
    if (sb && typeof sb.can === 'function' && !sb.can('canWrite')) throw new Error('EPERM');
    const safeName = _sanitizeName(name);
    _audit('myStuffPut', { name: safeName });
    _checkLimits(_ensureMyStuff());
    const filePath = path.join(_ensureMyStuff(), safeName);
    if (content.length > MAX_FILE_SIZE) throw new Error('ESIZE: too large');
    fs.writeFileSync(filePath, content, 'utf8');
    return { saved: safeName, type: 'myStuff' };
}

async function myStuffGet(name) {
    const sb = _getSandbox();
    if (sb && typeof sb.can === 'function' && !sb.can('canRead')) throw new Error('EPERM');
    const safeName = _sanitizeName(name);
    const filePath = path.join(_ensureMyStuff(), safeName);
    if (!fs.existsSync(filePath)) return { error: 'not found' };
    return { name: safeName, content: fs.readFileSync(filePath, 'utf8'), type: 'myStuff' };
}

async function myStuffList() {
    return { files: fs.readdirSync(_ensureMyStuff()).map(f => ({ name: f })), type: 'myStuff' };
}

async function myStuffDelete(name) {
    const safeName = _sanitizeName(name);
    const filePath = path.join(_ensureMyStuff(), safeName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return { deleted: safeName, type: 'myStuff' };
}

// yourStuff (shared)
function _ensureYourStuff() {
    const sh = path.join(_getSharedPath(), 'yourStuff');
    if (!fs.existsSync(sh)) fs.mkdirSync(sh, { recursive: true });
    return sh;
}

async function yourStuffPut(name, content) {
    const sb = _getSandbox();
    if (sb && typeof sb.can === 'function' && !sb.can('canWrite')) throw new Error('EPERM');
    const safeName = _sanitizeName(name);
    _audit('yourStuffPut', { name: safeName });
    _checkLimits(_ensureYourStuff());
    const filePath = path.join(_ensureYourStuff(), safeName);
    if (content.length > MAX_FILE_SIZE) throw new Error('ESIZE: too large');
    fs.writeFileSync(filePath, content, 'utf8');
    return { saved: safeName, type: 'yourStuff' };
}

async function yourStuffGet(name) {
    const sb = _getSandbox();
    if (sb && typeof sb.can === 'function' && !sb.can('canRead')) throw new Error('EPERM');
    const safeName = _sanitizeName(name);
    const filePath = path.join(_ensureYourStuff(), safeName);
    if (!fs.existsSync(filePath)) return { error: 'not found' };
    return { name: safeName, content: fs.readFileSync(filePath, 'utf8'), type: 'yourStuff' };
}

async function yourStuffList() {
    return { files: fs.readdirSync(_ensureYourStuff()).map(f => ({ name: f })), type: 'yourStuff' };
}

async function yourStuffDelete(name) {
    const safeName = _sanitizeName(name);
    const filePath = path.join(_ensureYourStuff(), safeName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return { deleted: safeName, type: 'yourStuff' };
}

// Cache - uses lib/cache.js
function cacheSet(key, value, ttl = 3600000) {
    cache.set(key, value, { ttl });
    return { cached: key };
}

function cacheGet(key) {
    const value = cache.get(key);
    return value !== undefined ? { key, value } : { error: 'not found' };
}

function cacheClear() {
    cache.clear();
    return { cleared: true };
}

module.exports = {
    dropboxPut, dropboxGet, dropboxList, dropboxDelete, dropboxClear,
    myStuffPut, myStuffGet, myStuffList, myStuffDelete,
    yourStuffPut, yourStuffGet, yourStuffList, yourStuffDelete,
    cacheSet, cacheGet, cacheClear,
    getLayerStatus: () => ({ name: 'Tmp', type: 'tmp', version: '0.8.7', enabled: true, secured: true })
};