/**
 * Horcrux Manifest - Encrypted Bootstrap Configuration
 * 
 * Embeddable manifest for zero-config boot.
 * Contains provider URLs and sync metadata.
 * 
 * SECURITY:
 *   - Secrets NOT embedded (by design - set tokens separately)
 *   - Provider URLs validated before use
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LEN = 16;
const TAG_LEN = 16;
const SALT_LEN = 32;
const KEY_LEN = 32;

/**
 * Generate manifest structure
 * @param {object} options - { primaryUrl, secondaryUrl, provider, branch }
 * @returns {object} Manifest
 */
function generateManifest(options = {}) {
    const {
        primaryUrl = null,
        secondaryUrl = null,
        provider = 'github',
        branch = 'main'
    } = options;
    
    return {
        version: '1.0',
        type: 'vant-horcrux',
        provider,
        branch,
        primaryUrl,
        secondaryUrl,
        created: new Date().toISOString(),
        ttl: null
    };
}

/**
 * Create encrypted bootstrap string
 * @param {object} manifest - Manifest
 * @param {string} password - Password
 * @returns {string} Base64 encrypted manifest
 */
function createBootstrap(manifest, password) {
    const salt = crypto.randomBytes(SALT_LEN);
    const key = crypto.pbkdf2Sync(password, salt, 100000, KEY_LEN, 'sha256');
    const iv = crypto.randomBytes(IV_LEN);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const json = JSON.stringify(manifest);
    const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    
    return Buffer.concat([salt, iv, tag, encrypted]).toString('base64');
}

/**
 * Parse bootstrap string
 * @param {string} bootstrapStr - Base64 string
 * @param {string} password - Password
 * @returns {object} Manifest
 */
function parseBootstrap(bootstrapStr, password) {
    const data = Buffer.from(bootstrapStr, 'base64');
    const salt = data.slice(0, SALT_LEN);
    const iv = data.slice(SALT_LEN, SALT_LEN + IV_LEN);
    const tag = data.slice(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
    const encrypted = data.slice(SALT_LEN + IV_LEN + TAG_LEN);
    
    const key = crypto.pbkdf2Sync(password, salt, 100000, KEY_LEN, 'sha256');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    try {
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        return JSON.parse(decrypted.toString('utf8'));
    } catch (e) {
        throw new Error('Decryption failed - wrong password?');
    }
}

/**
 * Embed manifest in brain
 * @param {object} manifest - Manifest to embed
 */
function embedInBrain(manifest) {
    const brain = require('./brain');
    brain.embedConfig({ _horcrux: manifest });
}

/**
 * Extract manifest from brain
 * @returns {object|null}
 */
function extractFromBrain() {
    const brain = require('./brain');
    const config = brain.extractEmbeddedConfig();
    return config?._horcrux || null;
}

/**
 * Validate manifest
 * @param {object} manifest - Manifest to validate
 * @returns {object} { valid: boolean, errors: string[] }
 */
function validateManifest(manifest) {
    const errors = [];
    
    if (!manifest || typeof manifest !== 'object') {
        return { valid: false, errors: ['Invalid manifest'] };
    }
    
    if (manifest.type !== 'vant-horcrux') {
        errors.push('Missing type: vant-horcrux');
    }
    
    if (manifest.version !== '1.0') {
        errors.push('Unsupported version');
    }
    
    if (!manifest.provider) {
        errors.push('Missing provider');
    }
    
    if (manifest.primaryUrl) {
        try {
            const url = new URL(manifest.primaryUrl);
            if (!['https:', 'http:'].includes(url.protocol)) {
                errors.push('primaryUrl must be http/https');
            }
        } catch (e) {
            errors.push('Invalid primaryUrl');
        }
    }
    
    return { valid: errors.length === 0, errors };
}

module.exports = {
    generateManifest,
    createBootstrap,
    parseBootstrap,
    embedInBrain,
    extractFromBrain,
    validateManifest
};