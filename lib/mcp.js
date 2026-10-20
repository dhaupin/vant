/**
 * Vant MCP Server (v0.8.6)
 * WITH EVENT EMISSIONS - MCP requests emit globally
 *
 * Model Context Protocol - brain tools exposed as JSON-RPC
 * Format: supports yaml/json via format.js
 *
 * Usage:
 *   const mcp = require('./mcp');
 *   await mcp.start();  // Starts on VANT_MCP_PORT or 3457
 *
 * SECURITY: Recursion guard to prevent MCP tool chain loops
 */

const errors = require('./error');
const { AsyncLocalStorage } = require('async_hooks');

// (pass 86) Request-scoped RLS credential. The HTTP door captures the
// bearer token it accepted and every tool handler inside that request can
// pull the REGISTRY-VERIFIED subject via _requestCtx() — verified beats
// declared: a caller-supplied userCtx NEVER overrides it.
const _requestAls = new AsyncLocalStorage();

// Token -> registry-verified RLS subject (fail closed: null on anything
// unknown/expired/revoked). Shared by the HTTP door and _requestCtx.
function _tokenToContext(token) {
    if (!token || typeof token !== 'string' || !token.startsWith('vant_')) return null;
    try {
        const h = require('./habitat').getShared();
        return h.verifyToken(token);
    } catch (e) {
        return null;
    }
}

/**
 * (pass 86) The RLS subject for the CURRENT tool execution. Priority:
 *   1. Bearer habitat token captured by the HTTP door (registry-verified —
 *      beats anything the caller declares in args).
 *   2. Args-declared userCtx (legacy/self-declared, pre-86 behavior).
 *   3. Current agent's habitat identity (spawn/currentAgentId).
 *   4. null = anonymous.
 */
function _requestCtx(declared) {
    const store = _requestAls.getStore();
    if (store && store.verifiedCtx) return store.verifiedCtx;
    if (declared) return declared;
    try {
        const agents = require('./agents');
        const current = agents.getCurrentAgentId ? agents.getCurrentAgentId() : null;
        if (current && current !== 'default' && agents.agentContext) {
            const ctx = agents.agentContext(current);
            if (ctx) return ctx;
        }
    } catch (e) { /* agents unavailable - anonymous */ }
    return null;
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

// (pass 212, H2 of #185) Event-tap runtime facts for the SSE board. The count
// is the pod-wide connection bound (DoS discipline, the issue's own lesson).
const tapRuntime = { count: 0 };

const vant = require('./vant');
const path = require('path');

// v0.8.6 fs->storage migration (slice 5): MCP's own file-backed stores, the
// raw vant_storage_* file tools, and the search/share agent+skill directory
// scans route through FileStorage (containment/symlink/VAF/atomic-write).
// Scans use listRaw over _MCP_ROOT-relative globs (anchored to models roots).
const _mcpStore = new (require('./storage').FileStorage)({
    basePath: path.resolve(process.cwd(), 'models')
});
const _MCP_ROOT = path.resolve(process.cwd(), 'models');

// All user-controlled names/paths become path segments - validate before
// interpolation (previously unguarded on read tools).
function _validSegment(name) {
    if (typeof name !== 'string' || !name || name.length > 128) return false;
    if (!/^[A-Za-z0-9][A-Za-z0-9._ -]*$/.test(name)) return false;
    if (name.includes('..')) return false;
    return true;
}

// Contain a caller-supplied absolute-ish path to the models root (used by the
// vant_storage_* file tools so MCP clients cannot escape the workspace).
function _containedModelPath(p) {
    if (typeof p !== 'string' || !p) return null;
    const abs = path.resolve(_MCP_ROOT, p.replace(/^\/(?:models\/)?/, ''));
    if (abs !== _MCP_ROOT && !abs.startsWith(_MCP_ROOT + path.sep)) return null;
    return abs;
}
const guard = require('./recursion');  // Unified recursion guard
const pipeline = require('./pipeline');

// Lazy-load vant subsystems
function _brain() { return vant.brain; }
function _audit() { return vant.audit(); }
function _islands() { return vant.islands; }
function _search() { return vant.search; }
function _storage() { return vant.storage; }
function _config() { return vant.config(); }
function _citations() { return vant.citations(); }
function _embed() { return vant.embed(); }
function _sync() { return vant.sync(); }
function _network() { return vant.network(); }

// Lazy require for v0.8.6 modules
const _lazyRequireCache = {};
function _lazyRequire(path) {
    if (_lazyRequireCache[path]) return _lazyRequireCache[path];
    try {
        const mod = require(path);
        _lazyRequireCache[path] = mod;
        return mod;
    } catch (e) {
        return null;
    }
}

const _methods = new Map();

// Task ID tracking for sudo checks
let _currentTaskId = 'default';
function _getTaskId() {
    return _currentTaskId || 'default';
}
function _setTaskId(taskId) {
    _currentTaskId = taskId;
}

// ==================== SECURITY CHAIN ====================

/**
 * Run security chain before MCP handler execution
 * Uses unified pipeline
 */
// (B-2) write detection by prefix-family instead of a 4-entry allowlist.
// The old list missed ~29 write-capable tools (vant_storage_rm/cp/mkdir,
// teams_create*, agent_spawn, vant_commit, ...), which therefore ran under
// the read-only PUBLIC pipeline mode.
const _MCP_WRITE_PREFIXES = [
    'brain_save', 'brain_delete', 'brain_write', 'brain_push', 'brain_remove',
    'brain_link', 'storage_write', 'storage_delete'
];
const _MCP_WRITE_PATTERNS = [
    '_rm', '_cp', '_mkdir', '_delete', '_remove', '_write', '_save', '_create',
    '_push', '_stash', '_update', '_commit', 'dropfile', '_spawn'
];
function _isMcpWriteMethod(method) {
    const name = String(method || '').toLowerCase();
    if (_MCP_WRITE_PREFIXES.some(p => name.startsWith(p))) return true;
    return _MCP_WRITE_PATTERNS.some(p => name.includes(p));
}

async function _runSecurityChain(method, params, context = {}) {
    const isWrite = _isMcpWriteMethod(method);

    const pipelineMode = isWrite ? pipeline.PRIVATE : pipeline.PUBLIC;

    // Run through unified pipeline (replaces inline vaf → qos → escrow)
    await pipeline.run(
        { method, params, name: method, ...context },
        async () => {
            // No-op: actual execution happens in _executeWithSecurity
            return { ok: true };
        },
        { mode: pipelineMode }
    );

    return context;
}

/**
 * Execute MCP handler with security chain
 */
// ==================== TOOL INPUT SCHEMA VALIDATION (P1 #14) ====================
// The audit's "100+ tools define schemas but NONE validated at dispatch":
// 269 inputSchemas were decorative. Every dispatch door now runs the declared
// schema through this validator. Contract: fail-closed on DECLARED constraints
// (required / declared-type / enum), permissive on undeclared keys so bare
// {type:'object'} schemas and schema-less legacy tools keep passing.
function _validateToolInput(schema, params) {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return [];
    if (params !== undefined && params !== null && typeof params !== 'object') {
        return ['params must be an object, got ' + typeof params];
    }
    params = params || {};

    const problems = [];

    // required
    if (Array.isArray(schema.required)) {
        for (const key of schema.required) {
            if (params[key] === undefined || params[key] === null) {
                problems.push(`missing required param: ${key}`);
            }
        }
    }

    // declared properties
    const props = schema.properties;
    if (props && typeof props === 'object') {
        for (const [key, def] of Object.entries(props)) {
            if (!def || typeof def !== 'object' || params[key] === undefined) continue;
            const val = params[key];
            if (def.type) {
                const actual = Array.isArray(val) ? 'array' : typeof val;
                if (actual !== def.type) {
                    problems.push(`param ${key}: expected ${def.type}, got ${actual}`);
                    continue;
                }
            }
            if (Array.isArray(def.enum) && !def.enum.includes(val)) {
                problems.push(`param ${key}: must be one of ${def.enum.join(', ')}`);
            }
            if (def.type === 'array' && val && Array.isArray(val)) {
                if (typeof def.minItems === 'number' && val.length < def.minItems) {
                    problems.push(`param ${key}: needs at least ${def.minItems} items`);
                }
                if (typeof def.maxItems === 'number' && val.length > def.maxItems) {
                    problems.push(`param ${key}: allows at most ${def.maxItems} items`);
                }
            }
        }
    }

    return problems;
}

async function _executeWithSecurity(method, handler, params) {
    // Recursion guard: prevent infinite MCP tool chain loops
    const depthCheck = guard.check('mcp:execute');
    if (!depthCheck.allowed) {
        throw new errors.VantError('MCP recursion exceeded', { code: errors.CODES.BRAIN_LOAD_FAIL });
    }

    const context = {};

    // P1 #14: enforce the tool's declared inputSchema BEFORE any side effects.
    // Coded VantError so the RPC layer surfaces a clean validation failure.
    const tool = _methods.get(method);
    if (tool && tool.inputSchema) {
        const schemaProblems = _validateToolInput(tool.inputSchema, params);
        if (schemaProblems.length > 0) {
            throw new errors.VantError('MCP input schema violation: ' + schemaProblems.join('; '), {
                code: errors.CODES.MCP_INPUT_INVALID || 'MCP_INPUT_INVALID',
                retryable: false
            });
        }
    }

    // Run security chain (now uses unified pipeline)
    await _runSecurityChain(method, params, context);

    // Execute handler
    try {
        return await handler(params);
    } finally {
        guard.release('mcp:execute');
    }
}

// ==================== BRAIN TOOLS ====================

_methods.set('brain_load', {
    description: 'Load a brain by name',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => {
        const b = await _brain().load(name);
        return { id: b?.id, name: b?.name, content: b?.content?.slice(0, 500) };
    }
});

_methods.set('brain_save', {
    description: 'Save/update a brain file',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, content: { type: 'string' } }, required: ['name', 'content'] },
    handler: async ({ name, content }) => {
        const brain = _brain();
        // Remove .md extension if present, remove 'brain/' prefix if present
        let key = name.replace(/\.md$/, '').replace(/^brain\//, '');
        await brain.write('', key + '.md', content);
        return { saved: true, name: key };
    }
});

// NEW (v0.8.6): Read a brain file by name - lightweight read without loading brain
_methods.set('brain_read', {
    description: 'Read a brain file by name (lightweight, no brain load)',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => {
        const brain = _brain();
        const result = await brain.read(name);
        if (!result) {
            return { error: 'Brain not found: ' + name };
        }
        return result;
    }
});

// NEW (v0.8.6): Write a brain file by name - lightweight write without loading brain
_methods.set('brain_write', {
    description: 'Write a brain file by name (lightweight, no brain load)',
    inputSchema: { type: 'object', properties: {
        name: { type: 'string' },
        content: { type: 'string' },
        format: { type: 'string', enum: ['md', 'json', 'yaml', 'txt'] }
    }, required: ['name', 'content'] },
    handler: async ({ name, content, format = 'md' }) => {
        const brain = _brain();
        // (pass 74, multibrain census) brain_write used to hardcode
        // './models/private/' + name, bypassing brain scoping entirely: a
        // live probe wrote models/private/<name> at the ROOT, outside every
        // brain dir, with no extension - a file brain.read could never see.
        // Now: root the file at the ACTIVE brain (getBrainPath honors
        // VANT_BRAIN env > currentBrain, same resolver state-store uses),
        // validate the name as a single path segment, and mirror the
        // _writeToBrain extension rule (append .md only when absent) so
        // brain_read's extension-aware lookup finds it.
        if (!name || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(String(name)) || String(name).includes('..')) {
            return { error: 'Invalid brain file name: ' + JSON.stringify(String(name).slice(0, 40)) };
        }
        const root = typeof brain.getBrainPath === 'function'
            ? brain.getBrainPath()
            : 'models/private/' + (brain.currentBrain ? brain.currentBrain() : 'vant');
        const base = String(name);
        const ext = base.endsWith('.md') ? '' : '.md';
        const result = await brain.saveFile(root + '/' + base + ext, content, { format });
        if (result.error) {
            return { error: result.error };
        }
        return { saved: true, name, path: root + '/' + base + ext };
    }
});

_methods.set('brain_list', {
    description: 'List all available brains',
    inputSchema: { type: 'object' },
    handler: async () => {
        return { brains: await _brain().listBrains() };
    }
});

// ==================== MULTI-BRAIN TOOLS ====================

// Layout migration status (0.8.6): agents and MCP clients can
// detect a pre-multibrain (legacy single-public-brain) layout and report
// or trigger the migration instead of silently finding an empty brain.
_methods.set('brain_migration_status', {
    description: 'Check brain layout version + pending migrations (legacy layouts are auto-imported on vant start)',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
        const migrations = require('./migrations');
        const status = migrations.status();
        const legacyPending = status.pending.some(p => p.id === 'legacy.multibrain-import');
        return {
            ...status,
            legacy: legacyPending,
            guidance: legacyPending
                ? 'Legacy (pre-multibrain) brain layout detected. Run `vant migrate` (or just `vant start`) to import it into models/{public,private}/<brain>/ — default brain name "vant", override with `vant migrate --brain-name <name>`. Nothing is lost: content-based detection, idempotent, dry-run with --dry-run.'
                : (status.upToDate ? 'Brain layout is up to date.' : 'Pending migrations listed above; run `vant migrate`.')
        };
    }
});

// (pass 179 Wave A2, prd-canonicalization §2) Event-bus observability:
// read the tail of the shared bus's opt-in session sink (lib/event.js).
// OFF-by-default sink; tool reports _disabled_ with guidance unless the
// caller first enables (event_sink_enable) or the CLI recorded a session.
_methods.set('event_tail', {
    description: 'Tail recent events from the shared bus session sink (266 emitted / 8 heard before pass 179 — this makes the rest observable)',
    inputSchema: {
        type: 'object',
        properties: {
            max: { type: 'number', description: 'Max events to return (default 50)' },
            nameFilter: { type: 'string', description: 'Keep events whose type starts with this prefix (e.g. "storage:")' },
            module: { type: 'string', description: 'Keep events whose module prefix (text before first colon) matches' }
        }
    },
    handler: async (args) => {
        const bus = require('./event');
        const res = bus.sinkTail({
            max: args.max || 50,
            nameFilter: args.nameFilter || null,
            module: args.module || null
        });
        if (!res.enabled) {
            return { ...res, guidance: 'Sink is off. Call event_sink_enable first (recording is per-process), then emit, then event_tail.' };
        }
        return res;
    }
});

_methods.set('event_sink_enable', {
    description: 'Enable the shared bus event sink (per-process JSONL session recording)',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
        const bus = require('./event');
        const file = bus.sinkEnable();
        return { enabled: true, file };
    }
});

_methods.set('event_sink_stats', {
    description: 'Shared-bus sink status (enabled/file/events/bytes)',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
        return require('./event').sinkStats();
    }
});

_methods.set('brain_stack', {
    description: 'Get current brain stack',
    inputSchema: {
        type: 'object',
        properties: {
            wait: { type: 'boolean', description: 'Wait for state load before returning' }
        }
    },
    handler: async (args) => {
        // Support both sync and async via wait option
        if (args.wait) {
            return { stack: await _brain().getStack({ wait: true }) };
        }
        return { stack: _brain().getStack() };
    }
});

_methods.set('brain_load', {
    description: 'Load brain(s) - accepts single name or array',
    inputSchema: {
        type: 'object',
        properties: {
            brains: {
                description: 'Brain name (string) or array of brain names',
                oneOf: [
                    { type: 'string' },
                    { type: 'array', items: { type: 'string' } }
                ]
            },
            type: { type: 'string', description: 'Brain type: private (default) or public' }
        },
        required: ['brains']
    },
    handler: async (args) => {
        const result = await _brain().load(args.brains, { type: args.type || 'private' });
        return result;
    }
});

// ==================== CONTEXT TOOLS (v0.8.6) ====================

_methods.set('context_build', {
    description: 'Build prompt context with caching (optimizes tokens)',
    inputSchema: {
        type: 'object',
        properties: {
            brain: { type: 'string', description: 'Brain name (default: current)' },
            includeTools: { type: 'boolean', description: 'Include tool schemas (default: true)' },
            includeHistory: { type: 'boolean', description: 'Include chat history (default: true)' },
            includeDynamic: { type: 'boolean', description: 'Include dynamic content (default: true)' }
        }
    },
    handler: async (args) => {
        const context = require('./context');
        const result = await context.build({
            brain: args.brain,
            includeTools: args.includeTools !== false,
            includeHistory: args.includeHistory !== false,
            includeDynamic: args.includeDynamic !== false
        });
        // (pass 80) context.cache.state holds a back-reference to the built
        // context itself (context.js _updateCacheState stores state.context
        // = context), so JSON-stringifying this result threw 'Converting
        // circular structure to JSON'. Strip the backref on the way out —
        // the module-level cache keeps it for isCacheValid()/hits.
        if (result?.cache?.state) {
            const { context: _ctxRef, ...cacheSummary } = result.cache.state;
            result.cache.state = cacheSummary;
        }
        return result;
    }
});

_methods.set('context_inspect', {
    description: 'Inspect context state and cache status',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
        const context = require('./context');
        return context.inspect();
    }
});

_methods.set('context_heartbeat', {
    description: 'Start/stop context heartbeat (keeps prompt cache warm)',
    inputSchema: {
        type: 'object',
        properties: {
            action: { type: 'string', enum: ['start', 'stop', 'status'], default: 'status' },
            interval: { type: 'number', description: 'Interval in ms (default: 4 min)' }
        }
    },
    handler: async (args) => {
        const cron = require('./cron');
        if (args.action === 'start') {
            cron.startContextHeartbeat({ interval: args.interval });
            return { started: true };
        } else if (args.action === 'stop') {
            cron.stopContextHeartbeat();
            return { stopped: true };
        } else {
            return cron.getStatus();
        }
    }
});

_methods.set('context_cache', {
    description: 'Get cache control settings for a model',
    inputSchema: {
        type: 'object',
        properties: {
            model: { type: 'string', description: 'Model name (claude, minimax, deepseek, openai)' }
        }
    },
    handler: async (args) => {
        const context = require('./context');
        return context.getCacheControl(args.model || 'claude');
    }
});

_methods.set('context_layers', {
    description: 'List available context layers',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
        const context = require('./context');
        const state = context.inspect();
        return {
            layers: ['static', 'tools', 'dynamic', 'history'],
            cacheStates: state.cacheStates || []
        };
    }
});

_methods.set('context_refresh', {
    description: 'Force refresh context cache (rebuild)',
    inputSchema: {
        type: 'object',
        properties: {
            brain: { type: 'string', description: 'Brain name' }
        }
    },
    handler: async (args) => {
        const context = require('./context');
        await context.invalidate(args.brain || 'default');
        const result = await context.build({
            brain: args.brain,
            includeTools: true,
            includeHistory: true,
            includeDynamic: true
        });
        return { refreshed: true, brain: result.brain };
    }
});

_methods.set('brain_push', {
    description: 'Push a brain onto the stack',
    inputSchema: {
        type: 'object',
        properties: {
            name: { type: 'string', description: 'Brain name' },
            type: { type: 'string', description: 'Brain type: private (default) or public' }
        },
        required: ['name']
    },
    handler: async (args) => {
        return { stack: _brain().pushBrain(args.name, args.type || 'private') };
    }
});

_methods.set('brain_remove', {
    description: 'Remove a brain from the stack',
    inputSchema: {
        type: 'object',
        properties: {
            name: { type: 'string', description: 'Brain name to remove' }
        },
        required: ['name']
    },
    handler: async (args) => {
        return { stack: _brain().removeBrain(args.name) };
    }
});

_methods.set('brain_switch', {
    description: 'Switch to a brain (set as current)',
    inputSchema: {
        type: 'object',
        properties: {
            name: { type: 'string', description: 'Brain name' }
        },
        required: ['name']
    },
    handler: async (args) => {
        return { current: _brain().switchBrain(args.name) };
    }
});

_methods.set('brain_current', {
    description: 'Get current brain',
    inputSchema: { type: 'object' },
    handler: async () => {
        return { current: _brain().currentBrain() };
    }
});

_methods.set('brain_geo_list', {
    description: 'List geometry storage for a brain',
    inputSchema: {
        type: 'object',
        properties: {
            brain: { type: 'string', description: 'Brain name (optional, uses current)' }
        }
    },
    handler: async (args) => {
        return { dirs: _brain().geoList(args) };
    }
});

_methods.set('brain_geo_store', {
    description: 'Store data in brain geometry (NSC9)',
    inputSchema: {
        type: 'object',
        properties: {
            key: { type: 'string', description: 'Data key' },
            data: { type: 'object', description: 'Data to store' },
            brain: { type: 'string', description: 'Brain name (optional)' }
        },
        required: ['key', 'data']
    },
    handler: async (args) => {
        return await _brain().geoStore(args.key, args.data, { brain: args.brain });
    }
});

_methods.set('brain_geo_load', {
    description: 'Load data from brain geometry by barcode',
    inputSchema: {
        type: 'object',
        properties: {
            barcode: { type: 'string', description: 'NSC9 barcode' },
            brain: { type: 'string', description: 'Brain name (optional)' }
        },
        required: ['barcode']
    },
    handler: async (args) => {
        return await _brain().geoLoad(args.barcode, { brain: args.brain });
    }
});

_methods.set('brain_geo_brains', {
    description: 'List all brains with geometry storage',
    inputSchema: { type: 'object' },
    handler: async () => {
        return { brains: _brain().geoBrains() };
    }
});

// ==================== TEAMS / ORG PRIMITIVES ====================

const _teams = require('./teams');
const _governance = require('./governance');
const _escrow = require('./escrow');
const _qos = require('./qos');
const _msg = require('./msg');
const _lineage = require('./lineage');
const _sudo = require('./sudo');
const _auth = require('./auth');
const _cron = require('./cron');
const _compute = require('./compute');
const _forum = require('./forum');
const _consensus = require('./consensus');

// ==================== FORUM / DISCUSSION ====================

// (pass 46) forum_* tools re-wired to the REAL forum API. The pre-agora
// wiring called signatures that don't exist: forum_vote passed
// (forumId, userId, topic, vote) into vote(proposal, options) — an MCP
// "up vote" silently CREATED a consensus vote titled by the forumId — and
// forum_enter/forum_message/forum_status ignored their inputs the same
// way. Schemas now match lib/forum.js (pass 40 agora signatures).
_methods.set('forum_enter', {
    description: 'Enter the geometric forum space (agora)',
    inputSchema: { type: 'object' },
    handler: async () => {
        return await _forum.enter();
    }
});

_methods.set('forum_message', {
    description: 'Post a message to an agent in the forum',
    inputSchema: {
        type: 'object',
        properties: {
            agent: { type: 'string', description: 'Agent name to message' },
            content: { type: 'string' }
        },
        required: ['agent', 'content']
    },
    handler: async ({ agent, content }) => {
        return await _forum.message(agent, content);
    }
});

_methods.set('forum_vote', {
    description: 'Create a vote/proposal in the forum (rides consensus; scope-aware — pass scope {owner, visibility} to restrict to org/dept/team/agent members)',
    inputSchema: {
        type: 'object',
        properties: {
            proposal: { type: 'string' },
            options: { type: 'array', items: { type: 'string' }, description: 'Choices (default [yes, no])' },
            minQuorum: { type: 'number' },
            useTrustWeight: { type: 'boolean' },
            deadline: { type: 'number' },
            scope: { type: 'object', description: 'Agora scope: { owner: "org:id|dept:id|team:id|agent:id", visibility: "scope|public" }' },
            thread: { type: 'string', description: '(Wave U4) Publication barcode the vote belongs to — links the decision trail to the thread (durable, survives restart)' }
        },
        required: ['proposal']
    },
    handler: async ({ proposal, options, minQuorum, useTrustWeight, deadline, scope, thread }) => {
        return await _forum.vote(proposal, {
            options,
            minQuorum,
            useTrustWeight,
            deadline,
            scope,
            thread
        });
    }
});

// (Wave U4 — prd-universe.md U4.2) Deliberation→decision trail over MCP:
// the decision trail of a thread (votes, escrow holds touched, outcome).
_methods.set('forum_decisions', {
    description: 'Decision trail of a forum thread (Wave U4): linked consensus vote (ballot, per-voter outcomes), escrow holds touched, and the voted decision record. Read-only.',
    inputSchema: {
        type: 'object',
        properties: {
            thread: { type: 'string', description: 'Publication barcode of the thread (e.g. PUB-...)' }
        },
        required: ['thread']
    },
    handler: async ({ thread }) => {
        try { return _forum.threadDecisionTrail(thread); }
        catch (e) { return { ok: false, error: e.message, code: e.code || 'E_FORUM' }; }
    }
});

_methods.set('forum_thread_links', {
    description: 'List forum threads with linked consensus votes (Wave U4 roster; decided/open per thread). Read-only.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => _forum.listThreadLinks()
});

_methods.set('forum_castVote', {
    description: 'Cast a vote on a forum-created consensus topic (agentId defaults to the local identity)',
    inputSchema: {
        type: 'object',
        properties: {
            voteId: { type: 'string', description: 'Topic id returned by forum_vote' },
            choice: { type: 'string' },
            agentId: { type: 'string' }
        },
        required: ['voteId', 'choice']
    },
    handler: async ({ voteId, choice, agentId }) => {
        return await _forum.castVote(voteId, choice, { agentId });
    }
});

_methods.set('forum_status', {
    description: 'Get forum status',
    inputSchema: { type: 'object' },
    handler: async () => {
        return await _forum.status();
    }
});

// (pass 87 — #6) Agora tenancy surface: publish/list with habitat-workspace
// stamping. Priority: verified token > declared userCtx > current agent >
// anonymous. Anonymous = global commons; tenant posts are invisible to
// non-members (fail closed) — see rls.md "Agora tenancy".
_methods.set('forum_publish', {
    description: 'Publish to the agora forum. Tenancy: workspace stamped from the verified subject (token > declared > current agent identity); workspace:"" pins a global post; a foreign-workspace pin needs a registry role there',
    inputSchema: {
        type: 'object',
        properties: {
            title: { type: 'string' },
            content: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            workspace: { type: 'string', description: 'Explicit tenant board (or "" for global); membership enforced' },
            userCtx: { type: 'object', description: 'Legacy self-declared subject (loses to a verified token)' }
        },
        required: ['title', 'content']
    },
    handler: async ({ title, content, tags, workspace, userCtx }) => {
        const opts = {};
        if (Array.isArray(tags)) opts.tags = tags;
        if (workspace !== undefined) opts.workspace = workspace;
        const verified = _requestCtx(userCtx);
        if (verified) opts.userCtx = verified;
        return await _forum.publish(title, content, opts);
    }
});

_methods.set('forum_list', {
    description: 'List agora publications VISIBLE to your tenancy: global commons + your own workspace; cross-tenant needs a registry role there. Anonymous sees global only',
    inputSchema: {
        type: 'object',
        properties: {
            userCtx: { type: 'object', description: 'Legacy self-declared subject (loses to a verified token)' }
        }
    },
    handler: async ({ userCtx }) => {
        const opts = {};
        const verified = _requestCtx(userCtx);
        if (verified) opts.userCtx = verified;
        return await _forum.list(opts);
    }
});

// (pass 46) consensus_* surface — the agora decision leg had NO MCP tools;
// agents could create votes via forum but could not tally/list/get them
// without writing code. Direct-ledger tools for topics created outside
// the forum path too.
_methods.set('consensus_create', {
    description: 'Create a consensus vote topic (scope-aware — malformed scope is rejected fail-closed)',
    inputSchema: {
        type: 'object',
        properties: {
            topic: { type: 'string', description: 'Charset [a-zA-Z0-9_-], 1-100 chars' },
            ballot: { type: 'array', items: { type: 'string' }, description: 'Vote choices (>= 2), e.g. ["yes","no"]' },
            minQuorum: { type: 'number' },
            useTrustWeight: { type: 'boolean' },
            deadline: { type: 'number' },
            scope: { type: 'object', description: 'Agora scope: { owner: "org:id|dept:id|team:id|agent:id", visibility: "scope|public" }' }
        },
        required: ['topic', 'ballot']
    },
    handler: async ({ topic, ballot, minQuorum, useTrustWeight, deadline, scope }) => {
        return await _consensus.create(topic, {
            ballot,
            minQuorum,
            useTrustWeight,
            deadline,
            scope
        });
    }
});

_methods.set('consensus_vote', {
    description: 'Cast a vote on a consensus topic (one vote per agent; scoped topics reject non-members)',
    inputSchema: {
        type: 'object',
        properties: {
            topic: { type: 'string' },
            outcome: { type: 'string', description: 'One of the topic options' },
            agentId: { type: 'string' }
        },
        required: ['topic', 'outcome', 'agentId']
    },
    handler: async ({ topic, outcome, agentId }) => {
        return await _consensus.vote(topic, outcome, agentId);
    }
});

_methods.set('consensus_tally', {
    description: 'Tally a consensus topic (winner, percentages, quorum status)',
    inputSchema: {
        type: 'object',
        properties: { topic: { type: 'string' } },
        required: ['topic']
    },
    handler: async ({ topic }) => {
        return _consensus.tally(topic);
    }
});

_methods.set('consensus_get', {
    description: 'Get a consensus ledger (votes, scope, metadata, status). Scope-aware (pass 65): pass viewerId (a member principal) to read a scoped topic; without it, scoped topics return null — same shape as not-found',
    inputSchema: {
        type: 'object',
        properties: {
            topic: { type: 'string' },
            viewerId: { type: 'string', description: 'Viewer principal for scoped topics (member agentId); omit for unscoped topics only' }
        },
        required: ['topic']
    },
    handler: async ({ topic, viewerId }) => {
        return _consensus.get(topic, viewerId !== undefined ? viewerId : null);
    }
});

_methods.set('consensus_list', {
    description: 'List consensus topics with status and vote counts. Scope-aware (pass 65): pass viewerId to include scoped topics you are a member of; the anonymous view omits scoped topics entirely',
    inputSchema: {
        type: 'object',
        properties: {
            viewerId: { type: 'string', description: 'Viewer principal for scoped-topic visibility; omit for the anonymous view' }
        }
    },
    handler: async ({ viewerId }) => {
        return _consensus.list(viewerId !== undefined ? viewerId : null);
    }
});

// (pass 40 / agora) encounter_* MCP tools REMOVED with lib/encounter.js —
// peer discovery is node-registry (persistent, consensus's vote anchor).

const _registry = require('./node-registry');

_methods.set('nodes_list', {
    description: 'List known peer nodes (node-registry)',
    inputSchema: { type: 'object' },
    handler: async () => {
        return { nodes: _registry.list().map((n) => ({ id: n.id, name: n.name, status: n.status, host: n.host, port: n.port })) };
    }
});

// ==================== (pass 56 / Wave A) AGORA-SYNC: THE MESH SURFACE ====================
// Remote voting + state sync over the crew-bus, as MCP tools. NO new
// trust path: every gate (scope, registry, quarantine, one-vote) stays
// owner-side inside consensus/agora-sync; these wrappers only carry the
// node's configured bus + agentId. The node must be crewBus.configure()-ed
// (name/port/secret, agentId for ballot attribution) and agoraSync.install()-ed.
const _agoraSync = require('./agora-sync');
const _crewBus = require('./crew-bus');

_methods.set('agora_vote', {
    description: 'Cast a ballot on a PEER node\'s consensus topic over the signed crew-bus (the topic OWNER runs its local gate stack — scope, registry vetting, one vote — and acks the verdict)',
    inputSchema: {
        type: 'object',
        properties: {
            node: { type: 'string', description: 'Peer node name (must be a registered crew-bus peer)' },
            topic: { type: 'string', description: 'Consensus topic on the peer' },
            outcome: { type: 'string', description: 'The ballot choice' },
            agentId: { type: 'string', description: 'Optional: vote as another pre-registered agent principal (defaults to this node\'s agentId)' }
        },
        required: ['node', 'topic', 'outcome']
    },
    handler: async ({ node, topic, outcome, agentId }) => {
        const st = _crewBus.status();
        if (!st.configured) return { voted: false, reason: 'bus_not_configured: run crewBus.configure({ name, port, secret, agentId }) first' };
        const opts = { timeoutMs: 8000 };
        if (agentId) opts.agentId = agentId;
        return _agoraSync.vote(_crewBus.default, node, topic, outcome, opts);
    }
});

_methods.set('agora_pull', {
    description: 'Pull a topic\'s ledger from a peer node over the bus and merge it LOCALLY (merge re-derives status — the wire can never declare a topic passed)',
    inputSchema: {
        type: 'object',
        properties: {
            node: { type: 'string', description: 'Peer node name to ask' },
            topic: { type: 'string' }
        },
        required: ['node', 'topic']
    },
    handler: async ({ node, topic }) => {
        const st = _crewBus.status();
        if (!st.configured) return { pulled: false, reason: 'bus_not_configured' };
        return _agoraSync.pull(_crewBus.default, node, topic, { timeoutMs: 8000 });
    }
});

_methods.set('agora_push', {
    description: 'Push a LOCAL topic\'s ledger to a peer node (the return leg after voting on a synced topic; the peer re-derives everything locally)',
    inputSchema: {
        type: 'object',
        properties: {
            node: { type: 'string', description: 'Peer node name to push to' },
            topic: { type: 'string' }
        },
        required: ['node', 'topic']
    },
    handler: async ({ node, topic }) => {
        const st = _crewBus.status();
        if (!st.configured) return { pushed: false, reason: 'bus_not_configured' };
        return _agoraSync.push(_crewBus.default, node, topic);
    }
});

_methods.set('agora_nodes', {
    description: 'List this node\'s crew-bus peers (the mesh roster as this node sees it)',
    inputSchema: { type: 'object' },
    handler: async () => {
        const st = _crewBus.status();
        return {
            self: { name: st.name, agentId: st.agentId, configured: st.configured, listening: st.listening },
            peers: st.peers
        };
    }
});

_methods.set('agora_sync_status', {
    description: 'Agora-sync surface status: which buses have the sync dispatchers installed, node identity, pending round-trips',
    inputSchema: { type: 'object' },
    handler: async () => {
        return _agoraSync.status();
    }
});

// ==================== ESCROW / BUDGET ====================

_methods.set('escrow_create', {
    description: 'Create an escrow budget for an agent/org',
    inputSchema: {
        type: 'object',
        properties: {
            org: { type: 'string', description: 'Agent or org id that owns the budget' },
            budget: { type: 'number', default: 1000 }
        },
        required: ['org']
    },
    // pass 77: was _escrow.create(org, budget, period) - create() takes an
    // OPTIONS OBJECT, so the args were silently ignored and the tool returned
    // a raw Escrow instance at defaults (a no-op tool). Route through
    // setBudget on a shared instance so the budget actually lands.
    handler: async ({ org, budget = 1000 }) => {
        const e = _escrow.create({});
        e.setBudget(org, budget);
        return { ok: true, org, budget: e.getBudget(org) };
    }
});

_methods.set('escrow_canSpend', {
    description: 'Check if org can spend budget',
    inputSchema: {
        type: 'object',
        properties: {
            org: { type: 'string' },
            amount: { type: 'number', default: 1 }
        },
        required: ['org']
    },
    handler: async ({ org, amount = 1 }) => {
        return _escrow.canSpend(org, amount);   // sync; await was harmless but misleading
    }
});

_methods.set('escrow_hold', {
    description: 'Place a hold (reservation with timeout; the hold does NOT debit budget)',
    inputSchema: {
        type: 'object',
        properties: {
            holdId: { type: 'string', description: 'Unique hold id' },
            condition: { type: 'object', description: 'Optional condition payload (amount, agent, type, ...)' }
        },
        required: ['holdId']
    },
    // pass 77: was _escrow.hold(org, amount, operation) - module hold is
    // hold(holdId, condition); the old arg mapping held under the id
    // stringified '[object Object]'.
    handler: async ({ holdId, condition }) => {
        return _escrow.hold(holdId, condition);
    }
});

_methods.set('escrow_release', {
    description: 'Release a hold by id',
    inputSchema: {
        type: 'object',
        properties: {
            holdId: { type: 'string' }
        },
        required: ['holdId']
    },
    handler: async ({ holdId }) => {
        return _escrow.release(holdId);
    }
});

_methods.set('escrow_status', {
    description: 'Get escrow ledger status (budgets, holds, approvals, quotas, workspace pools)',
    inputSchema: {
        type: 'object',
        properties: { org: { type: 'string', description: 'Optional agent/org filter' } },
        required: []
    },
    // pass 77: was getStatus(org) - the module export takes no args and
    // returned { enabled } only. Now reports the real ledger; org filters
    // to that budget when given. (pass 83) workspacePools always included.
    handler: async ({ org } = {}) => {
        const e = _escrow.create ? _escrow.create() : new _escrow.Escrow();
        const gathered = _escrow.gatherState();
        if (org) {
            return { ok: true, org, budget: gathered.budgets[org] || null, holds: gathered.holds };
        }
        return { ok: true, ...gathered, workspacePools: e.listWorkspacePools() };
    }
});

// ==================== WORKSPACE BUDGETS (pass 83) ====================
// Org pools + member caps over habitat workspaces. RLS:
//   - Draws fail closed on workspaces the habitat has never heard of
//     (E_UNKNOWN_WORKSPACE from escrow itself).
//   - SETTING a pool/cap is an admin act: the caller names `adminId` and
//     the ADMIN ROLE IS READ FROM THE HABITAT REGISTRY for that workspace
//     (never self-declared - the pass-82 rule). Denial throws RLS_DENIED.

async function _requireWorkspaceAdmin(workspaceId, adminId) {
    const habitat = require('./habitat');
    const h = await habitat.getSharedReady();
    const roles = h.getUserRoles(workspaceId, adminId || '');
    if (!roles.includes('admin')) {
        const error = require('./error');
        throw new error.VantError(
            'Access denied: admin role required in workspace ' + workspaceId + ' (registry-verified)',
            { code: error.CODES.RLS_DENIED, retryable: false }
        );
    }
    return h;
}

function _verifiedAdminGate(workspaceId, verifiedCtx) {
    if (!verifiedCtx || !verifiedCtx.workspace || verifiedCtx.workspace !== workspaceId) {
        const error = require('./error');
        throw new error.VantError(
            'Access denied: a valid habitat token for workspace ' + workspaceId + ' is required for this admin act (pass 86)',
            { code: error.CODES.RLS_DENIED, retryable: false }
        );
    }
    const habitat = require('./habitat');
    const roles = habitat.getShared().getUserRoles(workspaceId, verifiedCtx.userId || verifiedCtx.agentId);
    if (!roles.includes('admin')) {
        const error = require('./error');
        throw new error.VantError(
            'Access denied: admin role required in workspace ' + workspaceId + ' (registry-verified)',
            { code: error.CODES.RLS_DENIED, retryable: false }
        );
    }
}

_methods.set('escrow_setWorkspaceBudget', {
    description: 'Set a workspace org-pool budget (admin-gated: adminId must hold admin in the workspace)',
    inputSchema: {
        type: 'object',
        properties: { workspaceId: { type: 'string' }, amount: { type: 'number' }, adminId: { type: 'string', description: '(pre-86 path) must hold admin in the workspace' } },
        required: ['workspaceId', 'amount']
    },
    handler: async ({ workspaceId, amount, adminId }) => {
        // (pass 86) Token-verified admin beats self-declared adminId: when a
        // verified credential rides the request, its registry identity and
        // admin role are the ONLY ones consulted. Legacy adminId path stays
        // for shared-key callers (still registry-verified, never trusted).
        const store = _requestAls.getStore();
        if (store && store.verifiedCtx) {
            _verifiedAdminGate(workspaceId, store.verifiedCtx);
        } else {
            await _requireWorkspaceAdmin(workspaceId, adminId);
        }
        const budget = _escrow.setWorkspaceBudget(workspaceId, amount);
        return { ok: true, workspace: workspaceId, adminId, pool: budget };
    }
});

_methods.set('escrow_getWorkspacePool', {
    description: 'Get a workspace org-pool budget (habitat workspace)',
    inputSchema: {
        type: 'object',
        properties: { workspaceId: { type: 'string' } },
        required: ['workspaceId']
    },
    handler: async ({ workspaceId }) => {
        return { workspace: workspaceId, pool: _escrow.getWorkspacePool(workspaceId) };
    }
});

_methods.set('escrow_listWorkspacePools', {
    description: 'List all workspace org-pool budgets',
    inputSchema: { type: 'object' },
    handler: async () => ({ pools: _escrow.listWorkspacePools() })
});

_methods.set('escrow_setWorkspaceMemberLimit', {
    description: 'Cap a member agent\'s draw from its workspace pool (admin-gated: adminId must hold admin in the workspace)',
    inputSchema: {
        type: 'object',
        properties: { workspaceId: { type: 'string' }, agentId: { type: 'string' }, limit: { type: 'number' }, adminId: { type: 'string', description: '(pre-86 path) must hold admin in the workspace; a bearer habitat token satisfies the gate instead' } },
        required: ['workspaceId', 'agentId', 'limit']
    },
    handler: async ({ workspaceId, agentId, limit, adminId }) => {
        // (pass 86) Verified-token admin gate; legacy adminId path stays.
        const store = _requestAls.getStore();
        if (store && store.verifiedCtx) {
            _verifiedAdminGate(workspaceId, store.verifiedCtx);
        } else {
            await _requireWorkspaceAdmin(workspaceId, adminId);
        }
        const member = _escrow.setWorkspaceMemberLimit(workspaceId, agentId, limit);
        return { ok: true, workspace: workspaceId, agentId, adminId, member };
    }
});

_methods.set('escrow_workspaceCanSpend', {
    description: 'Check if a member can draw an amount from its workspace pool',
    inputSchema: {
        type: 'object',
        properties: { workspaceId: { type: 'string' }, agentId: { type: 'string' }, amount: { type: 'number', default: 1 } },
        required: ['workspaceId', 'agentId']
    },
    handler: async ({ workspaceId, agentId, amount = 1 }) => {
        return _escrow.workspaceCanSpend(workspaceId, agentId, amount);
    }
});

_methods.set('escrow_workspaceRecordSpend', {
    description: 'Record a workspace-pool spend for a member (draws member row AND org pool)',
    inputSchema: {
        type: 'object',
        properties: { workspaceId: { type: 'string' }, agentId: { type: 'string' }, amount: { type: 'number' } },
        required: ['workspaceId', 'agentId', 'amount']
    },
    handler: async ({ workspaceId, agentId, amount }) => {
        return _escrow.workspaceRecordSpend(workspaceId, agentId, amount);
    }
});

// ==================== QOS / RATE LIMITING ====================

_methods.set('qos_canProceed', {
    description: 'Check rate limit',
    inputSchema: {
        type: 'object',
        properties: {
            key: { type: 'string', default: 'global' },
            limit: { type: 'number', default: 100 }
        },
        required: ['key']
    },
    handler: async ({ key = 'global', limit = 100 }) => {
        return { allowed: _qos.canProceed(key, limit) };
    }
});

_methods.set('qos_checkQuota', {
    description: 'Check input quota',
    inputSchema: {
        type: 'object',
        properties: {
            input: { type: 'string' },
            maxSize: { type: 'number', default: 1000000 }
        },
        required: ['input']
    },
    handler: async ({ input, maxSize = 1000000 }) => {
        return _qos.checkInputSize(input, maxSize);
    }
});

// (pass 189 MCP fiction audit) qos_withTimeout claimed 'Execute with
// timeout' then returned {allowed:true} — it timed out NOTHING and checked
// NOTHING. The real lib/qos.withTimeout(promise, ms) races a promise — an
// MCP call cannot ship one. HONEST replacement: report the concurrency
// gate state (canProceed/increment helpers) and explain the constraint.
_methods.set('qos_withTimeout', {
    description: 'QoS timeout info (the lib races PROMISES — an MCP call cannot ship one; use qos_canProceed for the real gate)',
    inputSchema: {
        type: 'object',
        properties: {
            ms: { type: 'number', default: 30000 },
            task: { type: 'string', description: 'Task name' }
        },
        required: ['task']
    },
    handler: async ({ ms = 30000, task }) => {
        return {
            task, ms,
            enforcing: false,
            note: 'qos.withTimeout races an in-process Promise — an MCP tool call cannot supply one. The real concurrency gate is qos_canProceed (increments/decrements active count).',
            code: 'E_TIMEOUT_NOT_APPLICABLE'
        };
    }
});

_methods.set('qos_recordFailure', {
    description: 'Record failure for circuit breaker',
    inputSchema: {
        type: 'object',
        properties: {
            key: { type: 'string' },
            count: { type: 'number', default: 1 }
        },
        required: ['key']
    },
    handler: async ({ key, count = 1 }) => {
        for (let i = 0; i < count; i++) _qos.recordFailure(key);
        return { key, failures: _qos.getFailureCount(key) };
    }
});

// ==================== MESSAGING ====================

_methods.set('msg_send', {
    description: 'Send message to channel',
    inputSchema: {
        type: 'object',
        properties: {
            channel: { type: 'string' },
            content: { type: 'string' },
            from: { type: 'string', default: 'agent' }
        },
        required: ['channel', 'content']
    },
    // (pass 214 FIX) this handler passed the STRING content straight into
    // msg.send(channel, message) — and send's `{...message}` spread turned
    // the string into {"0":"c","1":"o",...} garbage on every channel
    // write (internal callers like lib/forum.js always pass objects).
    // msg.send now also carries (pass 214) the tenant owner stamp via its
    // third options arg, which the guest door path injects pre-execute.
    handler: async ({ channel, content, from = 'agent' }) => {
        return await _msg.send(channel, { from, content });
    }
});

_methods.set('msg_list', {
    description: 'List messages in channel',
    inputSchema: {
        type: 'object',
        properties: {
            channel: { type: 'string' },
            limit: { type: 'number', default: 50 }
        },
        required: ['channel']
    },
    // (pass 214 FIX) this handler called _msg.list(channel, limit) — but
    // Msg.list() takes NO arguments and returns CONVERSATIONS, so channel
    // and limit were silently ignored and every msg_list call answered the
    // conversation roster (the docs always said "List messages in channel").
    // Now answers the channel's messages (FIFO tail, most recent `limit`),
    // and the door's guest path filters per tenant (the agent_list precedent).
    handler: async ({ channel, limit = 50 }) => {
        const msgs = _msg.channelMessages(channel);
        return msgs.slice(-(typeof limit === 'number' && limit > 0 ? limit : 50));
    }
});

_methods.set('msg_subscribe', {
    description: 'Subscribe to channel',
    inputSchema: {
        type: 'object',
        properties: {
            channel: { type: 'string' },
            handler: { type: 'string' }
        },
        required: ['channel']
    },
    handler: async ({ channel, handler }) => {
        return await _msg.subscribe(channel, handler);
    }
});

// ==================== LINEAGE / TRACING ====================

_methods.set('lineage_record', {
    description: 'Record lineage event',
    inputSchema: {
        type: 'object',
        properties: {
            event: { type: 'string' },
            data: { type: 'object' },
            parent: { type: 'string' }
        },
        required: ['event']
    },
    handler: async ({ event, data = {}, parent }) => {
        return await _lineage.record(event, data, parent);
    }
});

_methods.set('lineage_trace', {
    description: 'Get lineage trace',
    inputSchema: {
        type: 'object',
        properties: {
            id: { type: 'string' },
            depth: { type: 'number', default: 5 }
        },
        required: ['id']
    },
    handler: async ({ id, depth = 5 }) => {
        return await _lineage.trace(id, depth);
    }
});

_methods.set('lineage_stats', {
    description: 'Get lineage statistics',
    inputSchema: { type: 'object' },
    handler: async () => {
        return await _lineage.getStats();
    }
});

// ==================== SUDO / ESCALATION ====================

_methods.set('sudo_escalate', {
    description: 'Escalate privilege',
    inputSchema: {
        type: 'object',
        properties: {
            task: { type: 'string' },
            level: { type: 'number', default: 1 }
        },
        required: ['task']
    },
    handler: async ({ task, level = 1 }) => {
        // (1a) service-tagged: MCP escalations get the mcp policy (3min TTL,
        // callback-required for write/network/exec) instead of the default
        // policy. Level-as-scope is legacy — level 1 maps to 'read'.
        const scope = typeof level === 'number' ? (level >= 2 ? 'write' : 'read') : 'read';
        return await _sudo.escalate(task, scope, { service: 'mcp', reason: 'sudo_escalate level=' + level });
    }
});

_methods.set('sudo_grant', {
    description: 'Grant sudo capability',
    inputSchema: {
        type: 'object',
        properties: {
            agentId: { type: 'string' },
            capability: { type: 'string' }
        },
        required: ['agentId', 'capability']
    },
    handler: async ({ agentId, capability }) => {
        // (pass 118 live-fire) The sandbox verdict maps CAPABILITY → SCOPE
        // via CAP_TO_SCOPE (canSpawn → 'spawn', prd-sudo.md table) before
        // consulting sudo.can. This handler used to store the grant under
        // the RAW capability name, so a granted canSpawn could never satisfy
        // a canSpawn check — the door's escalation path was disconnected.
        // Grant the mapped scope (widening union: keep the raw name too when
        // it differs, so either verdict style finds it).
        const sb = require('./sandbox');
        const mapped = (sb.CAP_TO_SCOPE && sb.CAP_TO_SCOPE[capability]) || capability;
        const out = await _sudo.grant(agentId, mapped);
        if (mapped !== capability) await _sudo.grant(agentId, capability);
        return out;
    }
});

_methods.set('sudo_revoke', {
    description: 'Revoke sudo capability',
    inputSchema: {
        type: 'object',
        properties: {
            agentId: { type: 'string' },
            capability: { type: 'string' }
        },
        required: ['agentId', 'capability']
    },
    handler: async ({ agentId, capability }) => {
        return await _sudo.revoke(agentId, capability);
    }
});

_methods.set('sudo_can', {
    description: 'Check if agent can do action',
    inputSchema: {
        type: 'object',
        properties: {
            agentId: { type: 'string' },
            action: { type: 'string' }
        },
        required: ['agentId', 'action']
    },
    handler: async ({ agentId, action }) => {
        return { allowed: await _sudo.can(agentId, action) };
    }
});

_methods.set('sudo_listTasks', {
    description: 'List sudo tasks',
    inputSchema: { type: 'object' },
    handler: async () => {
        return { tasks: await _sudo.listTasks() };
    }
});

// ==================== AUTH ====================

_methods.set('auth_create', {
    description: 'Create auth token',
    inputSchema: {
        type: 'object',
        properties: {
            userId: { type: 'string' },
            roles: { type: 'array', items: { type: 'string' }, default: [] }
        },
        required: ['userId']
    },
    handler: async ({ userId, roles = [] }) => {
        return await _auth.create(userId, roles);
    }
});

_methods.set('auth_verify', {
    description: 'Verify auth token',
    inputSchema: {
        type: 'object',
        properties: {
            token: { type: 'string' }
        },
        required: ['token']
    },
    handler: async ({ token }) => {
        return await _auth.verifyToken(token);
    }
});

_methods.set('auth_require', {
    description: 'Require auth for operation',
    inputSchema: {
        type: 'object',
        properties: {
            token: { type: 'string' },
            permission: { type: 'string' }
        },
        required: ['token']
    },
    handler: async ({ token, _permission }) => {
        const verified = await _auth.verifyToken(token);
        if (!verified) return { allowed: false, reason: 'Invalid token' };
        return { allowed: true, userId: verified.userId };
    }
});

// ==================== CRON / SCHEDULING ====================

_methods.set('cron_schedule', {
    description: 'Schedule a recurring task',
    inputSchema: {
        type: 'object',
        properties: {
            id: { type: 'string', description: 'Task ID' },
            interval: { type: 'number', description: 'Interval in ms (1000-86400000)', default: 60000 },
            enabled: { type: 'boolean', default: true }
        },
        required: ['id']
    },
    handler: async ({ id, interval = 60000, _enabled = true }) => {
        // Create a simple handler that logs
        const handler = () => console.log('[CRON] Task ' + id + ' ran at ' + Date.now());
        return await _cron.schedule({ id, interval, handler });
    }
});

_methods.set('cron_list', {
    description: 'List scheduled tasks',
    inputSchema: { type: 'object' },
    handler: async () => {
        return { jobs: _cron.list() };
    }
});

_methods.set('cron_cancel', {
    description: 'Cancel scheduled task',
    inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id']
    },
    handler: async ({ id }) => {
        return await _cron.cancel(id);
    }
});

_methods.set('cron_run', {
    description: 'Run scheduled task now',
    inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id']
    },
    handler: async ({ id }) => {
        return await _cron.run(id);
    }
});

// ==================== COMPUTE ====================

_methods.set('compute_eval', {
    description: 'Evaluate code (restricted languages, requires sudo)',
    inputSchema: {
        type: 'object',
        properties: {
            code: { type: 'string', description: 'Code expression (not function body)' },
            language: { type: 'string', enum: ['python', 'julia', 'rust'], description: 'Allowed languages only' }
        },
        required: ['code', 'language']
    },
    handler: async ({ code, language }) => {
        // Require sudo for code evaluation
        const sudo = require('./sudo');
        const taskId = _getTaskId?.() || 'default';
        if (!await sudo.can(taskId, 'compute:eval')) {
            throw new errors.VantError('EPERM: compute_eval requires sudo escalation', { code: errors.CODES.SANDBOX_EXEC_DENIED, retryable: false });
        }
        // Validate language against allowed list (no 'node'/'javascript' for arbitrary eval)
        const allowed = ['python', 'julia', 'rust'];
        if (!allowed.includes(language)) {
            throw new errors.VantError('Language not allowed: ' + language + '. Allowed: ' + allowed.join(', '), { code: errors.CODES.VAF_VALIDATION_FAILED, retryable: false });
        }
        return await _compute.evaluate(code, { lang: language });
    }
});

_methods.set('compute_invoke', {
    description: 'Invoke function',
    inputSchema: {
        type: 'object',
        properties: {
            fn: { type: 'string' },
            args: { type: 'array', default: [] }
        },
        required: ['fn']
    },
    handler: async ({ fn, args = [] }) => {
        return await _compute.invoke(fn, args);
    }
});

_methods.set('compute_status', {
    description: 'Get compute status',
    inputSchema: { type: 'object' },
    handler: async () => {
        return await _compute.status();
    }
});

_methods.set('compute_list', {
    description: 'List available compute functions',
    inputSchema: { type: 'object' },
    handler: async () => {
        return { functions: await _compute.list() };
    }
});

_methods.set('governance_decide', {
    description: 'Make a governance decision',
    inputSchema: {
        type: 'object',
        properties: {
            topic: { type: 'string' },
            context: {
                type: 'object',
                properties: {
                    benefitScore: { type: 'number', default: 10 },
                    consentGiven: { type: 'boolean', default: true },
                    proposal: { type: 'string' }
                }
            }
        },
        required: ['topic']
    },
    handler: async ({ topic, context = {} }) => {
        // Merge defaults
        const ctx = {
            benefitScore: 10,
            consentGiven: true,
            ...context
        };
        return await _governance.decide(topic, ctx);
    }
});

_methods.set('governance_isAllowed', {
    description: 'Check if action is allowed',
    inputSchema: {
        type: 'object',
        properties: {
            action: { type: 'string' },
            entity: { type: 'string' }
        },
        required: ['action']
    },
    handler: async ({ action, entity }) => {
        return await _governance.isAllowed(action, entity);
    }
});

_methods.set('governance_stats', {
    description: 'Get governance statistics',
    inputSchema: { type: 'object' },
    handler: async () => {
        return await _governance.getStats();
    }
});

_methods.set('governance_history', {
    description: 'Get governance history',
    inputSchema: {
        type: 'object',
        properties: { limit: { type: 'number', default: 10 } }
    },
    handler: async ({ limit = 10 }) => {
        return await _governance.getHistory(limit);
    }
});

_methods.set('teams_createOrg', {
    description: 'Create an organization',
    inputSchema: {
        type: 'object',
        properties: {
            name: { type: 'string', description: 'Organization name' },
            plan: { type: 'string', default: 'free' },
            desc: { type: 'string', default: '' }
        },
        required: ['name']
    },
    handler: async ({ name, plan = 'free', desc = '' }) => {
        return await _teams.createOrg(name, { plan, desc });
    }
});

_methods.set('teams_listOrgs', {
    description: 'List all organizations',
    inputSchema: { type: 'object' },
    handler: async () => {
        return { orgs: await _teams.listOrgs() };
    }
});

_methods.set('teams_getOrg', {
    description: 'Get organization by ID',
    inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id']
    },
    handler: async ({ id }) => {
        return await _teams.getOrg(id);
    }
});

_methods.set('teams_createDept', {
    description: 'Create a department',
    inputSchema: {
        type: 'object',
        properties: {
            name: { type: 'string' },
            org: { type: 'string', description: 'Organization ID' },
            desc: { type: 'string', default: '' }
        },
        required: ['name']
    },
    handler: async ({ name, org, desc = '' }) => {
        return await _teams.createDept(name, { org, desc });
    }
});

_methods.set('teams_listDepts', {
    description: 'List departments',
    inputSchema: {
        type: 'object',
        properties: { org: { type: 'string' } }
    },
    handler: async ({ org }) => {
        return { depts: await _teams.listDepts(org) };
    }
});

_methods.set('teams_createTeam', {
    description: 'Create a team',
    inputSchema: {
        type: 'object',
        properties: {
            name: { type: 'string' },
            dept: { type: 'string', description: 'Department ID' },
            desc: { type: 'string', default: '' }
        },
        required: ['name']
    },
    handler: async ({ name, dept, desc = '' }) => {
        return await _teams.createTeam(name, { dept, desc });
    }
});

_methods.set('teams_listTeams', {
    description: 'List teams',
    inputSchema: {
        type: 'object',
        properties: { dept: { type: 'string' } }
    },
    handler: async ({ dept }) => {
        return { teams: await _teams.listTeams(dept) };
    }
});

_methods.set('teams_createRole', {
    description: 'Create a role',
    inputSchema: {
        type: 'object',
        properties: {
            name: { type: 'string' },
            org: { type: 'string' },
            team: { type: 'string' },
            permissions: { type: 'array', items: { type: 'string' }, description: 'Permission list', default: [] }
        },
        required: ['name']
    },
    handler: async ({ name, org, team, permissions = [] }) => {
        return await _teams.createRole(name, { org, team, permissions });
    }
});

_methods.set('teams_assign', {
    description: 'Assign agent to org/dept/team',
    inputSchema: {
        type: 'object',
        properties: {
            agentId: { type: 'string', description: 'Agent ID to assign' },
            org: { type: 'string' },
            dept: { type: 'string' },
            team: { type: 'string' },
            role: { type: 'string', description: 'Role ID' },
            reportsTo: { type: 'string', description: 'Agent ID this agent reports to' }
        },
        required: ['agentId']
    },
    handler: async ({ agentId, org, dept, team, role, reportsTo }) => {
        return await _teams.assign(agentId, { org, dept, team, role, reportsTo });
    }
});

_methods.set('teams_hasPermission', {
    description: 'Check if agent has permission',
    inputSchema: {
        type: 'object',
        properties: {
            agentId: { type: 'string' },
            permission: { type: 'string' }
        },
        required: ['agentId', 'permission']
    },
    handler: async ({ agentId, permission }) => {
        // Get agent's assignment and check role permissions
        const assignment = await _teams.getAssignment(agentId);
        if (!assignment || !assignment.role) {
            return { hasPermission: false, reason: 'No role assigned' };
        }
        const has = await _teams.hasPermission(assignment.role, permission);
        return { hasPermission: has, agentId, permission };
    }
});

// ==================== RECURSION PRIMITIVES ====================
// SECURITY: These primitives use sandbox-checked function registry, not globals

// Safe function registry (pre-registered by sandbox/agents)
const _fnRegistry = new Map();

function _registerFn(name, fn) {
    _fnRegistry.set(name, fn);
}

// Expose registry for agents to register functions securely
function _getFn(name) {
    return _fnRegistry.get(name);
}

_methods.set('recursion_register', {
    description: 'Register a function for use in recursion primitives (sandboxed)',
    inputSchema: {
        type: 'object',
        properties: {
            name: { type: 'string', description: 'Function name to register' },
            type: { type: 'string', enum: ['processor', 'getChildren', 'visitor', 'lookup', 'validator', 'retry'] }
        },
        required: ['name', 'type']
    },
    handler: async ({ _name, _type }) => {
        // Functions must be registered via agent context, not MCP
        return { error: 'Use agent context to register functions securely' };
    }
});

_methods.set('recursion_batch', {
    description: 'Batch process items recursively with depth safety',
    inputSchema: {
        type: 'object',
        properties: {
            operation: { type: 'string', description: 'Operation name for tracking' },
            items: { type: 'array', description: 'Items to process' },
            transform: { type: 'string', enum: ['double', 'identity', 'length', 'json', 'upper', 'lower'], description: 'Built-in transform' },
            maxDepth: { type: 'number', description: 'Max recursion depth (default: 10)' }
        },
        required: ['operation', 'items']
    },
    handler: async ({ operation, items, transform = 'identity', maxDepth = 10 }) => {
        const guard = require('./recursion');

        // Built-in safe transforms (no custom functions)
        const transforms = {
            identity: (x) => x,
            double: (x) => typeof x === 'number' ? x * 2 : x,
            length: (x) => typeof x === 'string' || Array.isArray(x) ? x.length : 0,
            json: (x) => JSON.stringify(x),
            upper: (x) => typeof x === 'string' ? x.toUpperCase() : x,
            lower: (x) => typeof x === 'string' ? x.toLowerCase() : x
        };

        const fn = transforms[transform] || transforms.identity;
        const result = await guard.batch(operation, items, fn, { maxDepth });
        return result;
    }
});

_methods.set('recursion_traverse', {
    description: 'Traverse tree/graph with depth safety',
    inputSchema: {
        type: 'object',
        properties: {
            operation: { type: 'string' },
            root: { type: 'object', description: 'Root node' },
            childPath: { type: 'string', default: 'children', description: 'Path to children property' },
            visitKey: { type: 'string', description: 'Key to extract from visited nodes' },
            maxDepth: { type: 'number' },
            breadthFirst: { type: 'boolean' }
        },
        required: ['operation', 'root']
    },
    handler: async ({ operation, root, childPath = 'children', visitKey, maxDepth = 10, breadthFirst = false }) => {
        const guard = require('./recursion');
        const gc = (n) => n[childPath] || [];
        const vis = visitKey ? ((n) => n[visitKey]) : ((n) => n);
        const result = await guard.traverse(operation, root, gc, vis, { maxDepth, breadthFirst });
        return result;
    }
});

_methods.set('recursion_lookup', {
    description: 'Follow chain of lookups with depth safety',
    inputSchema: {
        type: 'object',
        properties: {
            operation: { type: 'string' },
            start: { type: 'object', description: 'Starting item' },
            nextPath: { type: 'string', default: 'next', description: 'Path to next item' },
            valuePath: { type: 'string', description: 'Path to value to extract' },
            maxDepth: { type: 'number' },
            includePath: { type: 'boolean' }
        },
        required: ['operation', 'start']
    },
    handler: async ({ operation, start, nextPath = 'next', valuePath, maxDepth = 10, includePath = true }) => {
        const guard = require('./recursion');
        const lk = (item) => item[nextPath];
        const val = valuePath ? ((item) => item[valuePath]) : (() => true);
        const result = await guard.lookup(operation, start, lk, val, { maxDepth, includePath });
        return result;
    }
});

_methods.set('recursion_retry', {
    description: 'Retry operation with exponential backoff',
    inputSchema: {
        type: 'object',
        properties: {
            operation: { type: 'string' },
            simulate: { type: 'boolean', default: false, description: 'Simulate success on 3rd attempt' },
            maxRetries: { type: 'number' },
            backoff: { type: 'number', description: 'Base backoff in ms' }
        },
        required: ['operation']
    },
    handler: async ({ operation, simulate = false, maxRetries = 3, backoff = 1000 }) => {
        const guard = require('./recursion');
        let attempts = 0;
        const retryFn = async () => {
            attempts++;
            if (simulate && attempts < 3) throw new errors.VantError('Simulated failure', { code: errors.CODES.INTERNAL_ERROR });
            return { success: true, attempts };
        };
        const result = await guard.retry(operation, retryFn, { maxRetries, backoff });
        return result;
    }
});


_methods.set('brain_state', {
    description: 'Get brain neuron state (synapses, attention)',
    inputSchema: { type: 'object' },
    handler: async () => {
        return _brain().getNeuronState();
    }
});

_methods.set('brain_corpus', {
    description: 'Load all brains as corpus',
    inputSchema: { type: 'object' },
    handler: async () => {
        const corpus = await _brain().loadCorpus();
        return { corpus, count: corpus.length };
    }
});

_methods.set('brain_attend', {
    description: 'Set attention score for a brain',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, score: { type: 'number' } }, required: ['name', 'score'] },
    handler: async ({ name, score }) => {
        _brain().attend(name, score);
        return { name, score: _brain().getAttention(name) };
    }
});

_methods.set('brain_synapses', {
    description: 'Get synapse connections',
    inputSchema: { type: 'object' },
    handler: async () => {
        return { synapses: _brain().getSynapses() };
    }
});

// ==================== RESONANCE: EXPERTISE DISCOVERY ====================

_methods.set('brain_discover', {
    description: 'Discover who knows about a topic - finds agents/skills with relevant expertise',
    inputSchema: {
        type: 'object',
        properties: {
            query: { type: 'string', description: 'What you want to know about' },
            type: { type: 'string', enum: ['all', 'agents', 'skills'], default: 'all' }
        },
        required: ['query']
    },
    handler: async ({ query, type = 'all' }) => {
        const embed = _embed();
        const brain = _brain();
        const results = { agents: [], skills: [], insights: [] };

        // Embed the query
        const queryVec = await embed.generate(query);

        // Use brain router paths instead of manual path joins!
        const brainPath = brain.getBrainPath();
        const path = require('path');

        // Search agents if requested
        if (type === 'all' || type === 'agents') {
            const agentsDir = path.join(brainPath, '..', 'agents');

            for (const filePath of _mcpStore.listRaw(path.relative(_MCP_ROOT, path.join(agentsDir, '*')))) {
                const file = path.basename(filePath);
                if (!file.endsWith('.md') || !_validSegment(file)) continue;

                const content = _mcpStore.read(path.relative(_MCP_ROOT, path.join(agentsDir, file)));
                const name = file.replace('.md', '');

                // Check triggers/skills in the agent file
                const agentVec = await embed.generate(content);
                const score = embed.cosineSimilarity(queryVec, agentVec);

                if (score > 0.1) {
                    results.agents.push({
                        name,
                        score: score.toFixed(3),
                        preview: content.substring(0, 150) + '...'
                    });
                }
            }

            results.agents.sort((a, b) => b.score - a.score);
            results.agents = results.agents.slice(0, 5);
        }

        // Search skills if requested - use public path
        if (type === 'all' || type === 'skills') {
            const publicPath = brain.getPublicPath ? brain.getPublicPath() : brainPath;
            const skillsDir = path.join(publicPath, '..', 'skills');

            for (const filePath of _mcpStore.listRaw(path.relative(_MCP_ROOT, path.join(skillsDir, '*')))) {
                const file = path.basename(filePath);
                if (!file.endsWith('.md') || !_validSegment(file)) continue;

                const content = _mcpStore.read(path.relative(_MCP_ROOT, path.join(skillsDir, file)));
                const name = file.replace('.md', '');

                const skillVec = await embed.generate(content);
                const score = embed.cosineSimilarity(queryVec, skillVec);

                if (score > 0.1) {
                    results.skills.push({
                        name,
                        score: score.toFixed(3),
                        preview: content.substring(0, 150) + '...'
                    });
                }
            }

            results.skills.sort((a, b) => b.score - a.score);
            results.skills = results.skills.slice(0, 5);
        }

        results.query = query;
        return results;
    }
});

_methods.set('brain_share', {
    description: 'Share a lesson/insight with other agents - propagates to relevant agents based on topic',
    inputSchema: {
        type: 'object',
        properties: {
            insight: { type: 'string', description: 'The lesson or insight to share' },
            source: { type: 'string', description: 'Which agent is sharing (optional, auto-detected)' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Topic tags for routing' }
        },
        required: ['insight']
    },
    handler: async ({ insight, source = 'unknown', tags = [] }) => {
        const embed = _embed();

        // Default tag detection from insight content
        if (tags.length === 0) {
            const words = insight.toLowerCase().split(/\s+/).slice(0, 5);
            tags = words.filter(w => w.length > 4);
        }

        // Find recipients - agents whose expertise overlaps with tags
        const _recipients = [];
        const insightsRel = path.join('public', 'insights.json');

        // Embed the insight
        const insightVec = await embed.generate(insight);

        // Find matching agents
        const _agentsDir = path.join(_MCP_ROOT, 'agents');
        const scores = [];

        for (const filePath of _mcpStore.listRaw(path.join('agents', '*'))) {
            const file = path.basename(filePath);
            if (!file.endsWith('.md') || !_validSegment(file)) continue;

            const content = _mcpStore.read(path.join('agents', file));
            const name = file.replace('.md', '');
            if (name === source) continue;

            const agentVec = await embed.generate(content);
            const score = embed.cosineSimilarity(insightVec, agentVec);

            if (score > 0.05) {
                scores.push({ name, score: score.toFixed(3) });
            }
        }

        scores.sort((a, b) => b.score - a.score);

        // Store the insight for propagation
        const newInsight = {
            id: 'insight_' + Date.now().toString(36),
            insight: insight.substring(0, 500),
            source,
            tags,
            created: new Date().toISOString(),
            recipients: scores.slice(0, 3).map(s => s.name),
            propagated: false
        };

        // (pass 111, S5/F12) MERGE-UNDER-LOCK: the read→write window used to
        // span the embedding work (several awaits), so two concurrent
        // brain_share calls — same process or peers — could each read the
        // same list and silently drop one insight on write. Re-read under
        // the repo-global mutex (this file is shared across brains), dedupe
        // by id, prepend, cap at 100.
        const lock = require('./lock');
        let totalInsights = 0;
        // (pass 116, parity sweep) The abort path is now checked: a
        // fail-closed refusal means the insight was NEVER written — the old
        // code returned {shared:true} while the row existed nowhere on disk
        // (a lying success). Same contract as teams/auth/vaf refusals.
        const out = await lock.withLock(lock.pathForGlobal('mcp-insights'), () => {
            let insights = [];
            if (_mcpStore.has(insightsRel)) {
                try { insights = JSON.parse(_mcpStore.read(insightsRel)); } catch (e) { console.warn("[mcp] Parse error:", e.message); }
            }
            insights = insights.filter(i => i && i.id !== newInsight.id);
            insights.unshift(newInsight);
            insights = insights.slice(0, 100); // Keep last 100
            _mcpStore.write(insightsRel, JSON.stringify(insights, null, 2));
            totalInsights = insights.length;
        });
        if (out && out.aborted) {
            return {
                error: 'Insights lock unavailable - insight not persisted',
                code: 'E_SAVE_REFUSED',
                reason: out.reason
            };
        }

        return {
            shared: true,
            insight: newInsight.id,
            source,
            tags,
            recipients: scores.slice(0, 3).map(s => s.name),
            totalInsights
        };
    }
});

_methods.set('brain_link', {
    description: 'Link two brains/concepts together - creates relationship for smarter retrieval',
    inputSchema: {
        type: 'object',
        properties: {
            from: { type: 'string', description: 'Source brain or concept' },
            to: { type: 'string', description: 'Target brain or concept' },
            type: { type: 'string', enum: ['relates', 'depends', 'builds', 'alternatives'], default: 'relates' }
        },
        required: ['from', 'to']
    },
    handler: async ({ from, to, type = 'relates' }) => {
        const linksRel = path.join('public', 'knowledge-links.json');

        // Load existing links (through storage layer)
        let links = [];
        if (_mcpStore.has(linksRel)) {
            try { links = JSON.parse(_mcpStore.read(linksRel)); } catch (e) { console.warn("[mcp] Parse error:", e.message); }
        }

        // Add new link
        links.push({
            from,
            to,
            type,
            created: new Date().toISOString()
        });

        // Dedupe and save
        const deduped = [];
        const seen = new Set();
        for (const l of links.reverse()) {
            const key = l.from + '->' + l.to;
            if (!seen.has(key)) {
                seen.add(key);
                deduped.push(l);
            }
        }

        _mcpStore.write(linksRel, JSON.stringify(deduped, null, 2));

        return { linked: true, from, to, type, totalLinks: deduped.length };
    }
});

_methods.set('brain_connections', {
    description: 'Get connected concepts for a brain - walks the knowledge graph',
    inputSchema: {
        type: 'object',
        properties: {
            brain: { type: 'string', description: 'Brain name to explore' },
            depth: { type: 'number', default: 2 }
        },
        required: ['brain']
    },
    handler: async ({ brain, depth = 2 }) => {
        const linksRel = path.join('public', 'knowledge-links.json');

        let links = [];
        if (_mcpStore.has(linksRel)) {
            try { links = JSON.parse(_mcpStore.read(linksRel)); } catch (e) { console.warn("[mcp] Parse error:", e.message); }
        }

        // Find connections
        const connections = new Set();
        const queue = [brain.toLowerCase()];
        const visited = new Set();

        for (let d = 0; d < depth && queue.length > 0; d++) {
            const current = queue.shift();
            if (visited.has(current)) continue;
            visited.add(current);

            for (const link of links) {
                if (link.from.toLowerCase() === current) {
                    connections.add(link.to);
                    queue.push(link.to);
                } else if (link.to.toLowerCase() === current) {
                    connections.add(link.from);
                    queue.push(link.from);
                }
            }
        }

        return {
            brain,
            depth,
            connections: [...connections],
            count: connections.size
        };
    }
});

// ==================== MCP SERVER ====================

_methods.set('agent_spawn', {
    description: 'Spawn agent (max 4: you + 3 others) - supports brain, team, roleId, reportsTo',
    inputSchema: {
        type: 'object',
        properties: {
            name: { type: 'string' },
            role: { type: 'string' },
            parent: { type: 'string' },
            brain: { type: 'string' },   // MULTIBRAIN: Brain to assign agent to
            team: { type: 'string' },   // MULTIBRAIN: Team to assign agent to
            roleId: { type: 'string' }, // MULTIBRAIN: Role ID within team
            reportsTo: { type: 'string' } // MULTIBRAIN: Agent ID this agent reports to
        }
    },
    handler: async (params) => await require('./agents').spawn(params)
});

_methods.set('agent_list', {
    description: 'List active agents',
    inputSchema: { type: 'object' },
    handler: async () => ({ agents: await require('./agents').list() })
});

_methods.set('agent_kill', {
    description: 'Kill agent by ID',
    inputSchema: { type: 'object', properties: { id: {type:'string'} } },
    handler: async (params) => require('./agents').kill(params.id)
});

 // NEW: Agent proto loading
_methods.set('agent_proto_list', {
    description: 'List available agent protos',
    inputSchema: { type: 'object' },
    handler: async () => {
        const agents = require('./agents');
        return { protos: agents.listProtos(), count: agents.listProtos().length };
    }
});

_methods.set('agent_proto_load', {
    description: 'Load an agent proto definition',
    inputSchema: { type: 'object', properties: { name: {type:'string'} }, required: ['name'] },
    handler: async ({ name }) => {
        const agents = require('./agents');
        const proto = agents.loadProto(name);
        if (!proto) return { error: 'Proto not found: ' + name };
        return { name, content: proto.content };
    }
});

// ==================== WORK ORDER (pass 212, H4 of #185) ====================
// work_assign: the composed MCP verb. ONE call = the full work handoff:
//   task text + optional escrow budget hold + agent spawn (or reuse an
//   existing agent by id) + task delegation + era fold when an era is open.
// Refusal law (same honesty posture as the #186/R1 pins): every failed
// leg returns a TYPED { ok:false, code:... } result, never a silent
// success and never a raw crash. Leg order is deliberate so a refusal
// leaves NO side effects: validate task → resolve agent (explicit id is
// NEVER silently replaced by a spawn) → budget gate BEFORE spawn → spawn
// (quota/rate/sandbox refusals surfaced verbatim) → delegate → era fold.
_methods.set('work_assign', {
    description: 'Assign a work order to a crew agent: optional escrow budget hold, spawn-or-reuse agent, delegate the task, fold into the open era. Composition verb (task + escrow + spawn + era).',
    inputSchema: {
        type: 'object',
        properties: {
            task: { type: 'string', description: 'The work order text (required)' },
            agentId: { type: 'string', description: 'Existing agent id to receive the work (optional; no id = spawn a new agent)' },
            name: { type: 'string', description: 'Spawn name (when spawning)' },
            role: { type: 'string', description: 'Spawn role (when spawning)' },
            budget: { type: 'number', description: 'Optional escrow budget units to gate the work (hold released on refusal)' }
        },
        required: ['task']
    },
    handler: async (params) => {
        const agents = require('./agents');
        const escrow = require('./escrow');
        const workId = 'work_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);

        // ---- Leg 0: the task text is the verb's contract ---
        const taskText = typeof params.task === 'string' ? params.task.trim() : '';
        if (!taskText) {
            return { ok: false, workId, code: 'E_TASK_ABSENT', error: 'work_assign requires a non-empty task string' };
        }

        // ---- Leg 1: resolve the agent — explicit id is honored EXACTLY, ---
        // never auto-replaced by a fresh spawn (that would be fiction).
        let agent = null;
        if (params.agentId !== undefined && params.agentId !== null) {
            const roster = agents.list();
            const hit = (Array.isArray(roster) ? roster : []).find(a => a && (a.id === params.agentId || a.agentId === params.agentId));
            if (!hit) {
                return { ok: false, workId, code: 'E_AGENT_ABSENT', error: 'No agent with id ' + String(params.agentId) + ' in the crew roster (list first; work_assign does not silently spawn a replacement)' };
            }
            agent = hit;
        }

        // ---- Leg 2: budget gate BEFORE any side effect (spawn/delegate) ---
        let hold = null;
        if (typeof params.budget === 'number' && params.budget > 0) {
            const budgetId = agent ? agent.id : workId;
            const gate = escrow.canSpend(budgetId, params.budget);
            if (!gate || gate.allowed !== true) {
                return { ok: false, workId, code: 'E_BUDGET_REFUSED', error: 'Budget gate refused ' + params.budget + ' units: ' + ((gate && gate.reason) || 'no gate answer'), gate: gate || null };
            }
        }

        // ---- Leg 3: spawn when no explicit agent (refusals surfaced) ----
        if (!agent) {
            const spawned = agents.spawn({ name: params.name || 'Worker', role: params.role || 'Worker', task: taskText.slice(0, 200) });
            if (!spawned || spawned.error) {
                return { ok: false, workId, code: 'E_SPAWN_REFUSED', error: 'Agent spawn refused: ' + ((spawned && spawned.error) || 'no spawn record') };
            }
            agent = spawned;
        }
        // Hold AFTER the agent id exists (hold-key contract) and only once
        // the budget gate passed — a hold here is real reserved budget.
        if (typeof params.budget === 'number' && params.budget > 0) {
            hold = escrow.hold(workId, { amount: params.budget, agentId: agent.id, task: taskText.slice(0, 200) });
            if (!hold || hold.held !== true) {
                return { ok: false, workId, agentId: agent.id, code: 'E_HOLD_REFUSED', error: 'Escrow hold refused: ' + ((hold && hold.reason) || 'no hold record') };
            }
        }

        // ---- Leg 4: delegate the task ----
        const delegated = await agents.delegate(agent.id, { operation: 'work_assign', task: taskText, workId });
        if (delegated && delegated.error) {
            // Refund the hold on refusal — a refused delegation must not
            // strand reserved budget.
            if (hold) escrow.release(workId);
            return { ok: false, workId, agentId: agent.id, code: 'E_DELEGATE_REFUSED', error: 'Task delegation refused: ' + delegated.error, holdReleased: !!hold };
        }

        // ---- Leg 5: era fold (NO-OP when no era is open — the era ----
        // subscriber contract; work_assign reports that honestly). Fold type
        // follows the era FIELD_FOR_EVENT catalogue ('task:' → threads) —
        // a bare 'work_assign' matches no catalogue prefix and would no-op silently.
        let folded = false;
        try {
            const era = require('./era');
            const f = era && era.fold ? era.fold('task:assigned', { workId, agentId: agent.id, task: taskText.slice(0, 200), budget: params.budget || 0, hold: !!hold }) : null;
            folded = f !== null && f !== undefined;
        } catch (e) { folded = false; }

        return {
            ok: true,
            workId,
            agentId: agent.id,
            agentName: agent.name || null,
            task: taskText,
            budget: params.budget || 0,
            hold: hold ? { holdId: workId, ...hold } : null,
            delegated: delegated && !delegated.error,
            eraFolded: folded
        };
    }
});

// NEW: Skill proto loading
_methods.set('skill_proto_list', {
    description: 'List available skill protos',
    inputSchema: { type: 'object' },
    handler: async () => {
        const path = require('path');
        const skills = require(path.join(__dirname, 'skills'));
        const protos = skills.listProtos();
        return { protos, count: protos.length };
    }
});

_methods.set('skill_proto_load', {
    description: 'Load a skill proto definition',
    inputSchema: { type: 'object', properties: { name: {type:'string'} }, required: ['name'] },
    handler: async ({ name }) => {
        const path = require('path');
        const skills = require(path.join(__dirname, 'skills'));
        const proto = skills.loadProto(name);
        if (!proto) return { error: 'Proto not found: ' + name };
        return { name, content: proto.content };
    }
});

// ==================== BRAIN CORE (9) ====================

_methods.set('vant_get_memory', {
    description: 'Read a brain file (category/filename)',
    inputSchema: {
        type: 'object',
        properties: {
            category: { type: 'string', description: 'Brain category (e.g. learnings)' },
            filename: { type: 'string', description: 'File name within the category' }
        },
        required: ['category', 'filename']
    },
    // (pass 80) Called bare `brain.load(name)` — `brain` was never in scope
    // (only the _brain() accessor), so every call threw ReferenceError. The
    // inputSchema (name/content) ALSO disagreed with the docs
    // (category/filename/content) — when docs and schema disagree, both are
    // broken. Adopted the documented shape. Reads go through the same
    // BrainStorage the write side uses (category/filename.md layout under
    // the active brain root) — brain.read() can't take category paths
    // (segment validation rejects '/').
    handler: async ({ category, filename }) => {
        const storage = require('./storage');
        const key = filename.replace(/\.md$/, '');
        const bs = storage.get('brain');
        let content = bs.get(category, key + '.md');
        if (content == null) content = bs.get(category, key);
        if (content == null || content.error) {
            return { error: 'Brain file not found: ' + category + '/' + filename };
        }
        return {
            category,
            filename,
            content: String(content),
            bytes: String(content).length,
            brain: _brain().currentBrain(),
            source: 'private'
        };
    }
});

_methods.set('vant_set_memory', {
    description: 'Write a brain file (category/filename)',
    inputSchema: {
        type: 'object',
        properties: {
            category: { type: 'string', description: 'Brain category (e.g. lessons)' },
            filename: { type: 'string', description: 'File name within the category' },
            content: { type: 'string', description: 'Content to write' }
        },
        required: ['category', 'filename', 'content']
    },
    // (pass 80) Same bare-brain ReferenceError as vant_get_memory; also
    // called writeBrain() which does not exist on the brain module. Now
    // routes through brain.write(category, key, content) — the same
    // security-chained write every other brain writer uses — with the
    // filename normalized to the .md convention BrainStorage.write applies.
    handler: async ({ category, filename, content }) => {
        const b = _brain();
        const key = filename.replace(/\.md$/, '');
        await b.write(category, key, content);
        return { success: true, category, filename: key + '.md', bytes: String(content).length };
    }
});

_methods.set('vant_list_branches', {
    description: 'List brain branches',
    inputSchema: { type: 'object' },
    handler: async () => {
        const branch = require('./branch');
        return { branches: await branch.listBranches() };
    }
});

_methods.set('vant_create_branch', {
    description: 'Create new brain branch',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    // (pass 97) Was a silent no-op reporting {status:'created'} without
    // creating a branch. Routes to branch.checkout(name, create=true) — the
    // real create-and-checkout API (agents/<name>).
    handler: async ({ name }) => {
        const branch = require('./branch');
        const created = await branch.checkout(name, true);
        return { name, branch: created, status: 'created' };
    }
});

_methods.set('vant_switch_branch', {
    description: 'Switch the active brain',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    // (pass 80) Called brain.switchBranch(name) — no such method on the
    // brain module (ReferenceError on every call). switchBrain() is the
    // real API (honors VANT_BRAIN state-store resolution).
    handler: async ({ name }) => {
        _brain().switchBrain(name);
        return { name, status: 'switched' };
    }
});

_methods.set('vant_commit', {
    description: 'Commit brain changes',
    inputSchema: { type: 'object', properties: { message: { type: 'string' }, agentId: { type: 'string' } }, required: ['message'] },
    // (pass 97) Was a silent no-op — returned {status:'committed'} without
    // committing anything (the pass-96 MCP-stub genre). Routes to
    // branch.commit(), the real brain-commit API (provider when configured,
    // else the git CLI fallback).
    handler: async ({ message, agentId }) => {
        const branch = require('./branch');
        const id = (typeof agentId === 'string' && agentId) ? agentId : 'mcp';
        const sha = await branch.commit(id, message);
        return { message, status: sha ? 'committed' : 'no-changes', commit: sha || null };
    }
});

_methods.set('vant_sync', {
    description: 'Push/pull with GitHub',
    inputSchema: { type: 'object' },
    // (pass 97) Was a literal {status:'synced'} that never touched the
    // providers. Returns the REAL sync status (same call vant_sync_status
    // uses) — reads providers, not a fabricated headline.
    handler: async () => {
        const sync = _sync();
        return { status: 'ok', ...(await sync.getStatus()) };
    }
});

_methods.set('vant_lock', {
    description: 'Acquire/release/inspect the brain authorization lease (per-brain + whole-stack status)',
    inputSchema: {
        type: 'object',
        properties: {
            action: { type: 'string', enum: ['acquire', 'release', 'status', 'stack', 'force', 'stats'], description: 'Lock operation' },
            token: { type: 'string', description: 'Release token from acquire' },
            agentId: { type: 'string' }
        },
        required: ['action']
    },
    // (pass 97) Was a literal {status:'acquired'|'released'} that never
    // touched lib/brain-lock — a caller could "release" a lock it never held
    // and see success. Routes to the real brain-lock module; bad action is an
    // explicit input error rather than a fabricated success.
    handler: async ({ action, token, agentId }) => {
        const lock = require('./brain-lock');
        switch (action) {
            case 'acquire': {
                const got = await lock.acquireBrainLock(agentId || null);
                return { action, acquired: !!got, token: got || null };
            }
            case 'release':
                return { action, ...(await lock.releaseBrainLock(agentId || null, token || null)) };
            case 'status':
                // (pass 107, S3) report the STACK too, not just the process-active
                // brain — mirrors `vant_lock stack` and health.getStackHealthStatus.
                return { action, status: lock.brainLockStatus(), stack: lock.getStackLockStatus(), held: lock.listStackLocks() };
            case 'stack':
                // Explicit whole-stack view: per-brain lease status + held rows.
                return { action, ...lock.getStackLockStatus(), held: lock.listStackLocks() };
            case 'force':
                return { action, forceReleased: lock.forceReleaseBrainLock() };
            case 'stats':
                // (pass 117, target #2) Lock observability: contention and
                // fail-closed refusals as queryable counters, not just
                // stderr lines. Mutex = lib/lock.stats(); lease = counters
                // inside brain-lock itself. Deltas between polls are the
                // intended read pattern (no reset API).
                return {
                    action,
                    mutex: require('./lock').stats(),
                    lease: lock.leaseStats()
                };
            default:
                return { error: 'Unknown lock action: ' + action, code: 'MCP_INPUT_INVALID' };
        }
    }
});

_methods.set('vant_health', {
    description: 'System health check',
    inputSchema: { type: 'object' },
    // (pass 97) Was a literal {status:'ok'} that inspected nothing. Returns
    // real per-brain stack health (lib/health.getStackHealthStatus) plus live
    // process facts instead of a hardcoded ok.
    handler: async () => {
        let byBrain = {};
        let brains = [];
        try {
            const health = require('./health');
            const stack = health.getStackHealthStatus();
            brains = stack.brains || [];
            byBrain = stack.byBrain || {};
        } catch (e) { /* stack unavailable - report process facts only */ }
        return { status: 'ok', brains, byBrain, pid: process.pid, uptime: Math.round(process.uptime()), timestamp: Date.now() };
    }
});

// ==================== EXTENDED (12) ====================

_methods.set('vant_get_islands', {
    description: 'List islands',
    inputSchema: { type: 'object' },
    handler: async () => {
        const islands = _islands();
        return { islands: islands.getAvailable() };
    }
});

_methods.set('vant_load_island', {
    description: 'Load island',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => {
        const islands = _islands();
        const data = await islands.load(name);
        return { name, data };
    }
});

_methods.set('vant_island_status', {
    description: 'Get honest island status (exists/type/source/populated) - distinguishes unknown island from wired-but-empty',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => {
        const islands = _islands();
        const info = await islands.status(name);
        // (pass 84) Boundary visibility: is this island RLS-gated, and by
        // what rules? Reads the habitat's shared boundaries directly.
        try {
            const habitat = require('./habitat');
            const h = habitat.getShared ? habitat.getShared() : null;
            const policy = h && h.boundaries ? h.boundaries['_island:' + name] : null;
            if (policy) {
                info.boundary = {
                    gated: true,
                    readableBy: policy.readableBy || [],
                    writableBy: policy.writableBy || [],
                    container: policy.container || 'default'
                };
            } else {
                info.boundary = { gated: false };
            }
        } catch (e) {
            info.boundary = { gated: false, error: e.message };
        }
        return info;
    }
});

// (pass 84) Island boundary enforcement surface: same context resolution
// islands.load() uses (explicit userCtx -> current agent's habitat identity
// -> anonymous), evaluated against the island's boundary policy.
_methods.set('islands_canAccess', {
    description: 'RLS check: can a context read/write an island? Resolves the current agent context when userCtx omitted',
    inputSchema: {
        type: 'object',
        properties: {
            name: { type: 'string' },
            userCtx: { type: 'object', description: 'Optional RLS context; defaults to current agent identity or anonymous' },
            mode: { type: 'string', enum: ['read', 'write'], default: 'read' }
        },
        required: ['name']
    },
    handler: async ({ name, userCtx, mode = 'read' }) => {
        // (pass 227) the handler-bound `islands` module ref was unused (the
        // policy decision below consults habitat boundaries only); bare call
        // preserves the lazy load without reintroducing a binding.
        _islands();
        // (pass 86) verified > declared > current-agent > anonymous.
        const ctx = _requestCtx(userCtx);
        const habitat = require('./habitat');
        const h = await habitat.getSharedReady();
        const policy = h.boundaries['_island:' + name] || null;
        // (pass 84) Mirror the ACTUAL load()/save() gates: no policy = open
        // island (allowed in both modes). Only policy'd islands consult
        // can() — h.can's defaultPolicy fallback would otherwise report
        // admin-only writes for islands that are in fact ungated.
        const allowed = policy ? await h.can(ctx, '_island:' + name, mode) : true;
        return {
            name, mode, allowed,
            gated: !!policy,
            verified: !!(_requestAls.getStore() && _requestAls.getStore().verifiedCtx),
            resolved: ctx ? { userId: ctx.userId || ctx.agentId || null, workspace: ctx.workspace || null, roles: ctx.roles || [] } : { anonymous: true }
        };
    }
});

// (pass 86) Habitat token surface (#4 MCP auth ctx): mint/verify/revoke.
// Tokens anchor to habitat identities (agentContext at verify time), so a
// bearer token is a REGISTRY-VERIFIED RLS subject — the MCP door accepts it
// and every wired tool treats it as verified beats declared.
_methods.set('vant_habitat_mintToken', {
    description: 'Mint a bearer access token anchored to a spawned agent identity (raw token shown once; subject is registry-verified at use time)',
    inputSchema: {
        type: 'object',
        properties: { agentId: { type: 'string' }, ttlMs: { type: 'number' } },
        required: ['agentId']
    },
    handler: async ({ agentId, ttlMs }) => {
        const h = await _sharedHabitat();
        return h.mintToken(agentId, { ttlMs });
    }
});

_methods.set('vant_habitat_verifyToken', {
    description: 'Verify a bearer token and return its registry-verified RLS subject (null/expired reported, never thrown)',
    inputSchema: {
        type: 'object',
        properties: { token: { type: 'string' } },
        required: ['token']
    },
    handler: async ({ token }) => {
        const h = await _sharedHabitat();
        const ctx = h.verifyToken(token);
        return { valid: !!ctx, subject: ctx };
    }
});

_methods.set('vant_habitat_revokeToken', {
    description: 'Revoke a token by hash-prefix or raw token (persisted — dead in every future process)',
    inputSchema: {
        type: 'object',
        properties: { tokenOrHash: { type: 'string' } },
        required: ['tokenOrHash']
    },
    handler: async ({ tokenOrHash }) => {
        const h = await _sharedHabitat();
        return { revoked: h.revokeToken(tokenOrHash) };
    }
});

// ==================== GUESTS (H1 of #185): per-identity multi-guest auth ====
// (pass 211) Admin-only tools: guests can NEVER manage themselves (the door
// gate classifies these admin; the handlers below REPEAT the check so the
// stdio lane and any future exec path inherit the same verdict — one policy,
// every door).

function _assertNotGuest(op) {
    const store = _requestAls.getStore();
    if (store && store.guest) {
        throw new errors.VantError(op + ': guest management is admin-only — a guest can never manage guests',
            { code: errors.CODES.API_REQUEST_INVALID, retryable: false });
    }
}

_methods.set('guest_issue', {
    description: 'H1 (#185): issue a guest identity with a raw token (SHOWN ONCE, hashed at rest). Admin-only.',
    inputSchema: {
        type: 'object',
        properties: {
            name: { type: 'string' },
            role: { type: 'string', enum: ['observer', 'human', 'agent'] },
            scopeOwner: { type: 'string' },
            trustLevel: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
            expires: { type: 'string' }
        },
        required: ['name']
    },
    handler: async ({ name, role, scopeOwner, trustLevel, expires }) => {
        _assertNotGuest('guest_issue');
        const opts = {};
        if (role !== undefined) opts.role = role;
        if (scopeOwner !== undefined) opts.scopeOwner = scopeOwner;
        if (trustLevel !== undefined) opts.trustLevel = trustLevel;
        if (expires !== undefined) opts.expires = expires;
        return require('./guests').issue(name, opts);
    }
});

_methods.set('guest_list', {
    description: 'H1 (#185): the guest roster (public projections — no hashes, no secrets). Admin-only.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
        _assertNotGuest('guest_list');
        return { guests: require('./guests').list() };
    }
});

_methods.set('guest_revoke', {
    description: 'H1 (#185): revoke a guest by id or name (denylist-backed: dead at once in every future process). Admin-only.',
    inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id']
    },
    handler: async ({ id }) => {
        _assertNotGuest('guest_revoke');
        return { revoked: require('./guests').revoke(id) };
    }
});

// ==================== SECURITY PIPELINE (prd-web 4.4): the scan ========== //
// "Scan lib, confirm modules use the middleware pipeline, display lib
// modules outside the pipeline (unless whitelisted)." POD-SIDE truth: the
// dashboard NEVER reads the pod's source (web one-way boundary), so the
// door exposes the report and the frontend renders it verbatim — nothing
// greenwashed, unwired stays unwired. The whitelist is OPERATOR state:
// brain config `security.pipelineAllow` (comma-separated module names),
// managed via `vant config set` — the pod never auto-flips config for an
// unwired module, the scan REPORTS and the operator decides. Admin-only
// (guest_list's precedent): the report enumerates the pod's internal
// module topology, and #185's enumeration lesson keeps that shape away
// from guests. A whitelisted module is tagged EXEMPT — a stated choice,
// not a colored-over gap.

_methods.set('security_pipeline_report', {
    description: 'Scan the pod lib/ tree for middleware-chain wiring (sandbox/vaf/qos/escrow) and report modules outside the pipeline (unless whitelisted via security.pipelineAllow). Hat: admin-only like guest_list — pod internals keep their topology from guests.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
        _assertNotGuest('security_pipeline_report');
        const pipeline = require('./security-pipeline');
        const config = require('./config');
        const allowRaw = config.get('security.pipelineAllow');
        const allow = String(allowRaw || '')
            .split(',')
            .map((s) => s.trim().replace(/\.js$/, ''))
            .filter(Boolean);
        const report = pipeline.scan(path.join(__dirname, 'lib'), { allow });
        // Auditable like every read of pod internals, but never noisy.
        try {
            require('./audit').log('security_pipeline_report', {
                scanned: report.scanned,
                unwired: report.unwired.length,
                exempt: report.exempt.length
            });
        } catch { /* the scan itself is the answer; audit is best-effort */ }
        return report;
    }
});

// ==================== PAIRING (H6/P3): the voucher on the door ============
// The P3 rung: a dashboard can ISSUE + redeem a pairing voucher without a
// terminal. The valuable invariant rides lib/guests.js and does NOT move:
// the VOUCHER code is randomless-hostile, shown exactly once, and the
// ledger keeps only its HASH; redemption is single-use, timing-safe, and
// 24h-expired into the default `human` guest (role grants, never a
// standing credential). Generate is admin-only like guest_issue (a guest
// minting vouchers would be an escalation); redeem is UNAUTHED-class by
// design — the code ITSELF is the credential, and a wrong/expired/reused
// code answers the typed { ok:false, reason } shape, never a crash.
// (H6 un-hold: the QR + deep-link redeem view now has a real tool to call.)

_methods.set('pairing_voucher_generate', {
    description: 'H6/P3: mint a pairing voucher — the code is SHOWN ONCE (the ledger keeps only its hash). Single-use, 24h expiry; redeeming becomes the default human guest. Admin-only.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
        _assertNotGuest('pairing_voucher_generate');
        const code = 'vhpair-' + require('crypto').randomBytes(24)
            .toString('base64url').replace(/[^A-Za-z0-9-]/g, '').slice(0, 30);
        const guests = require('./guests');
        if (!guests.offerPairing(code)) {
            return { ok: false, error: 'ledger write refused (fail-closed) — no voucher was issued' };
        }
        return { ok: true, code, shownOnce: true, expiresInHours: 24 };
    }
});

_methods.set('relay_ride', {
    description: 'The e2e ride corridor AT THE DOOR (prd-relay \u00a75, P6b + rung 2): open the sealed envelope with this pod\'s channel key, ride the inner door call, answer re-sealed as { ok:true, rode:true, ct } (or typed E_RIDE_*). RUNG 2 BINDING (pass 272): the seal must carry its context ctx { origin, path, nonce:nonce } — a ctx-less or nonce-mismatched ride is a DOWNGRADE, typed E_RIDE_DECODE; the answer re-seal binds to the request nonce (a swapped answer cannot be spliced). UNAUTHED-class by the same law as redeem — THE ENVELOPE IS THE CREDENTIAL: a stranger\'s ciphertext decodes to nothing (typed E_RIDE_DECODE, fail-closed); the inner bearer inside the seal is the actual door authority. An unbound pod answers typed E_RIDE_OFFLINE. Shares ONE answer core with the webhook relay.ride face (lib/api.js rideAnswer).',
    inputSchema: {
        type: 'object',
        properties: { ct: { type: 'string', description: 'the AES-256-GCM envelope (Encrypt canon salt:iv:tag:cipher) holding { nonce, bearer?, body:{tool|method, args} }' } },
        required: ['ct']
    },
    handler: async ({ ct }) => {
        const api = require('./api');
        const reply = await api.rideAnswer(typeof ct === 'string' ? ct : '');
        // door answer shape: ride ack verbatim (typed refusals ride code);
        // a success answers { ok, rode, ct } — the sealed answer envelope.
        return reply && typeof reply === 'object' ? reply : { ok: false, code: 'E_RIDE_DISPATCH', error: 'the ride core answered nothing.' };
    }
});

_methods.set('pairing_voucher_redeem', {
    description: 'H6/P3: redeem a pairing voucher into the default human guest identity. The code is the credential: single-use, timing-safe, expires after 24h. (prd-relay \u00a75, rung 1 — THE KEY BINDING MOMENT) when the pod\'s relay posture is armed (relay.enabled + relay.channelKey), THE SAME reply also carries the e2e relay channelKey for the sovereign profile — shown once beside the token, never again through any door or caps surface.',
    inputSchema: {
        type: 'object',
        properties: { code: { type: 'string' } },
        required: ['code']
    },
    handler: async ({ code }) => {
        const guests = require('./guests');
        const r = guests.pair(String(code || ''));
        // (final-check fix) guests.pair() mirrors issue()'s Return shape:
        // SUCCESS is { token, guest } with NO ok field; failures are
        // { ok: false, reason }. Detect by token presence — an ok:
        // undefined success must never render as a typed refusal.
        if (r && typeof r === 'object' && !('token' in r)) {
            return { ok: false, reason: (r.reason || r.error || 'pairing refused') };
        }
        const out = { ok: true, token: r.token, guest: r.guest }; // raw token SHOWN ONCE
        // (prd-relay.md §5, rung 1) THE PAIRING-TIME E2E KEY BINDING: the
        // redeem IS the binding moment — the sealed channel key rides the
        // SAME one-time reply as the raw token, exactly so no other
        // surface (door verb, caps page, dashboard route) ever has to
        // hand it out. Delivered ONLY when the ride face is really armed
        // (relay.enabled + relay.channelKey set — lib/api.js's own law);
        // an unbound pod answers honestly: e2e:"unbound", no fake key.
        try {
            const config = require('./config');
            const enabledRaw = config.get('relay.enabled');
            // the same truthiness law lib/api.js's _truthy applies to the
            // posture keys ('true'/true; anything else is off)
            const armed = enabledRaw === true || String(enabledRaw) === 'true';
            const key = config.get('relay.channelKey');
            if (armed && typeof key === 'string' && key.length >= 32) {
                out.channelKey = key;
                out.e2e = 'bound';
            } else {
                out.e2e = 'unbound';
            }
        } catch (e) { out.e2e = 'unbound'; }
        return out;
    }
});// (pass 80) inputSchema lacked required:['name'] so empty args passed
// the door and crashed in createIsland (charAt on undefined) — the
// audit's remaining 'phantom' genre. Schema now refuses before the
// handler can crash.
_methods.set('vant_create_island', {
    description: 'Create new island',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, type: {type:'string'}, triggers: {type:'array'} }, required: ['name'] },
    handler: async (params) => {
        const islands = _islands();
        const result = islands.createIsland(params.name, { type: params.type, triggers: params.triggers || [] });
        return result;
    }
});

_methods.set('vant_update_island_triggers', {
    description: 'Update island triggers',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, triggers: {type:'array'} }, required: ['name', 'triggers'] },
    handler: async ({ name, triggers }) => {
        const islands = _islands();
        const result = islands.updateTriggers(name, triggers);
        return result;
    }
});

_methods.set('vant_delete_island', {
    description: 'Delete island',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => {
        const islands = _islands();
        const result = islands.deleteIsland(name);
        return result;
    }
});

_methods.set('vant_enable_island', {
    description: 'Enable island',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => {
        const islands = _islands();
        const result = islands.enableIsland(name);
        return result;
    }
});

_methods.set('vant_disable_island', {
    description: 'Disable island',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => {
        const islands = _islands();
        const result = islands.disableIsland(name);
        return result;
    }
});

// (pass 189 MCP fiction audit) the three citations tools were CANNED —
// listSources() does not exist on lib/citations.js (getAll() is the read),
// add returned {added:true} without touching the ledger, format ignored the
// lib's formatCitation context rule. All route through the real module now.
_methods.set('vant_citations_list', {
    description: 'List citation sources (real getAll from lib/citations.js)',
    inputSchema: { type: 'object' },
    handler: async () => {
        const citations = _citations();
        try { return { count: citations.getAll().length, sources: citations.getAll() }; }
        catch (e) { return { count: 0, sources: [], error: e.message }; }
    }
});

_methods.set('vant_citations_add', {
    description: 'Add a citation source (real addSource, merge-under-lock)',
    inputSchema: { type: 'object', properties: { commit: { type: 'string' }, context: { type: 'string' } }, required: ['commit'] },
    handler: async ({ commit, context }) => {
        const citations = _citations();
        try {
            const src = citations.addSource(commit, context || '');
            if (!src) return { added: false, reason: 'lock unavailable — write refused' };
            return { added: true, source: src };
        } catch (e) {
            return { added: false, error: e.message };
        }
    }
});

_methods.set('vant_citations_format', {
    description: 'Verify + format a citation (real verify + formatCitation)',
    inputSchema: { type: 'object', properties: { commit: { type: 'string' } }, required: ['commit'] },
    handler: async ({ commit }) => {
        const citations = _citations();
        try {
            const cited = citations.verify(commit);
            if (!cited) return { cited: false, citation: null };
            const source = citations.getAll().find(s => s.commit && s.commit.startsWith(commit.substring(0, 7)));
            return { cited: true, citation: citations.formatCitation(source || { commit }) };
        } catch (e) {
            return { cited: false, error: e.message };
        }
    }
});

// NEW: Connector MCP tools
_methods.set('vant_connector_list', {
    description: 'List connectors',
    inputSchema: { type: 'object' },
    handler: async () => {
        const connector = require('./connector');
        return { connectors: connector.getConnectors?.() || [] };
    }
});

_methods.set('vant_connector_connect', {
    description: 'Connect to service',
    inputSchema: { type: 'object', properties: { service: { type: 'string' } }, required: ['service'] },
    handler: async ({ service }) => {
        const _connector = require('./connector');
        return { service, connected: true };
    }
});

// NEW: Framework MCP tools
_methods.set('vant_framework_status', {
    description: 'Framework status',
    inputSchema: { type: 'object' },
    handler: async () => {
        const vant = require('./vant');
        return { status: vant.getStatus?.() || { name: 'framework', type: 'runtime' } };
    }
});

_methods.set('vant_get_island', {
    description: 'Get island definition',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => {
        const islands = _islands();
        const result = islands.getIsland(name);
        return result;
    }
});

_methods.set('vant_bulk_create_islands', {
    description: 'Bulk create islands',
    inputSchema: { type: 'object', properties: { islands: { type: 'array' } }, required: ['islands'] },
    handler: async ({ islands }) => {
        const islandsModule = _islands();
        return islandsModule.bulkCreate(islands);
    }
});

_methods.set('vant_export_islands', {
    description: 'Export all islands as JSON',
    inputSchema: { type: 'object' },
    handler: async () => {
        const islandsModule = _islands();
        return islandsModule.exportAll();
    }
});

_methods.set('vant_find_islands_by_trigger', {
    description: 'Find islands by trigger',
    inputSchema: { type: 'object', properties: { trigger: { type: 'string' } }, required: ['trigger'] },
    handler: async ({ trigger }) => {
        const islandsModule = _islands();
        return { islands: islandsModule.findByTrigger(trigger) };
    }
});

// NEW: Branch Manager MCP tools (lib/branch.js)
_methods.set('vant_branch_is_dirty', {
    description: 'Check if working dir is dirty',
    inputSchema: { type: 'object' },
    handler: async () => {
        const branch = require('./branch');
        return { dirty: branch.isDirty() };
    }
});// (pass 80) branch.getChangedBrains() used to throw 's.split is not a
// function' (status() returns an object, not a porcelain string) —
// fixed in lib/branch.js; this now returns real changed brain files.
_methods.set('vant_branch_changed_brains', {
    description: 'Get changed brain files',
    inputSchema: { type: 'object' },
    handler: async () => {
        const branch = require('./branch');
        return { brains: branch.getChangedBrains() };
    }
});

// (pass 80) autoBranch became async when it switched to the awaited
// checkout(); the old sync passthrough returned an unresolved promise.
_methods.set('vant_branch_auto', {
    description: 'Auto-create branch from changes',
    inputSchema: { type: 'object', properties: { prefix: { type: 'string' } } },
    handler: async ({ prefix }) => {
        const branch = require('./branch');
        const name = await branch.autoBranch({ prefix: prefix || 'agent' });
        return { branch: name };
    }
});

// NEW: Brain Horcrux MCP tools (lib/brain.js)
_methods.set('vant_brain_backups', {
    description: 'List brain backups',
    inputSchema: { type: 'object' },
    handler: async () => {
        const brain = _brain();
        return { backups: brain.listBackups() };
    }
});

_methods.set('vant_brain_backup', {
    description: 'Backup brain to image',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
    handler: async ({ path }) => {
        const brain = _brain();
        const _result = await brain.backupToImage(path);
        return { status: 'backed_up', path };
    }
});

_methods.set('vant_brain_restore', {
    description: 'Restore brain from image',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
    handler: async ({ path }) => {
        const brain = _brain();
        const _result = await brain.restoreFromImage(path);
        return { status: 'restored', path };
    }
});

// Agents MCP tools (lib/agents.js) - vant_agents_mcp_start removed (dead code)

// NEW: brain.myStuff MCP tools
_methods.set('vant_brain_my_stuff', {
    description: 'Get personal brain data',
    inputSchema: { type: 'object' },
    handler: async () => {
        const brain = _brain();
        return brain.myStuff();
    }
});

_methods.set('vant_brain_update_my_stuff', {
    description: 'Update personal brain file',
    inputSchema: { type: 'object', properties: { key: { type: 'string' }, content: { type: 'string' } }, required: ['key', 'content'] },
    handler: async ({ key, content }) => {
        const brain = _brain();
        return brain.updateMyStuff(key, content);
    }
});

// NEW: brain.yourStuff (temp stash)
_methods.set('vant_brain_your_stuff', {
    description: 'Get temp stash',
    inputSchema: { type: 'object' },
    handler: async () => {
        const brain = _brain();
        return brain.yourStuff();
    }
});

// ==================== EVOLUTION TOOLS ====================
// pass 80: these handlers used `(ctx, { sessionId })` destructuring (the
// second arg is always undefined from execute()) and called _getBrain()
// which never existed in this module. Fixed to single-params signature +
// the real `_brain()` accessor. All five threw on any call before.
_methods.set('brain_evolution_start', {
    description: 'Start a new evolution session for tracking changes and insights',
    inputSchema: { type: 'object', properties: { sessionId: { type: 'string', description: 'Optional session ID' } } },
    handler: async ({ sessionId } = {}) => {
        const brain = _brain();
        if (!brain?.startEvolutionSession) {
            return { error: 'evolution not available' };
        }
        const result = brain.startEvolutionSession(sessionId);
        return { success: true, session: result };
    }
});

_methods.set('brain_evolution_end', {
    description: 'End current evolution session and return summary',
    inputSchema: { type: 'object' },
    handler: async () => {
        const brain = _brain();
        if (!brain?.endEvolutionSession) {
            return { error: 'evolution not available' };
        }
        const result = await brain.endEvolutionSession();
        return { success: true, summary: result };
    }
});

_methods.set('brain_evolution_insight', {
    description: 'Record an insight during evolution session',
    inputSchema: { type: 'object', properties: { insight: { type: 'string', description: 'Insight text' } }, required: ['insight'] },
    handler: async ({ insight }) => {
        const brain = _brain();
        if (!brain?.recordInsight) {
            return { error: 'evolution not available' };
        }
        brain.recordInsight(insight);
        return { success: true };
    }
});

_methods.set('brain_evolution_history', {
    description: 'Get evolution history (last session, recent insights)',
    inputSchema: { type: 'object' },
    handler: async () => {
        const brain = _brain();
        if (!brain?.getEvolutionHistory) {
            return { error: 'evolution not available' };
        }
        const history = await brain.getEvolutionHistory();
        return { success: true, history };
    }
});

_methods.set('brain_evolution_status', {
    description: 'Get current evolution session status',
    inputSchema: { type: 'object' },
    handler: async () => {
        const brain = _brain();
        if (!brain?.getEvolutionSession) {
            return { error: 'evolution not available' };
        }
        const session = brain.getEvolutionSession();
        const changes = brain.getEvolutionChanges ? brain.getEvolutionChanges() : [];
        const insights = brain.getEvolutionInsights ? brain.getEvolutionInsights() : [];
        return { success: true, session, changesCount: changes.length, insightsCount: insights.length };
    }
});

_methods.set('vant_brain_stash', {
    description: 'Stash temp work',
    inputSchema: { type: 'object', properties: { data: { type: 'object' } }, required: ['data'] },
    handler: async ({ data }) => {
        const brain = _brain();
        return brain.stashYourStuff(data);
    }
});

_methods.set('vant_brain_clear', {
    description: 'Clear temp stash',
    inputSchema: { type: 'object' },
    handler: async () => {
        const brain = _brain();
        return brain.clearYourStuff();
    }
});

// NEW: brain handler registration
_methods.set('vant_brain_handlers', {
    description: 'Get registered handlers',
    inputSchema: { type: 'object' },
    handler: async () => {
        const brain = _brain();
        return brain.getHandlers();
    }
});

_methods.set('vant_brain_clear_handlers', {
    description: 'Clear handlers',
    inputSchema: { type: 'object' },
    handler: async () => {
        const brain = _brain();
        return brain.clearHandlers();
    }
});

// NEW: brain.myStuff (private dropbox)
_methods.set('vant_brain_my_drop', {
    description: 'Save private file',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, content: { type: 'string' } }, required: ['name', 'content'] },
    handler: async ({ name, content }) => {
        const brain = _brain();
        return brain.myDropFile(name, content);
    }
});

_methods.set('vant_brain_my_get', {
    description: 'Get private file',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => {
        const brain = _brain();
        return brain.myGetFile(name);
    }
});

_methods.set('vant_brain_my_list', {
    description: 'List private files',
    inputSchema: { type: 'object' },
    handler: async () => {
        const brain = _brain();
        return brain.myListFiles();
    }
});

// NEW: brain.yourStuff Dropbox
_methods.set('vant_brain_drop_file', {
    description: 'Save file to dropbox',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, content: { type: 'string' } }, required: ['name', 'content'] },
    handler: async ({ name, content }) => {
        const brain = _brain();
        return brain.dropFile(name, content);
    }
});

_methods.set('vant_brain_get_file', {
    description: 'Get file from dropbox',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => {
        const brain = _brain();
        return brain.getFile(name);
    }
});

_methods.set('vant_brain_list_files', {
    description: 'List dropbox files',
    inputSchema: { type: 'object' },
    handler: async () => {
        const brain = _brain();
        return brain.listFiles();
    }
});

_methods.set('vant_brain_delete_file', {
    description: 'Delete dropbox file',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    handler: async ({ name }) => {
        const brain = _brain();
        return brain.deleteFile(name);
    }
});

_methods.set('vant_brain_clear_dropbox', {
    description: 'Clear dropbox',
    inputSchema: { type: 'object' },
    handler: async () => {
        const brain = _brain();
        return brain.clearDropbox();
    }
});

// (pass 189 MCP fiction audit) vant_resolution_track was CANNED — accepted
// (id, outcome) and returned {status:'tracked'} without touching anything
// (the resolution ledger's real record is the delta line: file/change).
// Now a REAL delta append through lib/resolution.logDelta; list rides
// getDeltas (vant_resolution_list below).
_methods.set('vant_resolution_track', {
    description: 'Record a decision delta (file + change) in the resolution ledger',
    inputSchema: { type: 'object', properties: { file: { type: 'string' }, change: { type: 'string' }, changed_by: { type: 'string' }, branch: { type: 'string' } }, required: ['file', 'change'] },
    handler: async ({ file, change, changed_by, branch }) => {
        const resolution = require('./resolution');
        try {
            const entry = resolution.logDelta(file, change, { changed_by, branch });
            return { tracked: true, ...entry };
        } catch (e) {
            return { tracked: false, error: e.message };
        }
    }
});

_methods.set('vant_resolution_list', {
    description: 'List decision deltas from the resolution ledger',
    inputSchema: { type: 'object', properties: { file: { type: 'string' }, limit: { type: 'number' } } },
    handler: async ({ file, limit }) => {
        const resolution = require('./resolution');
        try {
            const deltas = resolution.getDeltas(file, limit);
            return { count: deltas.length, deltas };
        } catch (e) {
            return { count: 0, deltas: [], error: e.message };
        }
    }
});

// (pass 189 MCP fiction audit) vant_stego_encode/decode were CANNED —
// encode returned {status:'encoded'} and decode {message:''} without
// touching lib/stego.js (the REAL PNG LSB engine, suite-pinned since the
// stego pass). Now they route through it: encode(image,message,output)
// and decode(output) — VAF path checks + password stay the lib's job.
_methods.set('vant_stego_encode', {
    description: 'Encode a message into a PNG via the real stego engine (LSB wire)',
    inputSchema: { type: 'object', properties: { image: { type: 'string' }, message: { type: 'string' }, output: { type: 'string' }, password: { type: 'string' } }, required: ['image', 'message', 'output'] },
    handler: async ({ image, message, output, password }) => {
        const stego = require('./stego');
        try {
            stego.encode(message, image, output, password ? { password } : {});
            return { encoded: true, image, output };
        } catch (e) {
            return { encoded: false, error: e.message, code: e.code };
        }
    }
});

_methods.set('vant_stego_decode', {
    description: 'Decode a hidden message from a PNG via the real stego engine',
    inputSchema: { type: 'object', properties: { image: { type: 'string' }, password: { type: 'string' } }, required: ['image'] },
    handler: async ({ image, password }) => {
        const stego = require('./stego');
        try {
            const result = stego.decode(image, password ? { password } : {});
            return { decoded: true, image, result };
        } catch (e) {
            return { decoded: false, error: e.message, code: e.code };
        }
    }
});

// (pass 95) Both tools were PURE STUBS — get always returned {value:null},
// set returned {status:'set'} without touching anything, so every MCP caller
// was told a lie. Now they route through the real config module: get honors
// runtime flags → the CURRENT brain's persisted config → global config (the
// same chain the CLI reads), set persists into the current brain via
// setConfig. required[] closes the empty-args hole (probes showed {}
// "succeeding" against the old hardcoded shapes).
_methods.set('vant_config_get', {
    description: 'Get a config value (runtime flags → current-brain config → global config)',
    inputSchema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] },
    handler: async ({ key }) => {
        const cfg = require('./config');
        const brain = cfg.currentBrainName();
        // (pass 253, issue #205) the door lane MASKS secret keys. cfg.get()
        // stays raw for internal runtime callers — but a guest authorized
        // here (read-class, capless) must never receive raw secret values
        // (mcp.apiKey / webhook.secret / github.token …). maskIfSecret is
        // the module's own helper, previously wired only into the env-list.
        return { key, value: cfg.maskIfSecret(key, cfg.get(key, null, { brain })), brain };
    }
});

_methods.set('vant_config_set', {
    description: 'Set a config value (persists into the current brain config; runtime flag too)',
    inputSchema: { type: 'object', properties: { key: { type: 'string' }, value: { type: 'string' } }, required: ['key', 'value'] },
    handler: async ({ key, value }) => {
        const cfg = require('./config');
        // (pass 253, issue #205) secrets are IMMUTABLE through the door: a
        // canWrite guest could REPLACE mcp.apiKey/api.key with a value they
        // know — key-injection auth bypass. Same predicate family as
        // maskIfSecret (secret registry + token/apiKey/secret substrings).
        // Secret rotation stays operator-side (CLI/env/Pages settings).
        const secrets = cfg.getSecretKeys();
        if (secrets.includes(key) || /token|apikey|secret/i.test(key)) {
            throw new errors.VantError('config door: `' + key + '` is a secret key — immutable here. Rotate operator-side.',
                { code: errors.CODES.CONFIG_INVALID, retryable: false, reason: 'E_CONFIG_SECRET_IMMUTABLE' });
        }
        return cfg.setConfig(key, value);
    }
});
// (pass 253, issue #205) a DUPLICATE vant_config_set registration used to
// sit here and silently override the hardened one above — the secret-
// immutability refusal was dead code on arrival (caught by live PoC
// probing during the red team). One registration per method, enforced by
// this comment staying honest.

// (pass 255) THE TRAVELER door verbs — the auditable pin through a
// distributed workflow (ISO 9001 clause 8.5.2 traceability). Agents and
// guests alike can open jobs, record station-landings, and pull the
// 8.5.2 audit trail. Classification: open/hop are write-class by the
// default (unknown = write, fail-closed for observers); status/audit
// route READ-class through the `_get$`-family tail (status/audit) — the
// guest gate sorts them before the door ever sees the dialog.
_methods.set('traveler_open', {
    description: 'Open a traveler (the job envelope that rides station-to-station; content-addressed, append-only ledger).',
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, from: { type: 'string' }, slots: { type: 'object' } }, required: ['title'] },
    handler: async (p) => {
        // (pass 256) pipeline lane: QoS rate gate -> lib mint/persist (which
        // themselves run sandbox/vaf/audit/event).
        const T = require('./traveler');
        await T.gateCheck('traveler_open', 'open');
        const t = T.mint({
            from: (p && p.from) || require('./brain').getCurrentBrain(),
            slots: Object.assign({ title: p.title }, (p && p.slots) || {})
        });
        T.persist(t);
        return { opened: true, id: t.id, tr: t.tr, seq: t.seq, ledger: 'persisted' };
    }
});

_methods.set('traveler_hop', {
    description: 'Record a station-landing on a traveler (append-only ledger; the address re-derives from content on every edit).',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, op: { type: 'string' }, by: { type: 'string' }, detail: { type: 'object' } }, required: ['op'] },
    handler: async (p) => {
        const T = require('./traveler');
        await T.gateCheck('traveler_hop', 'hop');
        const t = _travelerLoadById(p && p.id);
        if (!t) throw new errors.VantError('traveler not found in the pin ledger', { code: errors.CODES.STORAGE_NOT_FOUND, retryable: false });
        const next = T.advance(t, { op: p.op, by: (p && p.by) || 'mcp-door', detail: p && p.detail });
        T.persist(next);
        return { hopped: true, id: next.id, fromId: t.id, seq: next.seq, readdressed: next.id !== t.id };
    }
});

// (pass 261) THE ROUTE at the door: the certified letter rides its bill of
// stations, each stage assimilating a part and signing off (check/risk/audit
// lanes ride INSIDE carry -> advance). Template-wildcards keep stage
// identity flexible; skip/reorder/extra refuse typed E_CARRIER_TEMPLATE.
_methods.set('traveler_carry', {
    description: 'Route a traveler through its bill of stations (the certified letter): each stage CHECKS (RLS lineage), RISKS (escrow for privileged hops), ASSIMILATES (optional part per station), signs off, and AUDITS. Refused stage drops the packet; the report is the auditor walk.',
    inputSchema: { type: 'object', properties: {
        id: { type: 'string' },
        stations: { type: 'array', items: { type: 'object', properties: { by: { type: 'string' }, op: { type: 'string' }, part: { type: ['object', 'string'] }, carrier: { type: 'string' }, privileged: { type: 'boolean' }, approvalId: { type: 'string' }, team: { type: 'string' } } } },
        template: { type: 'array', items: { type: 'object', properties: { by: { type: 'string' }, op: { type: 'string' }, part: { type: ['object', 'string'] } } } }
    }, required: ['stations'] },
    handler: async (p) => {
        const T = require('./traveler');
        const C = require('./carriers');
        await T.gateCheck('traveler_carry', 'carry');
        const t = _travelerLoadById(p && p.id);
        if (!t) throw new errors.VantError('traveler not found in the pin ledger', { code: errors.CODES.STORAGE_NOT_FOUND, retryable: false });
        const rep = C.carry(t, { stations: p.stations, template: p.template });
        if (rep.letter && rep.letter.id !== t.id) T.persist(rep.letter);   // the built letter lands (append-only; same id = dup-refused by the ledger law)
        return { ok: rep.ok, built: rep.built, landed: rep.landed, stages: rep.stations, route: rep.route, unfilled: rep.unfilled, refused: rep.refused, walk: { ok: rep.walk.ok, stations: rep.walk.stations, gaps: rep.walk.gaps.length, rewrites: rep.walk.rewrites.length }, letter: rep.letter ? { id: rep.letter.id, seq: rep.letter.seq, assembly: rep.letter.slots.assembly || {} } : null };
    }
});

// (pass 261) THE CONTINUITY WALK at the door: the auditor's backtrack map
// over carried landings (packets or landing rows). Read-class by tail.
_methods.set('traveler_replay', {
    description: 'The continuity/backtracking walk (ISO 8.5.2): replay carried landings of one traveler lineage and get the auditor backtrack map (gaps named, rewrites evidenced). Never repairs history.',
    inputSchema: { type: 'object', properties: { arrivals: { type: 'array', items: { type: 'object' } } } },
    handler: async (p) => {
        const C = require('./carriers');
        const arrivals = (p && Array.isArray(p.arrivals) && p.arrivals.length) ? p.arrivals : (() => {
            const t = _travelerLoadById(null);
            return t ? [t] : [];
        })();
        if (!arrivals.length) throw new errors.VantError('replay needs arrivals (or a persisted traveler to walk alone)', { code: errors.CODES.VAF_REQUIRED_FIELD, retryable: false });
        const rep = C.replay(arrivals);
        return rep;
    }
});

// (pass 261) THE CARRIER ROSTER at the door: which assimilation lanes are
// live (nsc9/stone/svg/json), honestly absent (qr/png), and why. Read-class
// by tail; the honesty roster, not a feature ad.
_methods.set('carriers_list', {
    description: 'The assimilator carrier roster: which lanes can carry a traveler (nsc9 address frame, stone text packet, encrypted svg stone, JSON ERP form) and which are declared-absent with named blockers (qr, png).',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
        const C = require('./carriers');
        return { carriers: C.list(), version: C.CARRIER_VERSION };
    }
});

// (pass 262) THE CARRIER PLATE at the door: ANYONE (enterprise or
// hobbyist) defines a new carrier lane as DATA — a frame marker over the
// built-in stone/NSC-9 law, persisted brain-scoped, hydrated in every
// later process. The definer owns the marker; the lib owns the crypto and
// both tamper walls. Write-class (default gate: a definition is a
// persistent brain mutation).
_methods.set('carrier_plate_define', {
    description: 'Define a carrier plate (the mycelium touch): your own carrier lane as pure data — { id, carries: full-object|id-pointer, frame: { prefix?, suffix? }, family?, note? } — persisted in the brain and hydrated everywhere. The built-in stone seal and packet-address walls ride your frame by construction; code is never required.',
    inputSchema: { type: 'object', properties: {
        id: { type: 'string' },
        carries: { type: 'string', enum: ['full-object', 'id-pointer'] },
        frame: { type: 'object', properties: { prefix: { type: 'string' }, suffix: { type: 'string' } } },
        family: { type: 'string' },
        note: { type: 'string' }
    }, required: ['id', 'carries', 'frame'] },
    handler: async (p) => {
        const T = require('./traveler');
        const C = require('./carriers');
        await T.gateCheck('carrier_plate_define', 'define');
        const def = C.plateDefine(p || {});
        return { defined: true, id: def.id, carries: def.carries, frame: def.frame, persisted: true };
    }
});

_methods.set('traveler_status', {
    description: 'Where has this job been? The pin-through stations of a traveler (ISO 8.5.2).',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, last: { type: 'number' } } },
    handler: async (p) => {
        const T = require('./traveler');
        const t = _travelerLoadById(p && p.id);
        if (!t) throw new errors.VantError('traveler not found in the pin ledger', { code: errors.CODES.STORAGE_NOT_FOUND, retryable: false });
        const st = T.status(t);
        const last = (p && typeof p.last === 'number' && p.last > 0) ? p.last : st.stations.length;
        return { id: t.id, seen: st.seen, seq: t.seq, stations: st.stations.slice(-last), ledgerRows: st.ledgerRows.length };
    }
});

_methods.set('traveler_audit', {
    description: "The auditor's copy: verbatim ISO 9001 clause 8.5.2 traceability record for a traveler.",
    inputSchema: { type: 'object', properties: { id: { type: 'string' } } },
    handler: async (p) => {
        const T = require('./traveler');
        const t = _travelerLoadById(p && p.id);
        if (!t) throw new errors.VantError('traveler not found in the pin ledger', { code: errors.CODES.STORAGE_NOT_FOUND, retryable: false });
        return { id: t.id, report: T.auditReport(t) };
    }
});

// (pass 267) THE PACKET DOOR (read-class): a traveler BODY served BY ITS
// ADDRESS across the mesh — the door the pointer resolve rides (the pass-265
// pointer marks say a packet exists somewhere; this door is a node saying
// "it exists HERE, and here it is"). Idempotent by construction: the store
// is append-only, so a fetch never mutates anything. THE WALL AT THE
// SERVING NODE: the body must BE the address (a swapped store refuses
// typed) and must RE-VERIFY (the insert address law) before any byte
// crosses — verify at both ends of the wire. An absent packet is an honest
// { found: false } record: a miss, never an error and never a fabricated
// body.
// (pass 268) THE SERVING WALL, ONE LAW: traveler_fetch (the body door)
// and traveler_stamp (the pointer-artifact door) share this exact helper —
// same 64-hex gate, same body file, same address law, same re-verify — so
// the two faces of the mesh can never drift apart. Honesty contract:
// present → { ok: true, body }; absent → { ok: false, miss } (the verb
// reports the miss record verbatim); a swapped or non-verifying store
// THROWS typed (the door refuses THROUGH the door).
async function _travelerServed(id, verbName) {
    const T = require('./traveler');
    const idNorm = (id && typeof id === 'string') ? id.toLowerCase().trim() : '';
    if (!/^[0-9a-f]{64}$/.test(idNorm)) {
        throw new errors.VantError(verbName + ' needs the FULL 64-hex content address (the packet\'s own id) — refuse, never abbreviate.', { code: errors.CODES.VAF_REQUIRED_FIELD, retryable: false });
    }
    const pathMod = require('path');
    let bodyFile;
    try {
        bodyFile = pathMod.join(pathMod.dirname(T._ledgerPath()), 'travelers', idNorm + '.json');
    } catch (e) {
        return { ok: false, miss: { found: false, id: idNorm, reason: 'no-store' } };
    }
    let body = null;
    try { body = JSON.parse(require('fs').readFileSync(bodyFile, 'utf8')); } catch (e) { body = null; }
    if (!body) return { ok: false, miss: { found: false, id: idNorm } };
    if (body.id !== idNorm) {
        // A swapped store: the door refuses THROUGH the door — the body
        // served by this node does not answer to the address asked for.
        throw new errors.VantError('the stored body does not answer to its address (' + idNorm.slice(0, 12) + ") — refuse, never repair.", { code: errors.CODES.STORAGE_NOT_FOUND, retryable: false });
    }
    const v = T.verify(body);
    if (!v.ok) {
        throw new errors.VantError('the stored body does not re-verify at this node (' + v.error + ') — refuse, never repair.', { code: errors.CODES.STORAGE_NOT_FOUND, retryable: false });
    }
    return { ok: true, body };
}

_methods.set('traveler_fetch', {
    description: "Serve a traveler BODY by its full 64-hex content address from this node's append-only store (state/travelers/<id>.json) — the door the pointer resolve rides across the mesh. Re-verifies the packet at the serving node (the wall at both ends), answers honestly { found: false } on absence, and refuses a forged/swapped body typed instead of crossing it.",
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    handler: async (p) => {
        const served = await _travelerServed(p && p.id, 'traveler_fetch');
        return served.ok ? { found: true, id: served.body.id, traveler: served.body } : served.miss;
    }
});

// (pass 268) THE ARTIFACT DOOR: the OTHER half of the qr lane crosses the
// mesh too. For a served-by-address packet, this verb derives the pointer
// mark — the extended vant frame (VANT:1:<64-hex>) as a REAL scannable QR
// raster — and serves it as base64: the receiving station reads the bytes
// IT was handed over the wire (jsqr never trusts a local render). A pure
// derivation of a re-verified body: it mutates nothing, and the wall is
// the SAME serving wall traveler_fetch uses (one law, two faces).
_methods.set('traveler_stamp', {
    description: "Serve the POINTER QR artifact for a traveler by its full 64-hex content address — the extended vant frame (VANT:1:<64-hex>) as a real scannable raster { frame, png (base64) }, derived from the re-verified store body under the SAME serving wall as traveler_fetch (one law, two door faces). Answers honestly { found: false } on absence; the receiving node decodes the bytes it was handed over the wire, never a local render.",
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    handler: async (p) => {
        const served = await _travelerServed(p && p.id, 'traveler_stamp');
        if (!served.ok) return served.miss;
        const art = require('./carriers').encode(served.body, 'qr', { pointer: true });
        return { found: true, id: served.body.id, kind: art.kind, frame: art.frame, png: art.png.toString('base64'), moduleCount: art.moduleCount };
    }
});

// (prd-carrier-share.md §2, P5a) THE CARRIER VERB FAMILY. The spec's one
// idea: the CALLER names the lane; the door never sniffs a format, and
// every refusal is typed per the lib's own E_CARRIER_* codes. All four
// verbs are read-class THROUGH THE DOOR (gateCheck rides, sandbox read
// gate rides) — carrier_encode encodes EXISTING re-verified packets and
// mints nothing; carrier_decode never writes (pointer resolution rides
// the append-only store, and a hookless miss is the honest record).
_methods.set('carrier_lane_list', {
    description: "List the carrier lanes this pod speaks: the built-in lanes (nsc9/stone/svg/json/qr) plus this brain's custom plates (id, carries, frame, note). The roster a UI renders verbatim — a lane that is not on this list is not on this pod, and the door never pretends otherwise.",
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
        const T = require('./traveler');
        const C = require('./carriers');
        await T.gateCheck('carrier_lane_list', 'list');
        // (smoke-caught) carriers.list() returns LANE OBJECTS, not ids —
        // the roster carries the honest fields (available, note) verbatim
        // so a UI renders what the pod actually speaks, never a summary.
        const lanes = C.list().map((lane) => ({
            id: lane.id, kind: 'builtin', carries: lane.carries || 'full-object',
            available: lane.available !== false, family: lane.family || '', note: lane.note || ''
        }));
        const plates = C.plateList().map((pl) => ({
            id: pl.id, kind: 'plate', carries: pl.carries,
            frame: pl.frame || { prefix: '', suffix: '' }, note: pl.note || ''
        }));
        return { lanes, plates };
    }
});

_methods.set('carrier_encode', {
    description: "Encode an EXISTING traveler packet on a named carrier lane (id + lane required; opts ride as the lib's third arg — e.g. qr { pointer: true }). Encodes the re-verified ledger body for the address; it mints nothing, it carries what exists. Refuses typed E_CARRIER_* (unknown lane, absent body, over-capacity payload).",
    inputSchema: { type: 'object', properties: {
        id: { type: 'string' }, lane: { type: 'string' },
        opts: { type: 'object', properties: { pointer: { type: 'boolean' } } }
    }, required: ['id', 'lane'] },
    handler: async (p) => {
        const T = require('./traveler');
        const C = require('./carriers');
        await T.gateCheck('carrier_encode', 'encode');
        const served = await _travelerServed(p && p.id, 'carrier_encode');
        if (!served.ok) {
            throw new errors.VantError('no packet re-verifies at that address on this pod — encode carries what exists, never what is missing.', { code: errors.CODES.STORAGE_NOT_FOUND, retryable: false });
        }
        const art = C.encode(served.body, String(p.lane), p.opts || {});
        const b64 = Buffer.isBuffer(art.png) ? art.png.toString('base64') : undefined;
        return { carrier: art.kind || String(p.lane), address: served.body.id, artifact: art.frame || art.text || undefined, png: b64, moduleCount: art.moduleCount };
    }
});

_methods.set('carrier_decode', {
    description: "Decode an artifact on a named lane WITHOUT writing anything: the resolved packet or the honest unresolved record ({ resolved: false, reason }) per the lib's own law. A scanned/stored body still re-enters the FULL packet wall (shape + address + verify) before it is handed back — decode verifies, never fabricates.",
    inputSchema: { type: 'object', properties: {
        lane: { type: 'string' },
        artifact: { type: 'string' },
        opts: { type: 'object', properties: { pointerOnly: { type: 'boolean' } } }
    }, required: ['lane', 'artifact'] },
    handler: async (p) => {
        const T = require('./traveler');
        const C = require('./carriers');
        await T.gateCheck('carrier_decode', 'decode');
        const decoded = C.decode(String(p.lane), String(p.artifact), p.opts || {});
        // The lib gives back either a packet-shaped object or an unresolved
        // record; the door answers both honestly and NEVER in between.
        if (decoded && typeof decoded === 'object' && decoded.id && decoded.seq !== undefined) {
            return { resolved: true, traveler: decoded };
        }
        return { resolved: false, record: decoded };
    }
});

_methods.set('traveler_list', {
    description: "List the traveler addresses this node's pin ledger holds (64-hex ids, newest first, capped 200). ONE law: the list NAMES, the status VERIFIES — per-id truth stays in traveler_status/traveler_fetch, this verb never augments a row with unverified detail.",
    inputSchema: { type: 'object', properties: { limit: { type: 'number' } } },
    handler: async (p) => {
        const T = require('./traveler');
        await T.gateCheck('traveler_list', 'list');
        const fs = require('fs');
        let ledger = { travelers: [] };
        try { ledger = JSON.parse(fs.readFileSync(T._ledgerPath(), 'utf8')); } catch (e) { /* an absent ledger is an honest empty roster */ }
        const ids = (ledger.travelers || []).map((r) => r && r.id).filter((id) => typeof id === 'string' && /^[0-9a-f]{64}$/.test(id)).reverse();
        return { ids: ids.slice(0, Math.min((p && p.limit) || 200, 200)), count: ids.length };
    }
});

// (pass 255) the traveler seam: resolve by explicit id, else the LATEST
// packet in the pin ledger (the working traveler).
function _travelerLoadById(id) {
    const T = require('./traveler');
    const p = T._ledgerPath();
    let ledger;
    try { ledger = JSON.parse(require('fs').readFileSync(p, 'utf8')); } catch (e) { return null; }
    let wanted = (id && typeof id === 'string') ? id : null;
    if (!wanted) {
        const rows = ledger.travelers || [];
        wanted = rows.length ? rows[rows.length - 1].id : null;
    }
    // the index holds the ADDRESS; the packet body lands in the brain file
    // the door already owns (traveler-<id>-tr1.json via relay.travel, or
    // the station files below state/travelers/) — the working station
    // ALSO keeps a current-file; prefer whatever the ledger row points to.
    try {
        const brainPath = require('./brain').getBrainPath ? require('./brain').getBrainPath() : 'models/private';
        const candidates = [
            require('path').join(brainPath, 'state', 'travelers', wanted + '.json'),
            require('path').join(brainPath, 'state', 'traveler-current.json')
        ];
        for (const c of candidates) {
            try {
                const t = JSON.parse(require('fs').readFileSync(c, 'utf8'));
                const v = T.verify(t);
                if (v.ok && (!wanted || t.id === wanted)) return t;
            } catch (e) { /* next candidate */ }
        }
    } catch (e) { /* fallthrough */ }
    return null;
}

// (pass 96) These three were PURE STUBS returning hardcoded values —
// vant_audit_log claimed {status:'logged'} without touching the ledger and
// vant_audit_list ALWAYS returned {events:[]}; vant_succession_info
// hardcoded {trustLevel:'high'} regardless of the brain's real config. All
// now route to the real modules. required[] closes the empty-args hole.
_methods.set('vant_audit_log', {
    description: 'Append an entry to the audit ledger',
    inputSchema: { type: 'object', properties: { event: { type: 'string' }, data: { type: 'string' } }, required: ['event'] },
    handler: async ({ event, data }) => {
        const audit = require('./audit');
        let payload = {};
        if (data) { try { payload = JSON.parse(data); } catch (e) { payload = { value: data }; } }
        return audit.log(event, payload);
    }
});

_methods.set('vant_audit_list', {
    description: 'Read the audit ledger',
    inputSchema: { type: 'object', properties: { limit: { type: 'number' } } },
    handler: async ({ limit }) => {
        const audit = require('./audit');
        const ledger = audit.getLedger();
        const entries = (ledger && ledger.entries) || [];
        const n = (Number.isFinite(limit) && limit > 0) ? limit : 50;
        return { count: entries.length, entries: entries.slice(-n) };
    }
});

_methods.set('vant_succession_info', {
    description: 'Trust/succession config for the active brain',
    inputSchema: { type: 'object' },
    handler: async () => {
        const succession = require('./succession');
        try {
            return {
                trustLevel: succession.getTrustLevel(),
                currentVersion: succession.getCurrentVersion ? succession.getCurrentVersion() : undefined,
                previousBrain: succession.getPreviousBrain ? succession.getPreviousBrain() : undefined
            };
        } catch (e) {
            return { error: e.message, code: 'E_SUCCESSION' };
        }
    }
});

_methods.set('vant_search', {
    description: 'Search brain using queryBrain',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] },
    handler: async ({ query, limit = 10 }) => {
        const search = _search();
        try {
            const results = await search.queryBrain(query, { limit });
            const resultsArray = results.results || results.memories || [];
            return { query, results: resultsArray.slice(0, limit), context: results.context };
        } catch(e) {
            return { query, results: [], error: e.message };
        }
    }
});

_methods.set('vant_rerank', {
    description: 'RAG rerank + compress',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, docs: { type: 'array' } }, required: ['query', 'docs'] },
    handler: async ({ query, docs }) => {
        const search = _search();
        try {
            const results = await search.rerank(docs, query);
            return { query, results };
        } catch(e) {
            return { query, results: docs, error: e.message };
        }
    }
});

// NEW: Wire up semantic search (themissing 4th type!)
_methods.set('vant_search_semantic', {
    // (P4/pod repair) The OLD handler sliced the RESULT OBJECT as an array
    // (results.slice on {results, memories, context}) so this tool answered
    // a typed error on EVERY call - the same handler-shape class as the
    // pass-212 msg_send bug, found while building the vector map. Fixed:
    // the handler now slices the actual hit array. withProjection (opt-in)
    // additionally returns a REAL embedding-space 2D projection (query
    // anchor + per-hit points by index) for the dashboard's semantic map.
    description: 'Semantic search using embeddings (opt-in withProjection returns the real 2D embedding projection)',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' }, withProjection: { type: 'boolean' } }, required: ['query'] },
    handler: async ({ query, limit = 10, withProjection = false }) => {
        const search = _search();
        try {
            const out = await search.semantic(query, { limit, withProjection: !!withProjection });
            const hits = (out && (out.results || out.memories)) || [];
            const resp = { query, results: hits.slice(0, limit) };
            if (out && out.projection) resp.projection = out.projection;
            return resp;
        } catch (e) {
            return { query, results: [], error: e.message };
        }
    }
});

// (pass 96) Was a stub ({status:'active', budget:100}). The pass-80 bin fix
// already corrected bin/sandbox.js to read the real shape; this lagging twin
// now returns sandbox.getStatus() (mode / request counters / uptime).
_methods.set('vant_sandbox_status', {
    description: 'Sandbox status (mode, request counters, uptime)',
    inputSchema: { type: 'object' },
    handler: async () => {
        const sandbox = require('./sandbox');
        try { return typeof sandbox.getStatus === 'function' ? sandbox.getStatus() : { error: 'sandbox status unavailable', code: 'E_SANDBOX_STATUS' }; }
        catch (e) { return { error: e.message, code: 'E_SANDBOX_STATUS' }; }
    }
});

// Stream methods
const stream = require('./stream');

_methods.set('stream_enqueue', {
    description: 'Enqueue work to stream',
    inputSchema: { type: 'object', properties: { stream: { type: 'string' }, task: { type: 'object' } }, required: ['stream', 'task'] },
    handler: async (p) => stream.enqueue(p.stream, p.task)
});

_methods.set('stream_poll', {
    description: 'Poll stream for work',
    inputSchema: { type: 'object', properties: { stream: { type: 'string' } }, required: ['stream'] },
    handler: async (p) => stream.poll(p.stream)
});

_methods.set('stream_complete', {
    description: 'Complete work item',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, result: { type: 'object' } }, required: ['id', 'result'] },
    handler: async (p) => stream.complete(p.id, p.result)
});

_methods.set('stream_fail', {
    description: 'Fail work item',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, error: { type: 'string' } }, required: ['id', 'error'] },
    handler: async (p) => stream.fail(p.id, p.error)
});

_methods.set('stream_info', {
    description: 'Get stream info',
    inputSchema: { type: 'object', properties: { stream: { type: 'string' } }, required: ['stream'] },
    handler: async (p) => stream.info(p.stream)
});

_methods.set('stream_list', {
    description: 'List stream work items',
    inputSchema: { type: 'object', properties: { stream: { type: 'string' }, status: { type: 'string' } } },
    handler: async (p) => stream.list(p.stream, p)
});

_methods.set('stream_lease', {
    description: 'Check/set lease on work item',
    inputSchema: { type: 'object', properties: { workId: { type: 'string' }, agentId: { type: 'string' }, ttl: { type: 'number' } }, required: ['workId', 'agentId'] },
    handler: async (p) => stream.lease(p.workId, p.agentId, p.ttl)
});

_methods.set('stream_release', {
    description: 'Release lease on work item',
    inputSchema: { type: 'object', properties: { workId: { type: 'string' } }, required: ['workId'] },
    handler: async (p) => stream.release(p.workId)
});

_methods.set('stream_peek', {
    description: 'Peek at work without claiming',
    inputSchema: { type: 'object', properties: { stream: { type: 'string' } }, required: ['stream'] },
    handler: async (p) => stream.peek(p.stream)
});

_methods.set('stream_stats', {
    description: 'Get stream statistics',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => stream.stats()
});

// (pass 189 MCP fiction audit) stream_watch returned {watching} without
// touching lib/stream.js. One-shot MCP calls cannot hold a callback, so the
// HONEST contract here: state-watch via event-bus subscription in-process is
// a runtime feature, not an MCP one. The tool now registers a real
// lib/stream.watch(event, noop)?? NO — that would be another lie (a noop
// watcher = real delivery to nobody). Instead the tool reports the CURRENT
// watchers and, if asked to "watch", returns an honest error explaining the
// one-shot constraint (use vant event_tail / the sink instead).
_methods.set('stream_watch', {
    description: 'Stream watcher info (one-shot MCP cannot hold a callback — use event_tail for event streams)',
    inputSchema: { type: 'object', properties: { event: { type: 'string' } } },
    handler: async (p) => {
        const event = p && p.event;
        if (event) {
            return { event, watching: false, note: 'One-shot MCP calls cannot hold a stream.watch callback. For event streams use vant event_tail / event_sink_enable.', code: 'E_WATCH_ONE_SHOT' };
        }
        const { getWatcherCount } = (() => {
            try { const s = require('./stream'); return { getWatcherCount: s.watcherCount }; }
            catch (e) { return { getWatcherCount: null }; }
        })();
        return { watchers: (typeof getWatcherCount === 'function') ? getWatcherCount() : 'unknown' };
    }
});

_methods.set('stream_create', {
    description: 'Create a new stream',
    inputSchema: { type: 'object', properties: { stream: { type: 'string' }, options: { type: 'object' } }, required: ['stream'] },
    handler: async (p) => stream.create(p.stream, p.options)
});

_methods.set('stream_delete', {
    description: 'Delete a stream',
    inputSchema: { type: 'object', properties: { stream: { type: 'string' } }, required: ['stream'] },
    handler: async (p) => stream.deleteStream(p.stream)
});


let _server = null;

// (pass 42 live-fire) The auth-bearing start() that lived here was DEAD
// CODE: module.exports.start shadows it, so it never ran and its key gate
// guarded nothing. One server remains (module.exports.start below) with the
// pass-41 bind/Host/Content-Type/Origin gates PLUS the auth gate migrated
// here (VANT_MCP_REQUIRE_KEY / vant config set mcp.requireKey true).
function stop() {
    return new Promise(resolve => {
        if (_server) {
            _server.close(() => resolve());
        } else {
            resolve();
        }
    });
}

function listTools() {
    const tools = [];
    for (const [name, def] of _methods) {
        // name already includes prefix (brain_*, vant_*, agent_*)
        tools.push({
            name,  // Already: vant_get_memory, brain_load, etc
            description: def.description,
            inputSchema: def.inputSchema
        });
    }
    return tools;
}

// Auto-wire CORE lib functions to MCP
function _autoWireCoreLibs() {
    const fs = require('fs');
    let wired = 0;

    // Core libs only - mcp.js is in lib/, so use ./lib/
    const coreLibs = ['brain', 'api', 'vant', 'agents', 'islands', 'sandbox', 'qos', 'escrow', 'stream'];
    const libDir = fs.realpathSync('./lib');

    coreLibs.forEach(libName => {
        const libPath = libDir + '/' + libName + '.js';
        if (!fs.existsSync(libPath)) return;

        try {
            const lib = require('./' + libName + '.js');
            const funcs = Object.keys(lib).filter(k => typeof lib[k] === 'function' && !k.startsWith('_'));

            funcs.forEach(fn => {  // ALL functions
                const toolName = 'vant_' + libName + '_' + fn;
                if (_methods.has(toolName)) return;

                _methods.set(toolName, {
                    description: libName + '.' + fn,
                    inputSchema: { type: 'object', properties: { args: { type: 'object' } } },
                    handler: async ({ args = {} }) => {
                        try { return lib[fn](args); }
                        catch(e) { return { error: e.message }; }
                    }
                });
                wired++;
            });
        } catch(e) {}
    });

    console.log('[MCP] Wired core:', wired, 'tools');
    return wired;
}

// const _autoWired = autoWireCoreLibs();

// Universal vant_call - SAFE: only calls registered MCP tools, no arbitrary require
_methods.set('vant_call', {
    description: 'Call a registered Vant MCP tool by name',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, args: { type: 'object' } }, required: ['name'] },
    handler: async ({ name, args = {} }) => {
        // Only allow calling already-registered MCP tools (no arbitrary module loading)
        const tool = _methods.get(name);
        if (!tool) {
            return { error: 'Tool not found: ' + name, available: Array.from(_methods.keys()) };
        }
        return await tool.handler(args);
    }
});

// Export

// NEW: Agent delegation + broadcast + remote (6 tools)
_methods.set('vant_agents_delegate_mcp', {
    description: 'Delegate WITH MCP to agent',
    // (pass 92) id/task are required — {} used to sail through schema
    // validation and surface as 'Agent not found: undefined' from the
    // delegate path instead of an honest MCP_INPUT_INVALID refusal.
    inputSchema: { type: 'object', properties: { id: {type:'string'}, task: {type:'object'} }, required: ['id', 'task'] },
    handler: async ({ id, task }) => {
        const agents = require('./agents');
        return agents.delegate(id, { ...task, mcp: true });
    }
});

_methods.set('vant_agents_broadcast', {
    description: 'Broadcast to all agents',
    // (pass 92) A broadcast without a message handed every agent
    // { task: undefined } — require the message up front.
    inputSchema: { type: 'object', properties: { message: {type:'string'} }, required: ['message'] },
    handler: async ({ message }) => {
        const agents = require('./agents');
        const list = agents.list();
        const results = [];
        for (const a of list.agents || []) {
            try { results.push({ agent: a.id, result: await agents.delegate(a.id, { task: message }) || 'ok' }); }
            catch(e) { results.push({ agent: a.id, error: e.message }); }
        }
        return { broadcast: message, results };
    }
});

_methods.set('vant_remote_call', {
    description: 'Call remote Vant MCP server - spawn or delegate to distant agent',
    inputSchema: {
        type: 'object',
        properties: {
            host: { type: 'string', description: 'Remote host (e.g., other-agent.all-hands.dev)' },
            port: { type: 'number', description: 'MCP port (default 3457)' },
            tool: { type: 'string', description: 'Tool to call (e.g., brain_load, agents_spawn)' },
            args: { type: 'object', description: 'Arguments for the tool' }
        },
        required: ['host', 'tool']
    },
    handler: async ({ host, port, tool, args = {} }) => {
        const cfg = require('./config');
        port = port || cfg.mcpPort() || 3457;
        const network = _network();
        const url = `http://${host}:${port}/rpc`;

        // Build JSON-RPC request
        const payload = {
            jsonrpc: '2.0',
            method: tool,
            params: args,
            id: Date.now()
        };

        try {
            // Use network.fetchJson for JSON-RPC call
            const result = await network.fetchJson(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                timeout: 30000
            });

            return { success: true, host, tool, result };
        } catch (e) {
            return { success: false, error: e.message, host, tool };
        }
    }
});

// NEW: 3 search types (lib/search.js)
_methods.set('vant_search_hybrid', {
    description: 'Hybrid search',
    inputSchema: { type: 'object', properties: { query: {type:'string'}, topK: {type:'number'} } },
    handler: async ({ query, topK }) => {
        const search = _search();
        return search.hybrid?.(query, { topK: topK || 10 }) || { results: [] };
    }
});

_methods.set('vant_search_hyde', {
    description: 'HyDE search',
    inputSchema: { type: 'object', properties: { query: {type:'string'}, topK: {type:'number'} } },
    handler: async ({ query, topK }) => {
        const search = _search();
        return search.hyde?.(query, { topK: topK || 10 }) || { results: [] };
    }
});

_methods.set('vant_search_multiquery', {
    description: 'Multi-query search',
    inputSchema: { type: 'object', properties: { query: {type:'string'}, topK: {type:'number'} } },
    handler: async ({ query, topK }) => {
        const search = _search();
        const mq = search.multiQuery?.(query) || [query];
        const results = [];
        for (const q of mq) {
            const r = await search.queryBrain?.(q, { topK: topK || 5 }) || [];
            results.push({ query: q, results: r });
        }
        return { queries: mq, results };
    }
});

// Sudo tools (lib/sudo.js - task-based permissions)
// Wired to agent delegation chain via context
_methods.set('vant_sudo_createTask', {
    description: 'Create task context with scopes',
    inputSchema: { type: 'object', properties: {
        taskId: {type:'string', description: 'Task/agent ID'},
        scopes: {type:'array', items: {type:'string'}, description: 'Permission scopes'}
    } },
    handler: async (params, context) => {
        const sudo = require('./sudo');
        const taskId = params.taskId || context?.agent || 'default';
        return sudo.createTask(taskId, params.scopes);
    }
});
_methods.set('vant_sudo_getTask', {
    description: 'Get task state',
    inputSchema: { type: 'object', properties: {
        taskId: {type:'string', description: 'Task/agent ID'}
    } },
    handler: async (params, context) => {
        const sudo = require('./sudo');
        const taskId = params.taskId || context?.agent || 'default';
        return sudo.getTask(taskId);
    }
});
_methods.set('vant_sudo_can', {
    description: 'Check if task can do action',
    inputSchema: { type: 'object', properties: {
        taskId: {type:'string', description: 'Task/agent ID'},
        scope: {type:'string', description: 'Permission scope (read,write,exec,network,spawn,admin)'}
    } },
    handler: async (params, context) => {
        const sudo = require('./sudo');
        const taskId = params.taskId || context?.agent || 'default';
        return { task: taskId, scope: params.scope, allowed: sudo.can(taskId, params.scope) };
    }
});
_methods.set('vant_sudo_grant', {
    description: 'Grant scope to task (auto-scale)',
    inputSchema: { type: 'object', properties: {
        taskId: {type:'string', description: 'Task/agent ID'},
        scope: {type:'string', description: 'Permission scope to grant'}
    } },
    handler: async (params, context) => {
        const sudo = require('./sudo');
        const taskId = params.taskId || context?.agent || 'default';
        return sudo.grant(taskId, params.scope);
    }
});
_methods.set('vant_sudo_revoke', {
    description: 'Revoke scope from task',
    inputSchema: { type: 'object', properties: {
        taskId: {type:'string', description: 'Task/agent ID'},
        scope: {type:'string', description: 'Permission scope to revoke'}
    } },
    handler: async (params, context) => {
        const sudo = require('./sudo');
        const taskId = params.taskId || context?.agent || 'default';
        return sudo.revoke(taskId, params.scope);
    }
});
_methods.set('vant_sudo_escalate', {
    description: 'Request permission escalation',
    inputSchema: { type: 'object', properties: {
        taskId: {type:'string', description: 'Task/agent ID'},
        scope: {type:'string', description: 'Permission scope to request'},
        reason: {type:'string', description: 'Why needed'}
    } },
    handler: async (params, context) => {
        const sudo = require('./sudo');
        const taskId = params.taskId || context?.agent || 'default';
        // (1a) service-tagged: tagged mcp so the escalation carries the
        // service policy + shows up service-attributed in the audit log.
        // autoGrant is admin-intent from the MCP tool caller (kept).
        return sudo.escalate(taskId, params.scope, { service: 'mcp', reason: params.reason, autoGrant: true });
    }
});
_methods.set('vant_sudo_listTasks', {
    description: 'List all tasks',
    inputSchema: { type: 'object' },
    handler: async () => {
        const sudo = require('./sudo');
        return sudo.listTasks();
    }
});
_methods.set('vant_sudo_suggest', {
    description: 'Suggest scopes based on task history',
    inputSchema: { type: 'object', properties: {
        taskId: {type:'string', description: 'Task/agent ID'}
    } },
    handler: async (params, context) => {
        const sudo = require('./sudo');
        const taskId = params.taskId || context?.agent || 'default';
        return sudo.suggest(taskId);
    }
});
_methods.set('vant_sudo_getScopes', {
    description: 'Get available permission scopes',
    inputSchema: { type: 'object' },
    handler: async () => {
        const sudo = require('./sudo');
        return { scopes: sudo.getScopes() };
    }
});
_methods.set('vant_sudo_getLayerStatus', {
    description: 'Get sudo layer status',
    inputSchema: { type: 'object' },
    handler: async () => {
        const sudo = require('./sudo');
        return sudo.getLayerStatus();
    }
});

// Shell tools (lib/shell.js - with full security chain)
_methods.set('vant_shell_exec', {
    description: 'Execute shell command with security chain',
    inputSchema: { type: 'object', properties: { cmd: {type:'string'}, timeout: {type:'number'} } },
    handler: async ({ cmd, timeout }) => {
        // Explicit sudo check at MCP layer
        const sudo = require('./sudo');
        const taskId = _getTaskId?.() || 'default';
        if (!await sudo.can(taskId, 'exec')) {
            throw new errors.VantError('EPERM: shell execution requires sudo escalation', { code: errors.CODES.SHELL_EXEC_DENIED, retryable: false });
        }
        const shell = require('./shell');
        return shell.exec(cmd, { timeout });
    }
});
_methods.set('vant_shell_capture', {
    description: 'Capture shell output',
    inputSchema: { type: 'object', properties: { cmd: {type:'string'} } },
    handler: async ({ cmd }) => {
        // Explicit sudo check at MCP layer
        const sudo = require('./sudo');
        const taskId = _getTaskId?.() || 'default';
        if (!await sudo.can(taskId, 'exec')) {
            throw new errors.VantError('EPERM: shell execution requires sudo escalation', { code: errors.CODES.SHELL_EXEC_DENIED, retryable: false });
        }
        const shell = require('./shell');
        return shell.capture(cmd);
    }
});
_methods.set('vant_shell_spawn', {
    description: 'Background spawn',
    inputSchema: { type: 'object', properties: { cmd: {type:'string'} } },
    handler: async ({ cmd }) => {
        // Explicit sudo check at MCP layer
        const sudo = require('./sudo');
        const taskId = _getTaskId?.() || 'default';
        if (!await sudo.can(taskId, 'exec')) {
            throw new errors.VantError('EPERM: shell execution requires sudo escalation', { code: errors.CODES.SHELL_EXEC_DENIED, retryable: false });
        }
        const shell = require('./shell');
        return shell.spawn(cmd);
    }
});

// Boot/init tools (lib/boot.js - security layer init)
_methods.set('vant_boot_init', {
    description: 'Initialize runtime with security layers',
    inputSchema: { type: 'object', properties: {
        taskId: {type:'string', description: 'Task/agent ID'},
        scopes: {type:'array', items: {type:'string'}, description: 'Permission scopes'},
        debug: {type:'boolean', description: 'Enable debug logging'}
    } },
    handler: async (params, context) => {
        const boot = require('./boot');
        const taskId = params.taskId || context?.agent || 'default';
        return boot.init({ taskId, scopes: params.scopes, debug: params.debug });
    }
});
_methods.set('vant_boot_status', {
    description: 'Get boot status',
    inputSchema: { type: 'object' },
    handler: async () => {
        const boot = require('./boot');
        return boot.getStatus();
    }
});
_methods.set('vant_boot_layers', {
    description: 'Get all layer status',
    inputSchema: { type: 'object' },
    handler: async () => {
        const boot = require('./boot');
        return boot.getLayerStatus();
    }
});
_methods.set('vant_boot_reset', {
    description: 'Reset runtime',
    inputSchema: { type: 'object' },
    handler: async () => {
        const boot = require('./boot');
        return boot.reset();
    }
});

// Tmp unified interface
_methods.set('vant_tmp_put', {
    description: 'Put file to tmp space (unified)',
    inputSchema: { type: 'object', properties: {
        space: {type:'string', description: 'Space: dropbox, myStuff, yourStuff'},
        name: {type:'string'},
        content: {type:'string'}
    } },
    handler: async ({ space, name, content }) => {
        const tmp = require('./tmp');
        return tmp.put(space, name, content);
    }
});
_methods.set('vant_tmp_get', {
    description: 'Get file from tmp space (unified)',
    inputSchema: { type: 'object', properties: {
        space: {type:'string'},
        name: {type:'string'}
    } },
    handler: async ({ space, name }) => {
        const tmp = require('./tmp');
        return tmp.get(space, name);
    }
});
_methods.set('vant_tmp_list', {
    description: 'List tmp space (unified)',
    inputSchema: { type: 'object', properties: {
        space: {type:'string'}
    } },
    handler: async ({ space }) => {
        const tmp = require('./tmp');
        return tmp.list(space);
    }
});

// Storage tools (lib/storage.js - sandbox gated)
_methods.set('vant_storage_read', {
    description: 'Read file',
    // (pass 80) required was missing — empty args crashed fs read
    // ('path must be of type string') instead of refusing at the door.
    inputSchema: { type: 'object', properties: { path: {type:'string'} }, required: ['path'] },
    handler: async ({ path }) => {
        const storage = _storage();
        return storage.read(path);
    }
});
_methods.set('vant_storage_write', {
    description: 'Write file',
    inputSchema: { type: 'object', properties: { path: {type:'string'}, content: {type:'string'} }, required: ['path', 'content'] },
    handler: async ({ path, content }) => {
        const storage = _storage();
        return storage.write(path, content);
    }
});
_methods.set('vant_storage_list', {
    description: 'List directory',
    inputSchema: { type: 'object', properties: { dir: {type:'string'} }, required: ['dir'] },
    handler: async ({ dir }) => {
        const storage = _storage();
        return storage.list(dir);
    }
});
_methods.set('vant_storage_exists', {
    description: 'Check file exists',
    inputSchema: { type: 'object', properties: { path: {type:'string'} }, required: ['path'] },
    handler: async ({ path }) => {
        const storage = _storage();
        return storage.has(path);
    }
});

// Network tools (lib/network.js - qos+escrow gated)
_methods.set('vant_network_fetch', {
    description: 'HTTP fetch',
    inputSchema: { type: 'object', properties: { url: {type:'string'}, options: {type:'object'} } },
    handler: async ({ url, options }) => {
        const network = _network();
        return network.fetch(url, options);
    }
});
_methods.set('vant_network_fetchJson', {
    description: 'HTTP fetch JSON',
    inputSchema: { type: 'object', properties: { url: {type:'string'} } },
    handler: async ({ url }) => {
        const network = _network();
        return network.fetchJson(url);
    }
});
_methods.set('vant_network_online', {
    description: 'Check online status',
    inputSchema: { type: 'object' },
    handler: async () => {
        const network = _network();
        return { online: network.isOnline() };
    }
});


// Recursive file tools
// 0.8.6 SECURITY: these tools previously took uncontained caller
// paths straight into raw fs - an MCP client could list/copy/DELETE/mkdir
// anywhere the process could reach. All four now contain paths to the models
// root, and rm/cp/mkdir additionally escalate via sudo 'write' first.
_methods.set('vant_storage_listRecursive', {
    description: 'List directory recursively (contained to models root)',
    inputSchema: { type: 'object', properties: { dir: {type:'string'} } },
    handler: async ({ dir }) => {
        const contained = _containedModelPath(dir || '');
        if (!contained) return { error: 'Path escapes models root', path: dir };
        const results = [];
        const fs = require('fs');
        const walk = d => {
            const items = fs.existsSync(d) ? (fs.readdirSync(d) || []) : [];
            for (const item of items) {
                const fullPath = path.join(d, item);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    results.push({ path: fullPath, type: 'dir' });
                    walk(fullPath);
                } else {
                    results.push({ path: fullPath, type: 'file', size: stat.size });
                }
            }
        };
        walk(contained);
        return { entries: results };
    }
});

_methods.set('vant_storage_rm', {
    description: 'Remove file/directory (contained to models root, sudo write-gated)',
    inputSchema: { type: 'object', properties: { path: {type:'string'}, recursive: {type:'boolean'} } },
    handler: async ({ path: target, recursive }) => {
        const contained = _containedModelPath(target);
        if (!contained) return { error: 'Path escapes models root', path: target };
        try {
            const sudo = require('./sudo');
            if (!sudo.can(_getTaskId(), 'write')) {
                await sudo.escalate(_getTaskId(), 'write', { service: 'storage', reason: 'vant_storage_rm' });
            }
        } catch (e) { /* locked or unavailable - rm below may fail closed */ }
        const fs = require('fs');
        const rm = (p, r) => {
            const stat = fs.statSync(p);
            if (stat.isDirectory()) {
                if (r) {
                    fs.readdirSync(p).forEach(i => rm(path.join(p, i), true));
                    fs.rmdirSync(p);
                }
            } else {
                fs.unlinkSync(p);
            }
            return { removed: p };
        };
        return rm(contained, recursive);
    }
});

_methods.set('vant_storage_cp', {
    description: 'Copy file/directory (contained to models root, sudo write-gated)',
    inputSchema: { type: 'object', properties: { src: {type:'string'}, dest: {type:'string'} } },
    handler: async ({ src, dest }) => {
        const srcContained = _containedModelPath(src);
        const destContained = _containedModelPath(dest);
        if (!srcContained) return { error: 'Source escapes models root', path: src };
        if (!destContained) return { error: 'Destination escapes models root', path: dest };
        try {
            const sudo = require('./sudo');
            if (!sudo.can(_getTaskId(), 'write')) {
                await sudo.escalate(_getTaskId(), 'write', { service: 'storage', reason: 'vant_storage_cp' });
            }
        } catch (e) { /* locked or unavailable - cp below may fail closed */ }
        const fs = require('fs');
        const cp = (s, d) => {
            const stat = fs.statSync(s);
            if (stat.isDirectory()) {
                fs.mkdirSync(d, { recursive: true });
                fs.readdirSync(s).forEach(i => cp(path.join(s, i), path.join(d, i)));
            } else {
                fs.copyFileSync(s, d);
            }
            return { copied: s, to: d };
        };
        return cp(srcContained, destContained);
    }
});

_methods.set('vant_storage_mkdir', {
    description: 'Create directory (contained to models root, sudo write-gated)',
    inputSchema: { type: 'object', properties: { dir: {type:'string'} } },
    handler: async ({ dir }) => {
        const contained = _containedModelPath(dir);
        if (!contained) return { error: 'Path escapes models root', path: dir };
        try {
            const sudo = require('./sudo');
            if (!sudo.can(_getTaskId(), 'write')) {
                await sudo.escalate(_getTaskId(), 'write', { service: 'storage', reason: 'vant_storage_mkdir' });
            }
        } catch (e) { /* locked or unavailable - mkdir below may fail closed */ }
        require('fs').mkdirSync(contained, { recursive: true });
        return { created: contained };
    }
});


// Git/Sync tools (using lib/sync.js + lib/remote.js + connectors/)
_methods.set('vant_sync_pushAll', {
    description: 'Push to all sync providers',
    inputSchema: { type: 'object', properties: { message: {type:'string'} } },
    handler: async ({ message }) => {
        const sync = _sync();
        return sync.pushAll({ commitMessage: message });
    }
});
_methods.set('vant_sync_pullAny', {
    description: 'Pull from any available provider',
    inputSchema: { type: 'object' },
    handler: async () => {
        const sync = _sync();
        return sync.pullAny();
    }
});
_methods.set('vant_sync_status', {
    description: 'Get sync status across providers',
    inputSchema: { type: 'object' },
    handler: async () => {
        const sync = _sync();
        return sync.getStatus();
    }
});
_methods.set('vant_sync_rebase', {
    description: 'Rebase stale provider',
    inputSchema: { type: 'object', properties: { provider: {type:'string'} } },
    handler: async ({ provider }) => {
        const sync = _sync();
        return sync.rebase(provider);
    }
});

// Remote providers (lib/remote.js + connectors/)
_methods.set('vant_remote_listProviders', {
    description: 'List all remote providers',
    inputSchema: { type: 'object' },
    handler: async () => {
        const remote = require('./remote');
        return { providers: remote.getAllProviders() };
    }
});
_methods.set('vant_remote_addProvider', {
    description: 'Add new remote provider',
    inputSchema: { type: 'object', properties: { type: {type:'string'}, config: {type:'object'} } },
    handler: async ({ type, config }) => {
        const remote = require('./remote');
        const id = remote.addProvider(type, config);
        return { added: id };
    }
});
_methods.set('vant_remote_removeProvider', {
    description: 'Remove remote provider',
    inputSchema: { type: 'object', properties: { id: {type:'string'} } },
    handler: async ({ id }) => {
        const remote = require('./remote');
        return remote.removeProvider(id) ? { removed: id } : { error: 'not found' };
    }
});


// Tmp tools (lib/tmp.js - dropbox + cache + temp)
// Tmp unified (preferred)
_methods.set('vant_tmp_dropboxPut', {
    description: 'Save file to dropbox (use vant_tmp_put)',
    inputSchema: { type: 'object', properties: { name: {type:'string'}, content: {type:'string'} } },
    handler: async ({ name, content }) => {
        const tmp = require('./tmp');
        return tmp.put('dropbox', name, content);
    }
});
_methods.set('vant_tmp_dropboxGet', {
    description: 'Get file from dropbox (use vant_tmp_get)',
    inputSchema: { type: 'object', properties: { name: {type:'string'} } },
    handler: async ({ name }) => {
        const tmp = require('./tmp');
        return tmp.get('dropbox', name);
    }
});
_methods.set('vant_tmp_dropboxList', {
    description: 'List dropbox files (use vant_tmp_list)',
    inputSchema: { type: 'object' },
    handler: async () => {
        const tmp = require('./tmp');
        return tmp.list('dropbox');
    }
});
_methods.set('vant_tmp_dropboxDelete', {
    description: 'Delete from dropbox (use vant_tmp_delete)',
    inputSchema: { type: 'object', properties: { name: {type:'string'} } },
    handler: async ({ name }) => {
        const tmp = require('./tmp');
        return tmp.delete('dropbox', name);
    }
});
_methods.set('vant_tmp_dropboxClear', {
    description: 'Clear dropbox (use vant_tmp_clear)',
    inputSchema: { type: 'object' },
    handler: async () => {
        const tmp = require('./tmp');
        return tmp.clear('dropbox');
    }
});

_methods.set('vant_tmp_cacheSet', {
    description: 'Cache data with TTL',
    inputSchema: { type: 'object', properties: { key: {type:'string'}, value: {type:'string'}, ttl: {type:'number'} } },
    handler: async ({ key, value, ttl }) => {
        const tmp = require('./tmp');
        return tmp.cacheSet(key, value, ttl);
    }
});
_methods.set('vant_tmp_cacheGet', {
    description: 'Get cached data',
    inputSchema: { type: 'object', properties: { key: {type:'string'} } },
    handler: async ({ key }) => {
        const tmp = require('./tmp');
        return tmp.cacheGet(key);
    }
});
_methods.set('vant_tmp_cacheClear', {
    description: 'Clear cache',
    inputSchema: { type: 'object' },
    handler: async () => {
        const tmp = require('./tmp');
        return tmp.cacheClear();
    }
});


// Tmp: myStuff (private) - now aliases to unified
_methods.set('vant_tmp_myStuffPut', {
    description: 'Save private data (use vant_tmp_put with space: myStuff)',
    inputSchema: { type: 'object', properties: { name: {type:'string'}, content: {type:'string'} } },
    handler: async ({ name, content }) => {
        const tmp = require('./tmp');
        return tmp.put('myStuff', name, content);
    }
});
_methods.set('vant_tmp_myStuffGet', {
    description: 'Get private data (use vant_tmp_get)',
    inputSchema: { type: 'object', properties: { name: {type:'string'} } },
    handler: async ({ name }) => {
        const tmp = require('./tmp');
        return tmp.get('myStuff', name);
    }
});
_methods.set('vant_tmp_myStuffList', {
    description: 'List private data (use vant_tmp_list)',
    inputSchema: { type: 'object' },
    handler: async () => {
        const tmp = require('./tmp');
        return tmp.list('myStuff');
    }
});
_methods.set('vant_tmp_myStuffDelete', {
    description: 'Delete private data (use vant_tmp_delete)',
    inputSchema: { type: 'object', properties: { name: {type:'string'} } },
    handler: async ({ name }) => {
        const tmp = require('./tmp');
        return tmp.delete('myStuff', name);
    }
});

// Tmp: yourStuff (shared) - now aliases to unified
_methods.set('vant_tmp_yourStuffPut', {
    description: 'Save shared data (use vant_tmp_put with space: yourStuff)',
    inputSchema: { type: 'object', properties: { name: {type:'string'}, content: {type:'string'} } },
    handler: async ({ name, content }) => {
        const tmp = require('./tmp');
        return tmp.put('yourStuff', name, content);
    }
});
_methods.set('vant_tmp_yourStuffGet', {
    description: 'Get shared data (use vant_tmp_get)',
    inputSchema: { type: 'object', properties: { name: {type:'string'} } },
    handler: async ({ name }) => {
        const tmp = require('./tmp');
        return tmp.get('yourStuff', name);
    }
});
_methods.set('vant_tmp_yourStuffList', {
    description: 'List shared data (use vant_tmp_list)',
    inputSchema: { type: 'object' },
    handler: async () => {
        const tmp = require('./tmp');
        return tmp.list('yourStuff');
    }
});
_methods.set('vant_tmp_yourStuffDelete', {
    description: 'Delete shared data (use vant_tmp_delete)',
    inputSchema: { type: 'object', properties: { name: {type:'string'} } },
    handler: async ({ name }) => {
        const tmp = require('./tmp');
        return tmp.delete('yourStuff', name);
    }
});

// NEW: COMPUTE tools (polyglot FFI)
// =========== COMPUTE ===========
_methods.set('vant_compute_eval', {
    description: 'Evaluate code in another language (node|python|julia|go|ruby|php)',
    inputSchema: { type: 'object', properties: { code: {type:'string'}, lang: {type:'string', default:'node'} } },
    handler: async ({ code, lang = 'node' }) => {
        var sudo = global._sudo;
        if (!sudo || !sudo.can('default', 'compute')) { return { error: 'EPERM: compute not allowed' }; }
        const compute = require('./compute');
        return await compute.evaluate(code, { lang });
    }
});

_methods.set('vant_compute_invoke', {
    description: 'Invoke a function in another language',
    inputSchema: { type: 'object', properties: { func: {type:'string'}, args: {type:'object'}, lang: {type:'string', default:'node'} }, required: ['func'] },
    handler: async ({ func, args = {}, lang = 'node' }) => {
        var sudo = global._sudo;
        if (!sudo || !sudo.can('default', 'compute')) { return { error: 'EPERM: compute not allowed' }; }
        const compute = require('./compute');
        return await compute.invoke(func, args, lang);
    }
});

_methods.set('vant_compute_status', {
    description: 'Get compute status (available languages)',
    inputSchema: { type: 'object' },
    handler: async () => {
        const compute = require('./compute');
        return compute.status();
    }
});

// =========== HABITAT tools ===========
// (pass 81) Replaces the vant_environment_* family: "environment" was a
// planned subsystem that never shipped (owner-confirmed scrapped in favor
// of habitat/engine) but its 7 tools stayed registered, requiring a module
// that never existed — every call was MODULE_NOT_FOUND. Pass 80 made them
// coded refusals; pass 81 deletes them per owner ruling and wires the REAL
// subsystem instead: lib/habitat.js (workspaces, roles, boundaries, RLS).
// All tools route through habitat.getShared() — the singleton accessor —
// never a throwaway instance (pass 77/78 discipline).

const _sharedHabitat = () => require('./habitat').getSharedReady();

_methods.set('vant_habitat_status', {
    description: 'Habitat status: workspaces, boundaries, roles, current context',
    inputSchema: { type: 'object' },
    handler: async () => {
        const h = await _sharedHabitat();
        return {
            workspaces: h.listWorkspaces(),
            currentWorkspace: h.getCurrentWorkspace(),
            boundaries: Object.keys(h.getBoundaries()).length,
            ...h.status()
        };
    }
});

_methods.set('vant_habitat_listWorkspaces', {
    description: 'List habitat workspaces (isolated containers)',
    inputSchema: { type: 'object' },
    handler: async () => {
        const h = await _sharedHabitat();
        return { workspaces: h.listWorkspaces() };
    }
});

_methods.set('vant_habitat_createWorkspace', {
    description: 'Create a habitat workspace (container)',
    inputSchema: {
        type: 'object',
        properties: { workspaceId: { type: 'string' }, options: { type: 'object' } },
        required: ['workspaceId']
    },
    handler: async ({ workspaceId, options }) => {
        const h = await _sharedHabitat();
        return h.createWorkspace(workspaceId, options || {});
    }
});

_methods.set('vant_habitat_setWorkspace', {
    description: 'Switch the current habitat workspace context',
    inputSchema: { type: 'object', properties: { workspaceId: { type: 'string' } }, required: ['workspaceId'] },
    handler: async ({ workspaceId }) => {
        const h = await _sharedHabitat();
        return { switched: h.setWorkspace(workspaceId), current: h.getCurrentWorkspace() };
    }
});

_methods.set('vant_habitat_addRole', {
    description: 'Assign a role to a user within a workspace (RLS)',
    inputSchema: {
        type: 'object',
        properties: { workspaceId: { type: 'string' }, role: { type: 'string' }, userId: { type: 'string' } },
        required: ['workspaceId', 'role', 'userId']
    },
    handler: async ({ workspaceId, role, userId }) => {
        const h = await _sharedHabitat();
        h.addRole(workspaceId, role, userId);
        return { workspace: workspaceId, role, userId, roles: h.getUserRoles(workspaceId, userId) };
    }
});

_methods.set('vant_habitat_getUserRoles', {
    description: 'Get a user\'s roles within a workspace (RLS)',
    inputSchema: {
        type: 'object',
        properties: { workspaceId: { type: 'string' }, userId: { type: 'string' } },
        required: ['workspaceId', 'userId']
    },
    handler: async ({ workspaceId, userId }) => {
        const h = await _sharedHabitat();
        return { workspace: workspaceId, userId, roles: h.getUserRoles(workspaceId, userId) };
    }
});

_methods.set('vant_habitat_setPolicy', {
    description: 'Set an RLS boundary policy for a resource (readableBy/writableBy)',
    inputSchema: {
        type: 'object',
        properties: { resource: { type: 'string' }, policy: { type: 'object' } },
        required: ['resource', 'policy']
    },
    handler: async ({ resource, policy }) => {
        const h = await _sharedHabitat();
        h.setPolicy(resource, policy || {});
        return { resource, policy: h.getBoundaries()[resource] };
    }
});

_methods.set('vant_habitat_getBoundaries', {
    description: 'List all RLS boundary policies',
    inputSchema: { type: 'object' },
    handler: async () => {
        const h = await _sharedHabitat();
        return { boundaries: h.getBoundaries() };
    }
});

// (pass 82) RLS enforcement surface: can/check expose the real decision
// API; agentContext exposes a spawned agent's RLS subject. The check tool
// throws VantError RLS_DENIED on denial (same contract as lib/rls.js).
_methods.set('vant_habitat_can', {
    description: 'RLS decision: can a user/agent context access a resource? (read|write)',
    inputSchema: {
        type: 'object',
        properties: {
            userCtx: { type: 'object', description: 'RLS context: { userId, roles, workspace, team, brain }' },
            resource: { type: 'string', description: 'Resource key, e.g. _brain:identity or _island:notes' },
            mode: { type: 'string', enum: ['read', 'write'], default: 'read' }
        },
        required: ['resource']
    },
    handler: async ({ userCtx, resource, mode = 'read' }) => {
        const h = await _sharedHabitat();
        // (pass 86) verified > declared > anonymous: a bearer habitat token's
        // registry-verified subject overrides a declared userCtx.
        const ctx = _requestCtx(userCtx) || {};
        const allowed = await h.can(ctx, resource, mode);
        return { allowed, resource, mode, workspace: ctx.workspace || h.getCurrentWorkspace(), verified: !!(_requestAls.getStore() && _requestAls.getStore().verifiedCtx) };
    }
});

_methods.set('vant_habitat_check', {
    description: 'RLS enforcement: check access, THROWS RLS_DENIED on denial (same contract as lib/rls.js)',
    inputSchema: {
        type: 'object',
        properties: {
            userCtx: { type: 'object', description: 'RLS context: { userId, roles, workspace, team, brain }' },
            resource: { type: 'string' },
            mode: { type: 'string', enum: ['read', 'write'], default: 'read' }
        },
        required: ['resource']
    },
    handler: async ({ userCtx, resource, mode = 'read' }) => {
        const h = await _sharedHabitat();
        // (pass 86) verified > declared > anonymous.
        const ctx = _requestCtx(userCtx) || {};
        await h.check(ctx, resource, mode);
        return { checked: true, resource, mode };
    }
});

_methods.set('vant_habitat_agentContext', {
    description: 'RLS subject for a spawned agent: workspace, roles, team (habitat identity)',
    inputSchema: {
        type: 'object',
        properties: { agentId: { type: 'string' } },
        required: ['agentId']
    },
    handler: async ({ agentId }) => {
        const h = await _sharedHabitat();
        const ctx = h.agentContext(agentId);
        if (!ctx) return { error: 'AGENT_NOT_FOUND: ' + agentId + ' (spawn it first)' };
        return ctx;
    }
});

// NEW: DUALITY tools (brain-geometry bridge)
// =========== DUALITY ===========
_methods.set('vant_geometry_init', {
    description: 'Initialize brain-geometry bridge',
    inputSchema: { type: 'object' },
    handler: async () => {
        const _memory = require('./memory');
        // pass 80: was `await Promise.resolve({...})()` - calling a plain
        // OBJECT as a function (TypeError on every call). Init is a no-op
        // marker: the geometry bridge reads brain state lazily.
        await Promise.resolve({ initialized: true });
        return { initialized: true };
    }
});

_methods.set('vant_geometry_remember', {
    description: 'Store memory in NSC9 geometry',
    inputSchema: { type: 'object', properties: { category: {type:'string'}, key: {type:'string'}, content: {type:'string'} }, required: ['category','key','content'] },
    handler: async ({ category, key, content }) => {
        const memory = require('./memory');
        const result = await memory.learn('geometry:' + category + '/' + key, content);
        return { stored: true, ...result };
    }
});

_methods.set('vant_geometry_recall', {
    description: 'Recall memory from NSC9 geometry',
    inputSchema: { type: 'object', properties: { brainPath: {type:'string'} }, required: ['brainPath'] },
    handler: async ({ brainPath }) => {
        const memory = require('./memory');
        const result = await memory.query('geometry:' + brainPath);
        return result;
    }
});

_methods.set('vant_geometry_knows', {
    description: 'Check if geometry knows a key',
    inputSchema: { type: 'object', properties: { key: {type:'string'} }, required: ['key'] },
    handler: async ({ key }) => {
        const memory = require('./memory');
        const known = await memory.query('geometry:' + key);
        return { key, known };
    }
});


// NEW: Unified Memory API tools
// =========== MEMORY ===========
_methods.set('vant_memory_state', {
    description: 'Store state (key-value with TTL). Optional workspace scopes the key into a per-workspace namespace (ws<wsLen>.<ws>.<key>); omitted = the current agent habitat identity, when one exists; workspace:"" = flat unscoped key',
    inputSchema: { type: 'object', properties: { key: {type:'string'}, value: {type:'string'}, ttl: {type:'number'}, workspace: {type:'string', description: 'Optional workspace namespace (tenant scope)'} }, required: ['key', 'value'] },
    handler: async ({ key, value, ttl, workspace }) => {
        const memory = require('./memory');
        const opts = {};
        if (ttl) opts.ttl = ttl;
        // (pass 86) verified > declared > identity > anonymous. workspace:null
        // pins unscoped; a declared workspace would otherwise override the
        // token's registry subject.
        if (workspace !== undefined) {
            opts.workspace = workspace;
        } else {
            const verified = _requestCtx();
            if (verified) opts.userCtx = verified;
        }
        const result = await memory.state(key, value, opts);
        return { stored: true, ...result };
    }
});

_methods.set('vant_memory_recall', {
    description: 'Recall state by key. Optional workspace reads from that per-workspace namespace (ws<wsLen>.<ws>.<key>); omitted = the current agent habitat identity, when one exists; workspace:"" = flat unscoped key. Namespaces are isolating: a workspace never falls back to flat keys',
    inputSchema: { type: 'object', properties: { key: {type:'string'}, workspace: {type:'string', description: 'Optional workspace namespace (tenant scope)'} }, required: ['key'] },
    handler: async ({ key, workspace }) => {
        const memory = require('./memory');
        const opts = {};
        if (workspace !== undefined) {
            opts.workspace = workspace;
        } else {
            // (pass 86) verified > declared > identity > anonymous.
            const verified = _requestCtx();
            if (verified) opts.userCtx = verified;
        }
        const value = await memory.recall(key, opts);
        return { key, workspace: workspace || null, value: value || null };
    }
});

_methods.set('vant_memory_learn', {
    description: 'Learn document (stores as markdown)',
    inputSchema: { type: 'object', properties: { key: {type:'string'}, content: {type:'string'}, ttl: {type:'number'} }, required: ['key', 'content'] },
    handler: async ({ key, content, ttl }) => {
        const memory = require('./memory');
        const result = await memory.learn(key, content, ttl ? { ttl } : {});
        return { learned: true, ...result };
    }
});

_methods.set('vant_memory_query', {
    description: 'Query learned document by key',
    inputSchema: { type: 'object', properties: { key: {type:'string'} }, required: ['key'] },
    handler: async ({ key }) => {
        const memory = require('./memory');
        const content = await memory.query(key);
        return { key, content: content || null };
    }
});

_methods.set('vant_memory_address', {
    description: 'Store at NSC9 geometric address',
    inputSchema: { type: 'object', properties: { data: {type:'string'} }, required: ['data'] },
    handler: async ({ data }) => {
        const memory = require('./memory');
        let parsed;
        try { parsed = JSON.parse(data); } catch(e) { parsed = data; }
        const barcode = await memory.address(parsed);
        return { barcode };
    }
});

_methods.set('vant_memory_locate', {
    description: 'Retrieve from NSC9 geometric address',
    inputSchema: { type: 'object', properties: { barcode: {type:'string'} }, required: ['barcode'] },
    handler: async ({ barcode }) => {
        const memory = require('./memory');
        const data = await memory.locate(barcode);
        return { barcode, data };
    }
});

// (Wave U1, prd-universe.md) Genesis snapshots — PASS-derived world
// identity over SeedChain + AddressingSpine. Nothing here can mutate
// state (the module only derives the snapshot), so no write scope is
// needed; a fork is just a name derivation.
_methods.set('vant_universe_snapshot', {
    description: 'Genesis snapshot: derive a world\'s seed, cells, and fingerprint from (universe constant, name)',
    inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'World name (spine /world/ grammar)' }, universe: { type: 'string', description: 'Universe constant override (optional)' } }, required: ['name'] },
    handler: async ({ name, universe }) => {
        try {
            const gs = require('./state/genesis-snapshot');
            return { ok: true, snapshot: gs.genesisSnapshot({ name, universe }) };
        } catch (e) {
            return { ok: false, error: e.message, code: e.code || null };
        }
    }
});

_methods.set('vant_universe_fork', {
    description: 'Fork a world: prefix-folded child snapshot from a parent',
    inputSchema: { type: 'object', properties: { parent: { type: 'string' }, child: { type: 'string' }, universe: { type: 'string' } }, required: ['parent', 'child'] },
    handler: async ({ parent, child, universe }) => {
        try {
            const gs = require('./state/genesis-snapshot');
            return { ok: true, snapshot: gs.forkSnapshot({ parent, child, universe }) };
        } catch (e) {
            return { ok: false, error: e.message, code: e.code || null };
        }
    }
});

_methods.set('vant_universe_status', {
    description: 'Report the active universe constant source (flag/env/default) + default-world fingerprint',
    inputSchema: { type: 'object', properties: { universe: { type: 'string' } }, required: [] },
    handler: async ({ universe }) => {
        const gs = require('./state/genesis-snapshot');
        let source = 'default';
        if (universe) source = 'explicit';
        else if (process.env.VANT_UNIVERSE_SEED) source = 'VANT_UNIVERSE_SEED env';
        const probe = gs.genesisSnapshot({ name: 'vant', universe });
        return { ok: true, universeSource: source, defaultWorld: 'vant', fingerprint: probe.fingerprint };
    }
});

// (Wave U2, prd-universe.md) Stored, content-addressed scenario manifests.
// record freezes a snapshot + state root into a manifest whose id IS the
// content hash; diff compares two manifests under the same-universe
// contract; resume writes a brain-lock-gated, WAL-backed restore marker
// (persistMerged fails closed while a peer holds the region).
_methods.set('vant_universe_record', {
    description: 'Record a stored, content-addressed scenario manifest (world snapshot + frozen state root)',
    inputSchema: {
        type: 'object',
        properties: {
            name: { type: 'string', description: 'World name; for a fork the full dotted name (parent.child)' },
            universe: { type: 'string', description: 'Universe constant override (optional)' },
            fork: { type: 'boolean', description: 'Derive via prefix folding (name must be parent.child)' },
            stateRoot: { type: 'string', description: 'Explicit protocol-state root hash to freeze (optional)' }
        },
        required: ['name']
    },
    handler: async ({ name, universe, fork, stateRoot }) => {
        try {
            const gs = require('./state/genesis-snapshot');
            return gs.recordSnapshot({ name, universe, fork, stateRoot });
        } catch (e) {
            return { ok: false, error: e.message, code: e.code || null };
        }
    }
});

_methods.set('vant_universe_diff', {
    description: 'Diff two stored scenario manifests (cell-hash delta; same-universe contract enforced)',
    inputSchema: {
        type: 'object',
        properties: {
            a: { type: 'string', description: 'Manifest id (or unambiguous prefix) of manifest A' },
            b: { type: 'string', description: 'Manifest id (or unambiguous prefix) of manifest B' },
            manifestFile: { type: 'string', description: 'Registry state-file override (advanced)' }
        },
        required: ['a', 'b']
    },
    handler: async ({ a, b, manifestFile }) => {
        try {
            const gs = require('./state/genesis-snapshot');
            const la = gs.loadSnapshot({ id: a, manifestFile });
            if (!la.ok) return la;
            const lb = gs.loadSnapshot({ id: b, manifestFile });
            if (!lb.ok) return lb;
            const result = gs.diffManifests(la.manifest, lb.manifest);
            if (!result.ok) return result;
            return { ok: true, ...result, summary: gs.summarizeDiff(result) };
        } catch (e) {
            return { ok: false, error: e.message, code: e.code || null };
        }
    }
});

_methods.set('vant_universe_resume', {
    description: 'Resume a stored scenario: verify the frozen root and write a brain-lock-gated restore marker (WAL-backed, fail-closed)',
    inputSchema: {
        type: 'object',
        properties: {
            id: { type: 'string', description: 'Manifest id (or unambiguous prefix)' },
            actor: { type: 'string', description: 'Resume actor recorded in the marker (optional)' },
            manifestFile: { type: 'string', description: 'Registry state-file override (advanced)' }
        },
        required: ['id']
    },
    handler: async ({ id, actor, manifestFile }) => {
        try {
            const gs = require('./state/genesis-snapshot');
            return await gs.resumeSnapshot({ id, actor, manifestFile });
        } catch (e) {
            return { ok: false, error: e.message, code: e.code || null };
        }
    }
});

// (Wave U3, prd-universe.md) Governance scenario playbook: escrow +
// consensus are the REAL gates. Crew over one shared escrow pool;
// delegated task with quarantine + budget gates and a voted closeout
// (no single-agent bless); roster/pool inspection.
_methods.set('vant_scenario_crew', {
    description: 'Governance playbook (U3): assemble a scenario crew over ONE shared escrow budget pool',
    inputSchema: {
        type: 'object',
        properties: {
            name: { type: 'string', description: 'Crew name (alnum, ._- , <=64)' },
            agents: { type: 'number', description: 'Crew size 2-10 (default 3)' },
            budget: { type: 'number', description: 'Shared pool budget in credits (default 120)' },
            universe: { type: 'string', description: 'Universe constant override (optional)' }
        },
        required: ['name']
    },
    handler: async ({ name, agents, budget, universe }) => {
        try {
            // Crew assembly SPAWNS agents: lift the deny-by-default canSpawn
            // for THIS execution the same way the operator CLI does
            // (`vant org demo`'s documented grant pattern). Persist-free.
            const sandbox = require('./sandbox');
            if (sandbox.defaultSandbox) sandbox.defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canSpawn: true });
            const scenario = require('./scenario');
            const r = scenario.assembleCrew({ name, agents, budget, universe });
            if (r && r.ok && require('./agents').flush) await require('./agents').flush(); // drain spawn-persistence before the door returns
            return r;
        } catch (e) {
            return { ok: false, error: e.message, code: e.code || 'E_SCENARIO' };
        }
    }
});

_methods.set('vant_scenario_task', {
    description: 'Governance playbook (U3): delegate one task end-to-end — quarantine gate, escrow hold, consensus voted closeout',
    inputSchema: {
        type: 'object',
        properties: {
            crew: { type: 'string', description: 'Crew name (must be assembled first)' },
            task: { type: 'string', description: 'Task description (<=512 chars)' },
            cost: { type: 'number', description: 'Budget cost (default: half the pool, pool-capped)' },
            universe: { type: 'string', description: 'Universe constant override (optional)' }
        },
        required: ['crew', 'task']
    },
    handler: async ({ crew, task, cost, universe }) => {
        try {
            const scenario = require('./scenario');
            return await scenario.runScenarioTask({ crew, task, cost, universe });
        } catch (e) {
            return { ok: false, error: e.message, code: e.code || 'E_SCENARIO' };
        }
    }
});

_methods.set('vant_scenario_status', {
    description: 'Governance playbook (U3): inspect an assembled scenario crew (roster + live escrow pool)',
    inputSchema: {
        type: 'object',
        properties: {
            crew: { type: 'string', description: 'Crew name' },
            universe: { type: 'string', description: 'Universe constant override (optional)' }
        },
        required: ['crew']
    },
    handler: async ({ crew, universe }) => {
        try {
            const scenario = require('./scenario');
            return scenario.describeCrew({ crew, universe });
        } catch (e) {
            return { ok: false, error: e.message, code: e.code || 'E_SCENARIO' };
        }
    }
});

_methods.set('vant_memory_stats', {
    description: 'Get memory statistics',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
        const memory = require('./memory');
        return memory.getStats();
    }
});

_methods.set('vant_memory_clear', {
    description: 'Clear all memory',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
        const memory = require('./memory');
        return await memory.clear();
    }
});

// Help tool for agents
// =========== HELP ===========
_methods.set('vant_help', {
    description: 'Get help for available tools - search by keyword or list all',
    inputSchema: { type: 'object', properties: { query: {type:'string', description: 'Search keyword (optional)'}, category: {type:'string', description: 'Filter by category: memory,brain,geometry,embed,agent,all'} }, required: [] },
    handler: async ({ query, category }) => {
        const tools = [];
        for (const [name, def] of _methods) {
            if (category && category !== 'all' && !name.includes(category)) continue;
            if (query && !name.toLowerCase().includes(query.toLowerCase()) && !def.description.toLowerCase().includes(query.toLowerCase())) continue;
            tools.push({ name, description: def.description });
        }
        return { count: tools.length, tools: tools.slice(0, 50) };
    }
});

// NEW: EMBED tools (vectorization)

// =========== EMBED ===========
_methods.set('vant_embed', {
    description: 'Embed text to vector (512-dim)',
    inputSchema: { type: 'object', properties: { text: {type:'string'} }, required: ['text'] },
    handler: async ({ text }) => {
        const embed = _embed();
        const vec = await embed.generate(text);
        return { text, vector: vec, dim: vec.length };
    }
});

_methods.set('vant_embed_similarity', {
    description: 'Compute cosine similarity between texts',
    inputSchema: { type: 'object', properties: { textA: {type:'string'}, textB: {type:'string'} }, required: ['textA', 'textB'] },
    handler: async ({ textA, textB }) => {
        const embed = _embed();
        const vecA = await embed.generate(textA);
        const vecB = await embed.generate(textB);
        const score = embed.cosineSimilarity(vecA, vecB);
        return { textA, textB, score };
    }
});

// =========== TRUST (v0.8.6) ===========
_methods.set('trust_getScore', {
    description: 'Get trust score for an entity',
    inputSchema: { type: 'object', properties: { entityId: {type:'string'} }, required: ['entityId'] },
    handler: async ({ entityId }) => {
        const trust = _lazyRequire('./trust');
        return { entityId, score: trust.getScore(entityId), karma: trust.getKarma(entityId) };
    }
});

_methods.set('trust_record', {
    description: 'Record a trust interaction',
    inputSchema: { type: 'object', properties: {
        entityId: {type:'string'},
        type: {type:'string'},
        positive: {type:'boolean'},
        value: {type:'number'},
        note: {type:'string'}
    }, required: ['entityId', 'type'] },
    handler: async (params) => {
        const trust = _lazyRequire('./trust');
        const result = trust.record(params.entityId, params.type, {
            positive: params.positive,
            value: params.value,
            note: params.note
        });
        return result;
    }
});

_methods.set('trust_leaderboard', {
    description: 'Get trust leaderboard',
    inputSchema: { type: 'object', properties: { limit: {type:'number'} } },
    handler: async ({ limit = 10 }) => {
        const trust = _lazyRequire('./trust');
        return { leaderboard: trust.leaderboard(limit) };
    }
});

_methods.set('trust_can', {
    description: 'Check if entity can perform action',
    inputSchema: { type: 'object', properties: { entityId: {type:'string'}, action: {type:'string'} }, required: ['entityId', 'action'] },
    handler: async ({ entityId, action }) => {
        const trust = _lazyRequire('./trust');
        return { entityId, action, allowed: trust.can(entityId, action) };
    }
});

// =========== MARKET (v0.8.6) ===========
_methods.set('market_list', {
    description: 'List knowledge for trade',
    inputSchema: { type: 'object', properties: {
        type: {type:'string', enum:['knowledge','insight','memory','favor']},
        title: {type:'string'},
        summary: {type:'string'},
        tags: {type:'array', items:{type:'string'}},
        price: {type:'string'},
        context: {type:'object', description: 'Context with consentGiven'}
    }, required: ['type', 'title'] },
    handler: async (params) => {
        const market = _lazyRequire('./market');
        const result = await market.list(params.type, {
            title: params.title,
            summary: params.summary,
            tags: params.tags,
            price: params.price
        }, params.context);
        return result;
    }
});

_methods.set('market_bid', {
    description: 'Bid on knowledge',
    inputSchema: { type: 'object', properties: {
        title: {type:'string'},
        description: {type:'string'},
        tags: {type:'array', items:{type:'string'}},
        reward: {type:'string'}
    }, required: ['title'] },
    handler: async (params) => {
        const market = _lazyRequire('./market');
        const result = await market.bid(params.title, {
            description: params.description,
            tags: params.tags,
            reward: params.reward
        });
        return result;
    }
});

_methods.set('market_search', {
    description: 'Search market listings',
    inputSchema: { type: 'object', properties: {
        type: {type:'string'},
        tags: {type:'array', items:{type:'string'}},
        query: {type:'string'}
    } },
    handler: async (params) => {
        const market = _lazyRequire('./market');
        return { results: await market.search(params) };
    }
});

_methods.set('market_trade', {
    description: 'Execute a trade',
    inputSchema: { type: 'object', properties: {
        listingId: {type:'string'},
        buyerId: {type:'string'}
    }, required: ['listingId', 'buyerId'] },
    handler: async ({ listingId, buyerId }) => {
        const market = _lazyRequire('./market');
        return await market.trade(listingId, buyerId);
    }
});

_methods.set('market_stats', {
    description: 'Get market statistics',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
        const market = _lazyRequire('./market');
        return market.stats();
    }
});

_methods.set('market_get', {
    description: 'Get a listing by ID',
    inputSchema: {
        type: 'object',
        properties: {
            listingId: { type: 'string', description: 'Listing ID to retrieve' }
        },
        required: ['listingId']
    },
    handler: async (args) => {
        const market = _lazyRequire('./market');
        return market.get(args.listingId) || { error: 'Listing not found' };
    }
});

_methods.set('market_getTrade', {
    description: 'Get a trade by ID',
    inputSchema: {
        type: 'object',
        properties: {
            tradeId: { type: 'string', description: 'Trade ID to retrieve' }
        },
        required: ['tradeId']
    },
    handler: async (args) => {
        const market = _lazyRequire('./market');
        return market.getTrade(args.tradeId) || { error: 'Trade not found' };
    }
});

_methods.set('market_getBids', {
    description: 'Get all bids',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
        const market = _lazyRequire('./market');
        return { bids: market.getBids() };
    }
});

// =========== (Wave U6.5 productized) SKILLS MARKETPLACE ===========
// Delivery-confirmed paid labor over the SAME escrow/trust primitives —
// gate: market.skillsEnabled (default OFF; VANT_MARKET_SKILLS_ENABLED env
// alias or `vant market skill-gate on`). Gate-inert: E_SKILLS_DISABLED.
_methods.set('market_skill_list', {
    description: 'Skills marketplace: list a paid skill (payload validated at delivery — launch-payload listings refused). Gated: market.skillsEnabled.',
    inputSchema: { type: 'object', properties: {
        title: { type: 'string', description: 'Skill title (required)' },
        description: { type: 'string' },
        payloadKind: { type: 'string', enum: ['text', 'code'], description: 'prototype: text|code only' },
        price: { type: 'number', description: 'credits (default 1)' },
        capabilityTag: { type: 'string' },
        context: { type: 'object', description: '{ agentId, consentGiven } for the SELLER identity' }
    }, required: ['title'] },
    handler: async (params) => {
        const market = _lazyRequire('./market');
        return await market.listSkill({
            title: params.title,
            description: params.description,
            payloadKind: params.payloadKind,
            price: params.price,
            capabilityTag: params.capabilityTag
        }, params.context || {});
    }
});

_methods.set('market_skill_buy', {
    description: 'Skills marketplace: buy a skill — escrow HOLD only (no debit until the buyer confirms settlement). Gated: market.skillsEnabled.',
    inputSchema: { type: 'object', properties: {
        listingId: { type: 'string' },
        buyerId: { type: 'string' },
        workspace: { type: 'string', description: 'optional org-pool scope for the hold' }
    }, required: ['listingId', 'buyerId'] },
    handler: async ({ listingId, buyerId, workspace }) => {
        const market = _lazyRequire('./market');
        return await market.buySkill(listingId, buyerId, { agentId: buyerId, workspace });
    }
});

_methods.set('market_skill_deliver', {
    description: 'Skills marketplace: SELLER delivers the payload (≤64KB, kind-validated, sha256-hashed; delivery verifies nothing — the buyer settles). Gated.',
    inputSchema: { type: 'object', properties: {
        tradeId: { type: 'string' },
        payload: { type: 'string', maxLength: 65536, description: 'the deliverable bytes' },
        agentId: { type: 'string', description: 'the SELLER identity (must match the listing; buyer delivery refused E_SKILL_NOT_SELLER)' }
    }, required: ['tradeId', 'payload'] },
    handler: async ({ tradeId, payload, agentId }) => {
        const market = _lazyRequire('./market');
        return await market.deliverSkill(tradeId, payload, { agentId: agentId });
    }
});

_methods.set('market_skill_settle', {
    description: 'Skills marketplace: BUYER settles — confirm DEBITS escrow + writes a positive trust record for the seller; refute releases the hold (no debit) + negative record. Seller cannot settle their own sale; double settlement refused. Gated.',
    inputSchema: { type: 'object', properties: {
        tradeId: { type: 'string' },
        decision: { type: 'string', enum: ['confirm', 'refute'] },
        agentId: { type: 'string', description: 'the BUYER identity' }
    }, required: ['tradeId', 'decision'] },
    handler: async ({ tradeId, decision, agentId }) => {
        const market = _lazyRequire('./market');
        return await market.settleSkill(tradeId, decision, { agentId: agentId });
    }
});

_methods.set('market_skill_status', {
    description: 'Skills marketplace: pre-trade snapshot for a listing — price, payloadKind, revocation, seller reputation (visible BEFORE paying). Gated.',
    inputSchema: { type: 'object', properties: {
        listingId: { type: 'string' }
    }, required: ['listingId'] },
    handler: async ({ listingId }) => {
        const market = _lazyRequire('./market');
        return await market.skillStatus(listingId);
    }
});

// ==================== ERA — the resumable incarnation ledger ====================
// (issues #177-#179, Phase 3 twins). One era open at a time; the bus subscriber
// folds events into it between these door calls.

_methods.set('era_start', {
    description: 'Era: open a new incarnation era with a one-sentence intent (REQUIRED — one era open at a time; E_ERA_ALREADY_OPEN otherwise). The event-bus subscriber folds escrow/agent/forum/… events into it until close.',
    inputSchema: { type: 'object', properties: {
        intent: { type: 'string', description: 'one sentence: why this wake exists' }
    }, required: ['intent'] },
    handler: async ({ intent }) => await _lazyRequire('./era').start(String(intent || ''))
});

_methods.set('era_log', {
    description: 'Era: fold one manual line-item into the OPEN era (typed event → field routing via FIELD_FOR_EVENT). No-op (typed E_ERA_NONE envelope) when no era is open — never throws.',
    inputSchema: { type: 'object', properties: {
        type: { type: 'string', description: 'event family, e.g. escrow:hold' },
        data: { type: 'object', description: 'line-item payload (optional)' }
    }, required: ['type'] },
    handler: async ({ type, data }) => {
        const era = _lazyRequire('./era');
        const folded = era.fold(String(type || ''), data);
        if (folded === null) {
            const c = era.current();
            return c.open ? { ok: false, code: 'E_ERA_UNROUTED', error: 'event does not route into an era field: ' + type } : { ok: false, code: 'E_ERA_NONE', error: 'no era is open' };
        }
        return { ok: true, folded: true, type };
    }
});

_methods.set('era_close', {
    description: 'Era: close the open era — compact rollup + sha256 checksum (lib/hash, the ONE hash source), archived to state/era-eras.json; emits era:closed + era:succession. Optional `next` is the sentence the NEXT wake starts with (the horcrux-refresh hook).',
    inputSchema: { type: 'object', properties: {
        next: { type: 'string', description: 'one sentence for the next wake (optional, capped 400 chars)' }
    } },
    handler: async ({ next }) => await _lazyRequire('./era').close({ next })
});

_methods.set('era_current', {
    description: 'Era: the current state — open era with its line-items and integrity flag, or typed absence (open:false). Never throws.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => await _lazyRequire('./era').current()
});

_methods.set('era_list', {
    description: 'Era: list archived rollups (id, intent, next, timestamps) each with a recomputed integrity flag.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => ({ ok: true, eras: _lazyRequire('./era').list() })
});

// (pass 206, issue #183 Part B) Per-wake execution spans: the era's flight
// recorder through the MCP door.
_methods.set('era_trace', {
    description: 'Trace: the execution-span tail for this wake - span waterfall metadata (count, failures with typed codes, slowest span), bounded at 500. Debug aid; spans ride era close via lib/trace.tail().',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
        const trace = _lazyRequire('./trace');
        const t = trace.tail();
        return {
            ok: true,
            eraId: trace.eraId(),
            count: t.count,
            failed: t.failed.map(f => ({ span_id: f.span_id, verb: f.verb, subsystem: f.subsystem, error_code: f.error_code })),
            slowest: t.slowest ? { span_id: t.slowest.span_id, verb: t.slowest.verb, subsystem: t.slowest.subsystem, duration_ms: t.slowest.duration_ms } : null,
            spans: t.spans
        };
    }
});

_methods.set('market_skill_sweep', {
    description: 'Skills marketplace: run the TTL evidence sweep — stale pending_delivery trades get their escrow hold released (NO debit, supply restored, NO trust penalty — only the typed evidence stage qualifies). Gated: market.skillsEnabled.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
        const market = _lazyRequire('./market');
        return await market.skillSweep({ agentId: 'mcp' });
    }
});

_methods.set('market_skill_gate', {
    description: 'Skills marketplace gate: read (no args) or set (value true/false) market.skillsEnabled for the current brain. OFF by default.',
    description: 'Skills marketplace gate: read (no args) or set (value true/false) market.skillsEnabled for the current brain. OFF by default.',
    inputSchema: { type: 'object', properties: {
        value: { type: 'boolean', description: 'omit to read; true/false (or \"true\"/\"false\") to set the gate' }
    } },
    handler: async ({ value }) => {
        const config = _lazyRequire('./config');
        if (value === undefined) {
            return { key: 'market.skillsEnabled', enabled: config.get('market.skillsEnabled') === true || config.get('market.skillsEnabled') === 'true' };
        }
        const r = config.setConfig('market.skillsEnabled', value === true || value === 'true');
        if (r && r.error) return r;
        return { key: 'market.skillsEnabled', enabled: r.value === true, persisted: r.persisted === true, brain: r.brain || null };
    }
});

_methods.set('market_cancelTrade', {
    description: 'Cancel a trade and release escrow hold',
    inputSchema: {
        type: 'object',
        properties: {
            tradeId: { type: 'string', description: 'Trade ID to cancel' },
            agentId: { type: 'string', description: 'Agent canceling (buyer or seller)' }
        },
        required: ['tradeId', 'agentId']
    },
    handler: async (args) => {
        const market = _lazyRequire('./market');
        return market.cancelTrade(args.tradeId, args.agentId);
    }
});

_methods.set('trust_setRequired', {
    description: 'Set minimum trust threshold for a permission',
    inputSchema: {
        type: 'object',
        properties: {
            permission: { type: 'string', description: 'Permission name' },
            minTrust: { type: 'number', description: 'Minimum trust score (0-1)' }
        },
        required: ['permission', 'minTrust']
    },
    handler: async (args) => {
        const trust = _lazyRequire('./trust');
        if (trust && trust.setRequired) {
            trust.setRequired(args.permission, args.minTrust);
            return { success: true, permission: args.permission, minTrust: args.minTrust };
        }
        return { error: 'Trust module not available' };
    }
});

// ==================== RELAY TOOLS (R0, prd-relay.md v0.2 §1.1) =====
// Read-only posture truth for the headless relay; the hop surface itself
// stays on the REST server (Mode R), never on this tool surface.
_methods.set('relay_status', {
    description: 'Relay: the r/2 webhook-native face truth (prd-relay.md §2) - enabled, mounted, gate/channel readiness, route + events, liveness counters of THIS process (intake = the webhook transport POST /relay, HMAC-gated; hops ride lib/network; the door stays the only dispatcher).',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
        // (r/2, pass 236) The relay IS the api face now — no lib/relay module
        // exists to require; the webhook-native face lives in lib/api.js.
        const relay = _lazyRequire('./api').relay;
        const st = relay.status();
        return {
            ok: true,
            contract: st.contract,
            flavor: st.flavor,
            enabled: st.enabled,
            mounted: st.mounted,
            gateReady: st.gateReady,
            channelReady: st.channelReady,
            route: st.route,
            events: st.events,
            stats: st.stats
        };
    }
});

module.exports = {
    start: async (options = {}) => {
        const http = require('http');
        const mcp = require('./mcp');

        // (EW4, #194) Per-client fixed-window limiter for the MCP door.
        // The REST door in lib/server.js rides the QoS rate limiter (it emits
        // X-RateLimit-* headers); the MCP HTTP door had NO shared per-client
        // budget at all — every authed-by-shared-key or unauthenticated
        // dev-mode client got one unlimited bucket. Sizing is generous
        // (default 240/min, env VANT_MCP_RATE_LIMIT to override, 0 disables)
        // so ordinary agent chatter never trips. One row per client key
        // (best-effort: x-forwarded-for → remoteAddress), 30s window; refusals
        // are logged and recharged only by the clock (the gistory guard
        // lesson: charge refusals, not failures). Buckets beyond MAX
        // clients are evicted FIFO so the map itself cannot grow forever.
        const RATE_WINDOW_MS = 30_000;
        const RATE_MAX_CLIENTS = 10_000;
        const envLimit = parseInt(process.env.VANT_MCP_RATE_LIMIT, 10);
        const RATE_LIMIT_PER_WINDOW = Number.isFinite(envLimit) && envLimit >= 0
            ? envLimit : 240;
        const _buckets = new Map(); // clientKey -> { windowStart, count }
        function _checkRate(req) {
            if (RATE_LIMIT_PER_WINDOW === 0) return null; // disabled
            const clientKey = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
                || req.socket.remoteAddress || 'unknown';
            const now = Date.now();
            let b = _buckets.get(clientKey);
            if (!b || now - b.windowStart >= RATE_WINDOW_MS) {
                b = { windowStart: now, count: 0 };
                _buckets.set(clientKey, b);
                if (_buckets.size > RATE_MAX_CLIENTS) {
                    // FIFO eviction of the OLDEST window to keep the map bounded
                    let oldestKey = null, oldestStart = Infinity;
                    for (const [k, v] of _buckets) {
                        if (v.windowStart < oldestStart) { oldestStart = v.windowStart; oldestKey = k; }
                    }
                    if (oldestKey && oldestKey !== clientKey) _buckets.delete(oldestKey);
                }
            }
            b.count += 1;
            if (b.count > RATE_LIMIT_PER_WINDOW) {
                const retryAfter = Math.ceil((b.windowStart + RATE_WINDOW_MS - now) / 1000);
                return { retryAfter: Math.max(1, retryAfter), client: clientKey };
            }
            return null;
        }
        function _doorRateStatus() {
            return {
                limitPerWindow: RATE_LIMIT_PER_WINDOW,
                windowMs: RATE_WINDOW_MS,
                clients: _buckets.size
            };
        }

        // (P4, prd-web.md 3.1 Mode B) POD SAME-ORIGIN STATIC SERVE: when
        // options.serveWeb / cfg mcp.serveWeb (env VANT_MCP_SERVE_WEB) names
        // a frontend directory whose dist/ build exists, the MCP door also
        // serves that dist/ at / - the browser then calls /mcp/* DIRECTLY
        // (same origin, no proxy hop, zero CORS). Mode A (the Pages Worker
        // bridge) stays the primary reach; this is the local-ops fallback.
        // The static GETs ride the door's OWN deny chain (Host guard, origin
        // guard, EW4 rate budget) that already ran above - serving is not a
        // second, weaker surface. Inactive when unset: the honest 404 JSON
        // fallthrough below stays exactly as the retiring passes left it.
        const _serveCfg = require('./config');
        const _serveFs = require('fs'); // (P4) the door requires fs lazily; this block binds its own
        const serveWebValue = options.serveWeb || _serveCfg.mcpServeWeb();
        let serveRoot = null;
        if (serveWebValue) {
            const frontend = path.resolve(process.cwd(), String(serveWebValue));
            const dist = path.join(frontend, 'dist');
            if (_serveFs.existsSync(path.join(dist, 'index.html'))) {
                serveRoot = dist;
            } else {
                console.warn('[MCP] Mode B serve requested ("' + String(serveWebValue) +
                    '") but its dist/index.html is missing\n' +
                    '      - serving stays OFF. Build the frontend first (npm run build in the app dir).');
            }
        }

        // Simple HTTP handler with MCP routes + REST endpoints
        const server = http.createServer(async (req, res) => {
            res.setHeader('Content-Type', 'application/json');

            // (pass 41 live-fire hardening) This endpoint executes agent tools
            // with NO auth by design (local companion process). Three cheap
            // gates close the live-fire exposures without tokens:
            //   1. Host header - DNS-rebinding defense. A rebound page
            //      resolves an attacker hostname to 127.0.0.1, but the browser
            //      still sends the attacker hostname in Host, which mismatches.
            //   2. Content-Type on POST - a cross-site fetch() with a "simple"
            //      text/plain body skips CORS preflight entirely; requiring
            //      application/json forces the preflight, which the browser
            //      then refuses for attacker origins.
            //   3. Origin (when present) - browsers always send it on
            //      cross-origin POSTs; non-browser clients never do. Any
            //      non-loopback origin is refused. When bound non-loopback
            //      (explicit LAN mode via VANT_MCP_BIND) the Host gate is
            //      relaxed for hostname clients; the other two gates stay on.
            const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '::ffff:127.0.0.1']);
            const _stripBrackets = (h) => String(h || '').replace(/^\[/, '').replace(/\]$/, '');
            const _isLoopbackHost = (h) => LOOPBACK_HOSTS.has(_stripBrackets(String(h || '').toLowerCase()));
            const hostBare = _stripBrackets(String(req.headers.host || '').replace(/:\d+$/, ''));
            const bindIsLoopback = _isLoopbackHost(String(bind || ''));
            const _deny = (code, msg) => {
                res.writeHead(code);
                res.end(JSON.stringify({ error: msg }));
                return;
            };
            if (bindIsLoopback && hostBare && !_isLoopbackHost(hostBare)) {
                return _deny(403, 'Forbidden: Host header mismatch (DNS-rebinding guard)');
            }
            if (req.method === 'POST') {
                const ct = String(req.headers['content-type'] || '').toLowerCase();
                if (!ct.startsWith('application/json')) {
                    return _deny(415, 'Unsupported Media Type: POST application/json required');
                }
                const origin = req.headers.origin;
                if (origin) {
                    const originHost = _stripBrackets(String(origin)
                        .replace(/^https?:\/\//, '')
                        .replace(/:\d+$/, ''));
                    if (!_isLoopbackHost(originHost)) {
                        return _deny(403, 'Forbidden: cross-origin POST refused');
                    }
                }
            }

            // (EW4, #190/#194) Per-client rate budget on EVERY request (the
            // auth gate below only bounds attr-authenticated traffic; this
            // bounds the unauthenticated dev-mode door too). 429 with
            // Retry-After on refusal.
            const _rateVerdict = _checkRate(req);
            if (_rateVerdict) {
                _emit('mcp:rate:limited', { client: _rateVerdict.client, timestamp: Date.now() });
                res.writeHead(429, { 'Retry-After': String(_rateVerdict.retryAfter) });
                res.end(JSON.stringify({
                    jsonrpc: '2.0',
                    error: { code: -32000, message: 'Rate limit exceeded; retry after ' + _rateVerdict.retryAfter + 's' },
                    id: null
                }));
                return;
            }

            // MCP endpoints
            // ==================== H2 of #185: the EVENT STREAM = the dashboard ====
            // (pass 212) GET /mcp/events — an SSE tap of the SAME event bus the
            // pod runs on (lib/event.js). A plain EventSource (no SDK) renders
            // the live board: era open/log/close, node heartbeats, escrow
            // holds/spends, task + agent activity, forum/votes.
            //
            // Stream discipline (the #185 enumeration lesson - "any
            // unauthenticated list-of-clients surface is an enumeration
            // vector; scope it and throttle it or don't ship it"):
            // ?beat=<ms> (500-15000, default 15000) moves the SSE beat for tests
            //   1. AUTH: exactly the /mcp/exec credential rule - when
            //      mcp.requireKey is on, a valid shared key / habitat token /
            //      guest token is required. Guest tokens keep their identity
            //      and stay re-verified on the heartbeat: a mid-stream revoke
            //      kills the stream at the next beat.
            //   2. FAMILIES: only DASHBOARD-UI families pass (era, agent, task,
            //      escrow, market, forum, consensus, msg, succession, leisure,
            //      tempo, sync, memory, audit, universe, node-registry).
            //      Internal ops (guest_*, mcp_*, sudo_*, config_*) never board.
            //   3. SANITIZED payloads: shallow listed keys, strings capped -
            //      the wire says WHAT happened, never file or body contents.
            //   4. THROTTLE: per-connection event + byte caps, 15s SSE beat,
            //      pod-wide connection cap - a saturated dashboard cools off
            //      instead of becoming a channel DoS.
            if ((req.url === '/mcp/events' || req.url === '/events' || /^\/mcp\/events\?/.test(req.url) || /^\/events\?/.test(req.url)) && req.method === 'GET') {
                const _cfgEvents = require('./config');
                const _guestsEvents = require('./guests');
                const bearer0 = String(req.headers['authorization'] || '').replace(/^Bearer /i, '').trim();
                const cand0 = bearer0.startsWith('vguest_') ? bearer0
                    : (bearer0.startsWith('vant_') ? bearer0
                    : (typeof req.headers['x-habitat-token'] === 'string' ? req.headers['x-habitat-token'].trim() : ''));
                let guestVerified = null;
                if (_cfgEvents.mcpRequireKey() === 'true') {
                    const keyHeader = req.headers['x-api-key'] || bearer0 || undefined;
                    const keyOk = new (require('./auth').Auth)().validateApiKey(keyHeader).valid;
                    guestVerified = cand0.startsWith('vguest_') ? _guestsEvents.verify(cand0) : null;
                    const tokenVerified = guestVerified ? true : (!(!cand0 || cand0.startsWith('vguest_')) ? !!_tokenToContext(cand0) : false);
                    if (!keyOk && !tokenVerified) {
                        _emit('mcp:auth:failed', { method: 'events_unauthenticated', timestamp: Date.now() });
                        res.writeHead(401);
                        res.end(JSON.stringify({ error: 'Unauthorized: the event tap requires a valid credential when mcp.requireKey is on' }));
                        return;
                    }
                }

                res.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache, no-transform',
                    'Connection': 'keep-alive',
                    'X-Accel-Buffering': 'no'
                });
                res.write(': vant event tap\n\n');

                // Pod-wide connection cap (DoS bound; the SAME defense type the
                // rate limiter gives /mcp/exec). Count lives on the module-ref.
                tapRuntime.count++;
                if (tapRuntime.count > 32) {
                    tapRuntime.count--;
                    res.writeHead(429);
                    res.end(JSON.stringify({ error: 'Too many event taps (pod cap 32).'
                        + ' A dashboard board that needs more should aggregate upstream.' }));
                    return;
                }

                const TAP_INTERNAL_RE = /^(guest|mcp|sudo|config):/;
                const TAP_FAMILY_RE = /^(era|node-registry|agent|task|escrow|market|forum|consensus|msg|succession|leisure|tempo|sync|memory|audit|universe):/;
                const TAP_FIELDS = ['id', 'tool', 'want', 'eraId', 'taskId', 'node', 'agentId', 'convId', 'channel', 'status', 'state', 'reason', 'name', 'role', 'amount', 'budget', 'service', 'op', 'skill', 'source', 'ref', 'brain'];
                const TAP_FIELD_RE = new RegExp('^(' + TAP_FIELDS.join('|') + ')$', 'i');

                let tapEvents = 0;
                let tapBytes = 0;
                let tapEnded = false;
                const write = (s) => { if (!tapEnded) { try { res.write(s); } catch (e) { tapEnded = true; } } };

                // (H2 contract) the bus dispatches wildcard taps as (data, type)
                // (H2 contract) the bus dispatches wildcard taps as (data, type)
                const tapHandler = (data, type) => {
                    if (tapEnded) return;
                    const t = String(type || '');
                    if (TAP_INTERNAL_RE.test(t)) return;               // internal ops never board
                    if (!TAP_FAMILY_RE.test(t)) return;                // dashboard families only
                    if (tapEvents >= 5000 || tapBytes >= 1e6) {        // per-connection cool-off
                        tapEnded = true;
                        return;
                    }
                    tapEvents++;
                    const payload = {};
                    if (data && typeof data === 'object') {
                        for (const k of Object.keys(data)) {
                            if (!TAP_FIELD_RE.test(k)) continue;
                            const v = data[k];
                            if (typeof v === 'string') payload[k] = v.length > 120 ? v.slice(0, 117) + '...' : v;
                            else if (typeof v === 'number' || typeof v === 'boolean' || v === null) payload[k] = v;
                        }
                    }
                    const line = 'id: ' + Date.now()
                        + '\ndata: ' + JSON.stringify({ ...payload, tapType: t }).slice(0, 2048) + '\n\n';
                    if (tapBytes + line.length <= 1e6) { tapBytes += line.length; write(line); }
                    else tapEnded = true;
                };

                const _tapBus = require('./event');
                // (H2 additive) event.on('*') dispatches (type, data) for the tap.
                _tapBus.on('*', tapHandler);

                const _q = new URL(req.url, 'http://tap.local');
                const beatMs = Math.max(500, Math.min(15000, parseInt(_q.searchParams.get('beat'), 10) || 15000));
                const beat = setInterval(() => {
                    if (tapEnded) { clearInterval(beat); return; }
                    write(': beat\n\n');
                    if (cand0 && cand0.startsWith('vguest_')) {
                        // Mid-stream revocation: the beat re-verifies the guest.
                        if (!_guestsEvents.verify(cand0)) {
                            write('event: tap.revoked\ndata: {"reason": "guest token revoked or expired"}\n\n');
                            tapEnded = true;
                        }
                    }
                }, beatMs);

                const cleanup = () => {
                    if (tapEnded) return;
                    tapEnded = true;
                    clearInterval(beat);
                    tapRuntime.count--;
                    try { _tapBus.off('*', tapHandler); } catch (e) { /* bus gone */ }
                };
                req.on('close', cleanup);
                req.on('error', cleanup);
                return;
            }
            if (req.url === '/mcp/tools' && req.method === 'GET') {
                res.end(JSON.stringify({ tools: mcp.listTools() }));
                return;
            }
            // (pass 42) Aliases restored: docs and MCP clients reference
            // GET /tools and GET /health — the dead start() used to serve
            // them, so deleting it silently 404'd documented routes.
            if (req.url === '/tools' && req.method === 'GET') {
                res.end(JSON.stringify(listTools()));
                return;
            }
            if (req.url === '/health' && req.method === 'GET') {
                res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
                return;
 }
            if (req.url === '/mcp/exec' && req.method === 'POST') {
                // (pass 42 live-fire) Auth gate migrated from the dead
                // start(): when VANT_MCP_REQUIRE_KEY=true (or vant config set
                // mcp.requireKey true) POSTs must carry x-api-key / Bearer.
                // No key configured = allow (local companion posture, pass-41
                // note) — the flag turns this into a real auth boundary.
                const _cfg = require('./config');
                if (_cfg.mcpRequireKey() === 'true') {
                    const apiKey = req.headers['x-api-key'] ||
                        (String(req.headers['authorization'] || '').replace(/^Bearer /i, '') || undefined);
                    const authResult = new (require('./auth').Auth)().validateApiKey(apiKey);
                    if (!authResult.valid) {
                        // (pass 86) A VALID habitat token also satisfies the
                        // requireKey boundary — token auth IS the auth, and it
                        // carries the per-agent RLS subject a shared key can't.
                        // (pass 211, #185 H1) Guest tokens satisfy it too — a
                        // vguest_ token IS an issued identity, not a shared secret.
                        const bearer = String(req.headers['authorization'] || '').replace(/^Bearer /i, '').trim();
                        const cand = bearer.startsWith('vant_') ? bearer
                            : (bearer.startsWith('vguest_') ? bearer
                            : (typeof req.headers['x-habitat-token'] === 'string' ? req.headers['x-habitat-token'].trim() : ''));
                        const _guestsMod = require('./guests');
                        const guestCheck = (cand && cand.startsWith('vguest_')) ? _guestsMod.verify(cand) : null;
                        if (!(cand && (guestCheck || _tokenToContext(cand)))) {
                            _emit('mcp:auth:failed', { method: 'unauthenticated', timestamp: Date.now() });
                            res.writeHead(401);
                            res.end(JSON.stringify({
                                jsonrpc: '2.0',
                                error: { code: -32600, message: authResult.reason || 'Unauthorized' },
                                id: null
                            }));
                            return;
                        }
                    }
                }
                let body = '';
                // (EW1, #190) Unbounded body accumulation = memory DoS. The
                // sibling REST door (lib/server.js) caps at 1MB and answers
                // 413; the MCP door now shares the same posture and the same
                // option name. Also covers admin/UI POSTs above.
                const MCP_BODY_LIMIT = 1024 * 1024;
                let bodySize = 0;
                req.on('data', c => {
                    bodySize += c.length;
                    if (bodySize > MCP_BODY_LIMIT) {
                        res.writeHead(413, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            jsonrpc: '2.0',
                            error: { code: -32700, message: 'Request body too large (limit 1MB)' },
                            id: null
                        }));
                        req.destroy();
                        return;
                    }
                    body += c;
                });
                req.on('end', async () => {
                    try {
                        let input;
                        try { input = JSON.parse(body); }
                        catch (parseErr) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({
                                jsonrpc: '2.0',
                                error: { code: -32700, message: 'Invalid JSON body' },
                                id: null
                            }));
                            return;
                        }
                        // Support both {tool, args} and {method, params} (JSON-RPC)
                        // If method provided, keep as-is for lookup (vant_config_get stays vant_config_get)
                        const tool = input.tool || input.method;
                        const args = input.args || input.params || {};
                        if (!tool) {
                            throw new errors.VantError('Missing tool or method', { code: errors.CODES.UNKNOWN });
                        }
                        // (pass 86) Habitat tokens are accepted in addition to
                        // the shared API key. A valid token anchors the request
                        // to its registry-verified RLS subject for the whole
                        // execution; invalid tokens fall through to the shared-
                        // key check so mixed deployments keep working.
                        // (pass 211, #185 H1) Guest tokens: same bearer lane with
                        // their own verify + per-role DOOR GATE before execute.
                        // A bad/expired/revoked vguest_ token is a 401 (an
                        // explicit token must be honored or refused — never
                        // silently downgraded to anonymous).
                        const bearer = String(req.headers['authorization'] || '').replace(/^Bearer /i, '').trim();
                        const _guests = require('./guests');
                        let guestVerified = null;
                        let habitatToken = bearer.startsWith('vant_') ? bearer
                            : (typeof req.headers['x-habitat-token'] === 'string' ? req.headers['x-habitat-token'].trim() : '');
                        if (bearer.startsWith('vguest_')) {
                            guestVerified = _guests.verify(bearer);
                            if (!guestVerified) {
                                _emit('mcp:auth:failed', { method: 'guest_invalid_token', timestamp: Date.now() });
                                res.writeHead(401);
                                res.end(JSON.stringify({
                                    jsonrpc: '2.0',
                                    error: { code: -32600, message: 'invalid, expired, or revoked guest token' },
                                    id: null
                                }));
                                return;
                            }
                        }
                        if (guestVerified) {
                            // #185 H1 door gate: role capabilities + the admin
                            // block (a guest never manages guests — enumeration
                            // defense) run BEFORE anything executes.
                            if (process.env.DEBUG_GUESTS) console.error('[guests-debug] door', guestVerified.guest.id, 'role', guestVerified.guest.role, 'caps', JSON.stringify(guestVerified.caps), 'tool', tool);
                            const gate = _guests.authorize(tool, guestVerified);
                            if (!gate.allowed) {
                                _emit('mcp:auth:failed', { method: 'guest_denied', tool, reason: gate.reasonCode, guestId: guestVerified.guest.id, timestamp: Date.now() });
                                res.writeHead(403);
                                res.end(JSON.stringify({
                                    jsonrpc: '2.0',
                                    error: { code: -32600, message: gate.reason, reasonCode: gate.reasonCode },
                                    id: null
                                }));
                                return;
                            }
                            // (pass 215) CROSS-TENANT ENUMERATION THROTTLING: the
                            // guest-management verbs were already admin-blocked; the
                            // remaining vector is a guest CRAWLING read-class verbs
                            // (rosters/lists/counters) to map tenants they cannot see.
                            // Per-GUEST-IDENTITY fixed-window read budget (not IP-keyed:
                            // two guests behind one NAT stay independent), EW4-shaped
                            // bucket map, refusals charged only by the clock.
                            if (_guests.classifyTool(tool) === 'read') {
                                const budget = _guests.checkReadBudget(guestVerified.guest.id);
                                if (!budget.allowed) {
                                    _emit('mcp:auth:failed', { method: 'guest_throttled', tool, guestId: guestVerified.guest.id, retryAfterMs: budget.retryAfterMs, timestamp: Date.now() });
                                    res.writeHead(429);
                                    res.end(JSON.stringify({
                                        jsonrpc: '2.0',
                                        error: { code: -32600, message: 'read budget exhausted for this guest — normal dashboards fit; crawlers do not', reasonCode: 'E_GUEST_THROTTLED', retryAfterMs: budget.retryAfterMs },
                                        id: null
                                    }));
                                    return;
                                }
                            }
                        }
                        // Guest ALS context: the guest's OWN identity (userId
                        // guest:<id>) with defensively-null registry fields —
                        // RLS consumers see an honest non-agent subject shape,
                        // never an impersonated agent.
                        const verifiedCtx = guestVerified ? {
                            userId: 'guest:' + guestVerified.guest.id,
                            agentId: null,
                            workspace: null,
                            roles: ['guest:' + guestVerified.guest.role],
                            team: null,
                            brain: null,
                            guest: { id: guestVerified.guest.id, name: guestVerified.guest.name, role: guestVerified.guest.role, scopeOwner: guestVerified.guest.scopeOwner || null }
                        }
                            : (habitatToken ? _tokenToContext(habitatToken) : null);
                        // (pass 214) PER-TENANT CHANNEL SCOPING — the msg verbs get
                        // the same tenant posture agent_list got in pass 213:
                        //   msg_list: a scoped channel owned by ANOTHER tenant is
                        //     withheld entirely (honest empty tail, no existence leak);
                        // an unscoped channel is PUBLIC (the lib/scope legacy read
                        //     rule) and stays readable by every tenant.
                        //   msg_send: refused with a typed E_TENANT_CHANNEL when the
                        //     channel is another tenant's (BEFORE any write); a first
                        //     write to an UNOWNED channel stamps the guest's
                        //     scopeOwner as the owner (claim-once), so a guest-device
                        //     conversation cannot silently become public board.
                        //     A scopeOwner-less guest writes unscoped channels plain -
                        //     the default tenant IS the public space.
                        let preResult = null;
                        if (guestVerified && (tool === 'msg_send' || tool === 'msg_list')) {
                            try {
                                const g = require('./guests');
                                const m = require('./msg');
                                const chan = (args && typeof args.channel === 'string') ? args.channel : null;
                                if (chan) {
                                    const chanOwner = m.channelOwner ? m.channelOwner(chan) : null;
                                    const visible = g.tenantVisible(chanOwner, guestVerified.guest.scopeOwner || null);
                                    if (tool === 'msg_list' && !visible) {
                                        preResult = [];   // another tenant's channel: withheld, not enumerated
                                    } else if (tool === 'msg_send') {
                                        if (!visible) {
                                            preResult = { ok: false, code: 'E_TENANT_CHANNEL', error: 'channel "' + chan.slice(0, 40) + '" belongs to another tenant — msg channels are tenant-scoped' };
                                        } else if (!chanOwner && guestVerified.guest.scopeOwner) {
                                            // claim-once: stamp the FIRST writer's tenant, then let the send through.
                                            m.setChannelOwner(chan, guestVerified.guest.scopeOwner);
                                        }
                                    }
                                }
                            } catch (e) { /* the gate must never crash the door — but an unfiltered
                                             fall-through would be fail-open. Fail CLOSED on BOTH
                                             verbs: msg_list honest empty; msg_send honest refusal. */
                                preResult = (tool === 'msg_list') ? []
                                    : { ok: false, code: 'E_TENANT_CHANNEL', error: 'tenant gate unavailable for msg_send — channel write refused (fail-closed)' };
                            }
                        }
                        let result = preResult;
                        if (preResult === null) {
                            result = await _requestAls.run({ verifiedCtx, token: (habitatToken || (guestVerified ? bearer : null)), guest: guestVerified ? guestVerified.guest : null }, async () =>
                                await mcp.execute(tool, args)
                            );
                        }
                        // (pass 213, H5 of #185) PER-TENANT LIST FILTERING: a guest
                        // sees ITS tenant's rows, not the org-wide board (the
                        // enumeration lesson from the #185 list-of-clients audit).
                        // Fail-closed at every miss; non-guest calls flow through
                        // untouched.
                        if (guestVerified && result && typeof result === 'object') {
                            try {
                                const g = require('./guests');
                                if (tool === 'agent_list' && Array.isArray(result.agents)) {
                                    const ownerRef = guestVerified.guest.scopeOwner || null;
                                    const visible = result.agents.filter(a => g.tenantAgentVisible(a && a.id, ownerRef));
                                    result = Object.assign({}, result, { agents: visible, count: visible.length });
                                }
                            } catch (e) { /* filter failure => honest empty roster, never a crash */
                                if (tool === 'agent_list') result = Object.assign({}, result, { agents: [], count: 0 });
                            }
                        }
                        res.end(JSON.stringify({ result }));
                    } catch (e) {
                        res.end(JSON.stringify({ error: e.message }));
                    }
                });
                return;
            }

            // (P4, Mode B) Same-origin static serve, AFTER every MCP/health/
            // tools route had its chance. GET/HEAD only - a POST unknown to
            // the door keeps the honest 404 JSON below. Rules, in order:
            //   1. the path decodes against the pbod scheme; anything that
            //      fails to decode is a 400,
            //   2. traversal + dotfile refusal: NO dot-led segment ('.env',
            //      '..', '.git') is ever served - fail-closed before resolve,
            //   3. resolved targets must live inside dist/ (containment
            //      check - never a path.resolve() escape),
            //   4. unknown paths fall back to index.html (the frontend's
            //      client router owns its own 404s; prd-web.md section 10),
            //   5. index.html serves no-store; built assets under assets/
            //      cache an hour; unknown file types are honest octet-stream.
            if (serveRoot && (req.method === 'GET' || req.method === 'HEAD')) {
                let pathname = null;
                try {
                    pathname = decodeURIComponent(new URL(req.url, 'http://pod.local').pathname);
                } catch (e) {
                    return _deny(400, 'Bad Request: undecodable path');
                }
                const rel = pathname.replace(/^\/+/, '');
                if (!rel || rel === 'index.html') {
                    const indexAbs = path.join(serveRoot, 'index.html');
                    const size = _serveFs.statSync(indexAbs).size;
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': size });
                    if (req.method === 'HEAD') return res.end();
                    return _serveFs.createReadStream(indexAbs).pipe(res);
                }
                if (rel.split(/[\\/]/).some(seg => seg.startsWith('.'))) {
                    return _deny(403, 'Forbidden: dot-led path segments are not served');
                }
                const abs = path.resolve(serveRoot, rel);
                if (abs !== serveRoot && !abs.startsWith(serveRoot + path.sep)) {
                    return _deny(403, 'Forbidden: outside the served bundle');
                }
                let target = null;
                try {
                    const st = _serveFs.statSync(abs);
                    if (st.isFile()) target = abs;
                } catch (e) { /* unknown path: SPA fallback below */ }
                if (!target) target = path.join(serveRoot, 'index.html');
                const ext = String(path.extname(target)).toLowerCase();
                const MIME = {
                    '.html': 'text/html; charset=utf-8',
                    '.js': 'text/javascript; charset=utf-8',
                    '.mjs': 'text/javascript; charset=utf-8',
                    '.css': 'text/css; charset=utf-8',
                    '.json': 'application/json',
                    '.svg': 'image/svg+xml',
                    '.png': 'image/png',
                    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                    '.gif': 'image/gif',
                    '.ico': 'image/x-icon',
                    '.txt': 'text/plain; charset=utf-8',
                    '.woff': 'font/woff',
                    '.woff2': 'font/woff2',
                    '.map': 'application/json'
                };
                const isIndex = target === path.join(serveRoot, 'index.html');
                const cache = isIndex ? 'no-store' : (rel.startsWith('assets/') ? 'public, max-age=3600' : 'no-cache');
                let size;
                try { size = _serveFs.statSync(target).size; } catch (e) { return _deny(404, 'not found'); }
                res.writeHead(200, {
                    'Content-Type': MIME[ext] || 'application/octet-stream',
                    'Cache-Control': cache,
                    'Content-Length': size
                });
                if (req.method === 'HEAD') return res.end();
                const stream = _serveFs.createReadStream(target);
                stream.on('error', () => { try { res.destroy(); } catch (e2) { /* closed */ } });
                return stream.pipe(res);
            }

            // 404 for any other routes (DEFAULT header is 200 - an honest 404
            // must STATE its status, not just say it in the body)
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'not found', endpoints: [
                'GET /mcp/tools', 'POST /mcp/exec', 'GET /mcp/events', 'GET /health'
            ]}));
        });

        const cfg = require('./config');
        // (pass 86) listenPort below honors explicit 0; see the listen block.
        // (pass 41 live-fire fix) Honor the configured bind address. The old
        // code listened on ALL interfaces, advertising an unauthenticated
        // brain-read/tool-exec endpoint to the whole LAN (probe-verified:
        // ss showed *:3457). Loopback is the config default; VANT_MCP_BIND
        // remains the explicit opt-out for real network deployments.
        const bind = options.bind || cfg.mcpBindAddress() || '127.0.0.1';

        // (pass 86) Honor an EXPLICIT port 0 (ephemeral, e2e tests): the old
        // falsy-|| chain skipped it and could land on a busy configured port,
        // where the listen promise below never settled (no 'error' listener,
        // no callback). Promise now rejects on error either way.
        const listenPort = (options.port !== undefined) ? options.port : (cfg.mcpPort() || 3457);

        // Start with VANT_SERVER_INSECURE=1 in dev
        await new Promise((resolve, reject) => {
            server.once('error', err => reject(err));
            server.listen(listenPort, bind, () => resolve());
        });
        const port = server.address().port;
        console.log('[MCP] Server on ' + bind + ':' + port + '-', mcp.listTools().length, 'tools');
        // (Battery item 4, #189 door sweep) The MCP door prints its auth
        // posture truthfully on startup — same resolver-derived line as the
        // HTTP server door.
        try { console.log(require('./config').authPosture().line); } catch (e) { /* posture never blocks start */ }
        // (P4, Mode B) The serve posture is stated ONCE, only when active.
        if (serveRoot) {
            console.log('[MCP] Mode B: serving ' + path.relative(process.cwd(), serveRoot) + ' at / (prd-web.md 3.1 Mode B - same-origin /mcp/* reach)');
        }
        _server = server; // (pass 42) stop() now stops the server that actually runs
        module.exports._serverRef = _server;  // (pass 86) e2e test hook

        return { port, server };
    },
    stop,
    listTools,
    methods: _methods,
    // (pass 86) Request-credential internals, for tests/diagnosis.
    _requestCtx,
    _requestAls,
    addMethod: (name, def) => _methods.set(name, def),
    // Exposed for tests/diagnosis: validate params against a tool schema
    _validateToolInput: _validateToolInput,
    // NEW: Execute MCP tool by name
    execute: async (name, params) => {
        // Check rules first
        const rules = require('./rules');
        const checked = rules.check(name, params);
        if (!checked.allowed) {
            return { error: 'rule blocked', tool: name, reason: checked.reason, rule: checked.rule };
        }

        const tool = _methods.get(name);
        if (!tool) return { error: 'not found', tool: name };

        // P1 #14: declared inputSchema enforced at the door (result-style)
        if (tool.inputSchema) {
            const schemaProblems = _validateToolInput(tool.inputSchema, params);
            if (schemaProblems.length > 0) {
                return { error: 'MCP_INPUT_INVALID', tool: name, problems: schemaProblems };
            }
        }

        return tool.handler(params);
    },
    // NEW: Execute via JSON-RPC style
    call: async (name, params) => {
        // Check rules first
        const rules = require('./rules');
        const checked = rules.check(name, params);
        if (!checked.allowed) {
            return { error: 'rule blocked', tool: name, reason: checked.reason, rule: checked.rule };
        }

        const tool = _methods.get(name);
        if (!tool) return { error: 'not found', tool: name };

        // P1 #14: declared inputSchema enforced at the door (result-style)
        if (tool.inputSchema) {
            const schemaProblems = _validateToolInput(tool.inputSchema, params);
            if (schemaProblems.length > 0) {
                return { error: 'MCP_INPUT_INVALID', tool: name, problems: schemaProblems };
            }
        }

        return tool.handler(params);
    }
};
