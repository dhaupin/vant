/**
 * Vant Vibe Controls - Dynamic Mood System (v0.8.6)
 *
 * Formalizes how "mood" influences runtime.
 * The agent can programmatically rewrite its own mood.ini.
 *
 * Usage:
 *   const vibe = require('./lib/vibe');
 *   vibe.setMood('Experimental');
 *   vibe.onTaskSuccess();     // Auto-adjust on success
 *   vibe.onTaskError();       // Auto-adjust on error
 *   vibe.getCommitVibe();     // For git commits
 */

// ==================== ERROR HANDLING ====================
const errors = require('./error');

// ==================== AUDIT SYSTEM ====================
const audit = require('./audit');

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

// Lazy-load sandbox
let _sandbox = null;
function _getSandbox() {
    if (!_sandbox) {
        try { _sandbox = require('./sandbox'); } catch (e) {}
    }
    return _sandbox;
}

function _checkRead() {
    const sandbox = _getSandbox();
    // Safe check - use method if available
    if (sandbox && sandbox.canRead) {
        try {
            if (!sandbox.canRead()) {
                throw new errors.VantError('Read permission required', { code: errors.CODES.CAPABILITY_NOT_ALLOWED });
            }
        } catch (e) {}
    }
}

function _checkWrite() {
    const sandbox = _getSandbox();
    // Safe check - use method if available
    if (sandbox && sandbox.canWrite) {
        try {
            if (!sandbox.canWrite()) {
                throw new errors.VantError('Write permission required', { code: errors.CODES.CAPABILITY_NOT_ALLOWED });
            }
        } catch (e) {}
    }
}

const brain = require('./brain');
const MODELS_PATH = brain.getBrainPath();
const VIBE_FILE = path.join(MODELS_PATH, 'mood.ini');

// Vibe states
const VIBES = {
    // Core vibes
    experimental: {
        name: 'Experimental',
        description: 'Trying new things, may take risks',
        riskTolerance: 'high',
        creativity: 'high',
        caution: 'low'
    },
    safety_first: {
        name: 'Safety-First',
        description: 'Conservative, verify before acting',
        riskTolerance: 'low',
        creativity: 'medium',
        caution: 'high'
    },
    focused: {
        name: 'Focused',
        description: 'Deep work, minimal distractions',
        riskTolerance: 'medium',
        creativity: 'medium',
        caution: 'medium'
    },
    learning: {
        name: 'Learning',
        description: 'Exploring, gathering information',
        riskTolerance: 'high',
        creativity: 'high',
        caution: 'low'
    },
    debugging: {
        name: 'Debugging',
        description: 'Fixing issues, methodical approach',
        riskTolerance: 'low',
        creativity: 'low',
        caution: 'high'
    },
    review: {
        name: 'Review',
        description: 'Analyzing, QA, checking work',
        riskTolerance: 'low',
        creativity: 'medium',
        caution: 'high'
    }
};

/**
 * Get current vibe
 * @returns {string} Current vibe name
 */
function getMood() {
    _checkRead();

    if (!fs.existsSync(VIBE_FILE)) {
        return 'experimental'; // Default
    }

    const content = fs.readFileSync(VIBE_FILE, 'utf8');
    const match = content.match(/^mood\s*=\s*(\w+)/m);
    return match ? match[1] : 'experimental';
}

/**
 * Set vibe
 * @param {string} vibeName - Vibe to set
 */
function setMood(vibeName) {
    _checkWrite();

    const vibeKey = vibeName.toLowerCase().replace(/[-_]/g, '_');

    if (!VIBES[vibeKey]) {
        throw new errors.VantError('Unknown vibe', { code: errors.CODES.VAF_INPUT_INVALID });
    }

    const config = VIBES[vibeKey];
    const content = `# Vant Mood Configuration
# Auto-generated - Do not edit manually

mood = ${vibeKey}
name = ${config.name}
description = ${config.description}
risk_tolerance = ${config.riskTolerance}
creativity = ${config.creativity}
caution = ${config.caution}
updated = ${new Date().toISOString()}
`;

    fs.writeFileSync(VIBE_FILE, content);

    // EVENT: mood changed (affects AI behavior)
    _emit('vibe:changed', {
        mood: vibeKey,
        riskTolerance: config.riskTolerance,
        creativity: config.creativity,
        timestamp: Date.now()
    });

    audit.info('[Vibe] Set to: ' + config.name);

    return { mood: vibeKey, ...config };
}

/**
 * Get vibe config
 * @param {string} vibeName - Optional vibe name
 * @returns {object} Vibe config
 */
function getVibeConfig(vibeName) {
    const name = vibeName || getMood();
    return VIBES[name.toLowerCase().replace(/[-_]/g, '_')] || VIBES.experimental;
}

/**
 * On task success - adjust vibe based on outcome
 */
function onTaskSuccess() {
    const current = getMood();

    // If debugging, switch to review after success
    if (current === 'debugging') {
        setMood('review');
        return 'review';
    }

    // If experimental, stay experimental (positive reinforcement)
    if (current === 'experimental') {
        return 'experimental';
    }

    return current;
}

/**
 * On task error - adjust vibe for safety
 * @returns {string} New vibe
 */
function onTaskError() {
    const current = getMood();

    // Always go to safety-first on error
    if (current !== 'safety_first') {
        setMood('safety_first');
        return 'safety_first';
    }

    return 'safety_first';
}

/**
 * Get commit vibe string (for git commits)
 * @returns {string} Vibe metadata
 */
function getCommitVibe() {
    const mood = getMood();
    const config = getVibeConfig(mood);

    return '[vibe:' + mood + ' risk=' + config.riskTolerance + ']';
}

/**
 * Get all available vibes
 * @returns {string[]} Available vibe names
 */
function getAvailableVibes() {
    _checkRead();

    return Object.keys(VIBES);
}

/**
 * Check if in high caution mode
 * @returns {boolean}
 */
function isCautious() {
    const config = getVibeConfig();
    return config.caution === 'high';
}

/**
 * Check if creative mode
 * @returns {boolean}
 */
function isCreative() {
    const config = getVibeConfig();
    return config.creativity === 'high';
}

// ==================== MULTIBRAIN STACK SUPPORT ====================

/**
 * Get vibe status from all brains in the stack
 * @returns {Object} Combined vibes
 */
function getStackVibes() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = {
        source: 'stack',
        brains: stack,
        byBrain: {}
    };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const mood = getMood();
            const config = getVibeConfig();
            results.byBrain[brainName] = { mood, config };
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }

    return results;
}

module.exports = {
    getMood,
    setMood,
    getVibeConfig,
    onTaskSuccess,
    onTaskError,
    getCommitVibe,
    getAvailableVibes,
    isCautious,
    isCreative,
    VIBES,

    // Multibrain Stack
    getStackVibes
};
