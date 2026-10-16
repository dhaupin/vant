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

const _ALGORITHM = 'aes-256-gcm';
const KEY_LEN = 32;
const SALT_LEN = 16;
// (pass 178 stego-interop) IV length changes per record — the LENGTH is the
// version marker. New writes use the GCM-standard 96-bit nonce (12 bytes,
// matching Stegoframe so one hand-rolled packet format covers both systems);
// legacy 16-byte-IV records (every stone written before this pass) decode
// forever via width sniffing in decrypt() — no migration script, no break.
const IV_LEN_MODERN = 12;
const IV_LEN_LEGACY = 16;

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
     * (Wave 3 canon pin, #189) This is the NON-SECRET ID generator: lock ids,
     * session ids, cache keys. It is NOT secret-material — anything used as a
     * cryptographic key MUST come from Encrypt.key() (32 bytes hex, the one
     * secret-material generator; #186 bug 3 retired the UUID-as-key path).
     * Renaming generateShortId is out of scope for this pass (call-surface
     * churn); this block pins the intent so a future key-typed use of it is
     * caught as a canon violation in review.
     * @param {number} length - Length of ID
     * @returns {string} Short ID (non-secret)
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
     * (F7, #189/A4) The plain 2-part Vant token format: "base64(json-payload).base64(hmac-sha256)".
     * NOT a JWT — the old {alg:'HS256',typ:'JWT'} header object was dead code
     * that never reached the wire (the token has no 3-part form), so the
     * device's comment lied about the format. Doc pin: if real 3-part JWT
     * interop is ever needed (dashboard federation), add an explicit
     * format:'jwt' opt-in — do not relabel this one.
     * @param {object} payload - Data to encode (userId, role, etc)
     * @param {string} secret - Secret key for signing
     * @param {number} expiresIn - Expiry in ms (default: 1 hour, clamped 1s-7d)
     * @returns {string} Signed token (2 parts: payload.signature)
     */
    static signToken(payload, secret, expiresIn = 3600000) {
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
            // Timing-safe comparison: raw string === leaks a prefix oracle on
            // signature bytes (A2's same lesson for validateApiKey). Same-code
            // canon: reuse hmacVerify's Buffer-based timingSafeEqual path.
            const [encoded, signature] = token.split('.');
            const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64');
            const a = Buffer.from(String(signature || ''));
            const b = Buffer.from(expected);
            if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
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
     * @param {object} opts - Options {algorithm, salt, ivLen}
     * @returns {string} Encrypted data (hex fields, salt:iv:authTag:encrypted)
     */
    static encrypt(data, key, opts = {}) {
        // Use default key if not provided
        if (!key || typeof key !== 'string') {
            throw new errors.VantError('Encryption key/password required', { code: errors.CODES.ENCRYPT_KEY_REQUIRED, retryable: false });
        }

        const algorithm = 'aes-256-gcm';
        const salt = opts.salt || crypto.randomBytes(SALT_LEN);
        // (pass 178 stego-interop) default 12-byte GCM nonce; ivLen=16 opt-in
        // for byte-compat with pre-178 stones if a caller ever needs to
        // synthesize one (decrypt handles both by width sniffing).
        const ivLen = (opts.ivLen === 16) ? IV_LEN_LEGACY : IV_LEN_MODERN;
        const iv = crypto.randomBytes(ivLen);

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
    static decrypt(cipher, key, _opts = {}) {
        const algorithm = 'aes-256-gcm';
        // (F8, #189/A5) ONE return shape: decrypt() either RETURNS the
        // plaintext string or THROWS a typed error. The old split shape
        // (string on success, {error} on failure) made `${result}`/JSON.parse
        // callers stringify the error object or throw anyway; every
        // enumerated caller (stego, quasicrystal, storage/file, consensus,
        // msg) either already runs inside try/catch that maps to a typed
        // refusal, or was WRAPPING the {error} object transparently
        // (msg.js put the failure object into {content}). error-kin: encrypt()
        // throws, which is the same contract. Single-envelope holds.
        const _fail = (msg, code) => {
            const err = require('./error');
            throw new err.VantError(msg, { code: code || 'E_DECRYPT_FAILED', retryable: false });
        };

        const parts = cipher.split(':');
        if (parts.length !== 4) {
            _fail('Invalid cipher format (expected salt:iv:authTag:encrypted)', 'E_DECRYPT_FORMAT');
        }

        // (fix, pass-190 sweep) Decode + width-validate the IV HERE, before
        // the try, so the typed E_DECRYPT_FORMAT refusal isn't caught by
        // decrypt's own catch and re-wrapped as the generic
        // "Decryption failed - wrong key or corrupted data" message. The
        // stego-interop pin requires the honest IV-length complaint to reach
        // the caller intact (labs/STEGO-INTEROP-AUDIT.md §5).
        const salt = Buffer.from(parts[0], 'hex');
        const iv = Buffer.from(parts[1], 'hex');
        const authTag = Buffer.from(parts[2], 'hex');
        const encrypted = parts[3];

        // (pass 178 stego-interop) IV width is the version marker: 32 hex
        // chars = legacy 16-byte record, 24 = modern 12-byte (and
        // Stegoframe-compatible) GCM nonce. No other sniffing needed.
        if (iv.length !== IV_LEN_MODERN && iv.length !== IV_LEN_LEGACY) {
            _fail('Unsupported IV length (' + iv.length + 'B) — not a Vant/stegoframe record', 'E_DECRYPT_FORMAT');
        }

        try {            const derivedKey = crypto.pbkdf2Sync(key, salt, 100000, KEY_LEN, 'sha256');
            const decipher = crypto.createDecipheriv(algorithm, derivedKey, iv);
            decipher.setAuthTag(authTag);

            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            // EVENT: decrypt complete
            _emit('encrypt:decrypted', { algorithm, timestamp: Date.now() });

            return decrypted;
        } catch (e) {
            // Wrong key or corrupted data — typed single-shape refusal (F8)
            _fail('Decryption failed - wrong key or corrupted data' +
                (e.code ? '' : ' (' + (e.message || e).slice(0, 80) + ')'), 'E_DECRYPT_FAILED');
        }
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
        // (pass 206, issue #188-A1) A malformed stored hash crashed the CALLER:
        // the shape guard passed 'ab:cd' (parts.length === 2) but the expected
        // half was non-hex/short, and timingSafeEqual THROWS on unequal buffer
        // lengths ('Input buffers must have the same byte length').
        // verify() answers "no match", never throws on bad input.
        const parts = typeof hash === 'string' ? hash.split(':') : [];
        if (parts.length !== 2) {
            return false;
        }
        const salt = parts[0];
        const expectedHex = parts[1];
        // Hex-validity + length guard BEFORE the buffer compare: invalid hex
        // or any length != computed digest length is a non-match (some pbkdf2
        // hash stocks use different digest sizes; anything unequal rejects).
        if (!/^[0-9a-f]+$/i.test(expectedHex)) return false;
        const computed = crypto.pbkdf2Sync(data, salt, 100000, 64, 'sha256').toString('hex');
        if (expectedHex.length !== computed.length) return false;
        const expected = Buffer.from(expectedHex, 'hex');
        return crypto.timingSafeEqual(expected, Buffer.from(computed, 'hex'));
    }

    /**
     * Quick sha256 hash (for logging, caching, cache keys)
     * @param {string} data - Data to hash
     * @returns {string} SHA256 hash
     */
    static sha256(data) {
        // (Wave C) delegate to the canonical hashing module
        return require('./hash').sha256(data);
    }

    // ============================================
    // CATEGORY D: HMAC
    // ============================================

    // (Wave 3, #189/R4) The hmac()/verifyHmac() pair is DELETED: zero callers
    // repo-wide (grep), and verifyHmac was the module's second raw
    // timingSafeEqual site — the one HMAC canon is hmacSign/hmacVerify
    // (CATEGORY F), which crew-bus/messaging/webhooks all use.

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
    // (F1, #189) CATEGORY G REMOVED. The aesGcmEncrypt/aesGcmDecrypt pair
    // referenced IV_LEN — a name that never existed in this module (the
    // real constants are IV_LEN_MODERN/IV_LEN_LEGACY) — so BOTH functions
    // crashed at call time with `IV_LEN is not defined`. Zero callers
    // verified (grep across lib/, bin/, test/), and stego/horcrux use the
    // canonical Encrypt.encrypt(..., {ivLen:16}) path instead. R3 says delete
    // the category rather than resurrect a parallel raw-Buffer AES interface
    // next to encrypt() — one crypto canon.
    // ============================================

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

        // Mix cosmic data with crypto (via lib/hash.js, Wave C)
        const cosmicSeed = JSON.stringify(cosmic.data).slice(0, 64);
        const hash = require('./hash').sha256H();
        hash.update(cosmicSeed);
        hash.update(crypto.randomBytes(16)); // Add crypto entropy

        return hash.digest().slice(0, bytes);
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
        if (bits < 2048) throw new errors.VantError('RSA key size must be at least 2048 bits', { code: errors.CODES.ENCRYPT_KEY_INVALID, retryable: false });
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
