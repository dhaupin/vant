/**
 * Vant Loader (Node.js)
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
    const config = loadConfig();
    if (config.MODEL_PATH) {
        return config.MODEL_PATH;
    }
    if (args[2]) {
        return `models/${args[2]}`;
    }
    return 'models/public';
}

/**
 * Load model files - supports .md and .txt for backward compat
 */
function loadModel(modelPath) {
    if (!fs.existsSync(modelPath)) {
        console.error(`⚠ Model not found: ${modelPath}`);
        return null;
    }

    const files = fs.readdirSync(modelPath).filter(f => {
        const ext = path.extname(f).toLowerCase();
        return ['.md', '.txt', '.json', '.yaml', '.yml'].includes(ext);
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
