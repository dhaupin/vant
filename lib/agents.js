/**
 * Vant Agents (v0.8.6)
 * Multi-agent runtime for Vant
 * 
 * What other agents need: spawn, delegate, fork, join, emit
 */

const runtime = require('./vant');
const vaf = require('./vaf');

// Active agents
const _agents = new Map();
const _messages = new Map();

/**
 * Spawn a new agent
 */
async function spawn(options = {}) {
    const { name, role = 'Agent', type = 'default' } = options;
    const id = 'agent_' + Date.now().toString(36);
    
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
function terminate(agentId) {
    return _agents.delete(agentId);
}

module.exports = {
    spawn,
    delegate,
    fork,
    join,
    emit,
    on,
    list,
    get,
    terminate,
    
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
