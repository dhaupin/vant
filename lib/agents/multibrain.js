/**
 * Vant Agents — multibrain config plumbing (P3 #32 split)
 *
 * Per-brain agents config + stack traversal. Moved VERBATIM from the
 * agents.js monolith (requires deepened one level).
 */

const _brainAgentsConfigs = {};

function getBrainAgentsConfig() {
    const brain = require('../brain');
    const brainName = brain.getCurrentBrain();
    return _brainAgentsConfigs[brainName] || { maxAgents: 4 };
}

function setBrainAgentsConfig(config) {
    const brain = require('../brain');
    const brainName = brain.getCurrentBrain();
    _brainAgentsConfigs[brainName] = config;
    return true;
}

// ==================== MULTIBRAIN STACK SUPPORT ====================

function getStackAgentsConfigs() {
    const brain = require('../brain');
    const stack = brain.getStack();
    const results = { source: 'stack', brains: stack, byBrain: {} };

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            results.byBrain[brainName] = getBrainAgentsConfig();
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }
    return results;
}

module.exports = {
    getBrainAgentsConfig,
    setBrainAgentsConfig,
    getStackAgentsConfigs
};
