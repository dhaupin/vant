/**
 * Vant Agent Chain (Delegation)
 * 
 * Spawns and delegates to agents per docs/runtime definitions.
 * Implements RPC agent_message protocol.
 * 
 * Usage:
 *   const agent = require('./agent');
 *   agent.spawn({ name: 'Claude', role: 'assistant' });
 *   agent.delegate({ to: 'agent-xxx', task: 'Fix bug' });
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

const RUNTIME_DIR = path.join(__dirname, '../docs/runtime');

// Agent registry
const _agents = new Map();

// Message types per RPC.md
const MESSAGE_TYPES = ['spawn', 'delegate', 'broadcast', 'query', 'terminate', 'status'];

/**
 * Spawn new agent
 * @param {Object} opts - { name, role, brain? }
 * @returns {Object} - { id, name, role, state }
 */
function spawn(opts) {
    const { name, role = 'assistant', brain } = opts;
    const id = 'agent-' + Math.random().toString(36).slice(2, 8);
    
    const agent = {
        id,
        name,
        role,
        brain,
        state: 'pending',
        created: Date.now()
    };
    
    _agents.set(id, agent);
    return agent;
}

/**
 * Get agent by ID
 */
function get(id) {
    return _agents.get(id);
}

/**
 * List all agents
 */
function list() {
    return Array.from(_agents.values());
}

/**
 * Update agent state
 */
function update(id, updates) {
    const agent = _agents.get(id);
    if (!agent) throw new Error(`Agent not found: ${id}`);
    Object.assign(agent, updates);
    return agent;
}

/**
 * Delete agent
 */
function remove(id) {
    const agent = _agents.get(id);
    if (!agent) return null;
    agent.state = 'stopped';
    _agents.delete(id);
    return agent;
}

/**
 * Delegate task to agent (per RPC.md spec)
 * @param {Object} msg - { type, payload, context? }
 * @returns {Object} - { rpc, agent, result?, error? }
 */
async function delegate(msg) {
    const { type = 'delegate', payload, context = {} } = msg;
    
    if (!MESSAGE_TYPES.includes(type)) {
        return errorResp(null, 'INVALID_TYPE', `Message type '${type}' not recognized`);
    }
    
    if (type === 'spawn') {
        return handleSpawn(payload);
    }
    
    if (type === 'delegate') {
        return handleDelegate(payload, context);
    }
    
    if (type === 'terminate') {
        return handleTerminate(payload);
    }
    
    if (type === 'status') {
        return handleStatus(payload);
    }
    
    if (type === 'broadcast') {
        return handleBroadcast(payload, context);
    }
    
    if (type === 'query') {
        return handleQuery(payload);
    }
    
    return errorResp(null, 'NOT_IMPLEMENTED', `Type ${type} not implemented`);
}

/**
 * Handle spawn message
 */
function handleSpawn(payload) {
    const agent = spawn(payload);
    return {
        rpc: 'agent_message',
        type: 'spawn',
        agent: agent.id,
        result: agent
    };
}

/**
 * Handle delegate message
 */
function handleDelegate(payload, context) {
    const { agent, task, _expect } = payload;
    const target = _agents.get(agent);
    
    if (!target) {
        return errorResp(agent, 'NOT_FOUND', `Agent '${agent}' not found`);
    }
    
    // Update state to running
    target.state = 'running';
    target.task = task;
    target.expect = _expect;
    
    return {
        rpc: 'agent_message',
        type: 'delegate',
        agent,
        result: {
            state: 'running',
            task,
            expect: _expect
        }
    };
}

/**
 * Handle terminate message
 */
function handleTerminate(payload) {
    const { agent } = payload;
    const target = remove(agent);
    
    if (!target) {
        return errorResp(agent, 'NOT_FOUND', `Agent '${agent}' not found`);
    }
    
    return {
        rpc: 'agent_message',
        type: 'terminate',
        agent,
        result: { state: 'stopped' }
    };
}

/**
 * Handle status query
 */
function handleStatus(payload) {
    const { agent } = payload;
    
    if (agent) {
        const target = _agents.get(agent);
        if (!target) {
            return errorResp(agent, 'NOT_FOUND', `Agent '${agent}' not found`);
        }
        return {
            rpc: 'agent_message',
            type: 'status',
            result: target
        };
    }
    
    // List all
    return {
        rpc: 'agent_message',
        type: 'status',
        result: list()
    };
}

/**
 * Handle broadcast message
 */
function handleBroadcast(payload, context) {
    const { channel, message } = payload;
    
    return {
        rpc: 'agent_message',
        type: 'broadcast',
        result: {
            channel,
            message,
            delivered: _agents.size
        }
    };
}

/**
 * Handle query (RAG lookup)
 */
function handleQuery(payload) {
    const { query } = payload;
    
    // Placeholder - would wire to brain.search()
    return {
        rpc: 'agent_message',
        type: 'query',
        result: {
            query,
            hits: [],
            total: 0
        }
    };
}

/**
 * Build error response
 */
function errorResp(agent, code, message) {
    return {
        rpc: 'agent_message',
        error: {
            code,
            message
        }
    };
}

/**
 * Load agent definition from docs/runtime
 */
function loadDefinition(name) {
    const filePath = path.join(RUNTIME_DIR, `${name}.md`);
    if (!fs.existsSync(filePath)) {
        throw new Error(`Agent definition not found: ${name}`);
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
    
    let meta = {};
    if (fmMatch) {
        meta = yaml.parse(fmMatch[1]) || {};
    }
    
    return {
        name,
        meta,
        content
    };
}

/**
 * List available agent definitions
 */
function listDefinitions() {
    const files = fs.readdirSync(RUNTIME_DIR);
    return files
        .filter(f => f.startsWith('vant-agent-') && f.endsWith('.md'))
        .map(f => f.replace('.md', ''));
}

module.exports = {
    spawn,
    get,
    list,
    update,
    remove,
    delegate,
    loadDefinition,
    listDefinitions,
    MESSAGE_TYPES
};

// Self-test
if (require.main === module) {
    console.log('[agent] loaded, available:', listDefinitions().length, 'definitions');
}