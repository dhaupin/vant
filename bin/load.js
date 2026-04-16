/**
 * VANT Loader (Node.js)
 * 
 * Usage: node bin/load.js [version]
 *        node bin/load.js v0.5.0
 */

const fs = require('fs');
const path = require('path');

const MODELS_DIR = 'models';
const STATES_DIR = 'states';
const CONFIG_FILE = 'config.ini';

/**
 * Load configuration
 */
function loadConfig() {
    if (!fs.existsSync(CONFIG_FILE)) {
        console.warn('⚠ config.ini not found, using defaults');
        return { VANT_VERSION: 'unknown', MODEL_PATH: 'models/v0.5.0' };
    }
    
    const config = {};
    const content = fs.readFileSync(CONFIG_FILE, 'utf8');
    content.split('\n').forEach(line => {
        line = line.trim();
        if (line && !line.startsWith('#') && line.includes('=')) {
            const [key, value] = line.split('=').map(s => s.trim());
            config[key] = value;
        }
    });
    return config;
}

/**
 * Load model/brain
 */
function loadModel(version = 'latest') {
    const config = loadConfig();
    
    if (version === 'latest') {
        const dirs = fs.readdirSync(MODELS_DIR).filter(d => 
            d.startsWith('v') && fs.statSync(path.join(MODELS_DIR, d)).isDirectory()
        );
        version = dirs.sort().pop();
    }

    const modelPath = path.join(MODELS_DIR, version);
    
    if (!fs.existsSync(modelPath)) {
        throw new Error(`Model not found: ${modelPath}`);
    }

    console.log(`Loading VANT ${version} from ${modelPath}`);

    const brain = {};
    const files = fs.readdirSync(modelPath).filter(f => f.endsWith('.txt') || f.endsWith('.json'));

    files.forEach(file => {
        const key = path.basename(file, path.extname(file));
        brain[key] = fs.readFileSync(path.join(modelPath, file), 'utf8');
    });

    console.log(`Loaded ${Object.keys(brain).length} brain files`);
    
    return {
        version,
        config,
        brain,
        meta: brain.meta ? JSON.parse(brain.meta) : null,
        identity: brain.identity || null
    };
}

// Main
const version = process.argv[2] || 'latest';
const vant = loadModel(version);

console.log(`\n=== ${vant.identity ? vant.identity.split('\n')[0] : 'VANT'} ===`);
console.log(`Version: v${vant.version}`);
console.log(`Meta: ${vant.meta ? vant.meta.generation + 'th generation' : 'no meta'}`);
console.log('\nThe Covenant persists.');

module.exports = { loadModel, loadConfig };