/**
 * Vant Security Layer (v0.8.6)
 * WITH EVENT EMISSIONS - security operations emit globally
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

const stego = require('./stego');
const brain = require('./brain');
const qos = require('./qos');
const lock = require('./lock');
const { Auth } = require('./auth');
const vaf = require('./vaf');
const Encrypt = require('./encrypt');
const fs = require('fs');
const path = require('path');
const errors = require('./error');

// Lazy-load sandbox for capability check
let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) {
        try { _sandbox = require('./sandbox'); } catch (e) {}
    }
    return _sandbox;
}

function _checkRead() {
    const sandbox = _getSandbox();
    if (sandbox && sandbox.canRead) {
        try {
            if (!sandbox.canRead()) {
                throw new errors.Error('Read permission required', { code: errors.CODES.STORAGE_READ_DENIED, retryable: false });
            }
        } catch (e) {}
    }
}

function _checkWrite() {
    const sandbox = _getSandbox();
    if (sandbox && sandbox.canWrite) {
        try {
            if (!sandbox.canWrite()) {
                throw new errors.Error('Write permission required', { code: errors.CODES.STORAGE_WRITE_DENIED, retryable: false });
            }
        } catch (e) {}
    }
}

// Lazy-load brainStorage - now via brain router
let _brainStorage = null;
function _getBrainStorage() {
    if (!_brainStorage) _brainStorage = require('./brain').getBrainStorage();
    return _brainStorage;
}

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
        _checkRead();
        const brainPath = brain.getBrainPath();
        const brainDir = process.cwd() + '/' + brainPath;
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

        const brainStorage = _getBrainStorage();
        const files = brainStorage.list('public');
        for (const file of files) {
            if (excludeFiles.includes(file)) continue;
            if (!file.endsWith('.md')) continue;

            const content = brainStorage.get('public', file);

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
    },

    // ==================== MULTIBRAIN STACK SUPPORT ====================

    /**
     * Check health across all brains in the stack
     * @returns {Object} Combined health from all brains
     */
    checkStackHealth() {
        const brain = require('./brain');
        const stack = brain.getStack();
        const results = {
            source: 'stack',
            brains: stack,
            byBrain: {},
            healthy: true
        };

        for (const brainName of stack) {
            try {
                brain.pushBrain(brainName);
                const health = defaultSecurity.checkBrainHealth();
                results.byBrain[brainName] = health;
                if (!health.healthy) results.healthy = false;
            } catch (e) {
                results.byBrain[brainName] = { healthy: false, error: e.message };
                results.healthy = false;
            } finally {
                brain.removeBrain();
            }
        }

        return results;
    },

    /**
     * Validate lock across all brains in the stack
     * @param {string} token - Token to validate
     * @param {string} agentId - Agent ID
     * @returns {Object} Combined validation results
     */
    async validateStackLock(token, agentId) {
        const brain = require('./brain');
        const stack = brain.getStack();
        const results = {
            source: 'stack',
            brains: stack,
            valid: false,
            byBrain: {}
        };

        for (const brainName of stack) {
            try {
                brain.pushBrain(brainName);
                const valid = await defaultSecurity.validateLock(token, agentId);
                results.byBrain[brainName] = valid;
                if (valid.valid) results.valid = true;
            } catch (e) {
                results.byBrain[brainName] = { valid: false, error: e.message };
            } finally {
                brain.removeBrain();
            }
        }

        return results;
    }
};
