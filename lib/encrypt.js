/**
 * Vant Encrypt - Consolidated Crypto Handlers
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

const crypto = require('crypto');

const ALGORITHM = 'aes-256-ctr';
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
     * Generate token (for locks, sessions)
     * @returns {string} Opaque token
     */
    static generateToken() {
        return crypto.randomBytes(32).toString('hex');
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
        const algorithm = opts.algorithm || ALGORITHM;
        const salt = opts.salt || crypto.randomBytes(SALT_LEN);
        const iv = crypto.randomBytes(IV_LEN);

        const derivedKey = crypto.pbkdf2Sync(key, salt, 100000, KEY_LEN, 'sha256');
        const cipher = crypto.createCipheriv(algorithm, derivedKey, iv);

        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        // Format: salt:iv:encrypted
        return salt.toString('hex') + ':' + iv.toString('hex') + ':' + encrypted;
    }

    /**
     * Decrypt data
     * @param {string} cipher - Encrypted data
     * @param {string} key - Decryption key
     * @param {object} opts - Options
     * @returns {string} Decrypted data
     */
    static decrypt(cipher, key, opts = {}) {
        const algorithm = opts.algorithm || ALGORITHM;

        const parts = cipher.split(':');
        if (parts.length !== 3) {
            throw new Error('Invalid cipher format');
        }

        const salt = Buffer.from(parts[0], 'hex');
        const iv = Buffer.from(parts[1], 'hex');
        const encrypted = parts[2];

        const derivedKey = crypto.pbkdf2Sync(key, salt, 100000, KEY_LEN, 'sha256');
        const decipher = crypto.createDecipheriv(algorithm, derivedKey, iv);

        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

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
     * Quick sha256 hash (for logging, caching)
     * @param {string} data - Data to hash
     * @returns {string} SHA256 hash
     */
    static sha256(data) {
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    /**
     * Quick md5 hash (legacy for caching)
     * @param {string} data - Data to hash
     * @returns {string} MD5 hash
     */
    static md5(data) {
        return crypto.createHash('md5').update(data).digest('hex');
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
    // CATEGORY E: Stego/Horcrux Shortcuts
    // ============================================

    /**
     * Encode data for steganography (legacy compat)
     * @param {string} data - Data to encode
     * @param {string} password - Password
     * @returns {string} Encoded data
     */
    static encode(data, password) {
        return this.encrypt(data, password, { algorithm: ALGORITHM });
    }

    /**
     * Decode steganography data (legacy compat)
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
        return Buffer.concat([salt, iv, authTag, encrypted]);
    }

    /**
     * Decrypt with AES-256-GCM
     * @param {Buffer} data - Encrypted data
     * @param {string} password - Decryption password
     * @returns {Buffer} Decrypted data
     */
    static aesGcmDecrypt(data, password) {
        const salt = data.slice(0, 16);
        const iv = data.slice(16, 16 + IV_LEN);
        const authTag = data.slice(16 + IV_LEN, 16 + IV_LEN + 16);
        const ciphertext = data.slice(16 + IV_LEN + 16);
        
        const key = crypto.pbkdf2Sync(password, salt, 100000, KEY_LEN, 'sha256');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
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
     * PBKDF2 key derivation (alias for stego/horcrux)
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
    }


module.exports = Encrypt;
module.exports.default = Encrypt;