/**
 * Brain Registry (v0.9.0)
 * Multi-brain architecture - manage multiple brain folders
 * 
 * FAIR Principles:
 * - Findable: Registry with metadata, search
 * - Accessible: Standard paths, brain.use('name')
 * - Interoperable: JSON schemas for orgs/depts/teams
 * - Reusable: Shareable brain segments via _shared/
 * 
 * Usage:
 *   const brainRegistry = require('./brain-registry');
 *   brainRegistry.use('brain-main');     // Switch to brain-main
 *   brainRegistry.create('brain-work'); // Create new brain
 *   brainRegistry.list();               // List all brains
 *   brainRegistry.share('brain-work', 'lessons.md'); // Share segment
 */

const fs = require('fs');
const path = require('path');

// ==================== CONSTANTS ====================
const BRAINS_DIR = 'models/private';
const CONFIG_FILE = '_config.json';
const DEFAULT_BRAIN = 'brain-main';

// ==================== STATE ====================
let _currentBrain = DEFAULT_BRAIN;
let _brains = new Map();
let _config = null;

// ==================== CONFIG ====================
async function _loadConfig() {
    const configPath = path.join(BRAINS_DIR, CONFIG_FILE);
    
    // Create default config if not exists
    if (!fs.existsSync(configPath)) {
        const defaultConfig = {
            version: '0.9.0',
            defaultBrain: DEFAULT_BRAIN,
            brains: {},
            shared: {}
        };
        
        // Ensure brains directory exists
        if (!fs.existsSync(BRAINS_DIR)) {
            fs.mkdirSync(BRAINS_DIR, { recursive: true });
        }
        
        // Create default brain
        await create(DEFAULT_BRAIN);
        
        // Write config
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
        _config = defaultConfig;
        return _config;
    }
    
    try {
        const content = fs.readFileSync(configPath, 'utf8');
        _config = JSON.parse(content);
        return _config;
    } catch (e) {
        console.warn('[brain-registry] Config parse error:', e.message);
        return { version: '0.9.0', defaultBrain: DEFAULT_BRAIN, brains: {}, shared: {} };
    }
}

async function _saveConfig() {
    const configPath = path.join(BRAINS_DIR, CONFIG_FILE);
    fs.writeFileSync(configPath, JSON.stringify(_config, null, 2));
}

// ==================== BRAIN MANAGEMENT ====================

/**
 * Initialize registry - scan for brains
 */
async function init() {
    await _loadConfig();
    
    // Set current brain from config
    _currentBrain = _config?.defaultBrain || DEFAULT_BRAIN;
    
    // Scan for brain directories
    await scan();
    
    return {
        current: _currentBrain,
        brains: list()
    };
}

/**
 * Scan for brain directories
 */
async function scan() {
    _brains.clear();
    
    if (!fs.existsSync(BRAINS_DIR)) {
        return [];
    }
    
    const entries = fs.readdirSync(BRAINS_DIR, { withFileTypes: true });
    
    for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('brain-')) {
            const brainPath = path.join(BRAINS_DIR, entry.name);
            const meta = await _loadBrainMeta(brainPath);
            _brains.set(entry.name, {
                name: entry.name,
                path: brainPath,
                ...meta
            });
        }
    }
    
    return list();
}

/**
 * Load brain metadata
 */
async function _loadBrainMeta(brainPath) {
    const metaPath = path.join(brainPath, '_meta.json');
    
    if (fs.existsSync(metaPath)) {
        try {
            return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        } catch (e) {
            // Ignore parse errors
        }
    }
    
    // Default metadata
    return {
        created: null,
        description: '',
        tags: []
    };
}

/**
 * Save brain metadata
 */
async function _saveBrainMeta(brainPath, meta) {
    const metaPath = path.join(brainPath, '_meta.json');
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
}

/**
 * Get current brain name
 */
function getCurrent() {
    return _currentBrain;
}

/**
 * Switch to a brain
 * @param {string} name - Brain name
 */
function use(name) {
    // Validate brain exists
    if (!_brains.has(name)) {
        // Auto-create if doesn't exist
        create(name);
    }
    
    _currentBrain = name;
    
    // Update config
    if (_config) {
        _config.defaultBrain = name;
        _saveConfig();
    }
    
    return {
        brain: _currentBrain,
        path: getBrainPath()
    };
}

/**
 * Get path for current brain
 */
function getBrainPath() {
    return path.join(BRAINS_DIR, _currentBrain);
}

/**
 * Get path for a specific brain
 */
function getBrainPathByName(name) {
    return path.join(BRAINS_DIR, name);
}

/**
 * List all brains
 */
function list() {
    return Array.from(_brains.values()).map(b => ({
        name: b.name,
        path: b.path,
        current: b.name === _currentBrain,
        created: b.created,
        description: b.description,
        tags: b.tags
    }));
}

/**
 * Create a new brain
 * @param {string} name - Brain name
 * @param {Object} options - { description, tags }
 */
async function create(name, options = {}) {
    // Ensure brain- prefix
    if (!name.startsWith('brain-')) {
        name = 'brain-' + name;
    }
    
    const brainPath = path.join(BRAINS_DIR, name);
    
    // Don't overwrite
    if (fs.existsSync(brainPath)) {
        return { created: false, reason: 'exists', name };
    }
    
    // Create directory structure
    fs.mkdirSync(brainPath, { recursive: true });
    
    // Create standard brain files
    const standardFiles = [
        { name: 'identity.md', content: `# ${name}\n\n> Created: ${new Date().toISOString()}\n\n## About\n- \n\n## Purpose\n- \n` },
        { name: 'goals.md', content: `# Goals\n\n## Current\n- \n\n## Backlog\n- \n` },
        { name: 'lessons.md', content: `# Lessons\n\n## Learned\n- \n` },
        { name: 'preferences.md', content: `# Preferences\n\n## Working Style\n- \n\n## Communication\n- \n` },
        { name: 'errors.md', content: `# Errors\n\n## Mistakes to Avoid\n- \n` }
    ];
    
    for (const file of standardFiles) {
        fs.writeFileSync(path.join(brainPath, file.name), file.content);
    }
    
    // Create _neurons directory
    fs.mkdirSync(path.join(brainPath, '_neurons'), { recursive: true });
    
    // Create _shared directory
    fs.mkdirSync(path.join(brainPath, '_shared'), { recursive: true });
    
    // Create metadata
    const meta = {
        created: new Date().toISOString(),
        description: options.description || '',
        tags: options.tags || [],
        version: '0.9.0'
    };
    await _saveBrainMeta(brainPath, meta);
    
    // Add to registry
    _brains.set(name, {
        name,
        path: brainPath,
        ...meta
    });
    
    // Update config
    if (_config) {
        _config.brains[name] = meta;
        _saveConfig();
    }
    
    // Switch to new brain
    use(name);
    
    return { created: true, name, path: brainPath };
}

/**
 * Delete a brain (except default)
 * @param {string} name - Brain name
 */
async function remove(name) {
    if (name === DEFAULT_BRAIN) {
        return { removed: false, reason: 'cannot_remove_default' };
    }
    
    const brainPath = getBrainPathByName(name);
    
    if (!fs.existsSync(brainPath)) {
        return { removed: false, reason: 'not_exists' };
    }
    
    // Use rmSync for recursive delete
    fs.rmSync(brainPath, { recursive: true, force: true });
    
    _brains.delete(name);
    
    // If removed current brain, switch to default
    if (_currentBrain === name) {
        use(DEFAULT_BRAIN);
    }
    
    // Update config
    if (_config && _config.brains) {
        delete _config.brains[name];
        _saveConfig();
    }
    
    return { removed: true, name };
}

// ==================== SHARING ====================

/**
 * Share a brain segment to another brain
 * @param {string} toBrain - Target brain name
 * @param {string} fileName - File to share
 */
async function share(toBrain, fileName) {
    const fromBrain = _currentBrain;
    const fromPath = path.join(getBrainPath(), fileName);
    const toPath = path.join(getBrainPathByName(toBrain), '_shared', `from-${fromBrain}`, fileName);
    
    // Ensure source exists
    if (!fs.existsSync(fromPath)) {
        return { shared: false, reason: 'source_not_found', file: fileName };
    }
    
    // Ensure target directory exists
    const toDir = path.dirname(toPath);
    if (!fs.existsSync(toDir)) {
        fs.mkdirSync(toDir, { recursive: true });
    }
    
    // Copy file
    fs.copyFileSync(fromPath, toPath);
    
    // Record in config
    if (_config) {
        if (!_config.shared) _config.shared = {};
        _config.shared[fileName] = {
            from: fromBrain,
            to: toBrain,
            sharedAt: new Date().toISOString()
        };
        _saveConfig();
    }
    
    return { shared: true, file: fileName, from: fromBrain, to: toBrain };
}

/**
 * List shared segments received by current brain
 */
function listShared() {
    const sharedPath = path.join(getBrainPath(), '_shared');
    
    if (!fs.existsSync(sharedPath)) {
        return [];
    }
    
    const shared = [];
    const entries = fs.readdirSync(sharedPath, { withFileTypes: true });
    
    for (const entry of entries) {
        if (entry.isDirectory()) {
            const dirPath = path.join(sharedPath, entry.name);
            const files = fs.readdirSync(dirPath);
            
            for (const file of files) {
                shared.push({
                    from: entry.name.replace('from-', ''),
                    file,
                    path: path.join(dirPath, file)
                });
            }
        }
    }
    
    return shared;
}

// ==================== NODE/OBJECT SCHEMA ====================

/**
 * Get neurons (orgs, teams, relationships) for current brain
 */
function getNeurons() {
    const neuronsPath = path.join(getBrainPath(), '_neurons');
    
    if (!fs.existsSync(neuronsPath)) {
        return { orgs: [], teams: [], relationships: [] };
    }
    
    const neurons = {
        orgs: [],
        teams: [],
        relationships: []
    };
    
    // Load orgs
    const orgsPath = path.join(neuronsPath, 'orgs.json');
    if (fs.existsSync(orgsPath)) {
        try {
            neurons.orgs = JSON.parse(fs.readFileSync(orgsPath, 'utf8'));
        } catch (e) {}
    }
    
    // Load teams
    const teamsPath = path.join(neuronsPath, 'teams.json');
    if (fs.existsSync(teamsPath)) {
        try {
            neurons.teams = JSON.parse(fs.readFileSync(teamsPath, 'utf8'));
        } catch (e) {}
    }
    
    // Load relationships
    const relPath = path.join(neuronsPath, 'relationships.json');
    if (fs.existsSync(relPath)) {
        try {
            neurons.relationships = JSON.parse(fs.readFileSync(relPath, 'utf8'));
        } catch (e) {}
    }
    
    return neurons;
}

/**
 * Save neurons
 */
function saveNeurons(neurons) {
    const neuronsPath = path.join(getBrainPath(), '_neurons');
    
    if (!fs.existsSync(neuronsPath)) {
        fs.mkdirSync(neuronsPath, { recursive: true });
    }
    
    if (neurons.orgs) {
        fs.writeFileSync(path.join(neuronsPath, 'orgs.json'), JSON.stringify(neurons.orgs, null, 2));
    }
    if (neurons.teams) {
        fs.writeFileSync(path.join(neuronsPath, 'teams.json'), JSON.stringify(neurons.teams, null, 2));
    }
    if (neurons.relationships) {
        fs.writeFileSync(path.join(neuronsPath, 'relationships.json'), JSON.stringify(neurons.relationships, null, 2));
    }
    
    return { saved: true };
}

// ==================== EXPORTS ====================
module.exports = {
    // Initialization
    init,
    scan,
    
    // Brain management
    use,
    create,
    remove,
    list,
    getCurrent,
    getBrainPath,
    getBrainPathByName,
    
    // Sharing
    share,
    listShared,
    
    // Neurons (orgs, teams, relationships)
    getNeurons,
    saveNeurons,
    
    // Constants
    DEFAULT_BRAIN,
    BRAINS_DIR
};
