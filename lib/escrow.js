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
 *   // Hold until condition (2-arg: holdId + the condition itself)
 *   escrow.hold('task-1', condition);
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

// (pass 28) brain-scoped store is THE default (O-7 follow-up): escrow
// budgets live in the models tree — gathered, committed, horcrux-
// transported with the brain. The explicit escrow.store config override is
// the only alternative; the old .agent_tmp fallback is GONE.
function _getStorePath() {
    const cfg = _getConfig();
    if (cfg && cfg.get) {
        const override = cfg.get('escrow.store', null);
        if (override) return override;
    }
    // (pass 53 / two-install isolation) Same seam as teams.js: resolve the
    // brain through state-store (VANT_BRAIN env > currentBrain) so escrow
    // budgets land in the SAME brain as the protocol state.
    let brainName = 'vant';
    try {
        const stateStore = require('./state-store');
        brainName = stateStore.currentBrain();
    } catch (e) {
        const brainMod = require('./brain');
        brainName = brainMod.getCurrentBrain ? brainMod.getCurrentBrain() : 'vant';
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(brainName)) {
        throw new Error('escrow: unusable current brain name: ' + JSON.stringify(brainName));
    }
    return 'models/private/' + brainName + '/orgchart/escrow.json';
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
// (pass 22) Store access — teams.js-style anchor. The store path is
// cwd-anchored BY DESIGN (the dispatcher runs subcommands in the user's
// project), but the old code resolved the path against cwd and then joined it
// against the INSTALL ROOT — two disagreeing anchors. From a foreign cwd the
// relative computation produced an escape-shaped path ('../../tmp/...') and
// path.join silently collapsed it back into the caller's directory, bypassing
// containment. Anchoring FileStorage's basePath at the resolved store DIR
// with the basename as the file makes containment hold by construction,
// whatever cwd is.
function _getStore() {
    const storePath = _getStorePath();
    return new (require('./storage').FileStorage)({ basePath: path.resolve(path.dirname(storePath)) });
}
function _getStoreFile() {
    return path.basename(_getStorePath());
}

function _loadEscrow() {
    const store = _getStore();
    try {
        const raw = store.read(_getStoreFile());
        if (raw === null) return null;
        const data = JSON.parse(raw);
        _emit('escrow:loaded', { path: _getStorePath(), timestamp: Date.now() });
        return data;
    } catch (e) {
        _emit('escrow:loadError', { error: e.message, timestamp: Date.now() });
        return null;
    }
}

// Save escrow state to file
// pass 79: MERGE save. escrow.json is last-write-wins on the whole file -
// market's trade path interleaves async hold-saves with the settlement
// debit-save, and a stale-view hold-save was clobbering the debit
// (buyer's budget silently reverted; market-debit pins caught it). The
// fresh-instance-per-call pattern is disk-coherent ONLY if each save
// merges into what is currently on disk: a budget map merged PER KEY,
// holds/approvals/quotas merged per key too. Same-key last-writer still
// wins; different keys never destroy each other.
function _saveEscrow(data) {
    try {
        const store = _getStore();
        const file = _getStoreFile();
        let merged = data;
        try {
            const raw = store.read(file);
            if (raw) {
                const disk = JSON.parse(raw);
                merged = {
                    budgets: { ...(disk.budgets || {}), ...(data.budgets || {}) },
                    holds: { ...(disk.holds || {}), ...(data.holds || {}) },
                    approvals: { ...(disk.approvals || {}), ...(data.approvals || {}) },
                    quotas: { ...(disk.quotas || {}), ...(data.quotas || {}) },
                    saved: Date.now()
                };
            }
        } catch (e) {
            // unreadable/corrupt disk state → fall through to plain overwrite
        }
        // (pass 101) Deletions cannot ride an additive union: a RELEASED hold
        // is simply absent from the writer's snapshot, so `{...disk, ...data}`
        // re-adds the disk copy and the hold leaks FOREVER. Observed live:
        // escrow.release() left the persisted hold in place, so every market
        // trade's hold accumulated toward escrow.maxHolds and then ALL later
        // trades failed with max_holds_exceeded. Apply the writer's explicit
        // deletions AFTER the union (and never persist the deletion list).
        const out = {
            budgets: merged.budgets || {},
            holds: { ...(merged.holds || {}) },
            approvals: merged.approvals || {},
            quotas: merged.quotas || {},
            saved: merged.saved || Date.now()
        };
        if (Array.isArray(data.deletedHolds)) {
            for (const id of data.deletedHolds) delete out.holds[id];
        }
        // models-tree store → FileStorage atomic write (dir auto-created)
        store.write(file, JSON.stringify(out, null, 2));
        _emit('escrow:saved', { path: _getStorePath(), timestamp: Date.now() });
        return true;
    } catch (e) {
        _emit('escrow:saveError', { error: e.message, timestamp: Date.now() });
        return false;
    }
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
        // (pass 101) Holds released by THIS instance, applied to the persisted
        // union in _saveEscrow so a release actually removes the disk row.
        this._deletedHolds = new Set();
        this._costs = { read: 1, write: 5, delete: 10, admin: 50, 'default': 1 };
        this._startTime = Date.now();

        // (pass 83) RLS admission gate for workspace budget draws: a spend
        // scoped to a workspace the habitat has never heard of is refused
        // (same fail-closed rule sandbox.generateCaps got in pass 82). The
        // habitat is consulted lazily and tolerated absent — unit tests and
        // bare-node use keep working; a LIVE habitat always enforces.
        this.options.enforceWorkspaceRLS = options.enforceWorkspaceRLS !== false;

        // (pass 83) Workspace pool summary for status/tools: enumerate the
        // org-pool keys without exposing internals.
        this.listWorkspacePools = () => {
            const pools = [];
            for (const [key, b] of this._budgets) {
                const parsed = Escrow.parseBudgetKey(key);
                if (parsed && parsed.org) {
                    pools.push({ workspace: parsed.workspace, spent: b.spent, limit: b.limit, available: b.available });
                }
            }
            return pools;
        };

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
            deletedHolds: Array.from(this._deletedHolds || []),
            saved: Date.now()
        };

        const saved = _saveEscrow(data);
        return { saved, path: _getStorePath() };
    }

    // ==================== BUDGET ====================
    setCost(o, c) { this._costs[o] = c; return this; }
    getCost(o) { return this._costs[o] || this._costs.default; }

    // ---------- WORKSPACE BUDGET PROTOCOL (pass 83) ----------
    // Budget keys may be namespaced by habitat workspace so agents, orgs,
    // and teams draw from per-workspace pools instead of one flat global:
    //   ws:<workspaceId>:<agentId>   member budget (draws from the org pool)
    //   ws:<workspaceId>::org        the workspace's own pooled budget
    // Bare keys (no prefix) remain the pre-existing global budgets, so
    // every pre-83 caller/ledger keeps working byte-for-byte.
    static WORKSPACE_KEY(workspaceId, agentId) {
        return agentId ? 'ws:' + workspaceId + ':' + agentId : 'ws:' + workspaceId + '::org';
    }
    static parseBudgetKey(key) {
        if (typeof key !== 'string' || !key.startsWith('ws:')) return null;
        const rest = key.slice(3);
        const orgIdx = rest.indexOf('::org');
        if (orgIdx !== -1) return { workspace: rest.slice(0, orgIdx), agentId: null, org: true };
        const sep = rest.indexOf(':');
        if (sep === -1) return null;  // malformed — treat as global, not workspace
        return { workspace: rest.slice(0, sep), agentId: rest.slice(sep + 1), org: false };
    }
    static isWorkspaceKey(key) {
        if (typeof key !== 'string' || !key.startsWith('ws:')) return false;
        return Escrow.parseBudgetKey(key) !== null;
    }

    /**
     * (pass 83) RLS admission for a workspace budget draw. Fail-closed when
     * a live habitat exists and the workspace is unknown to it — mirrors
     * sandbox.generateCaps' pass-82 rule. No habitat anywhere = pass (bare
     * library use; there is no tenancy to violate).
     */
    _workspaceAdmitted(workspaceId) {
        if (!this.options.enforceWorkspaceRLS) return true;
        try {
            const habitat = require('./habitat');
            if (!habitat.getShared) return true;
            const h = habitat.getShared();
            if (!h) return true;
            return !!h.workspaces[workspaceId];
        } catch (e) {
            return true;  // habitat module unavailable — legacy tolerance
        }
    }

    canSpend(agentId, amount, options = {}) {
        // (pass 83) Workspace draw: the spend must fit BOTH the member's own
        // cap (when one is set) AND the org pool. Two gates, one answer.
        if (options && options.workspace) {
            if (!this._workspaceAdmitted(options.workspace)) {
                _emit('escrow:budget:check', { agentId, amount, allowed: false, workspace: options.workspace, denied: 'unknown_workspace', timestamp: Date.now() });
                return { allowed: false, reason: 'unknown_workspace', layer: 'Escrow', available: 0 };
            }
            const member = this.getBudget(agentId, { workspace: options.workspace, memberLimit: options.memberLimit, orgLimit: options.orgLimit });
            const pool = this.getBudget(null, { workspace: options.workspace, orgLimit: options.orgLimit });
            // Member gate ALWAYS consults the member row's availability — a
            // persisted cap (setWorkspaceMemberLimit) bites on every later
            // call, not just when memberLimit is passed in one-shot. For a
            // fresh member (limit inherited from the pool) this equals the
            // pool gate, so it adds no friction.
            const memberGate = member.available >= amount;
            const poolGate = pool.available >= amount;
            const can = memberGate && poolGate;
            _emit('escrow:budget:check', { agentId, amount, allowed: can, workspace: options.workspace, timestamp: Date.now() });
            return {
                allowed: can,
                reason: can ? 'budget_available' : (memberGate ? 'workspace_pool_exceeded' : 'member_limit_exceeded'),
                layer: 'Escrow',
                available: member.available,
                poolAvailable: pool.available
            };
        }

        const budget = this.getBudget(agentId, options);
        const can = budget.available >= amount;

        // Emit budget check event
        _emit('escrow:budget:check', { agentId, amount, allowed: can, workspace: options.workspace || null, timestamp: Date.now() });

        return { allowed: can, reason: can ? 'budget_available' : 'budget_exceeded', layer: 'Escrow', available: budget.available };
    }

    recordSpend(agentId, amount, options = {}) {
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

        // (pass 83) Workspace draw debits TWO rows from ONE amount: the
        // member's tracking row and the org pool. The pool row is what makes
        // "org budgets" real — an org with 500 credits cannot fund 600 of
        // member spends no matter how many members there are.
        if (options && options.workspace) {
            if (!this._workspaceAdmitted(options.workspace)) {
                return { recorded: false, error: 'Unknown workspace: ' + options.workspace, code: 'E_UNKNOWN_WORKSPACE' };
            }
            const member = this.getBudget(agentId, { workspace: options.workspace, memberLimit: options.memberLimit, orgLimit: options.orgLimit });
            const pool = this.getBudget(null, { workspace: options.workspace, orgLimit: options.orgLimit });
            member.spent += amount;
            member.available = Math.max(0, member.limit - member.spent);
            pool.spent += amount;
            pool.available = Math.max(0, pool.limit - pool.spent);
            _emit('escrow:spend:recorded', { agentId, amount, totalSpent: member.spent, workspace: options.workspace, timestamp: Date.now() });
            if (this.options.persistBudgets) this.save();
            return { recorded: true, spent: member.spent, poolSpent: pool.spent };
        }

        const budget = this.getBudget(agentId, options);
        budget.spent += amount;
        budget.available = Math.max(0, budget.limit - budget.spent);

        // Emit spend recorded event
        _emit('escrow:spend:recorded', { agentId, amount, totalSpent: budget.spent, workspace: options.workspace || null, timestamp: Date.now() });

        // Auto-persist
        if (this.options.persistBudgets) {
            this.save();
        }

        return { recorded: true, spent: budget.spent };
    }

    refund(agentId, amount, options = {}) {
        // (pass 83) Workspace refunds restore member AND pool rows.
        if (options && options.workspace) {
            const member = this.getBudget(agentId, { workspace: options.workspace, memberLimit: options.memberLimit, orgLimit: options.orgLimit });
            const pool = this.getBudget(null, { workspace: options.workspace, orgLimit: options.orgLimit });
            member.spent = Math.max(0, member.spent - amount);
            member.available = Math.min(member.limit, member.available + amount);
            pool.spent = Math.max(0, pool.spent - amount);
            pool.available = Math.min(pool.limit, pool.available + amount);
            if (this.options.persistBudgets) this.save();
            return { refunded: true };
        }

        const budget = this.getBudget(agentId, options);
        budget.spent = Math.max(0, budget.spent - amount);
        budget.available = Math.min(budget.limit, budget.available + amount);

        // Auto-persist
        if (this.options.persistBudgets) {
            this.save();
        }

        return { refunded: true };
    }

    /**
     * (pass 83) Budget resolution with workspace scoping.
     *
     * options.workspace present:
     *   - agentId given -> member key ws:<ws>:<agent>; if the caller did not
     *     explicitly set a member limit (options.memberLimit) the member
     *     budget INHERITS the workspace's org-pool limit, then debits the
     *     org pool by the same amount (two rows, one pool).
     *   - agentId falsy -> the workspace's own org pool key ws:<ws>::org.
     * options.workspace absent -> legacy flat budget for agentId exactly as
     *   before (pre-83 ledgers and callers are untouched).
     */
    getBudget(agentId, options = {}) {
        if (!options || !options.workspace) {
            let budget = this._budgets.get(agentId);
            if (!budget) {
                const limit = this.options.perAgentBudget[agentId] || this.options.defaultBudget;
                budget = { spent: 0, limit, available: limit };
                this._budgets.set(agentId, budget);
            }
            return budget;
        }

        const ws = options.workspace;

        // Workspace pool (agentId falsy): plain budget at the org key.
        if (!agentId) {
            const orgKey = Escrow.WORKSPACE_KEY(ws, null);
            let orgBudget = this._budgets.get(orgKey);
            if (!orgBudget) {
                const limit = (options.orgLimit !== undefined) ? options.orgLimit : this.options.defaultBudget;
                orgBudget = { spent: 0, limit, available: limit, workspace: ws };
                this._budgets.set(orgKey, orgBudget);
            }
            return orgBudget;
        }

        // Member budget: explicit memberLimit wins, else inherit the org
        // pool's limit (the member row then tracks what the member drew).
        const memberKey = Escrow.WORKSPACE_KEY(ws, agentId);
        let member = this._budgets.get(memberKey);
        if (!member) {
            const orgBudget = this.getBudget(null, { workspace: ws, orgLimit: options.orgLimit });
            const limit = (options.memberLimit !== undefined)
                ? options.memberLimit
                : orgBudget.limit;
            member = { spent: 0, limit, available: limit, workspace: ws };
            this._budgets.set(memberKey, member);
            // Creating the member row with an inherited limit does NOT move
            // pool money; only the debit below does.
        }

        if (options.memberLimit !== undefined) {
            // Explicit member cap: re-derive availability from the limit.
            member.limit = options.memberLimit;
            member.available = Math.max(0, options.memberLimit - member.spent);
        }

        return member;
    }

    setBudgetLimit(agentId, limit, options = {}) {
        // pass 83: workspace form. setBudgetLimit(ws-pool-key semantics):
        // setBudgetLimit(null, 500, { workspace: 'org-acme' }) resizes the
        // org pool; member caps go through options.memberLimit on getBudget.
        if (options && options.workspace) {
            this.getBudget(agentId, {
                workspace: options.workspace,
                memberLimit: agentId ? limit : undefined,
                orgLimit: agentId ? undefined : limit
            });
            if (this.options.persistBudgets) this.save();
            return this;
        }

        const budget = this.getBudget(agentId);
        budget.limit = limit;
        budget.available = Math.max(0, limit - budget.spent);

        // Auto-persist
        if (this.options.persistBudgets) {
            this.save();
        }

        return this;
    }

    // Set budget (resets spent to 0 — use setBudgetLimit to preserve metrics)
    setBudget(agentId, budget, options = {}) {
        // pass 83: workspace form. agentId falsy sets the ORG POOL;
        // agentId truthy resets a MEMBER row to full limit.
        if (options && options.workspace) {
            const key = Escrow.WORKSPACE_KEY(options.workspace, agentId || null);
            this._budgets.set(key, { spent: 0, limit: budget, available: budget, workspace: options.workspace });
            if (this.options.persistBudgets) {
                this.save();
            }
            return;
        }

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
        if (this._deletedHolds) this._deletedHolds.delete(holdId); // re-hold cancels a pending deletion
        return { held: true, holdId };
    }

    release(holdId) {
        const existed = this._holds.delete(holdId);
        // (pass 101) record the deletion so the merge-save removes the disk row
        if (existed && this._deletedHolds) this._deletedHolds.add(holdId);
        return { released: existed };
    }

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
        // (pass 83) Workspace scoping flows in through context.workspace OR
        // the RLS subject (userCtx.workspace) — an agent carrying habitat
        // identity spends its org pool without any special wiring.
        const workspace = context.workspace || (userCtx && userCtx.workspace) || undefined;
        const results = {};

        // Emit execute:before event
        _emit('escrow:execute:before', { agentId, operation, workspace, timestamp: Date.now() });

        // Budget
        if (agentId && cost) results.budget = this.canSpend(agentId, cost, { workspace });

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

        // Note: RLS is handled by sandbox.rls in calling modules
        // Escrow provides budget/quota/circuit/legal gates

        const allowed = (results.budget?.allowed !== false) &&
                     (results.quota?.allowed !== false) &&
                     (results.circuit?.open !== true) &&
                     (results.legal?.allowed !== false);

        // Emit result
        _emit('escrow:execute:check', { allowed, timestamp: Date.now() });

        return { allowed, results };
    }

    afterExecute(context = {}) {
        const { agentId, operation, service, cost, success, userCtx } = context;
        const workspace = context.workspace || (userCtx && userCtx.workspace) || undefined;
        if (agentId && cost && success) this.recordSpend(agentId, cost, { workspace });
        if (agentId && operation) this.incrementQuota(agentId, operation);
        if (service) success ? this.recordSuccess(service) : this.recordFailure(service);

        // Emit execute:after event
        _emit('escrow:execute:after', { success, workspace, timestamp: Date.now() });

        return { recorded: true };
    }

    // ==================== STATUS ====================
    getLayerStatus() {
        return { name: 'Escrow', type: 'budget_holds', enabled: this.options.handlerEnabled,
            config: { defaultBudget: this.options.defaultBudget, defaultQuota: this.options.defaultQuota },
            state: { budgets: this._budgets.size, holds: this._holds.size, approvals: this._approvals.size, quotas: this._quotas.size } };
    }

    isOperationAllowed(op, ctx) { return this.beforeExecute(ctx); }

    // canWrite: Check if write operation is allowed (used by withSecurity)
    async canWrite(userCtx = {}, options = {}) {
        const ctx = {
            agentId: userCtx.agentId || 'default',
            operation: 'write',
            key: options.key || options.args?.key || 'unknown',
            ...options.args
        };
        return this.beforeExecute(ctx);
    }

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
    // pass 79 NOTE: budget helpers (canSpend, checkQuota, recordSpend via
    // market, beforeExecute...) stay FRESH-INSTANCE-BY-DESIGN: every budget
    // mutation auto-persists and every fresh instance reloads the store, so
    // budget state stays disk-coherent across callers (market.js's debit
    // path depends on this - see market-debit.test.js). hold/release stay
    // on the shared singleton (pass 77: holds must persist). Gate
    // allowlisting: each helper carries its HELPER-MODEL tag below.
    canSpend: (id, a, o) => new Escrow().canSpend(id, a, o),   // HELPER-MODEL: fresh = disk-coherent budgets (market debit path depends on it); o={workspace} for org pools (pass 83)
    // (pass 83 FIX) hold/release/reserveIsland/releaseIsland: were the lazy
    // SINGLETON + save. The singleton loads disk ONCE and lives forever, so
    // after any concurrent fresh-instance write (the market debit) its
    // stale rows won the pass-79 merge on its next save — stale pool row
    // clobbered the debit (ws:org-acme::org reverted to spent:0, observed
    // by the pass-83 probes). Merge-save only protects keys the writer's
    // snapshot DOESN'T have; a stale snapshot that HAS the key always wins.
    // Fresh instance + the existing explicit save() is disk-coherent by
    // construction (loads current disk, mutates, merges).
    hold: (id, c) => { const e = new Escrow(); const r = e.hold(id, c); e.save(); return r; },   // pass 83: fresh + persist (stale singleton clobbered concurrent writes); pass 77: holds must persist
    release: (id) => { const e = new Escrow(); const r = e.release(id); e.save(); return r; },
    checkHold: (id) => new Escrow().checkHold(id),   // HELPER-MODEL: fresh = disk-coherent holds
    requestApproval: (op, r) => new Escrow().requestApproval(op, r),   // HELPER-MODEL: fresh; persist handled by approve path
    approve: (id, by) => new Escrow().approve(id, by),   // HELPER-MODEL: fresh = disk-coherent approvals
    checkApproval: (id) => new Escrow().checkApproval(id),   // HELPER-MODEL: fresh = disk-coherent
    checkQuota: (id, op) => new Escrow().checkQuota(id, op),   // HELPER-MODEL: fresh = disk-coherent quotas
    isOpen: (svc) => new Escrow().isOpen(svc),   // HELPER-MODEL: circuit breaker is per-process; fresh is correct
    getSpendRate: (id) => getSpendRate(id),
    resetBudget: (id, b, o) => { const e = new Escrow(); e.setBudget(id, b, o); return e.getBudget(id, o); },   // HELPER-MODEL: fresh = disk-coherent; pass 77 fixed the phantom method; pass 83 workspace options
    beforeExecute: (ctx) => new Escrow().beforeExecute(ctx),   // HELPER-MODEL: fresh = disk-coherent gates
    afterExecute: (ctx) => new Escrow().afterExecute(ctx),   // HELPER-MODEL: fresh = disk-coherent spends
    getLayerStatus: () => ({ name: 'Escrow', type: 'budget_holds', enabled: true }),
    isOperationAllowed: (op, ctx) => ({ allowed: true }),
    getStatus: () => ({ enabled: true }),

    // Brain pipeline integration: execute middleware
    execute: async (ctx) => {
        const e = new Escrow();   // HELPER-MODEL: fresh = disk-coherent gates
        const result = await e.beforeExecute(ctx);
        if (!result.allowed) {
            throw new errors.VantError('Escrow denied', { code: errors.CODES.ESCROW_DENIED });
        }
        return result;
    },

    // NEW: Island escrow (budget protection)
    gatherState,
    restoreState,
    reserveIsland: (island, cost = 10) => { const e = new Escrow(); const r = e.hold(`island:${island}`, cost); e.save(); return r; },   // fresh + persist (pass 83 fix, see hold/release)
    releaseIsland: (island) => { const e = new Escrow(); const r = e.release(`island:${island}`); e.save(); return r; },
    checkIslandQuota: () => new Escrow().checkQuota('islands', 'create'),   // HELPER-MODEL: fresh = disk-coherent quotas

    // Multibrain
    getBrainEscrowStatus,
    setBrainQuota,

    // ==================== WORKSPACE BUDGETS (pass 83) ====================
    // Org-pool + member-cap primitives over habitat workspaces. Every
    // helper builds a FRESH instance: disk-coherent, same HELPER-MODEL
    // contract as the budget helpers above (mutate -> auto-persist -> read
    // merges what is currently on disk). No stale process-resident state.
    setWorkspaceBudget: (ws, amount) => { const e = new Escrow(); e.setBudget(null, amount, { workspace: ws }); return e.getBudget(null, { workspace: ws }); },   // HELPER-MODEL: fresh = disk-coherent budgets
    getWorkspacePool: (ws) => new Escrow().getBudget(null, { workspace: ws }),   // HELPER-MODEL: fresh = disk-coherent budgets
    listWorkspacePools: () => new Escrow().listWorkspacePools(),   // HELPER-MODEL: fresh = disk-coherent budgets
    setWorkspaceMemberLimit: (ws, agentId, limit) => { const e = new Escrow(); e.setBudgetLimit(agentId, limit, { workspace: ws }); return e.getBudget(agentId, { workspace: ws }); },   // HELPER-MODEL: fresh = disk-coherent budgets
    workspaceCanSpend: (ws, agentId, amount) => new Escrow().canSpend(agentId, amount, { workspace: ws }),   // HELPER-MODEL: fresh = disk-coherent budgets
    workspaceRecordSpend: (ws, agentId, amount) => new Escrow().recordSpend(agentId, amount, { workspace: ws }),   // HELPER-MODEL: fresh = disk-coherent budgets

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

// ==================== HORCRUX GATHER/RESTORE ====================
let _singleton = null;
function _getEscrow() {
    if (!_singleton) {
        _singleton = new Escrow();
    }
    return _singleton;
}
function gatherState() {
    const e = _getEscrow();
    return {
        budgets: Object.fromEntries(e._budgets),
        holds: Object.fromEntries(e._holds),
        approvals: Object.fromEntries(e._approvals),
        quotas: Object.fromEntries(e._quotas),
        count: e._budgets.size,
        gatheredAt: Date.now()
    };
}
function restoreState(data) {
    const e = _getEscrow();
    if (data) {
        if (data.budgets) e._budgets = new Map(Object.entries(data.budgets));
        if (data.holds) e._holds = new Map(Object.entries(data.holds));
        if (data.approvals) e._approvals = new Map(Object.entries(data.approvals));
        if (data.quotas) e._quotas = new Map(Object.entries(data.quotas));
        e._deletedHolds = new Set();
    }
    return { restored: true, budgets: e._budgets.size };
}
