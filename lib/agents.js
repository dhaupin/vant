/**
 * Vant Agents (v0.9.0-axolotl) — FACADE
 * Multi-agent runtime for Vant
 *
 * (P3 #32) The 1156-line monolith is split into focused modules:
 *   lib/agents/core.js       — agent lifecycle (spawn/pause/terminate/prune/…)
 *   lib/agents/work.js       — work-item lifecycle (delegate/poll/approve/…)
 *   lib/agents/protos.js     — agent protos (loadProto/listProtos/folders)
 *   lib/agents/multibrain.js — per-brain agents config + stack traversal
 *   lib/agents/internal.js   — shared state (registry Map, persistence, helpers)
 *
 * This file stays as the ONE public door: every existing require point
 * (`require('./agents')`) keeps working with an identical export surface.
 * The horcrux gather/restore pair lives here because it spans the registry
 * (core) and persistence (internal) domains.
 */

const errors = require('./error');
const internal = require('./agents/internal');
const core = require('./agents/core');
const work = require('./agents/work');
const protos = require('./agents/protos');
const multibrain = require('./agents/multibrain');

const { _agents, _emit } = internal;

// ==================== HORCRUX GATHER/RESTORE ====================
function gatherState() {
    // FULL agent records (O-8): brain/team/roleId/type/parent/children are the
    // multibrain state — stripping them made agent restore lossy even if
    // restoreState had worked. Shallow copy (all plain data).
    const agents = [];
    for (const [id, agent] of _agents) {
        agents.push({ id, ...agent });
    }
    return {
        agents,
        count: _agents.size,
        gatheredAt: Date.now()
    };
}
async function restoreState(data) {
    // REAL restore (O-8/F-11): rehydrate the registry Map + persist to the
    // brain-scoped store. Previously returned a count without restoring.
    // An explicit empty agents array = full wipe (matches teams.restoreState
    // clear semantics); missing/invalid payload = no-op.
    if (!data || !Array.isArray(data.agents)) return { restored: 0 };
    if (data.agents.length === 0) {
        _agents.clear();
        await internal._saveAgents(_agents);
        return { restored: 0, wiped: true };
    }
    let restored = 0;
    for (const agent of data.agents) {
        if (!agent || typeof agent.id !== 'string' || !internal._validProtoName(agent.name || '')) continue;
        _agents.set(agent.id, { ...agent });
        restored++;
    }
    if (restored > 0) {
        await internal._saveAgents(_agents);
    }
    return { restored };
}

module.exports = {
    // Core lifecycle (lib/agents/core.js)
    spawn: core.spawn,
    pause: core.pause,
    resume: core.resume,
    getMetrics: core.getMetrics,
    fork: core.fork,
    join: core.join,
    emit: core.emit,
    on: core.on,
    list: core.list,
    get: core.get,
    prune: core.prune,
    terminate: core.terminate,
    kill: core.kill,
    Agents: core.Agents,

    // Work items (lib/agents/work.js)
    delegate: work.delegate,
    delegateAsync: work.delegateAsync,
    pollWork: work.pollWork,
    completeWork: work.completeWork,
    approve: work.approve,
    reject: work.reject,
    signOff: work.signOff,
    setDeadline: work.setDeadline,
    retry: work.retry,
    escalate: work.escalate,
    setPriority: work.setPriority,

    // Protos (lib/agents/protos.js)
    loadProto: protos.loadProto,
    clearCache: protos.clearCache,
    listProtos: protos.listProtos,
    startMCP: protos.startMCP,
    loadFolder: protos.loadFolder,
    listFolders: protos.listFolders,
    loadChain: protos.loadChain,

    // Multibrain (lib/agents/multibrain.js)
    getBrainAgentsConfig: multibrain.getBrainAgentsConfig,
    setBrainAgentsConfig: multibrain.setBrainAgentsConfig,
    getStackAgentsConfigs: multibrain.getStackAgentsConfigs,

    // Horcrux (this file — spans registry + persistence)
    gatherState,
    restoreState,

    // Configurable limits
    getMaxAgents: internal._getMaxAgents,

    // Agent context
    getCurrentAgentId: internal.getCurrentAgentId,
    setCurrentAgentId: internal.setCurrentAgentId,

    getLayerStatus: () => ({ name: 'Agents', type: 'multi-agent', version: require('./version'), enabled: true }),
    isOperationAllowed: () => ({ allowed: true }),
    getStatus: () => ({ enabled: true, agents: _agents.size })
};
