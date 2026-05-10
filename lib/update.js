/**
 * Vant Update System
 * Unified module for:
 * - Context auto-update (when tokens exceeded)
 * - Version check (GitHub releases)
 *
 * Consolidated from: lib/auto-update.js, lib/update-check.js
 */

const fs = require('fs');
const path = require('path');
const vaf = require("./vaf");
const network = require("./network");
const logger = require("./audit");

// ==================== CONFIG ====================
const DEFAULT_THRESHOLD = 8000;
const DEFAULT_INTERVAL = 60;
const MAX_MESSAGES_TO_SUMMARIZE = 50;
const REPO_OWNER = 'dhaupin';
const REPO_NAME = 'vant';
const CURRENT_VERSION = require('../package.json').version;

// ==================== STATE ====================
let messageHistory = [];
let lastSummaryLength = 0;

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

// ==================== CONTEXT AUTO-UPDATE ====================
function addMessage(message) {
    messageHistory.push(message);
}

function getContextTokens() {
    // Rough estimation: 1 token ≈ 4 chars
    const total = messageHistory.reduce((sum, m) => sum + (m.content || '').length, 0);
    return Math.ceil(total / 4);
}

function shouldUpdate(threshold = DEFAULT_THRESHOLD) {
    return getContextTokens() > threshold;
}

function stats() {
    return {
        messages: messageHistory.length,
        tokens: getContextTokens(),
        threshold: DEFAULT_THRESHOLD,
        needsUpdate: shouldUpdate()
    };
}

function reset() {
    messageHistory = [];
    lastSummaryLength = 0;
}

/**
 * Generate summary of conversation context
 */
function generateSummary() {
    const recent = messageHistory.slice(-MAX_MESSAGES_TO_SUMMARIZE);
    const lines = [];
    
    for (const msg of recent) {
        const role = msg.role || 'user';
        const content = msg.content || '';
        if (content.length > 200) {
            lines.push(`**${role}**: ${content.slice(0, 200)}...`);
        } else if (content) {
            lines.push(`**${role}**: ${content}`);
        }
    }
    
    const summary = lines.join('\n\n');
    lastSummaryLength = summary.length;
    return summary;
}

async function writeToBrain(keyInfo = {}) {
    const summary = generateSummary();
    const storage = require('./storage');
    const brain = storage.get('brain');
    
    try {
        await brain.write('context', 'summary.md', summary);
        logger.info('Context summary written to brain');
    } catch (e) {
        logger.error('Failed to write context', { error: e.message });
    }
    
    return summary;
}

async function pushToGitHub(branch = 'main') {
    const repos = require('./repos');
    const sync = require('./sync');
    
    try {
        await repos.checkout(branch);
        await sync.sync({ direction: 'push', branch });
        logger.info('Context pushed to GitHub');
        return true;
    } catch (e) {
        logger.error('Failed to push context', { error: e.message });
        return false;
    }
}

function getSessionSummary() {
    return {
        messages: messageHistory.length,
        tokens: getContextTokens(),
        summaryLength: lastSummaryLength,
        version: CURRENT_VERSION
    };
}

async function saveOnExit() {
    await writeToBrain();
    await pushToGitHub();
}

// ==================== FRAMEWORK ====================
function getLayerStatus() {
    return {
        name: 'Update',
        type: 'update',
        version: CURRENT_VERSION,
        enabled: true,
        state: stats()
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
        messages: messageHistory.length,
        tokens: getContextTokens(),
        needsUpdate: shouldUpdate()
    };
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
    
    // Context auto-update
    addMessage,
    getContextTokens,
    shouldUpdate,
    generateSummary,
    writeToBrain,
    pushToGitHub,
    stats,
    reset,
    saveOnExit,
    getSessionSummary,
    DEFAULT_THRESHOLD,
    
    // Framework
    getLayerStatus,
    isOperationAllowed,
    getStatus
};