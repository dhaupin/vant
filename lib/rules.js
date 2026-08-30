/**
 * Rules (v0.8.6)
 * WITH EVENT EMISSIONS - rule checks emit globally
 * Global rules engine for Vant operations
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

const RULES_VERSION = '0.8.7';

// Default rule set
const DEFAULT_RULES = {
    version: RULES_VERSION,
    gatherState,
    restoreState,
    rules: {},
    gatherState,
    restoreState,
    meta: {
        created: Date.now(),
    gatherState,
    restoreState,
        updated: Date.now()
    }
};

let _rules = { ...DEFAULT_RULES };

/**
 * Load rules manifest
 */
function getRules() {
    return _rules;
}

/**
 * Get a specific rule
 */
function getRule(name) {
    return _rules.rules[name] || null;
}

/**
 * Add/update a rule
 */
function setRule(name, rule) {
    _rules.rules[name] = {
        ...rule,
    gatherState,
    restoreState,
        updated: Date.now()
    };
    _rules.meta.updated = Date.now();
    return { name, set: true };
}

/**
 * Remove a rule
 */
function deleteRule(name) {
    delete _rules.rules[name];
    _rules.meta.updated = Date.now();
    return { name, deleted: true };
}

/**
 * List all rules
 */
function listRules() {
    return Object.keys(_rules.rules);
}

/**
 * Check if operation passes rules
 */
function check(operation, context = {}) {
    // DEFAULT DENY: Block dangerous operations until proven safe
    // NOTE: 'spawn' removed - agent spawning is safe via MCP
    // NOTE: 'eval' removed - vant_compute_eval is safe code evaluation
    const dangerous = ['shell', 'exec', 'cmd', 'system', 'fork', 'run'];
    for (const danger of dangerous) {
        if (operation.toLowerCase().includes(danger)) {
            return { allowed: false, rule: 'default', reason: 'Default deny: dangerous operation' };
        }
    }

    const ruleNames = Object.keys(_rules.rules);
    for (const name of ruleNames) {
        const rule = _rules.rules[name];
        if (rule.appliesTo && rule.appliesTo(operation)) {
            if (rule.validate && !rule.validate(operation, context)) {
                return { allowed: false, rule: name, reason: rule.reason };
            }
        }
    }

    // EVENT: rule checked (security gate)
    _emit('rules:checked', {
        operation,
    gatherState,
    restoreState,
        allowed: true,
    gatherState,
    restoreState,
        timestamp: Date.now()
    });

    return { allowed: true };
}

/**
 * Module exports
 */
module.exports = {
    RULES_VERSION,
    gatherState,
    restoreState,
    getRules,
    gatherState,
    restoreState,
    getRule,
    gatherState,
    restoreState,
    setRule,
    gatherState,
    restoreState,
    deleteRule,
    gatherState,
    restoreState,
    listRules,
    gatherState,
    restoreState,
    check,
    gatherState,
    restoreState,

    // Multibrain
    getBrainRulesConfig,
    gatherState,
    restoreState,
    setBrainRulesConfig,
    gatherState,
    restoreState,
    getStackRulesConfigs
};

// ==================== MULTIBRAIN SUPPORT ====================

const _brainRulesConfigs = {};

function getBrainRulesConfig() {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    return _brainRulesConfigs[brainName] || { strict: false };
}

function setBrainRulesConfig(config) {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    _brainRulesConfigs[brainName] = config;
    return true;
}

function getStackRulesConfigs() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = { source: 'stack', brains: stack, byBrain: {} };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            results.byBrain[brainName] = getBrainRulesConfig();
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }
    return results;
}

// ==================== HORCRUX GATHER/RESTORE ====================
function gatherState() {
    return { configs: Object.assign({}, _brainRulesConfigs), count: Object.keys(_brainRulesConfigs).length, gatheredAt: Date.now() };
}
function restoreState(data) {
    if (data && data.configs) Object.assign(_brainRulesConfigs, data.configs);
    return { restored: true, configs: Object.keys(_brainRulesConfigs).length };
}
