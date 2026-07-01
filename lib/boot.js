/**
 * Vant Boot - Core Boot System (v0.8.6)
 * WITH EVENT EMISSIONS - layer initialization emits for observability
 * 
 * Replaces monolithic brain with islands (lazy-loaded components)
 * Used by vant.js, api.js, mcp.js
 * 
 * SECURITY LAYER BOOT ORDER (defense in depth):
 * 1. sudo    - Task permissions (must be first - others depend on it)
 * 2. sandbox - Capabilities
 * 3. qos     - Rate limits
 * 4. escrow  - Budget
 * 5. lock    - Concurrency
 * 6. audit   - Logging
 * 7. brain   - Memory (uses above layers)
 * 8. islands - Lazy components (uses brain)
 */

const islands = require('./islands');
const state = require('./storage').get('state');
const sudo = require('./sudo');
const shell = require('./shell');
const tmp = require('./tmp');

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

// ==================== BOOT SEQUENCE ====================

const _bootState = {
    initialized: false,
    layers: [],
    error: null,
    startTime: null,
    taskId: null
};

/**
 * Initialize runtime - boot all security layers in correct order
 * @param {Object} options - { taskId, scopes, debug }
 * @returns {Promise<Object>} Boot result
 */
async function init(options = {}) {
    const { taskId = 'default', scopes = ['read'], debug = false } = options;
    
    // EVENT: boot:starting
    _emit('boot:starting', { taskId, scopes });
    
    if (_bootState.initialized && _bootState.taskId === taskId) {
        _emit('boot:already', { taskId, layers: _bootState.layers });
        return { alreadyInitialized: true, taskId, layers: _bootState.layers };
    }
    
    _bootState.startTime = Date.now();
    _bootState.taskId = taskId;
    _bootState.layers = [];
    _bootState.error = null;
    
    try {
        // 1. Create sudo task (foundation - others check sudo)
        if (debug) console.log('[boot] Creating task:', taskId, scopes);
        sudo.createTask(taskId, scopes);
        _bootState.layers.push('sudo');
        _emit('layer:loaded', { layer: 'sudo', order: 1, count: _bootState.layers.length });
        
        // 2. Brain pipeline (needed early for handler registration)
        if (debug) console.log('[boot] Init brain...');
        const brain = require('./brain');
        _bootState.layers.push('brain');
        
        // 3. Sandbox (capabilities)
        if (debug) console.log('[boot] Init sandbox...');
        const sandbox = require('./sandbox');
        if (sandbox.init) await sandbox.init();
        _bootState.layers.push('sandbox');
        _emit('layer:loaded', { layer: 'sandbox', order: 2, count: _bootState.layers.length });
        
        // 4. QoS (rate limits)
        if (debug) console.log('[boot] Init qos...');
        const qos = require('./qos');
        if (qos.init) await qos.init();
        _bootState.layers.push('qos');
        // Register with brain pipeline
        if (brain.register) brain.register('qos', qos);
        _emit('layer:loaded', { layer: 'qos', order: 3, count: _bootState.layers.length });
        
        // 5. Escrow (budget)
        if (debug) console.log('[boot] Init escrow...');
        const { Escrow } = require('./escrow');
        const esc = new Escrow();
        global._escrow = esc;
        _bootState.layers.push('escrow');
        // Register with brain pipeline
        if (brain.register) brain.register('escrow', esc);
        _emit('layer:loaded', { layer: 'escrow', order: 4, count: _bootState.layers.length });
        
        // 6. Lock (concurrency)
        if (debug) console.log('[boot] Init lock...');
        const lock = require('./lock');
        if (lock.init) await lock.init();
        _bootState.layers.push('lock');
        _emit('layer:loaded', { layer: 'lock', order: 5, count: _bootState.layers.length });
        
        // 6. Audit (logging)
        if (debug) console.log('[boot] Init audit...');
        const audit = require('./audit');
        if (audit.init) await audit.init();
        _bootState.layers.push('audit');
        _emit('layer:loaded', { layer: 'audit', order: 6, count: _bootState.layers.length });
        
        // 7. Brain (memory - uses security layers below)
        if (debug) console.log('[boot] Init brain...');
        // brain already loaded earlier for handler registration
        if (brain.init) await brain.init();
        _bootState.layers.push('brain');
        _emit('layer:loaded', { layer: 'brain', order: 7, count: _bootState.layers.length });
        
        // 8. Islands (lazy components)
        if (debug) console.log('[boot] Init islands...');
        _bootState.layers.push('islands');
        _emit('layer:loaded', { layer: 'islands', order: 8, count: _bootState.layers.length });
        
        // 9. Sync task context to modules
        shell.setTaskId(taskId);
        tmp.setTaskId(taskId);
        
        _bootState.initialized = true;
        
        // EVENT: boot:complete
        _emit('boot:complete', { taskId, layers: _bootState.layers.length, uptime: Date.now() - _bootState.startTime });
        
        return {
            success: true,
            taskId,
            layers: _bootState.layers,
            uptime: Date.now() - _bootState.startTime
        };
        
    } catch (e) {
        _bootState.error = e.message;
        return { error: e.message, taskId, layers: _bootState.layers };
    }
}

/**
 * Get boot status
 */
function getStatus() {
    return {
        initialized: _bootState.initialized,
        taskId: _bootState.taskId,
        layers: _bootState.layers,
        error: _bootState.error,
        uptime: _bootState.startTime ? Date.now() - _bootState.startTime : 0
    };
}

/**
 * Check if initialized
 */
function isInitialized() {
    return _bootState.initialized;
}

/**
 * Reset boot state
 */
async function reset() {
    _bootState.initialized = false;
    _bootState.layers = [];
    _bootState.error = null;
    _bootState.startTime = null;
    _bootState.taskId = null;
    
    sudo.reset();
    
    return { reset: true };
}

/**
 * Get layer status for all layers
 */
function getLayerStatus() {
    return {
        sudo: sudo.getLayerStatus(),
        sandbox: require('./sandbox').getLayerStatus?.() || { name: 'Sandbox', enabled: true },
        qos: require('./qos').getLayerStatus?.() || { name: 'QoS', enabled: true },
        escrow: (global._escrow?.getLayerStatus || (() => ({ name: 'Escrow', enabled: true })))(),
        lock: require('./lock').getLayerStatus?.() || { name: 'Lock', enabled: true },
        audit: require('./audit').getLayerStatus?.() || { name: 'Audit', enabled: true },
        brain: require('./brain').getLayerStatus?.() || { name: 'Brain', enabled: true },
        islands: islands.getLayerStatus?.() || { name: 'Islands', enabled: true },
        shell: shell.getLayerStatus(),
        tmp: tmp.getLayerStatus()
    };
}

/**
 * Boot from prompt (auto-hydrate islands)
 * @param {string} prompt - User prompt
 * @returns {Promise<Object>} Boot result
 */
async function boot(prompt) {
    const toHydrate = islands.autoHydrate(prompt || 'identity');
    for (const name of toHydrate) {
        islands.hydrate(name);
    }
    return {
        mode: 'islands',
        hydrated: toHydrate,
        available: islands.getAvailable(),
        state: state.get('current')
    };
}

/**
 * Boot specific island
 * @param {string} name - Island name
 * @returns {string[]} Hydrated files
 */
async function hydrate(name) {
    return islands.hydrate(name);
}

/**
 * Get available islands
 * @returns {string[]} Island names
 */
function getAvailable() {
    return islands.getAvailable();
}

/**
 * Get boot state (for system.js visibility)
 */
function getBootState() {
    return {
        initialized: _bootState.initialized,
        layers: _bootState.layers,
        error: _bootState.error,
        startTime: _bootState.startTime,
        taskId: _bootState.taskId
    };
}

/**
 * Get hydrated islands
 * @returns {string[]} Hydrated island names
 */
function getHydrated() {
    return islands.getHydrated();
}

/**
 * Get islands manifest
 * @returns {Object} Manifest
 */
function getManifest() {
    return islands.getManifest();
}

/**
 * Boot with prompt (CLI compatible)
 * @param {string} prompt - User prompt
 * @returns {Promise<Object>} Boot result
 */
async function main(prompt) {
    audit.info('[Boot] Componentized Brain');
    audit.info('[Boot] =====================\n');
    
    const result = await boot(prompt);
    
    audit.info('\n[Boot] Ready');
    return result;
}

module.exports = { 
    // Boot sequence
    init,
    getStatus,
    isInitialized,
    reset,
    getLayerStatus,
    getBootState,  // NEW: for system.js visibility
    
    // Islands boot (original)
    boot, 
    hydrate, 
    getAvailable, 
    getHydrated, 
    getManifest, 
    main 
};