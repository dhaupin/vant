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
const lock = require('../lock');
const Storage = require('../storage');

// Agent persistence
// v0.9.0 fs->storage migration: agent store + proto/folder reads go through
// FileStorage (containment/symlink/VAF/atomic-write). Directory enumeration
// stays on fs (pattern-glob limitation), paths anchored to __dirname models
// roots, never raw caller input. Proto/folder names are validated before
// path interpolation (previously unguarded).
// (O-7/F-10; pass 28) agent store is brain-scoped inside the models tree,
// resolved PER CALL (pushBrain moves it with the active brain). The old
// .agent_tmp fallback is GONE — orgchart state must never silently scatter
// outside the models tree; an unusable brain name throws instead.
function _getAgentStorePath() {
    // (pass 88) Brain resolution goes through state-store's path-active
    // resolver (VANT_BRAIN env > currentBrain) — the SAME seam teams.js
    // fixed in pass 53 (consensus/market/trust/node-registry use it too).
    // A bare getCurrentBrain() ignores VANT_BRAIN, so env-scoped processes
    // (tests, multi-runtime hosts like Buffy + Cairn) wrote every roster
    // into the vant brain — cross-brain agent bleed and phantom quota hits
    // (agents.maxAgents=10 tripping on other brains' agents).
    let brainName = 'vant';
    try {
        const stateStore = require('../state-store');
        brainName = stateStore.currentBrain();
    } catch (e) {
        const brainMod = require('../brain');
        brainName = brainMod.getCurrentBrain ? brainMod.getCurrentBrain() : 'vant';
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(brainName)) {
        throw new Error('agents: unusable current brain name: ' + JSON.stringify(brainName));
    }
    return 'models/private/' + brainName + '/orgchart/agents.json';
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
// (pass 95) Every agent id this process has EVER held in _agents — hydrated
// at boot, spawned here, adopted from disk, or seen in a hydrate loop. The
// roster merge in _saveAgents() uses it as a tombstone: an id present on
// disk but absent from _agents is a concurrent writer's newcomer (ADOPT it),
// unless we've seen it before — then it's something THIS process deleted
// (kill/prune/cleanup) and a stale snapshot put back (do NOT resurrect).
const _seenIds = new Set();
function _noteAgentSeen(id) {
    if (id) _seenIds.add(id);
}
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

// (pass 88 — prime #109) Serialized save chain. Saves used to be
// independent fire-and-forget writes; a CLI that mutated agents and
// exited in the same tick raced its own persistence (agents.json never
// written — spawn 'succeeded' but the roster was empty next boot).
// Every save now appends to ONE chain; flushAgents() awaits the tail so
// CLI/library callers can drain before process exit.
// (pass 95) Cross-process roster merge. (pass 88 — prime #109) fixed the
// SAME-process race (serialized save chain), but separate CLI processes
// each keep their own snapshot of agents.json: two concurrent `vant agents
// spawn` invocations both loaded an empty roster, both spawned, and the
// last writer clobbered the first — live-fire reproduced 4 spawns → 3
// persisted (write itself is atomic via storage atomicWrite, so the file
// always parses; entries were silently LOST). Fix: every save takes a
// short-lived lockfile in the orgchart dir, re-reads the disk roster, and
// ADOPTS ids this process has never seen (tracked in _seenIds). Deletes
// stay authoritative: a killed/pruned id is in _seenIds and is never
// re-adopted. Residual window (a kill racing a save in the merge gap) is
// pre-existing full-snapshot semantics and now documented here.
// (pass 103) Every lock lives under the brain's single lock root
// (models/private/<brain>/.locks/) via lock.pathFor.
function _rosterLockPath() {
    return lock.pathFor('agents');
}
// (pass 103) `_mergeRosterNewcomers` no longer takes the lock itself — the
// lock now spans BOTH the merge read and the write in `_saveAgents`, so the
// union it computes is the union that is written (previously the lock was
// released before the write, letting a peer clobber it in the gap).
function _mergeRosterNewcomers() {
    const store = _getAgentStore();
    const file = _getAgentStoreFile();
    if (!store.has(file)) return;
    let raw = null;
    try { raw = store.read(file); } catch (e) { return; } // read denial — keep our snapshot
    let disk = null;
    try { disk = new Map(JSON.parse(raw)); } catch (e) { return; } // corrupt — our write replaces it
    let adopted = 0;
    for (const [id, agent] of disk) {
        if (_agents.has(id) || _seenIds.has(id)) continue;
        _agents.set(id, agent);
        _seenIds.add(id);
        adopted++;
    }
    if (adopted > 0) console.log('[agents] Adopted ' + adopted + ' agent(s) written by another process');
}

// NOT A LOCK (pass 106, PRD §8.3 F10): `_saveChain` is an IN-PROCESS
// write-ordering chain only — it serializes this process's own saves so they
// land in order. It provides NO cross-process guarantee; the roster's
// concurrency control is the lockfile acquired in _saveAgents() below
// (lock.pathFor('agents')). Do not treat the chain as a lock.
let _saveChain = Promise.resolve();
let _dirty = false;   // a mutation queued a save that has not landed yet

// (pass 95) No param: every caller passes the module registry anyway, and
// after the cross-process merge the ONLY correct snapshot to write is
// _agents itself (adoptions land there).
async function _saveAgents() {
    _dirty = true;
    const run = _saveChain.then(() => {
        const lockPath = _rosterLockPath();
        const res = lock.acquire(lockPath, { staleMs: 10000, waitMs: 8000 });
        if (!res.ok) {
            // (pass 103) FAIL CLOSED — refuse the unlocked whole-snapshot write.
            console.error('[agents] Roster lock ' + res.reason + ' — refusing unlocked write (fail-closed)');
            _dirty = false;
            return;
        }
        try {
            _mergeRosterNewcomers();
            _getAgentStore().write(_getAgentStoreFile(), JSON.stringify(Array.from(_agents)));
            _dirty = false;
        } finally {
            lock.release(lockPath);
        }
    }).catch(e => {
        console.warn('[agents] Save failed:', e.message);
        throw e;
    });
    // Keep the chain alive even if a write fails (next save must not
    // inherit a rejected tail — the failure is logged, not fatal).
    _saveChain = run.catch(() => {});
    return run;
}

/**
 * (pass 88) Drain pending agent-roster persistence. Resolves after every
 * queued save has landed (or failed loudly). Call before process.exit()
 * in CLI flows; also wired to 'beforeExit' below as a safety net for
 * library scripts that drain naturally (explicit process.exit() bypasses
 * beforeExit — bins must flush themselves).
 */
async function flushAgents() {
    if (_dirty) return _saveAgents(_agents);
    return _saveChain;
}

// Safety net: natural loop drain re-queues a pending save. (beforeExit can
// fire several times; scheduling work here keeps the loop alive until the
// write's own I/O settles. Explicit process.exit() skips this — bins must
// flush.)
try {
    process.on('beforeExit', () => { if (_dirty) _saveAgents(_agents); });
} catch (e) { /* non-node environment — nothing to hook */ }

async function _loadAgents() {
    const _regStore = _getAgentStore();
    const AGENT_STORE_FILE = _getAgentStoreFile();
    if (_regStore.has(AGENT_STORE_FILE)) {
        let raw = null;
        try {
            raw = _regStore.read(AGENT_STORE_FILE);
        } catch (e) {
            // (pass 31, stress B4) Read DENIAL is not corruption — resetting
            // here would silently swap the roster for an empty map and the
            // next save would WIPE it. Loud throw beats silent data loss.
            const err = new Error('[agents] Agent store read denied (not resetting): ' + e.message);
            err.code = 'E_AGENT_STORE_READ';
            throw err;
        }
        try {
            return new Map(JSON.parse(raw));
        } catch (e) {
            // Parse failure IS corruption — safe to reset (content unusable).
            console.warn('[agents] Agent store corrupted, resetting:', e.message);
        }
    }
    return new Map();
}

// Hydrate agents on load (same load-time contract as the monolith)
(async () => {
    const stored = await _loadAgents();
    for (const [id, agent] of stored) {
        _agents.set(id, agent);
        _noteAgentSeen(id);
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
    flushAgents,
    _noteAgentSeen,

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
