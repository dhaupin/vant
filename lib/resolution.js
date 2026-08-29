/**
 * Resolution - Thought resolution system (v0.8.6)
 * WITH EVENT EMISSIONS - status changes emit globally
 * Tracks deprecated, resolved, rejected thoughts
 */

// Lazy load pipeline for unified security chain (v0.9.0-axolotl)
let _pipeline = null;
function _getPipeline() {
    if (!_pipeline) {
        try { _pipeline = require('./pipeline'); } catch (e) {}
    }
    return _pipeline;
}

// ==================== v0.9.0-axolotl PIPELINE-BACKED VARIANTS ====================
// Async versions of the public resolution API that route every call through the
// unified security pipeline (sandbox -> vaf -> qos -> escrow). New code should
// prefer these over the sync variants.
async function resolveSecured(file, entry, reason, options = {}) {
    const pipeline = _getPipeline();
    if (!pipeline) return resolve(file, entry, reason, options);
    return pipeline.run(
        { name: 'resolution.resolve', operation: 'write', input: file, file, entry },
        async () => resolve(file, entry, reason, options),
        { mode: pipeline.PRIVATE }
    );
}

async function deprecateSecured(file, entry, reason, options = {}) {
    const pipeline = _getPipeline();
    if (!pipeline) return deprecate(file, entry, reason, options);
    return pipeline.run(
        { name: 'resolution.deprecate', operation: 'write', input: file, file, entry },
        async () => deprecate(file, entry, reason, options),
        { mode: pipeline.PRIVATE }
    );
}

async function rejectSecured(file, entry, reason, options = {}) {
    const pipeline = _getPipeline();
    if (!pipeline) return reject(file, entry, reason, options);
    return pipeline.run(
        { name: 'resolution.reject', operation: 'write', input: file, file, entry },
        async () => reject(file, entry, reason, options),
        { mode: pipeline.PRIVATE }
    );
}

async function listSecured(status, file) {
    const pipeline = _getPipeline();
    if (!pipeline) return list(status, file);
    return pipeline.run(
        { name: 'resolution.list', operation: 'read', input: status || 'resolution:all', status, file },
        async () => list(status, file),
        { mode: pipeline.PUBLIC }
    );
}

async function getSecured(file, entry) {
    const pipeline = _getPipeline();
    if (!pipeline) return get(file, entry);
    return pipeline.run(
        { name: 'resolution.get', operation: 'read', input: file, file, entry },
        async () => get(file, entry),
        { mode: pipeline.PUBLIC }
    );
}

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
                throw new errors.VantError('Read permission required for resolution operations', { code: errors.CODES.CAPABILITY_NOT_ALLOWED });
            }
        } catch (e) {}
        return;
    }
    // If sandbox not available, allow by default
}

function _checkWrite() {
    const sandbox = _getSandbox();
    if (sandbox && sandbox.canWrite) {
        try {
            if (!sandbox.canWrite()) {
                throw new errors.VantError('Write permission required for resolution operations', { code: errors.CODES.CAPABILITY_NOT_ALLOWED });
            }
        } catch (e) {}
        return;
    }
    // If sandbox not available, allow by default
}

// Use brain router for paths
const brain = require('./brain');
const PUBLIC_DIR = brain.getPublicPath();
const RESOLUTIONS_DIR = path.join(PUBLIC_DIR, '.resolutions');
const LEDGER_PATH = path.join(PUBLIC_DIR, '.resolution.json');

// Lazy ensure resolutions dir exists
function _ensureResolutionsDir() {
    _checkWrite();
    if (!fs.existsSync(RESOLUTIONS_DIR)) {
        fs.mkdirSync(RESOLUTIONS_DIR, { recursive: true });
    }
}

// Status constants
const STATUS = {
    ACTIVE: 'active',
    RESOLVED: 'resolved',
    DEPRECATED: 'deprecated',
    REJECTED: 'rejected'
};

/**
 * Get resolution file path for a brain file
 */
function getResolutionPath(filename) {
    const name = path.basename(filename, path.extname(filename));
    return path.join(RESOLUTIONS_DIR, name + '.json');
}

/**
 * Get the ledger of all resolutions
 */
function getLedger() {
    _checkRead();
    if (!fs.existsSync(LEDGER_PATH)) {
        return { resolutions: [], deltas: [] };
    }
    try { return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8')); } catch { return { entries: [] } }
}

/**
 * Save the ledger
 */
function _removed_saveLedger(ledger) {
    _checkWrite();
    fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2));
}

/**
 * Escape regex special chars
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\\\$&');
}

/**
 * Update frontmatter in a brain file
 * Enhanced: handles headings, bullets, and partial matches
 */
function updateEntryFrontmatter(filename, entryKey, resolution) {
    _checkRead();
    // Ensure .md extension
    const baseFilename = filename.endsWith('.md') ? filename : filename + '.md';
    const filepath = path.join(PUBLIC_DIR, baseFilename);


    if (!fs.existsSync(filepath)) return null;

    const content = fs.readFileSync(filepath, 'utf8');
    const lines = content.split('\n');
    
    
    let entryLine = -1;
    let foundType = null;
    
    // Strategy 1: Find exact heading (## Exact Entry)
    const headingPattern = new RegExp('^#{1,6}\s+' + escapeRegex(entryKey), 'i');
    
    // Strategy 2: Find exact bullet (- Exact Entry)
    const bulletPattern = new RegExp('^[-*]\s+' + escapeRegex(entryKey), 'i');
    
    // Strategy 3: Partial match
    const partialPattern = new RegExp('[-*]?\\s.*' + escapeRegex(entryKey), 'i');
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line || !line.trim()) continue;

        // Test heading (includes ##)
        if (headingPattern.test(line)) {
            entryLine = i;
            foundType = 'heading';
            break;
        }
        // Test bullet (includes - or *)
        if (bulletPattern.test(line)) {
            entryLine = i;
            foundType = 'bullet';
            break;
        }
    }
    
    // Partial fallback - try trimmed
    if (entryLine < 0) {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line && partialPattern.test(line)) {
                entryLine = i;
                foundType = 'partial';
                break;
            }
        }
    }
    
    if (entryLine < 0) {
        // audit.info('Searched with patterns for:', headingPattern, bulletPattern);
        return { ...resolution, file_note: 'entry not in file' };
    }
    
    let statusLine = -1;
    for (let i = entryLine + 1; i < Math.min(entryLine + 6, lines.length); i++) {
        if (lines[i].match(/^status:/i) || lines[i].match(/^resolved_/i)) {
            statusLine = i;
            break;
        }
    }
    
    const statusBlock = [
        '',
        'status: ' + resolution.status,
        'resolved_by: ' + resolution.resolved_by,
        'resolved_at: ' + resolution.resolved_at.slice(0, 10),
        'resolved_label: ' + resolution.reason
    ];
    
    if (statusLine > 0) {
        let blockIdx = 0;
        for (let i = statusLine; i < lines.length && blockIdx < statusBlock.length; i++) {
            if (lines[i].startsWith('status') || lines[i].startsWith('resolved_')) {
                lines[i] = statusBlock[blockIdx];
                blockIdx++;
            }
        }
    } else {
        lines.splice(entryLine + 1, 0, statusBlock.join('\n'));
    }

    _checkWrite();
    fs.writeFileSync(filepath, lines.join('\n'));
    return { ...resolution, foundType, foundAt: entryLine };
}

/**
 * Add a resolution to ledger
 */
function addResolution(entry, status, reason, options = {}) {
    _checkWrite();
    // VAF security checks on entry
    vaf.check(entry.file, {type: 'path', name: 'file', maxLength: 200});
    if (entry.entry) {
        vaf.check(entry.entry, {type: 'string', name: 'entry', maxLength: 200});
    }
    if (reason) {
        vaf.check(reason, {type: 'string', name: 'reason', maxLength: 1000});
    }
    
    // Validate file exists before resolving
    const baseFilename = entry.file.endsWith('.md') ? entry.file : entry.file + '.md';
    const filepath = path.join(PUBLIC_DIR, baseFilename);
    
    if (!fs.existsSync(filepath)) {
        throw new errors.VantError('File not found', { code: errors.CODES.FILE_NOT_FOUND });
    }
    
    // Calculate expiresAt from TTL (if provided)
    let expiresAt = null;
    if (options.ttl && options.ttl > 0) {
        expiresAt = new Date(Date.now() + options.ttl).toISOString();
    }
    
    const resolution = {
        file: entry.file,
        entry: entry.entry,
        status,
        reason,
        resolved_by: options.resolved_by || process.env.VANT_AGENT_ID || 'unknown',
        branch: options.branch || 'main',
        resolved_at: new Date().toISOString(),
        superseded_by: options.superseded_by || null,
        expiresAt  // TTL-based expiry (null = never expires)
    };

    const ledger = getLedger();
    
    // Remove any existing resolution for this entry
    ledger.resolutions = ledger.resolutions.filter(r => 
        !(r.file === entry.file && r.entry === entry.entry)
    );
    
    // Add new resolution
    ledger.resolutions.push(resolution);
    
    // Save ledger
    _checkWrite();
    fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2));
    
    // Update frontmatter in file if exists
    const fileResult = updateEntryFrontmatter(entry.file, entry.entry, resolution);
    
    // EVENT: resolution changed (thought status updated)
    _emit('resolution:changed', { 
        file: entry.file,
        status,
        reason: reason?.substring(0, 100),
        timestamp: Date.now() 
    });
    
    return fileResult || resolution;
}

/**
 * Mark an entry as resolved
 * @param {string} file - Brain file
 * @param {string} entry - Entry key
 * @param {string} reason - Resolution reason
 * @param {object} options - Optional: { resolved_by, branch, superseded_by, ttl }
 *                          ttl: milliseconds until expiry (default: no expiry)
 */
function resolve(file, entry, reason, options = {}) {
    _checkWrite();
    return addResolution({ file, entry }, STATUS.RESOLVED, reason, options);
}

/**
 * Mark an entry as deprecated
 * @param {string} file - Brain file
 * @param {string} entry - Entry key
 * @param {string} reason - Deprecation reason
 * @param {object} options - Optional: { resolved_by, branch, superseded_by, ttl }
 */
function deprecate(file, entry, reason, options = {}) {
    _checkWrite();
    return addResolution({ file, entry }, STATUS.DEPRECATED, reason, options);
}

/**
 * Mark an entry as rejected
 * @param {string} file - Brain file
 * @param {string} entry - Entry key
 * @param {string} reason - Rejection reason
 * @param {object} options - Optional: { resolved_by, branch, superseded_by, ttl }
 */
function reject(file, entry, reason, options = {}) {
    _checkWrite();
    return addResolution({ file, entry }, STATUS.REJECTED, reason, options);
}

/**
 * List resolutions by status
 */
function list(status, file) {
    _checkRead();
    const ledger = getLedger();
    let resolutions = ledger.resolutions;
    
    if (status) {
        resolutions = resolutions.filter(r => r.status === status);
    }
    if (file) {
        resolutions = resolutions.filter(r => r.file === file);
    }
    
    return resolutions;
}

/**
 * Get resolution for specific entry
 */
function get(file, entry) {
    _checkRead();
    const ledger = getLedger();
    return ledger.resolutions.find(r => 
        r.file === file && r.entry === entry
    ) || null;
}

/**
 * Log a delta (change) for tracking
 */
function logDelta(file, change, options = {}) {
    const ledger = getLedger();
    
    ledger.deltas = ledger.deltas || [];
    ledger.deltas.push({
        file,
        change,
        changed_by: options.changed_by || process.env.VANT_AGENT_ID || 'unknown',
        branch: options.branch || 'main',
        changed_at: new Date().toISOString(),
        metadata: options.metadata || {}
    });
    
    if (ledger.deltas.length > 100) {
        ledger.deltas = ledger.deltas.slice(-100);
    }
    
    return ledger.deltas[ledger.deltas.length - 1];
}

/**
 * Get deltas for a file
 */
function getDeltas(file, limit) {
    limit = limit || 20;
    const ledger = getLedger();
    const deltas = (ledger.deltas || [])
        .filter(d => d.file === file)
        .slice(-limit);
    return deltas;
}

/**
 * Check if entry is still active
 */
function isActive(file, entry) {
    _checkRead();
    const resolution = get(file, entry);
    
    // Check if resolution is expired
    if (resolution && resolution.expiresAt) {
        if (new Date(resolution.expiresAt) < new Date()) {
            // Expired - treat as if resolution doesn't exist
            return true;
        }
    }
    
    return !resolution || resolution.status === STATUS.ACTIVE;
}

/**
 * Evict all expired resolutions from the ledger
 * Returns count of evicted entries
 */
function evictExpired() {
    _checkRead();
    const ledger = getLedger();
    const now = new Date();
    
    const originalCount = ledger.resolutions.length;
    
    // Filter out expired resolutions
    ledger.resolutions = ledger.resolutions.filter(r => {
        if (r.expiresAt) {
            return new Date(r.expiresAt) > now;
        }
        return true; // Keep resolutions without expiry
    });
    
    const evicted = originalCount - ledger.resolutions.length;
    
    if (evicted > 0) {
        _checkWrite();
        fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2));
        
        // Emit eviction event
        _emit('resolution:evicted', { 
            count: evicted,
            timestamp: Date.now() 
        });
    }
    
    return evicted;
}

/**
 * Resolution Class
 */
class Resolution {
    constructor() {
        this._startTime = Date.now();
    }
    
    getLayerStatus() {
        return {
            name: 'Resolution',
            type: 'storage',
            enabled: true,
            config: {},
            state: { uptime: Date.now() - this._startTime }
        };
    }
    
    isOperationAllowed(operationType, context = {}) {
        return {allowed: true, layer: 'Resolution'};
    }
    
    getStatus() {
        return {enabled: true};
    }
}

const defaultResolution = new Resolution();

// ==================== MULTIBRAIN STACK SUPPORT ====================

/**
 * Get resolution status from all brains in the stack
 * @returns {Object} Combined status
 */
function getStackResolutionStatus() {
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
            const resolutions = list();
            results.byBrain[brainName] = { count: resolutions.length, resolutions };
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }
    
    return results;
}

/**
 * List all resolutions across all brains in the stack
 * @returns {Array} Combined resolutions
 */
function listStackResolutions() {
    const brain = require('./brain');
    const stack = brain.getStack();
    const results = [];
    
    for (const brainName of stack) {
        try {
            brain.pushBrain(brainName);
            const resolutions = list();
            if (Array.isArray(resolutions)) {
                resolutions.forEach(r => results.push({ ...r, brain: brainName }));
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
    // Class
    Resolution,
    create: () => new Resolution(),
    
    // Module functions
    STATUS,
    resolve,
    deprecate,
    reject,
    list,
    get,
    isActive,
    evictExpired,
    logDelta,
    getDeltas,
    getLedger,

    // v0.9.0-axolotl pipeline-backed variants
    resolveSecured,
    deprecateSecured,
    rejectSecured,
    listSecured,
    getSecured,
    
    // Framework hooks
    getLayerStatus() {
        return defaultResolution.getLayerStatus();
    },
    
    isOperationAllowed(operationType, context) {
        return defaultResolution.isOperationAllowed(operationType, context);
    },
    
    getStatus() {
        return defaultResolution.getStatus();
    }
};

// Multibrain Stack
module.exports.getStackResolutionStatus = getStackResolutionStatus;
module.exports.listStackResolutions = listStackResolutions;
