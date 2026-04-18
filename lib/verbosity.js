/**
 * Verbosity control - Control output verbosity
 * 
 * Usage:
 *   const verbose = require('./verbosity');
 *   verbose.set('terse');
 *   verbose.log('Done');  // Only shows if verbose !== 'quiet'
 */

const fs = require('fs');
const path = require('path');

let level = 'full';

// Try loading from config
try {
    const configPath = path.join(__dirname, '..', 'models', 'v0.8.2', 'verbosity.ini');
    if (fs.existsSync(configPath)) {
        const config = fs.readFileSync(configPath, 'utf8');
        const match = config.match(/verbosity=(\w+)/);
        if (match) level = match[1];
    }
} catch (e) {
    // Ignore - use default
}

function set(mode) {
    const modes = { quiet: 0, terse: 1, full: 2 };
    if (modes[mode] !== undefined) level = mode;
}
function get() { return level; }
function is(m) { return level === m; }

function log(...args) {
    if (level !== 'quiet') console.log(...args);
}
function info(...args) {
    if (level !== 'quiet') console.log(...args);
}
function warn(...args) { console.error(...args); }
function error(...args) { console.error(...args); }

module.exports = { set, get, is, log, info, warn, error };
