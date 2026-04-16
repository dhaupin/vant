/**
 * Brain Plugin
 * 
 * Handles loading and managing the VANT brain.
 * 
 * Usage:
 *   brain.load('v0.4.0')
 *   brain.get('identity')
 *   brain.getAll()
 */

const fs = require('fs');
const path = require('path');

const MODELS_PATH = path.join(__dirname, '../../../models');

let currentBrain = {};
let currentVersion = null;

function load(version = 'latest') {
    // Find version
    if (version === 'latest') {
        const versions = fs.readdirSync(MODELS_PATH).filter(d => 
            fs.statSync(path.join(MODELS_PATH, d)).isDirectory()
        );
        version = versions.sort().pop();
    }
    
    const brainPath = path.join(MODELS_PATH, version);
    if (!fs.existsSync(brainPath)) {
        throw new Error(`Brain not found: ${version}`);
    }
    
    // Load all .txt files
    currentBrain = {};
    const files = fs.readdirSync(brainPath);
    
    files.forEach(file => {
        if (file.endsWith('.txt')) {
            const key = path.basename(file, '.txt');
            currentBrain[key] = fs.readFileSync(path.join(brainPath, file), 'utf8');
        }
    });
    
    currentVersion = version;
    console.log(`[Brain] Loaded ${version} with ${Object.keys(currentBrain).length} files`);
    
    return { version, brain: currentBrain };
}

function get(key) {
    return currentBrain[key] || null;
}

function getAll() {
    return { ...currentBrain };
}

function getVersion() {
    return currentVersion;
}

function has(key) {
    return key in currentBrain;
}

// Load latest on init
try {
    load('latest');
} catch (e) {
    console.log('[Brain] No brain loaded yet');
}

module.exports = { load, get, getAll, version: getVersion, has };