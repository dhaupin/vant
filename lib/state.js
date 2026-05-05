/**
 * Vant State - Static vs Hydrated Separation
 *
 * Implements Prestruct's partial hydration pattern:
 * - Static State: Immutable facts, identity (never changes)
 * - Current Task: Hydrated per prompt
 */

const fs = require('fs');
const path = require('path');

const MODELS_PATH = path.join(__dirname, '..', 'models');
const STATE_FILE = 'state.json';

const STATE = {
    STATIC: 'static',   // Immutable - identity, facts
    CURRENT: 'current', // Active task - the "island" being worked on
    TEMP: 'temp'        // Temporary vars - wiped on prune
};

/**
 * Get current state
 * @returns {object} State object
 */
function get() {
    const p = path.join(MODELS_PATH, STATE_FILE);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    return { static: {}, current: {}, temp: {}, updated: null };
}

/**
 * Save state
 * @param {object} state - State to save
 */
function save(state) {
    state.updated = new Date().toISOString();
    fs.writeFileSync(path.join(MODELS_PATH, STATE_FILE), JSON.stringify(state, null, 2));
}

/**
 * Get static state
 * @param {string} key - Optional key
 * @returns {any} Static value or all
 */
function getStatic(key) {
    const s = get();
    return key ? s.static[key] : s.static;
}

/**
 * Set static state (identity, facts)
 * @param {string|object} key - Key or object
 * @param {any} value - Value
 */
function setStatic(key, value) {
    const s = get();
    if (typeof key === 'object') {
        s.static = { ...s.static, ...key };
    } else {
        s.static[key] = value;
    }
    save(s);
}

/**
 * Get current task state
 * @param {string} key - Key
 * @returns {any} Current value
 */
function getCurrent(key) {
    const s = get();
    return key ? s.current[key] : s.current;
}

/**
 * Set current task (what agent is working on)
 * @param {string|object} key - Key or object
 * @param {any} value - Value
 */
function setCurrent(key, value) {
    const s = get();
    if (typeof key === 'object') {
        s.current = { ...s.current, ...key };
    } else {
        s.current[key] = value;
    }
    save(s);
}

/**
 * Get temp state
 * @param {string} key - Key
 * @returns {any} Temp value
 */
function getTemp(key) {
    const s = get();
    return key ? s.temp[key] : s.temp;
}

/**
 * Set temp state (wiped on prune)
 * @param {string|object} key - Key or object
 * @param {any} value - Value
 */
function setTemp(key, value) {
    const s = get();
    if (typeof key === 'object') {
        s.temp = { ...s.temp, ...key };
    } else {
        s.temp[key] = value;
    }
    save(s);
}

/**
 * Clear temp state (used after prune)
 */
function clearTemp() {
    const s = get();
    s.temp = {};
    save(s);
}

/**
 * Get summary for context
 * @returns {string} Summary for prompt
 */
function getSummary() {
    const s = get();
    return '[state] static=' + Object.keys(s.static).length + ' keys, current=' + Object.keys(s.current).length + ', temp=' + Object.keys(s.temp).length;
}

module.exports = { get, save, STATE, getStatic, setStatic, getCurrent, setCurrent, getTemp, setTemp, clearTemp, getSummary };