/**
 * Sudo - AI-first permission system
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

const fs = require('fs');

// Task state
let _tasks = new Map();        // taskId -> { scopes, history, escalated }
let _callbacks = new Map();     // pending escalations
let _locked = false;

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
    if (_locked) throw new Error('ELOCKED');
    
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
 */
function can(taskId, scope) {
    const task = _tasks.get(taskId);
    if (!task) return false;
    
    // Check scope
    if (task.scopes.has(scope)) return true;
    if (task.scopes.has('admin')) return true;
    
    return false;
}

/**
 * Grant scope to task (auto-scale)
 */
function grant(taskId, scope) {
    if (_locked) throw new Error('ELOCKED');
    
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
    if (_locked) throw new Error('ELOCKED');
    
    const task = _tasks.get(taskId);
    if (!task) return { error: 'not found' };
    
    task.scopes.delete(scope);
    task.level = calculateLevel(task.scopes);
    _log(taskId, 'revoke', { scope });
    
    return { task: taskId, revoked: scope };
}

/**
 * Request escalation (least-ask)
 * - If allowed, grant immediately
 * - If callback provided, ask user
 */
async function escalate(taskId, scope, options = {}) {
    const task = _tasks.get(taskId);
    
    // Already have permission
    if (task && task.scopes.has(scope)) {
        return { granted: scope };
    }
    
    // Auto-grant if explicitly allowed
    if (options.autoGrant) {
        grant(taskId, scope);
        return { granted: scope };
    }
    
    // Need to ask
    const escalation = {
        task: taskId,
        scope,
        reason: options.reason || '',
        time: Date.now()
    };
    
    if (typeof options.callback === 'function') {
        // Call back with prompt
        const result = await new Promise(resolve => {
            options.callback(escalation, (approved) => {
                if (approved) {
                    grant(taskId, scope);
                    resolve({ granted: scope });
                } else {
                    resolve({ denied: scope });
                }
            });
        });
        
        task?.escalated.push(escalation);
        return result;
    }
    
    // Queue it
    task?.escalated.push(escalation);
    return { pending: scope };
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
    getLayerStatus: () => ({ name: 'Sudo', type: 'sudo', version: '0.8.6', enabled: true })
};