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
const stream = require('./stream');
const path = require('path');
const fs = require('fs');

// Agent persistence
const AGENT_STORE = '.agent_tmp/agents.json';

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
        } catch (e) { /* corrupt */ }
    }
    return new Map();
}

// Hydrate agents on load
(async () => {
    const stored = await _loadAgents();
    for (const [id, agent] of stored) {
        _agents.set(id, agent);
    }
})();

// Lazy load sandbox for capability check
let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) {
        try { _sandbox = require('./sandbox'); } catch (e) {}
    }
    return _sandbox;
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
 * Max 4 agents: you + 3 others
 */
const MAX_AGENTS = 4;
async function spawn(options = {}) {
    // Check agent quota (4 max: you + 3 others)
    if (_agents.size >= MAX_AGENTS) {
        return { error: 'Agent quota reached (max ' + MAX_AGENTS + ')' };
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
        mcp: (options.mcp) ? {
            execute: require('./mcp').execute,
            listTools: require('./mcp').listTools,
            call: require('./mcp').call
        } : null
    };
    
    // Initialize
    await runtime.init({
        id,
        name: agent.name,
        role: agent.role
    });

    // Wire to brain: track attention + synapse
    try {
        const Brain = require('./brain');
const sudo = require('./sudo');
        Brain.attend(agent.name, 1.0);
        if (options.parent) {
            Brain.fireSynapse(options.parent, agent.name);
        }
    } catch (e) {}

    
    _agents.set(id, agent);
    
    // Persist to disk
    await _saveAgents(_agents);
    
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
    
    agent.state = 'working';
    agent.task = task;
    
    // EVENT: delegating
    _emit('agent:delegating', { agentId, task: task.operation || 'mcp', timestamp: Date.now() });
    
    // Execute in agent context (support MCP delegation)
    let result;
    if (task.mcp?.tool && agent.mcp) {
        result = await agent.mcp.execute(task.mcp.tool, task.mcp.args || {});
    } else {
        result = await runtime.act(task.operation, task.options);
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
    }
    return work;
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
async function list() {
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
    } catch(e) {}
}

module.exports = {
    // Core
    spawn,
    delegate,
    delegateAsync,
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
    kill,
    
    // Constants
    MAX_AGENTS,
    
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
        } catch (e) { /* ignore */ }
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
