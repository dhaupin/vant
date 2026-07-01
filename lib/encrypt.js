/**
 * Vant Encrypt - Consolidated Crypto Handlers (v0.8.6)
 * WITH EVENT EMISSIONS - crypto operations emit globally
 *
 * Global pool of cryptographic functions for Vant
 * Consolidates all crypto operations from scattered modules
 *
 * Usage:
 *   const Encrypt = require('./encrypt');
 *   const id = Encrypt.generateId();
 *   const hash = Encrypt.hash(data);
 *   const encrypted = Encrypt.encrypt(data, key);
 */

// ==================== EVENT SYSTEM ====================
let _event = null;
function _emit(event, data) {
    if (!_event) {
        try { _event = require('./event'); } catch (e) { return; }
    }
    if (_event && _event.emit) {
        _event.emit(event, data);
    }
}

const crypto = require('crypto');
const errors = require('./error');

const ALGORITHM = 'aes-256-gcm';
const KEY_LEN = 32;
const SALT_LEN = 16;
const IV_LEN = 16;

/**
 * Encrypt - Consolidated crypto handlers
 */
class Encrypt {
    // ============================================
    // CATEGORY A: Stateless ID Generation
    // ============================================

    /**
     * Generate unique ID (replaces scattered crypto.randomUUID)
     * @returns {string} UUID-style ID
     */
    static generateId() {
        return crypto.randomUUID();
    }

    /**
     * Generate short ID for internal use
     * @param {number} length - Length of ID
     * @returns {string} Short ID
     */
    static generateShortId(length = 8) {
        return crypto.randomBytes(length).toString('hex');
    }

    /**
     * Generate token (for locks, sessions) - enhanced with cosmic entropy
     * @returns {string} Opaque token
     */
    static generateToken() {
        // Try atmospheric entropy first for maximum security
        const entropy = this._cosmicEntropy;
        if (entropy) {
            return crypto
                .createHash('sha256')
                .update(entropy + crypto.randomBytes(16).toString('hex'))
                .digest('hex');
        }
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Generate UUID v4 - uses cosmic entropy if available
     * @returns {string} UUID
     */
    static uuid() {
        const bytes = crypto.randomBytes(16);
        // Set version (4) and variant (RFC 4122)
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = bytes.toString('hex');
        return hex.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
    }

    /**
     * Generate key - uses cosmic entropy if available  
     * @param {number} len - Key length in bytes (default: 32)
     * @returns {string} Hex key
     */
    static key(len = 32) {
        const entropy = this._cosmicEntropy;
        if (entropy) {
            return crypto
                .createHash('sha512')
                .update(entropy + crypto.randomBytes(32).toString('hex'))
                .digest('hex')
                .slice(0, len * 2);
        }
        return crypto.randomBytes(len).toString('hex');
    }

    /**
     * Generate signed token with expiry
     * @param {object} payload - Data to encode (userId, role, etc)
     * @param {string} secret - Secret key for signing
     * @param {number} expiresIn - Expiry in ms (default: 1 hour)
     * @returns {string} Signed JWT-like token (base64)
     */
    static signToken(payload, secret, expiresIn = 3600000) {
        const header = { alg: 'HS256', typ: 'JWT' };
        const now = Date.now();
        // Bounds check: min 1 sec, max 7 days
        const safeExpiry = Math.max(1000, Math.min(7 * 24 * 60 * 60 * 1000, expiresIn));
        const data = {
            ...payload,
            iat: now,
            exp: now + safeExpiry
        };
        const encoded = Buffer.from(JSON.stringify(data)).toString('base64');
        const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64');
        return `${encoded}.${signature}`;
    }

    /**
     * Verify signed token
     * @param {string} token - Signed token
     * @param {string} secret - Secret key
     * @returns {object|null} Payload or null if invalid/expired
     */
    static verifyToken(token, secret) {
        try {
            const [encoded, signature] = token.split('.');
            const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64');
            if (signature !== expected) return null;
            const data = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
            if (data.exp && data.exp < Date.now()) return null;
            return data;
        } catch {
            return null;
        }
    }

    // ============================================
    // CATEGORY B: Encryption/Decryption
    // ============================================

    /**
     * Encrypt data with password/key
     * @param {string} data - Data to encrypt
     * @param {string} key - Encryption key
     * @param {object} opts - Options {algorithm, salt}
     * @returns {string} Encrypted data (base64)
     */
    static encrypt(data, key, opts = {}) {
        // Use default key if not provided
        if (!key || typeof key !== 'string') {
            throw new errors.Error('Encryption key/password required', { code: errors.CODES.ENCRYPT_KEY_REQUIRED, retryable: false });
        }
        
        const algorithm = 'aes-256-gcm';
        const salt = opts.salt || crypto.randomBytes(SALT_LEN);
        const iv = crypto.randomBytes(IV_LEN);

        const derivedKey = crypto.pbkdf2Sync(key, salt, 100000, KEY_LEN, 'sha256');
        const cipher = crypto.createCipheriv(algorithm, derivedKey, iv);

        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');

        // Format: salt:iv:authTag:encrypted
        const result = salt.toString('hex') + ':' + iv.toString('hex') + ':' + authTag + ':' + encrypted;
        
        // EVENT: encrypt complete
        _emit('encrypt:encrypted', { algorithm, timestamp: Date.now() });
        
        return result;
    }

    /**
     * Decrypt data
     * @param {string} cipher - Encrypted data
     * @param {string} key - Decryption key
     * @param {object} opts - Options
     * @returns {string} Decrypted data
     */
    static decrypt(cipher, key, opts = {}) {
        const algorithm = 'aes-256-gcm';

        const parts = cipher.split(':');
        if (parts.length !== 4) {
            throw new errors.Error('Invalid cipher format (expected salt:iv:authTag:encrypted)', { code: errors.CODES.ENCRYPT_INVALID_FORMAT, retryable: false });
        }

        const salt = Buffer.from(parts[0], 'hex');
        const iv = Buffer.from(parts[1], 'hex');
        const authTag = Buffer.from(parts[2], 'hex');
        const encrypted = parts[3];

        const derivedKey = crypto.pbkdf2Sync(key, salt, 100000, KEY_LEN, 'sha256');
        const decipher = crypto.createDecipheriv(algorithm, derivedKey, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        // EVENT: decrypt complete
        _emit('encrypt:decrypted', { algorithm, timestamp: Date.now() });
        
        return decrypted;
    }

    // ============================================
    // CATEGORY C: Hashing
    // ============================================

    /**
     * Hash data with optional salt (scrypt)
     * @param {string} data - Data to hash
     * @param {string} salt - Salt (optional, auto-generated)
     * @returns {string} Hash (format: salt:hash)
     */
    static hash(data, salt = null) {
        if (!salt) {
            salt = crypto.randomBytes(SALT_LEN).toString('hex');
        }
        const hash = crypto.pbkdf2Sync(data, salt, 100000, 64, 'sha256').toString('hex');
        return salt + ':' + hash;
    }

    /**
     * Verify hash
     * @param {string} data - Data to verify
     * @param {string} hash - Stored hash
     * @returns {boolean} Match
     */
    static verify(data, hash) {
        const parts = hash.split(':');
        if (parts.length !== 2) {
            return false;
        }
        const salt = parts[0];
        const expected = parts[1];
        const computed = crypto.pbkdf2Sync(data, salt, 100000, 64, 'sha256').toString('hex');
        return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(computed, 'hex'));
    }

    /**
     * Quick sha256 hash (for logging, caching, cache keys)
     * @param {string} data - Data to hash
     * @returns {string} SHA256 hash
     */
    static sha256(data) {
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    // ============================================
    // CATEGORY D: HMAC
    // ============================================

    /**
     * Create HMAC
     * @param {string} data - Data
     * @param {string} key - Key
     * @returns {string} HMAC signature
     */
    static hmac(data, key) {
        return crypto.createHmac('sha256', key).update(data).digest('hex');
    }

    /**
     * Verify HMAC
     * @param {string} data - Data
     * @param {string} key - Key
     * @param {string} sig - Signature to verify
     * @returns {boolean} Valid
     */
    static verifyHmac(data, key, sig) {
        const expected = this.hmac(data, key);
        return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'));
    }

    // ============================================
    // CATEGORY E: DEPRECATED (use aesGcmEncrypt/aesGcmDecrypt)
    // ============================================

    /**
     * Encode data (DEPRECATED - use encrypt() or aesGcmEncrypt())
     * @deprecated Use encrypt() or aesGcmEncrypt() for new code
     * @param {string} data - Data to encode
     * @param {string} password - Password
     * @returns {string} Encoded data
     */
    static encode(data, password) {
        return this.encrypt(data, password, { algorithm: ALGORITHM });
    }

    /**
     * Decode data (DEPRECATED - use decrypt() or aesGcmDecrypt())
     * @deprecated Use decrypt() or aesGcmDecrypt() for new code
     * @param {string} cipher - Encoded data
     * @param {string} password - Password
     * @returns {string} Decoded data
     */
    static decode(cipher, password) {
        return this.decrypt(cipher, password, { algorithm: ALGORITHM });
    }

    // ============================================
    // CATEGORY F: HMAC (for webhooks)
    // ============================================

    /**
     * Sign data with HMAC (for webhooks)
     * @param {string} data - Data to sign
     * @param {string} key - Secret key
     * @returns {string} HMAC signature (hex)
     */
    static hmacSign(data, key) {
        return crypto.createHmac('sha256', key).update(data, 'utf8').digest('hex');
    }

    /**
     * Verify HMAC signature (timing-safe)
     * @param {string} data - Data to verify
     * @param {string} key - Secret key
     * @param {string} signature - Expected signature
     * @returns {boolean} Valid
     */
    static hmacVerify(data, key, signature) {
        const expected = this.hmacSign(data, key);
        const sigBuf = Buffer.from(signature, 'hex');
        const expBuf = Buffer.from(expected, 'hex');
        if (sigBuf.length !== expBuf.length) return false;
        return crypto.timingSafeEqual(sigBuf, expBuf);
    }

    // ============================================
    // CATEGORY G: AES-GCM (for stego/horcrux)
    // ============================================

    /**
     * Encrypt with AES-256-GCM (Buffer-based for stego/horcrux)
     * @param {string|Buffer} data - Data to encrypt
     * @param {string} password - Encryption password
     * @returns {Buffer} Encrypted (salt + iv + authTag + ciphertext)
     */
    static aesGcmEncrypt(data, password) {
        const salt = crypto.randomBytes(SALT_LEN);
        const key = crypto.pbkdf2Sync(password, salt, 100000, KEY_LEN, 'sha256');
        const iv = crypto.randomBytes(IV_LEN);
        
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        
        const dataBuf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
        const encrypted = Buffer.concat([
            cipher.update(dataBuf),
            cipher.final()
        ]);
        
        const authTag = cipher.getAuthTag();
        
        // Format: salt(16) + iv(16) + authTag(16) + ciphertext
        return Buffer.concat([salt, iv, authTag, encrypted]).toString('hex');
    }

    /**
     * Decrypt with AES-256-GCM
     * @param {string} data - Encrypted data (hex)
     * @param {string} password - Decryption password
     * @returns {string} Decrypted data
     */
    static aesGcmDecrypt(data, password) {
        const buf = Buffer.from(data, 'hex');
        const salt = buf.slice(0, 16);
        const iv = buf.slice(16, 16 + IV_LEN);
        const authTag = buf.slice(16 + IV_LEN, 16 + IV_LEN + 16);
        const ciphertext = buf.slice(16 + IV_LEN + 16);
        
        const key = crypto.pbkdf2Sync(password, salt, 100000, KEY_LEN, 'sha256');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    }

    // ============================================
    // CATEGORY H: Cosmic Entropy (Solar/cosmic data)
    // ============================================

    // Cosmic entropy cache
    static _cosmicEntropy = null;
    static _cosmicEntropyExpiry = 0;

    /**
     * Fetch cosmic entropy from solar/space data sources
     * Sources: NOAA Space Weather, NASA SDO
     * @returns {Promise<object>} Entropy data
     */
    static async fetchCosmicEntropy() {
        const sources = [
            // NOAA Solar Weather (flares, sunspots)
            { url: 'https://services.swpc.noaa.gov/products.json', type: 'noaa' },
            // NASA Sunspot data
            { url: 'https://api.nasa.gov/solar/sunspot', type: 'nasa', key: 'DEMO_KEY' }
        ];
        
        for (const src of sources) {
            try {
                const res = await fetch(src.url + (src.key ? `?api_key=${src.key}` : ''));
                if (res.ok) {
                    const data = await res.json();
                    return { source: src.type, data, timestamp: Date.now() };
                }
            } catch (e) {
                // Continue to next source
            }
        }
        
        // Fallback to crypto.random if all fail
        return { source: 'fallback', data: crypto.randomBytes(32).toString('hex'), timestamp: Date.now() };
    }

    /**
     * Get cosmic entropy (cached hourly)
     * @returns {Promise<object>} Entropy data
     */
    static async getCosmicEntropy() {
        const now = Date.now();
        const oneHour = 3600000;
        
        // Return cached if still valid
        if (this._cosmicEntropy && now < this._cosmicEntropyExpiry) {
            return this._cosmicEntropy;
        }
        
        // Fetch new
        this._cosmicEntropy = await this.fetchCosmicEntropy();
        this._cosmicEntropyExpiry = now + oneHour;
        
        return this._cosmicEntropy;
    }

    /**
     * Refresh cosmic entropy (manual)
     * @returns {Promise<object>} New entropy
     */
    static async refreshEntropy() {
        this._cosmicEntropy = await this.fetchCosmicEntropy();
        this._cosmicEntropyExpiry = Date.now() + 3600000;
        return this._cosmicEntropy;
    }

    /**
     * Hybrid random: combine cosmic with crypto
     * Use cosmic entropy to seed/random
     * @param {number} bytes - Number of bytes
     * @returns {Buffer} Random bytes
     */
    static async hybridRandom(bytes = 32) {
        const cosmic = await this.getCosmicEntropy();
        
        // Mix cosmic data with crypto
        const cosmicSeed = JSON.stringify(cosmic.data).slice(0, 64);
        const hash = crypto.createHash('sha256');
        hash.update(cosmicSeed);
        hash.update(crypto.randomBytes(16)); // Add crypto entropy
        
        return hash.digest().slice(0, bytes);
    }

    /**
     * PBKDF2 (DEPRECATED - use standard crypto directly if needed)
     * @deprecated Use Node.js crypto.pbkdf2Sync directly
     * @param {string} password - Password
     * @param {Buffer|string} salt - Salt
     * @param {number} iterations - Iterations
     * @param {number} keyLen - Key length
     * @param {string} digest - Algorithm
     * @returns {Buffer} Derived key
     */
    static pbkdf2Sync(password, salt, iterations, keyLen, digest) {
        return crypto.pbkdf2Sync(password, salt, iterations, keyLen, digest);
    }


// ============================================
// CATEGORY H: RSA (Asymmetric)
// ============================================

    /**
     * Generate RSA key pair
     * @param {number} bits - Key size (default: 2048, min: 2048)
     * @returns {object} { publicKey, privateKey }
     */
    static rsaKeyPair(bits = 2048) {
        if (bits < 2048) throw new errors.Error('RSA key size must be at least 2048 bits', { code: errors.CODES.ENCRYPT_KEY_INVALID, retryable: false });
        return crypto.generateKeyPairSync('rsa', {
            modulusLength: bits,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });
    }

    /**
     * Encrypt with RSA public key (OAEP)
     * @param {string} data - Data to encrypt
     * @param {string} publicKey - PEM public key
     * @returns {string} Base64 encrypted data
     */
    static rsaEncrypt(data, publicKey) {
        const encrypted = crypto.publicEncrypt({
            key: publicKey,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256'
        }, Buffer.from(data));
        return encrypted.toString('base64');
    }

    /**
     * Decrypt with RSA private key (OAEP)
     * @param {string} cipher - Base64 encrypted data
     * @param {string} privateKey - PEM private key
     * @returns {string} Decrypted data
     */
    static rsaDecrypt(cipher, privateKey) {
        const decrypted = crypto.privateDecrypt({
            key: privateKey,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256'
        }, Buffer.from(cipher, 'base64'));
        return decrypted.toString('utf8');
    }

    /**
     * Sign with RSA private key
     * @param {string} data - Data to sign
     * @param {string} privateKey - PEM private key
     * @returns {string} Base64 signature
     */
    static rsaSign(data, privateKey) {
        const sign = crypto.createSign('SHA256');
        sign.update(data);
        sign.end();
        return sign.sign(privateKey, 'base64');
    }

    /**
     * Verify RSA signature
     * @param {string} data - Original data
     * @param {string} signature - Base64 signature
     * @param {string} publicKey - PEM public key
     * @returns {boolean} Valid or not
     */
    static rsaVerify(data, signature, publicKey) {
        const verify = crypto.createVerify('SHA256');
        verify.update(data);
        verify.end();
        return verify.verify(publicKey, signature, 'base64');
    }
}

module.exports = Encrypt;
module.exports.default = Encrypt;