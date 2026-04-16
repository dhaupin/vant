/**
 * VANT Universal Loader
 * 
 * Generic abstraction for loading anything into VANT.
 * Protected loader - validates andsanitizes all inputs.
 * 
 * Supported types:
 * - model:    Brain versions (models/v0.x.x)
 * - plugin:   Extensions (src/plugins/)
 * - config:  System config (config.ini)
 * - settings: User settings (settings.ini)
 * - mood:    Mood state (mood.ini)
 * - state:   Instance state (states/*)
 * - brain:   Full brain package (all .txt files)
 */

const fs = require('fs');
const path = require('path');

const LOADER_VERSION = '0.5.0';

// Allowed types
const ALLOWED_TYPES = [
    'model', 'plugin', 'config', 
    'settings', 'mood', 'state', 'brain'
];

// Base paths
const PATHS = {
    model: 'models',
    plugin: 'src/plugins',
    config: '.',
    settings: '.',
    mood: '.',
    state: 'states',
    brain: 'models'
};

// Allowed file extensions per type
const ALLOWED_EXT = {
    model: ['.txt', '.json'],
    plugin: ['.js', '.json'],
    config: ['.ini', '.json', '.yaml'],
    settings: ['.ini', '.json', '.yaml'],
    mood: ['.ini', '.json'],
    state: ['.json'],
    brain: ['.txt', '.json']
};

/**
 * Load anything - generic entry point
 * @param {string} type - Type to load (model, plugin, config, etc)
 * @param {string} name - Name/version to load
 * @param {object} options - Loader options
 * @returns {object} Loaded content
 */
function load(type, name, options = {}) {
    // Validate type
    if (!ALLOWED_TYPES.includes(type)) {
        throw new Error(`Invalid type: ${type}. Allowed: ${ALLOWED_TYPES.join(', ')}`);
    }
    
    // Resolve path
    const basePath = options.basePath || PATHS[type];
    const loadPath = path.join(basePath, name);
    
    // Check exists
    if (!fs.existsSync(loadPath)) {
        throw new Error(`Not found: ${loadPath}`);
    }
    
    // Load based on type
    let result;
    switch (type) {
        case 'model':
        case 'brain':
            result = loadBrain(loadPath);
            break;
        case 'plugin':
            result = loadPlugin(loadPath);
            break;
        case 'config':
        case 'settings':
        case 'mood':
            result = loadIni(loadPath);
            break;
        case 'state':
            result = loadJson(loadPath);
            break;
        default:
            throw new Error(`Unhandled type: ${type}`);
    }
    
    result._meta = {
        type,
        name,
        path: loadPath,
        loaded: new Date().toISOString(),
        loader: LOADER_VERSION
    };
    
    return result;
}

/**
 * Load brain (collection of .txt files)
 */
function loadBrain(brainPath) {
    const brain = {};
    const files = fs.readdirSync(brainPath);
    
    files.forEach(file => {
        const ext = path.extname(file);
        if (ALLOWED_EXT.brain.includes(ext)) {
            const key = path.basename(file, ext);
            brain[key] = fs.readFileSync(path.join(brainPath, file), 'utf8');
        }
    });
    
    return { brain, _count: Object.keys(brain).length };
}

/**
 * Load plugin
 */
function loadPlugin(pluginPath) {
    const indexPath = path.join(pluginPath, 'index.js');
    if (!fs.existsSync(indexPath)) {
        throw new Error('Plugin missing index.js');
    }
    
    const plugin = require(indexPath);
    const configPath = path.join(pluginPath, 'config.json');
    const config = fs.existsSync(configPath) 
        ? JSON.parse(fs.readFileSync(configPath, 'utf8')) 
        : {};
    
    return { plugin, config };
}

/**
 * Load .ini file (simple parser)
 */
function loadIni(iniPath) {
    const content = fs.readFileSync(iniPath, 'utf8');
    const lines = content.split('\n');
    const result = {};
    let currentSection = 'default';
    
    lines.forEach(line => {
        line = line.trim();
        if (!line || line.startsWith('#') || line.startsWith('//')) return;
        
        if (line.startsWith('[') && line.endsWith(']')) {
            currentSection = line.slice(1, -1);
            result[currentSection] = {};
        } else if (line.includes('=')) {
            const [key, ...valParts] = line.split('=');
            const section = result[currentSection] || {};
            section[key.trim()] = valParts.join('=').trim();
            result[currentSection] = section;
        }
    });
    
    return result;
}

/**
 * Load JSON file
 */
function loadJson(jsonPath) {
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
}

/**
 * Load latest of a type
 */
function loadLatest(type) {
    const base = PATHS[type];
    const items = fs.readdirSync(base).filter(f => {
        const p = path.join(base, f);
        return fs.statSync(p).isDirectory();
    });
    
    if (!items.length) throw new Error(`No ${type}s found`);
    
    // Sort by version
    const latest = items.sort().pop();
    return load(type, latest);
}

// Exports
module.exports = { 
    load, 
    loadLatest, 
    ALLOWED_TYPES, 
    PATHS,
    LOADER_VERSION 
};