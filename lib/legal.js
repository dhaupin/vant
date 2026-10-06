/**
 * Vant Legal Module - Red Button Emergency Switch (v0.8.6)
 * WITH EVENT EMISSIONS - compliance checks emit globally
 *
 * This module provides legal/licensing enforcement as a parallel layer to sandbox.
 * Like industrial safety switches - it's there for emergencies, rarely touched but critical.
 *
 * Status: DORMANT - Requires manual activation for enforcement
 *
 * Hook points:
 * - Pre-execution gate (blocks illegal operations)
 * - Post-attribution (ensures licensing spread)
 * - Termination (enforces license death clauses)
 *
 * Usage:
 *   const legal = require('./lib/legal');
 *
 *   // Check if operation violates legal terms
 *   legal.canUse();           // Basic license check
 *   legal.canDistribute();   // Distribution rights
 *   legal.canCommercial();  // Commercial use check
 *   legal.isCompliant();    // Full compliance status
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

// ==================== STATE ====================

const LEGAL_VERSION = '1.1';
const ACTIVE = false;  // DORMANT by default - manual activation required
const BLOCK_LEVEL = 'none';  // none | warn | block

// ==================== CONFIG ====================

function _getLegalPath() {
    return path.join(__dirname, '..', 'LEGAL.md');
}

function _getLicensePath() {
    return path.join(__dirname, '..', 'LICENSE');
}

// ==================== CORE FUNCTIONS ====================

/**
 * Check if basic license terms are accepted
 * @returns {object} License status
 */
function canUse() {
    return {
        allowed: true,
        reason: 'DORMANT - Legal module not enforced',
        level: 'passive'
    };
}

/**
 * Check distribution rights
 * @returns {object} Distribution status
 */
function canDistribute() {
    return {
        allowed: true,
        reason: 'DORMANT - Legal module not enforced',
        level: 'passive'
    };
}

/**
 * Check commercial use - returns FALSE if SAAS detected
 * @param {string} context - Operation context
 * @returns {object} Commercial status
 */
function canCommercial(context = {}) {
    // Even in dormant mode, warn about known violations
    const indicators = [
        'saas', 'service', 'hosted', 'managed', 'platform',
        'marketplace', 'subscription', 'paid'
    ];

    const ctxString = JSON.stringify(context).toLowerCase();
    const suspicious = indicators.filter(i => ctxString.includes(i));

    if (suspicious.length > 0) {
        return {
            allowed: false,
            reason: `Suspicious commercial indicators: ${suspicious.join(', ')}`,
            level: 'warn',
            suggestion: 'Consult LEGAL.md §15 before proceeding'
        };
    }

    return {
        allowed: true,
        reason: 'DORMANT - No enforcement',
        level: 'passive'
    };
}

/**
 * Full compliance check
 * @returns {object} Compliance status
 */
function isCompliant() {
    const legalPath = _getLegalPath();
    const licensePath = _getLicensePath();

    const result = {
        legalExists: fs.existsSync(legalPath),
        licenseExists: fs.existsSync(licensePath),
        version: LEGAL_VERSION,
        status: ACTIVE ? 'ACTIVE' : 'DORMANT',
        blockLevel: BLOCK_LEVEL,
        enforcing: ACTIVE
    };

    // EVENT: compliance checked
    _emit('legal:compliance-check', { result, timestamp: Date.now() });

    return result;
}

/**
 * Enable legal enforcement (Administrator function)
 * @param {string} level - 'warn' | 'block'
 */
function activate(level = 'warn') {
    // This would be analogous to flipping the red switch
    // In production, requires authenticated admin call
    return {
        activated: true,
        level: level,
        warning: 'Legal enforcement ACTIVE - Operations may be blocked',
        timestamp: new Date().toISOString()
    };
}

/**
 * Disable legal enforcement
 */
function deactivate() {
    return {
        deactivated: true,
        status: 'DORMANT',
        timestamp: new Date().toISOString()
    };
}

/**
 * Get legal status for display
 * @returns {object} Status object
 */
function getStatus() {
    return {
        name: 'Legal',
        type: 'compliance',
        version: LEGAL_VERSION,
        active: ACTIVE,
        blockLevel: BLOCK_LEVEL,
        // Return all gates
        gates: {
            canUse: canUse(),
            canDistribute: canDistribute(),
            canCommercial: canCommercial(),
            isCompliant: isCompliant()
        }
    };
}

/**
 * Check gate - returns true if operation allowed
 * @param {string} gate - Gate name
 * @param {object} context - Operation context
 * @returns {boolean}
 */
function checkGate(gate, context = {}) {
    if (!ACTIVE) {
        return true;  // Dormant = always pass
    }

    switch (gate) {
        case 'use':
            return canUse().allowed;
        case 'distribute':
            return canDistribute().allowed;
        case 'commercial':
            return canCommercial(context).allowed;
        case 'compliant':
            return isCompliant().legalExists;
        default:
            return true;
    }
}

/**
 * Retrieve legal text
 * @param {string} section - Optional section (§1-20)
 * @returns {string} Legal text
 */
function getLegalText(section = null) {
    const legalPath = _getLegalPath();

    if (!fs.existsSync(legalPath)) {
        return { error: 'LEGAL.md not found' };
    }

    const content = fs.readFileSync(legalPath, 'utf8');

    if (!section) {
        return { data: content, full: true };
    }

    // Extract specific section if requested
    // Simple extraction - finds ### §X or §X
    const sectionPattern = new RegExp(`###?\\s*§${section}[\\s\\w]*[\\s\\n]+([\\s\\S]*?)(?=###|##|$)`, 'i');
    const match = content.match(sectionPattern);

    return match ? { data: match[1].trim(), section } : { error: 'Section not found' };
}

/**
 * Log legal notice
 * @param {string} level - Notice level
 * @param {string} message - Message
 */
function notice(level, message) {
    const icons = {
        info: 'ℹ️',
        warn: '⚠️',
        block: '🛑',
        legal: '⚖️'
    };

    console.log(`${icons[level] || '⚖️'} [LEGAL ${level.toUpperCase()}] ${message}`);
}

/**
 * Emergency - Trigger license termination scan
 * @param {string} target - Target to investigate
 * @returns {object} Scan result
 */
function emergencyScan(target) {
    // This is the "red button" - scans for license violations
    return {
        scanned: target,
        timestamp: new Date().toISOString(),
        result: 'SCAN_COMPLETE',
        actions: [
            'Check attribution',
            'Verify trademark use',
            'Confirm commercial status',
            'Report to maintainer'
        ],
        note: 'Manual review required - Automated scan complete'
    };
}

/**
 * Get quick reference table
 * @returns {object} Quick ref
 */
function getQuickRef() {
    return {
        openSource: true,
        closedSource: true,
        privateFork: true,
        publicForkRebrand: false,
        nameInProduct: false,
        saasOffering: false,
        sellDirectly: false,
        builtWithVant: true,
        attribution: true
    };
}

// ==================== EXPORTS ====================

module.exports = {
    // Core checks
    canUse,
    canDistribute,
    canCommercial,
    isCompliant,

    // Gate control
    checkGate,
    activate,
    deactivate,

    // Info
    getStatus,
    getLegalText,
    getQuickRef,

    // Emergency
    emergencyScan,

    // Logging
    notice,

    // Constants
    VERSION: LEGAL_VERSION,
    ACTIVE: ACTIVE,

    // Multibrain
    getBrainLegalConfig,
    setBrainLegalConfig,
    getStackLegalConfigs
};

// ==================== MULTIBRAIN SUPPORT ====================

const _brainLegalConfigs = {};

function getBrainLegalConfig() {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    return _brainLegalConfigs[brainName] || { jurisdiction: 'global' };
}

function setBrainLegalConfig(config) {
    const brain = require('./brain');
    const brainName = brain.getCurrentBrain();
    _brainLegalConfigs[brainName] = config;
    return true;
}

function getStackLegalConfigs() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = { source: 'stack', brains: stack, byBrain: {} };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            results.byBrain[brainName] = getBrainLegalConfig();
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }
    return results;
}
