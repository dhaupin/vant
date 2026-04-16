/**
 * Verbosity control - Control output verbosity
 * 
 * Usage:
 *   const verbose = require('./verbosity');
 *   verbose.set('terse');
 *   verbose.log('Done');  // Only shows if verbose !== 'quiet'
 */

let level = 'full';
const levels = { quiet: 0, terse: 1, full: 2 };

function set(mode) {
    if (levels[mode] !== undefined) level = mode;
}
function get() { return level; }
function is(m) { return level === m; }

function log(...args) {
    if (level !== 'quiet') console.log(...args);
}
function info(...args) {
    if (level !== 'quiet') console.log(...args);
}
function warn(...args) {
    console.error(...args);  // Always show warnings
}
function error(...args) {
    console.error(...args);
}

module.exports = { set, get, is, log, info, warn, error };
