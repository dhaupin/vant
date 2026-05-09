/**
 * Hash (v0.8.6)
 * Hashing utilities - simpleHash, md5, sha256 wrappers
 */

const crypto = require('crypto');

// Simple hash (non-crypto, fast)
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(36);
}

// MD5 hash
function md5(str) {
    return crypto.createHash('md5').update(str).digest('hex');
}

// SHA256 hash
function sha256(str) {
    return crypto.createHash('sha256').update(str).digest('hex');
}

// HMAC
function hmac(str, key) {
    return crypto.createHmac('sha256', key).update(str).digest('hex');
}

module.exports = {
    simpleHash,
    md5,
    sha256,
    hmac,
    
    getLayerStatus: () => ({ name: 'Hash', type: 'utility', version: '0.8.6', enabled: true }),
    isOperationAllowed: () => ({ allowed: true }),
    getStatus: () => ({ enabled: true })
};
