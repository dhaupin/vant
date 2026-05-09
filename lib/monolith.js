/**
 * Monolith (v0.8.6)
 * Consolidated utilities - all in one for AI-first OS
 */

const crypto = require('crypto');
const zlib = require('zlib');
const fs = require('fs');
const events = require('events');
const path = require('path');

const VERSION = '0.8.6';

// ============== UUID ==============
function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}
function nanoId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 15);
}

// ============== HASH ==============
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    return Math.abs(hash);
}
function md5(str) { return crypto.createHash('md5').update(str).digest('hex'); }
function sha256(str) { return crypto.createHash('sha256').update(str).digest('hex'); }
function hmac(str, key) { return crypto.createHmac('sha256', key).update(str).digest('hex'); }

// ============== ENCRYPT ==============
function encrypt(data, key) {
    const iv = crypto.randomBytes(16);
    const k = Buffer.from(key.slice(0, 32).padStart(32, '0').slice(0, 32));
    const cipher = crypto.createCipheriv('aes-256-ctr', k, iv);
    return iv.toString('hex') + ':' + cipher.update(data, 'utf8', 'hex') + ':' + cipher.final('hex');
}
function decrypt(cipher, key) {
    const [ivHex, rest] = cipher.split(':');
    const k = Buffer.from(key.slice(0, 32).padStart(32, '0').slice(0, 32));
    const decipher = crypto.createDecipheriv('aes-256-ctr', k, Buffer.from(ivHex, 'hex'));
    return decipher.update(rest, 'hex', 'utf8') + decipher.final('utf8');
}

// ============== COMPRESSION ==============
function compress(data) { return zlib.gzipSync(Buffer.from(data)).toString('base64'); }
function decompress(data) { return zlib.gunzipSync(Buffer.from(data, 'base64')).toString('utf8'); }
function serialize(data) { return JSON.stringify(data); }
function deserialize(text) { return JSON.parse(text); }

// ============== TIMING ==============
function debounce(fn, ms) { let to; return (...a) => { clearTimeout(to); to = setTimeout(() => fn(...a), ms); }; }
function throttle(fn, ms) { let last = 0; return (...a) => { const n = Date.now(); if (n - last >= ms) { last = n; fn(...a); } }; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function retry(fn, opts) {
    const {retries = 3, backoff = 1000} = opts || {};
    for (let i = 0; i <= retries; i++) {
        try { return await fn(); } catch (e) { if (i >= retries) throw e; await sleep(backoff * Math.pow(2, i)); }
    }
}
function clamp(val, min, max) { return Math.min(Math.max(val, min), max); }

// ============== FILE ==============
function fileExists(p) { return fs.existsSync(p); }
function readFile(p) { return fs.readFileSync(p, 'utf8'); }
function writeFile(p, c) { fs.writeFileSync(p, c, 'utf8'); }
function mkdir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function readDir(d) { return fs.readdirSync(d).filter(f => f.endsWith('.js')); }

// ============== VERSION ==============
function getVersion() { return VERSION; }
function compareVersion(a, b) {
    const av = a.split('.').map(Number), bv = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) if (av[i] > bv[i]) return 1; if (av[i] < bv[i]) return -1; return 0;
}

// ============== CACHE ==============
const _cache = new Map();
function cacheGet(key) { return _cache.get(key); }
function cacheSet(key, val, ttl) { _cache.set(key, val); if (ttl) setTimeout(() => _cache.delete(key), ttl); }
function cacheHas(key) { return _cache.has(key); }
function cacheDel(key) { return _cache.delete(key); }
function cacheClear() { _cache.clear(); }
function cacheKeys() { return Array.from(_cache.keys()); }

// ============== QUEUE ==============
const _queue = [];
function queuePush(item) { _queue.push(item); }
function queuePop() { return _queue.shift(); }
function queuePeek() { return _queue[0]; }
function queueLen() { return _queue.length; }
function queueClear() { _queue.length = 0; }

// ============== EVENTS ==============
const _emitter = new events.EventEmitter();
function emit(event, data) { _emitter.emit(event, data); }
function on(event, fn) { _emitter.on(event, fn); }
function once(event, fn) { _emitter.once(event, fn); }
function off(event, fn) { _emitter.off(event, fn); }

// ============== HTTP ==============
function isOk(s) { return s >= 200 && s < 300; }
function isRedirect(s) { return s >= 300 && s < 400; }
function isClientError(s) { return s >= 400 && s < 500; }
function isServerError(s) { return s >= 500; }

// ============== OBJECTS ==============
function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj);
    if (obj instanceof Array) return obj.map(deepClone);
    const c = {};
    for (const k in obj) c[k] = deepClone(obj[k]);
    return c;
}
function merge(...objs) { return objs.reduce((a, b) => { for (const k in b) a[k] = b[k]; return a; }, {}); }
function pick(obj, keys) { return keys.reduce((a, k) => (obj[k] !== undefined && (a[k] = obj[k])), a); }
function omit(obj, keys) { return Object.keys(obj).reduce((a, k) => (!keys.includes(k) && (a[k] = obj[k])), {}); }

module.exports = {
    uuid, nanoId, simpleHash, md5, sha256, hmac, encrypt, decrypt, compress, decompress,
    serialize, deserialize, debounce, throttle, sleep, retry, clamp, fileExists, readFile, writeFile,
    mkdir, readDir, getVersion, compareVersion, cacheGet, cacheSet, cacheHas, cacheDel,
    cacheClear, cacheKeys, queuePush, queuePop, queuePeek, queueLen, queueClear,
    emit, on, once, off, isOk, isRedirect, isClientError, isServerError,
    deepClone, merge, pick, omit, VERSION,
    getLayerStatus: () => ({ name: 'Monolith', type: 'utility', version: VERSION, enabled: true }),
    isOperationAllowed: () => ({ allowed: true }),
    getStatus: () => ({ enabled: true })
};
