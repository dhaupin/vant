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

const vant = require('./vant');
const path = require('path');

// v0.9.0 fs->storage migration (slice 5): MCP's own file-backed stores, the
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
const theme = require('./theme');
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

// Layout migration status (v0.9.0-axolotl): agents and MCP clients can
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
            scope: { type: 'object', description: 'Agora scope: { owner: "org:id|dept:id|team:id|agent:id", visibility: "scope|public" }' }
        },
        required: ['proposal']
    },
    handler: async ({ proposal, options, minQuorum, useTrustWeight, deadline, scope }) => {
        return await _forum.vote(proposal, {
            options,
            minQuorum,
            useTrustWeight,
            deadline,
            scope
        });
    }
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
            options: { type: 'array', items: { type: 'string' } },
            minQuorum: { type: 'number' },
            useTrustWeight: { type: 'boolean' },
            deadline: { type: 'number' },
            scope: { type: 'object', description: 'Agora scope: { owner: "org:id|dept:id|team:id|agent:id", visibility: "scope|public" }' }
        },
        required: ['topic', 'options']
    },
    handler: async ({ topic, options, minQuorum, useTrustWeight, deadline, scope }) => {
        return await _consensus.create(topic, {
            options,
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

_methods.set('qos_withTimeout', {
    description: 'Execute with timeout',
    inputSchema: {
        type: 'object',
        properties: {
            ms: { type: 'number', default: 30000 },
            task: { type: 'string', description: 'Task name' }
        },
        required: ['task']
    },
    handler: async ({ ms = 30000, task }) => {
        return { timeout: ms, task, allowed: true };
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
    handler: async ({ channel, content, from = 'agent' }) => {
        return await _msg.send(channel, content, from);
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
    handler: async ({ channel, limit = 50 }) => {
        return await _msg.list(channel, limit);
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
        return await _sudo.grant(agentId, capability);
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
    handler: async ({ token, permission }) => {
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
    handler: async ({ id, interval = 60000, enabled = true }) => {
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
    handler: async ({ name, type }) => {
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
        const recipients = [];
        const insightsRel = path.join('public', 'insights.json');

        // Read existing insights (through storage layer)
        let insights = [];
        if (_mcpStore.has(insightsRel)) {
            try { insights = JSON.parse(_mcpStore.read(insightsRel)); } catch (e) { console.warn("[mcp] Parse error:", e.message); }
        }

        // Embed the insight
        const insightVec = await embed.generate(insight);

        // Find matching agents
        const agentsDir = path.join(_MCP_ROOT, 'agents');
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

        insights.unshift(newInsight);
        insights = insights.slice(0, 100); // Keep last 100

        _mcpStore.write(insightsRel, JSON.stringify(insights, null, 2));

        return {
            shared: true,
            insight: newInsight.id,
            source,
            tags,
            recipients: scores.slice(0, 3).map(s => s.name),
            totalInsights: insights.length
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
    description: 'Acquire/release brain lock',
    inputSchema: {
        type: 'object',
        properties: {
            action: { type: 'string', enum: ['acquire', 'release', 'status', 'force'], description: 'Lock operation' },
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
                return { action, status: lock.brainLockStatus() };
            case 'force':
                return { action, forceReleased: lock.forceReleaseBrainLock() };
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
        const islands = _islands();
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

// NEW: Citations MCP tools
_methods.set('vant_citations_list', {
    description: 'List citations',
    inputSchema: { type: 'object' },
    handler: async () => {
        const citations = _citations();
        return { sources: citations.listSources?.() || [] };
    }
});

_methods.set('vant_citations_add', {
    description: 'Add citation source',
    inputSchema: { type: 'object', properties: { commit: { type: 'string' }, context: { type: 'string' } }, required: ['commit'] },
    handler: async ({ commit, context }) => {
        const citations = _citations();
        return { commit, context, added: true };
    }
});

_methods.set('vant_citations_format', {
    description: 'Format citation',
    inputSchema: { type: 'object', properties: { commit: { type: 'string' } }, required: ['commit'] },
    handler: async ({ commit }) => {
        return { citation: `[Source: ${commit}]` };
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
        const connector = require('./connector');
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
        const result = await brain.backupToImage(path);
        return { status: 'backed_up', path };
    }
});

_methods.set('vant_brain_restore', {
    description: 'Restore brain from image',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
    handler: async ({ path }) => {
        const brain = _brain();
        const result = await brain.restoreFromImage(path);
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

_methods.set('vant_resolution_track', {
    description: 'Track decision',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, outcome: { type: 'string' } }, required: ['id', 'outcome'] },
    handler: async ({ id, outcome }) => ({ id, outcome, status: 'tracked' })
});

_methods.set('vant_stego_encode', {
    description: 'Encode PNG stego',
    inputSchema: { type: 'object', properties: { image: { type: 'string' }, message: { type: 'string' } } },
    handler: async ({ image, message }) => ({ status: 'encoded' })
});

_methods.set('vant_stego_decode', {
    description: 'Decode PNG stego',
    inputSchema: { type: 'object', properties: { image: { type: 'string' } } },
    handler: async ({ image }) => ({ message: '' })
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
        return { key, value: cfg.get(key, null, { brain }), brain };
    }
});

_methods.set('vant_config_set', {
    description: 'Set a config value (persists into the current brain config; runtime flag too)',
    inputSchema: { type: 'object', properties: { key: { type: 'string' }, value: { type: 'string' } }, required: ['key', 'value'] },
    handler: async ({ key, value }) => require('./config').setConfig(key, value)
});

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
    description: 'Semantic search using embeddings',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] },
    handler: async ({ query, limit = 10 }) => {
        const search = _search();
        try {
            const results = await search.semantic(query, { limit });
            return { query, results: results.slice(0, limit) };
        } catch(e) {
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

_methods.set('stream_watch', {
    description: 'Watch stream events',
    inputSchema: { type: 'object', properties: { event: { type: 'string' } }, required: ['event'] },
    handler: async (p) => ({ watching: p.event })
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
function autoWireCoreLibs() {
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
// v0.9.0-axolotl SECURITY: these tools previously took uncontained caller
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
        const memory = require('./memory');
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

module.exports = {
    start: async (options = {}) => {
        const http = require('http');
        const mcp = require('./mcp');

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

            // MCP endpoints
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
                        const bearer = String(req.headers['authorization'] || '').replace(/^Bearer /i, '').trim();
                        const cand = bearer.startsWith('vant_') ? bearer
                            : (typeof req.headers['x-habitat-token'] === 'string' ? req.headers['x-habitat-token'].trim() : '');
                        if (!(cand && _tokenToContext(cand))) {
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
                req.on('data', c => body += c);
                req.on('end', async () => {
                    try {
                        const input = JSON.parse(body);
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
                        const bearer = String(req.headers['authorization'] || '').replace(/^Bearer /i, '').trim();
                        const habitatToken = bearer.startsWith('vant_') ? bearer
                            : (typeof req.headers['x-habitat-token'] === 'string' ? req.headers['x-habitat-token'].trim() : '');
                        const verifiedCtx = habitatToken ? _tokenToContext(habitatToken) : null;
                        const result = await _requestAls.run({ verifiedCtx, token: habitatToken || null }, async () =>
                            await mcp.execute(tool, args)
                        );
                        res.end(JSON.stringify({ result }));
                    } catch (e) {
                        res.end(JSON.stringify({ error: e.message }));
                    }
                });
                return;
            }

            // 404 for any other routes
            res.end(JSON.stringify({ error: 'not found', endpoints: [
                'GET /mcp/tools', 'POST /mcp/exec'
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
