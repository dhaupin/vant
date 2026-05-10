/**
 * Vant Sandbox Layer
 * 
 * Execution isolation layer - "Keeper" for agents/nodes
 * Provides read/write separation, quotas, network restrictions
 * Delegates to qos, lock, network for core functionality
 * 
 * Usage:
 *   const sandbox = require('./sandbox');
 *   const s = sandbox.create({maxConcurrent: 3});
 *   
 *   // Read operation (picking up)
 *   await s.read(() => brain.get('learnings', 'lesson-1'));
 *   
 *   // Write operation (doing)
 *   await s.write(() => brain.write('lessons', 'new', 'content'));
 * 
 * CONFIGURATION:
 *   - maxConcurrent: Max simultaneous operations
 *   - maxMemory: Max memory per operation
 *   - readQuota: Read operations per minute
 *   - writeQuota: Write operations per minute
 *   - allowedDomains: Network domain whitelist (via network)
 *   - requireLock: Require lock for write operations
 */

const crypto = require('crypto');
const Encrypt = require('./encrypt');
const vaf = require('./vaf');

// Lazy load to avoid circular deps
let _qos = null;
function _getQoS() {
    if (!_qos) _qos = require('./qos');
    return _qos;
}

let _lock = null;
function _getLock() {
    if (!_lock) _lock = require('./lock');
    return _lock;
}

let _network = null;
function _getNetwork() {
    if (!_network) _network = require('./network');
    return _network;
}

/**
 * Sandbox Class
 * Agent/Node execution isolation - Keeper layer
 */
class Sandbox {
    /**
     * Create sandbox instance
     * @param {object} options - Sandbox configuration
     */
    constructor(options = {}) {
        // Core limits
        this.maxConcurrent = options.maxConcurrent || 3;
        this.maxMemory = options.maxMemory || '100MB';
        
        // Quota delegates (use QoS RateLimiter internally)
        this._readLimiter = new (_getQoS().RateLimiter)({ 
            windowMs: 60000, 
            maxPerMinute: options.readQuota || 100 
        });
        this._writeLimiter = new (_getQoS().RateLimiter)({ 
            windowMs: 60000, 
            maxPerMinute: options.writeQuota || 20 
        });
        
        // Network - delegate to network module for domain whitelist
        this._network = _getNetwork();
        this.allowedDomains = options.allowedDomains || [];
        if (this.allowedDomains.length) {
            this._network.setAllowedDomains(this.allowedDomains);
        }
        
        // Behavior
        this.requireLock = options.requireLock || false;
        this.timeout = options.timeout || 30000;
        
        // State
        this._activeOps = 0;
        this._readCount = 0;
        this._writeCount = 0;
        this._startTime = Date.now();
        
        // Operation tracking
        this._ops = [];
        this._maxOps = 1000;
    }
    
    /**
     * Check if operation is allowed (delegate to QoS)
     */
    async _canExecute(type) {
        const limiter = type === 'read' ? this._readLimiter : this._writeLimiter;
        
        // Check QoS rate limiter
        if (!limiter.check()) {
            return {allowed: false, reason: 'quota_limit', limit: limiter.maxPerMinute};
        }
        
        // Check concurrency
        if (this._activeOps >= this.maxConcurrent) {
            return {allowed: false, reason: 'concurrency_limit', limit: this.maxConcurrent};
        }
        
        return {allowed: true};
    }
    
    /**
     * Execute operation in sandbox
     * @param {Function} operation - Operation to execute
     * @param {object} context - { type: 'read'|'write' }
     */
    async execute(operation, context = {}) {
        const type = context.type || 'execute';
        
        // Check if allowed
        const canExec = await this._canExecute(type);
        if (!canExec.allowed) {
            throw new Error(`Sandbox: ${canExec.reason} for ${type}`);
        }
        
        // Increment active
        this._activeOps++;
        const op = {
            type,
            timestamp: Date.now(),
            id: Encrypt.generateShortId(8)
        };
        this._ops.push(op);
        
        // Trim old ops
        if (this._ops.length > this._maxOps) {
            this._ops = this._ops.slice(-this._maxOps);
        }
        
        try {
            // Execute with timeout
            const timeout = this.timeout;
            
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Sandbox timeout')), timeout);
                
                Promise.resolve(operation()).then(result => {
                    clearTimeout(timer);
                    resolve(result);
                }).catch(err => {
                    clearTimeout(timer);
                    reject(err);
                });
            });
        } finally {
            this._activeOps--;
            
            // Count read/write
            if (type === 'read') this._readCount++;
            if (type === 'write') this._writeCount++;
        }
    }
    
    /**
     * Execute read operation (picking up)
     * More lenient: higher quotas, more concurrent
     */
    async read(operation) {
        return this.execute(operation, {type: 'read'});
    }
    
    /**
     * Execute write operation (doing)
     * Stricter: requires lock, serialized
     */
    async write(operation) {
        // Require lock if configured
        if (this.requireLock) {
            const lock = _getLock();
            const token = await lock.acquire('sandbox-write');
            if (!token) {
                throw new Error('Sandbox: Could not acquire lock for write');
            }
            
            try {
                return await this.execute(operation, {type: 'write'});
            } finally {
                await lock.release('sandbox-write', token);
            }
        }
        
        return this.execute(operation, {type: 'write'});
    }
    
    /**
     * Check if domain is allowed (delegate to network)
     * @param {string} url - URL to check
     */
    isDomainAllowed(url) {
        return this._network.isDomainAllowed(url);
    }
    
    /**
     * Set allowed domains (delegate to network)
     * @param {string[]} domains - Domain whitelist
     */
    setAllowedDomains(domains) {
        this.allowedDomains = domains;
        this._network.setAllowedDomains(domains);
    }
    
    /**
     * Get layer status for framework
     */
    getLayerStatus() {
        const now = Date.now();
        const lastMinute = this._ops.filter(op => now - op.timestamp < 60000);
        
        return {
            name: 'Sandbox',
            type: 'execution_isolation',
            enabled: true,
            config: {
                maxConcurrent: this.maxConcurrent,
                maxMemory: this.maxMemory,
                allowedDomains: this.allowedDomains,
                requireLock: this.requireLock
            },
            state: {
                activeOps: this._activeOps,
                readCount: this._readCount,
                writeCount: this._writeCount,
                opsLastMinute: lastMinute.length,
                uptime: now - this._startTime
            }
        };
    }
    
    /**
     * Check if operation type is allowed
     */
    isOperationAllowed(operationType) {
        if (operationType === 'write' && this.requireLock) {
            return {allowed: true, reason: 'lock_required', layer: 'Sandbox'};
        }
        return {allowed: true, layer: 'Sandbox'};
    }
    
    /**
     * Get status
     */
    getStatus() {
        return {
            active: this._activeOps,
            reads: this._readCount,
            writes: this._writeCount,
            uptime: Date.now() - this._startTime
        };
    }
    
    /**
     * Reset counters
     */
    reset() {
        this._readCount = 0;
        this._writeCount = 0;
        this._ops = [];
    }
}

/**
 * Default sandbox instance
 */
const defaultSandbox = new Sandbox();

module.exports = {
    // Class for custom instances
    Sandbox,
    
    /**
     * Create sandbox instance
     * @param {object} options - Custom configuration
     */
    create(options = {}) {
        return new Sandbox(options);
    },
    
    /**
     * Execute in default sandbox
     */
    async execute(operation, context = {}) {
        return defaultSandbox.execute(operation, context);
    },
    
    /**
     * Execute read (picking up)
     */
    async read(operation) {
        return defaultSandbox.read(operation);
    },
    
    /**
     * Execute write (doing)
     */
    async write(operation) {
        return defaultSandbox.write(operation);
    },
    
    /**
     * Check domain allowed (delegate to network)
     */
    isDomainAllowed(url) {
        return defaultSandbox.isDomainAllowed(url);
    },
    
    /**
     * Get layer status
     */
    getLayerStatus() {
        return defaultSandbox.getLayerStatus();
    },
    
    /**
     * Check operation allowed
     */
    isOperationAllowed(operationType) {
        return defaultSandbox.isOperationAllowed(operationType);
    },
    
    /**
     * Get status
     */
    getStatus() {
        return defaultSandbox.getStatus();
    },
    
    // Constants
    DEFAULT_CONCURRENT: 3,
    DEFAULT_READ_QUOTA: 100,
    DEFAULT_WRITE_QUOTA: 20
};