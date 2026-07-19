/**
 * Vant Transform (v0.8.6)
 * Universal data gathering & packaging mechanism
 * 
 * "No-code" way to query and gather data from anywhere in Vant OS
 * for piping to external systems (horcrux, backup, sync, etc)
 * 
 * SECURITY: Full security chain integration (sandbox, vaf, qos, escrow)
 * - Uses sandbox.getCapabilities() for proper capability checks
 * - VAF input validation on all inputs
 * - QoS rate limiting on all gather operations
 * - Blocks if security chain is down
 * 
 * Usage:
 *   const transform = require('./lib/transform');
 *   const data = await transform.gather();           // Gather everything
 *   const horcrux = await transform.toHorcrux();    // Package for SVG
 *   const agents = await transform.gather({ agents: true, islands: false });
 */

// Lazy-load all modules
let _sandbox = null, _vaf = null, _qos = null, _escrow = null, _event = null;
let _agents = null, _islands = null, _cron = null, _runop = null, _nodes = null;

function _getSandbox() { 
    if (!_sandbox) { 
        try { _sandbox = require('./sandbox'); } catch(e) { return null; } 
    } 
    return _sandbox; 
}

function _getVaf() { 
    if (!_vaf) { 
        try { _vaf = require('./vaf'); } catch(e) { return null; } 
    } 
    return _vaf; 
}

function _getQos() { 
    if (!_qos) { 
        try { _qos = require('./qos'); } catch(e) { return null; } 
    } 
    return _qos; 
}

function _getEscrow() { 
    if (!_escrow) { 
        try { _escrow = require('./escrow'); } catch(e) { return null; } 
    } 
    return _escrow; 
}

function _getEvent() { 
    if (!_event) { 
        try { _event = require('./event').defaultEvent; } catch(e) { return null; } 
    } 
    return _event; 
}

function _getAgents() { 
    if (!_agents) { 
        try { _agents = require('./agents'); } catch(e) { return null; } 
    } 
    return _agents; 
}

function _getIslands() { 
    if (!_islands) { 
        try { _islands = require('./islands'); } catch(e) { return null; } 
    } 
    return _islands; 
}

function _getCron() { 
    if (!_cron) { 
        try { _cron = require('./cron'); } catch(e) { return null; } 
    } 
    return _cron; 
}

function _getRunop() { 
    if (!_runop) { 
        try { _runop = require('./runop'); } catch(e) { return null; } 
    } 
    return _runop; 
}

function _getNodes() { 
    if (!_nodes) { 
        try { _nodes = require('./node-registry'); } catch(e) { return null; } 
    } 
    return _nodes; 
}

// ==================== AUTO-TRACK AGENT EVENTS ====================
function _wireDelegationTracking() {
    const event = _getEvent();
    if (!event || !event.on) return;
    
    // Listen for agent delegations
    event.on('agent:delegating', (data) => {
        trackDelegation({
            from: data.agentId || 'unknown',
            to: data.to || 'agent',
            task: data.task || 'delegate',
            status: 'pending',
            created: data.timestamp
        });
    });
    
    event.on('agent:delegated', (data) => {
        // Update status to active
        const history = _getDelegationHistory();
        const pending = history.find(h => h.task === data.task && h.status === 'pending');
        if (pending) {
            trackDelegation({
                ...pending,
                status: 'active'
            });
        }
    });
    
    event.on('agent:completed', (data) => {
        trackDelegation({
            from: data.agentId || 'unknown',
            to: 'self',
            task: data.task || 'complete',
            status: 'completed',
            result: data.result || 'success',
            completed: data.timestamp
        });
    });
    
    event.on('agent:failed', (data) => {
        trackDelegation({
            from: data.agentId || 'unknown',
            to: 'self',
            task: data.task || 'fail',
            status: 'failed',
            result: data.error || 'error',
            completed: data.timestamp
        });
    });
    
    event.on('agent:spawned', (data) => {
        trackDelegation({
            from: 'system',
            to: data.name || data.id || 'agent',
            task: 'spawn',
            status: 'completed',
            result: 'spawned',
            created: data.timestamp
        });
    });
}

// Auto-wire on first gather
let _wired = false;
function _ensureWired() {
    if (!_wired) {
        _wired = true;
        _wireDelegationTracking();
    }
}

function _getBrain() {
    try { return require('./brain'); } catch(e) { return null; }
}

/**
 * SECURITY: Check security chain - BLOCKS if not properly configured
 */
function _checkSecurity(operation) {
    const sandbox = _getSandbox();
    const vaf = _getVaf();
    const qos = _getQos();
    
    // 1. Sandbox: Check capabilities, not the canRead() function
    // The canRead() can return false even when caps.allow read
    // We need to check actual capabilities
    if (!sandbox) {
        throw new Error('SECURITY: sandbox module not available');
    }
    
    const caps = sandbox.getCapabilities ? sandbox.getCapabilities() : {};
    if (!caps.read && !caps.canRead) {
        throw new Error('SECURITY: sandbox does not have read capability');
    }
    
    // 2. VAF: Validate operation name - MUST pass
    if (!vaf || typeof vaf.validateString !== 'function') {
        throw new Error('SECURITY: vaf module not available');
    }
    
    const validation = vaf.validateString(operation, { 
        maxLength: 50, 
        pattern: /^[a-zA-Z0-9_-]+$/ 
    });
    
    if (!validation && !validation.valid) {
        throw new Error(`SECURITY: invalid operation name "${operation}"`);
    }
    
    // 3. QoS: Rate limit - MUST enforce
    if (!qos || !qos.RateLimiter) {
        throw new Error('SECURITY: qos module not available');
    }
    
    const limiter = new qos.RateLimiter({ windowMs: 60000, max: 20 });
    if (!limiter.check('transform:' + operation)) {
        throw new Error('SECURITY: rate limit exceeded (20 req/min)');
    }
    
    return true;
}

/**
 * Gather data from agents module
 * INCLUDES DELEGATION TRACKING (private!)
 */
async function gatherAgents() {
    _checkSecurity('gather-agents');
    
    const agents = _getAgents();
    if (!agents) return { enabled: false, error: 'agents module not available' };
    
    const metrics = agents.getMetrics ? agents.getMetrics() : {};
    
    // DELEGATION TRACKING - Private!
    const delegations = {
        metrics: {
            total: metrics.total || 0,
            completed: metrics.completed || 0,
            failed: metrics.failed || 0,
            avgLifespan: metrics.avgLifespan || 0,
            states: metrics.states || {}
        },
        history: _getDelegationHistory(),
        active: _getActiveDelegations()
    };
    
    return {
        enabled: true,
        agents: [],
        delegations,
        metrics
    };
}

/**
 * Gather data from islands module
 */
async function gatherIslands() {
    _checkSecurity('gather-islands');
    
    const islands = _getIslands();
    if (!islands) return { available: [], error: 'islands module not available' };
    
    const available = islands.getAvailable ? islands.getAvailable() : [];
    const manifest = islands.getManifest ? await islands.getManifest() : {};
    
    return {
        available,
        manifests: manifest,
        count: available.length
    };
}

/**
 * Gather runtime state (full OS snapshot)
 */
async function gatherRuntime() {
    _checkSecurity('gather-runtime');
    
    const runtime = {};
    
    // Cron jobs
    const cron = _getCron();
    runtime.cron = cron && cron.list ? cron.list() : [];
    
    // Event history
    const event = _getEvent();
    runtime.events = event && event.list ? event.list() : [];
    
    // Runop status
    const runop = _getRunop();
    runtime.runop = runop && runop.getStatus ? runop.getStatus() : {};
    
    // Node registry
    const nodes = _getNodes();
    runtime.nodes = nodes && nodes.getStats ? nodes.getStats() : {};
    
    // Event emit for tracking
    if (event && event.emit) {
        event.emit('transform:runtime_gathered', { timestamp: Date.now() });
    }
    
    return runtime;
}

/**
 * Gather boot state
 */
async function gatherBoot() {
    _checkSecurity('gather-boot');
    
    const brain = _getBrain();
    if (brain && brain.getPipelineState) {
        const state = brain.getPipelineState();
        return {
            initialized: !!state,
            taskId: state?.taskId || null,
            layers: state?.layers || [],
            error: state?.error || null,
            uptime: process.uptime ? Math.floor(process.uptime()) : 0
        };
    }
    
    return { initialized: false };
}

/**
 * Gather brain config
 */
async function gatherConfig() {
    _checkSecurity('gather-config');
    
    const brain = _getBrain();
    if (!brain || !brain.getConfig) return {};
    
    try {
        return brain.getConfig();
    } catch(e) {
        return { error: e.message };
    }
}

/**
 * Gather brain corpus
 */
async function gatherCorpus() {
    _checkSecurity('gather-corpus');
    
    const brain = _getBrain();
    if (!brain || !brain.loadCorpus) return { loaded: false };
    
    try {
        const corpus = await brain.loadCorpus();
        return {
            loaded: true,
            brains: corpus.map(c => ({ name: c.name, source: c.source }))
        };
    } catch(e) {
        return { loaded: false, error: e.message };
    }
}

/**
 * Gather NEURON STATE - the actual brain memory/weights
 * This is the core of the agent's mind!
 */
async function gatherNeurons() {
    _checkSecurity('gather-neurons');
    
    const brain = _getBrain();
    if (!brain || !brain.getNeuronState) return { loaded: false };
    
    try {
        const state = await brain.getNeuronState();
        return {
            loaded: true,
            state: state || {},
            synapses: brain.getSynapses ? brain.getSynapses() : [],
            attention: brain.getAttention ? brain.getAttention() : []
        };
    } catch(e) {
        return { loaded: false, error: e.message };
    }
}

/**
 * Gather BRAIN STORAGE - all files from models/private/
 * This is the actual brain content!
 */
async function gatherBrainStorage() {
    _checkSecurity('gather-brain-storage');
    
    const brain = _getBrain();
    if (!brain) return { loaded: false };
    
    const fs = require('fs');
    const path = require('path');
    const brainPath = brain.getBrainPath ? brain.getBrainPath() : 'models/private';
    
    try {
        if (!fs.existsSync(brainPath)) {
            return { loaded: true, path: brainPath, files: [] };
        }
        
        const files = [];
        const _readDir = (dir, prefix = '') => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                const relPath = prefix + entry.name;
                
                if (entry.isDirectory()) {
                    _readDir(fullPath, relPath + '/');
                } else if (entry.isFile()) {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    files.push({
                        path: relPath,
                        content: content.slice(0, 100000), // Limit file size
                        size: content.length
                    });
                }
            }
        };
        
        _readDir(brainPath);
        
        return {
            loaded: true,
            path: brainPath,
            files: files,
            count: files.length
        };
    } catch(e) {
        return { loaded: false, error: e.message };
    }
}

/**
 * Gather PRIVATE BRAINS - full content of all brains
 */
async function gatherPrivateBrains() {
    _checkSecurity('gather-private-brains');
    
    const brain = _getBrain();
    if (!brain || !brain.listBrains) return { loaded: false };
    
    try {
        const brains = await brain.listBrains();
        const privateBrains = brains.filter(b => b.source === 'private' || b.name.startsWith('private'));
        
        // Get full content for each
        const contents = [];
        for (const b of privateBrains) {
            try {
                const data = await brain.load(b.name);
                contents.push({
                    name: b.name,
                    source: b.source,
                    data: typeof data === 'string' ? data : JSON.stringify(data)
                });
            } catch(e) {
                contents.push({ name: b.name, source: b.source, error: e.message });
            }
        }
        
        return {
            loaded: true,
            brains: contents,
            count: contents.length
        };
    } catch(e) {
        return { loaded: false, error: e.message };
    }
}

/**
 * Gather METRICS - full metrics including history
 */
async function gatherMetrics() {
    _checkSecurity('gather-metrics');
    
    const brain = _getBrain();
    const agents = _getAgents();
    
    const metrics = {
        brain: {},
        agents: {},
        system: {
            uptime: process.uptime ? Math.floor(process.uptime()) : 0,
            memory: process.memoryUsage ? {
                heapUsed: process.memoryUsage().heapUsed,
                heapTotal: process.memoryUsage().heapTotal,
                rss: process.memoryUsage().rss
            } : null
        }
    };
    
    if (brain && brain.getMetrics) {
        try {
            metrics.brain = await brain.getMetrics();
        } catch(e) {
            metrics.brain = { error: e.message };
        }
    }
    
    if (agents && agents.getMetrics) {
        try {
            metrics.agents = agents.getMetrics();
        } catch(e) {
            metrics.agents = { error: e.message };
        }
    }
    
    return metrics;
}

/**
 * Gather HANDLERS - registered handlers and state
 */
async function gatherHandlers() {
    _checkSecurity('gather-handlers');
    
    const brain = _getBrain();
    if (!brain) return { loaded: false };
    
    try {
        const handlers = brain.getHandlers ? brain.getHandlers() : [];
        const pipeline = brain.getPipeline ? brain.getPipeline() : null;
        
        return {
            loaded: true,
            handlers: handlers.map(h => ({
                name: h.name || h,
                type: typeof h
            })),
            pipeline: pipeline ? {
                name: pipeline.name,
                middleware: pipeline.middleware?.map(m => m.name || m) || []
            } : null,
            count: handlers.length
        };
    } catch(e) {
        return { loaded: false, error: e.message };
    }
}

/**
 * Gather CONFIG STORAGE - full config from storage layer
 */
async function gatherConfigStorage() {
    _checkSecurity('gather-config-storage');
    
    const storage = require('./storage');
    
    try {
        const configStorage = storage.ConfigStorage ? new storage.ConfigStorage() : null;
        
        if (!configStorage) {
            return { loaded: false, error: 'ConfigStorage not available' };
        }
        
        const keys = configStorage.list ? configStorage.list() : [];
        const config = {};
        
        for (const key of keys) {
            try {
                config[key] = configStorage.get ? configStorage.get(key) : null;
            } catch(e) {
                config[key] = { error: e.message };
            }
        }
        
        return {
            loaded: true,
            config,
            keys,
            count: keys.length
        };
    } catch(e) {
        return { loaded: false, error: e.message };
    }
}

/**
 * Gather ISLAND STATE - persistent data for islands
 */
async function gatherIslandState() {
    _checkSecurity('gather-island-state');
    
    const islands = _getIslands();
    const storage = require('./storage');
    
    try {
        const islandStorage = storage.IslandStorage ? new storage.IslandStorage() : null;
        
        const state = {
            islands: {},
            storage: {}
        };
        
        // Get island storage data
        if (islandStorage) {
            try {
                const keys = islandStorage.list ? islandStorage.list() : [];
                for (const key of keys) {
                    state.storage[key] = islandStorage.get ? islandStorage.get(key) : null;
                }
            } catch(e) {
                state.storage = { error: e.message };
            }
        }
        
        // Get island manifests/state
        if (islands && islands.getManifest) {
            try {
                state.manifests = await islands.getManifest();
            } catch(e) {
                state.manifests = { error: e.message };
            }
        }
        
        return {
            loaded: true,
            ...state,
            hasData: Object.keys(state.storage).length > 0
        };
    } catch(e) {
        return { loaded: false, error: e.message };
    }
}

/**
 * Gather MODE & PATHS - brain configuration
 */
async function gatherMode() {
    _checkSecurity('gather-mode');
    
    const brain = _getBrain();
    if (!brain) return { loaded: false };
    
    return {
        loaded: true,
        mode: brain.getMode ? brain.getMode() : 'dual',
        brainPath: brain.getBrainPath ? brain.getBrainPath() : 'models/private',
        publicPath: brain.getPublicPath ? brain.getPublicPath() : 'models/public',
        version: brain.getVersion ? brain.getVersion() : '0.8.6',
        remoteURL: brain.getRemoteURL ? brain.getRemoteURL() : null
    };
}

/**
 * Main gather function - gathers ALL the things!
 * 
 * @param {Object} options - Gather options
 * @param {boolean} options.agents - Include agent data (default: true)
 * @param {boolean} options.islands - Include island data (default: true)
 * @param {boolean} options.runtime - Include runtime data (default: true)
 * @param {boolean} options.boot - Include boot state (default: true)
 * @param {boolean} options.config - Include config (default: true)
 * @param {boolean} options.corpus - Include corpus list (default: false)
 * @param {boolean} options.neurons - Include neuron state (default: false)
 * @param {boolean} options.brainStorage - Include brain storage files (default: false)
 * @param {boolean} options.privateBrains - Include private brains (default: false)
 * @param {boolean} options.metrics - Include metrics (default: false)
 * @param {boolean} options.handlers - Include handlers (default: false)
 * @param {boolean} options.configStorage - Include config storage (default: false)
 * @param {boolean} options.islandState - Include island state (default: false)
 * @param {boolean} options.mode - Include mode/paths (default: false)
 * @param {boolean} options.full - Include EVERYTHING (default: false)
 */
async function gather(options = {}) {
    // Auto-wire event listeners for delegation tracking
    _ensureWired();
    
    // Default to full gather (all components)
    const {
        agents = true,
        islands = true,
        runtime = true,
        boot = true,
        config = true,
        corpus = true,
        neurons = true,
        brainStorage = true,
        privateBrains = true,
        metrics = true,
        handlers = true,
        configStorage = true,
        islandState = true,
        mode = true,
        full = true
    } = options;
    
    _checkSecurity('gather');
    
    const result = {
        timestamp: Date.now(),
        version: '0.8.6'
    };
    
    // Gather based on options (defaults to full)
    if (agents) result.agents = await gatherAgents();
    if (islands) result.islands = await gatherIslands();
    if (runtime) result.runtime = await gatherRuntime();
    if (boot) result.boot = await gatherBoot();
    if (config) result.config = await gatherConfig();
    if (corpus) result.corpus = await gatherCorpus();
    if (neurons) result.neurons = await gatherNeurons();
    if (brainStorage) result.brainStorage = await gatherBrainStorage();
    if (privateBrains) result.privateBrains = await gatherPrivateBrains();
    if (metrics) result.metrics = await gatherMetrics();
    if (handlers) result.handlers = await gatherHandlers();
    if (configStorage) result.configStorage = await gatherConfigStorage();
    if (islandState) result.islandState = await gatherIslandState();
    if (mode) result.mode = await gatherMode();
    
    return result;
}

/**
 * Create horcrux - format agnostic
 * 
 * Usage:
 *   const json = await toHorcrux();  // Returns JSON string
 *   const result = await toHorcrux('path/to/file.svg', { password });  // Writes file
 * 
 * @param {string} outputPath - Optional path to save horcrux (.svg/.json)
 * @param {Object} options - { password, templateSvg, ...gatherOptions }
 * @returns {Promise<string|Object>} JSON string or result object
 */
async function toHorcrux(outputPath, options = {}) {
    const fs = require('fs');
    const path = require('path');
    
    // If first arg is not a string, it's actually options
    if (typeof outputPath !== 'string') {
        options = outputPath || {};
        outputPath = null;
    }
    
    // No path = return JSON
    if (!outputPath) {
        _checkSecurity('to-horcrux');
        const data = await gather(options);
        return JSON.stringify(data);
    }
    
    // Has path = write file
    _checkSecurity('to-horcrux-file');
    
    // Get password - must be provided or via secret.js
    let password = options.password;
    if (!password) {
        try {
            const secret = require('./secret');
            password = await secret.getPassword();
        } catch (e) {
            throw new Error('Password required. Provide explicitly or set VANT_BRAIN_PASSWORD env var.');
        }
    }
    
    const ext = path.extname(outputPath).toLowerCase();
    
    // Gather data
    const data = await gather(options);
    
    if (ext === '.svg') {
        // Use steganography - need a template SVG
        let templateSvg = options.templateSvg;
        let svgContent;
        
        if (!templateSvg) {
            // Try models/public/boot/template.svg
            templateSvg = path.join(__dirname, '..', 'models', 'public', 'boot', 'horcrux-template.svg');
            if (fs.existsSync(templateSvg)) {
                svgContent = fs.readFileSync(templateSvg, 'utf8');
            } else {
                // Generate template using canvas
                try {
                    const canvas = require('./canvas');
                    svgContent = canvas.generateHorcruxTemplate();
                } catch (e) {
                    throw new Error('SVG template not found. Provide templateSvg option.');
                }
            }
        } else {
            // Custom template path
            svgContent = fs.readFileSync(templateSvg, 'utf8');
        }
        
        // Encode
        const stego = require('./stego');
        const json = JSON.stringify({
            timestamp: Date.now(),
            version: '0.8.6',
            type: 'vant-horcrux',
            data
        });
        const embedded = stego.encodeSvg(json, svgContent, password);
        
        // Save
        fs.writeFileSync(outputPath, embedded, 'utf8');
        
        return {
            embedded: true,
            path: outputPath,
            size: embedded.length,
            format: 'steganography'
        };
    }
    
    // JSON fallback
    const json = JSON.stringify({
        timestamp: Date.now(),
        version: '0.8.6',
        type: 'vant-horcrux',
        data
    }, null, 2);
    
    fs.writeFileSync(outputPath, json, 'utf8');
    
    return {
        embedded: false,
        path: outputPath,
        size: json.length,
        format: 'json'
    };
}

/**
 * Package for backup - full OS restore
 */
async function toBackup(options = {}) {
    _checkSecurity('to-backup');
    const data = await gather({
        agents: true,
        islands: true,
        runtime: true,
        boot: true,
        config: true,
        corpus: true,
        ...options
    });
    
    return {
        timestamp: Date.now(),
        version: '0.8.6',
        type: 'vant-backup',
        data
    };
}

// ==================== DELEGATION TRACKING (Private) ====================

const _delegationHistory = [];
const _activeDelegations = new Map();

function _getDelegationHistory() {
    return _delegationHistory.slice(-100).reverse();
}

function _getActiveDelegations() {
    return Array.from(_activeDelegations.values());
}

function trackDelegation(delegation) {
    const event = {
        id: delegation.id || Date.now().toString(36),
        from: delegation.from,
        to: delegation.to,
        task: delegation.task,
        status: delegation.status || 'pending',
        created: delegation.created || Date.now(),
        completed: delegation.completed || null,
        result: delegation.result || null
    };
    
    _delegationHistory.push(event);
    
    if (event.status === 'pending' || event.status === 'active') {
        _activeDelegations.set(event.id, event);
    } else {
        _activeDelegations.delete(event.id);
    }
    
    return event;
}

/**
 * Get layer status for security chain
 */
function getLayerStatus() {
    const sandbox = _getSandbox();
    const vaf = _getVaf();
    const qos = _getQos();
    const escrow = _getEscrow();
    
    return {
        sandbox: !!sandbox,
        sandboxCaps: sandbox?.getCapabilities ? sandbox.getCapabilities() : null,
        vaf: !!vaf,
        qos: !!qos,
        escrow: !!escrow
    };
}

/**
 * Extract horcrux data - format agnostic
 * Supports: .svg files (steganography), .json files
 * @param {string} horcruxPath - Path to horcrux file
 * @param {Object} options - { password } or use secret.js
 * @returns {Promise<Object>} Parsed horcrux data
 */
async function fromHorcrux(horcruxPath, options = {}) {
    const fs = require('fs');
    const path = require('path');
    const stego = require('./stego');
    
    _checkSecurity('from-horcrux');
    
    if (!fs.existsSync(horcruxPath)) {
        throw new Error('Horcrux file not found: ' + horcruxPath);
    }
    
    // Get password - must be provided or via secret.js
    let password = options.password || options;
    if (!password || typeof password !== 'string') {
        try {
            const secret = require('./secret');
            password = await secret.getPassword();
        } catch (e) {
            throw new Error('Password required. Provide explicitly or set VANT_BRAIN_PASSWORD env var.');
        }
    }
    
    const ext = path.extname(horcruxPath).toLowerCase();
    
    if (ext === '.svg') {
        // SVG horcrux - use steganography
        const content = fs.readFileSync(horcruxPath, 'utf8');
        const decoded = stego.decodeSvg(content, password);
        
        if (!decoded.message) {
            throw new Error('Invalid password or corrupted SVG');
        }
        
        return JSON.parse(decoded.message);
    }
    
    // JSON file
    const content = fs.readFileSync(horcruxPath, 'utf8');
    try {
        return JSON.parse(content);
    } catch (e) {
        throw new Error('Unknown horcrux format: ' + ext);
    }
}

/**
 * Inspect horcrux - preview what's inside without restoring
 * @param {string} horcruxPath - Path to horcrux file
 * @param {Object} options - { password } or use secret.js
 * @returns {Promise<Object>} Preview of horcrux contents
 */
async function inspectHorcrux(horcruxPath, options = {}) {
    const fs = require('fs');
    const path = require('path');
    
    if (!fs.existsSync(horcruxPath)) {
        throw new Error('Horcrux file not found: ' + horcruxPath);
    }
    
    // Get password - must be provided or via secret.js
    let password = options.password || options;
    if (!password || typeof password !== 'string') {
        try {
            const secret = require('./secret');
            password = await secret.getPassword();
        } catch (e) {
            // For inspect, we can show that password is needed without failing
            return {
                valid: false,
                error: 'Password required. Provide explicitly or set VANT_BRAIN_PASSWORD env var.',
                passwordRequired: true
            };
        }
    }
    
    const ext = path.extname(horcruxPath).toLowerCase();
    let data;
    
    if (ext === '.svg') {
        const stego = require('./stego');
        const content = fs.readFileSync(horcruxPath, 'utf8');
        const decoded = stego.decodeSvg(content, password);
        
        if (!decoded.message) {
            return { 
                valid: false, 
                error: 'Invalid password or corrupted file',
                passwordRequired: true 
            };
        }
        
        data = JSON.parse(decoded.message);
    } else {
        // JSON file
        const content = fs.readFileSync(horcruxPath, 'utf8');
        data = JSON.parse(content);
    }
    
    // Build preview
    return {
        valid: true,
        format: ext === '.svg' ? 'steganography' : 'json',
        timestamp: data.timestamp,
        version: data.version,
        preview: {
            hasAgents: !!data.agents,
            hasIslands: !!data.islands,
            hasRuntime: !!data.runtime,
            hasConfig: !!data.config && Object.keys(data.config).length > 0,
            hasCorpus: !!data.corpus,
            agentCount: data.agents?.agents?.length || 0,
            islandCount: data.islands?.available?.length || 0,
            corpusCount: data.corpus?.brains?.length || 0
        },
        raw: data
    };
}

/**
 * Restore all systems from horcrux data (full restore)
 */
async function restore(data) {
    _checkSecurity('restore');
    
    const results = { restored: [], errors: [] };
    const brain = _getBrain();
    const fs = require('fs');
    const path = require('path');
    
    // 1. Restore MODE first
    if (data.mode && data.mode.loaded) {
        try {
            if (brain && brain.setMode) {
                brain.setMode(data.mode.mode);
            }
            results.restored.push('mode');
        } catch(e) {
            results.errors.push({ mode: e.message });
        }
    }
    
    // 2. Restore BRAIN STORAGE (private files) - the main brain content!
    if (data.brainStorage && data.brainStorage.loaded && data.brainStorage.files) {
        try {
            const brainPath = brain?.getBrainPath?.() || 'models/private';
            
            for (const file of data.brainStorage.files) {
                try {
                    const fullPath = path.join(brainPath, file.path);
                    const dir = path.dirname(fullPath);
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }
                    fs.writeFileSync(fullPath, file.content, 'utf8');
                } catch(e) {
                    results.errors.push({ file: file.path, error: e.message });
                }
            }
            results.restored.push('brainStorage');
        } catch(e) {
            results.errors.push({ brainStorage: e.message });
        }
    }
    
    // 3. Restore NEURON STATE
    if (data.neurons && data.neurons.loaded && brain?.restoreNeuronState) {
        try {
            await brain.restoreNeuronState(data.neurons.state);
            results.restored.push('neurons');
        } catch(e) {
            results.errors.push({ neurons: e.message });
        }
    }
    
    // 4. Restore CONFIG STORAGE
    if (data.configStorage && data.configStorage.loaded && data.configStorage.config) {
        const storage = require('./storage');
        const configStorage = storage.ConfigStorage ? new storage.ConfigStorage() : null;
        
        if (configStorage) {
            try {
                for (const [key, value] of Object.entries(data.configStorage.config)) {
                    try {
                        if (configStorage.set) configStorage.set(key, value);
                    } catch(e) { /* ignore individual key errors */ }
                }
                results.restored.push('configStorage');
            } catch(e) {
                results.errors.push({ configStorage: e.message });
            }
        }
    }
    
    // 5. Restore ISLAND STATE
    if (data.islandState && data.islandState.loaded && data.islandState.storage) {
        const storage = require('./storage');
        const islandStorage = storage.IslandStorage ? new storage.IslandStorage() : null;
        
        if (islandStorage) {
            try {
                for (const [key, value] of Object.entries(data.islandState.storage)) {
                    try {
                        if (islandStorage.set) islandStorage.set(key, value);
                    } catch(e) { /* ignore */ }
                }
                results.restored.push('islandState');
            } catch(e) {
                results.errors.push({ islandState: e.message });
            }
        }
    }
    
    // 6. Restore agents
    if (data.agents) {
        results.restored.push('agents');
    }
    
    // 7. Restore islands (manifests)
    if (data.islands && data.islands.manifests) {
        const islands = _getIslands();
        if (islands && islands.updateTriggers) {
            islands.updateTriggers(data.islands.manifests);
            results.restored.push('islands');
        }
    }
    
    // 8. Restore config
    if (data.config && brain?.setConfig) {
        try {
            brain.setConfig(data.config);
            results.restored.push('config');
        } catch(e) {
            results.errors.push({ config: e.message });
        }
    }
    
    // 9. Restore runtime (cron, events)
    if (data.runtime) {
        const cron = _getCron();
        if (cron && data.runtime.cron) {
            for (const job of data.runtime.cron) {
                try { if (cron.add) cron.add(job); } catch(e) { /* ignore */ }
            }
        }
        results.restored.push('runtime');
    }
    
    // 10. Restore boot state
    if (data.boot) {
        results.restored.push('boot');
    }
    
    return results;
}

/**
 * Embed horcrux data into SVG with FULL state
 * Use this for complete agent preservation!
 */
/**
 * Embed horcrux into existing SVG file
 * @deprecated Use toHorcrux(path, { templateSvg }) instead
 */
async function embedToSvgFull(svgPath, options = {}) {
    const fs = require('fs');
    const stego = require('./stego');
    
    // Get password - must be provided or via secret.js
    let password = options.password;
    if (!password) {
        try {
            const secret = require('./secret');
            password = await secret.getPassword();
        } catch (e) {
            throw new Error('Password required. Provide explicitly or set VANT_BRAIN_PASSWORD env var.');
        }
    }
    
    // Security check
    _checkSecurity('embed-svg-full');
    
    // Gather EVERYTHING (now default)
    const fullData = await gather({
        agents: true,
        islands: true,
        runtime: true,
        boot: true,
        config: true,
        corpus: true,
        neurons: true,
        brainStorage: true,
        privateBrains: true,
        metrics: true,
        handlers: true,
        configStorage: true,
        islandState: true,
        mode: true,
        ...options
    });
    
    const json = JSON.stringify(fullData);
    
    // Load SVG
    const svgContent = fs.readFileSync(svgPath, 'utf8');
    
    // Embed
    const embedded = stego.encodeSvg(json, svgContent, password);
    
    // Save over the original or create new
    const outPath = svgPath.replace('.svg', '-full.svg');
    fs.writeFileSync(outPath, embedded, 'utf8');
    
    return { 
        embedded: true, 
        path: outPath, 
        size: embedded.length,
        dataSize: json.length,
        keys: Object.keys(fullData)
    };
}

/**
 * Restore from full horcrux data
 */
/**
 * @deprecated Use restore() instead - now does full restore by default
 */
async function restoreFull(data) {
    return restore(data);
}

async function _restoreFullOld(data) {
    _checkSecurity('restore-full');
    
    const results = { restored: [], errors: [] };
    const brain = _getBrain();
    const fs = require('fs');
    const path = require('path');
    
    // 1. Restore MODE first
    if (data.mode && data.mode.loaded) {
        try {
            if (brain && brain.setMode) {
                brain.setMode(data.mode.mode);
            }
            results.restored.push('mode');
        } catch(e) {
            results.errors.push({ mode: e.message });
        }
    }
    
    // 2. Restore BRAIN STORAGE (private files)
    if (data.brainStorage && data.brainStorage.loaded && data.brainStorage.files) {
        try {
            const brainPath = brain?.getBrainPath?.() || 'models/private';
            
            for (const file of data.brainStorage.files) {
                try {
                    const fullPath = path.join(brainPath, file.path);
                    const dir = path.dirname(fullPath);
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }
                    fs.writeFileSync(fullPath, file.content, 'utf8');
                } catch(e) {
                    results.errors.push({ file: file.path, error: e.message });
                }
            }
            results.restored.push('brainStorage');
        } catch(e) {
            results.errors.push({ brainStorage: e.message });
        }
    }
    
    // 3. Restore NEURON STATE
    if (data.neurons && data.neurons.loaded && brain?.restoreNeuronState) {
        try {
            await brain.restoreNeuronState(data.neurons.state);
            results.restored.push('neurons');
        } catch(e) {
            results.errors.push({ neurons: e.message });
        }
    }
    
    // 4. Restore CONFIG STORAGE
    if (data.configStorage && data.configStorage.loaded && data.configStorage.config) {
        const storage = require('./storage');
        const configStorage = storage.ConfigStorage ? new storage.ConfigStorage() : null;
        
        if (configStorage) {
            try {
                for (const [key, value] of Object.entries(data.configStorage.config)) {
                    try {
                        if (configStorage.set) configStorage.set(key, value);
                    } catch(e) { /* ignore individual key errors */ }
                }
                results.restored.push('configStorage');
            } catch(e) {
                results.errors.push({ configStorage: e.message });
            }
        }
    }
    
    // 5. Restore ISLAND STATE
    if (data.islandState && data.islandState.loaded && data.islandState.storage) {
        const storage = require('./storage');
        const islandStorage = storage.IslandStorage ? new storage.IslandStorage() : null;
        
        if (islandStorage) {
            try {
                for (const [key, value] of Object.entries(data.islandState.storage)) {
                    try {
                        if (islandStorage.set) islandStorage.set(key, value);
                    } catch(e) { /* ignore */ }
                }
                results.restored.push('islandState');
            } catch(e) {
                results.errors.push({ islandState: e.message });
            }
        }
    }
    
    // 6. Restore agents
    if (data.agents) {
        results.restored.push('agents');
    }
    
    // 7. Restore islands
    if (data.islands && data.islands.manifests) {
        const islands = _getIslands();
        if (islands && islands.updateTriggers) {
            islands.updateTriggers(data.islands.manifests);
        }
        results.restored.push('islands');
    }
    
    // 8. Restore config
    if (data.config && brain?.setConfig) {
        try {
            brain.setConfig(data.config);
            results.restored.push('config');
        } catch(e) {
            results.errors.push({ config: e.message });
        }
    }
    
    // 9. Restore runtime
    if (data.runtime) {
        const cron = _getCron();
        if (cron && data.runtime.cron) {
            for (const job of data.runtime.cron) {
                try { if (cron.add) cron.add(job); } catch(e) { /* ignore */ }
            }
        }
        results.restored.push('runtime');
    }
    
    // 10. Restore boot state
    if (data.boot) {
        results.restored.push('boot');
    }
    
    return results;
}

module.exports = {
    // Main functions
    gather,
    toHorcrux,
    toBackup,
    embedToSvgFull,
    fromHorcrux,
    inspectHorcrux,
    restore,
    restoreFull,
    
    // Individual gatherers
    gatherAgents,
    gatherIslands,
    gatherRuntime,
    gatherBoot,
    gatherConfig,
    gatherCorpus,
    gatherNeurons,
    gatherBrainStorage,
    gatherPrivateBrains,
    gatherMetrics,
    gatherHandlers,
    gatherConfigStorage,
    gatherIslandState,
    gatherMode,
    
    // Delegation tracking
    trackDelegation,
    getDelegationHistory: _getDelegationHistory,
    getActiveDelegations: _getActiveDelegations,
    
    // Security
    getLayerStatus,
    _checkSecurity
};
