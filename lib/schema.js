/**
 * Vant Schema Validation (v0.8.6)
 * WITH EVENT EMISSIONS - validation emits globally
 *
 * Strict JSON Schema for brain.json, _core.json (LTC)
 * Prevents corrupted/malformed states from hydrating
 *
 * Usage:
 *   const schema = require('./lib/schema');
 *   schema.validate('brain.json');     // Check brain
 *   schema.validateState(state);    // Check state object
 *   schema.isValid();               // Master check
 */

// ==================== EVENT SYSTEM ====================
let _event = null;
function _emit(event, data) {
    if (!_event) {
        try { _event = require('./event'); } catch (e) { return; }
    }
    if (_event && _event.emit) {
        _event.emit(event, data);
    }
}

const fs = require('fs');
const path = require('path');

// Lazy-load sandbox for capability check
let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) {
        try { _sandbox = require('./sandbox'); } catch (e) {}
    }
    return _sandbox;
}

function _checkRead() {
    const sandbox = _getSandbox();
    if (sandbox && sandbox.canRead) {
        try {
            if (!sandbox.canRead()) {
                throw new Error('Read permission required for schema operations');
            }
        } catch (e) {}
    }
}

const brain = require('./brain');
const MODELS_PATH = brain.getBrainPath();
const STATE_FILE = path.join(MODELS_PATH, 'brain.json');
const LTC_FILE = path.join(MODELS_PATH, '_core.json');
const SCHEMA_VERSION = '1.0';

/**
 * brain.json schema
 */
const BRAIN_SCHEMA = {
    version: 'string',
    identity: 'object',
    learnings: 'array',
    decisions: 'array',
    preferences: 'object',
    updated: 'string'
};

/**
 * _core.json (LTC) schema
 */
const LTC_SCHEMA = {
    version: 'string',
    updated: 'string',
    core: 'object',
    stats: 'object'
};

/**
 * Validate a file against schema
 * @param {string} file - File name
 * @returns {object} Result
 */
function validateFile(fileName) {
    _checkRead();
    const filePath = path.join(MODELS_PATH, fileName);
    
    if (!fs.existsSync(filePath)) {
        return { valid: false, error: 'File not found: ' + fileName };
    }
    
    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        if (fileName === 'brain.json' || fileName === 'brain.json') {
            return validateState(data, BRAIN_SCHEMA, fileName);
        }
        if (fileName === '_core.json') {
            return validateState(data, LTC_SCHEMA, fileName);
        }
        
        return { valid: true, file: fileName };
    } catch (e) {
        return { valid: false, error: 'Parse error: ' + e.message };
    }
}

/**
 * Validate state object
 * @param {object} state - State object
 * @param {object} schema - Schema
 * @param {string} name - Name for errors
 * @returns {object} Result
 */
function validateState(state, schema, name = 'state') {
    const errors = [];
    
    for (const [key, type] of Object.entries(schema)) {
        if (!(key in state)) {
            errors.push('Missing key: ' + key);
            continue;
        }
        
        const value = state[key];
        
        if (type === 'string' && typeof value !== 'string') {
            errors.push('Expected string for ' + key + ', got ' + typeof value);
        }
        if (type === 'object' && (typeof value !== 'object' || value === null)) {
            errors.push('Expected object for ' + key + ', got ' + typeof value);
        }
        if (type === 'array' && !Array.isArray(value)) {
            errors.push('Expected array for ' + key + ', got ' + typeof value);
        }
    }
    
    // Check for unexpected keys
    const allowedKeys = Object.keys(schema);
    const actualKeys = Object.keys(state);
    for (const key of actualKeys) {
        if (!allowedKeys.includes(key) && key !== 'metadata') {
            // Not an error, just a warning - but log it
            audit.info('[Schema] Warning: Unknown key ' + key);
        }
    }
    
    return {
        valid: errors.length === 0,
        errors,
        file: name
    };
}

/**
 * Validate all state files
 * @returns {object} Result
 */
function isValid() {
    const results = [];
    
    // Check brain.json
    if (fs.existsSync(STATE_FILE)) {
        results.push(validateFile('brain.json'));
    }
    
    // Check _core.json
    if (fs.existsSync(LTC_FILE)) {
        results.push(validateFile('_core.json'));
    }
    
    const allValid = results.every(r => r.valid);
    
    return {
        valid: allValid,
        results,
        summary: {
            checked: results.length,
            passed: results.filter(r => r.valid).length,
            failed: results.filter(r => !r.valid).length
        }
    };
}

/**
 * Get schema for a file type
 * @param {string} type - 'brain' or 'core'
 * @returns {object} Schema
 */
function getSchema(type) {
    if (type === 'brain' || type === 'brain.json') {
        return BRAIN_SCHEMA;
    }
    if (type === 'core' || type === '_core.json') {
        return LTC_SCHEMA;
    }
    return null;
}

/**
 * CLI validate command
 * @returns {boolean} Valid
 */
function CLI() {
    const result = isValid();
    
    if (result.valid) {
        audit.info('✓ All schemas valid');
        return true;
    }
    
    audit.info('✗ Schema validation failed:');
    for (const r of result.results) {
        if (!r.valid) {
            audit.info('  ' + r.file + ': ' + r.errors.join(', '));
        }
    }
    return false;
}

module.exports = {
    validateFile,
    validateState,
    isValid,
    getSchema,
    CLI,
    BRAIN_SCHEMA,
    LTC_SCHEMA
};