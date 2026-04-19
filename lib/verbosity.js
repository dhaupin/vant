/**
 * Verbosity control - Multi-handler verbosity for Vant
 *
 * Handles: log, response, content, comment, code
 * Load from: models/public/verbosity.ini
 *
 * Usage:
 *   const verbose = require('./verbosity');
 *   verbose.log('Done');      // Respects log= setting
 *   verbose.get('content');   // Returns 'standard', 'minimal', 'extended'
 */

const fs = require('fs');
const path = require('path');

// Default verbosity levels
const defaults = {
    log: 'normal',
    response: 'terse',
    content: 'standard',
    comment: 'normal',
    code: 'readable'
};

// Current settings
let settings = { ...defaults };

// Load from verbosity.ini
try {
    const configPath = path.join(__dirname, '..', 'models', 'public', 'verbosity.ini');
    if (fs.existsSync(configPath)) {
        const config = fs.readFileSync(configPath, 'utf8');
        
        // Parse INI-style: key=value (after # comments)
        const lines = config.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            // Skip comments and sections
            if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('[')) continue;
            
            const match = trimmed.match(/^(\w+)=(\w+)/);
            if (match) {
                const key = match[1].toLowerCase();
                const value = match[2].toLowerCase();
                if (defaults[key]) {
                    settings[key] = value;
                }
            }
        }
    }
} catch (e) {
    // Ignore - use defaults
}

// Map log levels to numeric
const logLevels = { quiet: 0, normal: 1, verbose: 2 };
let logLevel = logLevels[settings.log] || 1;

function set(key, mode) {
    if (key === 'log') {
        logLevel = logLevels[mode] !== undefined ? logLevels[mode] : 1;
    } else if (defaults[key]) {
        settings[key] = mode;
    }
}

function get(key) {
    if (key === 'log') return settings.log;
    return settings[key] || defaults[key];
}

function is(key, mode) {
    return get(key) === mode;
}

function log(...args) {
    if (logLevel > 0) console.log(...args);
}

function info(...args) {
    if (logLevel > 0) console.log(...args);
}

function warn(...args) {
    console.error(...args);
}

function error(...args) {
    console.error(...args);
}

function debug(...args) {
    if (logLevel > 1) console.log(...args);
}

module.exports = { set, get, is, log, info, warn, error, debug, settings };
