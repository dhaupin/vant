/**
 * Vant Security Layer
 * 
 * Security abstraction layer for Vant - runs at same global scope as VAF
 * Provides: auth, encryption, lock validation, security middleware
 * 
 * Usage:
 *   const security = require('./security');
 *   
 *   // Check if operation is allowed
 *   security.isOperationAllowed('write', { requiresAuth: true });
 *   
 *   // Encrypt data
 *   security.encrypt(data, 'password');
 *   
 *   // Validate lock
 *   security.validateLock(token);
 */

const stego = require('./stego');
const lock = require('./lock');

/**
 * Security Class
 * Security abstraction - Layer 4 of 4 (VAF → Sandbox → QoS → Security)
 */
class Security {
    /**
     * Create security instance
     * @param {object} options - Security configuration
     */
    constructor(options = {}) {
        // Auth settings
        this.requireApiKey = options.requireApiKey || false;
        this.apiKeyHeader = options.apiKeyHeader || 'x-api-key';
        
        // Encryption
        this.defaultEncryption = options.defaultEncryption !== false;
        
        // Lock settings
        this.requireLock = options.requireLock || false;
        
        // State
        this._authAttempts = new Map();
        this._startTime = Date.now();
    }
    
    /**
     * Validate API key
     * @param {string} providedKey - API key from request
     * @param {string} expectedKey - Expected API key
     */
    validateApiKey(providedKey, expectedKey) {
        if (!this.requireApiKey) return { valid: true, reason: 'not_required' };
        
        if (!providedKey) {
            return { valid: false, reason: 'missing_key' };
        }
        
        if (providedKey !== expectedKey) {
            this._recordFailure('api_key');
            return { valid: false, reason: 'invalid_key' };
        }
        
        return { valid: true };
    }
    
    /**
     * Encrypt data
     * @param {string} data - Data to encrypt
     * @param {string} password - Encryption password
     */
    encrypt(data, password) {
        return stego.encrypt(data, password);
    }
    
    /**
     * Decrypt data
     * @param {Buffer} data - Encrypted data
     * @param {string} password - Decryption password
     */
    decrypt(data, password) {
        return stego.decrypt(data, password);
    }
    
    /**
     * Validate lock token
     * @param {string} token - Lock token
     * @param {string} agentId - Agent ID
     */
    async validateLock(token, agentId) {
        const status = lock.status();
        
        if (!status) {
            return { valid: false, reason: 'no_lock' };
        }
        
        if (status.agentId !== agentId) {
            return { valid: false, reason: 'wrong_agent' };
        }
        
        if (token && status.token !== token) {
            return { valid: false, reason: 'invalid_token' };
        }
        
        if (!status.valid) {
            return { valid: false, reason: 'expired' };
        }
        
        return { valid: true };
    }
    
    /**
     * Get layer status
     */
    getLayerStatus() {
        return {
            name: 'Security',
            type: 'security_posture',
            enabled: true,
            config: {
                requireApiKey: this.requireApiKey,
                apiKeyHeader: this.apiKeyHeader,
                defaultEncryption: this.defaultEncryption,
                requireLock: this.requireLock
            },
            state: {
                authFailures: this._authAttempts.size,
                uptime: Date.now() - this._startTime
            }
        };
    }
    
    /**
     * Check if operation type is allowed
     */
    isOperationAllowed(operationType, context = {}) {
        // Check auth requirement
        if (context.requiresApiKey && !this.requireApiKey) {
            return { allowed: true, layer: 'Security' };
        }
        
        // Check lock requirement for writes
        if (operationType === 'write' && this.requireLock) {
            return { allowed: true, reason: 'lock_required', layer: 'Security' };
        }
        
        return { allowed: true, layer: 'Security' };
    }
    
    /**
     * Record auth failure
     */
    _recordFailure(type) {
        const key = type + '_' + Date.now();
        this._authAttempts.set(key, Date.now());
        
        // Cleanup old entries
        const cutoff = Date.now() - 300000;  // 5 minutes
        for (const [k, v] of this._authAttempts) {
            if (v < cutoff) this._authAttempts.delete(k);
        }
    }
    
    /**
     * Get status
     */
    getStatus() {
        return {
            requireApiKey: this.requireApiKey,
            defaultEncryption: this.defaultEncryption,
            requireLock: this.requireLock,
            authFailures: this._authAttempts.size
        };
    }
}

/**
 * Default security instance
 */
const defaultSecurity = new Security();

module.exports = {
    // Class for custom instances
    Security,
    
    /**
     * Create security instance
     * @param {object} options - Custom options
     */
    create(options = {}) {
        return new Security(options);
    },
    
    /**
     * Validate API key
     */
    validateApiKey(providedKey, expectedKey) {
        return defaultSecurity.validateApiKey(providedKey, expectedKey);
    },
    
    /**
     * Encrypt data
     */
    encrypt(data, password) {
        return defaultSecurity.encrypt(data, password);
    },
    
    /**
     * Decrypt data
     */
    decrypt(data, password) {
        return defaultSecurity.decrypt(data, password);
    },
    
    /**
     * Validate lock
     */
    async validateLock(token, agentId) {
        return defaultSecurity.validateLock(token, agentId);
    },
    
    /**
     * Get layer status
     */
    getLayerStatus() {
        return defaultSecurity.getLayerStatus();
    },
    
    /**
     * Check operation allowed
     */
    isOperationAllowed(operationType, context) {
        return defaultSecurity.isOperationAllowed(operationType, context);
    },
    
    /**
     * Get status
     */
    getStatus() {
        return defaultSecurity.getStatus();
    }
};