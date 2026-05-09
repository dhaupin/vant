/**
 * Utils (v0.8.6)
 * Consolidated utilities for agents
 * 
 * All consolidated from unused protos
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// ==================== UUID ====================

function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

function nanoId() {
    const now = Date.now();
    const random = Math.random().toString(36).slice(2, 15);
    return `${now.toString(36)}-${random}`;
}

// ==================== HASH ====================

function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
}

function md5(str) {
    return crypto.createHash('md5').update(str).digest('hex');
}

function sha256(str) {
    return crypto.createHash('sha256').update(str).digest('hex');
}

function hmac(str, key) {
    return crypto.createHmac('sha256', key).update(str).digest('hex');
}

// ==================== VERSION ====================

const VERSION = '0.8.6';

function getVersion() {
    return VERSION;
}

function compareVersion(v1, v2) {
    const a = v1.split('.').map(Number);
    const b = v2.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        if (a[i] > b[i]) return 1;
        if (a[i] < b[i]) return -1;
    }
    return 0;
}

// ==================== FILE ====================

function fileExists(filePath) {
    return fs.existsSync(filePath);
}

function readFile(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}

function writeFile(filePath, content) {
    fs.writeFileSync(filePath, content, 'utf8');
}

function mkdir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

// ==================== DEBOUNCE / THROTTLE ====================

function debounce(fn, ms) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), ms);
    };
}

function throttle(fn, ms) {
    let last = 0;
    return (...args) => {
        const now = Date.now();
        if (now - last >= ms) {
            last = now;
            fn(...args);
        }
    };
}

// ==================== RETRY ====================

async function retry(fn, options = {}) {
    const { retries = 3, backoff = 1000 } = options;
    for (let i = 0; i <= retries; i++) {
        try {
            return await fn();
        } catch (e) {
            if (i >= retries) throw e;
            await new Promise(r => setTimeout(r, backoff * Math.pow(2, i)));
        }
    }
}

// ==================== CLAMP ====================

function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ==================== EXPIRY ====================

function isExpired(timestamp, maxAgeMs) {
    return Date.now() - timestamp > maxAgeMs;
}

module.exports = {
    // UUID
    uuid,
    nanoId,
    
    // Hash
    simpleHash,
    md5,
    sha256,
    hmac,
    
    // Version
    getVersion,
    compareVersion,
    VERSION,
    
    // File
    fileExists,
    readFile,
    writeFile,
    mkdir,
    
    // Timing
    debounce,
    throttle,
    retry,
    clamp,
    sleep,
    isExpired,
    
    getLayerStatus: () => ({ name: 'Utils', type: 'utility', version: VERSION, enabled: true }),
    isOperationAllowed: () => ({ allowed: true }),
    getStatus: () => ({ enabled: true })
};
