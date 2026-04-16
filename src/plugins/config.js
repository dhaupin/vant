/**
 * Config Plugin
 * 
 * Handles system configuration loading and validation.
 */

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '../../config.ini');

function loadConfig() {
    if (!fs.existsSync(CONFIG_FILE)) {
        return {};
    }
    
    const content = fs.readFileSync(CONFIG_FILE, 'utf8');
    const config = {};
    
    content.split('\n').forEach(line => {
        line = line.trim();
        if (!line || line.startsWith('#')) return;
        
        const [key, ...vals] = line.split('=');
        if (key && vals.length) {
            config[key.trim()] = vals.join('=').trim();
        }
    });
    
    return config;
}

function getConfig(key) {
    const config = loadConfig();
    return key ? config[key] : config;
}

function setConfig(key, value) {
    const config = loadConfig();
    config[key] = value;
    
    const lines = Object.entries(config).map(([k, v]) => `${k}=${v}`);
    fs.writeFileSync(CONFIG_FILE, lines.join('\n'));
}

function validateConfig() {
    const config = loadConfig();
    const required = ['VANT_VERSION', 'MODEL_PATH', 'GITHUB_REPO'];
    const missing = required.filter(k => !config[k]);
    
    if (missing.length) {
        throw new Error(`Missing config: ${missing.join(', ')}`);
    }
    
    return true;
}

module.exports = { load: loadConfig, get: getConfig, set: setConfig, validate: validateConfig };