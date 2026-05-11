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
const fs = require('fs');
const path = require('path');

const LOCKOUT_FILE = '.circuit-auth.json';

// Auth class - load failed attempts from file (survives restarts)
function _loadLockedAuth() {
    if (fs.existsSync(LOCKOUT_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(LOCKOUT_FILE, 'utf8'));
            // Filter expired lockouts
            const now = Date.now();
            const valid = new Map();
            for (const [id, entry] of Object.entries(data)) {
                if (entry.lockoutUntil > now) {
                    valid.set(id, entry);
                }
            }
            console.log(`[Auth] Loaded ${valid.size} lockouts from ${LOCKOUT_FILE}`);
            return valid;
        } catch (e) {
            console.log(`[Auth] Could not load lockouts: ${e.message}`);
        }
    }
    return new Map();
}

// Save lockouts to file
function _saveLockedAuth(failedAttempts) {
    try {
        const data = Object.fromEntries(failedAttempts);
        fs.writeFileSync(LOCKOUT_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.log(`[Auth] Could not save lockouts: ${e.message}`);
    }
}

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
            lockoutDuration: options.lockoutDuration || 60000,
            // Secret for token signing - use config or env or generate
            tokenSecret: options.tokenSecret || config.tokenSecret() || Encrypt.generateShortId(32),
        };
        
        // State - load from file (survives restarts)
        this._startTime = Date.now();
        this._initialized = true;
        this._failedAttempts = _loadLockedAuth();  // ip → { count, lockoutUntil }
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
        _saveLockedAuth(this._failedAttempts);
        return { locked: false };
    }
    
    /**
     * Clear failed attempts (on successful auth)
     */
    clearFailedAttempt(identifier) {
        this._failedAttempts.delete(identifier);
        _saveLockedAuth(this._failedAttempts);
    }
    
    /**
     * Generate token
     */
    generateToken(userId, options = {}) {
        return Encrypt.signToken(
            { userId, role: options.role || 'user' },
            this.options.tokenSecret,
            options.expiresIn || this.options.tokenExpiry
        );
    }
    
    /**
     * Validate token
     */
    validateToken(token) {
        const payload = Encrypt.verifyToken(token, this.options.tokenSecret);
        if (!payload) {
            return { valid: false, reason: 'invalid_or_expired' };
        }
        return { valid: true, payload };
    }
    
    /**
     * Revoke token
     */
    revokeToken(token) {
        // No-op - just delete client-side
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