/**
 * Vant Agents (v0.8.6)
 * WITH EVENT EMISSIONS - agent lifecycle emit globally
 * Multi-agent runtime for Vant
 * 
 * What other agents need: spawn, delegate, fork, join, emit
 * Protected by sandbox for security
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

const runtime = require('./vant');
const crypto = require('crypto');
const Encrypt = require('./encrypt');
const vaf = require('./vaf');
const sudo = require('./sudo');
const stream = require('./stream');
const path = require('path');
const fs = require('fs');

// Agent persistence
const AGENT_STORE = '.agent_tmp/agents.json';

// Lazy-load config for MAX_AGENT_AGE
let _config = null;
function _getConfig() {
    if (!_config) {
        try { _config = require('./config'); } catch (e) {}
    }
    return _config;
}

function _getMaxAge() {
    const cfg = _getConfig();
    if (cfg && cfg.get) {
        return cfg.get('agents.maxAge', 24 * 60 * 60 * 1000); // Default 24h
    }
    return 24 * 60 * 60 * 1000; // Fallback 24h
}

// ==================== QOS RATE LIMITING ====================
const _spawnRateLimit = new Map();
const _delegateDepth = new Map();  // Track delegation chain depth

// Configurable delegate depth limit
function _getMaxDelegateDepth() {
    const cfg = _getConfig();
    return cfg?.get ? cfg.get('agents.maxDelegateDepth', 10) : 10;
}
const MAX_DELEGATE_DEPTH = _getMaxDelegateDepth;

/**
 * Check delegation depth to prevent infinite delegation loops
 * @param {string} agentId - Current agent
 * @returns {object} - { allowed: boolean, depth: number }
 */
function _checkDelegateDepth(agentId) {
    const maxDepth = MAX_DELEGATE_DEPTH();
    const currentDepth = _delegateDepth.get(agentId) || 0;
    if (currentDepth >= maxDepth) {
        _emit('agent:delegate:blocked', { agentId, depth: currentDepth, max: maxDepth });
        return { allowed: false, depth: currentDepth, reason: 'max_depth_exceeded' };
    }
    _delegateDepth.set(agentId, currentDepth + 1);
    return { allowed: true, depth: currentDepth + 1 };
}

/**
 * Release delegation depth (call after delegate completes)
 */
function _releaseDelegateDepth(agentId) {
    const currentDepth = _delegateDepth.get(agentId) || 1;
    _delegateDepth.set(agentId, Math.max(0, currentDepth - 1));
}

/**
 * Check rate limit for spawn operations
 * @param {string} identifier - Agent or org ID
 * @param {number} window - Time window in ms
 * @param {number} max - Max spawns per window
 */
function _checkSpawnRate(identifier, window = 60000, max = 10) {
    const now = Date.now();
    if (!_spawnRateLimit.has(identifier)) {
        _spawnRateLimit.set(identifier, { count: 1, reset: now + window });
        return true;
    }
    
    const rl = _spawnRateLimit.get(identifier);
    
    // Reset if window expired
    if (now > rl.reset) {
        _spawnRateLimit.set(identifier, { count: 1, reset: now + window });
        return true;
    }
    
    // Check limit
    if (rl.count >= max) {
        _emit('agent:spawn:rateLimited', { identifier, count: rl.count, max, timestamp: now });
        return false;
    }
    
    rl.count++;
    return true;
}

// Cleanup old agents on load
async function _cleanupOldAgents() {
    const now = Date.now();
    const maxAge = _getMaxAge();
    let cleaned = 0;
    for (const [id, agent] of _agents) {
        if (now - agent.created > maxAge && agent.state === 'idle') {
            _agents.delete(id);
            cleaned++;
        }
    }
    if (cleaned > 0) {
        console.log(`[agents] Cleaned up ${cleaned} stale agents`);
        await _saveAgents(_agents);
    }
}

function _ensureStoreDir() {
    const dir = path.dirname(AGENT_STORE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function _saveAgents(agents) {
    _ensureStoreDir();
    fs.writeFileSync(AGENT_STORE, JSON.stringify(Array.from(agents)));
}

async function _loadAgents() {
    _ensureStoreDir();
    if (fs.existsSync(AGENT_STORE)) {
        try {
            return new Map(JSON.parse(fs.readFileSync(AGENT_STORE)));
        } catch (e) { console.warn('[agents] Agent store corrupted, resetting:', e.message); }
    }
    return new Map();
}

// Hydrate agents on load
(async () => {
    const stored = await _loadAgents();
    for (const [id, agent] of stored) {
        _agents.set(id, agent);
    }
    // Cleanup old agents after load
    await _cleanupOldAgents();
})();

// Lazy load sandbox for capability check
let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) {
        try { _sandbox = require('./sandbox'); } catch (e) {}
    }
    return _sandbox;
}
// Lazy-load RLS for per-record ACL
let _rls = null;


function _checkRead(userCtx, resource) {
    const sandbox = _getSandbox();
    if (sandbox && sandbox.can && !sandbox.can('canRead')) {
        throw new Error('ECAP: read not allowed');
    }
    if (userCtx && sandbox && sandbox._rls) {
        sandbox._rls.checkRead(userCtx, resource, 'read');
    }
}

function _getRLS() {
    if (!_rls) {
        try { _rls = require('./rls'); } catch (e) {}
    }
    return _rls;
}

// ==================== SECURITY ====================

/**
 * Run security chain for agent tasks
 */
async function _runAgentSecurityChain(task, userCtx = {}) {
    const isWrite = task.operation === 'act' || (task.mcp?.tool && 
        (task.mcp.tool.startsWith('brain_save') || task.mcp.tool.startsWith('storage_write')));
    
    // 1. VAF: Input validation
    try {
        const taskStr = JSON.stringify(task);
        const vafResult = vaf.check(taskStr, { mode: isWrite ? 'strict' : 'read' });
        if (vafResult && vafResult.blocked) {
            _emit('agent:vaf:blocked', { task: task.operation || task.mcp?.tool, timestamp: Date.now() });
            throw new Error('Input validation failed: ' + (vafResult.reason || 'blocked'));
        }
    } catch (e) {
        if (e.message.includes('validation failed') || e.message.includes('blocked')) throw e;
    }
    
    // 2. QoS: Rate limiting
    let qosCleanup = null;
    try {
        const qos = require('./qos');
        if (qos && qos.canProceed) {
            if (!qos.canProceed()) {
                _emit('agent:qos:throttled', { timestamp: Date.now() });
                throw new Error('Rate limit exceeded - circuit breaker open');
            }
            qos.incrementActive();
            qosCleanup = () => qos.decrementActive();
        }
    } catch (e) {
        if (e.message.includes('Rate limit')) throw e;
    }
    
    // 3. Escrow: RLS for write operations
    if (isWrite) {
        try {
            const escrow = require('./escrow');
            if (escrow && escrow.create) {
                const escrowInstance = escrow.create({ habitat: userCtx.habitat || 'default' });
                if (escrowInstance && escrowInstance.canWrite) {
                    const canWrite = await escrowInstance.canWrite(userCtx, { task });
                    if (!canWrite) {
                        _emit('agent:escrow:denied', { task: task.operation || task.mcp?.tool, timestamp: Date.now() });
                        throw new Error('Write not permitted by escrow policy');
                    }
                }
            }
        } catch (e) {
            if (qosCleanup) qosCleanup();
            if (e.message.includes('not permitted')) throw e;
        }
    }
    
    return qosCleanup;
}

// Active agents
const _agents = new Map();
const _messages = new Map();
let _currentAgentId = null;

// Get/Set current agent
function getCurrentAgentId() {
    return _currentAgentId || 'default';
}

function setCurrentAgentId(id) {
    _currentAgentId = id;
    // Also sync to shell/tmp
    try { require('./shell').setTaskId(id); } catch (e) {}
    try { require('./tmp').setTaskId(id); } catch (e) {}
    return { agentId: _currentAgentId };
}

/**
 * Spawn a new agent (protected by sandbox.canSpawn)
 */
function _getMaxAgents() {
    const cfg = _getConfig();
    if (cfg && cfg.get) {
        // Check both keys for backwards compatibility
        return cfg.get('agents.max', cfg.get('agents.maxAgents', 200));
    }
    return 200;
}

function spawn(options = {}) {
    const maxAgents = _getMaxAgents();
    
    // Check agent quota
    if (_agents.size >= maxAgents) {
        return { error: 'Agent quota reached (max ' + maxAgents + ')' };
    }
    
    // QoS: Check spawn rate limit (default: 10 spawns per minute per org/team)
    const rateLimitOrg = options.org || 'default';
    const cfg = _getConfig();
    const maxSpawns = (cfg && cfg.get) ? cfg.get('agents.spawnRateLimit', 10) : 10;
    if (!_checkSpawnRate(rateLimitOrg, 60000, maxSpawns)) {
        return { error: 'Spawn rate limit exceeded (max ' + maxSpawns + '/min)', code: 'E_RATE_LIMIT' };
    }

    // Check sandbox capability gate
    const sb = _getSandbox();
    if (sb && typeof sb.can === 'function' && !sb.can('canSpawn')) {
        return { error: 'Sandbox: capability not allowed - canSpawn is false' };
    }
    
    const { name, role = 'Agent', type = 'default' } = options;
    const id = 'agent_' + Date.now().toString(36) + Encrypt.key(16);
    
    // Create agent state
    const agent = {
        id,
        name: name || role + '_' + id.slice(-4),
        role,
        type,
        state: 'idle',
        created: Date.now(),
        parent: options.parent || null,
        children: [],
        team: options.team || null,     // Team assignment
        roleId: options.roleId || null, // Role within team
        mcp: (options.mcp) ? {
            execute: require('./mcp').execute,
            listTools: require('./mcp').listTools,
            call: require('./mcp').call
        } : null
    };
    
    // Initialize (fire-and-forget)
    runtime.init({
        id,
        name: agent.name,
        role: agent.role
    }).catch(e => console.warn("[agents] Init failed:", e.message));

    // Wire to brain: track attention + synapse
    try {
        const Brain = require('./brain');
        Brain.attend(agent.name, 1.0);
        if (options.parent) {
            Brain.fireSynapse(options.parent, agent.name);
        }
    } catch (e) { console.warn("[agents] Agent setup failed:", e.message); }

    // Assign to team if specified (sync now!)
    if (options.team) {
        try {
            const teams = require('./teams');
            teams.assign(id, { team: options.team, role: options.roleId });
        } catch (e) { console.warn("[agents] Team assignment failed:", e.message); }
    }
    
    _agents.set(id, agent);
    
    // Persist to disk (fire-and-forget)
    _saveAgents(_agents).catch(e => console.warn("[agents] Save failed:", e.message));
    
    // EVENT: spawned
    _emit('agent:spawned', { id, name: agent.name, role: agent.role, timestamp: Date.now() });
    
    return { id, name: agent.name, role };
}

/**
 * Delegate task to agent
 */
async function delegate(agentId, task) {
    const agent = _agents.get(agentId);
    if (!agent) {
        return { error: 'Agent not found: ' + agentId };
    }
    
    // SECURITY: Check delegation depth to prevent infinite loops
    const depthCheck = _checkDelegateDepth(agentId);
    if (!depthCheck.allowed) {
        return { error: 'Delegation depth exceeded', code: 'E_DELEGATE_DEPTH', depth: depthCheck.depth, max: MAX_DELEGATE_DEPTH };
    }
    
    // SECURITY: Check team permissions if teams enabled
    if (agent.team) {
        try {
            const teams = require('./teams');
            // Map operation to permission
            const permMap = {
                'brainSave': 'canWrite',
                'brainLoad': 'canRead',
                'brainDelete': 'canDelete',
                'execute': 'canExecute',
                'deploy': 'canDeploy'
            };
            const requiredPerm = permMap[task.operation];
            if (requiredPerm && !teams.can(agentId, requiredPerm)) {
                _releaseDelegateDepth(agentId);
                return { error: 'Permission denied', code: 'E_TEAM_PERM', required: requiredPerm };
            }
        } catch (e) { /* teams not available */ }
    }
    
    agent.state = 'working';
    agent.task = task;
    
    // SECURITY: Run through security chain
    const qosCleanup = await _runAgentSecurityChain(task);
    
    // EVENT: delegating
    _emit('agent:delegating', { agentId, task: task.operation || 'mcp', timestamp: Date.now() });
    
    // Execute in agent context (support MCP delegation)
    let result;
    try {
        if (task.mcp?.tool && agent.mcp) {
            result = await agent.mcp.execute(task.mcp.tool, task.mcp.args || {});
        } else {
            result = await runtime.act(task.operation, task.options);
        }
    } finally {
        // Release delegation depth
        _releaseDelegateDepth(agentId);
        // QoS cleanup
        if (qosCleanup) qosCleanup();
    }
    
    agent.state = 'idle';
    
    // EVENT: delegated
    _emit('agent:delegated', { agentId, task: task.operation || 'mcp', timestamp: Date.now() });
    
    return { agentId, result };
}

/**
 * Delegate task to async queue (non-blocking)
 */
async function delegateAsync(agentId, task) {
    const agent = _agents.get(agentId);
    if (!agent) {
        return { error: 'Agent not found: ' + agentId };
    }
    
    // Enqueue to agent's stream
    const result = await stream.enqueue(agentId, {
        ...task,
        delegatedBy: agent?.name || 'unknown'
    });
    
    // Update agent state
    agent.state = 'delegated';
    
    return { 
        agentId, 
        workId: result.id,
        status: 'queued' 
    };
}

/**
 * Poll agent's queue for work
 */
async function pollWork(agentId) {
    const work = await stream.poll(agentId);
    if (work) {
        const agent = _agents.get(agentId);
        if (agent) {
            agent.state = 'working';
            agent.task = work.task;
        }
        return work;
    }
    // Return error object instead of undefined
    return { error: 'No work in queue', code: 'E_NO_WORK' };
}

/**
 * Complete delegated work
 */
async function completeWork(workId, result) {
    const workItem = await stream.complete(workId, result);
    
    // Update agent state
    if (workItem?.stream) {
        const agent = _agents.get(workItem.stream);
        if (agent) {
            agent.state = 'idle';
            agent.task = null;
        }
    }
    
    return workItem;
}

/**
 * Approve work result (delegator sign-off)
 * @param {string} workId - Work ID to approve
 * @param {object} feedback - Optional feedback
 */
async function approve(workId, feedback = {}) {
    const workItem = await stream.complete(workId, { 
        status: 'approved',
        approvedAt: Date.now(),
        approvedBy: runtime.getState().id,
        feedback
    });
    
    // Mark agent as idle again
    if (workItem?.stream) {
        const agent = _agents.get(workItem.stream);
        if (agent) {
            agent.state = 'approved';
        }
    }
    
    return { approved: true, workId, feedback };
}

/**
 * Reject work result (delegator sign-off)
 * @param {string} workId - Work ID to reject
 * @param {string} reason - Rejection reason
 */
async function reject(workId, reason) {
    const workItem = await stream.complete(workId, { 
        status: 'rejected',
        rejectedAt: Date.now(),
        rejectedBy: runtime.getState().id,
        reason
    });
    
    // Return to working state
    if (workItem?.stream) {
        const agent = _agents.get(workItem.stream);
        if (agent) {
            agent.state = 'rejected';
            agent.feedback = reason;
        }
    }
    
    return { rejected: true, workId, reason };
}

/**
 * Sign-off on work (delegator approval)
 * @param {string} workId - Work ID
 * @param {boolean} approved - true=approve, false=reject
 * @param {object} notes - Notes/feedback
 */
async function signOff(workId, approved = true, notes = {}) {
    if (approved) {
        return approve(workId, notes);
    } else {
        return reject(workId, notes.reason || 'Rejected by delegator');
    }
}

/**
 * Pause agent work (hibernate)
 */
async function pause(agentId) {
    const agent = _agents.get(agentId);
    if (!agent) return { error: 'Agent not found' };
    
    agent.state = 'paused';
    agent.pausedAt = Date.now();
    return { paused: true, agentId };
}

/**
 * Resume paused work
 */
async function resume(agentId) {
    const agent = _agents.get(agentId);
    if (!agent) return { error: 'Agent not found' };
    if (agent.state !== 'paused') return { error: 'Agent not paused' };
    
    agent.state = 'idle';
    agent.resumedAt = Date.now();
    return { resumed: true, agentId };
}

/**
 * Set deadline on work (auto-timeout)
 */
function setDeadline(workId, ms, onTimeout = 'fail') {
    const workItem = _messages.get(workId);
    if (!workItem) return { error: 'Work not found' };
    
    const deadline = Date.now() + ms;
    workItem.deadline = deadline;
    workItem.onTimeout = onTimeout;
    
    // Schedule auto-handle
    setTimeout(async () => {
        if (onTimeout === 'fail') {
            await reject(workId, 'Deadline exceeded');
        } else if (onTimeout === 'escalate') {
            await escalate(workId, 'deadline exceeded');
        }
    }, ms);
    
    return { deadline, workId };
}

/**
 * Retry failed work
 */
async function retry(workId, options = {}) {
    const { maxRetries = 3, delay = 1000 } = options;
    
    const workItem = _messages.get(workId);
    if (!workItem) return { error: 'Work not found' };
    
    const retries = (workItem.retries || 0) + 1;
    if (retries > maxRetries) {
        return { error: 'Max retries exceeded' };
    }
    
    workItem.retries = retries;
    workItem.retryAt = Date.now() + delay;
    
    // Queue retry
    setTimeout(async () => {
        workItem.state = 'retrying';
        // Re-delegate to same agent
        if (workItem.agentId) {
            await delegate(workItem.agentId, workItem.task);
        }
    }, delay);
    
    return { retried: true, workId, retries, maxRetries };
}

/**
 * Escalate to human (notify)
 */
async function escalate(workId, reason) {
    const workItem = _messages.get(workId);
    if (!workItem) return { error: 'Work not found' };
    
    workItem.escalated = true;
    workItem.escalatedAt = Date.now();
    workItem.escalationReason = reason;
    
    // Notify via msg system
    try {
        const msg = require('./msg');
        msg.send('@human', {
            type: 'escalation',
            workId,
            reason,
            agentId: runtime.getState().id,
            timestamp: Date.now()
        });
    } catch (e) {
        console.log('[agents] Escalation notification failed:', e.message);
    }
    
    return { escalated: true, workId, reason };
}

/**
 * Set priority on work (1-10, 10=highest)
 */
function setPriority(workId, priority = 5) {
    const workItem = _messages.get(workId);
    if (!workItem) return { error: 'Work not found' };
    
    workItem.priority = Math.min(10, Math.max(1, priority));
    return { priority: workItem.priority, workId };
}

/**
 * Get agent metrics
 */
function getMetrics() {
    const stats = {
        total: _agents.size,
        states: {},
        avgLifespan: 0,
        completed: 0,
        failed: 0
    };
    
    for (const [id, agent] of _agents) {
        stats.states[agent.state] = (stats.states[agent.state] || 0) + 1;
        
        if (agent.completed) stats.completed++;
        if (agent.failed) stats.failed++;
        
        if (agent.created && agent.completed) {
            stats.avgLifespan += (agent.completed - agent.created);
        }
    }
    
    if (stats.completed > 0) {
        stats.avgLifespan /= stats.completed;
    }
    
    return stats;
}

/**
 * Fork self for parallel work
 */
function fork(options = {}) {
    const currentState = runtime.getState();
    return spawn({
        ...options,
        name: currentState.name + '_fork',
        parent: currentState.id
    });
}

/**
 * Join shared conversation
 */
function join(conversationId, options = {}) {
    const key = 'conv:' + conversationId;
    const messages = _messages.get(key) || [];
    
    return {
        conversationId,
        messages,
        post: (content, author) => {
            messages.push({ content, author, timestamp: Date.now() });
            _messages.set(key, messages);
        }
    };
}

/**
 * Emit signal to other agents
 */
function emit(event, data = {}) {
    const eventKey = 'event:' + event;
    const listeners = _messages.get(eventKey) || [];
    
    for (const listener of listeners) {
        try {
            listener(data);
        } catch (e) {
            audit.error('Event error:', e.message);
        }
    }
}

/**
 * On event
 */
function on(event, callback) {
    const eventKey = 'event:' + event;
    const listeners = _messages.get(eventKey) || [];
    listeners.push(callback);
    _messages.set(eventKey, listeners);
}

/**
 * Get all agents
 */
async function list(userCtx) {
    if (userCtx) _checkRead(userCtx, '_agents:list');

    // Reload from storage
    const stored = await _loadAgents();
    for (const [id, agent] of stored) {
        if (!_agents.has(id)) _agents.set(id, agent);
    }
    return Array.from(_agents.values()).map(a => ({
        id: a.id,
        name: a.name,
        role: a.role,
        state: a.state,
        mcp: !!a.mcp
    }));
}

/**
 * Get agent by ID
 */
function get(agentId) {
    return _agents.get(agentId);
}

/**
 * Prune old agents (manual cleanup)
 */
async function prune(options = {}) {
    const maxAge = options.maxAge || _getMaxAge();
    const now = Date.now();
    let pruned = 0;
    for (const [id, agent] of _agents) {
        if (now - agent.created > maxAge && agent.state === 'idle') {
            _agents.delete(id);
            pruned++;
        }
    }
    if (pruned > 0) {
        await _saveAgents(_agents);
        _emit('agent:pruned', { count: pruned, timestamp: Date.now() });
    }
    return { pruned };
}

/**
 * Terminate agent
 */
const kill = terminate;

async function terminate(agentId) {
    const result = _agents.delete(agentId);
    if (result) await _saveAgents(_agents);
    return result;
}

// Module-level cache
let _protoCache = new Map();
let _protoTTL = 30000;
function _initCache() {
    try {
        const brain = require('./brain');
        brain.on('afterSave', () => _protoCache.clear());
        brain.on('brainChanged', () => _protoCache.clear());
    } catch(e) { console.warn("[agents] Cache init failed:", e.message); }
}

module.exports = {
    // Core
    spawn,
    delegate,
    delegateAsync,
    
    // Delegation depth tracking (internal)
    _checkDelegateDepth,
    _releaseDelegateDepth,
    MAX_DELEGATE_DEPTH,
    pollWork,
    completeWork,
    approve,
    reject,
    signOff,
    pause,
    resume,
    setDeadline,
    retry,
    escalate,
    setPriority,
    getMetrics,
    fork,
    join,
    emit,
    on,
    list,
    get,
    terminate,
    prune,
    kill,
    
    // Configurable limits
    getMaxAgents: _getMaxAgents,
    
    // Agent context
    getCurrentAgentId,
    setCurrentAgentId,
    
    Agents: class {
        constructor(options = {}) {
            this._options = options;
        }
        async spawn(options) {
    // Sudo: spawn?
    if (!sudo.can(getCurrentAgentId(), 'spawn')) {
        throw new Error('EPERM: spawn not allowed by sudo');
    }


            return spawn(options);
        }
        list() {
            return list();
        }
    },
    
    getLayerStatus: () => ({ name: 'Agents', type: 'multi-agent', version: '0.8.6', enabled: true }),
    isOperationAllowed: () => ({ allowed: true }),
    getStatus: () => ({ enabled: true, agents: _agents.size }),

    // Unified proto loader: brain priority + folder + flat + YAML parse
    loadProto(name) {
        const cached = _protoCache.get(name);
        if (cached && Date.now() - cached.ts < _protoTTL) {
            return cached.val;
        }
        
        const fs = require('fs');
        const path = require('path');
        const fmt = require('./format');
        
        const roots = [
            path.join(__dirname, '..', 'models', 'private', 'agents'),
            path.join(__dirname, '..', 'models', 'public', 'agents')
        ];
        
        let found = null;
        for (const root of roots) {
            const fp = path.join(root, 'vant-agent-' + name, 'AGENT.md');
            if (fs.existsSync(fp)) { found = { p: fp }; break; }
            const fp2 = path.join(root, name + '.md');
            if (fs.existsSync(fp2)) { found = { p: fp2 }; break; }
        }
        if (!found) return null;
        
        const content = fs.readFileSync(found.p, 'utf8');
        const parsed = fmt.parse(content);
        
        const result = {
            name: parsed.data?.meta?.name || name,
            path: found.p,
            content: content,
            type: 'agent',
            source: found.p.includes('/private/') ? 'private' : 'public',
            description: parsed.data?.meta?.description || '',
            chain: parsed.data?.meta?.chain || [],
            metadata: parsed.data?.meta?.metadata || {},
            format: found.p.includes('vant-agent-') ? 'folder' : 'flat'
        };
        _protoCache.set(name, { val: result, ts: Date.now() });
        return result;
    },
    
    clearCache() { _protoCache.clear(); },
    
    listProtos() {
        const fs = require('fs');
        const path = require('path');
        const s = new Set();
        
        ['private/agents', 'public/agents'].forEach(sub => {
            const dir = path.join(__dirname, '..', 'models', sub);
            try {
                fs.readdirSync(dir)
                    .filter(d => d.startsWith('vant-agent-'))
                    .forEach(d => s.add(d.replace('vant-agent-', '')));
                fs.readdirSync(dir)
                    .filter(f => f.endsWith('.md') && !f.startsWith('vant-'))
                    .forEach(f => s.add(f.replace('.md', '')));
            } catch (e) {}
        });
        return Array.from(s);
    },
    
    // NEW: Start MCP server for agents
    startMCP(options = {}) {
        // Start MCP server with agent tools
        const mcp = require('./mcp');
        // Re-export MCP tools with agent context
        return {
            tools: mcp.listTools?.() || [],
            status: 'mcp_started'
        };
    },

    // Load from folder format (inline, no extra lib)
    loadFolder(name) {
        const fs = require('fs');
        const FORMAT = require('./format');
        const folderPath = path.join(__dirname, '..', 'models', 'public', 'agents', 'vant-agent-' + name, 'AGENT.md');
        try {
            if (fs.existsSync(folderPath)) {
                const content = fs.readFileSync(folderPath, 'utf8');
                const parsed = FORMAT.parse(content);
                return {
                    name: parsed.data.meta?.name || name,
                    path: folderPath,
                    content: content,
                    description: parsed.data.meta?.description || '',
                    chain: parsed.data.meta?.chain || [],
                    metadata: parsed.data.meta?.metadata || {}
                };
            }
        } catch (e) { console.warn("[agents] Parse error:", e.message); }
        return null;
    },

    // List all agents in folder format
    listFolders() {
        const fs = require('fs');
        const dir = path.join(__dirname, '..', 'models', 'public', 'agents');
        try {
            return fs.readdirSync(dir)
                .filter(d => d.startsWith('vant-agent-'))
                .map(d => d.replace('vant-agent-', ''));
        } catch (e) { return []; }
    },

    // Load agent chain - recursively load all agents in chain
    async loadChain(name, loaded = []) {
        const agent = this.loadProto(name);
        if (!agent) return loaded;
        if (loaded.find(a => a.name === agent.name)) return loaded;

        loaded.push(agent);

        for (const chainItem of agent.chain || []) {
            const subName = chainItem.replace(/^vant-agent-/, '');
            await this.loadChain(subName, loaded);
        }
        return loaded;
    },
};
