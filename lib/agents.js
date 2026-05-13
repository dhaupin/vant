/**
 * Vant Agents (v0.8.6)
 * Multi-agent runtime for Vant
 * 
 * What other agents need: spawn, delegate, fork, join, emit
 * Protected by sandbox for security
 */

const runtime = require('./vant');
const vaf = require('./vaf');
const stream = require('./stream');

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
    const id = 'agent_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    
    // Create agent state
    const agent = {
        id,
        name: name || role + '_' + id.slice(-4),
        role,
        type,
        state: 'idle',
        created: Date.now(),
        parent: options.parent || null,
        children: []
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
        Brain.attend(agent.name, 1.0);
        if (options.parent) {
            Brain.fireSynapse(options.parent, agent.name);
        }
    } catch (e) {}

    
    _agents.set(id, agent);
    
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
    
    // Execute in agent context
    const result = await runtime.act(task.operation, task.options);
    
    agent.state = 'idle';
    
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
            console.error('Event error:', e.message);
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
function list() {
    return Array.from(_agents.values()).map(a => ({
        id: a.id,
        name: a.name,
        role: a.role,
        state: a.state
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

function terminate(agentId) {
    return _agents.delete(agentId);
}

module.exports = {
    spawn,
    delegate,
    delegateAsync,
    pollWork,
    completeWork,
    fork,
    join,
    emit,
    on,
    list,
    get,
    terminate,
    kill,
    
    Agents: class {
        constructor(options = {}) {
            this._options = options;
        }
        async spawn(options) {
            return spawn(options);
        }
        list() {
            return list();
        }
    },
    
    getLayerStatus: () => ({ name: 'Agents', type: 'multi-agent', version: '0.8.6', enabled: true }),
    isOperationAllowed: () => ({ allowed: true }),
    getStatus: () => ({ enabled: true, agents: _agents.size })
};
