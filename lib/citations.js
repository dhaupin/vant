/**
 * Vant Citations - Git-Backed Grounding (v0.8.6)
 *
 * Force agent to cite sources.
 * Append [Source: commit_hash] to answers.
 *
 * Usage:
 *   const citations = require('./lib/citations');
 *   citations.addSource(commitHash, context);
 *   const receipt = citations.formatCitation(source);
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

const path = require('path');
const fs = require('fs');
const errors = require('./error');

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
    if (sandbox && sandbox.canRead) {
        try {
            if (!sandbox.canRead()) {
                throw new errors.Error('Read permission required', { code: errors.CODES.STORAGE_READ_DENIED, retryable: false });
            }
        } catch (e) {}
    }
}

function _checkWrite() {
    const sandbox = _getSandbox();
    if (sandbox && sandbox.canWrite) {
        try {
            if (!sandbox.canWrite()) {
                throw new errors.Error('Write permission required', { code: errors.CODES.STORAGE_WRITE_DENIED, retryable: false });
            }
        } catch (e) {}
    }
}

const brain = require('./brain');
const MODELS_PATH = brain.getBrainPath();
const CITATIONS_FILE = path.join(MODELS_PATH, '.citations.json');

/**
 * Load citations
 */
function getCitations() {
    _checkRead();

    if (fs.existsSync(CITATIONS_FILE)) {
        return JSON.parse(fs.readFileSync(CITATIONS_FILE, 'utf8'));
    }
    return { version: '1.0', sources: [] };
}

/**
 * Save citations
 */
function saveCitations(data) {
    _checkWrite();

    fs.writeFileSync(CITATIONS_FILE, JSON.stringify(data, null, 2));
}

/**
 * Add a source
 * @param {string} commit - Git commit hash
 * @param {string} context - Context/note
 * @returns {object} Source
 */
function addSource(commit, context = '') {
    const data = getCitations();
    
    const source = {
        id: data.sources.length + 1,
        commit,
        context,
        timestamp: new Date().toISOString()
    };
    
    data.sources.push(source);
    saveCitations(data);
    
    // EVENT: source cited (traceability for AI responses)
    _emit('citations:added', { 
        commit: commit.substring(0, 7), 
        context: context.substring(0, 100),
        sourceCount: data.sources.length,
        timestamp: Date.now() 
    });
    
    audit.info('[Citations] Added: ' + commit.substring(0, 7));
    return source;
}

/**
 * Format citation for output
 * @param {object} source - Source object
 * @returns {string} Formatted
 */
function formatCitation(source) {
    return `[Source: ${source.commit.substring(0, 7)}]` + 
        (source.context ? ` (${source.context})` : '');
}

/**
 * Format multiple sources
 * @param {object[]} sources
 * @returns {string}
 */
function formatCitations(sources) {
    return sources.map(s => formatCitation(s)).join(' ');
}

/**
 * Get all citations
 * @returns {object[]}
 */
function getAll() {
    return getCitations().sources;
}

/**
 * Format for commit message
 * @returns {string}
 */
function getCommitFooter() {
    const sources = getAll().slice(-3); // Last 3
    if (sources.length === 0) return '';
    
    const lines = ['\n\nSources:'];
    for (const s of sources) {
        lines.push(formatCitation(s));
    }
    return lines.join('\n');
}

/**
 * Clear citations
 */
function clear() {
    saveCitations({ version: '1.0', sources: [] });
}

/**
 * Generate receipts for an answer
 * @param {object[]} results - Search results
 * @returns {string} Receipt text
 */
function generateReceipts(results) {
    if (!results || results.length === 0) {
        return '\n\n_No sources_';
    }
    
    const lines = ['\n\n📋 Citations:'];
    for (const r of results) {
        const commit = r.commit || 'unknown';
        const path = r.path || '';
        lines.push(`- ${commit.substring(0, 7)}: ${path}`);
    }
    
    return lines.join('\n');
}

/**
 * Verify citation exists
 * @param {string} commit - Commit hash
 * @returns {boolean}
 */
function verify(commit) {
    const sources = getAll();
    return sources.some(s => s.commit.startsWith(commit.substring(0, 7)));
}

// ==================== MULTIBRAIN STACK SUPPORT ====================

/**
 * Get citations from all brains in the stack
 * @returns {Object} Combined citations
 */
function getStackCitations() {
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
            const citations = getAll();
            results.byBrain[brainName] = citations;
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }
    
    return results;
}

module.exports = {
    addSource,
    formatCitation,
    formatCitations,
    getAll,
    getCommitFooter,
    clear,
    generateReceipts,
    verify,
    
    // Multibrain Stack
    getStackCitations
};