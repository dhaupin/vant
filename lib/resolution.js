/**
 * Resolution - Thought resolution system
 * Tracks deprecated, resolved, rejected thoughts
 * Per-file and per-entry status
 *
 * Usage:
 *   const resolution = require('./resolution');
 *   resolution.getStatus(entryId);   // Get status
 *   resolution.setStatus(entryId);  // Set resolved/sRejected
 *   resolution.getHistory();         // Get resolution history
 *
 * SECURITY: Only writes to .resolutions directory
 *
 * Related: guides/resolution.md
 */

const fs = require('fs');
const path = require('path');
const vaf = require('./vaf');

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
    if (sandbox && !sandbox.canRead()) {
        throw new Error('Read permission required for resolution operations');
    }
}

function _checkWrite() {
    const sandbox = _getSandbox();
    if (sandbox && !sandbox.canWrite()) {
        throw new Error('Write permission required for resolution operations');
    }
}

// Get project root - resolve from this file's location
const PROJECT_ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'models', 'public');
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
function saveLedger(ledger) {
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
        console.log('Searched with patterns for:', headingPattern, bulletPattern);
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
        throw new Error(`File not found: ${entry.file}`);
    }
    
    const resolution = {
        file: entry.file,
        entry: entry.entry,
        status,
        reason,
        resolved_by: options.resolved_by || process.env.VANT_AGENT_ID || 'unknown',
        branch: options.branch || 'main',
        resolved_at: new Date().toISOString(),
        superseded_by: options.superseded_by || null
    };

    const ledger = getLedger();
    
    // Remove any existing resolution for this entry
    ledger.resolutions = ledger.resolutions.filter(r => 
        !(r.file === entry.file && r.entry === entry.entry)
    );
    
    // Add new resolution
    ledger.resolutions.push(resolution);
    saveLedger(ledger);

    // Update frontmatter in file if exists
    const fileResult = updateEntryFrontmatter(entry.file, entry.entry, resolution);

    return fileResult || resolution;
}

/**
 * Mark an entry as resolved
 */
function resolve(file, entry, reason, options = {}) {
    _checkWrite();
    return addResolution({ file, entry }, STATUS.RESOLVED, reason, options);
}

/**
 * Mark an entry as deprecated
 */
function deprecate(file, entry, reason, options = {}) {
    _checkWrite();
    return addResolution({ file, entry }, STATUS.DEPRECATED, reason, options);
}

/**
 * Mark an entry as rejected
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
    
    saveLedger(ledger);
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
    return !resolution || resolution.status === STATUS.ACTIVE;
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
    logDelta,
    getDeltas,
    getLedger,
    
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
