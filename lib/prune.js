/**
 * Vant Prune Module (v0.8.6)
 * WITH EVENT EMISSIONS - brain cleanup emits globally
 *
 * Automated brain cleanup and Long Term Core (LTC) generation
 * - Removes stale entries (> 90 days)
 * - Removes fluff (repetitive/tangential content)
 * - Creates condensed LTC format
 *
 * Usage:
 *   const prune = require('./prune');
 *   const stats = await prune.prune({ dryRun: true });
 *   const ltc = prune.getCore();
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
const vaf = require('./vaf');
const errors = require('./error');
const audit = require('./audit');
const gate = require('./gate');

// Check capability before operations (shared gate, lib/gate.js)
function _checkWrite(...args) {
    gate.requireCapability('canWrite', { scope: 'prune', operation: 'write' });
}

function _checkRead(...args) {
    gate.requireCapability('canRead', { scope: 'prune', operation: 'read' });
}

const brain = require('./brain');
const config = require('./config');
const Storage = require('./storage');
const MODELS_PATH = brain.getBrainPath();
// v0.9.0 fs->storage migration: ledger + LTC go through FileStorage
// (containment/symlink/VAF/atomic-write). Directory listings and stat-based
// age scans remain on fs (storage.list is pattern-glob only; mtime metadata
// is scan-specific) - but path anchoring for those reads/writes is explicit.
const fileStore = new Storage.FileStorage({ basePath: MODELS_PATH });
const DEFAULT_STALE_DAYS = config.get('prune.staleDays', 90);
const DEFAULT_MIN_LENGTH = 50; // Min content length to not be fluff
const LEDGER_FILE = '.prune_ledger.json';

/**
 * LTC Schema - Long Term Core format
 * {
 *   "version": "1.0",
 *   "updated": "ISO timestamp",
 *   "core": {
 *     "identity": { "key facts": [] },
 *     "learnings": [ { "topic": "...", "summary": "...", "date": "..." } ],
 *     "decisions": [ { "summary": "...", "outcome": "...", "date": "..." } ],
 *     "preferences": { ... }
 *   },
 *   "stats": { "pruned": 0, "kept": 0, "ltc_size": 0 }
 * }
 */

/**
 * Get entry age in days
 * @param {string} filePath - File to check
 * @returns {number} Age in days
 */
function getAgeDays(filePath) {
    try {
        const stats = fs.statSync(filePath);
        const age = Date.now() - stats.mtimeMs;
        return Math.floor(age / (1000 * 60 * 60 * 24));
    } catch (e) {
        return 0;
    }
}

/**
 * Check if content is "fluff"
 * @param {string} content - Content to check
 * @returns {boolean}
 */
function isFluff(content) {
    if (!content || content.length < DEFAULT_MIN_LENGTH) {
        return true;
    }

    const words = content.split(/\s+/);
    if (words.length < 10) {
        return true;
    }

    // Check for repetition (same word > 30% = repetitive)
    const wordCounts = {};
    words.forEach(w => {
        const cleaned = w.toLowerCase().replace(/[^a-z]/g, '');
        if (cleaned.length > 3) {
            wordCounts[cleaned] = (wordCounts[cleaned] || 0) + 1;
        }
    });

    const total = words.length;
    const repetitive = Object.values(wordCounts).some(count => count / total > 0.3);
    if (repetitive) {
        return true;
    }

    // Check for test/test patterns (AI fluff)
    if (content.includes('test') && content.includes('test')) {
        return true;
    }

    return false;
}

/**
 * Check if content has actionable decisions
 * @param {string} content - Content to check
 * @returns {boolean}
 */
function hasDecisions(content) {
    const indicators = [
        'decided to',
        'will do',
        'action:',
        'todo:',
        'task:',
        'implement',
        'fix:',
        'change:'
    ];

    const lower = content.toLowerCase();
    return indicators.some(ind => lower.includes(ind));
}

/**
 * Extract key facts from content
 * @param {string} content - Content to analyze
 * @param {string} category - Category name
 * @returns {object} Extracted facts
 */
function extractFacts(content, category) {
    if (!content) return null;

    const facts = {
        category,
        summary: content.slice(0, 200), // First 200 chars as summary
        length: content.length,
        date: new Date().toISOString()
    };

    // Try to extract key points
    if (content.includes('===')) {
        const sections = content.split('===');
        facts.sections = sections.length - 1;
    }

    // Extract bullet points
    const bullets = content.match(/^[-*]\s+.+$/gm);
    if (bullets) {
        facts.bullets = bullets.length;
    }

    return facts;
}

/**
 * Prune brain files
 * @param {object} options - { dryRun, staleDays, removeFluff }
 * @returns {object} Prune statistics
 */
async function prune(options = {}) {
    // Auto-chain through sandbox (capability + RLS)
    if (!options.userCtx) {
        throw new errors.VantError('EINVAL: userCtx required for prune', { code: errors.CODES.VAF_REQUIRED_FIELD });
    }
    _checkWrite(options.userCtx, '_prune:run');
    _checkRead();
    const dryRun = options.dryRun !== false;
    const staleDays = options.staleDays || DEFAULT_STALE_DAYS;
    const removeFluff = options.removeFluff !== false;

    // Find version folder
    const versions = fs.readdirSync(MODELS_PATH).filter(d =>
        fs.statSync(path.join(MODELS_PATH, d)).isDirectory() && d.startsWith('v')
    );
    const version = versions.sort().pop() || 'v0.5.0';
    const versionPath = path.join(MODELS_PATH, version);

    audit.info(`[Prune] Version: ${version}`);
    audit.info(`[Prune] Dry run: ${dryRun}`);
    audit.info(`[Prune] Stale days: ${staleDays}`);
    audit.info(`[Prune] Remove fluff: ${removeFluff}`);

    const stats = {
        filesScanned: 0,
        staleRemoved: 0,
        fluffRemoved: 0,
        kept: 0,
        ltcEntries: 0,
        errors: []
    };

    const categories = ['learnings', 'memories', 'decisions', 'todos'];

    const ltcEntries = {
        identity: [],
        learnings: [],
        decisions: [],
        preferences: []
    };

    for (const cat of categories) {
        const catPath = path.join(versionPath, cat);
        if (!fs.existsSync(catPath)) continue;

        const files = fs.readdirSync(catPath);

        for (const file of files) {
            const filePath = path.join(catPath, file);
            if (!fs.statSync(filePath).isFile()) continue;

            stats.filesScanned++;
            const content = fileStore.read(path.join(version, cat, file));
            const age = getAgeDays(filePath);

            // Check staleness
            if (age > staleDays) {
                if (dryRun) {
                    audit.info(`[Prune] Would remove stale: ${cat}/${file} (${age} days)`);
                } else {
                    fileStore.delete(path.join(version, cat, file));
                    audit.info(`[Prune] Removed stale: ${cat}/${file}`);
                }
                stats.staleRemoved++;
                continue;
            }

            // Check fluff
            if (removeFluff && isFluff(content)) {
                if (dryRun) {
                    audit.info(`[Prune] Would remove fluff: ${cat}/${file}`);
                } else {
                    fileStore.delete(path.join(version, cat, file));
                    audit.info(`[Prune] Removed fluff: ${cat}/${file}`);
                }
                stats.fluffRemoved++;
                continue;
            }

            // Keep - extract facts for LTC
            const facts = extractFacts(content, cat);
            if (facts) {
                if (cat === 'learnings') {
                    ltcEntries.learnings.push(facts);
                } else if (cat === 'decisions') {
                    ltcEntries.decisions.push(facts);
                }
                stats.kept++;
            }
        }
    }

    stats.ltcEntries = ltcEntries.learnings.length + ltcEntries.decisions.length;

    // Save LTC
    if (!dryRun) {
        const ltc = {
            version: '1.0',
            updated: new Date().toISOString(),
            core: ltcEntries,
            stats: stats
        };

        const ltcPath = path.join(version, '_core.json');
        fileStore.write(ltcPath, JSON.stringify(ltc, null, 2));
        audit.info(`[Prune] Saved LTC to: ${path.join(MODELS_PATH, ltcPath)}`);
    }

    // Record in ledger
    recordPrune(stats, dryRun);

    // EVENT: brain pruned (critical cleanup audit)
    _emit('prune:completed', {
        removed: stats.removed,
        retained: stats.retained,
        ltcGenerated: !dryRun,
        timestamp: Date.now()
    });

    return stats;
}

/**
 * Record prune operation in ledger
 */
function recordPrune(stats, dryRun) {
    let ledger = { operations: [] };

    const existing = fileStore.read(LEDGER_FILE);
    if (existing !== null) {
        try {
            ledger = JSON.parse(existing);
        } catch (e) {
            // ignore
        }
    }

    ledger.operations.push({
        date: new Date().toISOString(),
        dryRun,
        stats
    });

    // Keep last 100 operations
    if (ledger.operations.length > 100) {
        ledger.operations = ledger.operations.slice(-100);
    }

    fileStore.write(LEDGER_FILE, JSON.stringify(ledger, null, 2));
}

/**
 * Get Long Term Core
 * @returns {object} LTC data
 */
function getCore(version = 'latest') {
    _checkRead();
    // storage.read blocks traversal, so an unvalidated `version` can no longer
    // escape MODELS_PATH via this entry point.
    const raw = fileStore.read(path.join(version, '_core.json'));
    return raw === null ? null : JSON.parse(raw);
}

/**
 * Get prune statistics
 * @returns {object}
 */
function getStats() {
    _checkRead();
    const raw = fileStore.read(LEDGER_FILE);
    if (raw === null) {
        return { operations: [] };
    }

    return JSON.parse(raw);
}

/**
 * List files that would be pruned
 * @param {object} options
 * @returns {string[]} Files that would be removed
 */
function listPrunable(options = {}) {
    _checkRead();
    const staleDays = options.staleDays || DEFAULT_STALE_DAYS;
    const removeFluff = options.removeFluff !== false;

    const versionDir = fs.readdirSync(MODELS_PATH)
        .filter(d => d.startsWith('v') && fs.statSync(path.join(MODELS_PATH, d)).isDirectory())
        .sort().pop() || 'v0.5.0';
    const versionPath = path.join(MODELS_PATH, versionDir);

    const prunable = [];
    const categories = ['learnings', 'memories', 'decisions', 'todos'];

    for (const cat of categories) {
        const catPath = path.join(versionPath, cat);
        if (!fs.existsSync(catPath)) continue;

        const files = fs.readdirSync(catPath);

        for (const file of files) {
            const filePath = path.join(catPath, file);
            if (!fs.statSync(filePath).isFile()) continue;

            const content = fileStore.read(path.join(versionDir, cat, file));
            const age = getAgeDays(filePath);

            if (age > staleDays || (removeFluff && isFluff(content))) {
                prunable.push(`${cat}/${file} (age: ${age} days)`);
            }
        }
    }

    return prunable;
}

// ==================== AGENT PRUNING ====================

/**
 * Prune stale agents
 * @param {object} options - { dryRun, maxAge }
 * @returns {object} Prune statistics
 */
async function pruneAgents(options = {}) {
    // Get config for max age
    const cfg = require('./config');
    const maxAge = options.maxAge || cfg.get('agents.maxAge', 24 * 60 * 60 * 1000);

    // Lazy-load agents
    let agents = null;
    try {
        agents = require('./agents');
    } catch (e) {
        return { error: 'Agents module not available', agentsPruned: 0 };
    }

    // Use the agents.prune function
    try {
        const result = await agents.prune({ maxAge, dryRun: options.dryRun });
        _emit('prune:agents', { pruned: result.pruned, timestamp: Date.now() });
        return { agentsPruned: result.pruned };
    } catch (e) {
        return { error: e.message, agentsPruned: 0 };
    }
}

// ==================== MULTIBRAIN STACK SUPPORT ====================

/**
 * Get prune stats from all brains in the stack
 * @returns {Object} Combined stats
 */
function getStackPruneStats() {
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
            const stats = getStats();
            results.byBrain[brainName] = stats;
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }

    return results;
}

/**
 * List prunable files across all brains in the stack
 * @returns {Array} Combined prunable files
 */
function listStackPrunable() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = [];

    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const files = listPrunable();
            if (Array.isArray(files)) {
                files.forEach(f => results.push({ ...f, brain: brainName }));
            }
        } catch (e) {
            // Skip brains that fail
        } finally {
            brain.removeBrain();
        }
    }

    return results;
}

module.exports = {
    prune,
    pruneAgents,
    getCore,
    getStats,
    listPrunable,
    isFluff,
    hasDecisions,
    extractFacts,
    getAgeDays,
    DEFAULT_STALE_DAYS,

    // Multibrain Stack
    getStackPruneStats,
    listStackPrunable
};
