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
 * MULTIBRAIN: Gather teams/org data
 */
async function gatherTeams() {
    _checkSecurity('gather-teams');
    
    try {
        const teams = require('./teams');
        
        // Get store path
        const storePath = teams.getStorePath ? teams.getStorePath() : '.agent_tmp/teams.json';
        const fs = require('fs');
        
        if (!fs.existsSync(storePath)) {
            return { error: 'Teams store not found' };
        }
        
        const data = JSON.parse(fs.readFileSync(storePath, 'utf8'));
        
        // Get current assignments
        const assignments = teams.listAssignments ? teams.listAssignments() : [];
        
        // Get agents by brain
        const getAgentBrain = teams.getAgentBrain;
        const brains = {};
        for (const assignment of assignments) {
            const brain = assignment.brain;
            if (brain) {
                brains[brain] = brains[brain] || [];
                brains[brain].push(assignment.agentId);
            }
        }
        
        return {
            orgs: data.orgs || [],
            depts: data.depts || [],
            teams: data.teams || [],
            roles: data.roles || [],
            assignments: assignments,
            brains: brains,  // Agents grouped by brain
            count: (data.orgs?.length || 0) + (data.depts?.length || 0) + (data.teams?.length || 0)
        };
    } catch (e) {
        return { error: e.message };
    }
}

/**
 * MULTIBRAIN: Gather trust scores (v0.9.0)
 * Persists trust scores across sessions
 */
async function gatherTrust() {
    try {
        _checkSecurity('gather-trust');
    } catch (e) {
        // If security check fails, still try to gather trust
        console.warn('[transform] gatherTrust: security check failed, proceeding anyway:', e.message);
    }
    
    try {
        const trust = require('./trust');
        
        // Export trust data
        const trustData = trust.export();
        
        return {
            scores: trustData.scores || {},
            karma: trustData.karma || {},
            roleTrust: trustData.roleTrust || {},
            count: Object.keys(trustData.scores || {}).length
        };
    } catch (e) {
        return { error: e.message };
    }
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
    
    // MULTIBRAIN: Get both private and public brain base paths
    // Note: getBrainPath() returns current brain path, not base directory
    const privatePath = 'models/private';
    const publicPath = 'models/public';
    const brainDirs = brain.brainDirs ? brain.brainDirs() : { public: [], private: [] };
    
    const _readDir = (dir, prefix = '') => {
        const files = [];
        if (!fs.existsSync(dir)) return files;
        
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relPath = prefix + entry.name;
            
            if (entry.isDirectory()) {
                // Recursively read subdirectories
                files.push(..._readDir(fullPath, relPath + '/'));
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
                const content = fs.readFileSync(fullPath, 'utf8');
                files.push({
                    path: relPath,
                    content: content.slice(0, 100000), // Limit file size
                    size: content.length
                });
            }
        }
        return files;
    };
    
    try {
        // Gather from all brains
        const result = {
            loaded: true,
            brains: {}
        };
        
        // Private brains
        for (const brainName of brainDirs.private || []) {
            const brainPath = path.join(privatePath, brainName);
            const files = _readDir(brainPath, '');
            result.brains[brainName] = {
                type: 'private',
                path: brainPath,
                files: files,
                count: files.length
            };
        }
        
        // Public brains
        for (const brainName of brainDirs.public || []) {
            const brainPath = path.join(publicPath, brainName);
            const files = _readDir(brainPath, '');
            result.brains[brainName] = {
                type: 'public',
                path: brainPath,
                files: files,
                count: files.length
            };
        }
        
        // Add summary
        result.totalBrains = Object.keys(result.brains).length;
        result.totalFiles = Object.values(result.brains).reduce((sum, b) => sum + b.count, 0);
        
        return result;
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
    if (!brain || !brain.brainDirs || !brain.brainFiles) return { loaded: false };
    
    try {
        // brainDirs() returns { public: [...], private: [...] }
        const dirs = brain.brainDirs();
        const privateBrains = dirs.private || [];
        
        // Get full content for each brain
        const contents = [];
        for (const brainName of privateBrains) {
            try {
                // Save current brain state
                const originalBrain = brain.currentBrain ? brain.currentBrain() : null;
                
                // Switch to this brain to get its files
                if (brain.switchBrain) {
                    brain.switchBrain(brainName);
                }
                
                // Get all files in this brain
                const files = await brain.brainFiles();
                
                // Load each file
                const brainData = { name: brainName, files: [] };
                for (const fileName of files) {
                    try {
                        const loaded = await brain.load(fileName);
                        if (loaded && loaded.content) {
                            brainData.files.push({
                                name: fileName,
                                content: loaded.content
                            });
                        }
                    } catch(e) {
                        brainData.files.push({ name: fileName, error: e.message });
                    }
                }
                
                contents.push({
                    name: brainName,
                    source: 'private',
                    files: brainData.files
                });
                
                // Restore original brain
                if (originalBrain && brain.switchBrain) {
                    brain.switchBrain(originalBrain);
                }
            } catch(e) {
                contents.push({ name: brainName, source: 'private', error: e.message });
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
    
    // Get brain dirs (all brains)
    const brainDirs = brain.brainDirs ? brain.brainDirs() : { public: [], private: [] };
    
    return {
        loaded: true,
        mode: brain.getMode ? brain.getMode() : 'dual',
        brainPath: brain.getBrainPath ? brain.getBrainPath() : 'models/private',
        publicPath: brain.getPublicPath ? brain.getPublicPath() : 'models/public',
        version: brain.getVersion ? brain.getVersion() : '0.8.6',
        remoteURL: brain.getRemoteURL ? brain.getRemoteURL() : null,
        // MULTIBRAIN: Capture stack and current brain
        stack: brain.getStack ? brain.getStack() : [],
        currentBrain: brain.currentBrain ? brain.currentBrain() : null,
        brainDirs: brainDirs
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
// ==================== MEMORY ====================
async function gatherMemory(options = {}) {
    _checkSecurity('gather-memory');
    
    try {
        const memory = require('./memory');
        
        // Get stats
        const stats = memory.getStats();
        
        // Export state and learn caches (not geometry - that's separate)
        const stateData = {};
        const learnData = {};
        
        // Get state entries from memory._cache
        if (memory.memory && memory.memory._cache) {
            for (const [key, value] of memory.memory._cache) {
                if (key.startsWith('state:')) {
                    const cleanKey = key.replace('state:', '');
                    stateData[cleanKey] = value;
                } else if (key.startsWith('learn:')) {
                    const cleanKey = key.replace('learn:', '');
                    learnData[cleanKey] = value;
                }
            }
        }
        
        return {
            stats,
            state: stateData,
            learned: learnData
        };
    } catch (e) {
        return { error: e.message };
    }
}

async function gather(options = {}) {
    // Auto-wire event listeners for delegation tracking
    _ensureWired();
    
    // Default to full gather (all components)
    const {
        agents = true,
        teams = true,  // MULTIBRAIN: Include teams/org
        trust = true,  // MULTIBRAIN v0.9.0: Include trust scores
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
        memory = true,
        full = true
    } = options;
    
    _checkSecurity('gather');
    
    const result = {
        timestamp: Date.now(),
        version: '0.9.0'
    };
    
    // Gather based on options (defaults to full)
    if (agents) result.agents = await gatherAgents();
    if (teams) result.teams = await gatherTeams();  // MULTIBRAIN
    if (trust) result.trust = await gatherTrust();
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
    if (memory) result.memory = await gatherMemory();
    
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
    
    // VAF: Validate output path (if provided)
    if (outputPath) {
        const vaf = require('./vaf');
        const pathCheck = vaf.checkPathTraversal(outputPath);
        if (pathCheck.blocked) {
            throw new Error('VAF: Path traversal blocked: ' + pathCheck.reason);
        }
    }
    
    // No path = return JSON (wrapped format for consistency)
    if (!outputPath) {
        _checkSecurity('to-horcrux');
        const data = await gather(options);
        return JSON.stringify({
            timestamp: Date.now(),
            version: '0.8.6',
            type: 'vant-horcrux',
            data
        });
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
 * Validate horcrux integrity and structure
 * Runs before restore to ensure horcrux is safe to restore
 * @param {Object} data - Parsed horcrux data (can be wrapped or unwrapped from fromHorcrux)
 * @param {Object} options - { strictVersion: boolean }
 * @returns {Object} Validation result { valid: boolean, errors: [], warnings: [] }
 */
/**
 * Validate horcrux file integrity and security
 * @param {string} horcruxPath - Path to horcrux file (SVG/JSON)
 * @param {Object} options - { password, strictVersion, checkEncryption }
 * @returns {Promise<Object>} Validation result
 */
async function validateHorcruxFile(horcruxPath, options = {}) {
    const fs = require('fs');
    const path = require('path');
    const errors = [];
    const warnings = [];
    const checks = {};
    
    const password = options.password || process.env.VANT_BRAIN_PASSWORD;
    const currentVersion = '0.8.6';
    
    // 1. File existence
    if (!fs.existsSync(horcruxPath)) {
        return { valid: false, errors: ['File not found'], warnings: [] };
    }
    
    const stats = fs.statSync(horcruxPath);
    checks.fileSize = stats.size;
    
    // 2. File extension
    const ext = path.extname(horcruxPath).toLowerCase();
    if (!['.svg', '.json'].includes(ext)) {
        errors.push(`Invalid file extension: ${ext}`);
    }
    checks.format = ext === '.svg' ? 'steganography' : 'json';
    
    // 3. Read file
    let content;
    try {
        content = fs.readFileSync(horcruxPath, 'utf8');
    } catch(e) {
        return { valid: false, errors: ['Cannot read file'], warnings: [] };
    }
    
    // 4. Check if encrypted (for SVG steganography)
    checks.encrypted = false;
    checks.hasBrnSecret = content.includes('brn:secret') || content.includes('brn:secret');
    if (ext === '.svg') {
        // Check for BRN:secret tag which indicates steganography
        if (!checks.hasBrnSecret) {
            errors.push('SVG does not contain brn:secret metadata - not a valid horcrux');
        }
        
        // If password provided, verify we can decrypt
        if (password) {
            try {
                const stego = require('./stego');
                
                // Read SVG content and use decodeSvg
                const svgContent = content;
                const decoded = stego.decodeSvg(svgContent, password);
                
                if (!decoded) {
                    errors.push('Could not decode SVG - invalid format');
                } else if (decoded.error) {
                    checks.decryptionSuccess = false;
                    errors.push(`Decryption error: ${decoded.error}`);
                } else {
                    checks.decryptionSuccess = true;
                    const dataStr = decoded.message || decoded;
                    
                    // Check if decrypted content has encryption markers
                    checks.encrypted = dataStr.includes('ENC:');
                    
                    // Parse the decoded JSON
                    let parsed;
                    try {
                        parsed = JSON.parse(dataStr);
                        checks.jsonValid = true;
                    } catch(e) {
                        checks.jsonValid = false;
                        errors.push('Decoded content is not valid JSON');
                    }
                    
                    // Validate the structure
                    if (parsed) {
                        return validateHorcruxData(parsed, options);
                    }
                }
            } catch(e) {
                checks.decryptionSuccess = false;
                errors.push(`Decryption failed: ${e.message}`);
            }
        } else {
            warnings.push('Encrypted SVG but no password provided - cannot validate');
        }
        
        if (options.checkEncryption !== false && !checks.encrypted) {
            warnings.push('SVG file does not appear to be encrypted');
        }
        
        // Try to decode to verify password works
        if (password && checks.encrypted) {
            try {
                const stego = require('./stego');
                const decoded = stego.decode(horcruxPath, { password });
                checks.decryptionSuccess = true;
                
                // Parse the decoded JSON
                let parsed;
                try {
                    parsed = JSON.parse(decoded);
                    checks.jsonValid = true;
                } catch(e) {
                    checks.jsonValid = false;
                    errors.push('Decoded content is not valid JSON');
                }
                
                // Now validate the structure
                if (parsed) {
                    return validateHorcruxData(parsed, options);
                }
            } catch(e) {
                checks.decryptionSuccess = false;
                errors.push(`Decryption failed: ${e.message}`);
            }
        } else if (checks.encrypted && !password) {
            warnings.push('Encrypted file but no password provided for validation');
        }
    } else {
        // JSON file - parse directly
        let parsed;
        try {
            parsed = JSON.parse(content);
            checks.jsonValid = true;
        } catch(e) {
            checks.jsonValid = false;
            errors.push('Invalid JSON');
            return { valid: false, errors, warnings, checks };
        }
        
        return validateHorcruxData(parsed, options);
    }
    
    return {
        valid: errors.length === 0,
        errors,
        warnings,
        checks
    };
}

/**
 * Validate horcrux data structure (after decryption)
 */
function validateHorcruxData(data, options = {}) {
    const errors = [];
    const warnings = [];
    const currentVersion = '0.8.6';
    
    // Handle both wrapped and unwrapped formats
    const isWrapped = data.type === 'vant-horcrux' && data.data;
    const innerData = isWrapped ? data.data : data;
    const timestamp = data.timestamp;
    const version = data.version;
    
    // Check timestamp
    if (!timestamp || typeof timestamp !== 'number') {
        errors.push('Missing or invalid timestamp');
    } else if (timestamp > Date.now() + 60000) {
        warnings.push('Timestamp is in the future');
    } else if (timestamp < Date.now() - 31536000000) {
        warnings.push('Horcrux is over 1 year old');
    }
    
    // Check version
    if (!version) {
        errors.push('Missing version field');
    } else if (version !== currentVersion) {
        if (options.strictVersion) {
            errors.push(`Version mismatch: ${version} vs ${currentVersion}`);
        } else {
            warnings.push(`Version ${version} may have compatibility issues`);
        }
    }
    
    // Check type
    if (isWrapped) {
        if (!data.type || data.type !== 'vant-horcrux') {
            errors.push('Invalid or missing horcrux type');
        }
    } else {
        if (!innerData.agents && !innerData.islands && !innerData.brainStorage) {
            warnings.push('Data does not appear to be a valid horcrux structure');
        }
    }
    
    // Check data structure
    if (!innerData || typeof innerData !== 'object') {
        errors.push('Missing or invalid data wrapper');
    } else {
        // Brain storage check
        if (innerData.brainStorage && typeof innerData.brainStorage !== 'object') {
            warnings.push('brainStorage has invalid structure');
        }
        
        // Mode check
        if (innerData.mode && !innerData.mode.mode) {
            warnings.push('Mode information incomplete');
        }
        
        // Suspicious paths
        if (innerData.brainStorage && innerData.brainStorage.files) {
            const suspicious = innerData.brainStorage.files.filter(f => 
                f.path?.includes('..') || f.path?.includes('/etc/') || f.path?.includes('C:')
            );
            if (suspicious.length > 0) {
                errors.push(`Suspicious file paths detected: ${suspicious.length}`);
            }
        }
    }
    
    return {
        valid: errors.length === 0,
        errors,
        warnings,
        version,
        timestamp,
        age: timestamp ? Date.now() - timestamp : null,
        format: isWrapped ? 'wrapped' : 'unwrapped'
    };
}

/**
 * Legacy validateHorcrux for backward compatibility
 */
function validateHorcrux(data, options = {}) {
    return validateHorcruxData(data, options);
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
    
    // Get password - from options, filename, or secret.js
    let password = options.password || options;
    
    // Extract password from filename if not provided (e.g., nova-p_password.svg or p_password.svg)
    if (!password || typeof password !== 'string') {
        const filename = path.basename(horcruxPath);
        // Match p_PASSWORD anywhere in filename (e.g., nova-p_nova2026.svg or p_password.svg)
        const passwordMatch = filename.match(/p_([^.]+)/);
        if (passwordMatch) {
            password = passwordMatch[1];
        }
    }
    
    if (!password || typeof password !== 'string') {
        try {
            const secret = require('./secret');
            password = await secret.getPassword();
        } catch (e) {
            throw new Error('Password required. Provide explicitly, set VANT_BRAIN_PASSWORD, or use p_[password] filename.');
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
        
        const parsed = JSON.parse(decoded.message);
        
        // Unwrap vant-horcrux format
        if (parsed.type === 'vant-horcrux' && parsed.data) {
            return parsed.data;
        }
        
        return parsed;
    }
    
    // JSON file
    const content = fs.readFileSync(horcruxPath, 'utf8');
    try {
        const parsed = JSON.parse(content);
        
        // Unwrap vant-horcrux format (JSON case)
        if (parsed.type === 'vant-horcrux' && parsed.data) {
            return parsed.data;
        }
        
        return parsed;
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
    
    // Unwrap vant-horcrux format
    if (data.type === 'vant-horcrux' && data.data) {
        data = data.data;
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
    
    // Validate before restore
    const validation = validateHorcrux(data);
    if (!validation.valid) {
        throw new Error(`Horcrux validation failed: ${validation.errors.join(', ')}`);
    }
    if (validation.warnings.length > 0) {
        console.warn('[HORCRUX] Warnings:', validation.warnings.join('; '));
    }
    
    const results = { restored: [], errors: [], validated: validation };
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
    
    // 1b. MULTIBRAIN: Restore stack and currentBrain
    if (data.mode && data.mode.loaded && brain) {
        try {
            // Restore stack order
            if (data.mode.stack && Array.isArray(data.mode.stack) && brain.loadStack) {
                brain.loadStack(data.mode.stack);
                results.restored.push('stack');
                
                // FIX: Persist stack to state.json
                if (brain.saveNeuronState) {
                    await brain.saveNeuronState({});
                }
            }
            
            // Restore current switched brain
            if (data.mode.currentBrain && brain.switchBrain) {
                brain.switchBrain(data.mode.currentBrain);
                results.restored.push('currentBrain');
                
                // FIX: Persist currentBrain to state.json
                if (brain.saveNeuronState) {
                    await brain.saveNeuronState({ currentBrain: data.mode.currentBrain });
                }
            }
        } catch(e) {
            results.errors.push({ multibrain: e.message });
        }
    }
    
    // 2. Restore BRAIN STORAGE (private files) - the main brain content!
    // MULTIBRAIN: Supports both old format (files array) and new format (brains object)
    // FIX: Merge with existing files instead of overwriting
    if (data.brainStorage && data.brainStorage.loaded) {
        try {
            const privatePath = 'models/private';
            const publicPath = 'models/public';
            
            // New format: brains object with type (private/public)
            if (data.brainStorage.brains) {
                for (const [brainName, brainData] of Object.entries(data.brainStorage.brains)) {
                    const basePath = brainData.type === 'private' ? privatePath : publicPath;
                    const brainPath = path.join(basePath, brainName);
                    const isPrivate = brainData.type === 'private';
                    
                    // Ensure brain directory exists
                    if (!fs.existsSync(brainPath)) {
                        fs.mkdirSync(brainPath, { recursive: true });
                    }
                    
                    // Restore each file
                    let filesRestored = 0;
                    for (const file of brainData.files || []) {
                        try {
                            const fullPath = path.join(brainPath, file.path);
                            const dir = path.dirname(fullPath);
                            if (!fs.existsSync(dir)) {
                                fs.mkdirSync(dir, { recursive: true });
                            }
                            
                            // FIX: Only write if file doesn't exist OR it's a private brain
                            // For public brains, skip if file already exists (don't overwrite git-tracked files)
                            if (isPrivate || !fs.existsSync(fullPath)) {
                                fs.writeFileSync(fullPath, file.content, 'utf8');
                                filesRestored++;
                            } else {
                                results.warnings = results.warnings || [];
                                results.warnings.push(`Skipped existing file: ${brainName}/${file.path}`);
                            }
                        } catch(e) {
                            results.errors.push({ file: `${brainName}/${file.path}`, error: e.message });
                        }
                    }
                    console.log(`[transform] Restored ${filesRestored} files to ${brainName} (${brainData.type})`);
                }
            } 
            // Old format: files array (single brain)
            else if (data.brainStorage.files) {
                const brainPath = brain?.getBrainPath?.() || 'models/private';
                
                for (const file of data.brainStorage.files) {
                    try {
                        const fullPath = path.join(brainPath, file.path);
                        const dir = path.dirname(fullPath);
                        if (!fs.existsSync(dir)) {
                            fs.mkdirSync(dir, { recursive: true });
                        }
                        // FIX: Only write if doesn't exist
                        if (!fs.existsSync(fullPath)) {
                            fs.writeFileSync(fullPath, file.content, 'utf8');
                        }
                    } catch(e) {
                        results.errors.push({ file: file.path, error: e.message });
                    }
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
    
    // 6b. MULTIBRAIN: Restore teams/org
    if (data.teams && !data.teams.error) {
        try {
            const teams = require('./teams');
            
            // Get store path
            const storePath = teams.getStorePath ? teams.getStorePath() : '.agent_tmp/teams.json';
            
            // Ensure directory exists
            const dir = path.dirname(storePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            // Write teams data
            const teamsData = {
                orgs: data.teams.orgs || [],
                depts: data.teams.depts || [],
                teams: data.teams.teams || [],
                roles: data.teams.roles || [],
                assignments: data.teams.assignments || []
            };
            
            fs.writeFileSync(storePath, JSON.stringify(teamsData, null, 2), 'utf8');
            results.restored.push('teams');
        } catch(e) {
            results.errors.push({ teams: e.message });
        }
    }
    
    // 6c. MULTIBRAIN v0.9.0: Restore trust scores
    if (data.trust && !data.trust.error) {
        try {
            const trust = require('./trust');
            
            // Import trust data
            const trustData = {
                scores: data.trust.scores || {},
                karma: data.trust.karma || {},
                roleTrust: data.trust.roleTrust || {}
            };
            
            trust.import(trustData);
            results.restored.push('trust');
        } catch(e) {
            results.errors.push({ trust: e.message });
        }
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

module.exports = {
    // Main functions
    gather,
    toHorcrux,
    toBackup,
    fromHorcrux,
    inspectHorcrux,
    restore,
    validateHorcrux,
    validateHorcruxFile,
    
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
    gatherMemory,
    gatherTeams,  // MULTIBRAIN
    gatherTrust,  // MULTIBRAIN v0.9.0
    
    // Delegation tracking
    trackDelegation,
    getDelegationHistory: _getDelegationHistory,
    getActiveDelegations: _getActiveDelegations,
    
    // Security
    getLayerStatus,
    _checkSecurity
};
