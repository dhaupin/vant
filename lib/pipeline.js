/**
 * Pipeline (v0.9.0-axolotl)
 * Unified security pipeline for all brain operations
 *
 * Modes:
 * - public:  sandbox(read) → vaf → qos → escrow(read)
 * - private: sandbox → vaf → qos → escrow
 * - remote:  sandbox → vaf → qos → escrow
 * - dual:    public + private combined
 * - stack:   all brains in stack (iterates)
 *
 * Handler Interface:
 * - sandbox.can(capability) - capability check
 * - vaf.check(ctx)         - input validation (flexible ctx)
 * - qos.execute(ctx)       - rate limiting
 * - escrow.execute(ctx)     - operation approval
 *
 * RUNTIME OPERATOR (absorbed from runop.js):
 * - Layer initialization with gates
 * - State machine: stopped → starting → running → stopping → stopped
 */

const errors = require('./error');

// ==================== RUNTIME STATE ====================

let _state = {
    status: 'stopped',  // stopped | starting | running | stopping
    agentId: null,
    session: null,
    config: null,
    layers: {}
};

// ==================== DEPENDENCIES ====================

let _sandbox = null;
let _vaf = null;
let _qos = null;
let _escrow = null;
let _event = null;
let _brain = null;

// ==================== HANDLERS ====================

function _getSandbox() {
    if (!_sandbox) {
        try { _sandbox = require('./sandbox'); } catch (e) {}
    }
    return _sandbox;
}

// One-time warning flag for unconfigured-sandbox pipeline allowances
let _warnedUnconfiguredSandbox = false;

function _getVaf() {
    if (!_vaf) {
        try { _vaf = require('./vaf'); } catch (e) {}
    }
    return _vaf;
}

function _getQos() {
    if (!_qos) {
        try { _qos = require('./qos'); } catch (e) {}
    }
    return _qos;
}

function _getEscrow() {
    if (!_escrow) {
        try { _escrow = require('./escrow'); } catch (e) {}
    }
    return _escrow;
}

function _getBrain() {
    if (!_brain) {
        try { _brain = require('./brain'); } catch (e) {}
    }
    return _brain;
}

function _emit(event, data) {
    if (!_event) {
        try { _event = require('./event'); } catch (e) { return; }
    }
    if (_event && _event.emit) {
        _event.emit(event, data);
    }
}

// ==================== PIPELINE MODES ====================

const MODES = {
    PUBLIC: 'public',    // read-only operations
    PRIVATE: 'private', // read/write operations
    REMOTE: 'remote',   // remote brain operations
    DUAL: 'dual',       // public + private combined
    STACK: 'stack'      // all brains in stack
};

// Handler chains per mode
const MODE_CHAINS = {
    [MODES.PUBLIC]: [
        { name: 'sandbox', type: 'capability', capability: 'canRead' },
        { name: 'vaf', type: 'validate' },
        { name: 'qos', type: 'rateLimit' },
        { name: 'escrow', type: 'approve', readOnly: true }
    ],
    [MODES.PRIVATE]: [
        { name: 'sandbox', type: 'capability', capability: 'canWrite' },
        { name: 'vaf', type: 'validate' },
        { name: 'qos', type: 'rateLimit' },
        { name: 'escrow', type: 'approve' }
    ],
    [MODES.REMOTE]: [
        { name: 'sandbox', type: 'capability', capability: 'canRemote' },
        { name: 'vaf', type: 'validate' },
        { name: 'qos', type: 'rateLimit' },
        { name: 'escrow', type: 'approve' }
    ],
    [MODES.DUAL]: [
        // Run public then private
        { name: 'sandbox', type: 'capability', capability: 'canRead' },
        { name: 'vaf', type: 'validate' },
        { name: 'qos', type: 'rateLimit' },
        { name: 'escrow', type: 'approve', readOnly: true }
    ],
    [MODES.STACK]: [
        // Stack mode - iterate through all brains
        { name: 'sandbox', type: 'capability', capability: 'canRead' },
        { name: 'vaf', type: 'validate' },
        { name: 'qos', type: 'rateLimit' },
        { name: 'escrow', type: 'approve' }
    ]
};

// ==================== EXECUTION ====================

/**
 * Run a single handler
 * @private
 */
async function _runHandler(handlerConfig, ctx) {
    const { name, type, capability, readOnly } = handlerConfig;
    let handler = null;

    switch (name) {
        case 'sandbox':
            handler = _getSandbox();
            if (!handler) return true;

            if (capability) {
                // Capability check - DENY by default, but an untouched default
                // sandbox must not brick service flows for users who never
                // configured one (mirrors storage.js safe-by-default). A
                // sandbox explicitly configured via options or setScopes/
                // setCapabilities is enforced strictly.
                if (handler.can && !handler.can(capability)) {
                    const ds = handler.defaultSandbox;
                    const unconfigured = ds ? ds._explicitlyConfigured === false : false;
                    if (unconfigured) {
                        if (!_warnedUnconfiguredSandbox) {
                            _warnedUnconfiguredSandbox = true;
                            // eslint-disable-next-line no-console
                            console.warn('[pipeline] Sandbox not configured; pipeline allows by default. ' +
                                'Configure sandbox capabilities/scopes to enforce.');
                        }
                        return true;
                    }
                    throw new errors.Error(`Pipeline blocked: ${capability} denied`, {
                        code: errors.CODES.CAPABILITY_NOT_ALLOWED,
                        retryable: false
                    });
                }
            }
            return true;

        case 'vaf':
            handler = _getVaf();
            if (!handler) return true;

            if (handler.check) {
                // VAF validate - flexible ctx handled
                try {
                    handler.check(ctx, { mode: readOnly ? 'read' : 'strict' });
                } catch (e) {
                    _emit('pipeline:vaf:blocked', { ctx, error: e.message });
                    throw new errors.Error('Pipeline VAF blocked: ' + e.message, {
                        code: errors.CODES.VAF_INPUT_INVALID,
                        retryable: false
                    });
                }
            }
            return true;

        case 'qos':
            handler = _getQos();
            if (!handler) return true;

            if (handler.execute) {
                try {
                    await handler.execute(ctx);
                } catch (e) {
                    if (e.code === errors.CODES.RATE_LIMITED ||
                        e.code === errors.CODES.RATE_LIMIT_EXCEEDED) {
                        _emit('pipeline:qos:rate-limited', { ctx });
                        throw e;
                    }
                    throw e;
                }
            } else if (handler.QoS) {
                // QoS class with check method
                const qos = new handler.QoS({ maxPerMinute: 60, maxPerSecond: 10 });
                try {
                    await qos.check(ctx.operation || '_pipeline_', 'execute');
                } catch (e) {
                    _emit('pipeline:qos:rate-limited', { ctx });
                    throw new errors.Error('Pipeline rate limited', {
                        code: errors.CODES.RATE_LIMITED,
                        retryable: true
                    });
                }
            }
            return true;

        case 'escrow':
            handler = _getEscrow();
            if (!handler) return true;

            if (handler.execute) {
                try {
                    await handler.execute(ctx);
                } catch (e) {
                    _emit('pipeline:escrow:blocked', { ctx, error: e.message });
                    throw e;
                }
            }
            return true;

        default:
            console.warn('[PIPELINE] Unknown handler:', name);
            return true;
    }
}

/**
 * Main pipeline execution
 * @param {Object} ctx - Context with input, operation, etc
 * @param {Function} operation - Operation to run
 * @param {Object} options - Options: mode, stack, etc
 */
async function run(ctx, operation, options = {}) {
    const mode = options.mode || MODES.DUAL;
    const chain = MODE_CHAINS[mode] || MODE_CHAINS[MODES.DUAL];

    // Emit start
    _emit('pipeline:start', { ctx, mode, operation: ctx.operation });

    // Run handler chain
    for (const handlerConfig of chain) {
        await _runHandler(handlerConfig, ctx);
    }

    // Execute the actual operation
    const result = await operation();

    // Emit complete
    _emit('pipeline:complete', { ctx, mode, operation: ctx.operation });

    return result;
}

/**
 * Run pipeline across all brains in stack
 * @param {Object} ctx - Context
 * @param {Function} operation - Operation to run per brain
 * @param {Object} options - Options
 */
async function runStack(ctx, operation, options = {}) {
    const brain = _getBrain();
    if (!brain || !brain.getStack) {
        // No brain - just run once
        return await run(ctx, operation, { ...options, mode: MODES.PRIVATE });
    }

    const stack = brain.getStack();
    const results = [];

    for (const brainName of stack) {
        const brainCtx = {
            ...ctx,
            brain: brainName,
            operation: ctx.operation + ':' + brainName
        };

        // Push brain context
        if (brain.pushBrain) {
            brain.pushBrain(brainName);
        }

        try {
            const result = await run(brainCtx, operation, { ...options, mode: MODES.PRIVATE });
            results.push({ brain: brainName, success: true, result });
        } catch (e) {
            results.push({ brain: brainName, success: false, error: e.message });
        } finally {
            if (brain.removeBrain) {
                brain.removeBrain();
            }
        }
    }

    return results;
}

// ==================== UTILITIES ====================

/**
 * Get pipeline status
 */
function getStatus() {
    return {
        name: 'Pipeline',
        version: '0.9.0-axolotl',
        modes: Object.keys(MODES),
        handlers: {
            sandbox: !!_getSandbox(),
            vaf: !!_getVaf(),
            qos: !!_getQos(),
            escrow: !!_getEscrow()
        }
    };
}

/**
 * Get available modes
 */
function getModes() {
    return { ...MODES };
}

// ==================== RUNTIME OPERATOR ====================
// Absorbed from runop.js

/**
 * Get config gate value
 */
function _gate(cfg, path, defaultVal) {
    if (!cfg) return defaultVal;

    const shortKey = path.replace('layers.', '');

    if (cfg.getFlag) {
        const flag = cfg.getFlag(shortKey);
        if (flag !== null && flag !== undefined) return flag;
    }

    if (cfg.get) {
        const val = cfg.get(path);
        if (val !== null && val !== undefined) return val;
    }

    return defaultVal;
}

/**
 * Initialize runtime layers based on config gates
 */
async function initLayers(options = {}) {
    const { taskId = null, debug = false, config: cfg = null } = options;

    if (_state.status === 'running') {
        return { error: 'Already running', agentId: _state.agentId };
    }

    _state.status = 'starting';

    if (!cfg) {
        try { cfg = require('./config'); } catch (e) {}
    }
    _state.config = cfg;

    if (debug) console.log('[pipeline] Config:', cfg ? 'loaded' : 'none');

    const gates = {
        sudo: _gate(cfg, 'layers.sudo', true),
        sandbox: _gate(cfg, 'layers.sandbox', true),
        format: _gate(cfg, 'layers.format', true),
        qos: _gate(cfg, 'layers.qos', false),
        escrow: _gate(cfg, 'layers.escrow', false),
        audit: _gate(cfg, 'layers.audit', true),
        legal: _gate(cfg, 'layers.legal', true),
        mcp: _gate(cfg, 'layers.mcp', true),
        brain: _gate(cfg, 'layers.brain', true),
        consensus: _gate(cfg, 'layers.consensus', true)
    };

    if (debug) console.log('[pipeline] Gates:', JSON.stringify(gates));

    const layers = {};

    // Initialize gated layers
    if (gates.sudo) {
        try {
            layers.sudo = require('./sudo');
            await layers.sudo.init?.({ taskId, layers: ['read', 'write', 'exec', 'network'] });
        } catch (e) { if (debug) console.log('[pipeline] sudo:', e.message); }
    }

    if (gates.sandbox) {
        try {
            layers.sandbox = require('./sandbox');
            await layers.sandbox.init?.({ taskId });
        } catch (e) { if (debug) console.log('[pipeline] sandbox:', e.message); }
    }

    if (gates.qos) {
        try { layers.qos = require('./qos'); } catch (e) {}
    }

    if (gates.escrow) {
        try { layers.escrow = require('./escrow'); } catch (e) {}
    }

    if (gates.audit) {
        try { layers.audit = require('./audit'); } catch (e) {}
    }

    if (gates.legal) {
        try { layers.legal = require('./legal'); } catch (e) {}
    }

    if (gates.brain) {
        try { layers.brain = require('./brain'); } catch (e) {}
    }

    if (gates.consensus) {
        try { layers.consensus = require('./consensus'); } catch (e) {}
    }

    if (gates.mcp) {
        try {
            layers.mcp = require('./mcp');
            const port = cfg?.get?.('mcp.port') || 3457;
            await layers.mcp.start?.({ port });
        } catch (e) { if (debug) console.log('[pipeline] mcp:', e.message); }
    }

    _state.layers = layers;
    _state.status = 'running';

    return { started: true, status: _state.status, gates, layers: Object.keys(layers) };
}

/**
 * Run operation through runtime layers
 */
async function runtimeRun(operation, options = {}) {
    if (_state.status !== 'running') {
        return { error: 'Not running', status: _state.status };
    }

    const { debug = false } = options;

    try {
        if (_state.layers.sudo?.can && !_state.layers.sudo.can(operation)) {
            return { error: 'sudo denied', operation };
        }

        if (_state.layers.sandbox?.can && !_state.layers.sandbox.can(operation)) {
            return { error: 'sandbox denied', operation };
        }

        if (_state.layers.qos?.check) {
            const qosOk = await _state.layers.qos.check(operation);
            if (!qosOk) return { error: 'qos denied', operation };
        }

        if (_state.layers.escrow?.can && !_state.layers.escrow.can(operation)) {
            return { error: 'escrow denied', operation };
        }

        if (_state.layers.legal?.checkGate) {
            const legalCheck = _state.layers.legal.checkGate('run', operation);
            if (!legalCheck) {
                return { error: 'legal denied', blocked: true, operation };
            }
        }

        _emit('pipeline:executing', { operation });

        return { success: true, operation };

    } catch (e) {
        return { error: e.message, operation };
    }
}

/**
 * Stop runtime
 */
async function runtimeStop(options = {}) {
    if (_state.status === 'stopped') {
        return { alreadyStopped: true };
    }

    _state.status = 'stopping';

    if (_state.layers.mcp?.stop) {
        try { await _state.layers.mcp.stop(); } catch (e) {}
    }

    _state.layers = {};
    _state.status = 'stopped';

    return { stopped: true };
}

/**
 * Get runtime status
 */
function getRuntimeStatus() {
    return {
        status: _state.status,
        agentId: _state.agentId,
        session: _state.session,
        layers: Object.keys(_state.layers),
        gates: {
            sudo: !!_state.layers.sudo,
            sandbox: !!_state.layers.sandbox,
            qos: !!_state.layers.qos,
            escrow: !!_state.layers.escrow,
            audit: !!_state.layers.audit,
            mcp: !!_state.layers.mcp
        }
    };
}

// ==================== SECURITY CHAIN (B-2) ====================
//
// The ONE security chain (consolidates the divergent hand-rolled copies that
// used to live in brain.js and agents.js — see labs/COHESION_AUDIT.md B-2).
// Canonical sequence for brain/agent flows:
//
//   sandbox capability (safe-by-default) → vaf → qos → rls → escrow (writes)
//
// Contract:
//  - SECURITY DENIALS (capability, validation, rate-limit, rls, escrow)
//    throw VantError with a code — never swallowed.
//  - INFRASTRUCTURE unavailability (module missing/broken) degrades to
//    warn + allow for that layer only. Fail-open applies to broken plumbing,
//    never to a configured verdict.
//  - Returns { cleanup } — call to release the qos concurrency slot
//    (idempotent-safe). Callers that skip it leak the slot.
//
// Two fail-open bugs this chain fixes vs the old brain.js copy:
//  1. vaf.check THROWS its coded rejections (VAF_CONTENT_BLOCKED,
//     SECURITY_PATH_TRAVERSAL, ...). The old chain only rethrew
//     INPUT_VALIDATION_FAILED, so real rejections hit the catch branch and
//     were logged as "vaf check unavailable" — malicious content PASSED.
//  2. escrow canWrite returns { allowed, results } OBJECTS. The old chain
//     tested `if (!canWrite)` — an object denial was truthy and PASSED.

const _CHAIN_VAF_REJECT = (code) => {
    const c = String(code || '');
    return c.startsWith('VAF_') ||
        c === 'SECURITY_PATH_TRAVERSAL' ||
        c === 'INPUT_VALIDATION_FAILED';
};

async function runChain(operation, options = {}) {
    const { type = 'read', category = '', key = '', content = '' } = options;
    const isWrite = options.write === true ||
        type === 'write' || operation === 'write' || operation === 'save';

    // 0. Sandbox capability gate — the layer the old hand-rolled chains
    //    skipped entirely. Safe-by-default: an untouched (never-configured)
    //    sandbox allows with a one-time warning (gate.js handles both);
    //    an explicitly configured sandbox is enforced strictly.
    try {
        const gate = require('./gate');
        if (gate && gate.requireCapability) {
            gate.requireCapability(isWrite ? 'canWrite' : 'canRead', {
                scope: options.scope || 'brain',
                operation
            });
        }
    } catch (e) {
        if (e.code === 'CAPABILITY_NOT_ALLOWED') throw e;
        console.warn('[pipeline] capability gate unavailable:', e.message);
    }

    // 1. VAF: input validation. check() throws its own coded verdicts —
//    those ARE the security decision and must propagate (fix #1).
    try {
        const vaf = require('./vaf');
        if (vaf && vaf.check) {
            vaf.check(
                JSON.stringify({ category, key, content: content ? content.slice(0, 500) : content }),
                { mode: isWrite ? 'strict' : 'read' }
            );
        }
    } catch (e) {
        if (_CHAIN_VAF_REJECT(e.code)) throw e;
        console.warn('[pipeline] vaf check unavailable:', e.message);
    }

    // 2. QoS: concurrency slot + write size limit
    let qosCleanup = null;
    try {
        const qos = require('./qos');
        if (qos && qos.canProceed) {
            if (!qos.canProceed()) {
                _emit('pipeline:chain:throttled', { operation, timestamp: Date.now() });
                throw new errors.VantError('Circuit breaker open', { code: errors.CODES.CIRCUIT_BREAKER_OPEN });
            }
            if (isWrite && content) {
                const sizeCheck = qos.checkInputSize(JSON.stringify({ category, key, content }));
                if (sizeCheck && !sizeCheck.valid) {
                    throw new errors.VantError('Input too large', { code: errors.CODES.VAF_TOO_LONG });
                }
            }
            qos.incrementActive();
            qosCleanup = () => qos.decrementActive();
        }
    } catch (e) {
        if (qosCleanup) qosCleanup();
        if (e.code === errors.CODES.CIRCUIT_BREAKER_OPEN || e.code === errors.CODES.VAF_TOO_LONG) throw e;
        console.warn('[pipeline] qos check unavailable:', e.message);
    }

    // 3. RLS: row-level permission (reads and writes). Denials may be
    //    boolean false OR { allowed: false } shapes — accept both.
    try {
        const rls = require('./rls');
        if (rls && (rls.checkRead || rls.checkWrite)) {
            const userCtx = options.userCtx || {};
            const hasSubject = !!(userCtx.userId || userCtx.workspace ||
                (Array.isArray(userCtx.roles) && userCtx.roles.length));
            if (hasSubject) {
                // RLS judges a user context. No user in the context (bare CLI
                // call, internal job) means there is no RLS subject to check,
                // so skip instead of denying every anonymous write (which
                // fired a misleading "rls check unavailable: Access denied"
                // warning on every local write).
                const resource = options.category || options.key || 'brain';
                const op = isWrite ? 'write' : 'read';
                const checkFn = isWrite ? (rls.checkWrite || rls.checkRead) : (rls.checkRead || rls.checkWrite);
                const permitted = await checkFn.call(rls, userCtx, resource, op);
                const denied = permitted === false ||
                    (permitted && typeof permitted === 'object' && permitted.allowed === false);
                if (denied) {
                    if (qosCleanup) qosCleanup();
                    _emit('pipeline:chain:rls-denied', { operation, category, key, timestamp: Date.now() });
                    throw new errors.VantError('RLS: Access denied', { code: errors.CODES.ESCROW_DENIED });
                }
            }
        }
    } catch (e) {
        if (qosCleanup) qosCleanup();
        if (e.code === errors.CODES.ESCROW_DENIED) throw e;
        console.warn('[pipeline] rls check unavailable:', e.message);
    }

    // 4. Escrow: write approval. canWrite returns { allowed, results } —
    //    judge the .allowed flag, never truthiness of the object (fix #2).
    if (isWrite) {
        try {
            const escrow = require('./escrow');
            if (escrow && escrow.create) {
                const escrowInstance = escrow.create({ habitat: options.habitat || 'default' });
                if (escrowInstance && escrowInstance.canWrite) {
                    const verdict = await escrowInstance.canWrite(options.userCtx || {}, { category, key });
                    const allowed = verdict === true ||
                        (verdict && typeof verdict === 'object' && verdict.allowed === true);
                    if (!allowed) {
                        if (qosCleanup) qosCleanup();
                        _emit('pipeline:chain:escrow-denied', { operation, category, key, timestamp: Date.now() });
                        throw new errors.VantError('Write not permitted', { code: errors.CODES.ESCROW_DENIED });
                    }
                }
            }
        } catch (e) {
            if (e.code === errors.CODES.ESCROW_DENIED) {
                if (qosCleanup) qosCleanup();
                throw e;
            }
            console.warn('[pipeline] escrow check unavailable:', e.message);
        }
    }

    return { cleanup: qosCleanup || (() => {}) };
}

// ==================== EXPORTS ====================

module.exports = {
    // Middleware pipeline executor (used by all services)
    run,
    runStack,

    // The single security chain (B-2) — brain/agent flows
    runChain,

    // Modes
    MODES,
    getModes,

    // Middleware status
    getStatus,

    // Runtime operator (runop) - explicit names, never shadow middleware `run`
    initLayers,
    runtimeRun,
    runtimeStop,
    runtimeStatus: getRuntimeStatus,

    // Constants for other modules
    PUBLIC: MODES.PUBLIC,
    PRIVATE: MODES.PRIVATE,
    REMOTE: MODES.REMOTE,
    DUAL: MODES.DUAL,
    STACK: MODES.STACK
};
