/**
 * Rules (v0.8.x)
 * Global rules engine for Vant operations
 * 
 * Defines and enforces operation rules across agent/skill/brain layers.
 */

const RULES_VERSION = '0.8.x';

// Default rule set
const DEFAULT_RULES = {
    version: RULES_VERSION,
    rules: {},
    meta: {
        created: Date.now(),
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
    const dangerous = ['shell', 'exec', 'cmd', 'system', 'spawn', 'fork', 'eval', 'run'];
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
    return { allowed: true };
}

/**
 * Module exports
 */
module.exports = {
    RULES_VERSION,
    getRules,
    getRule,
    setRule,
    deleteRule,
    listRules,
    check
};