/**
 * Vant Agents — shared internal state + helpers (P3 #32 split)
 *
 * Single home for the agent registry Map, the work-item/event Map, agent
 * persistence, and the underscore helpers every agents/* submodule shares.
 * Nothing here is public API — consumers go through lib/agents.js (facade).
 *
 * Split provenance: bodies were moved VERBATIM from lib/agents.js (monolith)
 * with two mechanical adjustments: requires went one level deeper (./x →
 * ../x) and protos.js __dirname anchors gained a level. The one behavioral
 * fix in the move is documented at core.js emit() (bare audit.* reference).
 */

const errors = require('../error');

// ==================== EVENT SYSTEM ====================
let _event = null;
function _emit(event, data) {
    if (!_event) {
        try { _event = require('../event'); } catch (e) { return; }
    }
    if (_event && _event.emit) {
        _event.emit(event, data);
    }
}

const path = require('path');
const Storage = require('../storage');

// Agent persistence
// v0.9.0 fs->storage migration: agent store + proto/folder reads go through
// FileStorage (containment/symlink/VAF/atomic-write). Directory enumeration
// stays on fs (pattern-glob limitation), paths anchored to __dirname models
// roots, never raw caller input. Proto/folder names are validated before
// path interpolation (previously unguarded).
// (O-7/F-10) agent store is brain-scoped inside the models tree, resolved PER
// CALL (pushBrain moves it with the active brain). Legacy .agent_tmp default
// only applies when the brain module is unavailable/unusable.
function _getAgentStorePath() {
    try {
        const brainMod = require('../brain');
        const brainName = brainMod.getCurrentBrain ? brainMod.getCurrentBrain() : null;
        if (brainName && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(brainName)) {
            return 'models/private/' + brainName + '/orgchart/agents.json';
        }
    } catch (e) { /* fall back to legacy path */ }
    return '.agent_tmp/agents.json';
}
function _getAgentStore() {
    const p = _getAgentStorePath();
    return new Storage.FileStorage({ basePath: path.resolve(path.dirname(p)) });
}
function _getAgentStoreFile() {
    return path.basename(_getAgentStorePath());
}

// Store for PROTO reads — these are models/-relative paths (proto loading),
// NOT the registry JSON. Kept separate from _getAgentStore() whose basePath is
// the registry's own directory. (Pre-fix, one shared store with a .agent_tmp
// basePath made loadProto/loadFolder probe models/-relative paths against the
// wrong root — they could only ever read legacy-fallback paths that happened
// to resolve, i.e. proto loading was silently broken for brain-scoped agents.)
function _getModelsStore() {
    return new Storage.FileStorage({ basePath: path.resolve('models') });
}

// Proto/folder names become path segments - validate before interpolating
function _validProtoName(name) {
    if (typeof name !== 'string' || !name || name.length > 64) return false;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) return false;
    if (name.includes('..')) return false;
    return true;
}

// Lazy-load config for MAX_AGENT_AGE / maxAgents / spawn rate limit
let _config = null;
function _getConfig() {
    if (!_config) {
        try { _config = require('../config'); } catch (e) {}
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

function _getMaxAgents() {
    const cfg = _getConfig();
    if (cfg && cfg.get) {
        return cfg.get('agents.maxAgents', 200);
    }
    return 200;
}

// Lazy-load trust for reputation integration
let _trust = null;
function _getTrust() {
    if (!_trust) {
        try { _trust = require('../trust'); } catch (e) { return null; }
    }
    return _trust;
}

// ==================== QOS RATE LIMITING ====================
const _spawnRateLimit = new Map();

// Delegation uses unified recursion guard via guard.check('delegate:' + agentId)

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

// ==================== SHARED STATE ====================

// Active agents (registry — owned here, used by core + work + horcrux)
const _agents = new Map();
// (P2 #26 DE-MULTIPLEXED, pass 21) Work items now live in their OWN Map.
// Pre-split, a single Map carried THREE unrelated value shapes keyed by
// colliding prefixes: 'conv:<id>' conversation buffers, 'event:<name>'
// listener arrays, and bare work ids — so setPriority('event:foo') would
// happily mangle a listener array. Event listeners + conversation buffers
// remain multiplexed in _messages (harmless — both are opaque arrays, core.js
// prefixes every key); work-item bookkeeping (setDeadline/retry/escalate/
// setPriority) reads/writes _workItems. Any Map works for a lookup miss, so
// this is fail-safe: keys stored in _messages by older paths still roundtrip
// their bookkeeping fields through the test pin in agents-split.test.js.
const _messages = new Map();
const _workItems = new Map();
let _currentAgentId = null;

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

async function _saveAgents(agents) {
    _getAgentStore().write(_getAgentStoreFile(), JSON.stringify(Array.from(agents)));
}

async function _loadAgents() {
    const _regStore = _getAgentStore();
    const AGENT_STORE_FILE = _getAgentStoreFile();
    if (_regStore.has(AGENT_STORE_FILE)) {
        try {
            return new Map(JSON.parse(_regStore.read(AGENT_STORE_FILE)));
        } catch (e) { console.warn('[agents] Agent store corrupted, resetting:', e.message); }
    }
    return new Map();
}

// Hydrate agents on load (same load-time contract as the monolith)
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
        try { _sandbox = require('../sandbox'); } catch (e) {}
    }
    return _sandbox;
}

function _checkRead(userCtx, resource) {
    const sandbox = _getSandbox();
    if (sandbox && sandbox.can && !sandbox.can('canRead')) {
        throw new errors.VantError('Capability denied', { code: errors.CODES.CAPABILITY_NOT_ALLOWED });
    }
    if (userCtx && sandbox && sandbox.rls) {
        sandbox.rls.checkRead(userCtx, resource, 'read');
    }
}

// Get/Set current agent
function getCurrentAgentId() {
    return _currentAgentId || 'default';
}

function setCurrentAgentId(id) {
    _currentAgentId = id;
    // Also sync to shell/tmp
    try { require('../shell').setTaskId(id); } catch (e) {}
    try { require('../tmp').setTaskId(id); } catch (e) {}
    return { agentId: _currentAgentId };
}

module.exports = {
    // Shared state
    _agents,
    _messages,
    _workItems,

    // Agent context
    getCurrentAgentId,
    setCurrentAgentId,

    // Events
    _emit,

    // Persistence
    _saveAgents,
    _loadAgents,

    // Config + limits
    _getConfig,
    _getMaxAge,
    _getMaxAgents,
    _getTrust,

    // Security
    _getSandbox,
    _checkRead,
    _checkSpawnRate,

    // Name validation + stores
    _validProtoName,
    _getAgentStorePath,
    _getAgentStore,
    _getAgentStoreFile,
    _getModelsStore
};
