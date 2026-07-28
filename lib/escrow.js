/**
 * Vant Escrow Layer (v0.8.6)
 * WITH EVENT EMISSIONS - budget/approval operations emit globally
 * 
 * Budget tracking, condition holds, approvals, circuit breakers
 * Final validation gate before cluster execution
 * 
 * Usage:
 *   const { Escrow } = require('./escrow');
 *   const escrow = new Escrow();
 *   
 *   // Budget check
 *   escrow.canSpend('agent-1', 100);
 *   
 *   // Hold until condition  
 *   escrow.hold('task-1', { until: 'condition' });
 *   
 *   // Approval gate
 *   escrow.requestApproval('delete', 'Delete all data');
 *   
 *   // Circuit breaker
 *   escrow.isOpen('payment-svc');
 *   
 *   // Execute with checks
 *   escrow.beforeExecute({ agentId: 'agent-1', operation: 'read', cost: 5, service: 'db' });
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

// ==================== CONFIG + STORAGE ====================
const fs = require('fs');
const path = require('path');

let _config = null;
function _getConfig() {
    if (!_config) {
        try { _config = require('./config'); } catch (e) { _config = null; }
    }
    return _config;
}

function _getStorePath() {
    const cfg = _getConfig();
    return cfg && cfg.get ? cfg.get('escrow.store', '.agent_tmp/escrow.json') : '.agent_tmp/escrow.json';
}

// ==================== RUNAWAY PROTECTION ====================
// Track spend rate to detect infinite loops
const _spendHistory = new Map();  // agentId -> [{timestamp, amount}]

// Load from config if available
function _getRunawayConfig() {
    const cfg = _getConfig();
    return {
        maxSpendsPerWindow: cfg && cfg.get ? parseInt(cfg.get('escrow.runaway.maxPerMinute', '30')) : 30,
        windowMs: 60000,
        maxSpendsPerHour: cfg && cfg.get ? parseInt(cfg.get('escrow.runaway.maxPerHour', '1000')) : 1000,
        hourlyWindowMs: 3600000,
        alertThreshold: cfg && cfg.get ? parseInt(cfg.get('escrow.runaway.alertThreshold', '20')) : 20
    };
}

const RUNAWAY_CONFIG = _getRunawayConfig();

/**
 * Check for runaway spending (loop detection)
 */
function _checkRunaway(agentId, amount) {
    const now = Date.now();
    
    // Initialize history if needed
    if (!_spendHistory.has(agentId)) {
        _spendHistory.set(agentId, []);
    }
    
    const history = _spendHistory.get(agentId);
    
    // Add current spend
    history.push({ timestamp: now, amount });
    
    // Clean old entries outside both windows
    const cutoff1min = now - RUNAWAY_CONFIG.windowMs;
    const cutoff1hour = now - RUNAWAY_CONFIG.hourlyWindowMs;
    
    // Filter to last 1 minute
    const recent1min = history.filter(h => h.timestamp > cutoff1min);
    
    // Filter to last 1 hour
    const recent1hour = history.filter(h => h.timestamp > cutoff1hour);
    
    // Update history to only keep last hour
    _spendHistory.set(agentId, recent1hour);
    
    // Check 1-minute rate
    if (recent1min.length > RUNAWAY_CONFIG.maxSpendsPerWindow) {
        _emit('escrow:runaway', { 
            agentId, 
            rate: recent1min.length,
            window: '1min',
            timestamp: now 
        });
        return { 
            runaway: true, 
            reason: 'spend_rate_exceeded',
            rate: recent1min.length,
            limit: RUNAWAY_CONFIG.maxSpendsPerWindow,
            window: '1min'
        };
    }
    
    // Check 1-hour rate
    if (recent1hour.length > RUNAWAY_CONFIG.maxSpendsPerHour) {
        _emit('escrow:runaway', { 
            agentId, 
            rate: recent1hour.length,
            window: '1hour',
            timestamp: now 
        });
        return { 
            runaway: true, 
            reason: 'hourly_limit_exceeded',
            rate: recent1hour.length,
            limit: RUNAWAY_CONFIG.maxSpendsPerHour,
            window: '1hour'
        };
    }
    
    // Alert if approaching limit
    if (recent1min.length >= RUNAWAY_CONFIG.alertThreshold) {
        _emit('escrow:spendAlert', { 
            agentId, 
            rate: recent1min.length,
            threshold: RUNAWAY_CONFIG.alertThreshold,
            timestamp: now 
        });
    }
    
    return { runaway: false };
}

/**
 * Get spend rate for an agent
 */
function getSpendRate(agentId) {
    const now = Date.now();
    const history = _spendHistory.get(agentId) || [];
    const cutoff1min = now - RUNAWAY_CONFIG.windowMs;
    const recent = history.filter(h => h.timestamp > cutoff1min);
    
    return {
        perMinute: recent.length,
        maxPerMinute: RUNAWAY_CONFIG.maxSpendsPerWindow,
        totalHourly: history.length,
        maxHourly: RUNAWAY_CONFIG.maxSpendsPerHour
    };
}

// Load escrow state from file
function _loadEscrow() {
    const storePath = _getStorePath();
    if (!fs.existsSync(storePath)) return null;
    
    try {
        const data = JSON.parse(fs.readFileSync(storePath, 'utf8'));
        _emit('escrow:loaded', { path: storePath, timestamp: Date.now() });
        return data;
    } catch (e) {
        _emit('escrow:loadError', { error: e.message, timestamp: Date.now() });
        return null;
    }
}

// Save escrow state to file
function _saveEscrow(data) {
    const storePath = _getStorePath();
    
    try {
        // Ensure directory exists
        const dir = path.dirname(storePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(storePath, JSON.stringify(data, null, 2));
        _emit('escrow:saved', { path: storePath, timestamp: Date.now() });
        return true;
    } catch (e) {
        _emit('escrow:saveError', { error: e.message, timestamp: Date.now() });
        return false;
    }
}

// ==================== RLS INTEGRATION ====================
let _rls = null;

/**
 * Initialize escrow with RLS
 */
function initRLS(habitat) {
    _rls = require('./rls');
    _rls.init(habitat);
    return Escrow;
}

// QoS CircuitBreaker (lazy loaded to avoid circular deps)
let _CircuitBreaker = null;
let _legal = null;

function _getCircuitBreaker() {
    if (!_CircuitBreaker) {
        const { CircuitBreaker } = require('./qos');
        _CircuitBreaker = CircuitBreaker;
    }
    return _CircuitBreaker;
}

function _getLegal() {
    if (!_legal) {
        try { _legal = require('./legal'); } catch (e) { _legal = null; }
    }
    return _legal;
}

class Escrow {
    constructor(options = {}) {
        this.options = {
            defaultBudget: options.defaultBudget || 1000,
            perAgentBudget: options.perAgentBudget || {},
            creditMode: options.creditMode || false,
            holdTimeout: options.holdTimeout || 300000,
            maxHolds: options.maxHolds || 100,
            approvalRequired: options.approvalRequired || ['delete', 'admin', 'write:critical'],
            circuitThreshold: options.circuitThreshold || 5,
            circuitTimeout: options.circuitTimeout || 60000,
            defaultQuota: options.defaultQuota || 1000,
            quotaWindow: options.quotaWindow || 3600000,
            handlerEnabled: true,
            persistBudgets: options.persistBudgets !== false // Default to true
        };
        
        this._budgets = new Map();
        this._holds = new Map();
        this._approvals = new Map();
        this._quotas = new Map();
        this._breakers = new Map();
        this._costs = { read: 1, write: 5, delete: 10, admin: 50, 'default': 1 };
        this._startTime = Date.now();
        
        // Load persisted state if enabled
        if (this.options.persistBudgets) {
            const saved = _loadEscrow();
            if (saved) {
                if (saved.budgets) {
                    this._budgets = new Map(Object.entries(saved.budgets));
                }
                if (saved.holds) {
                    this._holds = new Map(Object.entries(saved.holds));
                }
                if (saved.approvals) {
                    this._approvals = new Map(Object.entries(saved.approvals));
                }
                if (saved.quotas) {
                    this._quotas = new Map(Object.entries(saved.quotas));
                }
                _emit('escrow:restored', { budgets: this._budgets.size, timestamp: Date.now() });
            }
        }
    }
    
    /**
     * Persist escrow state to file
     */
    save() {
        if (!this.options.persistBudgets) return { saved: false, reason: 'disabled' };
        
        const data = {
            budgets: Object.fromEntries(this._budgets),
            holds: Object.fromEntries(this._holds),
            approvals: Object.fromEntries(this._approvals),
            quotas: Object.fromEntries(this._quotas),
            saved: Date.now()
        };
        
        const saved = _saveEscrow(data);
        return { saved, path: _getStorePath() };
    }
    
    // ==================== BUDGET ====================
    setCost(o, c) { this._costs[o] = c; return this; }
    getCost(o) { return this._costs[o] || this._costs.default; }
    
    canSpend(agentId, amount) {
        const budget = this.getBudget(agentId);
        const can = budget.available >= amount;
        
        // Emit budget check event
        _emit('escrow:budget:check', { agentId, amount, allowed: can, timestamp: Date.now() });
        
        return { allowed: can, reason: can ? 'budget_available' : 'budget_exceeded', layer: 'Escrow', available: budget.available };
    }
    
    recordSpend(agentId, amount) {
        // SECURITY: Check for runaway spending BEFORE recording
        const runawayCheck = _checkRunaway(agentId, amount);
        if (runawayCheck.runaway) {
            _emit('escrow:runaway:blocked', { agentId, amount, ...runawayCheck, timestamp: Date.now() });
            return { 
                recorded: false, 
                error: 'Runaway spending detected',
                code: 'E_RUNAWAY',
                ...runawayCheck
            };
        }
        
        const budget = this.getBudget(agentId);
        budget.spent += amount;
        budget.available = Math.max(0, budget.limit - budget.spent);
        
        // Emit spend recorded event
        _emit('escrow:spend:recorded', { agentId, amount, totalSpent: budget.spent, timestamp: Date.now() });
        
        // Auto-persist
        if (this.options.persistBudgets) {
            this.save();
        }
        
        return { recorded: true, spent: budget.spent };
    }
    
    refund(agentId, amount) {
        const budget = this.getBudget(agentId);
        budget.spent = Math.max(0, budget.spent - amount);
        budget.available = Math.min(budget.limit, budget.available + amount);
        
        // Auto-persist
        if (this.options.persistBudgets) {
            this.save();
        }
        
        return { refunded: true };
    }
    
    getBudget(agentId) {
        let budget = this._budgets.get(agentId);
        if (!budget) {
            const limit = this.options.perAgentBudget[agentId] || this.options.defaultBudget;
            budget = { spent: 0, limit, available: limit };
            this._budgets.set(agentId, budget);
        }
        return budget;
    }
    
    setBudgetLimit(agentId, limit) {
        const budget = this.getBudget(agentId);
        budget.limit = limit;
        budget.available = Math.max(0, limit - budget.spent);
        
        // Auto-persist
        if (this.options.persistBudgets) {
            this.save();
        }
        
        return this;
    }

    // Set budget limit (preserves spent for metrics)
    setBudget(agentId, budget) {
        const existing = this._budgets.get(agentId);
        const spent = existing?.spent || 0;
        const budgetObj = { 
            spent: spent,  // Preserve for metrics
            limit: budget, 
            available: Math.max(0, budget - spent) 
        };
        this._budgets.set(agentId, budgetObj);
        
        // Auto-persist
        if (this.options.persistBudgets) {
            this.save();
        }
    }
    
    // Reset budget - clears spent to start fresh (use with caution!)
    // WARNING: This hides spending history - use for fresh starts only
    resetBudget(agentId, budget) {
        const budgetObj = { 
            spent: 0, 
            limit: budget, 
            available: budget 
        };
        this._budgets.set(agentId, budgetObj);
        
        // Auto-persist
        if (this.options.persistBudgets) {
            this.save();
        }
    }
    
    // ==================== HOLDS ====================
    hold(holdId, condition) {
        if (this._holds.size >= this.options.maxHolds) return { held: false, reason: 'max_holds_exceeded' };
        this._holds.set(holdId, { condition, timeout: Date.now() + this.options.holdTimeout });
        return { held: true, holdId };
    }
    
    release(holdId) { return { released: this._holds.delete(holdId) }; }
    
    checkHold(holdId) {
        const hold = this._holds.get(holdId);
        if (!hold) return { held: false, reason: 'not_found' };
        if (Date.now() > hold.timeout) { this._holds.delete(holdId); return { held: false, reason: 'expired' }; }
        return { held: true, condition: hold.condition };
    }
    
    // ==================== APPROVALS ====================
    needsApproval(operation) { return this.options.approvalRequired.some(a => operation.includes(a) || a === '*'); }
    
    requestApproval(operation, reason) {
        if (!this.needsApproval(operation)) return { approved: true, reason: 'auto_approved' };
        const id = crypto.randomBytes(32).toString('hex');
        this._approvals.set(id, { operation, reason, approved: false, createdAt: Date.now() });
        return { approvalId: id, approved: false };
    }
    
    approve(approvalId, approvedBy) {
        const a = this._approvals.get(approvalId);
        if (!a) return { approved: false, reason: 'not_found' };
        a.approved = true;
        a.approvedBy = approvedBy;
        return { approved: true };
    }
    
    checkApproval(approvalId) {
        const a = this._approvals.get(approvalId);
        if (!a) return { approved: false, reason: 'not_found' };
        return { approved: a.approved, operation: a.operation };
    }
    
    // ==================== QUOTAS ====================
    checkQuota(agentId, operation = 'default') {
        const quota = this.getQuota(agentId, operation);
        const can = quota.count < quota.limit;
        return { allowed: can, used: quota.count, limit: quota.limit };
    }
    
    incrementQuota(agentId, operation = 'default') {
        const quota = this.getQuota(agentId, operation);
        quota.count++;
        return { count: quota.count };
    }
    
    getQuota(agentId, operation = 'default') {
        const key = `${agentId}:${operation}`;
        let quota = this._quotas.get(key);
        if (!quota) {
            quota = { count: 0, limit: this.options.defaultQuota, windowStart: Date.now() };
            this._quotas.set(key, quota);
        }
        if (Date.now() - quota.windowStart > this.options.quotaWindow) { quota.count = 0; quota.windowStart = Date.now(); }
        return quota;
    }
    
    // ==================== CIRCUIT ====================
    getBreaker(serviceName) {
        let breaker = this._breakers.get(serviceName);
        if (!breaker) {
            breaker = new CircuitBreaker({ 
                mode: 'full',
                file: '.circuit-escrow.json',
                threshold: this.options.circuitThreshold,
                backoff: { base: 1000, max: 30000, multiplier: 2 },
                autoRetry: true
            });
            this._breakers.set(serviceName, breaker);
        }
        return breaker;
    }
    
    isOpen(serviceName) { return this.getBreaker(serviceName).getState()?.providers?.[serviceName]?.open === true; }
    recordFailure(serviceName) { this.getBreaker(serviceName).recordFailure(serviceName); }
    recordSuccess(serviceName) { this.getBreaker(serviceName).recordSuccess(serviceName); }
    
    // ==================== INTEGRATION ====================
    async beforeExecute(context = {}) {
        const { agentId, operation, service, cost, userCtx } = context;
        const results = {};
        
        // Emit execute:before event
        _emit('escrow:execute:before', { agentId, operation, timestamp: Date.now() });
        
        // Budget
        if (agentId && cost) results.budget = this.canSpend(agentId, cost);
        
        // Quota
        if (agentId && operation) results.quota = this.checkQuota(agentId, operation);
        
        // Circuit
        if (service) results.circuit = { open: this.isOpen(service) };
        
        // ⚖️ LEGAL INTEGRATION - Check if allowed
        const legal = _getLegal();
        if (legal?.checkGate) {
            results.legal = { allowed: legal.checkGate('escrow', context) };
            if (!results.legal.allowed) {
                legal.notice('warn', `Escrow legal block: ${JSON.stringify(context)}`);
            }
        }
        
        // 🔐 RLS INTEGRATION - Check workspace/role access
        if (userCtx && operation) {
            try {
                await _checkWrite(userCtx, `_escrow:${operation}`);
                results.rls = { allowed: true };
            } catch (e) {
                results.rls = { allowed: false, reason: e.message };
            }
        }
        
        const allowed = (results.budget?.allowed !== false) && 
                     (results.quota?.allowed !== false) && 
                     (results.circuit?.open !== true) &&
                     (results.legal?.allowed !== false) &&
                     (results.rls?.allowed !== false);
                     
        // Emit result
        _emit('escrow:execute:check', { allowed, timestamp: Date.now() });
        
        return { allowed, results };
    }
    
    afterExecute(context = {}) {
        const { agentId, operation, service, cost, success } = context;
        if (agentId && cost && success) this.recordSpend(agentId, cost);
        if (agentId && operation) this.incrementQuota(agentId, operation);
        if (service) success ? this.recordSuccess(service) : this.recordFailure(service);
        
        // Emit execute:after event
        _emit('escrow:execute:after', { success, timestamp: Date.now() });
        
        return { recorded: true };
    }
    
    // ==================== STATUS ====================
    getLayerStatus() {
        return { name: 'Escrow', type: 'budget_holds', enabled: this.options.handlerEnabled,
            config: { defaultBudget: this.options.defaultBudget, defaultQuota: this.options.defaultQuota },
            state: { budgets: this._budgets.size, holds: this._holds.size, approvals: this._approvals.size, quotas: this._quotas.size } };
    }
    
    isOperationAllowed(op, ctx) { return this.beforeExecute(ctx); }
    getStatus() { return { enabled: this.options.handlerEnabled, budgets: this._budgets.size }; }
    
    // Brain pipeline integration: execute middleware
    async execute(ctx) {
        const result = await this.beforeExecute(ctx);
        if (!result.allowed) {
            throw new errors.VantError('Escrow denied', { code: errors.CODES.ESCROW_DENIED });
        }
        return result;
    }
}

module.exports = { Escrow, create: (o) => new Escrow(o),
    canSpend: (id, a) => new Escrow().canSpend(id, a),
    hold: (id, c) => new Escrow().hold(id, c),
    release: (id) => new Escrow().release(id),
    checkHold: (id) => new Escrow().checkHold(id),
    requestApproval: (op, r) => new Escrow().requestApproval(op, r),
    approve: (id, by) => new Escrow().approve(id, by),
    checkApproval: (id) => new Escrow().checkApproval(id),
    checkQuota: (id, op) => new Escrow().checkQuota(id, op),
    isOpen: (svc) => new Escrow().isOpen(svc),
    getSpendRate: (id) => getSpendRate(id),
    resetBudget: (id, b) => new Escrow().resetBudget(id, b),
    beforeExecute: (ctx) => new Escrow().beforeExecute(ctx),
    afterExecute: (ctx) => new Escrow().afterExecute(ctx),
    getLayerStatus: () => ({ name: 'Escrow', type: 'budget_holds', enabled: true }),
    isOperationAllowed: (op, ctx) => ({ allowed: true }),
    getStatus: () => ({ enabled: true }),
    
    // Brain pipeline integration: execute middleware
    execute: async (ctx) => {
        const e = new Escrow();
        const result = await e.beforeExecute(ctx);
        if (!result.allowed) {
            throw new errors.VantError('Escrow denied', { code: errors.CODES.ESCROW_DENIED });
        }
        return result;
    },
    
    // NEW: Island escrow (budget protection)
    reserveIsland: (island, cost = 10) => new Escrow().hold(`island:${island}`, cost),
    releaseIsland: (island) => new Escrow().release(`island:${island}`),
    checkIslandQuota: () => new Escrow().checkQuota('islands', 'create'),
    
    // Multibrain
    getBrainEscrowStatus,
    setBrainQuota,
    
    // Multibrain Stack
    getStackEscrowStatus
};

// ==================== MULTIBRAIN SUPPORT ====================

const _brainQuotas = {};

function getBrainEscrowStatus() {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    return _brainQuotas[brainName] || { budget: 100, used: 0 };
}

function setBrainQuota(budget) {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    _brainQuotas[brainName] = _brainQuotas[brainName] || { budget: 100, used: 0 };
    _brainQuotas[brainName].budget = budget;
    return true;
}

// ==================== MULTIBRAIN STACK SUPPORT ====================

function getStackEscrowStatus() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = {
        source: 'stack',
        brains: stack,
        byBrain: {}
    };
    
    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const status = getStatus();
            results.byBrain[brainName] = status;
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }
    
    return results;
}
