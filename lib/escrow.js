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
            defaultBudget: options.defaultBudget || 100000,
            perAgentBudget: options.perAgentBudget || {},
            creditMode: options.creditMode || false,
            holdTimeout: options.holdTimeout || 300000,
            maxHolds: options.maxHolds || 100,
            approvalRequired: options.approvalRequired || ['delete', 'admin', 'write:critical'],
            circuitThreshold: options.circuitThreshold || 5,
            circuitTimeout: options.circuitTimeout || 60000,
            defaultQuota: options.defaultQuota || 1000,
            quotaWindow: options.quotaWindow || 3600000,
            handlerEnabled: true
        };
        
        this._budgets = new Map();
        this._holds = new Map();
        this._approvals = new Map();
        this._quotas = new Map();
        this._breakers = new Map();
        this._costs = { read: 1, write: 5, delete: 10, admin: 50, 'default': 1 };
        this._startTime = Date.now();
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
        const budget = this.getBudget(agentId);
        budget.spent += amount;
        budget.available = Math.max(0, budget.limit - budget.spent);
        
        // Emit spend recorded event
        _emit('escrow:spend:recorded', { agentId, amount, totalSpent: budget.spent, timestamp: Date.now() });
        
        return { recorded: true, spent: budget.spent };
    }
    
    refund(agentId, amount) {
        const budget = this.getBudget(agentId);
        budget.spent = Math.max(0, budget.spent - amount);
        budget.available = Math.min(budget.limit, budget.available + amount);
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
        return this;
    }

    // Set budget directly (for sandbox integration)
    setBudget(agentId, budget) {
        // Store as budget object, not raw number
        const existing = this._budgets.get(agentId);
        const budgetObj = { 
            spent: existing?.spent || 0, 
            limit: budget, 
            available: budget - (existing?.spent || 0) 
        };
        this._budgets.set(agentId, budgetObj);
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
        if (_rls && userCtx && operation) {
            try {
                await _rls.checkWrite(userCtx, `_escrow:${operation}`);
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
            throw new Error(`Escrow: ${result.reason || 'Budget exceeded'}`);
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
    beforeExecute: (ctx) => new Escrow().beforeExecute(ctx),
    afterExecute: (ctx) => new Escrow().afterExecute(ctx),
    getLayerStatus: () => ({ name: 'Escrow', type: 'budget_holds', enabled: true }),
    isOperationAllowed: (op, ctx) => ({ allowed: true }),
    getStatus: () => ({ enabled: true }),
    
    // NEW: Island escrow (budget protection)
    reserveIsland: (island, cost = 10) => new Escrow().hold(`island:${island}`, cost),
    releaseIsland: (island) => new Escrow().release(`island:${island}`),
    checkIslandQuota: () => new Escrow().checkQuota('islands', 'create')
};
