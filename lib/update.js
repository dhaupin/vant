/**
 * Vant Update System (v0.8.6)
 * WITH EVENT EMISSIONS - update operations emit globally
 *
 * Purpose: Check for updates, alert users, manage installation updates
 *
 * NOT: Message tracking (that's msg.js and conversation systems)
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
const vaf = require("./vaf");
const network = require("./network");
const logger = require("./audit");

// ==================== CONFIG ====================
const REPO_OWNER = 'dhaupin';
const REPO_NAME = 'vant';
const CURRENT_VERSION = require('../package.json').version;

// ==================== EXPORT CHECK ====================
function getVersion() {
    return CURRENT_VERSION;
}

function compareVersions(v1, v2) {
    const a = v1.replace(/^v/, '').split('.').map(Number);
    const b = v2.replace(/^v/, '').split('.');
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const A = a[i] || 0;
        const B = Number(b[i]) || 0;
        if (A > B) return 1;
        if (A < B) return -1;
    }
    return 0;
}

/**
 * Check current version against latest release
 */
async function checkForUpdate() {
    const release = await getLatestRelease();
    if (!release) return { current: CURRENT_VERSION, latest: CURRENT_VERSION, update: false };

    const update = compareVersions(CURRENT_VERSION, release.tag_name) < 0;

    // EVENT: update check
    _emit('update:check', { current: CURRENT_VERSION, latest: release.tag_name, update: !!update, timestamp: Date.now() });

    return { current: CURRENT_VERSION, latest: release.tag_name, update };
}

/**
 * Get latest release from GitHub
 */
async function getLatestRelease() {
    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
    const headers = { 'User-Agent': 'Vant-Updater', 'Accept': 'application/vnd.github.v3+json' };

    try {
        const data = await network.fetchJson(url, { headers });
        return data;
    } catch (e) {
        logger.warn('Update check failed', { error: e.message });
        return null;
    }
}


// ==================== FRAMEWORK ====================
function getLayerStatus() {
    return {
        name: 'Update',
        type: 'update',
        version: CURRENT_VERSION,
        enabled: true,
        state: { online: network.isOnline() }
    };
}

function isOperationAllowed(op) {
    if (op === 'checkForUpdate' && !network.isOnline()) {
        return { allowed: false, reason: 'offline' };
    }
    return { allowed: true };
}

function getStatus() {
    return {
        currentVersion: CURRENT_VERSION,
        online: network.isOnline(),
        lastCheck: null  // Could track last check time
    };
}

// ==================== MULTIBRAIN STACK SUPPORT ====================

/**
 * Check for updates across all brains in the stack
 * @returns {Object} Combined update status
 */
function getStackUpdateStatus() {
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
            const status = checkForUpdate();
            results.byBrain[brainName] = status;
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }

    return results;
}

/**
 * Get version info from all brains in the stack
 * @returns {Object} Combined versions
 */
function getStackVersions() {
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
            const version = getVersion();
            results.byBrain[brainName] = version;
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }

    return results;
}

// ==================== EXPORTS ====================
module.exports = {
    // Version
    getVersion,
    compareVersions,
    CURRENT_VERSION,

    // Update checking
    checkForUpdate,
    getLatestRelease,
    getStackUpdateStatus,
    getStackVersions,

    // Framework
    getLayerStatus,
    isOperationAllowed,
    getStatus
};
