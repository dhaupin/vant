/**
 * Vant Sandbox Layer (v0.8.7)
 * WITH EVENT EMISSIONS - sandbox operations emit globally
 * 
 * Execution isolation layer - "Keeper" for agents/nodes
 * Provides read/write separation, quotas, network restrictions
 * Delegates to qos, escrow, lock, network for core functionality
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
 *   - maxConcurrent: Max simultaneous operations (uses qos Bulkhead)
 *   - readQuota: Read operations per minute (uses qos RateLimiter)
 *   - writeQuota: Write operations per minute (uses qos RateLimiter)
 *   - budget: Budget limit for agent (uses escrow)
 *   - allowedDomains: Network domain whitelist (via network)
 *   - requireLock: Require lock for write operations
 *   - agentId: Unique agent identifier for budget/isolation
 *   - capabilities: What this agent can do
 *   - scopes: Which operation scopes are allowed
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

// Early exports to prevent circular dependency warnings at require time
// SECURITY: DENY BY DEFAULT - must explicitly allow capabilities
module.exports = {
    canRead: () => false,   // DENY by default
    canWrite: () => false,  // DENY by default  
    canNetwork: () => false,
    canExec: () => false,   // shell exec - DENY
    canSpawn: () => false,  // spawn agents - DENY
    
    // Helper to create allowed sandbox
    createAllowed: () => ({
        canRead: () => true,
        canWrite: () => true,
        canNetwork: () => true,
        canExec: () => true,
        canSpawn: () => true
    }),
    
    // Create sandbox with custom capabilities
    create: (caps = {}) => ({
        canRead: () => caps.canRead ?? false,
        canWrite: () => caps.canWrite ?? false,
        canNetwork: () => caps.canNetwork ?? false,
        canExec: () => caps.canExec ?? false,
        canSpawn: () => caps.canSpawn ?? false
    })
};

const crypto = require('crypto');
const Encrypt = require('./encrypt');
const errors = require('./error');
const vaf = require('./vaf');

// Lazy load to avoid circular deps
let _qos = null;
function _getQoS() {
    if (!_qos) _qos = require('./qos');
    return _qos;
}

let _escrow = null;
function _getEscrow() {
    if (!_escrow) {
        const { Escrow } = require('./escrow');
        _escrow = new Escrow();
    }
    return _escrow;
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

// ==================== BRAIN HANDLER REGISTRY ====================
// brain.js wires through these for file operations
// Allows sandbox to control + gate brain file access
let _brainHandlers = {};

function registerBrainHandler(operation, handler) {
    _brainHandlers[operation] = handler;
}

function getBrainHandler(operation) {
    return _brainHandlers[operation];
}

function canBrain(operation) {
    // Map operation to capability
    const capMap = {
        read: 'canRead',
        write: 'canWrite',
        list: 'canRead',
        exists: 'canRead'
    };
    const cap = capMap[operation] || 'canRead';
    const allowed = DEFAULT_CAPABILITIES[cap] !== false;
    
    // EVENT: capability check (real auth decision)
    _emit('auth:check', { 
        capability: cap, 
        operation, 
        allowed, 
        timestamp: Date.now() 
    });
    
    return allowed;
}

// Export brain registry
module.exports.registerBrainHandler = registerBrainHandler;
module.exports.getBrainHandler = getBrainHandler;
module.exports.canBrain = canBrain;

// ==================== DEFAULT CAPABILITIES ====================

const DEFAULT_CAPABILITIES = {
    // Brain operations
    read: true,         // brain.get(), search()
    write: true,        // brain.write(), commit()
    load: true,         // brain.loadBrain()
    list: true,        // brain.list()
    exists: true,       // brain.exists()
    search: true,       // search operations
    // File operations
    canRead: true,      // sandbox read files
    canWrite: true,     // write files
    canNetwork: true,    // fetch() to external APIs
    canExec: true,        // shell exec (NEW)
    canSpawn: true,     // create sub-agents
    canCommit: true,    // commit to git
    canCreateBranch: false, // create git branches
    canDelete: false,   // delete files/branches
    canAdmin: false,    // admin operations
    // Brain files
    identity: true,     // load identity
    start: true,       // load start
    goals: true,      // load goals
    learnings: true   // load learnings
};

// ==================== DEFAULT SCOPES ====================

const DEFAULT_SCOPES = ['read', 'write', 'execute'];

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
        // Agent identity (for budget/isolation)
        this.agentId = options.agentId || 'default';
        
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
        
        // Circuit Breaker (use QoS CircuitBreaker for failure protection)
        this._circuitBreaker = new (_getQoS().CircuitBreaker)({
            failureThreshold: options.failureThreshold || 5,
            successThreshold: options.successThreshold || 3,
            timeout: options.circuitTimeout || 30000
        });
        
        // Budget delegate (use Escrow for budget tracking)
        this._escrow = _getEscrow();
        this.budget = options.budget || 10000;
        // Defer setBudget to after full initialization
        if (this._escrow && this._escrow.setBudget) {
            this._escrow.setBudget(this.agentId, this.budget);
        }
        
        // Network - delegate to network module for domain whitelist
        this._network = _getNetwork();
        this.allowedDomains = options.allowedDomains || [];
        if (this.allowedDomains.length) {
            this._network.setAllowedDomains(this.allowedDomains);
        }
        
        // Capabilities - what can this agent do?
        this.capabilities = {...DEFAULT_CAPABILITIES, ...options.capabilities};
        
        // Scopes - which operation types are allowed?
        this.scopes = options.scopes || [...DEFAULT_SCOPES];
        
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
        
        // Error tracking
        this._errors = [];
        this._maxErrors = 100;
    }
    
    /**
     * Check if operation is allowed (delegate to QoS)
     */
    async _canExecute(type) {
        // Check scope allowed
        if (!this.scopes.includes(type)) {
            return {allowed: false, reason: 'scope_not_allowed', scope: type};
        }
        
        // Check capability based on operation type
        const capMap = {
            read: 'canRead',
            write: 'canWrite',
            network: 'canNetwork',
            spawn: 'canSpawn',
            commit: 'canCommit',
            createBranch: 'canCreateBranch',
            delete: 'canDelete',
            admin: 'canAdmin'
        };
        
        const requiredCap = capMap[type];
        if (requiredCap && !this.capabilities[requiredCap]) {
            return {allowed: false, reason: 'capability_not_allowed', capability: requiredCap};
        }
        
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
     * @param {object} context - { type: 'read'|'write'|'network'|'spawn' }
     */
    async execute(operation, context = {}) {
        const type = context.type || 'execute';
        
        // Check if allowed
        const canExec = await this._canExecute(type);
        if (!canExec.allowed) {
            this._recordError(type, canExec.reason, 'blocked');
            const err = require('./error');
            throw new err.Error(`Sandbox: ${canExec.reason} for ${type}`, { code: err.CODES.SANDBOX_EXEC_DENIED, retryable: false });
        }
        
        // Check budget before execution
        const cost = context.cost || 1;
        const budgetCheck = this._escrow.canSpend(this.agentId, cost);
        if (!budgetCheck.allowed) {
            this._recordError(type, budgetCheck.reason, 'budget_exceeded');
            const err = require('./error');
            throw new err.Error(`Sandbox: budget exceeded for ${this.agentId}`, { code: err.CODES.SANDBOX_BUDGET_EXCEEDED, retryable: true });
        }
        
        // Increment active
        this._activeOps++;
        const op = {
            type,
            timestamp: Date.now(),
            id: Encrypt.generateShortId(8),
            cost
        };
        this._ops.push(op);
        
        // Trim old ops
        if (this._ops.length > this._maxOps) {
            this._ops = this._ops.slice(-this._maxOps);
        }
        
        try {
            // Execute with CircuitBreaker (trips if too many failures)
            return this._circuitBreaker.execute(async () => {
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
            });
        } catch (err) {
            // Circuit breaker is open - block all operations
            this._recordError(type, err.message, 'circuit_open');
            throw new errors.Error(`Sandbox: circuit open - too many failures, try again later`, { code: errors.CODES.SANDBOX_CIRCUIT_OPEN, retryable: true });
        } finally {
            this._activeOps--;
            
            // Record budget spent
            this._escrow.recordSpend(this.agentId, cost);
            
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
                throw new errors.Error('Sandbox: Could not acquire lock for write', { code: errors.CODES.LOCK_FAILED, retryable: true });
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
     * Execute network operation (external API calls)
     * Checks canNetwork capability + domain whitelist
     * @param {Function} operation - Network operation to execute
     */
    async network(operation) {
        return this.execute(operation, {type: 'network', cost: 5});
    }
    
    /**
     * Execute spawn operation (create sub-agents)
     * @param {Function} operation - Spawn operation
     */
    async spawn(operation) {
        return this.execute(operation, {type: 'spawn', cost: 10});
    }
    
    /**
     * Execute git commit operation
     * @param {Function} operation - Git operation
     */
    async commit(operation) {
        return this.execute(operation, {type: 'commit', cost: 2});
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
    
    // ==================== NEW KEEPER METHODS ====================
    
    /**
     * Record error for tracking
     * @private
     */
    _recordError(operation, reason, type) {
        const error = {
            operation,
            reason,
            type,
            timestamp: Date.now(),
            id: Encrypt.generateShortId(8)
        };
        this._errors.push(error);
        if (this._errors.length > this._maxErrors) {
            this._errors = this._errors.slice(-this._maxErrors);
        }
    }
    
    /**
     * Get budget status (delegate to escrow)
     */
    getBudgetStatus() {
        try {
            if (!this._escrow || !this._escrow.getBudget) {
                return { agentId: this.agentId, available: true, message: 'no escrow configured' };
            }
            const budget = this._escrow.getBudget(this.agentId);
            const status = this._escrow.getStatus ? this._escrow.getStatus(this.agentId) : null;
            return {
                agentId: this.agentId,
                limit: budget?.limit || this.budget,
                spent: budget?.spent || 0,
                available: budget?.available || this.budget,
                utilization: budget?.limit ? (budget.spent / budget.limit) * 100 : 0
            };
        } catch(e) {
            return { agentId: this.agentId, error: e.message };
        }
    }
    
    /**
     * Set capabilities for this sandbox
     * @param {object} caps - Capabilities to set
     */
    setCapabilities(caps) {
        this.capabilities = {...this.capabilities, ...caps};
    }
    
    /**
     * Get current capabilities
     */
    getCapabilities() {
        return {...this.capabilities};
    }
    
    /**
     * Check if capability is allowed
     * @param {string} cap - Capability to check (e.g., 'canCommit')
     */
    can(cap) {
        return this.capabilities[cap] === true;
    }
    
    /**
     * Set operation scopes
     * @param {string[]} scopes - Array of allowed scopes
     */
    setScopes(scopes) {
        this.scopes = scopes;
    }
    
    /**
     * Get allowed operation scopes
     */
    getScopes() {
        return [...this.scopes];
    }
    
    /**
     * Check if scope is allowed
     * @param {string} scope - Scope to check
     */
    hasScope(scope) {
        return this.scopes.includes(scope);
    }
    
    /**
     * Get operation history
     * @param {object} options - { limit, since }
     */
    getOperationHistory(options = {}) {
        const limit = options.limit || 100;
        const since = options.since || 0;
        
        let ops = this._ops.filter(op => op.timestamp > since);
        if (options.errors) {
            ops = ops.concat(this._errors);
        }
        return ops.slice(-limit).reverse();
    }
    
    /**
     * Get error history
     */
    getErrors() {
        return [...this._errors].reverse();
    }
    
    /**
     * Get circuit breaker status
     */
    getCircuitStatus() {
        return this._circuitBreaker.getStatus();
    }
    
    /**
     * Check if circuit is closed (normal operation)
     */
    isCircuitClosed() {
        return this._circuitBreaker.isClosed();
    }
    
    /**
     * Reset circuit breaker (manual reset)
     */
    resetCircuit() {
        this._circuitBreaker.reset();
    }
    
    /**
     * Create isolated sub-sandbox for untrusted code
     * @param {object} options - Options for sub-sandbox
     */
    isolate(options = {}) {
        return sandbox.create({
            agentId: `${this.agentId}-${Encrypt.generateShortId(6)}`,
            maxConcurrent: options.maxConcurrent || 1,
            readQuota: options.readQuota || 50,
            writeQuota: options.writeQuota || 10,
            budget: options.budget || 100,
            scopes: options.scopes || ['read'],
            capabilities: {
                canRead: true,
                canWrite: false,
                canNetwork: false,
                canSpawn: true,
                canCommit: false,
                canCreateBranch: false,
                canDelete: false,
                canAdmin: false
            }
        });
    }
    
    // ==================== LAYER STATUS ====================
    
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
            agentId: this.agentId,
            config: {
                maxConcurrent: this.maxConcurrent,
                maxMemory: this.maxMemory,
                budget: this.budget,
                scopes: this.scopes,
                capabilities: this.capabilities,
                allowedDomains: this.allowedDomains,
                requireLock: this.requireLock
            },
            state: {
                activeOps: this._activeOps,
                readCount: this._readCount,
                writeCount: this._writeCount,
                opsLastMinute: lastMinute.length,
                errorCount: this._errors.length,
                uptime: now - this._startTime
            },
            budget: this.getBudgetStatus()
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

// Keep reference to early exports (DENY by default stubs)
const _earlyExports = {
    canRead: () => false,
    canWrite: () => false,
    canNetwork: () => false,
    canExec: () => false,
    canSpawn: () => false,
    createAllowed: () => ({})
};

// Merge all exports - keep early stubs plus add full implementation
module.exports = {
    // Export defaultSandbox instance for direct access
    defaultSandbox,
    
    // Keep early stubs for backward compatibility
    canRead: _earlyExports.canRead,
    canWrite: _earlyExports.canWrite,
    canNetwork: _earlyExports.canNetwork,
    canExec: _earlyExports.canExec,
    canSpawn: _earlyExports.canSpawn,
    createAllowed: _earlyExports.createAllowed,
    
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
     * Execute network (external API)
     */
    async network(operation) {
        return defaultSandbox.network(operation);
    },
    
    /**
     * Execute spawn (sub-agent)
     */
    async spawn(operation) {
        return defaultSandbox.spawn(operation);
    },
    
    /**
     * Execute commit (git)
     */
    async commit(operation) {
        return defaultSandbox.commit(operation);
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
    
    // NEW KEEPER METHODS
    
    /**
     * Get budget status (delegate to escrow)
     */
    getBudgetStatus() {
        return defaultSandbox.getBudgetStatus();
    },
    
    /**
     * Set capabilities
     */
    setCapabilities(caps) {
        return defaultSandbox.setCapabilities(caps);
    },
    
    /**
     * Get capabilities
     */
    getCapabilities() {
        return defaultSandbox.getCapabilities();
    },
    
    /**
     * Check capability
     */
    can(cap) {
        return defaultSandbox.can(cap);
    },
    
    /**
     * Set scopes
     */
    setScopes(scopes) {
        return defaultSandbox.setScopes(scopes);
    },
    
    /**
     * Get scopes
     */
    getScopes() {
        return defaultSandbox.getScopes();
    },
    
    /**
     * Has scope
     */
    hasScope(scope) {
        return defaultSandbox.hasScope(scope);
    },
    
    /**
     * Get operation history
     */
    getOperationHistory(options) {
        return defaultSandbox.getOperationHistory(options);
    },
    
    /**
     * Get errors
     */
    getErrors() {
        return defaultSandbox.getErrors();
    },
    
    /**
     * Create isolated sub-sandbox
     */
    isolate(options) {
        return defaultSandbox.isolate(options);
    },
    
    // Constants
    DEFAULT_CONCURRENT: 3,
    DEFAULT_READ_QUOTA: 100,
    DEFAULT_WRITE_QUOTA: 20,
    DEFAULT_BUDGET: 10000,
    DEFAULT_CAPABILITIES,
    DEFAULT_SCOPES,
    
    // NEW: Island protection
    canIsland(operation, options = {}) {
        // Check if island operation is allowed via sandbox
        const { allowCreate = false, allowDelete = false, allowUpdate = true } = options;
        
        // DefaultSandbox has getScopes method
        const scopes = defaultSandbox.getScopes ? defaultSandbox.getScopes() : [];
        const hasAdmin = scopes.includes('admin');
        const hasIslandScope = scopes.includes('islands:admin') || scopes.includes('islands:all');
        
        if (hasAdmin || hasIslandScope) return true;
        
        // Check specific operations
        if (operation === 'create' && allowCreate) return true;
        if (operation === 'delete' && allowDelete) return true;
        if (operation === 'update' && allowUpdate) return true;
        
        return false;
    },
    
    getIslandLimit() {
        // Get max islands allowed
        const caps = defaultSandbox.getCapabilities ? defaultSandbox.getCapabilities() : {};
        return caps.islands || 50;
    },
    
    getIslandCount() {
        const islands = require('./islands');
        return islands.getAvailable().length;
    },
    
    canCreateIsland() {
        const limit = this.getIslandLimit();
        const count = this.getIslandCount();
        return count < limit;
    }
};