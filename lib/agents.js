/**
 * Vant Agents (0.8.6) — FACADE
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

const _errors = require('./error');
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
        // (pass 287 QC) Tombstone EVERYTHING being wiped — ids in memory AND
        // ids on disk. _saveAgents merges disk newcomers before every write
        // (the pass-95/116 law keeps deletes authoritative via tombstones);
        // without noted tombstones the wipe's own save RE-ADOPTED the disk
        // roster, so a full-wipe restore resurrected the very roster it
        // just cleared (30 agents came back mid-restore, observed live).
        let diskIds = [];
        try {
            diskIds = JSON.parse(internal._getAgentStore().read(internal._getAgentStoreFile()))
                .map((pair) => (Array.isArray(pair) ? pair[0] : (pair && pair.id) ? pair.id : null))
                .filter(Boolean);
        } catch (e) { /* no readable store: nothing to tombstone there */ }
        for (const id of [..._agents.keys(), ...diskIds]) internal._noteAgentSeen(id);
        _agents.clear();
        // (pass 116, parity sweep) Honest persistence outcome on both paths.
        const save = await internal._saveAgents(_agents);
        return { restored: 0, wiped: true, persisted: !save || save.ok !== false };
    }
    // (pass 289) A restore REPLACES the roster — teams.restoreState parity
    // for the non-empty path too. Collect the VALID payload rows first, then
    // tombstone every OTHER known id (in memory AND on disk): the save's
    // newcomer-merge (pass 95/116 law) re-adopts any un-seen disk row, so
    // without these notes a partial restore resurrected unrelated agents
    // straight out of the store and left memory-only strays in the roster.
    const land = [];
    for (const agent of data.agents) {
        if (!agent || typeof agent.id !== 'string' || !internal._validProtoName(agent.name || '')) continue;
        land.push({ id: agent.id, row: { ...agent } });
    }
    const landIds = new Set(land.map((l) => l.id));
    let diskIds = [];
    try {
        diskIds = JSON.parse(internal._getAgentStore().read(internal._getAgentStoreFile()))
            .map((pair) => (Array.isArray(pair) ? pair[0] : (pair && pair.id) ? pair.id : null))
            .filter(Boolean);
    } catch (e) { /* no readable store: nothing to tombstone there */ }
    for (const id of [..._agents.keys(), ...diskIds]) {
        if (!landIds.has(id)) internal._noteAgentSeen(id);
    }
    let restored = 0;
    for (const l of land) {
        _agents.set(l.id, l.row);
        // (pass 116, parity sweep) A restored id is SEEN: the roster-merge
        // tombstone in _mergeRosterNewcomers uses _seenIds to keep deletes
        // authoritative. Without this note, a restored-then-terminated agent
        // whose save was refused RESURRECTED on the retry save (the merge
        // re-adopted the un-seen disk row — parity gate caught it live).
        internal._noteAgentSeen(l.id);
        restored++;
    }
    if (restored > 0) {
        const save = await internal._saveAgents(_agents);
        if (save && save.ok === false) {
            // Refused: the roster exists only in memory — say so.
            return { restored, persisted: false, code: 'E_SAVE_REFUSED', reason: save.reason };
        }
    }
    return { restored, persisted: true };
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

    // (pass 88 — prime #109) Drain pending roster persistence. CLI/library
    // callers await this before process exit so fire-and-forget saves can't
    // race the exit (spawn 'succeeded' but agents.json never written).
    flush: internal.flushAgents,

    // Configurable limits
    getMaxAgents: internal._getMaxAgents,

    // Agent context
    getCurrentAgentId: internal.getCurrentAgentId,
    setCurrentAgentId: internal.setCurrentAgentId,

    // (pass 82) Habitat RLS context for a spawned agent — delegates to the
    // habitat (which reads this registry) so the RLS subject shape lives in
    // ONE place. Returns null for unknown agents.
    agentContext: (agentId) => {
        try {
            const habitat = require('./habitat');
            return habitat.getShared ? habitat.getShared().agentContext(agentId) : null;
        } catch (e) {
            return null;
        }
    },

    getLayerStatus: () => ({ name: 'Agents', type: 'multi-agent', version: require('./version'), enabled: true }),
    isOperationAllowed: () => ({ allowed: true }),
    getStatus: () => ({ enabled: true, agents: _agents.size })
};
