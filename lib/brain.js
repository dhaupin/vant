/**
 * Brain Router v2 (v0.8.6)
 * WITH EVENT EMISSIONS - brain loading/saving emits globally
 *
 * Single source of truth for brain loading with:
 * - Registry: register handlers dynamically
 * - Pipeline: composable chains per brain type
 * - Hooks: beforeLoad, afterLoad, onMiss handlers
 * - Aliases: brain name mappings
 * - Transformers: content transformations on load/save
 * - Lazy middleware: dynamically add to chain
 *
 * All modules should require this, not manage paths themselves.
 *
 * SECURITY: Recursion guard to prevent brain load loops
 */

// ==================== EVENT SYSTEM ====================
// Re-use lazy-loaded _event from brain.js internal state

// Known bootstrap-window circular requires (storage <-> brain <-> vaf/sandbox
// retry loaders) emit Node's 'Accessing non-existent property ... inside
// circular dependency' warning on every CLI run. All cycle accessors here are
// guarded and self-heal post-boot (see _getVaf/_getSandboxMod/_getBrainFileStore),
// so the warning is noise for users. Take over the warning channel: drop only
// that class, reprint every other warning exactly as Node's default printer did.
process.removeAllListeners('warning');
process.on('warning', (w) => {
    const msg = w && w.message || '';
    if (msg.includes('inside circular dependency')) return;
    console.error(`(node:${process.pid}) [${w && w.name || 'Warning'}] ${msg}`);
    if (w && w.stack) console.error(w.stack.split('\n').slice(1).join('\n'));
});

const fs = require('fs');
const sudo = require('./sudo');
const errors = require('./error');
const path = require('path');
const guard = require('./recursion');  // Unified recursion guard

// Format handler for multi-format brain files
let _format = null;
function _getFormat() {
    if (!_format) {
        try { _format = require('./format'); } catch (e) {}
    }
    return _format;
}


// Write lock to prevent concurrent writes

// VAF for security validation
let _vaf = null;
function _getVaf() {
    if (!_vaf) {
        try { _vaf = require('./vaf'); } catch (e) {}
    }
    return _vaf;
}

// v0.9.0 fs->storage migration (slices 1-4): state persistence, brain-file
// read/write helpers, tmp-space APIs, sandbox brain handlers, brain-tree
// reads (read/hasBrain/_loadBrain/myStuff) and existence checks
// (switchBrain/getPublicPath) route through FileStorage
// (containment/symlink/VAF/atomic-write). Directory enumeration stays on fs
// (pattern-glob limitation) with paths anchored to brain roots.
// NOTE: lazily initialized - storage.js itself reads brain.getBrainPath() at
// its module load, so a top-level require here would be circular (see B-3).
// During that window the _bfs* helpers fall back to anchored fs (fixed
// models/<...> paths only); once boot completes every call hits the store.
// Runtime brain root is CWD-anchored ('models/' in the project Vant runs
// in), matching getBrainPath()/getPublicPath() and the seeder in bin/start.js.
// Package-anchoring here made every store read compute '../' escapes out of
// its own base - fine in the vant repo itself (CWD == package), silently
// blocked as VAF_PATH_BLOCKED everywhere else (fresh installs, MCP, agents).
const _brainModelsRoot = path.resolve(process.cwd(), 'models');
let _brainFileStore = null;
function _getBrainFileStore() {
    if (!_brainFileStore) {
        try {
            const Storage = require('./storage');
            if (typeof Storage.FileStorage === 'function') {
                _brainFileStore = new Storage.FileStorage({
                    basePath: _brainModelsRoot
                });
            }
            // else: circular bootstrap window - storage module not fully
            // loaded yet; helpers above fall back to anchored fs until the
            // next call after boot completes.
        } catch (e) {
            // storage unavailable - anchored fs fallback (fixed paths only)
        }
    }
    return _brainFileStore;
}

// Slice 2: tmp-space APIs (myStuff/yourStuff/dropbox/handlers). These used
// getBrainStorage().path which is undefined, silently landing in ./storage.
// Now anchored at models/tmp-space via FileStorage.
let _tmpSpaceStore = null;
function _getTmpSpaceStore() {
    if (!_tmpSpaceStore) {
        const Storage = require('./storage');
        _tmpSpaceStore = new Storage.FileStorage({
            basePath: path.resolve(process.cwd(), 'models', 'tmp-space')
        });
    }
    return _tmpSpaceStore;
}

// Names that become path segments are validated before interpolation.
function _validBrainSegment(seg) {
    if (typeof seg !== 'string' || !seg || seg.length > 100) return false;
    if (!/^[A-Za-z0-9][A-Za-z0-9._ -]*$/.test(seg)) return false;
    if (seg.includes('..')) return false;
    return true;
}

// Slice 4: brain-tree I/O routes through the brain FileStore (containment,
// symlink, VAF, atomic write). _brainRel converts an absolute brain-tree path
// into a store-relative one. Directory enumeration stays on fs (pattern-glob
// limitation, per the prune.js precedent) with paths anchored to brain roots.
//
// CIRCULAR BOOTSTRAP WINDOW: storage.js requires brain.js and calls
// getBrainPath()/getPublicPath() during its own module load, so constructing
// the store there (which needs storage.FileStorage) can deadlock on the
// half-initialized module. During that window these helpers fall back to
// direct fs on the same anchored paths — every fallback call site is a fixed
// models/<...> path, never caller-supplied input.
let _circularWindowWarned = false;
function _warnCircularOnce() {
    if (!_circularWindowWarned) {
        _circularWindowWarned = true;
        console.warn('[brain] storage bootstrap window: fs fallback for fixed brain path');
    }
}
function _bfsRead(relPath) {
    const store = _getBrainFileStore();
    if (store) return store.read(relPath);
    _warnCircularOnce();
    const full = path.resolve(_brainModelsRoot, relPath);
    try { return fs.readFileSync(full, 'utf8'); } catch (e) { return null; }
}
function _bfsReadRaw(relPath) {
    const store = _getBrainFileStore();
    if (store) return store.readRaw(relPath);
    _warnCircularOnce();
    const full = path.resolve(_brainModelsRoot, relPath);
    try { return fs.readFileSync(full, 'utf8'); } catch (e) { return null; }
}
function _bfsHas(relPath) {
    const store = _getBrainFileStore();
    if (store) return store.has(relPath);
    _warnCircularOnce();
    return fs.existsSync(path.resolve(_brainModelsRoot, relPath));
}
function _bfsWrite(relPath, content) {
    const store = _getBrainFileStore();
    if (store) return store.write(relPath, content);
    _warnCircularOnce();
    // (P2 #27) bootstrap-window fallback — atomic so a crash mid-write can
    // never leave a truncated brain file. atomicWriteFile mkdirs its own dir
    // and needs no storage dep (cycle-safe by construction).
    const full = path.resolve(_brainModelsRoot, relPath);
    require('./primitives').atomicWriteFile(full, content);
    return true;
}
function _brainRel(root, ...segs) {
    return path.relative(_brainModelsRoot, path.join(root, ...segs));
}
let _saveStatePromise = null;

// ==================== STATE PERSISTENCE (ASYNC ONLY) ====================
async function _loadState() {
    try {
        const content = _bfsHas('state.json') ? _bfsRead('state.json') : null;
        if (!content) throw new Error('no state file');
        const state = JSON.parse(content);
        // Load stack from state if present
        if (state.stack && Array.isArray(state.stack)) {
            _brainStack = state.stack;
            // MULTIBRAIN: Restore currentBrain from stack[0]
            if (state.stack.length > 0) {
                _currentBrain = state.stack[0];
            }
        }
        return state;
    } catch (e) {
        return { neurons: {}, stack: [] };
    }
}

async function _saveState(state) {
    // If a save is already in progress, wait for it to complete first
    if (_saveStatePromise) {
        await _saveStatePromise;
    }

    // Create the save promise and store it
    const doSave = async () => {
        // Save stack because _loadState resets _brainStack from file!
        const stackToSave = [..._brainStack];
        // Also preserve current mode (from _mode variable)
        const modeToSave = _mode;

        // FIX: Read file directly without using _loadState (which resets _brainStack!)
        let current;
        try {
            const content = _bfsRead('state.json');
            current = content ? JSON.parse(content) : null;
            if (!current) current = { neurons: {}, stack: [] };
        } catch (e) {
            current = { neurons: {}, stack: [] };
        }

        // SECURITY: Prevent prototype pollution - filter dangerous keys
        const safeState = {};
        for (const [key, value] of Object.entries(state || {})) {
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                continue;
            }
            safeState[key] = value;
        }
        current.neurons = { ...current.neurons, ...safeState };
        // Use saved stack instead of current _brainStack
        current.stack = stackToSave;
        // Preserve mode - either from state param or from _mode variable
        if (state?.mode) {
            current.mode = state.mode;
        } else if (modeToSave) {
            current.mode = modeToSave;
        }
        // FIX: Also preserve currentBrain in state
        if (state?.currentBrain) {
            current.currentBrain = state.currentBrain;
        } else if (_currentBrain) {
            current.currentBrain = _currentBrain;
        }
        current.updated = new Date().toISOString();
        _bfsWrite('state.json', JSON.stringify(current, null, 2));
    };

    _saveStatePromise = doSave();
    try {
        await _saveStatePromise;
    } finally {
        _saveStatePromise = null;
    }
}

function getNeuronState() {
    return _loadState().then(s => s.neurons || {});
}

function saveNeuronState(state) {
    return _saveState({ neurons: state });
}

// FIX: Add missing restoreNeuronState function
async function restoreNeuronState(state) {
    if (!state || typeof state !== 'object') {
        throw new errors.VantError('Invalid neuron state', { code: errors.CODES.BRAIN_LOAD_FAIL });
    }

    // Get current state
    const current = await _loadState();

    // Merge with provided state
    current.neurons = { ...current.neurons, ...state };
    current.updated = new Date().toISOString();

    // Save directly without going through _saveState (which would read file first)
    // (through storage layer - atomic write)
    _getBrainFileStore().write('state.json', JSON.stringify(current, null, 2));

    // Note: We just saved the state to disk. The synapses and attention
    // will be reloaded from disk when getNeuronState() is called.

    return current.neurons;
}

// ==================== EXISTING MODULE INTEGRATIONS ====================
// All existing app modules - brain wires to these
let _storage = null;
let _search = null;
let _islands = null;
let _config = null;
let _cache = null;
let _lock = null;
let _audit = null;
let _vectorStore = null;
let _cron = null;
let _msg = null;
let _agents = null;
let _encrypt = null;
let _stego = null;
let _qos = null;
let _network = null;
let _sandbox = null;
let _event = null;
let _storageModule = null;
let _corpusCache = null;
let _corpusCacheMode = null;
let _recursion = null;

const getStorage = () => { if (!_storage) try { _storage = require('./storage'); } catch (e) {} return _storage; };
const getSearch = () => { if (!_search) try { _search = require('./search'); } catch (e) {} return _search; };
const getIslands = () => { if (!_islands) try { _islands = require('./islands'); } catch (e) {} return _islands; };
const getConfig = () => { if (!_config) try { _config = require('./config'); } catch (e) {} return _config; };
// v0.9.0-axolotl T13b: brain owns its own Cache instance. The
// `defaultCache` singleton export from lib/cache.js is gone; callers
// must instantiate. This eliminates a global module-level cache
// shared across all consumers of the singleton.
const getCache = () => { if (!_cache) try { _cache = new (require('./cache').Cache)(); } catch (e) {} return _cache; };
const getLock = () => { if (!_lock) try { _lock = require('./lock'); } catch (e) {} return _lock; };
const getAudit = () => { if (!_audit) try { _audit = require('./audit'); } catch (e) {} return _audit; };
const getVectorStore = () => { if (!_vectorStore) try { _vectorStore = require('./storage').get?.('vector'); } catch (e) {} return _vectorStore; };
const getCron = () => { if (!_cron) try { _cron = require('./cron'); } catch (e) {} return _cron; };
const getMsg = () => { if (!_msg) try { _msg = require('./msg'); } catch (e) {} return _msg; };
const getAgents = () => { if (!_agents) try { _agents = require('./agents'); } catch (e) {} return _agents; };
const getEncrypt = () => { if (!_encrypt) try { _encrypt = require('./encrypt'); } catch (e) {} return _encrypt; };
const getStego = () => { if (!_stego) try { _stego = require('./stego'); } catch (e) {} return _stego; };
const getQoS = () => { if (!_qos) try { _qos = require('./qos'); } catch (e) {} return _qos; };
const getNetwork = () => { if (!_network) try { _network = require('./network'); } catch (e) {} return _network; };
const getSandbox = () => { if (!_sandbox) try { _sandbox = require('./sandbox'); } catch (e) {} return _sandbox; };
const getRecursion = () => { if (!_recursion) try { _recursion = require('./recursion'); } catch (e) {} return _recursion; };

// Auto-chain through sandbox for capability + RLS
function _checkRead(userCtx, resource) {
    const sandbox = getSandbox();
    if (!sandbox) return;

    // Capability check
    if (sandbox.can && !sandbox.can('canRead')) {
        throw new errors.VantError('Capability denied', { code: errors.CODES.CAPABILITY_NOT_ALLOWED });
    }

    // Auto-chain to RLS for per-record
    if (userCtx && sandbox.rls) {
        sandbox.rls.checkRead(userCtx, resource, 'read');
    }
}

function _checkWrite(userCtx, resource) {
    const sandbox = getSandbox();
    if (!sandbox) return;

    // Capability check
    if (sandbox.can && !sandbox.can('canWrite')) {
        throw new errors.VantError('Capability denied', { code: errors.CODES.CAPABILITY_NOT_ALLOWED });
    }

    // Auto-chain to RLS for per-record
    if (userCtx && sandbox.rls) {
        sandbox.rls.checkWrite(userCtx, resource, 'write');
    }
}

// ==================== SECURITY CHAIN ====================

/**
 * Run security chain for brain operations
 * VAF → QoS → Escrow
 */
const pipeline = require('./pipeline');

async function _runBrainSecurityChain(operation, options = {}) {
    // (B-2) Single security chain — pipeline.runChain implements the canonical
    // sandbox gate -> vaf -> qos -> rls -> escrow(write) sequence with
    // fail-open ONLY for infrastructure unavailability. brain.js no longer
    // hand-rolls its own divergent copy (the old one skipped the sandbox
    // capability gate and swallowed vaf/escrow denials — see B-2 notes).
    const { cleanup } = await pipeline.runChain(operation, options);
    // brain-internal contract: callers hold a qos cleanup fn (or undefined)
    return cleanup;
}

const getEvent = () => { if (!_event) try { _event = require('./event'); } catch (e) {} return _event; };

// Event emit helper - uses brain's _event
function _emit(event, data) {
    const ev = getEvent();
    if (ev?.emit) {
        ev.emit(event, data);
    }
}

// Export aggregated module access
function getModule(name) {
    const modules = {
        storage: getStorage, search: getSearch, islands: getIslands, config: getConfig,
        cache: getCache, lock: getLock, audit: getAudit, vectorStore: getVectorStore,
        cron: getCron, msg: getMsg, agents: getAgents, encrypt: getEncrypt,
        stego: getStego, qos: getQoS, network: getNetwork, sandbox: getSandbox, event: getEvent
    };
    return modules[name]?.() || null;
}

// ==================== SANDBOX BRAIN HANDLERS ====================
// Wire brain file ops through sandbox for gating/control
function _wireBrainToSandbox() {
    const sb = getSandbox();
    if (!sb || !sb.registerBrainHandler) return;

    // Register brain handlers with sandbox
    // (slice 4: reads/existence through the brain FileStore — containment and
    // VAF checks now apply to sandbox-routed brain access)
    sb.registerBrainHandler('read', (filePath) => {
        if (!sb || !sb.can || !sb.can('canRead')) return null;
        return _bfsReadRaw(_brainRel(filePath));
    });

    sb.registerBrainHandler('exists', (filePath) => {
        if (!sb || !sb.can || !sb.can('canRead')) return false;
        return _bfsHas(_brainRel(filePath));
    });

    sb.registerBrainHandler('list', (dirPath, pattern) => {
        if (!sb || !sb.can || !sb.can('canRead')) return [];
        if (!fs.existsSync(dirPath)) return [];
        return fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
    });
}

// ==================== REGISTRY ====================
// Register handlers for sandbox, vaf, qos, escrow, etc.
const _registry = new Map();
// Default handlers (lazy-loaded)
const _defaults = {
    sandbox: () => { try { return require('./sandbox'); } catch (e) { return null; } },
    vaf: () => { try { return require('./vaf'); } catch (e) { return null; } },
    qos: () => { try { return require('./qos'); } catch (e) { return null; } },
    escrow: () => { try { return require('./escrow'); } catch (e) { return null; } }
};
const _handlers = new Map();

/**
 * Register a handler for a middleware type
 * @param {string} name - Handler name (sandbox, vaf, qos, escrow, custom...)
 * @param {function|object} handler - Handler function or object
 */
function register(name, handler) {
    // Block prototype pollution
    if (name === '__proto__' || name === 'constructor' || name === 'prototype') {
        throw new errors.Error('Invalid handler name: ' + name, { code: errors.CODES.BRAIN_HANDLER_INVALID, retryable: false });
    }
    _handlers.set(name, handler);
    _registry.set(name, { handler, registered: new Date().toISOString() });
}

/**
 * Drop a registered handler override so getHandler() falls back to the
 * default factory again. (_-prefixed test/careful-use DI — there was no way
 * to undo register() before, which made pipeline poisoning permanent.)
 */
function _clearHandlerOverride(name) {
    _handlers.delete(name);
    _registry.delete(name);
    return !_handlers.has(name);
}

/**
 * Get a registered handler
 * @param {string} name - Handler name
 * @returns {object|null} Handler
 */
function getHandler(name) {
    // For escrow, always check global first (boot sets it after init)
    // This must be checked BEFORE cache lookup to ensure boot's escrow is used
    if (name === 'escrow') {
        if (global._escrow) return global._escrow;
        // Also try defaults which checks global
        if (_defaults[name]) return _defaults[name]();
        return null;
    }
    // Check registered first
    if (_handlers.has(name)) {
        return _handlers.get(name);
    }
    // Fall back to defaults
    if (_defaults[name]) {
        return _defaults[name]();
    }
    return null;
}

/**
 * List all registered handlers
 * @returns {Array} Handler names
 */
function listHandlers() {
    return Array.from(new Set([..._registry.keys(), ...Object.keys(_defaults)])).sort();
}

// ==================== PIPELINE ====================
// Composable chains per brain type
// CRITICAL handlers: MUST succeed - hard fail if they error
const _criticalHandlers = new Set(['sandbox', 'vaf', 'qos', 'escrow']);
// Pipeline state for debugging
const _pipelineState = {
    lastError: null,
    lastFailedHandler: null,
    degraded: false,
    lastRun: null
};

const _pipelines = {
    dual: [],
    public: [],
    private: [],
    remote: []
};
// Default pipeline for each mode
const _defaultPipeline = ['sandbox', 'vaf', 'qos', 'escrow'];

/**
 * Get pipeline for mode
 * @param {string} mode - Brain mode
 * @returns {Array} Pipeline chain
 */
function getPipeline(mode) {
    return _pipelines[mode]?.length ? _pipelines[mode] : _defaultPipeline;
}

/**
 * Set pipeline for mode
 * @param {string} mode - Brain mode
 * @param {Array} chain - Handler names
 */
function setPipeline(mode, chain) {
    if (_pipelines[mode] !== undefined) {
        _pipelines[mode] = chain;
    }
}

/**
 * Add middleware to pipeline
 * @param {string} mode - Brain mode
 * @param {string} name - Handler name
 * @param {number} [pos] - Position (default: end)
 */
function addMiddleware(mode, name, pos) {
    if (!_pipelines[mode]) _pipelines[mode] = [];
    if (pos !== undefined) {
        _pipelines[mode].splice(pos, 0, name);
    } else {
        _pipelines[mode].push(name);
    }
}

/**
 * Remove middleware from pipeline
 * @param {string} mode - Brain mode
 * @param {string} name - Handler name
 */
function removeMiddleware(mode, name) {
    if (_pipelines[mode]) {
        _pipelines[mode] = _pipelines[mode].filter(h => h !== name);
    }
}

/**
 * Get pipeline state for debugging
 * @returns {Object} Pipeline diagnostic state
 */
function getPipelineState() {
    return {
        ..._pipelineState,
        chain: getPipeline('dual'),
        lastError: _pipelineState.lastError?.message || null,
        lastErrorStack: _pipelineState.lastError?.stack || null
    };
}

/**
 * Execute pipeline with proper error handling
 * @param {string} mode - Brain mode
 * @param {object} ctx - Context object
 * @param {function} final - Final handler
 */
async function executePipeline(mode, ctx, final) {
    const chain = getPipeline(mode);
    const errors = [];

    // Reset pipeline state
    _pipelineState.lastError = null;
    _pipelineState.lastFailedHandler = null;
    _pipelineState.degraded = false;
    _pipelineState.lastRun = new Date().toISOString();

    for (const name of chain) {
        const handler = getHandler(name);
        const isCritical = _criticalHandlers.has(name);

        if (!handler) {
            if (isCritical) {
                const err = new Error(`Critical handler not found: ${name}`);
                errors.push({ handler: name, error: err, critical: true });
                _pipelineState.lastError = err;
                _pipelineState.lastFailedHandler = name;
                _pipelineState.degraded = true;
                getAudit()?.error(`[BRAIN PIPELINE] FATAL: ${name} not available - cannot proceed`);
                throw err;
            }
            getAudit()?.warn(`[BRAIN PIPELINE] WARN: ${name} not available - skipping (optional)`);
            continue;
        }

        try {
            let result;

            // Execute handler based on its type
            if (typeof handler === 'function') {
                result = await handler(ctx);
            } else if (typeof handler?.run === 'function') {
                result = await handler.run(ctx);
            } else if (typeof handler?.can === 'function') {
                // Sandbox has can() for capability checks - use BEFORE execute
                // Sandbox can() checks capabilities (canRead, canWrite, etc) - NOT brain names
                // For loadBrain, we're doing 'read' operation
                try {
                    const capability = 'canRead';  // Load = read operation
                    result = handler.can(capability);
                    if (!result) {
                        throw new errors.Error('Pipeline blocked: ' + name + ' denied ' + capability + ' for ' + ctx.name, { code: errors.CODES.BRAIN_PIPELINE_BLOCKED, retryable: false });
                    }
                } catch (e) {
                    if (isCritical) throw e;
                    getAudit()?.warn(`[BRAIN PIPELINE] WARN: ${name}.can() failed - ${e.message}`);
                    continue;
                }
            } else if (typeof handler?.execute === 'function') {
                // QoS, Escrow use execute() method
                result = await handler.execute(ctx);
            } else if (typeof handler?.check === 'function') {
                // FIX: Pass ctx so handler can extract input (vaf.check now handles flexible ctx)
                // Was: ctx.name (brain name) - should be ctx (full context)
                result = await handler.check(ctx);
            } else {
                // Unknown handler type - warn but continue
                getAudit()?.warn(`[BRAIN PIPELINE] WARN: ${name} has no valid execute method - skipping`);
                continue;
            }

            getAudit()?.info(`[BRAIN PIPELINE] OK: ${name}`);

        } catch (e) {
            errors.push({ handler: name, error: e, critical: isCritical });

            if (isCritical) {
                // CRITICAL failure - STOP the chain
                _pipelineState.lastError = e;
                _pipelineState.lastFailedHandler = name;
                _pipelineState.degraded = true;

                getAudit()?.error(`[BRAIN PIPELINE] FATAL: ${name} threw error: ${e.message}`);
                getAudit()?.error(`[BRAIN PIPELINE] Stack: ${e.stack}`);

                // Emit error event for monitoring
                if (_getPubSub()) {
                    _getPubSub().publish('brain:pipeline:error', {
                        handler: name,
                        error: e.message,
                        critical: true,
                        timestamp: Date.now()
                    });
                }

                throw e;
            }

            // OPTIONAL handler failure - log and continue
            getAudit()?.warn(`[BRAIN PIPELINE] WARN: ${name} error - ${e.message} (optional - continuing)`);
        }
    }

    // If we get here with non-critical errors, log them but continue
    if (errors.length > 0) {
        _pipelineState.degraded = true;
        getAudit()?.warn(`[BRAIN PIPELINE] WARN: Pipeline finished with ${errors.length} error(s):`,
            errors.map(e => `${e.handler}: ${e.error.message}`).join(', '));
    }

    if (final) {
        return await final(ctx);
    }
}

// ==================== HOOKS ====================
// Lifecycle handlers
const _hooks = {
    beforeLoad: [],
    afterLoad: [],
    onMiss: [],
    beforeSave: [],
    afterSave: []
};

let _pubsub = null;

/**
 * Get event.js PubSub for brain events
 */
function _getPubSub() {
    if (!_pubsub) {
        const event = getEvent();
        if (event?.PubSub) {
            _pubsub = new event.PubSub();
        }
    }
    return _pubsub;
}

/**
 * Register a hook
 * @param {string} event - Hook event
 * @param {function} fn - Handler function
 */
function on(event, fn) {
    if (_hooks[event]) {
        _hooks[event].push(fn);
    }
    // Also register with event.js PubSub
    const ps = _getPubSub();
    if (ps?.subscribe) {
        ps.subscribe('brain:' + event, fn);
    }
}

/**
 * Remove a hook
 * @param {string} event - Hook event
 * @param {function} fn - Handler function
 */
function off(event, fn) {
    if (_hooks[event]) {
        _hooks[event] = _hooks[event].filter(h => h !== fn);
    }
    const ps = _getPubSub();
    if (ps?.unsubscribe) {
        ps.unsubscribe('brain:' + event, fn);
    }
}

/**
 * Emit a hook
 * @param {string} event - Hook event
 * @param {object} ctx - Context
 */
async function emit(event, ctx) {
    if (!_hooks[event]) return;
    for (const fn of _hooks[event]) {
        await fn(ctx);
    }
    // Also emit to event.js PubSub
    const ps = _getPubSub();
    if (ps?.publish) {
        ps.publish('brain:' + event, ctx);
    }
}

// ==================== ALIASES ====================
// Name mappings
const _aliases = {};

/**
 * Add alias for brain name
 * @param {string} alias - Alias
 * @param {string} name - Actual brain name
 */
function alias(alias, name) {
    _aliases[alias] = name;
}

/**
 * Resolve brain name from alias
 * @param {string} name - Brain name
 * @returns {string} Resolved name
 */
function resolve(name) {
    return _aliases[name] || name;
}

/**
 * Get all aliases
 * @returns {object} Alias map
 */
function listAliases() {
    return { ..._aliases };
}

// ==================== TRANSFORMERS ====================
// Content transformations
const _transformers = {
    load: [],
    save: []
};

/**
 * Add transformer
 * @param {string} type - 'load' or 'save'
 * @param {function} fn - Transformer function
 */
function transform(type, fn) {
    if (_transformers[type]) {
        _transformers[type].push(fn);
    }
}

/**
 * Apply transformers
 * @param {string} type - 'load' or 'save'
 * @param {object} brain - Brain object
 * @returns {object} Transformed brain
 */
async function applyTransforms(type, brain) {
    if (!_transformers[type]?.length) return brain;
    let result = { ...brain };
    for (const fn of _transformers[type]) {
        result = await fn(result) || result;
    }
    return result;
}

// ==================== FORMAT TRANSFORMER (v0.8.6) ====================
// Auto-detect and parse yaml, json, md, txt using format.js
try {
    const format = require('./format');

    transform('load', async (brain) => {
        if (!brain.content) return brain;

        const { name, content } = brain;
        if (!content) return brain;

        try {
            // Auto-detect format from name extension
            const detected = format.detectFromPath(name);
            const formatResult = format.parse(content, {
                format: detected.format,
                schema: 'workflow',  // Try workflow schema validation
                validate: false   // Don't fail on missing fields
            });

            if (formatResult.data && !formatResult.error) {
                // Return normalized data instead of raw content
                return {
                    ...brain,
                    content: formatResult.format === 'json'
                        ? JSON.stringify(formatResult.data)
                        : (formatResult.data.body || formatResult.data.intent || JSON.stringify(formatResult.data))
                };
            }
        } catch (e) {
            // Fall through - return original brain
        }
        return brain;
    });

} catch (e) {
    // format.js not available, skip transformer
}

// ==================== MODE SWITCH ====================
let _mode = 'dual';
let _remoteURL = null;

function getMode() { return _mode; }
function setMode(mode) {
    if (['dual', 'public', 'private', 'remote'].includes(mode)) {
        _mode = mode;
        // FIX: Persist mode to state.json
        _saveState({ mode: _mode }).catch(e => console.warn('[brain] Failed to save mode:', e.message));
    }
}
function getRemoteURL() { return _remoteURL; }
function setRemoteURL(url) { _remoteURL = url; }

// ==================== CACHE ====================
// In-memory brain cache (using existing cache.js)
const _brainCache = new Map();
let _cacheEnabled = true;
let _cacheTTL = 60000; // 1 minute default

/**
 * Enable/disable cache
 */
function setCache(enabled, ttl) {
    _cacheEnabled = enabled !== false;
    if (ttl) _cacheTTL = ttl;
    // Also configure real cache module
    const cache = getCache();
    if (cache?.configure) {
        cache.configure({ ttl: _cacheTTL });
    }
}

/**
 * Get cached brain
 * @param {string} name - Brain name
 * @returns {object|null} Cached brain or null
 */
function _getCached(name) {
    if (!_cacheEnabled) return null;
    const entry = _brainCache.get(name);
    if (!entry) {
        // Try real cache module
        const cache = getCache();
        if (cache?.get) {
            const data = cache.get('brain:' + name);
            if (data) return data;
        }
        return null;
    }
    // Check TTL
    if (Date.now() - entry.ts > _cacheTTL) {
        _brainCache.delete(name);
        return null;
    }
    return entry.data;
}

/**
 * Cache brain
 * @param {string} name - Brain name
 * @param {object} data - Brain data
 */
function _setCached(name, data) {
    if (!_cacheEnabled || !data) return;
    _brainCache.set(name, { data, ts: Date.now() });
    // Also store in real cache
    const cache = getCache();
    if (cache?.set) {
        cache.set('brain:' + name, data, { ttl: _cacheTTL });
    }
}

/**
 * Invalidate corpus cache (P2 #23 companion: sync pulls land brain files on
 * disk and must force the next loadCorpus() to re-read). Targets ONLY the
 * corpus cache — per-brain caches are handled by invalidateCache().
 */
function invalidateCorpusCache() {
    _corpusCache = null;
    _corpusCacheMode = null;
}

/**
 * Invalidate cache
 * @param {string} [name] - Specific brain or all
 */
function invalidateCache(name) {
    if (name) {
        _brainCache.delete(name);
        const cache = getCache();
        if (cache?.remove) cache.remove('brain:' + name);
    } else {
        _brainCache.clear();
        const cache = getCache();
        if (cache?.clear) cache.clear();
    }
}

/**
 * Get cache stats
 */
function getCacheStats() {
    const entries = [];
    for (const [name, { ts }] of _brainCache) {
        entries.push({ name, age: Date.now() - ts });
    }
    return {
        size: _brainCache.size,
        enabled: _cacheEnabled,
        ttl: _cacheTTL,
        entries
    };
}

// ==================== WATCHER ====================
// File system watcher for brain changes
let _watcher = null;
let _watchEnabled = false;

function _setupWatcher() {
    if (_watcher) return;
    const brainPath = getBrainPath();
    const publicPath = getPublicPath();
    try {
        _watcher = fs.watch(brainPath, { recursive: true }, (event, filename) => {
            if (filename?.endsWith('.md')) {
                invalidateCache(filename.replace('.md', ''));
                emit('brainChanged', { name: filename.replace('.md', ''), event });
            }
        });
    } catch (e) { console.warn("[brain] Watch error:", e.message); }
}

/**
 * Start/stop watching brain files
 */
function setWatch(enabled) {
    _watchEnabled = enabled;
    if (enabled && !_watcher) {
        _setupWatcher();
    }
}

/**
 * Check if watching
 */
function isWatching() {
    return _watchEnabled;
}

// ==================== HEALTH & METRICS ====================
const _metrics = {
    loads: 0,
    cacheHits: 0,
    errors: 0,
    loadTime: 0
};

// ==================== LOAD CIRCUIT BREAKER (P3 #34) ====================
//
// The audit flagged: repeated brain-load failures had no breaker, and
// _metrics.errors was reset-but-never-incremented (dead telemetry). load()
// mostly returns null gracefully, but three real paths THROW:
//   1. a pipeline-CRITICAL handler crash (sandbox/vaf/qos/escrow —
//      executePipeline re-throws critical failures straight through),
//   2. storage-layer errors on the options.brain direct-read path,
//   3. recursion-guard trips.
// A wedged storage layer or poisoned pipeline handler therefore hammers
// every load call forever. This breaker counts CONSECUTIVE thrown load
// failures; after `threshold` it short-circuits with a coded retryable
// VantError instead of invoking the failing machinery, and any successful
// load closes it again. Graceful null misses (brain not found — the dominant
// normal case) never feed it.
//
// Tunables: VANT_BRAIN_CIRCUIT_THRESHOLD (default 5),
// VANT_BRAIN_CIRCUIT_RESET_MS (default 30000 — reserved for time-based
// half-open; today recovery is success-through, matching qos.CircuitBreaker).
// Test injection: _setLoadCircuitThreshold().
let _loadCircuitThreshold = null; // null = resolve from env each getStatus
function _loadCircuitThresholdNow() {
    if (_loadCircuitThreshold !== null) return _loadCircuitThreshold;
    const n = parseInt(process.env.VANT_BRAIN_CIRCUIT_THRESHOLD, 10);
    return Number.isFinite(n) && n > 0 ? n : 5;
}
// Reset window: after the breaker has been OPEN this long, ONE probe load is
// allowed through (HALF-OPEN) — if it succeeds the breaker closes, if it
// fails the breaker re-opens. 0 disables probing (stay open until
// resetLoadCircuit()). Default 30s; test DI via _setLoadCircuitResetMs().
let _loadCircuitResetMs = null;
function _loadCircuitResetMsNow() {
    if (_loadCircuitResetMs !== null) return _loadCircuitResetMs;
    const n = parseInt(process.env.VANT_BRAIN_CIRCUIT_RESET_MS, 10);
    return Number.isFinite(n) && n >= 0 ? n : 30000;
}
const _loadCircuit = {
    failures: 0,
    state: 'CLOSED',       // CLOSED | OPEN | HALF_OPEN
    lastError: null,
    openedAt: 0,
    probing: false
};

function getLoadCircuitStatus() {
    return {
        state: _loadCircuit.state,
        failures: _loadCircuit.failures,
        threshold: _loadCircuitThresholdNow(),
        resetMs: _loadCircuitResetMsNow(),
        lastError: _loadCircuit.lastError ? String(_loadCircuit.lastError.message || _loadCircuit.lastError) : null,
        openedAt: _loadCircuit.openedAt || null
    };
}

function resetLoadCircuit() {
    _loadCircuit.failures = 0;
    _loadCircuit.state = 'CLOSED';
    _loadCircuit.lastError = null;
    _loadCircuit.openedAt = 0;
    _loadCircuit.probing = false;
    return true;
}

/**
 * Record a load FAILURE. Returns true when this failure flipped the breaker
 * (re-)open (callers may want to log that transition once).
 */
function _recordLoadFailure(err) {
    _metrics.errors++;
    _loadCircuit.failures++;
    _loadCircuit.lastError = err;
    const threshold = _loadCircuitThresholdNow();
    if (_loadCircuit.state !== 'OPEN' && _loadCircuit.failures >= threshold) {
        _loadCircuit.state = 'OPEN';
        _loadCircuit.openedAt = Date.now();
        _loadCircuit.probing = false;
        _emit('brain:load:circuit:open', {
            failures: _loadCircuit.failures,
            threshold,
            lastError: getLoadCircuitStatus().lastError,
            timestamp: _loadCircuit.openedAt
        });
        getAudit()?.error(`[brain] Load circuit OPEN after ${_loadCircuit.failures} consecutive failures: ${getLoadCircuitStatus().lastError}`);
        return true;
    }
    return false;
}

/**
 * Record a load SUCCESS — closes the breaker (also the HALF_OPEN probe
 * success path; matches the qos.CircuitBreaker recovery contract).
 */
function _recordLoadSuccess() {
    _loadCircuit.failures = 0;
    _loadCircuit.lastError = null;
    _loadCircuit.openedAt = 0;
    _loadCircuit.probing = false;
    _loadCircuit.state = 'CLOSED';
}

/** Test DI: override the reset window (null = back to env/default). */
function _setLoadCircuitResetMs(ms) {
    _loadCircuitResetMs = (Number.isFinite(ms) && ms >= 0) ? ms : null;
}

/** Test DI: override the threshold (null = back to env/default). */
function _setLoadCircuitThreshold(n) {
    _loadCircuitThreshold = (Number.isFinite(n) && n > 0) ? n : null;
}

/**
 * Get metrics
 */
function getMetrics() {
    return {
        ..._metrics,
        cacheHitRate: _metrics.loads > 0 ? _metrics.cacheHits / _metrics.loads : 0
    };
}

/**
 * Reset metrics
 */
function resetMetrics() {
    _metrics.loads = 0;
    _metrics.cacheHits = 0;
    _metrics.errors = 0;
    _metrics.loadTime = 0;
}

// ==================== NEURAL PATHWAYS ====================
// Synaptic weights: track brain access patterns for AI prediction
const _synapses = new Map(); // brainA -> { brainB: weight }
const _spikes = []; // unusual access events

/**
 * Fire synapse - track brain A → brain B access
 */
function fireSynapse(fromBrain, toBrain) {
    if (!_synapses.has(fromBrain)) _synapses.set(fromBrain, new Map());
    const weights = _synapses.get(fromBrain);
    weights.set(toBrain, (weights.get(toBrain) || 0) + 1);
}

/**
 * Predict next brain - get weighted path prediction
 */
function predictNext(currentBrain) {
    const weights = _synapses.get(currentBrain);
    if (!weights) return null;
    let max = 0, prediction = null;
    for (const [brain, w] of weights) {
        if (w > max) { max = w; prediction = brain; }
    }
    return prediction;
}

/**
 * Get all synaptic pathways
 */
function getSynapses() {
    const result = {};
    for (const [from, weights] of _synapses) {
        result[from] = Object.fromEntries(weights);
    }
    return result;
}

// ==================== METABOLISM ====================
// Resource management: auto-gc, attention decay
const _metabolism = { gcThreshold: 100, attentionDecay: 0.95 };
let _attention = new Map(); // brain -> attention score
let _lastLoaded = null; // track last loaded brain for synapse chaining

/**
 * Update attention score (0-1)
 */
function attend(brain, score) {
    _attention.set(brain, score);
}

/**
 * Get attention score
 */
function getAttention(brain) {
    return _attention.get(brain) || 0;
}

/**
 * NEW: Attend to brain by semantic similarity (auto-compute attention)
 * Uses embed to score how relevant brain is to query
 * Higher similarity = higher attention = prioritized in search
 */
async function attendBySemantic(query, brainNames = [], boost = 0.1) {
    const embed = require('./embed');

// Lazy-load Encrypt for optional encryption at rest
let _Encrypt = null;
function _getEncrypt() {
    if (!_Encrypt) {
        try { _Encrypt = require('./encrypt'); } catch (e) {}
    }
    return _Encrypt;
}
    const queryVec = await embed.generate(query);

    for (const name of brainNames) {
        // Get brain content
        const b = await load(name);
        const content = b?.content || b?.title || '';

        if (content) {
            const docVec = await embed.generate(content);
            const score = embed.cosineSimilarity(queryVec, docVec);

            // Boost existing attention by semantic score
            const current = getAttention(name);
            const newScore = Math.min(1, current + (score * boost));
            attend(name, newScore);
        }
    }

    return { boosted: brainNames.length };
}

/**
 * Metabolize - decay attention, gc stale cache
 */
function metabolize() {
    // Decay attention
    for (const [brain, score] of _attention) {
        const decayed = (score || 0) * _metabolism.attentionDecay;
        if (decayed < 0.01) _attention.delete(brain);
        else _attention.set(brain, decayed);
    }
    // GC brain cache if over threshold
    if (_brainCache.size > _metabolism.gcThreshold) {
        for (const [name, { ts }] of _brainCache) {
            if (Date.now() - ts > _cacheTTL) {
                _brainCache.delete(name);
            }
        }
    }
}

// ==================== DREAMING ====================
// Background consolidation using cron.JobWorker
let _dreamState = null;
let _dreamEnabled = false;
let _dreamHour = 3;
let _dreamWorker = null;

/**
 * Enable dreaming - schedule via cron.JobWorker
 * Consolidation: merge learnings, extract insights, update brain
 * @param {boolean} enabled - Enable/disable dreaming
 * @param {number} hour - Hour of day to run dream (0-23)
 * @param {boolean} runNow - If true, run immediately instead of scheduling
 */
async function dream(enabled, hour = 3, runNow = false) {
    _dreamEnabled = enabled;
    _dreamHour = hour;
    if (enabled) {
        // If runNow, execute immediately
        if (runNow) {
            const result = await _processDream({ manual: true });
            return { enabled, hour, runNow: true, result };
        }

        // Otherwise schedule via cron
        const cron = getCron();
        if (cron?.JobWorker) {
            _dreamWorker = new cron.JobWorker({ concurrency: 1 });
            _dreamWorker.add('dream', _processDream, { hour });
        }
    }
    return { enabled, hour };
}

/**
 * Process dream job - consolidate corpus learnings
 * Nova Style: Flat brain files at root (reflection.md, errors.md, patterns.md)
 *
 * Full Vant Security Stack:
 * - Recursion guard: prevent infinite dreaming
 * - QoS: rate limiting
 * - RLS: access control
 * - VAF: input validation
 * - Escrow: write approval
 * - Events: lifecycle monitoring
 */
async function _processDream(payload) {
    // 1. RECURSION GUARD - prevent infinite dreaming loops
    const recursion = getRecursion();
    let qos = null;

    if (recursion) {
        const depthCheck = recursion.check('dream', 3);  // Max 3 nested dreams
        if (!depthCheck.allowed) {
            _emit('dream:blocked', { reason: 'max recursion depth', depth: depthCheck.depth });
            return { error: 'Recursion depth exceeded', code: 'MAX_DEPTH' };
        }
    }

    try {
        // 2. QoS CHECK - rate limiting for dream operations
        qos = getQoS();
        if (qos) {
            if (!qos.canProceed()) {
                _emit('dream:blocked', { reason: 'circuit breaker open' });
                return { error: 'QoS: Circuit breaker open', code: 'QOS_BLOCKED' };
            }
            qos.incrementActive();
        }

        // 3. EMIT START EVENT
        _emit('dream:start', {
            brain: _currentBrain,
            type: _currentBrainType,
            timestamp: Date.now()
        });

        // 4. RLS CHECK - can this user/brain dream?
        // Now with habitat RLS policies configured for _dream:*
        const sandbox = getSandbox();
        if (sandbox && sandbox.rls && sandbox.rls.getHabitat && sandbox.rls.getHabitat()) {
            try {
                await sandbox.rls.checkWrite(
                    { brain: _currentBrain, role: 'dream', roles: ['dream'] },
                    `_dream:${_currentBrain}`,
                    'write'
                );
            } catch (e) {
                _emit('dream:blocked', { reason: 'RLS denied', brain: _currentBrain, error: e.message });
                return { error: 'RLS: Access denied', code: 'RLS_DENIED' };
            }
        }

        // Continue with consolidation...
        const corpus = await loadCorpus();
        const consolidated = { insights: 0, errors: 0, patterns: 0 };

        // Get evolution insights from session
        const evolutionHistory = await getEvolutionHistory();
        const sessionInsights = evolutionHistory.recentInsights || [];

        if (sessionInsights.length === 0) {
            _emit('dream:complete', { reason: 'no insights', consolidated });
            return { consolidated: 0, reason: 'no insights' };
        }

        const timestamp = new Date().toISOString().split('T')[0];

        // VAF: Sanitize insights (input validation)
        const sanitize = (text) => {
            // Remove potential injection patterns
            return text
                .replace(/`/g, "'")
                .replace(/\*/g, '+')
                .replace(/\{\{/g, '{{')
                .replace(/<script/gi, '&lt;script')
                .slice(0, 5000);  // Max insight length
        };

        // Helper: write via security chain (uses full VAF → QoS → RLS → Escrow)
        const writeToBrainFile = async (filename, newContent) => {
            // Use brain's write function with full security chain
            // This goes through _runBrainSecurityChain
            try {
                await write(filename, filename, newContent, {
                    brain: _currentBrain,
                    type: _currentBrainType,
                    userCtx: { brain: _currentBrain, role: 'dream' },
                    habitat: 'default'
                });
                return { success: true };
            } catch (e) {
                _emit('dream:error', { file: filename, error: e.message });
                return { error: e.message };
            }
        };

        // 5. CONSOLIDATE TO reflection.md
        const reflection = corpus.find(c => c.id === 'reflection');
        if (reflection) {
            const insightText = sessionInsights.map(i =>
                `- ${timestamp}: ${sanitize(i.insight)}`
            ).join('\n');

            const newSection = `\n\n---\n\n## Dream Consolidation\n${insightText}\n`;
            const updatedReflection = `${reflection.content}${newSection}`;

            await writeToBrainFile('reflection', updatedReflection);
            consolidated.insights = sessionInsights.length;
        }

        // 6. CONSOLIDATE TO errors.md
        const errors = corpus.find(c => c.id === 'errors');
        if (errors) {
            const errorInsights = sessionInsights.filter(i =>
                i.insight.toLowerCase().includes('error') ||
                i.insight.toLowerCase().includes('bug') ||
                i.insight.toLowerCase().includes('fix') ||
                i.insight.toLowerCase().includes('fail')
            );

            if (errorInsights.length > 0) {
                const errorText = errorInsights.map(i =>
                    `- ${timestamp}: ${sanitize(i.insight)}`
                ).join('\n');

                const newErrors = `\n\n---\n\n## Dream Errors\n${errorText}\n`;
                const updatedErrors = `${errors.content}${newErrors}`;

                await writeToBrainFile('errors', updatedErrors);
                consolidated.errors = errorInsights.length;
            }
        }

        // 7. CONSOLIDATE TO patterns.md
        const patterns = corpus.find(c => c.id === 'patterns');
        if (patterns) {
            const patternInsights = sessionInsights.filter(i =>
                i.insight.toLowerCase().includes('pattern') ||
                i.insight.toLowerCase().includes('approach') ||
                i.insight.toLowerCase().includes('strategy') ||
                i.insight.toLowerCase().includes('learned')
            );

            if (patternInsights.length > 0) {
                const patternText = patternInsights.map(i =>
                    `- ${timestamp}: ${sanitize(i.insight)}`
                ).join('\n');

                const newPatterns = `\n\n---\n\n## Dream Patterns\n${patternText}\n`;
                const updatedPatterns = `${patterns.content}${newPatterns}`;

                await writeToBrainFile('patterns', updatedPatterns);
                consolidated.patterns = patternInsights.length;
            }
        }

        // 8. EMIT COMPLETE EVENT
        _emit('dream:complete', {
            consolidated,
            brain: _currentBrain,
            timestamp: Date.now()
        });

        return consolidated;

    } finally {
        // 9. RELEASE RECURSION & QoS
        if (recursion) {
            recursion.release('dream');
        }
        if (qos) {
            qos.decrementActive();
        }
    }
}

// ==================== SELF-HEALING ====================
// Auto-retry with fallback on failure
const _fallbacks = new Map(); // brain -> fallback brain

/**
 * Register fallback brain for failed loads
 * Usage: brain.onFail('missing', 'identity') // fallback to identity if missing not found
 */
function onFail(brain, fallback) {
    _fallbacks.set(brain, fallback);
    return { brain, fallback };
}

/**
 * Get fallback brain
 */
function getFallback(brain) {
    return _fallbacks.get(brain);
}

/**
 * Auto-heal - retry with fallback
 */
async function _heal(brain) {
    const fallback = _fallbacks.get(brain);
    if (fallback) {
        getAudit()?.info(`[brain] ${brain} missing, falling back to ${fallback}`);
        return load(fallback);
    }
    return null;
}

// ==================== PRELOAD ====================
// Speculative loading of related brains
const _preloadQueue = [];

/**
 * Preload related brains - adds to queue for async processing
 * Does NOT load directly to avoid recursion depth issues
 */
async function preload(brain) {
    const prediction = predictNext(brain);
    if (prediction) {
        // Only add to queue if not already cached
        const cached = _getCached(prediction);
        if (!cached) {
            _preloadQueue.push(prediction);
        }
    }
    return null;
}

/**
 * Process preload queue
 */
async function _processPreload() {
    while (_preloadQueue.length > 0) {
        const brain = _preloadQueue.shift();
        const cached = _getCached(brain);
        if (!cached) load(brain).catch(() => {});
    }
}

// ==================== FORGETTING ====================
// Synaptic pruning
const _forgetThreshold = 1000; // forget if weight below threshold

/**
 * Prune synapses
 */
function forget(brain) {
    _attention.delete(brain);
    _brainCache.delete(brain);
    // Prune incoming synapses
    for (const [from, weights] of _synapses) {
        weights.delete(brain);
    }
    // Delete brain's outgoing synapses
    _synapses.delete(brain);
}

// ==================== LIFECYCLE ====================
// Bootstrap and shutdown
const _lifecycle = {
    bootstrap: [],
    shutdown: []
};

/**
 * Register bootstrap hook
 */
function onBootstrap(fn) {
    _lifecycle.bootstrap.push(fn);
}

/**
 * Run bootstrap
 */
async function bootstrap() {
    // Restore neuron state from disk
    const saved = getNeuronState();
    if (saved.synapses) {
        for (const [from, weights] of Object.entries(saved.synapses)) {
            for (const [to, weight] of Object.entries(weights)) {
                _synapses.set(from, new Map([[to, weight]]));
            }
        }
    }
    if (saved.attention) {
        for (const [brain, score] of Object.entries(saved.attention)) {
            _attention.set(brain, score);
        }
    }

    // Run bootstrap hooks (includes lessons restore via onBootstrap)
    for (const fn of _lifecycle.bootstrap) {
        await fn();
    }
    // Start metabolism tick every minute (saves state)
    // v0.9.0-axolotl: registered with boot's timer lifecycle (was bare setInterval)
    const _bootMod = (() => { try { return require('./boot'); } catch (e) { return null; } })();
    const _tick = () => {
        metabolize();
        _saveState({ synapses: Object.fromEntries([..._synapses].map(([k, v]) => [k, Object.fromEntries(v)])),
                  attention: Object.fromEntries(_attention) });
    };
    if (_bootMod && _bootMod.registerTimer) {
        _bootMod.registerTimer('brain.metabolize', _tick, 60000);
    } else {
        setInterval(_tick, 60000);
    }
}

/**
 * Restore reflection.md from brain state on boot
 * Nova Style: Flat brain files - restore to reflection.md
 */
async function _restoreLessonsFromState(state) {
    try {
        const corpus = await loadCorpus();
        const reflection = corpus.find(c => c.id === 'reflection');

        // If reflection.md exists, nothing to restore (user may have manually edited)
        if (reflection && reflection.content && reflection.content.length > 10) {
            // Check if already has Dream Consolidation section
            if (reflection.content.includes('## Dream Consolidation')) {
                return { restored: false, reason: 'has_dream_content' };
            }
        }

        // Get recent insights from state
        const insights = state?.recentInsights || [];

        // If no recentInsights in state, just ensure reflection exists (it already does)
        if (insights.length === 0) {
            return { restored: false, reason: 'no_insights' };
        }

        // Convert recentInsights to reflection format
        const insightText = insights.map(i =>
            `- Boot restore: ${i.insight}`
        ).join('\n');

        const restoreSection = `\n---\n\n## Boot Restore\n${insightText}\n`;
        const updatedReflection = reflection ? `${reflection.content}${restoreSection}` :
            `# Reflection\n\nLooking back at work done.\n\n## Boot Restore\n${insightText}\n`;

        await write('reflection', 'restored', updatedReflection);
        return { restored: true, insights: insights.length };

    } catch (e) {
        return { restored: false, error: e.message };
    }
}

/**
 * Register shutdown hook
 */
function onShutdown(fn) {
    _lifecycle.shutdown.push(fn);
}

/**
 * Run shutdown
 */
async function shutdown() {
    // Save neuron state
    _saveState({ synapses: Object.fromEntries([..._synapses].map(([k, v]) => [k, Object.fromEntries(v)])),
                attention: Object.fromEntries(_attention) });

    // Stop watcher
    if (_watcher) {
        _watcher.close();
        _watcher = null;
    }
    // Clear cache
    _cache.clear();
    // Run shutdown hooks
    for (const fn of _lifecycle.shutdown) {
        await fn();
    }
}

// ==================== REMOTE TUNNEL ====================
async function _fetchRemote(name) {
    if (!_remoteURL) return null;
    const url = _remoteURL.replace(/\/$/, '') + '/brain/' + name + '.json';
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        return null;
    }
}

// ==================== MULTI-BRAIN REGISTRY ====================
// Lazy-load brain registry for multi-brain support
let _brainRegistry = null;
// ==================== MULTI-BRAIN STATE ====================
// Multi-brain support: stack-based loading of multiple brains
let _currentBrain = 'vant';  // Current active brain name
let _currentBrainType = 'public';  // 'private' or 'public'
let _brainMode = 'shared';    // Default isolation mode: silo|shared|governance
let _brainRoots = {
    private: 'models/private',
    public: 'models/public'
};
// Initialize stack from state file synchronously on module load
// (slice 4: through the brain FileStore — containment/symlink checks apply)
// Module-load IIFE: plain fs on the fixed state.json path. Do NOT construct
// the brain FileStore here - storage.js requires brain.js during its own
// load (see note above), so any storage require at module-load time deadlocks.
let _brainStack = (function() {
    try {
        const state = JSON.parse(fs.readFileSync(path.resolve(_brainModelsRoot, 'state.json'), 'utf8'));
        if (state.stack && Array.isArray(state.stack)) {
            // MULTIBRAIN: Restore currentBrain from stack[0]
            if (state.stack.length > 0) {
                _currentBrain = state.stack[0];

                // FIX: Detect brain type based on where brain directory exists
                // (stack names come from state.json - validate before probing)
                if (_validBrainSegment(_currentBrain) && fs.existsSync(path.resolve(_brainModelsRoot, 'private', _currentBrain))) {
                    _currentBrainType = 'private';
                } else if (_validBrainSegment(_currentBrain) && fs.existsSync(path.resolve(_brainModelsRoot, 'public', _currentBrain))) {
                    _currentBrainType = 'public';
                }
                // Otherwise keeps default 'public'
            }
            return state.stack;
        }
    } catch (e) {}
    return ['vant'];
})();

// Load a stack of brains (e.g., ['vant', 'my-research'])
/**
 * NEW (v0.8.6): Unified brain read - reads any brain file by name
 * Supports all extensions via format.js
 * @param {string} name - Brain name (without extension)
 * @param {object} opts - { type: 'private'|'public', format: true }
 * @returns {object} { data, content, format, source }
 */
async function read(name, opts = {}) {
    // Name is interpolated into the store path - validate first (slice 4)
    if (!_validBrainSegment(name)) return null;
    const type = opts.type || 'private';
    const brain = opts.brain;  // Optional: specify a specific brain
    const format = _getFormat();
    const extensions = format?.DEFAULT_EXTENSIONS || ['.md'];

    // Get brain path - support specific brain via opts.brain
    let root;
    if (brain && type === 'private') {
        // Read from a specific private brain (e.g., 'nova', 'vant')
        if (!_validBrainSegment(brain)) return null;
        root = path.join(_brainRoots.private, brain);
    } else {
        root = type === 'private' ? getBrainPath() : getPublicPath();
    }

    // Try each extension (slice 4: reads through the brain FileStore)
    for (const ext of extensions) {
        const rel = _brainRel(root, name + ext);
        if (_bfsHas(rel)) {
            const content = _bfsRead(rel);
            const formatName = ext === '.md' ? 'md' :
                             ext === '.json' ? 'json' :
                             ext === '.yaml' || ext === '.yml' ? 'yaml' : 'txt';

            // Parse content based on format
            let data = content;
            if (format?.parse && formatName !== 'txt') {
                const parsed = format.parse(content, { format: formatName });
                data = parsed.data || content;
            }

            return {
                data,
                content,
                format: formatName,
                source: type,
                brain: brain || _currentBrain,
                path: path.join(root, name + ext)
            };
        }
    }

    // Dual-mode public fallback (v0.9.0-axolotl migration compat): main's
    // _loadBrain fell back private→public in dual mode; axolotl's read()
    // lost that. A migrated legacy user's whole brain lives in public —
    // without this, plain read() misses files that corpus/older versions
    // returned. Only when the caller did NOT pin an explicit type.
    if (!opts.type && _mode !== 'private' && _mode !== 'public') {
        const publicRoot = getPublicPath();
        for (const ext of extensions) {
            const rel = _brainRel(publicRoot, name + ext);
            if (_bfsHas(rel)) {
                const content = _bfsRead(rel);
                const formatName = ext === '.md' ? 'md' :
                                 ext === '.json' ? 'json' :
                                 ext === '.yaml' || ext === '.yml' ? 'yaml' : 'txt';
                let data = content;
                if (format?.parse && formatName !== 'txt') {
                    const parsed = format.parse(content, { format: formatName });
                    data = parsed.data || content;
                }
                return {
                    data,
                    content,
                    format: formatName,
                    source: 'public',
                    brain: brain || _currentBrain,
                    path: path.join(publicRoot, name + ext)
                };
            }
        }
    }

    return null;  // Not found
}

/**
 * Load a file using format.js
 * @param {string} filePath - Path to file
 * @param {object} opts - format options
 * @returns {object} { data, content, format, error }
 */
async function loadFile(filePath, opts = {}) {
    const format = _getFormat();
    if (!format?.loadFile) {
        return { error: 'format.js not available' };
    }
    return format.loadFile(filePath, opts);
}

/**
 * Save a file using format.js
 * @param {string} filePath - Path to file
 * @param {object} data - Data to save
 * @param {object} opts - format options
 * @returns {object} { success, error }
 */
async function saveFile(filePath, data, opts = {}) {
    const format = _getFormat();
    if (!format?.saveFile) {
        return { error: 'format.js not available' };
    }
    return format.saveFile(filePath, data, opts);
}

// Merge content across brains in layer stack
// Returns merged view of keys across all brains in stack
async function merge(keys, options = {}) {
    const stack = getStack();
    const results = {};
    const errors = [];

    // Save current brain state
    const originalBrain = currentBrain();
    const originalType = _currentBrainType;

    try {
        for (const key of (Array.isArray(keys) ? keys : [keys])) {
            const values = [];

            // Check each brain in stack order (top to bottom)
            for (const brainName of stack) {
                try {
                    // Switch to this brain temporarily
                    switchBrain(brainName, 'private');

                    // Load the key from this brain
                    const result = await load(key, options);
                    if (result && !result.error) {
                        values.push({ brain: brainName, content: result.content || result.data });
                    }
                } catch (e) {
                    // Skip errors, continue to next brain
                }
            }

            if (values.length > 0) {
                results[key] = values;
            } else if (options.requireAll) {
                errors.push({ key, error: 'not found in any brain' });
            }
        }
    } finally {
        // Restore original brain
        switchBrain(originalBrain, originalType);
    }

    return { results, errors, stack };
}

// Write to specific brain in stack
async function writeTo(brain, key, data, options = {}) {
    const root = brain.type === 'private' ? _brainRoots.private : _brainRoots.public;
    const path = root + '/' + brain.name;

    // Use storage directly
    const storage = _getStorageRef().get('brain');
    return storage.set(key, data, { ...options, path });
}

// ==================== BRAIN WRITER ======================
// Helper to write directly to specific brain path
// (through storage layer - validates brain/category/key, atomic write)
function _writeToBrain(brainName, brainType, category, key, content) {
    if (!_validBrainSegment(brainName) || !_validBrainSegment(category) || !_validBrainSegment(key)) {
        throw new errors.VantError('Invalid brain path segment', { code: errors.CODES.VAF_PATH_BLOCKED });
    }
    const root = brainType === 'private' ? _brainRoots.private : _brainRoots.public;
    _bfsWrite(_brainRel(root, brainName, category, key + '.md'), content);

    return { success: true, path: path.join(root, brainName, category, key + '.md') };
}

// ==================== BRAIN READER ======================
// Helper to read directly from specific brain path
// (through storage layer - validates brain/category/key)
function _readFromBrain(brainName, brainType, category, key) {
    if (!_validBrainSegment(brainName) || !_validBrainSegment(category) || !_validBrainSegment(key)) {
        return null;
    }
    const root = brainType === 'private' ? _brainRoots.private : _brainRoots.public;
    const brainPath = root + '/' + brainName;

    // Handle category/key format (e.g., 'test/learn' -> category='test', key='learn')
    const rel = _brainRel(brainPath, category, key + '.md');
    if (_bfsHas(rel)) {
        return _bfsRead(rel);
    }
    // Try without .md extension in key
    const altRel = _brainRel(brainPath, category, key);
    if (_bfsHas(altRel)) {
        return _bfsRead(altRel);
    }
    return null;
}

// ==================== GEOMETRY BRAIN ====================
// Per-brain geometric addressing using quasicrystal coordinates
// Each brain has its own NSC9 address space

/**
 * Get geometry path for a brain (per-brain geometry storage)
 * @param {string} brainName - Name of the brain
 * @param {string} type - 'private' or 'public'
 * @returns {string} Full path to brain's geometry storage
 */
function getGeometryPath(brainName, type = 'private') {
    const root = type === 'private' ? _brainRoots.private : _brainRoots.public;
    return process.env.VANT_GEOMETRY_PATH || `${root}/${brainName}/geometry`;
}

// Load from geometry brain (by barcode)
async function geoLoad(barcode, options = {}) {
    const geometry = require('./geometry');
    const brain = options.brain || currentBrain();
    const type = options.type || 'private';
    const basePath = getGeometryPath(brain, type);

    try {
        const data = await geometry.retrieve(barcode, basePath);
        return { barcode, data, source: 'geometry', brain };
    } catch (e) {
        return { error: e.message, barcode, brain };
    }
}

// Store in geometry brain (generates barcode)
// Uses NSC9 address space for collision-free private storage
async function geoStore(key, data, options = {}) {
    const geometry = require('./geometry');
    const memory = require('./memory');
    const brain = options.brain || currentBrain();
    const type = options.type || 'private';
    const basePath = getGeometryPath(brain, type);

    // Generate NSC9 barcode - brain-specific facility code
    // NSC9 = New private Space per brain
    // Each brain gets unique facility based on brain name hash
    const brainHash = brain.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
    const facility = String(Math.abs(brainHash) % 99999).padStart(5, '0');

    // Generate sequence from key hash (deterministic)
    const keyHash = key.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
    const sequence = String(Math.abs(keyHash) % 99999).padStart(5, '0');
    const checksum = Math.abs(keyHash) % 10;
    const barcode = `9-${facility}-${sequence}-${checksum}`;  // 9 = NSC9 prefix

    try {
        await geometry.store(barcode, data, basePath);
        return { barcode, key, stored: true, brain };
    } catch (e) {
        return { error: e.message, brain };
    }
}

// List geometry brain contents
// (enumeration stays on fs - pattern-glob limitation - path anchored to the
// geometry root via getGeometryPath)
function geoList(options = {}) {
    const brain = options.brain || currentBrain();
    const type = options.type || 'private';
    const basePath = getGeometryPath(brain, type);

    if (!fs.existsSync(basePath)) {
        return [];
    }

    const dirs = fs.readdirSync(basePath, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name);

    return dirs;
}

// List all brains with geometry storage
// (enumeration stays on fs - pattern-glob limitation - path anchored to
// _brainRoots.private)
function geoBrains() {
    const privateRoot = _brainRoots.private;
    const brains = [];

    if (!fs.existsSync(privateRoot)) {
        return brains;
    }

    const entries = fs.readdirSync(privateRoot, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isDirectory()) {
            const geoPath = `${privateRoot}/${entry.name}/geometry`;
            if (fs.existsSync(geoPath)) {
                brains.push({ name: entry.name, type: 'private', geometry: true });
            }
        }
    }

    return brains;
}

function loadStack(brains) {
    if (!Array.isArray(brains)) {
        brains = [brains];
    }
    _brainStack = brains;
    _emit('brain:stack', { stack: _brainStack });

    // Persist stack to state.json (skip if in bulk restore mode)
    if (!_skipSave) {
        _saveState({}).catch(e => console.warn('[brain] Failed to save stack:', e.message));
    }

    return _brainStack;
}

// Flag to track if state has been loaded
let _stateLoaded = false;
let _stateLoadPromise = null;

// FIX: Flag to skip saving during bulk operations (like restore)
let _skipSave = false;
function _setSkipSave(val) {
    _skipSave = val;
}

// Get current brain stack
// Note: Does NOT reload from state - use loadStack() to persist changes
function getStack() {
    // Return current stack without reloading
    // State is only loaded once at module init
    return [..._brainStack];
}


// Get stack (async - waits for state load)
async function getStackAsync() {
    // Ensure state is loaded
    if (!_stateLoaded && !_stateLoadPromise) {
        _stateLoadPromise = _loadState().then(() => {
            _stateLoaded = true;
            _stateLoadPromise = null;
        }).catch(() => {
            _stateLoadPromise = null;
        });
    }
    // Wait for load if pending
    if (_stateLoadPromise) {
        await _stateLoadPromise;
    }
    return [..._brainStack];
}
// Add brain to top of stack
function pushBrain(name, type = 'private') {
    // Validate brain exists (slice 3: name validated before path interpolation)
    if (!_validBrainSegment(name)) {
        throw new errors.VantError('Invalid brain name', { code: errors.CODES.VAF_PATH_BLOCKED });
    }
    const root = type === 'private' ? _brainRoots.private : _brainRoots.public;
    const path = root + '/' + name;
    if (!fs.existsSync(path)) {
        throw new errors.VantError('Brain not found', { code: errors.CODES.BRAIN_NOT_FOUND });
    }
    if (!_brainStack.includes(name)) {
        _brainStack.unshift(name);  // Add to top (checked first)
        _emit('brain:pushed', { brain: name, stack: _brainStack });
    }
    return _brainStack;
}

// Remove brain from stack
function removeBrain(name) {
    const idx = _brainStack.indexOf(name);
    if (idx > -1) {
        _brainStack.splice(idx, 1);
        _emit('brain:popped', { brain: name, stack: _brainStack });
    }
    return _brainStack;
}

// Resolve a brain name to its full path (checking both private and public)
// (slice 3: name validated before path interpolation; existence checks are
// anchored containment probes against the two brain roots)
function resolveBrainPath(name) {
    if (!_validBrainSegment(name)) return null;
    // Check private first
    let path = _brainRoots.private + '/' + name;
    if (fs.existsSync(path)) {
        return { path, type: 'private' };
    }
    // Then public
    path = _brainRoots.public + '/' + name;
    if (fs.existsSync(path)) {
        return { path, type: 'public' };
    }
    return null;
}

// ==================== EVOLUTION CONTEXT ====================
// Session tracking for evolution (vertical learning across sessions)
// Stack is vertical (layered), Chain is horizontal (sequential)

let _evolutionSession = null;
let _evolutionChanges = [];
let _evolutionInsights = [];

function startEvolutionSession(sessionId = null) {
    const id = sessionId || 'session-' + Date.now();
    _evolutionSession = {
        id,
        startTime: Date.now(),
        brains: [..._brainStack],
        changes: [],
        insights: []
    };
    _evolutionChanges = [];
    _evolutionInsights = [];
    _emit('evolution:session:start', { sessionId: id, stack: _brainStack });
    return _evolutionSession;
}

function recordChange(type, data) {
    if (!_evolutionSession) {
        startEvolutionSession();
    }
    const change = { type, data, timestamp: Date.now() };
    _evolutionChanges.push(change);
    _evolutionSession.changes.push(change);
    _emit('evolution:change', change);
}

function recordInsight(insight, metadata = {}) {
    if (!_evolutionSession) {
        startEvolutionSession();
    }
    const rec = { insight, metadata, timestamp: Date.now() };
    _evolutionInsights.push(rec);
    _evolutionSession.insights.push(rec);
    _emit('evolution:insight', rec);
}

function getEvolutionSession() {
    return _evolutionSession;
}

function getEvolutionChanges() {
    return [..._evolutionChanges];
}

function getEvolutionInsights() {
    return [..._evolutionInsights];
}

async function endEvolutionSession() {
    if (!_evolutionSession) {
        return null;
    }
    _evolutionSession.endTime = Date.now();
    _evolutionSession.duration = _evolutionSession.endTime - _evolutionSession.startTime;

    // Save evolution data at top level (not in neurons)
    const state = await _loadState();
    state.lastSession = _evolutionSession;
    state.recentInsights = _evolutionInsights.slice(-10);
    state.updated = new Date().toISOString();
    _bfsWrite('state.json', JSON.stringify(state, null, 2));

    // NEW: Also persist to memory for semantic search
    try {
        const memory = _getMemory();
        if (memory?.learn) {
            const sessionKey = 'evolution/session-' + _evolutionSession.id;
            await memory.learn(sessionKey, JSON.stringify(_evolutionSession), { ttl: 86400 * 30 }); // 30 days
        }
    } catch (e) {
        console.warn('[brain] Memory integration failed:', e.message);
    }

    const summary = { ..._evolutionSession };
    _emit('evolution:session:end', summary);
    _evolutionSession = null;
    _evolutionChanges = [];
    _evolutionInsights = [];
    return summary;
}

async function getEvolutionHistory() {
    const state = await _loadState();
    return {
        lastSession: state.lastSession || null,
        recentInsights: state.recentInsights || []
    };
}

// Get/set current brain name
function currentBrain(name) {
    if (name) {
        _currentBrain = name;
        _emit('brain:switched', { brain: name, type: _currentBrainType, mode: _brainMode });
    }
    return _currentBrain;
}

// Get/set brain isolation mode
function brainMode(mode) {
    if (mode) {
        if (!['silo', 'shared', 'governance'].includes(mode)) {
            throw new errors.VantError('Invalid brain mode', { code: errors.CODES.CONFIG_INVALID });
        }
        _brainMode = mode;
        _emit('brain:mode', { brain: _currentBrain, mode });
    }
    return _brainMode;
}

// List available brain directories
function brainDirs(type = 'all') {
    const brains = { public: [], private: [] };

    // Scan public brains (enumeration on fs - pattern-glob limitation;
    // directory-type filtering stays on fs, per the prune.js precedent)
    const publicRoot = _brainRoots.public;
    if (fs.existsSync(publicRoot)) {
        const entries = fs.readdirSync(publicRoot, { withFileTypes: true });
        brains.public = entries.filter(e => e.isDirectory()).map(e => e.name);
    }

    // Check for geometry brain (special quasicrystal-addressed storage;
    // anchored fixed path via _bfsHas)
    if (_bfsHas(path.join('private', 'geometry'))) {
        brains.geometry = true;  // Geometry brain available
    }

    // Scan private brains
    const privateRoot = _brainRoots.private;
    if (fs.existsSync(privateRoot)) {
        const entries = fs.readdirSync(privateRoot, { withFileTypes: true });
        brains.private = entries.filter(e => e.isDirectory()).map(e => e.name);
    }

    if (type === 'public') return brains.public;
    if (type === 'private') return brains.private;
    return brains;
}

// Switch to a different brain
// This also adds the brain to top of stack for dual mode fallback
function switchBrain(name, type = 'private') {
    if (!name) {
        throw new errors.VantError('Brain name required', { code: errors.CODES.VAF_REQUIRED_FIELD });
    }
    if (!_validBrainSegment(name)) {
        throw new errors.VantError('Invalid brain name', { code: errors.CODES.VAF_PATH_BLOCKED });
    }

    // Auto-detect type if not specified
    // (name already validated by _validBrainSegment above; existence probes
    // via _bfsHas/_brainRel - correct models-root-relative math with a safe
    // anchored-fs fallback during the storage bootstrap window)
    if (type === 'private') {
        if (_bfsHas(_brainRel(_brainRoots.private, name))) {
            type = 'private';
        } else {
            if (_bfsHas(_brainRel(_brainRoots.public, name))) {
                type = 'public';
            } else {
                throw new errors.VantError('Brain not found', { code: errors.CODES.BRAIN_LOAD_FAIL });
            }
        }
    }

    const root = type === 'private' ? _brainRoots.private : _brainRoots.public;

    if (!_bfsHas(_brainRel(root, name))) {
        throw new errors.VantError('Brain not found', { code: errors.CODES.BRAIN_LOAD_FAIL });
    }

    // Use loadStack to properly update the stack
    // This ensures the change persists
    let newStack;
    if (!_brainStack.includes(name)) {
        // Add to top
        newStack = [name, ..._brainStack];
    } else {
        // Move to top
        const idx = _brainStack.indexOf(name);
        newStack = [name, ..._brainStack.slice(0, idx), ..._brainStack.slice(idx + 1)];
    }
    loadStack(newStack);

    // Clear brain cache when switching brains
    // This ensures fresh loading from the new brain
    _brainCache.clear();
    // Also clear external cache module
    const cache = getCache();
    if (cache?.clear) {
        cache.clear();
    }

    _currentBrain = name;
    _currentBrainType = type;
    _emit('brain:switched', { brain: name, type, mode: _brainMode });

    return { brain: name, type, mode: _brainMode, stack: getStack() };
}

// ==================== PATH CONSISTENCY ====================
function getBrainPath() {
    // Check for VANT_BRAIN env override first
    const envBrain = process.env.VANT_BRAIN;
    if (envBrain) {
        return _brainRoots.private + '/' + envBrain;
    }

    // Skip registry - use our multi-brain system directly
    // (registry has its own DEFAULT_BRAIN that conflicts)

    // Use config system base path
    let basePath = 'models/private';
    try {
        const config = require('./config');
        basePath = config.get('storage.path') || 'models/private';
    } catch (e) {}

    // FRESH-INSTALL GUARD: a new project has no state.json, so _currentBrainType
    // keeps its module-load default of 'public' - pointing the runtime at the
    // (nonexistent) packaged template instead of the seeded private brain.
    // When only the private brain exists, prefer it.
    if (_currentBrainType !== 'private' && _validBrainSegment(_currentBrain)) {
        const publicExists = fs.existsSync(path.resolve(_brainRoots.public, _currentBrain));
        const privateExists = fs.existsSync(path.resolve(basePath, _currentBrain));
        if (privateExists && !publicExists) _currentBrainType = 'private';
    }
    const brainRoot = _currentBrainType === 'public' ? _brainRoots.public : basePath;
    const brainPath = brainRoot + '/' + _currentBrain;

    // SECURITY: Use vaf for path validation
    const vaf = _getVaf();
    if (vaf?.checkPathTraversal) {
        const check = vaf.checkPathTraversal(brainPath);
        if (check.blocked) {
            brainPath = 'models/private/' + _currentBrain;
        }
    }
    return brainPath;
}

function getPublicPath() {
    // FIX: Return public brain path with smart defaults
    // Priority: 1) Config default  2) vant (if exists)  3) First public brain in stack
    const privateRoot = _brainRoots.private;
    const publicRoot = _brainRoots.public;

    // 1. Check config for default public brain
    let defaultPublicBrain = 'vant'; // Default
    try {
        const config = require('./config');
        const configured = config.get('brain.defaultPublic');
        if (configured && typeof configured === 'string') {
            defaultPublicBrain = configured;
        }
    } catch(e) { /* config not available, use default */ }

    // 2. Check if configured/default brain exists
    // (existence via _bfsHas/_brainRel: correct models-root-relative math;
    // during the storage bootstrap window _bfsHas falls back to anchored fs.
    // Configured names come from config; stack names are validated segments.)
    if (_validBrainSegment(defaultPublicBrain) && _bfsHas(_brainRel(publicRoot, defaultPublicBrain))) {
        return publicRoot + '/' + defaultPublicBrain;
    }

    // 3. Look for vant specifically (common default)
    if (_bfsHas(_brainRel(publicRoot, 'vant'))) {
        return publicRoot + '/vant';
    }

    // 4. Find first public brain in stack
    for (const brainName of _brainStack) {
        if (_validBrainSegment(brainName) && _bfsHas(_brainRel(publicRoot, brainName))) {
            return publicRoot + '/' + brainName;
        }
    }

    // 5. Last resort: return public root
    return publicRoot;
}

// ==================== CORE LOADING ====================

/**
 * Load a single brain file
 * @param {string} name - Brain name (without .md)
 * @param {object} [options] - Optional options (for future extensibility)
 * @returns {Promise<Object|null>} Brain object or null
 */
async function _loadBrain(name, options) {
    // Guard against null/undefined - return null gracefully
    if (!name || typeof name !== 'string') {
        return null;
    }

    const start = Date.now();
    // Resolve alias
    const resolved = resolve(name);

    // Check cache first
    const cached = _getCached(resolved);
    if (cached) {
        _metrics.cacheHits++;
        _metrics.loads++;

        // EVENT: brain cache hit
        _emit('brain:cache:hit', { name: resolved, timestamp: Date.now() });

        return cached;
    }

    // EVENT: brain loading
    _emit('brain:loading', { name: resolved, source: _mode, timestamp: Date.now() });

    _metrics.loads++;
    await emit('beforeLoad', { name: resolved, original: name });

    // Pipeline execution via context
    const ctx = { name: resolved, original: name };
    await executePipeline(_mode, ctx, async () => {
        // Mode switch: routing
        if (_mode === 'public') {
            // (slice 4: through the brain FileStore)
            const content = _bfsRead(_brainRel(getPublicPath(), resolved + '.md'));
            if (content !== null) {
                ctx.result = { name: resolved, content, source: 'public', brain: _currentBrain };
            }
        } else if (_mode === 'private') {
            const content = _bfsRead(_brainRel(getBrainPath(), resolved + '.md'));
            if (content !== null) {
                ctx.result = { name: resolved, content, source: 'private', brain: _currentBrain };
            }
        } else if (_mode === 'remote' && _remoteURL) {
            try {
                const remote = await _fetchRemote(resolved);
                if (remote) {
                    ctx.result = { name: resolved, content: remote.content, source: 'remote' };
                }
            } catch (e) { console.warn("[brain] Remote fetch failed:", e.message); }
        } else {
            // Dual mode: check current brain first, then fall back to stack
            // (slice 4: reads through the brain FileStore)
            let found = null;

            // First, check current brain (if set)
            if (_currentBrain) {
                const currentPath = resolveBrainPath(_currentBrain);
                if (currentPath) {
                    const content = _bfsRead(_brainRel(currentPath.path, resolved + '.md'));
                    if (content !== null) {
                        found = {
                            name: resolved,
                            content,
                            source: currentPath.type,
                            brain: _currentBrain
                        };
                    }
                }
            }

            // If not found in current brain, check stack (fallback)
            if (!found) {
                const stack = getStack();
                for (const brainName of stack) {
                    const resolvedPath = resolveBrainPath(brainName);
                    if (!resolvedPath) continue;

                    const content = _bfsRead(_brainRel(resolvedPath.path, resolved + '.md'));
                    if (content !== null) {
                        found = {
                            name: resolved,
                            content,
                            source: resolvedPath.type,
                            brain: brainName
                        };
                        break;
                    }
                }
            }

            if (found) {
                ctx.result = found;
            }
        }
    });
    // Check result
    let brain = ctx.result || null;

    if (!brain) {
        // Emit onMiss hooks
        await emit('onMiss', { name: resolved, original: name });
        // Try fallback
        return _heal(resolved);
    }

    // Cache result
    _setCached(resolved, brain);

    // Apply load transformers
    brain = await applyTransforms('load', brain);

    // Emit afterLoad hooks
    await emit('afterLoad', { brain, name: resolved });

    // EVENT: brain loaded
    _emit('brain:loaded', { name: resolved, source: brain?.source, timestamp: Date.now() });

// === FIRE NEURONS: track access, boost attention, preload ===
    const _lastBrain = _lastLoaded || null;
    if (_lastBrain && _lastBrain !== resolved) {
        fireSynapse(_lastBrain, resolved);
    }
    _lastLoaded = resolved;
    // Boost attention on access
    const currentAttention = getAttention(resolved) || 0;
    attend(resolved, Math.min(1, currentAttention + 0.2));
    // Preload next predicted brain
    const predicted = predictNext(resolved);
    if (predicted) {
        // Queue preload (don't call load directly to avoid recursion)
        _preloadQueue.push(predicted);
        _processPreload().catch(e => console.warn("[brain] Preload failed:", e.message));
    }

    // Track load time
    _metrics.loadTime += Date.now() - start;

    // Save state on each load
    await _saveState({ synapses: Object.fromEntries([..._synapses].map(([k, v]) => [k, Object.fromEntries(v)])),
                attention: Object.fromEntries(_attention) });

    return brain;
}

/**
 * Load all brains as merged corpus (ASYNC)
 * @returns {Array} Array of brain objects
 */
/**
 * Unified readDir - reads directory for brain files
 * @param {string} dirPath - Directory path to read
 * @param {string} source - Source name (public/private/brainName)
 * @param {object} opts - Options: { sync: boolean, onFile: function }
 * @returns {Promise<Array>|Array} Array of file entries
 */
function readDir(dirPath, source, opts = {}) {
    const format = _getFormat();
    const extensions = format?.DEFAULT_EXTENSIONS || ['.md'];
    const results = [];

    const processFile = (file, fullPath) => {
        const ext = path.extname(file).toLowerCase();
        if (!extensions.includes(ext)) return null;

        const name = format?.getBrainName ? format.getBrainName(file) : file.replace('.md', '');
        const formatName = ext === '.md' ? 'md' :
                         ext === '.json' ? 'json' :
                         ext === '.yaml' || ext === '.yml' ? 'yaml' : 'txt';

        if (opts.onFile) {
            // Callback mode for loadCorpus
            return opts.onFile({ name, content: null, source, format: formatName, fullPath });
        }

        return { name, format: formatName, source };
    };

    // (slice 4: file reads through the brain FileStore; enumeration on fs)
    if (opts.sync) {
        // SYNC MODE
        try {
            if (!fs.existsSync(dirPath)) return results;
            const files = fs.readdirSync(dirPath);
            for (const file of files) {
                const fullPath = path.join(dirPath, file);
                const result = processFile(file, fullPath);
                if (result) {
                    result.content = _bfsRead(_brainRel(dirPath, file));
                    results.push(result);
                }
            }
        } catch (e) { /* ignore errors */ }
        return results;
    } else {
        // ASYNC MODE (default)
        return (async () => {
            try {
                const files = await fs.promises.readdir(dirPath);
                for (const file of files) {
                    const fullPath = path.join(dirPath, file);
                    const result = processFile(file, fullPath);
                    if (result) {
                        result.content = _bfsRead(_brainRel(dirPath, file));
                        results.push(result);
                    }
                }
            } catch (e) {
                if (e.code !== 'ENOENT' && e.code !== 'ENOTDIR') throw e;
            }
            return results;
        })();
    }
}

/**
 * Unified loadCorpus - load all brain files
 * @param {object} opts - Options: { sync: boolean }
 * @returns {Promise<Array>|Array} Array of brain objects
 *
 * Pattern: Single function, async default, {sync:true} for sync mode
 */
function loadCorpus(opts = {}) {
    const isSync = opts.sync === true;

    // Return cached synchronously if available
    if (_corpusCache && _corpusCacheMode === _mode) {
        return isSync ? _corpusCache : Promise.resolve(_corpusCache);
    }

    const brainPath = getBrainPath();
    const publicPath = getPublicPath();

    // Rate limit (async only)
    if (!isSync) {
        const qos = getHandler('qos');
        if (qos?.check) qos.check('brain').catch(() => {});
    }

    // SYNC version - synchronous execution
    if (isSync) {
        const brain = {};

        const processDir = (dirPath, source) => {
            const files = readDir(dirPath, source, { sync: true });
            for (const { name, content, format } of files) {
                if (source === 'private' || !brain[name]) {
                    brain[name] = { content, source, format };
                }
            }
        };

        if (_mode === 'public') {
            processDir(publicPath, 'public');
        } else if (_mode === 'private') {
            processDir(brainPath, 'private');
        } else {
            processDir(publicPath, 'public');
            processDir(brainPath, 'private');
        }

        _corpusCache = Object.entries(brain).map(([name, { content, source, format }]) => ({
            id: name, title: name, content, format, source, type: 'brain'
        }));
        _corpusCacheMode = _mode;

        return _corpusCache;
    }

    // ASYNC version - await the promises properly
    return (async () => {
        const brain = {};

        const processDir = async (dirPath, source) => {
            const files = await readDir(dirPath, source, { sync: false });
            for (const { name, content, format } of files) {
                if (source === 'private' || !brain[name]) {
                    brain[name] = { content, source, format };
                }
            }
        };

        if (_mode === 'public') {
            await processDir(publicPath, 'public');
        } else if (_mode === 'private') {
            await processDir(brainPath, 'private');
        } else {
            await processDir(publicPath, 'public');
            await processDir(brainPath, 'private');
        }

        _corpusCache = Object.entries(brain).map(([name, { content, source, format }]) => ({
            id: name, title: name, content, format, source, type: 'brain'
        }));
        _corpusCacheMode = _mode;

        return _corpusCache;
    })();
}

/**
 * MULTIBRAIN: Unified loadStackCorpus - Load corpus from ALL brains in stack
 * Returns merged corpus with source tracking per brain
 * @param {object} opts - Options: { sync: boolean }
 * @returns {Promise<Array>|Array} Array of brain objects with brain name tracking
 */
function loadStackCorpus(opts = {}) {
    const isSync = opts.sync === true;
    const stack = getStack();
    const format = _getFormat();
    const extensions = format?.DEFAULT_EXTENSIONS || ['.md'];

    // Dead closure removed (slice 4): referenced an undefined dirPath and was
    // never called - the real logic is the sync/async branches below.
    if (isSync) {
        const results = [];
        for (const brainName of stack) {
            const brainInfo = resolveBrainPath(brainName);
            if (brainInfo && brainInfo.path) {
                const dirPath = brainInfo.path;
                try {
                    if (!fs.existsSync(dirPath)) continue;
                    const files = fs.readdirSync(dirPath);
                    for (const file of files) {
                        const ext = path.extname(file).toLowerCase();
                        if (!extensions.includes(ext)) continue;

                        const name = format?.getBrainName ? format.getBrainName(file) : file.replace('.md', '');
                        const formatName = ext === '.md' ? 'md' : ext === '.json' ? 'json' : 'txt';
                        const content = _bfsRead(_brainRel(dirPath, file));
                        results.push({
                            id: name + '|' + brainName,
                            title: name,
                            content,
                            format: formatName,
                            source: brainName,
                            brain: brainName,
                            type: 'brain'
                        });
                    }
                } catch (e) { /* ignore */ }
            }
        }
        return results;
    } else {
        return (async () => {
            const results = [];
            for (const brainName of stack) {
                const brainInfo = resolveBrainPath(brainName);
                if (brainInfo && brainInfo.path) {
                    const dirPath = brainInfo.path;
                    try {
                        const files = await fs.promises.readdir(dirPath);
                        for (const file of files) {
                            const ext = path.extname(file).toLowerCase();
                            if (!extensions.includes(ext)) continue;

                            const name = format?.getBrainName ? format.getBrainName(file) : file.replace('.md', '');
                            const formatName = ext === '.md' ? 'md' : ext === '.json' ? 'json' : 'txt';
                            const content = _bfsRead(_brainRel(dirPath, file));
                            results.push({
                                id: name + '|' + brainName,
                                title: name,
                                content,
                                format: formatName,
                                source: brainName,
                                brain: brainName,
                                type: 'brain'
                            });
                        }
                    } catch (e) { /* ignore */ }
                }
            }
            return results;
        })();
    }
}

/**
 * Check if brain exists (ASYNC)
 * @param {string} name - Brain name
 * @returns {Promise<string|null>} Source
 */
async function hasBrain(name) {
    // Guard against null/undefined
    if (!name || typeof name !== 'string') {
        return null;
    }

    const resolved = resolve(name);
    const brainPath = getBrainPath();
    const publicPath = getPublicPath();

    // Slice 4: existence through the brain FileStore (resolved names come
    // from the alias registry and are treated as trusted internal input)
    const _bfs = _getBrainFileStore();
    if (resolved.includes('..') || !_validBrainSegment(resolved)) return null;
    if (_bfs.has(_brainRel(brainPath, resolved + '.md'))) return 'private';
    if (_bfs.has(_brainRel(publicPath, resolved + '.md'))) return 'public';
    return null;
}

/**
 * Get list of available brains (ASYNC)
 * @param {string} [type] - Filter
 * @returns {Promise<Array>} Brain names
 */
async function brainFiles(type) {
    const brainPath = getBrainPath();
    const publicPath = getPublicPath();
    const names = new Set();

    async function addBrains(dirPath) {
        try {
            const files = await fs.promises.readdir(dirPath);
            for (const f of files) {
                if (f.endsWith('.md')) names.add(f.replace('.md', ''));
            }
        } catch (e) {
            if (e.code !== 'ENOENT' && e.code !== 'ENOTDIR') throw e;
        }
    }

    if (!type || type === 'public') {
        await addBrains(publicPath);
    }

    if (!type || type === 'private') {
        await addBrains(brainPath);
    }

    return Array.from(names).sort();
}

/**
 * Get brain version
 */
function getVersion() {
    // Single source of truth (lib/version.js reads package.json) - a
    // hardcoded literal here would drift from package on every bump.
    return require('./version');
}

/**
 * Get identity from corpus
 */
async function getIdentity() {
    const item = await load('identity');
    if (item) {
        const content = item.content || '';
        const nameMatch = content.match(/NAME:\s*(\w+)/);
        const roleMatch = content.match(/ROLE:\s*([^\n]+)/);
        return {
            name: nameMatch?.[1] || 'Agent',
            role: roleMatch?.[1] || 'AI Agent',
            source: item.source
        };
    }
    return { name: 'Agent', role: 'AI Agent', source: 'default' };
}

// ==================== STORAGE FORWARDERS ====================
let _storageRef = null;
function _getStorageRef() {
    if (!_storageRef) _storageRef = require('./storage');
    return _storageRef;
}

function getBrainStorage() {
    return _getStorageRef().get('brain');
}

/**
 * Write with security chain (VAF → QoS → Escrow)
 * All writes go through security by default
 */
async function write(category, key, content, options = {}) {
    // Support writing to specific brain via options.brain
    if (options.brain) {
        const brainType = options.type || 'private';
        return _writeToBrain(options.brain, brainType, category, key, content);
    }

    // SECURITY: Run VAF → QoS → Escrow chain
    const qosCleanup = await _runBrainSecurityChain('write', {
        type: 'write',
        category,
        key,
        content: content || '',
        userCtx: options.userCtx,
        habitat: options.habitat
    });
    try {
        // Emit beforeSave hooks
        emit('beforeSave', { category, key, content });
        const result = _getStorageRef().get('brain').write(category, key, content);
        // Emit afterSave hooks
        emit('afterSave', { category, key, content });
        if (qosCleanup) qosCleanup();
        return result;
    } catch (e) {
        if (qosCleanup) qosCleanup();
        throw e;
    }
}

/**
 * Load with security chain (VAF → QoS)
 * All reads go through security by default
 */
async function load(name, options = {}) {
    // (P3 #34) Short-circuit when the load circuit is OPEN — fast-fail with a
    // coded retryable error instead of hammering the wedged machinery.
    // HALF-OPEN probe: after the reset window elapses, allow ONE load through
    // to test whether the wedge cleared (success → close, failure → re-open).
    if (_loadCircuit.state === 'OPEN') {
        const resetMs = _loadCircuitResetMsNow();
        const windowElapsed = resetMs > 0 && (Date.now() - _loadCircuit.openedAt) >= resetMs;
        if (windowElapsed && !_loadCircuit.probing) {
            _loadCircuit.state = 'HALF_OPEN';
            _loadCircuit.probing = true;
            _emit('brain:load:circuit:halfOpen', { failures: _loadCircuit.failures, timestamp: Date.now() });
        } else {
            throw new errors.VantError(`Brain load circuit open after ${_loadCircuit.failures} consecutive failures`, {
                code: 'BRAIN_CIRCUIT_OPEN',
                retryable: true,
                details: { failures: _loadCircuit.failures, openedAt: _loadCircuit.openedAt, lastError: getLoadCircuitStatus().lastError }
            });
        }
    }

    // Support loading from specific brain via options.brain
    if (options.brain) {
        const brainType = options.type || 'private';
        const root = brainType === 'private' ? _brainRoots.private : _brainRoots.public;
        const brainPath = root + '/' + options.brain;

        // Use BrainStorage for the target brain (proper architecture)
        const { BrainStorage } = require('./storage');
        const targetStorage = new BrainStorage({ basePath: brainPath });

        // Support category/key format
        const parts = name.includes('/') ? name.split('/') : ['learnings', name];
        const category = parts[0];
        const key = parts[1];

        try {
            const result = await targetStorage.get(category, key + '.md');
            if (result) {
                _recordLoadSuccess();
                return { name, content: result, source: options.brain };
            }
            return null;
        } catch (e) {
            // (P3 #34) failure path #2: storage-layer error on the direct path
            _recordLoadFailure(e);
            throw e;
        }
    }

    // Recursion guard: prevent infinite brain load loops
    const depthCheck = guard.check('brain:load:' + name);
    if (!depthCheck.allowed) {
        // (P3 #34) failure path #3: recursion-guard trip feeds the breaker
        const guardErr = new errors.VantError('Recursion depth exceeded', { code: errors.CODES.BRAIN_LOAD_FAIL });
        _recordLoadFailure(guardErr);
        throw guardErr;
    }

    // SECURITY: Run VAF → QoS chain
    const qosCleanup = await _runBrainSecurityChain('load', {
        type: 'read',
        category: '',
        key: name,
        userCtx: options.userCtx,
        habitat: options.habitat
    });
    try {
        const result = await _loadBrain(name, options);

        // Auto-track brain loads in evolution session
        if (result && result.name) {
            recordChange('load', {
                name: result.name,
                source: result.source,
                brain: result.brain
            });
        }

        if (qosCleanup) qosCleanup();
        // (P3 #34) a load that returned (result or graceful null) is not a
        // failure: success closes the breaker, null misses never feed it.
        if (result === null || result === undefined) {
            return result;
        }
        _recordLoadSuccess();
        return result;
    } catch (e) {
        if (qosCleanup) qosCleanup();
        // (P3 #34) failure path #1: pipeline-critical handler crash (or any
        // thrown load error) feeds the breaker.
        _recordLoadFailure(e);
        throw e;
    } finally {
        guard.release('brain:load:' + name);
    }
}

function append(key, content) {
    return _getStorageRef().get('brain').append(key, content);
}

function get(category, key, options = {}) {
    // RLS per-record ACL check (REQUIRED)
    if (!options.userCtx) {
        throw new errors.VantError('userCtx required', { code: errors.CODES.VAF_REQUIRED_FIELD });
    }
    _checkRead(options.userCtx, '_brain:' + category + ':' + key);

    const result = _getStorageRef().get('brain').get(category, key, {
        userCtx: options.userCtx,
        decryptKey: options.decryptKey
    });

    // OPTIONAL: Decrypt at rest
    if (result && result._encrypted && options.decryptKey) {
        const Encrypt = _getEncrypt();
        if (Encrypt) {
            try {
                result.data = Encrypt.decrypt(result.data, options.decryptKey);
            } catch (e) {
                return { error: 'decryption failed', category, key };
            }
        }
    }

    return result;
}

// ==================== PRELOAD CORPUS ====================
// Pre-load corpus on startup for sync access (fire and forget)
setImmediate(() => {
    loadCorpus().catch(() => {}); // Ignore errors - cache will be empty
});

// Auto-start evolution session on first brain interaction
setImmediate(() => {
    try {
        startEvolutionSession('auto-' + Date.now());
    } catch (e) {}
});

// ==================== AUTO-REGISTER LIFECYCLE HOOKS ====================
// Register hooks on load so dream system works automatically
// Bootstrap: Restore lessons.md from state
onBootstrap(async () => {
    const state = await _loadState();
    return _restoreLessonsFromState(state);
});

// Shutdown: End evolution session + run dream consolidation NOW
onShutdown(async () => {
    // End evolution session (saves recentInsights to state)
    await endEvolutionSession();
    // Run dream consolidation immediately (don't wait for cron)
    await dream(true, 3, true);
});

// ==================== MULTIBRAIN FRAMEWORK CONFIG ====================
// Absorbed from framework.js (v0.9.6)

const _brainFrameworkConfigs = {};

function getBrainFrameworkConfig() {
    const brainName = currentBrain();
    return _brainFrameworkConfigs[brainName] || { mode: 'dual' };
}

function setBrainFrameworkConfig(config) {
    const brainName = currentBrain();
    _brainFrameworkConfigs[brainName] = config;
    return true;
}

function getStackFrameworkConfigs() {
    const stack = getStack();
    const results = { source: 'stack', brains: stack, byBrain: {} };

    for (const brainName of stack) {
        try {
            pushBrain(brainName);
            results.byBrain[brainName] = getBrainFrameworkConfig();
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            removeBrain();
        }
    }
    return results;
}

// ==================== EXPORTS ====================
module.exports = {
    // Registry
    register,
    getHandler,
    listHandlers,

    // Pipeline
    getPipeline,
    setPipeline,
    addMiddleware,
    removeMiddleware,
    executePipeline,
    getPipelineState,

    // Hooks
    on,
    off,
    emit,

    // Aliases
    alias,
    resolve,
    listAliases,

    // Transformers
    transform,
    applyTransforms,

    // Cache
    setCache,
    invalidateCache,
    invalidateCorpusCache,
    getCacheStats,

    // Watcher
    setWatch,
    isWatching,

    // Metrics
    getMetrics,
    resetMetrics,

    // Load circuit breaker (P3 #34)
    getLoadCircuitStatus,
    resetLoadCircuit,
    _setLoadCircuitThreshold,
    _setLoadCircuitResetMs,
    _clearHandlerOverride,

    // Lifecycle
    onBootstrap,
    bootstrap,
    onShutdown,
    shutdown,

    // Neurons
    fireSynapse,
    predictNext,
    getSynapses,
    attend,
    getAttention,
    attendBySemantic,  // NEW: semantic attention boost
    metabolize,
    dream,
    onFail,
    preload,
    forget,

    // State persistence
    getNeuronState,
    saveNeuronState,
    restoreNeuronState,
    _setSkipSave,

    // Paths
    getBrainPath,
    getPublicPath,
    currentBrain,
    brainMode,
    brainDirs,
    switchBrain,
    loadStack,
    getStack,
    pushBrain,
    removeBrain,

    merge,
    writeTo,
    read,              // v0.8.6: Unified read - reads any brain file by name
    _loadBrain,        // Internal: load brain by name
    geoLoad,
    geoStore,
    geoList,
    geoBrains,
    getGeometryPath,
    resolveBrainPath,

    // Evolution (vertical learning)
    startEvolutionSession,
    endEvolutionSession,
    getEvolutionSession,
    recordChange,
    recordInsight,
    getEvolutionChanges,
    getEvolutionInsights,
    getEvolutionHistory,

    // Multi-brain helpers (v0.8.6)
    listBrains: () => {
        // Return array of all brain names (public + private)
        const dirs = brainDirs();
        return [...dirs.public, ...dirs.private];
    },
    currentBrain,  // Get/set current brain
    getCurrentBrain: () => currentBrain(),  // Convenience getter
    brainNeurons: () => {
        // Return per-brain neuron state
        const synapses = getSynapses();
        // Get attention for all brains in stack
        const attention = {};
        const stack = getStack();
        for (const brain of stack) {
            attention[brain] = getAttention(brain);
        }
        // Predict next brain for each brain in stack
        const predictions = {};
        for (const brain of stack) {
            const next = predictNext(brain);
            if (next) predictions[brain] = next;
        }
        return { synapses, attention, predictions };
    },
    brainSaveNeurons: (data) => {
        // Save neuron state back to state.json
        // Data should have: { synapses?, attention?, predictions? }
        if (!data || typeof data !== 'object') {
            return { error: 'data required' };
        }
        const current = getNeuronState().then(neurons => {
            const updated = { ...neurons };
            if (data.synapses) updated.synapses = data.synapses;
            if (data.attention) updated.attention = data.attention;
            return saveNeuronState(updated);
        });
        return { saving: true, promise: current };
    },

    // Core loading
    load,
    loadContent: async (name, options = {}) => {
        // Convenience: return just content string instead of {name, content, source, brain}
        const result = await load(name, options);
        return result?.content || null;
    },
    read,  // NEW (v0.8.6): Unified read with format support
    loadFile,  // NEW (v0.8.6): File load via format.js
    saveFile,  // NEW (v0.8.6): File save via format.js
    loadCorpus,  // v0.8.6: use {sync:true} for sync mode
    loadStackCorpus,  // v0.8.6: use {sync:true} for sync mode
    hasBrain,
    brainFiles,

    // Mode switch
    getMode,
    setMode,
    getRemoteURL,
    setRemoteURL,

    // Version & identity
    getVersion,
    getIdentity,

    // Storage forwarders
    getBrainStorage,
    write,
    append,
    get,

    // Module access
    getModule,

    // Sandbox brain handlers
    _wireBrainToSandbox,

    // NEW: Stego backup/restore (like brain-horcrux)
    async backupToImage(imagePath) {
        // Backup brain to PNG image via stego
        const stego = require('./stego');
        return await stego.encodeBrain(imagePath);
    },

    async restoreFromImage(imagePath) {
        // Restore brain from PNG image via stego
        const stego = require('./stego');
        return await stego.decodeBrain(imagePath);
    },

    listBackups() {
        // List available backup images (enumeration on fs - anchored to the
        // brain storage backups dir; getBrainStorage() has no .path property,
        // so the old path.join(storage, 'backups') silently pointed at ./backups)
        const dir = path.join(getBrainStorage().basePath, 'backups');
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir).filter(f => f.endsWith('.png'));
    },

    // NEW: brain.myStuff - user's personal brain data
    myStuff() {
        // Get user's personal brain data (identity, goals, lessons, etc)
        // (slice 4: through the brain FileStore)
        const privatePath = getBrainPath();

        const files = ['identity.md', 'goals.md', 'lessons.md', 'preferences.md', 'errors.md'];
        const stuff = {};

        for (const file of files) {
            const rel = _brainRel(privatePath, file);
            if (_bfsHas(rel)) {
                stuff[file.replace('.md', '')] = _bfsRead(rel);
            }
        }

        return { ...stuff, loaded: Object.keys(stuff), count: Object.keys(stuff).length };
    },

    updateMyStuff(key, content) {
        // Update a personal brain file
        // (slice 4: through the brain FileStore, key validated before path use)
        if (!_validBrainSegment(key)) {
            throw new errors.VantError('Invalid brain file name', { code: errors.CODES.VAF_PATH_BLOCKED });
        }
        const privatePath = getBrainPath();
        _bfsWrite(_brainRel(privatePath, `${key}.md`), content);
        return { updated: key, success: true };
    },

    // myStuff also has dropbox (private version)
    // (slice 2: through storage layer at models/tmp-space/myStuff)
    myDropFile(name, content) {
        if (!_validBrainSegment(name)) return { error: 'Invalid file name', name };
        _getTmpSpaceStore().write(path.join('myStuff', name), content);
        return { saved: name, type: 'myStuff' };
    },

    myGetFile(name) {
        if (!_validBrainSegment(name)) return { error: 'not found' };
        const rel = path.join('myStuff', name);
        if (!_getTmpSpaceStore().has(rel)) return { error: 'not found' };
        return { name, content: _getTmpSpaceStore().read(rel), type: 'myStuff' };
    },

    myListFiles() {
        // (slice 2 anchored this at tmp-space; enumeration stays on fs)
        const myPath = path.resolve(process.cwd(), 'models', 'tmp-space', 'myStuff');
        if (!fs.existsSync(myPath)) return { files: [], type: 'myStuff' };
        return { files: fs.readdirSync(myPath).map(f => ({ name: f })), type: 'myStuff' };
    },

    myDeleteFile(name) {
        if (!_validBrainSegment(name)) return { error: 'Invalid file name', name };
        const rel = path.join('myStuff', name);
        if (_getTmpSpaceStore().has(rel)) _getTmpSpaceStore().delete(rel);
        return { deleted: name, type: 'myStuff' };
    },

    // NEW: brain.yourStuff - temp stash (work in progress)
    // (slice 2: through storage layer at models/tmp-space/yourStuff.json)
    yourStuff() {
        const _ts = _getTmpSpaceStore();
        if (!_ts.has('yourStuff.json')) return { stash: null, empty: true };
        try { return JSON.parse(_ts.read('yourStuff.json')); } catch (e) { console.warn("[brain] yourStuff parse:", e.message); return { stash: null, empty: true }; }
    },

    stashYourStuff(data) {
        _getTmpSpaceStore().write('yourStuff.json', JSON.stringify({ ...data, stashed: Date.now() }, null, 2));
        return { stashed: true };
    },

    clearYourStuff() {
        const _ts = _getTmpSpaceStore();
        if (_ts.has('yourStuff.json')) _ts.delete('yourStuff.json');
        return { cleared: true };
    },

    // NEW: brain.yourStuff as handler (stream, msg events)
    // (slice 2: through storage layer at models/tmp-space/handlers.json)
    onStream(handler) {
        const _ts = _getTmpSpaceStore();
        const handlers = _ts.has('handlers.json') ? JSON.parse(_ts.read('handlers.json')) : {};
        handlers.stream = handler.toString();
        _ts.write('handlers.json', JSON.stringify(handlers, null, 2));
        return { registered: 'stream', success: true };
    },

    onMessage(handler) {
        const _ts = _getTmpSpaceStore();
        const handlers = _ts.has('handlers.json') ? JSON.parse(_ts.read('handlers.json')) : {};
        handlers.message = handler.toString();
        _ts.write('handlers.json', JSON.stringify(handlers, null, 2));
        return { registered: 'message', success: true };
    },

    getHandlers() {
        const _ts = _getTmpSpaceStore();
        if (!_ts.has('handlers.json')) return { stream: null, message: null };
        return JSON.parse(_ts.read('handlers.json'));
    },

    clearHandlers() {
        const _ts = _getTmpSpaceStore();
        if (_ts.has('handlers.json')) _ts.delete('handlers.json');
        return { cleared: true };
    },

    // NEW: brain.yourStuff as Dropbox (quick share)
    // (slice 2: through storage layer at models/tmp-space/dropbox)
    dropFile(name, content) {
        if (!_validBrainSegment(name)) return { error: 'Invalid file name', name };
        _getTmpSpaceStore().write(path.join('dropbox', name), content);
        return { saved: name, path: path.join(process.cwd(), 'models', 'tmp-space', 'dropbox', name) };
    },

    getFile(name) {
        if (!_validBrainSegment(name)) return { error: 'not found' };
        const rel = path.join('dropbox', name);
        if (!_getTmpSpaceStore().has(rel)) return { error: 'not found' };
        return { name, content: _getTmpSpaceStore().read(rel) };
    },

    listFiles() {
        // List shared files in dropbox (enumeration stays on fs; anchored)
        const dropPath = path.resolve(process.cwd(), 'models', 'tmp-space', 'dropbox');
        if (!fs.existsSync(dropPath)) return { files: [] };
        const files = fs.readdirSync(dropPath).map(f => {
            const stat = fs.statSync(path.join(dropPath, f));
            return { name: f, size: stat.size, mtime: stat.mtime };
        });
        return { files };
    },

    deleteFile(name) {
        if (!_validBrainSegment(name)) return { error: 'Invalid file name', name };
        const rel = path.join('dropbox', name);
        if (_getTmpSpaceStore().has(rel)) _getTmpSpaceStore().delete(rel);
        return { deleted: name };
    },

    clearDropbox() {
        // Clear all shared files (slice 5: deletes through the tmp-space store;
        // enumeration stays on fs - metadata limitation - path anchored)
        const dropPath = path.resolve(process.cwd(), 'models', 'tmp-space', 'dropbox');
        const _ts = _getTmpSpaceStore();
        if (fs.existsSync(dropPath)) {
            for (const f of fs.readdirSync(dropPath)) {
                const rel = path.join('dropbox', f);
                if (_ts.has(rel)) _ts.delete(rel);
            }
        }
        return { cleared: true };
    },

    // Framework config (from framework.js, v0.9.6)
    getBrainFrameworkConfig,
    setBrainFrameworkConfig,
    getStackFrameworkConfigs
};
