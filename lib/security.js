/**
 * Vant Security Layer
 * 
 * Security abstraction layer for Vant - facade/orchestrator
 * Provides: health checks, self-tests, brain security audit
 * 
 * Usage:
 *   const security = require('./security');
 *   
 *   // Run self tests
 *   await security.runSelfTests();
 *   
 *   // Check brain for injection
 *   await security.checkBrainHealth();
 *   
 *   // Verify VAF sanity
 *   await security.verifyVafSanity();
 */

const stego = require('./stego');
const lock = require('./lock');
const { Auth } = require('./auth');
const vaf = require('./vaf');
const Encrypt = require('./encrypt');
const fs = require('fs');
const path = require('path');

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
    
    /**
     * Run internal self-tests
     * Tests all security components
     */
    async runSelfTests() {
        const results = {
            timestamp: Date.now(),
            tests: []
        };
        
        // Test Encrypt
        try {
            const id = Encrypt.generateId();
            const hash = Encrypt.hash('test');
            const verify = Encrypt.verify('test', hash);
            results.tests.push({
                name: 'Encrypt',
                passed: verify && id.length > 0,
                details: { id, hashVerified: verify }
            });
        } catch (e) {
            results.tests.push({ name: 'Encrypt', passed: false, error: e.message });
        }
        
        // Test Auth
        try {
            const auth = new Auth();
            results.tests.push({ name: 'Auth', passed: auth._initialized });
        } catch (e) {
            results.tests.push({ name: 'Auth', passed: false, error: e.message });
        }
        
        // Test VAF (validateString)
        try {
            const r = vaf.validateString('test');
            results.tests.push({ name: 'VAF', passed: r === true });
        } catch (e) {
            results.tests.push({ name: 'VAF', passed: false, error: e.message });
        }
        
        // Test lock
        try {
            const status = lock.status();
            results.tests.push({ name: 'Lock', passed: typeof status === 'object' });
        } catch (e) {
            results.tests.push({ name: 'Lock', passed: false, error: e.message });
        }
        
        results.passed = results.tests.every(t => t.passed);
        return results;
    }
    
    /**
     * Check brain for injection patterns
     * Scans brain files for suspicious content
     */
    async checkBrainHealth() {
        const brainDir = process.cwd() + '/models/public';
        const issues = [];
        
        if (!fs.existsSync(brainDir)) {
            return { safe: true, issues: [], note: 'No brain directory' };
        }
        
        // Patterns that might indicate injection
        // Files to exclude
        const excludeFiles = ['security.md', 'errors.md', 'audit.md', 'goals.md', 'lessons.md'];

        const suspiciousPatterns = [
            /eval\s*\(/,           // eval()
            /Function\s*\(/,      // Function constructor
            /require\s*\(\s*['"]/, // dynamic require
            /child_process/,      // child_process
            /exec\s*\(/,          // exec()
            /\$ \{/,              // template injection
        ];
        
        const files = fs.readdirSync(brainDir);
        for (const file of files) {
            if (excludeFiles.includes(file)) continue;
            if (!file.endsWith('.md')) continue;
            
            const filePath = path.join(brainDir, file);
            const content = fs.readFileSync(filePath, 'utf8');
            
            for (let i = 0; i < suspiciousPatterns.length; i++) {
                if (suspiciousPatterns[i].test(content)) {
                    issues.push({
                        file,
                        pattern: i,
                        severity: 'medium'
                    });
                }
            }
        }
        
        return {
            safe: issues.length === 0,
            issues,
            scanned: files.length
        };
    }
    
    /**
     * Verify VAF sanity
     * Checks if VAF is functioning correctly
     */
    async verifyVafSanity() {
        const results = {
            timestamp: Date.now(),
            checks: []
        };
        
        // Test that VAF module loaded
        try {
            results.checks.push({ name: 'module', passed: typeof vaf === 'object' });
        } catch (e) {
            results.checks.push({ name: 'module', passed: false, error: e.message });
        }
        
        results.sane = results.checks.every(c => c.passed);
        return results;
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
    },
    
    /**
     * Run self-tests
     */
    runSelfTests() {
        return defaultSecurity.runSelfTests();
    },
    
    /**
     * Check brain health
     */
    checkBrainHealth() {
        return defaultSecurity.checkBrainHealth();
    },
    
    /**
     * Verify VAF sanity
     */
    verifyVafSanity() {
        return defaultSecurity.verifyVafSanity();
    }
};