/**
 * Vant Loader (Node.js)
 * Load brain from models/public or custom path
 * 
 * All args should have both long (--arg) and short (-a) forms.
 * 
 * Usage: vant load [-h|--help] [-v|--version <ver>] [-l|--latest]
 */

// -h/--help: show help and exit
const args = process.argv.slice(2);
if (args[0] === '-h' || args[0] === '--help') {
    console.log('Usage: vant load [-h|--help] [-v|--version <ver>] [-l|--latest]');
    console.log('');
    console.log('  -h, --help     Show this help');
    console.log('  -v, --version Load specific version');
    console.log('  -l, --latest  Force latest');
    process.exit(0);
}

const vaf = require("../lib/vaf");
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
        return { VANT_VERSION: 'unknown', MODEL_PATH: 'models/public' };
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
 * Determine which model to load
 * Priority: config MODEL_PATH > argument > default (public)
 */
function getModelPath(args) {
    if (args[2]) vaf.check(args[2], {type: "string", name: "version", maxLength: 20});
    const config = loadConfig();
    let modelPath = config.MODEL_PATH || 'models/public';
    
    // SECURITY: Validate MODEL_PATH (block path traversal)
    if (modelPath.startsWith('/') || modelPath.includes('..')) {
        console.error(`⚠ Invalid MODEL_PATH: ${modelPath}`);
        modelPath = 'models/public';
    }
    
    if (args[2]) {
        return `models/${args[2]}`;
    }
    return modelPath;
}

/**
 * Load model files - supports .md and .txt for backward compat
 */
function loadModel(modelPath) {
    // SECURITY: Validate path is within allowed directory
    const resolved = path.resolve(modelPath);
    const allowed = path.resolve('models');
    if (!resolved.startsWith(allowed + path.sep) && resolved !== allowed) {
        console.error(`⚠ Path traversal blocked: ${modelPath}`);
        return null;
    }

    if (!fs.existsSync(modelPath)) {
        console.error(`⚠ Model not found: ${modelPath}`);
        return null;
    }

    const files = fs.readdirSync(modelPath).filter(f => {
        const filePath = path.join(modelPath, f);
        const ext = path.extname(f).toLowerCase();
        const isFile = fs.statSync(filePath).isFile();
        return isFile && ['.md', '.txt', '.json', '.yaml', '.yml'].includes(ext);
    });

    const model = {};
    files.forEach(file => {
        const filePath = path.join(modelPath, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const ext = path.extname(file).toLowerCase();
        const name = path.basename(file, ext);
        
        if (ext === '.json') {
            try {
                model[name] = JSON.parse(content);
            } catch (e) {
                model[name] = content;
            }
        } else if (ext === '.yaml' || ext === '.yml') {
            try {
                const yaml = require('yaml');
                model[name] = yaml.parse(content);
            } catch (e) {
                model[name] = content;
            }
        } else {
            model[name] = content;
        }
    });

    return model;
}

const modelPath = getModelPath(process.argv);
const model = loadModel(modelPath);

if (model) {
    console.log(`✓ Model loaded: ${modelPath}`);
    console.log(`  Files: ${Object.keys(model).join(', ')}`);
    
    if (model.identity || model.identity_md) {
        console.log(`  Identity: ${model.identity?.MODEL || model.identity_md?.MODEL || 'unknown'}`);
    }
} else {
    console.error('✗ Failed to load model');
    process.exit(1);
}

module.exports = { loadConfig, getModelPath, loadModel };
