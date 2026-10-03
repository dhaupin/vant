/**
 * Vant Agents — core lifecycle (P3 #32 split)
 *
 * Agent registry operations: spawn, pause/resume, terminate, prune, list,
 * get, metrics, fork, join, signal emit/on, quota + sandbox + sudo gates,
 * and the Agents convenience class. Bodies moved VERBATIM from the agents.js
 * monolith (requires deepened one level).
 *
 * Behavior fixes in the move (documented at the site):
 *   - emit()'s listener-error catch called bare `audit.error(...)` — never
 *     defined, so a throwing listener crashed emit itself. Now console.warn.
 */

const errors = require('../error');
const internal = require('./internal');

const runtime = require('../vant');
const Encrypt = require('../encrypt');
const sudo = require('../sudo');
const stream = require('../stream');
const guard = require('../recursion');  // Unified recursion guard
const pipeline = require('../pipeline');

const { _agents, _messages, _emit } = internal;

/**
 * Spawn a new agent (protected by sandbox.canSpawn)
 */
function spawn(options = {}) {
    const maxAgents = internal._getMaxAgents();

    // Check agent quota
    if (_agents.size >= maxAgents) {
        return { error: 'Agent quota reached (max ' + maxAgents + ')' };
    }

    // QoS: Check spawn rate limit (default: 10 spawns per minute per org/team)
    const rateLimitOrg = options.org || 'default';
    const cfg = internal._getConfig();
    const maxSpawns = (cfg && cfg.get) ? cfg.get('agents.spawnRateLimit', 10) : 10;
    if (!internal._checkSpawnRate(rateLimitOrg, 60000, maxSpawns)) {
        return { error: 'Spawn rate limit exceeded (max ' + maxSpawns + '/min)', code: 'E_RATE_LIMIT' };
    }

    // Check sandbox capability gate
    const sb = internal._getSandbox();
    if (sb && typeof sb.can === 'function' && !sb.can('canSpawn')) {
        return { error: 'Sandbox: capability not allowed - canSpawn is false' };
    }

    const { name, role = 'Agent', type = 'default' } = options;
    const id = 'agent_' + Date.now().toString(36) + Encrypt.key(16);

    // MULTIBRAIN (F-6): bind a brain at spawn — explicit option wins, else the
    // current brain (if the brain module is usable). Consumers (teams.getAgentBrain,
    // listAgentsByBrain) read this field; spawn used to leave it null.
    let brain = options.brain || null;
    if (!brain) {
        // (pass 93) Brain BINDING goes through state-store's path-active
        // resolver (VANT_BRAIN env > currentBrain) — the SAME seam the agent
        // STORE PATH got in pass 88. The bare Brain.currentBrain() reads
        // persisted state only, so an agent spawned under VANT_BRAIN=other
        // was bound (field) to 'vant' while its roster landed in the env
        // brain — agents.writeTo / teams.getAgentBrain then targeted the
        // wrong brain for that agent's whole life (live-fire catch).
        try {
            const stateStore = require('../state-store');
            brain = stateStore.currentBrain();
        } catch (e) { brain = null; }
        if (!brain) {
            try {
                const Brain = require('../brain');
                brain = Brain.currentBrain ? Brain.currentBrain() : null;
            } catch (e) { brain = null; }
        }
    }

    // Create agent state
    const agent = {
        id,
        name: name || role + '_' + id.slice(-4),
        role,
        type,
        brain,  // MULTIBRAIN: Brain this agent belongs to
        state: 'idle',
        created: Date.now(),
        parent: options.parent || null,
        children: [],
        team: options.team || null,     // Team assignment
        roleId: options.roleId || null, // Role within team
        mcp: (options.mcp) ? {
            execute: require('../mcp').execute,
            listTools: require('../mcp').listTools,
            call: require('../mcp').call
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
        const Brain = require('../brain');
        Brain.attend(agent.name, 1.0);
        if (options.parent) {
            Brain.fireSynapse(options.parent, agent.name);
        }
    } catch (e) { console.warn("[agents] Agent setup failed:", e.message); }

    // VALIDATE (F-7 mirror): team reference must be a string if given
    if (options.team !== undefined && options.team !== null && typeof options.team !== 'string') {
        console.warn("[agents] Team assignment skipped: team reference must be a string");
    } else if (options.team) {
        try {
            const teams = require('../teams');
            teams.assign(id, { team: options.team, role: options.roleId, brain: options.brain });
        } catch (e) { console.warn("[agents] Team assignment failed:", e.message); }
    }

    // (pass 82) Habitat identity: every agent gets a workspace + roles in
    // the habitat (RLS subject). Team agents map to an 'org-<team>'
    // workspace; roleless agents land in the default workspace as 'editor'.
    // Idempotent, so respawn/boot re-provision is safe. Failures are
    // non-fatal to spawn itself (logged) — an agent without habitat identity
    // is simply anonymous to RLS rather than dead.
    try {
        const habitat = require('../habitat');
        const h = habitat.getShared ? habitat.getShared() : null;
        if (h) {
            const provisioned = h.provisionAgent(id, {
                workspace: options.workspace,
                team: options.team,
                role: options.role && ['admin', 'editor', 'viewer'].includes(options.role)
                    ? options.role : 'editor',
                owner: options.parent || null
            });
            agent.workspace = provisioned.workspace;
            agent.habitatRoles = provisioned.roles;
        }
    } catch (e) {
        console.warn("[agents] Habitat provisioning failed:", e.message);
    }

    _agents.set(id, agent);
    internal._noteAgentSeen(id);

    // Persist to disk. (pass 88 — prime #109) The save rides internal.js's
    // serialized chain; spawn stays sync (suites depend on it) but any CLI
    // can `await agents.flush()` to drain before exit. Internal logs its own
    // failures — no second handler here.
    internal._saveAgents(_agents).catch(() => {});

    // EVENT: spawned
    _emit('agent:spawned', { id, name: agent.name, role: agent.role, brain: agent.brain, workspace: agent.workspace, timestamp: Date.now() });

    return { id, name: agent.name, role, brain: agent.brain };
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
 * (latent-bug fix in the move) the listener-error catch called bare
 * `audit.error(...)` — never defined — so a throwing listener crashed the
 * emit loop itself. Console fallback now, matching the monolith's other
 * catch blocks.
 */
function emit(event, data = {}) {
    const eventKey = 'event:' + event;
    const listeners = _messages.get(eventKey) || [];

    for (const listener of listeners) {
        try {
            listener(data);
        } catch (e) {
            console.warn('[agents] Event error:', e.message);
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
    if (userCtx) internal._checkRead(userCtx, '_agents:list');

    // Reload from storage
    const stored = await internal._loadAgents();
    for (const [id, agent] of stored) {
        if (!_agents.has(id)) { _agents.set(id, agent); internal._noteAgentSeen(id); }
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
    const maxAge = options.maxAge || internal._getMaxAge();
    const now = Date.now();
    let pruned = 0;
    for (const [id, agent] of _agents) {
        if (now - agent.created > maxAge && agent.state === 'idle') {
            _agents.delete(id);
            pruned++;
        }
    }
    if (pruned > 0) {
        await internal._saveAgents(_agents);
        _emit('agent:pruned', { count: pruned, timestamp: Date.now() });
    }
    return { pruned };
}

/**
 * Terminate agent
 */
const kill = terminate;

async function terminate(agentId) {
    // (pass 88 — prime #106/#109 follow-through) Hydrate before delete.
    // A FRESH process (every CLI invocation) has an empty in-memory
    // _agents map; terminate() used to delete only from that map and
    // return false for any agent spawned by another process — even though
    // it was right there on disk. The stub CLI masked this for months
    // because it never actually killed anything. Load-then-delete, and the
    // roster (missing the killed agent) persists below.
    if (!_agents.has(agentId)) {
        const stored = await internal._loadAgents();
        for (const [id, agent] of stored) {
            if (!_agents.has(id)) { _agents.set(id, agent); internal._noteAgentSeen(id); }
        }
    }
    const result = _agents.delete(agentId);
    if (result) await internal._saveAgents(_agents);
    return result;
}

// (P3 #32 note) The monolith's _initCache() — which registered brain
// afterSave/brainChanged listeners to clear the proto cache — had ZERO
// callers (grep-verified before the split), so the hook never fired and the
// cache-clearing behavior it promised never existed. Not resurrected; protos.js
// owns its own cache lifecycle. If proto staleness ever shows up, register the
// listener there.

// Convenience wrapper class (verbatim semantics from the monolith export)
class Agents {
    constructor(options = {}) {
        this._options = options;
    }
    async spawn(options) {
        // Sudo: spawn?
        if (!sudo.can(internal.getCurrentAgentId(), 'spawn')) {
            throw new errors.VantError('Spawn not allowed', { code: errors.CODES.AGENT_SPAWN_DENIED });
        }
        return spawn(options);
    }
    list() {
        return list();
    }
}

module.exports = {
    spawn,
    pause,
    resume,
    getMetrics,
    fork,
    join,
    emit,
    on,
    list,
    get,
    prune,
    terminate,
    kill,
    Agents
};
