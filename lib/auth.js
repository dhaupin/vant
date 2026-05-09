/**
 * Vant Auth Class
 * 
 * Authentication system - API key validation, token management, access control
 * Includes lockout after failed attempts
 * 
 * Usage:
 *   const { Auth } = require('./auth');
 *   const auth = new Auth();
 *   
 *   // Validate API key
 *   const result = auth.validateApiKey(key);
 *   
 *   // Check allowed
 *   auth.isOperationAllowed('read');
 *   auth.getLayerStatus();
 */

const config = require('./config');
const Encrypt = require('./encrypt');

/**
 * Auth Class
 * Provides authentication with API key validation and lockout
 */
class Auth {
    /**
     * Create Auth instance
     * @param {object} options - Configuration
     */
    constructor(options = {}) {
        this.options = {
            apiKeyRequired: options.apiKeyRequired !== false,
            tokenExpiry: options.tokenExpiry || 3600000,
            maxAttempts: options.maxAttempts || 5,
            lockoutDuration: options.lockoutDuration || 60000,  // 60 seconds
        };
        
        // State
        this._startTime = Date.now();
        this._initialized = true;
        this._failedAttempts = new Map();  // ip → { count, lockoutUntil }
    }
    
    /**
     * Validate API key
     * Uses VANT_API_KEY or MCP_API_KEY from environment
     */
    validateApiKey(apiKey) {
        // Get configured key
        const configuredKey = config.apiKey() || config.mcpApiKey();
        
        // If no key configured, allow (for development)
        if (!configuredKey) {
            return { valid: true, reason: 'no_key_configured', layer: 'Auth' };
        }
        
        // Validate key
        if (!apiKey) {
            return { valid: false, reason: 'no_api_key_provided', layer: 'Auth' };
        }
        
        if (apiKey === configuredKey) {
            return { valid: true, reason: 'ok', layer: 'Auth' };
        }
        
        return { valid: false, reason: 'invalid_api_key', layer: 'Auth' };
    }
    
    /**
     * Record failed attempt and check lockout
     */
    recordFailedAttempt(identifier) {
        const now = Date.now();
        const record = this._failedAttempts.get(identifier) || { count: 0, lockoutUntil: 0 };
        
        // If currently locked out, check if expired
        if (record.lockoutUntil > 0 && now < record.lockoutUntil) {
            return { locked: true, until: record.lockoutUntil };
        }
        
        // Increment failed count
        record.count++;
        
        // Lockout if max attempts reached
        if (record.count >= this.options.maxAttempts) {
            record.lockoutUntil = now + this.options.lockoutDuration;
            return { locked: true, until: record.lockoutUntil };
        }
        
        this._failedAttempts.set(identifier, record);
        return { locked: false };
    }
    
    /**
     * Clear failed attempts (on successful auth)
     */
    clearFailedAttempt(identifier) {
        this._failedAttempts.delete(identifier);
    }
    
    /**
     * Generate token
     */
    generateToken(userId, options = {}) {
        return Encrypt.generateToken();
    }
    
    /**
     * Validate token (placeholder for future)
     */
    validateToken(token) {
        return { valid: false, reason: 'not_implemented' };
    }
    
    /**
     * Revoke token
     */
    revokeToken(token) {
        // No-op for now
    }
    
    /**
     * Get access level
     */
    getAccessLevel(key) {
        const validation = this.validateApiKey(key);
        if (!validation.valid) return 'none';
        return 'admin';
    }
    
    /**
     * Check permission
     */
    checkPermission(key, permission) {
        const level = this.getAccessLevel(key);
        if (level === 'none') return { allowed: false };
        return { allowed: true };
    }
    
    getLayerStatus() {
        return {
            name: 'Auth',
            type: 'authentication',
            enabled: true,
            config: {
                apiKeyRequired: this.options.apiKeyRequired,
                tokenExpiry: this.options.tokenExpiry,
                maxAttempts: this.options.maxAttempts,
                lockoutDuration: this.options.lockoutDuration,
            },
            state: {
                startTime: this._startTime,
                failedAttemptsCount: this._failedAttempts.size
            }
        };
    }
    
    isOperationAllowed(op) {
        return { allowed: true, layer: 'Auth' };
    }
    
    getStatus() {
        return { enabled: true };
    }
}

module.exports = { Auth };