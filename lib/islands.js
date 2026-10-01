const errors = require('./error');
/**
 * Islands (v0.8.6)
 * AI-first lazy-loadable brain components
 * WITH EVENT EMISSIONS - hydration status emits globally
 *
 * Integrates with: brain, search
 * Format: yaml, json, md, txt (via format.js)
 *
 * SECURITY: Recursion guard to prevent infinite island loading
 *
 * MULTI-BRAIN: Loads from brain stack (top to bottom)
 */

const path = require('path');
const fs = require('fs');
const sudo = require('./sudo');
const vaf = require('./vaf');
const Storage = require('./storage');
const brain = require('./brain');
const format = require('./format');
const guard = require('./recursion');  // Unified recursion guard

// ==================== MULTI-BRAIN HELPERS ====================

/**
 * Get all brain paths from stack (top to bottom)
 * For multi-brain island loading
 */
function _getStackPaths() {
    const stack = brain.getStack() || ['default'];
    const paths = [];
    for (const brainName of stack) {
        try {
            const brainInfo = brain.resolveBrainPath(brainName);
            if (brainInfo && brainInfo.path) {
                paths.push({ name: brainName, path: brainInfo.path });
            }
        } catch (e) {
            // Brain might not exist, skip
        }
    }
    return paths;
}


function _checkRead(userCtx, resource) {
    const sandbox = _getSandbox();
    if (sandbox && sandbox.can && !sandbox.can('canRead')) {
        throw new errors.VantError('ECAP: read not allowed', { code: errors.CODES.CAPABILITY_NOT_ALLOWED });
    }
    if (userCtx && sandbox && sandbox.rls) {
        sandbox.rls.checkRead(userCtx, resource, 'read');
    }
}

// ==================== ISLAND BOUNDARIES (pass 84) ====================
// The boundary policy shape promised island-level RLS (resource key
// `_island:<name>` — same convention lib/rls.js documented) but NOTHING
// consulted it at island load time. Enforcement lives here now:
//   - load()/hydrate()/save() resolve an RLS subject (explicit userCtx,
//     else the current agent's habitat identity, else anonymous) and
//     check it against the boundary policy BEFORE any content moves.
//   - Row-level policy fields apply to island DATA: filter strips fields,
//     mask redacts to '[masked]' (habitat._applyPolicy semantics).
//   - Anonymous (no ctx anywhere) may READ default-policy islands but
//     never WRITE — writes fail closed with E_ISLAND_WRITE_DENIED.
//   - NO policy at all = open island (pre-84 behavior preserved for the
//     60+ existing islands/tests; opt-in via vant habitat policy).
// Denials emit island:denied for the audit trail.

function _resolveRlsContext(options) {
    const o = options || {};
    if (o.userCtx) return o.userCtx;
    try {
        const agents = require('./agents');
        const current = agents.getCurrentAgentId ? agents.getCurrentAgentId() : null;
        if (current && current !== 'default' && agents.agentContext) {
            const ctx = agents.agentContext(current);
            if (ctx) return ctx;
        }
    } catch (e) { /* agents unavailable — fall through to anonymous */ }
    return null;  // anonymous
}

async function _islandBoundaryCheck(name, mode, options) {
    const habitat = require('./habitat');
    if (!habitat.getShared) return true;  // legacy tolerance (no habitat module)
    const h = habitat.getShared();
    if (!h || !h.boundaries) return true;

    const policy = h.boundaries['_island:' + name];
    if (!policy) return true;  // no policy = open island (pre-84 behavior)

    const userCtx = _resolveRlsContext(options);

    // Writes: anonymous is denied outright (fail closed).
    if (mode === 'write' && !userCtx) {
        _emit('island:denied', { name, mode, reason: 'anonymous_write', timestamp: Date.now() });
        throw new errors.VantError('Island write denied: ' + name + ' (no RLS context)', {
            code: 'E_ISLAND_WRITE_DENIED', retryable: false
        });
    }

    const allowed = await h.can(userCtx, '_island:' + name, mode);
    if (!allowed) {
        _emit('island:denied', {
            name, mode,
            userId: userCtx ? (userCtx.userId || userCtx.agentId) : null,
            workspace: userCtx ? userCtx.workspace : null,
            timestamp: Date.now()
        });
        throw new errors.VantError('Island access denied: cannot ' + mode + ' ' + name, {
            code: 'RLS_DENIED', retryable: false
        });
    }
    return policy;
}

/**
 * (pass 84) Sync twin of the boundary check for the synchronous save()
 * path. Same policy semantics, without async can(): container isolation +
 * _matches run inline via containerAdmits + the habitat's rule matcher.
 */
function _islandBoundaryCheckSync(name, mode, options) {
    const habitat = require('./habitat');
    if (!habitat.getShared) return true;
    const h = habitat.getShared();
    if (!h || !h.boundaries) return true;

    const policy = h.boundaries['_island:' + name];
    if (!policy) return true;

    const userCtx = _resolveRlsContext(options);

    if (mode === 'write' && !userCtx) {
        _emit('island:denied', { name, mode, reason: 'anonymous_write', timestamp: Date.now() });
        throw new errors.VantError('Island write denied: ' + name + ' (no RLS context)', {
            code: 'E_ISLAND_WRITE_DENIED', retryable: false
        });
    }

    // Sync decision: container isolation first, then rule match — mirroring
    // habitat.can() exactly, minus the async wrapper.
    if (userCtx) {
        if (!h.containerAdmits(userCtx, '_island:' + name)) {
            _emit('island:denied', { name, mode, userId: userCtx.userId || userCtx.agentId, reason: 'container', timestamp: Date.now() });
            throw new errors.VantError('Island access denied: cannot ' + mode + ' ' + name, { code: 'RLS_DENIED', retryable: false });
        }
        const rules = (mode === 'write') ? (policy.writableBy || []) : (policy.readableBy || []);
        if (!h._matches(rules, userCtx)) {
            _emit('island:denied', { name, mode, userId: userCtx.userId || userCtx.agentId, timestamp: Date.now() });
            throw new errors.VantError('Island access denied: cannot ' + mode + ' ' + name, { code: 'RLS_DENIED', retryable: false });
        }
    } else {
        // Anonymous reads still honor explicit rules when the policy is
        // stricter than public.
        const rules = (mode === 'write') ? (policy.writableBy || []) : (policy.readableBy || []);
        if (!h._matches(rules, {})) {
            _emit('island:denied', { name, mode, reason: 'anonymous', timestamp: Date.now() });
            throw new errors.VantError('Island access denied: cannot ' + mode + ' ' + name, { code: 'RLS_DENIED', retryable: false });
        }
    }
    return policy;
}

/**
 * (pass 84) Apply a boundary policy's row-level filter/mask to island
 * DATA before returning it (habitat._applyPolicy semantics).
 */
function _islandApplyPolicy(data, policy) {
    if (data === null || data === undefined) return data;
    if (!policy) return data;
    const habitat = require('./habitat');
    if (!policy.filter && !policy.mask) return data;
    try {
        return habitat.getShared()._applyPolicy(data, policy);
    } catch (e) {
        return data;  // habitat unavailable — return raw (policy was informational)
    }
}

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

// Static corpus-based islands load from brain router
// Lazy islands use storage for dynamic data
let _islands = null;

const DEFAULT_ISLANDS = {
    // Static: loaded from brain corpus
    identity: { name: 'Identity', type: 'static', source: 'corpus', triggers: [] },
    learnings: { name: 'Learnings', type: 'static', source: 'corpus', triggers: [] },
    decisions: { name: 'Decisions', type: 'static', source: 'corpus', triggers: [] },
    // Lazy: dynamic data in storage
    github: { name: 'GitHub', type: 'lazy', source: 'storage', triggers: ['github', 'pr', 'issue', 'push', 'repo', 'commit', 'branch'] },
    gitlab: { name: 'GitLab', type: 'lazy', source: 'storage', triggers: ['gitlab', 'merge', 'mr'] },
    bitbucket: { name: 'Bitbucket', type: 'lazy', triggers: ['bitbucket'] },
    linear: { name: 'Linear', type: 'lazy', triggers: ['linear', 'project', 'issue', 'tracker'] },
    // v0.9.0: Trust & Market
    trust: { name: 'Trust', type: 'lazy', source: 'runtime', triggers: ['trust', 'reputation', 'score'] },
    market: { name: 'Market', type: 'lazy', source: 'runtime', triggers: ['market', 'trade', 'listing', 'bid'] },
    evolution: { name: 'Evolution', type: 'lazy', source: 'runtime', triggers: ['evolution', 'session', 'insight', 'learning'] }
};

// SYNC fallback for sync functions that can't await getManifest()
// Uses defaults + cached file data if available
let _manifestCache = null;
function _getManifestSync() {
    if (!_manifestCache) {
        _manifestCache = {
            version: '1.0',
            islands: DEFAULT_ISLANDS,
            loaded: [],
            hydrated: []
        };
    }
    return _manifestCache;
}

const MANIFEST_FILE = 'islands.json';

// (storage migration) Manifest and static-island brain files route through the
// shared models FileStorage (containment/symlink/VAF/atomic-write). Islands
// follow the CURRENT brain (getBrainPath() resolves per call), so like
// succession/audit the store is models-rooted and paths are made
// store-relative per call - pushBrain() semantics stay intact.
// CWD-anchored like the brain runtime (see lib/brain.js _brainModelsRoot):
// package-anchoring computed '../' escapes out of the store base in any
// installed project and the containment check blocked them ('Path blocked').
const _islandsModelRoot = path.resolve(process.cwd(), 'models');
let _islandsStore = null;
function _getStore() {
    if (!_islandsStore) {
        _islandsStore = new Storage.FileStorage({ basePath: _islandsModelRoot });
    }
    return _islandsStore;
}
function _modelsRel(...segs) {
    return path.relative(_islandsModelRoot, path.join(...segs));
}

// Island names become brain-file path segments - restrict to safe charset
// (complements vaf.check's type/length check with traversal/charset safety)
function vafSafeName(name) {
    return typeof name === 'string' && name.length > 0 && name.length <= 50
        && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)
        && !name.includes('..');
}

/**
 * Load manifest from file if exists (format.js - supports all 4)
 */
async function _loadManifestFile() {
    const brainPath = brain.getBrainPath();
    const rel = _modelsRel(brainPath, '..', MANIFEST_FILE);
    try {
        const content = _getStore().read(rel);
        if (content) {
            // Use format for auto-detect: yaml, json, md, txt
            const result = await format.parse(content, { format: 'json' });
            if (result.data) {
                return result.data;
            }
        }
    } catch (e) { console.warn("[islands] Manifest load:", e.message); }
    return null;
}

/**
 * Save manifest to file (format.js - auto-serialize)
 */
async function _saveManifestFile(m) {
    const brainPath = brain.getBrainPath();
    // Auto-detect format from extension - currently .json
    // Can transition to .yaml by renaming file
    await _getStore().write(_modelsRel(brainPath, '..', MANIFEST_FILE), JSON.stringify(m, null, 2));
}

/**
 * Get islands manifest (async - uses format.js)
 */
async function getManifest() {
    // Use file-based manifest (async)
    const fileManifest = await _loadManifestFile();
    if (fileManifest && fileManifest.islands) {
        return {
            version: fileManifest.version || '1.0',
            islands: { ...DEFAULT_ISLANDS, ...fileManifest.islands },
            loaded: fileManifest.loaded || [],
            hydrated: fileManifest.hydrated || []
        };
    }
    // Fallback to defaults
    return { version: '1.0', islands: DEFAULT_ISLANDS, loaded: [], hydrated: [] };
}

/**
 * Save manifest (async - uses format.js)
 */
async function saveManifest(m) {
    // Use file-based save (async)
    await _saveManifestFile(m);
}

/**
 * Load island by name
 * Routes based on island type:
 * - 'static' (source: corpus): loads from brain router
 * - 'lazy' (source: storage): loads from storage
 * @param {string} name - Island name
 * @returns {Promise<Object|null>} Island data
 */
async function load(name, options = {}) {
    // Recursion guard: prevent infinite island loading loops
    const depthCheck = guard.check('island:' + name);
    if (!depthCheck.allowed) {
        throw new errors.VantError('Island recursion exceeded', { code: errors.CODES.BRAIN_LOAD_FAIL });
    }

    vaf.check(name, { type: 'string', maxLength: 50 });

    try {
        // (pass 84) Boundary enforcement BEFORE any content moves. Islands
        // with a habitat boundary policy (_island:<name>) are RLS-gated;
        // policy-less islands stay open (pre-84 behavior).
        const boundaryPolicy = await _islandBoundaryCheck(name, 'read', options);

        const m = await getManifest();  // FIX: getManifest is async - was missing await
        const def = m.islands[name];

        // Static islands: load from brain corpus (multi-brain: try stack)
        if (def?.type === 'static' || def?.source === 'corpus') {
            // If specific brain requested, use that brain's path
            // (storage migration: raw brain-file text through the store -
            // fixes the old contract bug where the format.parse wrapper object
            // was returned as `content`; consumers expect a string per the
            // islands.load() contract)
            if (options.brain) {
                const brainInfo = brain.resolveBrainPath(options.brain);
                if (brainInfo) {
                    const content = _getStore().read(_modelsRel(brainInfo.path, name + '.md'));
                    if (content !== null) {
                        return { name, content, source: options.brain, type: 'corpus' };
                    }
                }
                return null;
            }

            // Otherwise try each brain in stack (top to bottom)
            const stackPaths = _getStackPaths();
            for (const { name: brainName, path: brainPath } of stackPaths) {
                const content = _getStore().read(_modelsRel(brainPath, name + '.md'));
                if (content !== null) {
                    // (pass 84) Row-level filter/mask applies to data islands;
                    // corpus content is a string and passes through untouched.
                    return { name, content, source: brainName, type: 'corpus' };
                }
            }
            return null;
        }

        // Lazy islands: use storage
        if (def?.source === 'storage') {
            const island = _islands || Storage.get('island');
            const data = island.get(name);
            if (data && !data.error) return _islandApplyPolicy(data, boundaryPolicy);
        }

        // Runtime islands: load from runtime modules (trust, market)
        if (def?.source === 'runtime') {
            if (name === 'trust') {
                const trust = require('./trust');
                return { name, type: 'runtime', module: trust, data: _islandApplyPolicy(trust.export(), boundaryPolicy) };
            }
            if (name === 'market') {
                const market = require('./market');
                return { name, type: 'runtime', module: market, data: _islandApplyPolicy(market.stats(), boundaryPolicy) };
            }
        }

        return null;
    } finally {
        // Release recursion guard
        guard.release('island:' + name);
    }
}

/**
 * Honest status of an island.
 *
 * Historically load() returned null for THREE different situations: unknown
 * island, known lazy island that was never populated, and no corpus file.
 * Consumers couldn't tell "wired feature with no data yet" apart from
 * "nothing exists here". status() distinguishes them.
 *
 * @param {string} name - Island name
 * @returns {Promise<Object>} { name, exists, type, source, populated }
 */
async function status(name) {
    vaf.check(name, { type: 'string', maxLength: 50 });

    const m = await getManifest();
    const def = m.islands[name];

    if (!def) {
        return { name, exists: false, populated: false };
    }

    const info = {
        name,
        exists: true,
        type: def.type || null,
        source: def.source || null,
        populated: false
    };

    if (def.type === 'static' || def.source === 'corpus') {
        const stackPaths = _getStackPaths();
        info.populated = stackPaths.some(({ path: brainPath }) =>
            _getStore().has(_modelsRel(brainPath, name + '.md')));
    } else if (def.source === 'storage') {
        const island = _islands || Storage.get('island');
        const data = island.get(name);
        info.populated = !!(data && !data.error);
    } else if (def.source === 'runtime') {
        // Runtime islands read live module state - always available
        info.populated = true;
    }

    return info;
}

/**
 * Save island data
 * @param {string} name - Island name
 * @param {Object} data - Island data
 */
function save(name, data, options = {}) {
    vaf.check(name, { type: 'string', maxLength: 50 });

    const m = _getManifestSync();
    if (!m.islands[name]) {
        throw new errors.VantError('Unknown island', { code: errors.CODES.VAF_INPUT_INVALID });
    }

    // (pass 84) Boundary enforcement on writes: a policy'd island refuses
    // anonymous writers outright and checks writableBy for identified ones.
    _islandBoundaryCheckSync(name, 'write', options);

    // Use island storage. (pass 84 FIX) IslandStorage's API is get/set —
    // save() called island.write(...) which NEVER existed, so every
    // storage-island save threw TypeError since inception (forum.js's
    // island-save silently swallowed it). Use set() with a JSON payload
    // (IslandStorage.set writes JSON via writeJson).
    const island = _islands || Storage.get('island');
    island.set(name, data);

    if (!m.loaded.includes(name)) {
        m.loaded.push(name);
    }
    saveManifest(m);
}

/**
 * Hydrate island (load into memory)
 * @param {string} name - Island name
 */
async function hydrate(name, options = {}) {
    // (pass 84) hydrate passes options through so load()'s boundary check
    // sees the caller's RLS context (or resolves the current agent's).
    const data = await load(name, options);
    if (!data) {
        _emit('island:hydrate:failed', { name, timestamp: Date.now() });
        return null;
    }

    const m = _getManifestSync();
    if (!m.hydrated.includes(name)) {
        m.hydrated.push(name);
    }
    saveManifest(m);

    // EVENT: island:hydrated
    _emit('island:hydrated', { name, timestamp: Date.now() });

    return data;
}

/**
 * Dehydrate island (remove from memory)
 * @param {string} name - Island name
 */
function dehydrate(name) {
    const m = _getManifestSync();
    const wasThere = m.hydrated.includes(name);
    m.hydrated = m.hydrated.filter(n => n !== name);
    saveManifest(m);

    if (wasThere) {
        // EVENT: island:dehydrated
        _emit('island:dehydrated', { name, timestamp: Date.now() });
    }
}

/**
 * Find islands matching prompt triggers
 * @param {string} prompt - User prompt
 * @returns {Array} Matching island names
 */
function findTriggers(prompt) {
    const p = prompt.toLowerCase();
    const m = _getManifestSync();
    const matches = [];

    for (const [name, island] of Object.entries(m.islands)) {
        if (island.triggers) {
            for (const trigger of island.triggers) {
                if (p.includes(trigger)) {
                    matches.push(name);
                    break;
                }
            }
        }
    }

    return matches;
}

/**
 * Auto-hydrate islands from prompt
 * @param {string} prompt - User prompt
 * @returns {Array} Hydrated island data
 */
async function autoHydrate(prompt) {
    const triggers = findTriggers(prompt);
    const hydrated = [];

    for (const name of triggers) {
        const data = await hydrate(name);
        if (data) hydrated.push(name);
    }

    return hydrated;
}

/**
 * Get currently hydrated islands
 * @returns {Array} Hydrated island names
 */
function getHydrated() {
    return _getManifestSync().hydrated || [];
}

/**
 * Get available islands
 * @returns {Array} Available island objects with {key, name, type}
 */
function getAvailable(userCtx) {
    if (userCtx) _checkRead(userCtx, '_islands:available');

    // Return actual island objects, not just keys
    const manifest = _getManifestSync();
    return Object.keys(manifest.islands).map(key => ({
        key,
        ...manifest.islands[key]
    }));
}

/**
 * Create new island (runtime proper - not CLI workaround)
 * @param {string} name - Island name
 * @param {Object} options - {type, source, triggers}
 * @returns {Object} Created island definition
 */
function createIsland(name, options = {}) {
    const { type = 'static', source = 'corpus', triggers = [] } = options;

    const m = _getManifestSync();

    if (m.islands[name]) {
        return { error: 'Island already exists: ' + name };
    }

    // Add new island to manifest
    m.islands[name] = {
        name: name.charAt(0).toUpperCase() + name.slice(1),
        type,
        source: type === 'static' ? 'corpus' : 'storage',
        triggers: triggers.map(t => t.toLowerCase())
    };

    saveManifest(m);

    // Also create brain file for static islands
    if (type === 'static' || source === 'corpus') {
        // (storage migration: name validated - island names become brain-file
        // path segments)
        if (!vafSafeName(name)) {
            throw new errors.VantError('Invalid island name', { code: errors.CODES.VAF_INPUT_INVALID });
        }
        const brainPath = brain.getBrainPath();
        const rel = _modelsRel(brainPath, name + '.md');
        if (!_getStore().has(rel)) {
            _getStore().write(rel, `# ${name}\n\nTODO: Add content for ${name} island.\n`);
        }
    }

    return { name, type, source, triggers };
}

/**
 * Update island triggers
 * @param {string} name - Island name
 * @param {Array} triggers - New triggers
 * @returns {Object} Updated island
 */
function updateTriggers(name, triggers) {
    const m = _getManifestSync();

    if (!m.islands[name]) {
        return { error: 'Island not found: ' + name };
    }

    m.islands[name].triggers = triggers.map(t => t.toLowerCase());
    saveManifest(m);

    return { name, triggers };
}

/**
 * Delete island
 * @param {string} name - Island name
 * @returns {Object} Result
 */
function deleteIsland(name) {
    const m = _getManifestSync();

    if (!m.islands[name]) {
        return { error: 'Island not found: ' + name };
    }

    delete m.islands[name];
    m.loaded = m.loaded.filter(n => n !== name);
    m.hydrated = m.hydrated.filter(n => n !== name);
    saveManifest(m);

    return { name, deleted: true };
}

/**
 * Enable island
 * @param {string} name - Island name
 * @returns {Object} Result
 */
function enableIsland(name) {
    const m = _getManifestSync();

    if (!m.islands[name]) {
        return { error: 'Island not found: ' + name };
    }

    m.islands[name].enabled = true;
    saveManifest(m);

    return { name, enabled: true };
}

/**
 * Disable island
 * @param {string} name - Island name
 * @returns {Object} Result
 */
function disableIsland(name) {
    const m = _getManifestSync();

    if (!m.islands[name]) {
        return { error: 'Island not found: ' + name };
    }

    m.islands[name].enabled = false;
    saveManifest(m);

    return { name, enabled: false };
}

/**
 * Get island definition
 * @param {string} name - Island name
 * @returns {Object} Island definition
 */
function getIsland(name) {
    const m = _getManifestSync();
    return m.islands[name] || null;
}

/**
 * Get summary
 */
function getSummary(userCtx) {
    if (userCtx) _checkRead(userCtx, '_islands:summary');

    return {
        name: 'Islands',
        type: 'brain-islands',
        version: '0.8.6',
        enabled: true,
        count: getAvailable().length,
        hydrated: getHydrated().length
    };
}

// ==================== EXPORTS ====================

module.exports = {
    Islands: class {
        constructor() {
            this.loaded = getHydrated();
        }
        getStatus() {
            return { enabled: true, count: getAvailable().length };
        }
    },

    // Core functions
    load,
    status,
    save,
    hydrate,
    dehydrate,
    findTriggers,
    autoHydrate,
    getHydrated,
    getAvailable,
    getManifest,
    createIsland,
    updateTriggers,
    deleteIsland,
    enableIsland,
    disableIsland,
    getIsland,

    // NEW FUNCTIONS: bulk + utility operations
    bulkCreate(islands) {
        // @param islands: [{name, type, triggers}, ...]
        const results = [];
        for (const opts of islands) {
            const r = createIsland(opts.name, opts);
            results.push(r);
        }
        return { created: results.length, results };
    },

    bulkDelete(names) {
        // @param names: ['island1', 'island2', ...]
        const results = [];
        for (const name of names) {
            const r = deleteIsland(name);
            results.push(r);
        }
        return { deleted: results.length, results };
    },

    exportAll() {
        // Export all islands as JSON
        const m = _getManifestSync();
        return { islands: m.islands, exported: Date.now() };
    },

    importOne(data) {
        // Import single island from JSON: {name, type, triggers, source}
        const { name, type = 'static', triggers = [], source = 'corpus' } = data;
        if (!name) return { error: 'name required' };
        return createIsland(name, { type, triggers, source });
    },

    findByTrigger(trigger) {
        // Find all islands matching a trigger word
        const all = getAvailable();
        return all.filter(i => i.triggers?.includes(trigger.toLowerCase()));
    },

    // (pass 84) Boundary introspection: which islands are RLS-gated, with
    // what rules? Reads the habitat's shared boundaries.
    listBoundaries() {
        try {
            const habitat = require('./habitat');
            const h = habitat.getShared ? habitat.getShared() : null;
            if (!h || !h.boundaries) return [];
            const out = [];
            for (const [key, policy] of Object.entries(h.boundaries)) {
                if (key.startsWith('_island:')) {
                    out.push({ island: key.slice(8), readableBy: policy.readableBy || [], writableBy: policy.writableBy || [], container: policy.container || 'default' });
                }
            }
            return out;
        } catch (e) {
            return [];
        }
    },

    // (pass 84) exposed for MCP islands_canAccess context resolution
    _resolveRlsContext,

    // Framework hooks
    getSummary,
    getLayerStatus: () => ({ name: 'Islands', type: 'islands', version: require('./version'), enabled: true }),
    isOperationAllowed: () => ({ allowed: true }),
    getStatus: () => ({ enabled: true })
};
