/**
 * Vant Runtime Operator (runop.js)
 * 
 * Agent lifecycle manager - handles start→run→stop state machine
 * Composable with config gates for which layers to enable
 */

let _state = {
    status: 'stopped',  // stopped | starting | running | stopping
    agentId: null,
    session: null,
    config: null,
    layers: {}
};

/**
 * Get config gate value
 * Use getFlag to track explicit settings, fall back to default
 */
function _gate(cfg, path, defaultVal) {
    if (!cfg) return defaultVal;
    
    const shortKey = path.replace('layers.', '');
    
    // Use getFlag - returns true/false if explicitly set, null if unset
    if (cfg.getFlag) {
        const flag = cfg.getFlag(shortKey);
        if (flag !== null && flag !== undefined) return flag;
    }
    
    // Fall back to config.get
    if (cfg.get) {
        const val = cfg.get(path);
        if (val !== null && val !== undefined) return val;
    }
    
    // Return default
    return defaultVal;
}

/**
 * Initialize runtime operator
 */
async function init(options = {}) {
    const { taskId = null, debug = false, config: cfg = null } = options;
    
    if (_state.status === 'running') {
        return { error: 'Already running', agentId: _state.agentId };
    }
    
    _state.status = 'starting';
    
    // Load config if not provided
    if (!cfg) {
        try { cfg = require('./config'); } catch (e) { console.log('[runop] config error:', e.message); }
    }
    _state.config = cfg;
    
    if (debug) console.log('[runop] Config:', cfg ? 'loaded' : 'none');

    // Check config gates
    const gates = {
        sudo: _gate(cfg, 'layers.sudo', true),
        sandbox: _gate(cfg, 'layers.sandbox', true),
        format: _gate(cfg, 'layers.format', true),
        qos: _gate(cfg, 'layers.qos', false),
        escrow: _gate(cfg, 'layers.escrow', false),
        audit: _gate(cfg, 'layers.audit', true),
        mcp: _gate(cfg, 'layers.mcp', true),
        brain: _gate(cfg, 'layers.brain', true),
        msg: _gate(cfg, 'layers.msg', false),
        cron: _gate(cfg, 'layers.cron', false)
    };

    if (debug) {
        console.log('[runop] Gates:', JSON.stringify(gates));
        if (cfg?.isEnabled) console.log('[runop] isEnabled(mcp):', cfg.isEnabled('mcp'));
    }

    // Initialize gated layers
    const layers = {};

    // Core: sudo
    if (gates.sudo) {
        try {
            layers.sudo = require('./sudo');
            await layers.sudo.init?.({ taskId, layers: ['read', 'write', 'exec', 'network'] });
            if (debug) console.log('[runop] sudo: OK');
        } catch (e) {
            if (debug) console.log('[runop] sudo:', e.message);
        }
    }
    
    // Core: sandbox
    if (gates.sandbox) {
        try {
            layers.sandbox = require('./sandbox');
            await layers.sandbox.init?.({ taskId });
            if (debug) console.log('[runop] sandbox: OK');
        } catch (e) {
            if (debug) console.log('[runop] sandbox:', e.message);
        }
    }
    
    // Utility: format (Tier 1 - no boot dependency)
    if (gates.format) {
        try {
            layers.format = require('./format');
            if (debug) console.log('[runop] format: OK');
        } catch (e) {
            if (debug) console.log('[runop] format:', e.message);
        }
    }
    
    // Security: qos
    if (gates.qos) {
        try {
            layers.qos = require('./qos');
            await layers.qos.init?.();
            if (debug) console.log('[runop] qos: OK');
        } catch (e) {
            if (debug) console.log('[runop] qos:', e.message);
        }
    }
    
    // Security: escrow
    if (gates.escrow) {
        try {
            layers.escrow = require('./escrow');
            await layers.escrow.init?.();
            if (debug) console.log('[runop] escrow: OK');
        } catch (e) {
            if (debug) console.log('[runop] escrow:', e.message);
        }
    }
    
    // Audit
    if (gates.audit) {
        try {
            layers.audit = require('./audit');
            await layers.audit.init?.();
            if (debug) console.log('[runop] audit: OK');
        } catch (e) {
            if (debug) console.log('[runop] audit:', e.message);
        }
    }
    
    // Brain
    if (gates.brain) {
        try {
            layers.brain = require('./brain');
            if (debug) console.log('[runop] brain: OK');
        } catch (e) {
            if (debug) console.log('[runop] brain:', e.message);
        }
    }
    
    // MCP
    if (gates.mcp) {
        try {
            layers.mcp = require('./mcp');
            const port = cfg?.get?.('mcp.port') || 3100;
            await layers.mcp.start?.({ port });
            if (debug) console.log('[runop] mcp: OK on', port);
        } catch (e) {
            if (debug) console.log('[runop] mcp:', e.message);
        }
    }
    
    _state.layers = layers;
    _state.status = 'running';
    
    return { started: true, status: _state.status, gates, layers: Object.keys(layers) };
}

/**
 * Run operation through layers
 */
async function run(operation, options = {}) {
    if (_state.status !== 'running') {
        return { error: 'Not running', status: _state.status };
    }
    
    const { debug = false } = options;
    const startTime = Date.now();
    
    try {
        // Through sudo
        if (_state.layers.sudo?.can && !_state.layers.sudo.can(operation)) {
            return { error: 'sudo denied', operation };
        }
        
        // Through sandbox
        if (_state.layers.sandbox?.can && !_state.layers.sandbox.can(operation)) {
            return { error: 'sandbox denied', operation };
        }
        
        // Through qos
        if (_state.layers.qos?.check) {
            const qosOk = await _state.layers.qos.check(operation);
            if (!qosOk) return { error: 'qos denied', operation };
        }
        
        // Through escrow
        if (_state.layers.escrow?.can && !_state.layers.escrow.can(operation)) {
            return { error: 'escrow denied', operation };
        }
        
        const result = { success: true, operation, duration: Date.now() - startTime };
        
        // Audit
        _state.layers.audit?.log?.(operation, 'run', result);
        
        return result;
        
    } catch (e) {
        return { error: e.message, operation };
    }
}

/**
 * Stop runtime
 */
async function stop(options = {}) {
    const { debug = false } = options;
    
    if (_state.status === 'stopped') {
        return { alreadyStopped: true };
    }
    
    _state.status = 'stopping';
    
    // Stop MCP
    if (_state.layers.mcp?.stop) {
        try { await _state.layers.mcp.stop(); } catch (e) {}
    }
    
    _state.layers = {};
    _state.status = 'stopped';
    
    return { stopped: true };
}

/**
 * Get status
 */
function getStatus() {
    return {
        status: _state.status,
        agentId: _state.agentId,
        session: _state.session,
        layers: Object.keys(_state.layers),
        gates: {
            sudo: !!_state.layers.sudo,
            sandbox: !!_state.layers.sandbox,
            format: !!_state.layers.format,
            qos: !!_state.layers.qos,
            escrow: !!_state.layers.escrow,
            audit: !!_state.layers.audit,
            mcp: !!_state.layers.mcp
        }
    };
}

module.exports = { init, run, stop, getStatus };