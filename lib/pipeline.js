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
 */

const errors = require('./error');

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
                // Capability check
                if (handler.can && !handler.can(capability)) {
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

// ==================== EXPORTS ====================

module.exports = {
    // Core
    run,
    runStack,
    
    // Modes
    MODES,
    getModes,
    
    // Status
    getStatus,
    
    // Constants for other modules
    PUBLIC: MODES.PUBLIC,
    PRIVATE: MODES.PRIVATE,
    REMOTE: MODES.REMOTE,
    DUAL: MODES.DUAL,
    STACK: MODES.STACK
};
