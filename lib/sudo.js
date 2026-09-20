/**
 * Sudo - AI-first permission system (v0.8.6)
 * WITH EVENT EMISSIONS - escalation emits globally
 *
 * NOT user-based. Task-based, context-aware, auto-scaling.
 *
 * SCOPES (like OAuth):
 * - read: brain/file read
 * - write: brain/file write
 * - exec: shell commands
 * - network: HTTP requests
 * - spawn: create agents
 *
 * CONCEPTS:
 * - Tasks: What agent is working on
 * - Auto-scale: Permissions grow with task
 * - Least-ask: Prompt for new permissions
 * - Context-aware: Track usage, suggest
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

const fs = require('fs');
const errors = require('./error');

// Task state
let _tasks = new Map();        // taskId -> { scopes, history, escalated }
let _callbacks = new Map();     // pending escalations
let _locked = false;

// ==================== ESCALATION WHITELIST (prd-sudo.md §3) ====================
// Per-service policies define what scopes a service may request, how long an
// escalation may live (maxTTL), whether it is auto-approved or needs a user
// callback, and whether expiring grants are revalidated or revoked.
const ESCALATION_WHITELIST = {
    boot: {
        allowedScopes: ['write', 'network', 'spawn', 'exec'],
        maxTTL: 300000,           // 5 minutes
        autoApprove: ['write', 'network'],
        requiresCallback: ['exec', 'spawn'],
        revalidate: true
    },
    network: {
        allowedScopes: ['network'],
        maxTTL: 600000,           // 10 minutes
        autoApprove: ['network'],
        requiresCallback: [],
        revalidate: true
    },
    storage: {
        allowedScopes: ['write'],
        maxTTL: 300000,           // 5 minutes
        autoApprove: ['write'],
        requiresCallback: [],
        revalidate: true
    },
    mcp: {
        allowedScopes: ['read', 'write', 'network', 'exec'],
        maxTTL: 180000,           // 3 minutes
        autoApprove: ['read'],
        requiresCallback: ['write', 'network', 'exec'],
        revalidate: false
    },
    agents: {
        allowedScopes: ['spawn', 'write'],
        maxTTL: 300000,           // 5 minutes
        autoApprove: [],
        requiresCallback: ['spawn', 'write'],
        revalidate: false
    },
    trust: {
        allowedScopes: ['write'],
        maxTTL: 300000,           // 5 minutes
        autoApprove: ['write'],
        requiresCallback: [],
        revalidate: false
    },
    default: {
        allowedScopes: [],
        maxTTL: 60000,            // 1 minute
        autoApprove: [],
        requiresCallback: [],
        revalidate: false
    }
};

// TTL-granted scopes: taskId -> Map(scope -> { service, expiresAt, auto, revalidations })
let _grants = new Map();

// Resolve the task context escalations should attach to: an explicit taskId
// wins; otherwise the boot task (sandbox.can checks that same task); otherwise
// 'default'.
function _resolveBootTaskId(explicit) {
    if (explicit) return explicit;
    try {
        const boot = require('./boot');
        const st = boot.getBootState && boot.getBootState();
        if (st && st.taskId) return st.taskId;
    } catch (e) { /* boot unavailable */ }
    return 'default';
}

// Revalidation loop handle
let _revalidateTimer = null;
// Revalidation cadence (P3: tunable via env, follows the VANT_* convention)
const REVALIDATE_INTERVAL_MS = parseInt(process.env.VANT_SUDO_REVALIDATE_INTERVAL_MS || '30000', 10);

// DEFAULT SCOPES (minimal)
const DEFAULT_SCOPES = new Set(['read']);

// ALL AVAILABLE SCOPES
const ALL_SCOPES = new Set([
    'read',      // brain/file read
    'write',     // brain/file write
    'exec',     // shell exec
    'network',  // HTTP requests
    'spawn',    // create agents
    'sudo',     // grant permissions
    'admin'     // full access
]);

/**
 * Create new task context
 */
function createTask(taskId, scopes = DEFAULT_SCOPES) {
    if (_locked) throw new errors.Error('ELOCKED', { code: errors.CODES.ELOCKED, retryable: true });

    const task = {
        id: taskId,
        scopes: new Set(typeof scopes === 'string' ? [scopes] : scopes),
        level: calculateLevel(scopes),
        history: [],       // what was used
        escalated: [],    // escalations made
        created: Date.now()
    };

    _tasks.set(taskId, task);
    _log(taskId, 'create', { scopes: Array.from(task.scopes) });

    return { task: taskId, scopes: Array.from(task.scopes) };
}

/**
 * Get task state
 */
function getTask(taskId) {
    return _tasks.get(taskId) || null;
}

/**
 * Check if task can do action
 * Honors static scopes, admin, and unexpired TTL escalation grants.
 */
function can(taskId, scope) {
    const task = _tasks.get(taskId);
    if (!task) return false;

    // Check scope
    if (task.scopes.has(scope)) return true;
    if (task.scopes.has('admin')) return true;

    // Check unexpired TTL escalation grants (prd-sudo.md §5)
    const grants = _grants.get(taskId);
    if (grants && grants.has(scope)) {
        const g = grants.get(scope);
        if (g.expiresAt > Date.now()) return true;
        // Expired - lazy revoke; the revalidation loop handles the rest
        grants.delete(scope);
    }

    return false;
}

/**
 * Grant scope to task (auto-scale)
 */
function grant(taskId, scope) {
    if (_locked) throw new errors.Error('ELOCKED', { code: errors.CODES.ELOCKED, retryable: true });

    let task = _tasks.get(taskId);
    if (!task) {
        task = { id: taskId, scopes: new Set(), history: [], escalated: [], created: Date.now() };
        _tasks.set(taskId, task);
    }

    task.scopes.add(scope);
    task.level = calculateLevel(task.scopes);
    _log(taskId, 'grant', { scope });

    // Process pending escalations
    if (_callbacks.has(taskId)) {
        const cb = _callbacks.get(taskId);
        cb(null, { granted: scope });
        _callbacks.delete(taskId);
    }

    return { task: taskId, granted: scope };
}

/**
 * Revoke scope from task
 */
function revoke(taskId, scope) {
    if (_locked) throw new errors.Error('ELOCKED', { code: errors.CODES.ELOCKED, retryable: true });

    const task = _tasks.get(taskId);
    if (!task) return { error: 'not found' };

    task.scopes.delete(scope);
    task.level = calculateLevel(task.scopes);
    _log(taskId, 'revoke', { scope });

    return { task: taskId, revoked: scope };
}

/**
 * Request escalation (prd-sudo.md §4/§5)
 *
 * Flow: whitelist check → auto-approve | callback | pending
 * All grants are time-bounded (TTL capped by policy maxTTL).
 *
 * @param {string} taskId - Task requesting escalation
 * @param {string} scope - Scope requested
 * @param {Object} options - { service, reason, ttl, autoGrant, callback }
 * @returns {Object} { granted, expiresAt, auto? } | { pending } | { denied, reason }
 */
async function escalate(taskId, scope, options = {}) {
    const service = options.service || 'default';
    const policy = ESCALATION_WHITELIST[service] || ESCALATION_WHITELIST.default;
    // Resolve to the process-wide boot task unless explicitly named, so grants
    // line up with what sandbox.can(agentId) checks (prd-sudo.md: can(cap) →
    // sudo.can()). Falls back to 'default' when boot hasn't run.
    taskId = options.taskId || _resolveBootTaskId(taskId);
    const task = _tasks.get(taskId);

    // Already have permission (static scope or unexpired grant)
    if (can(taskId, scope)) {
        return { granted: scope };
    }

    // Force grant (admin only) - bypasses whitelist, no TTL
    if (options.autoGrant) {
        grant(taskId, scope);
        return { granted: scope };
    }

    _emit('sudo:escalation_requested', {
        taskId, scope, service,
        ttl: options.ttl || policy.maxTTL,
        policy: policy.allowedScopes
    });

    // Whitelist: service must be allowed to request this scope
    if (!policy.allowedScopes.includes(scope)) {
        _emit('sudo:escalation_denied', { taskId, scope, service, reason: 'not_in_whitelist' });
        return { denied: scope, reason: 'not_in_whitelist' };
    }

    // TTL capped by policy
    const ttl = Math.min(options.ttl || policy.maxTTL, policy.maxTTL);
    const expiresAt = Date.now() + ttl;

    const finishGrant = (auto) => {
        // Record ONLY a TTL grant - not a static scope - so expiry is exact
        // (no 30s revoke window) and can() is purely time-bounded.
        if (!_grants.has(taskId)) _grants.set(taskId, new Map());
        _grants.get(taskId).set(scope, { service, expiresAt, auto, revalidations: 0 });
        _emit('sudo:escalation_granted', { taskId, scope, service, ttl, auto, expiresAt });
        return auto ? { granted: scope, expiresAt, auto: true } : { granted: scope, expiresAt };
    };

    // Auto-approve path
    if (policy.autoApprove.includes(scope)) {
        return finishGrant(true);
    }

    // Callback path
    if (policy.requiresCallback.includes(scope)) {
        if (typeof options.callback === 'function') {
            const approved = await new Promise(resolve => {
                options.callback(
                    { task: taskId, scope, service, reason: options.reason || '', time: Date.now() },
                    resolve
                );
            });
            if (approved) {
                return finishGrant(false);
            }
            _emit('sudo:escalation_denied', { taskId, scope, service, reason: 'callback_denied' });
            return { denied: scope, reason: 'callback_denied' };
        }
        _emit('sudo:escalation_denied', { taskId, scope, service, reason: 'callback_required' });
        return { denied: scope, reason: 'callback_required' };
    }

    // Queue pending (neither auto-approve nor callback-required)
    if (task) {
        task.escalated.push({ task: taskId, scope, service, reason: options.reason || '', time: Date.now() });
    }
    return { pending: scope, expiresAt };
}

/**
 * Manual revalidation check - extend an unexpired/expired grant if the
 * service policy allows revalidation (prd-sudo.md §4)
 */
function revalidateEscalation(taskId, scope) {
    const grants = _grants.get(taskId);
    if (!grants || !grants.has(scope)) return { revalidated: false, reason: 'no_grant' };

    const g = grants.get(scope);
    const policy = ESCALATION_WHITELIST[g.service] || ESCALATION_WHITELIST.default;
    if (!policy.revalidate) return { revalidated: false, reason: 'not_revalidatable' };

    g.expiresAt = Date.now() + policy.maxTTL;
    g.revalidations++;
    _emit('sudo:escalation_revalidated', {
        taskId, scope, service: g.service,
        newExpiresAt: g.expiresAt, revalidationCount: g.revalidations
    });
    return { revalidated: true, expiresAt: g.expiresAt };
}

/**
 * Background revalidation loop (default 30s, prd-sudo.md §5):
 * - revalidate: true services → extend expiresAt
 * - revalidate: false services → revoke the grant (and the static scope it added)
 */
function startRevalidationLoop(intervalMs = REVALIDATE_INTERVAL_MS) {
    if (_revalidateTimer) return { running: true, intervalMs };

    // v0.9.0-axolotl: registered with boot's timer lifecycle (was bare setInterval)
    const _bootMod = (() => { try { return require('./boot'); } catch (e) { return null; } })();
    const _revalidateTick = () => {
        const now = Date.now();
        for (const [taskId, grants] of _grants) {
            for (const [scope, g] of grants) {
                if (g.expiresAt > now) continue;

                const policy = ESCALATION_WHITELIST[g.service] || ESCALATION_WHITELIST.default;
                if (g.auto && policy.revalidate) {
                    g.expiresAt = now + policy.maxTTL;
                    g.revalidations++;
                    _emit('sudo:escalation_revalidated', {
                        taskId, scope, service: g.service,
                        newExpiresAt: g.expiresAt, revalidationCount: g.revalidations
                    });
                } else {
                    grants.delete(scope);
                    _emit('sudo:escalation_expired', { taskId, scope, service: g.service });
                }
            }
        }
    };
    if (_bootMod && _bootMod.registerTimer) {
        _bootMod.registerTimer('sudo.revalidate', _revalidateTick, intervalMs, { unref: true });
        _revalidateTimer = true; // handled by boot registry
    } else {
        _revalidateTimer = setInterval(_revalidateTick, intervalMs);
        // Never keep the process alive just for the loop
        if (_revalidateTimer.unref) _revalidateTimer.unref();
    }
    return { running: true, intervalMs };
}

function stopRevalidationLoop() {
    if (_revalidateTimer) {
        // v0.9.0-axolotl: timer lives in boot's registry when available
        const _bootMod = (() => { try { return require('./boot'); } catch (e) { return null; } })();
        if (_bootMod && _bootMod.unregisterTimer) _bootMod.unregisterTimer('sudo.revalidate');
        else if (typeof _revalidateTimer === 'object' && _revalidateTimer) clearInterval(_revalidateTimer);
        _revalidateTimer = null;
    }
    return { running: false };
}

/**
 * Get TTL grants for a task (inspection/testing)
 */
function getGrants(taskId) {
    const grants = _grants.get(taskId);
    if (!grants) return {};
    const out = {};
    for (const [scope, g] of grants) out[scope] = { ...g };
    return out;
}

/**
 * Calculate permission level (0-10)
 */
function calculateLevel(scopes) {
    let level = 0;
    const scopeArray = scopes instanceof Set ? Array.from(scopes) : scopes;

    if (scopeArray.includes('admin')) level = 10;
    else if (scopeArray.includes('sudo')) level = 8;
    else if (scopeArray.includes('spawn')) level = 7;
    else if (scopeArray.includes('exec')) level = 6;
    else if (scopeArray.includes('network')) level = 5;
    else if (scopeArray.includes('write')) level = 3;
    else if (scopeArray.includes('read')) level = 1;

    return level;
}

/**
 * Get available scopes
 */
function getScopes() {
    return Array.from(ALL_SCOPES);
}

/**
 * List tasks
 */
function listTasks() {
    return { tasks: Array.from(_tasks.keys()).map(id => ({
        id,
        scopes: Array.from(_tasks.get(id).scopes),
        level: _tasks.get(id).level,
        history: _tasks.get(id).history.length
    })) };
}

/**
 * Log action
 */
function _log(taskId, action, data) {
    const task = _tasks.get(taskId);
    if (task) {
        task.history.push({ action, data, time: Date.now() });
        if (task.history.length > 100) task.history.shift();
    }
}

/**
 * Track usage (context-aware)
 */
function used(taskId, action) {
    const task = _tasks.get(taskId);
    if (task) {
        task.history.push({ action, time: Date.now() });
    }
}

/**
 * Suggest based on history
 */
function suggest(taskId) {
    const task = _tasks.get(taskId);
    if (!task) return { suggestions: [] };

    const history = task.history;
    const counts = {};

    history.forEach(h => {
        const action = h.action || h.data?.scope || 'unknown';
        counts[action] = (counts[action] || 0) + 1;
    });

    // Suggest scopes based on usage
    const suggestions = [];
    if (counts['shell.exec'] > 5) suggestions.push({ scope: 'exec', reason: 'frequently executes shell' });
    if (counts['network.fetch'] > 3) suggestions.push({ scope: 'network', reason: 'frequently makes HTTP requests' });
    if (counts['brain.write'] > 2) suggestions.push({ scope: 'write', reason: 'frequently writes to brain' });

    return { task: taskId, suggestions };
}

/**
 * Lock sudo
 */
function lock() {
    _locked = true;
    return { locked: true };
}

/**
 * Unlock sudo
 */
function unlock() {
    _locked = false;
    return { unlocked: true };
}

/**
 * Is locked
 */
function isLocked() {
    return _locked;
}

/**
 * Delete task
 */
function deleteTask(taskId) {
    _tasks.delete(taskId);
    _callbacks.delete(taskId);
    return { deleted: taskId };
}

/**
 * Clear all
 */
function reset() {
    _tasks = new Map();
    _grants = new Map();
    _callbacks = new Map();
    _locked = false;
    return { reset: true };
}

module.exports = {
    createTask,
    getTask,
    can,
    grant,
    revoke,
    escalate,
    calculateLevel,
    getScopes,
    listTasks,
    used,
    suggest,
    lock,
    unlock,
    isLocked,
    deleteTask,
    reset,
    // Whitelist-governed escalation (prd-sudo.md)
    ESCALATION_WHITELIST,
    revalidateEscalation,
    startRevalidationLoop,
    stopRevalidationLoop,
    getGrants,
    getLayerStatus: () => ({ name: 'Sudo', type: 'sudo', version: require('./version'), enabled: true }),

    // Multibrain
    getBrainSudoConfig,
    setBrainSudoConfig,
    getStackSudoConfigs
};

// ==================== MULTIBRAIN SUPPORT ====================

const _brainSudoConfigs = {};

function getBrainSudoConfig() {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    return _brainSudoConfigs[brainName] || { timeout: 300000 };
}

function setBrainSudoConfig(config) {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    _brainSudoConfigs[brainName] = config;
    return true;
}

function getStackSudoConfigs() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = { source: 'stack', brains: stack, byBrain: {} };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            results.byBrain[brainName] = getBrainSudoConfig();
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }
    return results;
}
