// resolution.js - Thought resolution system
// Handles deprecated, resolved, rejected thoughts
// Per-file and per-entry status tracking

const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'models', 'public');
const RESOLUTIONS_DIR = path.join(PUBLIC_DIR, '.resolutions');
const LEDGER_PATH = path.join(PUBLIC_DIR, '.resolution.json');

// Ensure resolutions dir exists
if (!fs.existsSync(RESOLUTIONS_DIR)) {
    fs.mkdirSync(RESOLUTIONS_DIR, { recursive: true });
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
    if (!fs.existsSync(LEDGER_PATH)) {
        return { resolutions: [], deltas: [] };
    }
    return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
}

/**
 * Save the ledger
 */
function saveLedger(ledger) {
    fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2));
}

/**
 * Add a resolution to ledger
 */
function addResolution(entry, status, reason, options = {}) {
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
    updateEntryFrontmatter(entry.file, entry.entry, resolution);

    return resolution;
}

/**
 * Update frontmatter in a brain file
 */
function updateEntryFrontmatter(filename, entryKey, resolution) {
    const filepath = path.join(PUBLIC_DIR, filename);
    
    if (!fs.existsSync(filepath)) return null;

    const content = fs.readFileSync(filepath, 'utf8');
    const lines = content.split('\n');
    
    // Look for entry heading
    const entryPattern = new RegExp('^#{1,6}\\s+.*' + entryKey, 'i');
    let entryLine = -1;
    let statusLine = -1;
    
    for (let i = 0; i < lines.length; i++) {
        if (entryPattern.test(lines[i])) {
            entryLine = i;
        }
        if (entryLine > 0 && lines[i].match(/^status:/i)) {
            statusLine = i;
            break;
        }
    }

    if (entryLine < 0) return null;

    const statusBlock = [
        '',
        'status: ' + resolution.status,
        'resolved_by: ' + resolution.resolved_by,
        'resolved_at: ' + resolution.resolved_at,
        'resolved_label: ' + resolution.reason
    ];

    if (statusLine > 0) {
        for (let i = 0; i < 5; i++) {
            if (lines[statusLine + i] && lines[statusLine + i].startsWith('status') || 
                lines[statusLine + i]?.startsWith('resolved_')) {
                lines[statusLine + i] = statusBlock[i];
            }
        }
    } else {
        lines.splice(entryLine + 1, 0, statusBlock.join('\n'));
    }

    fs.writeFileSync(filepath, lines.join('\n'));
    return resolution;
}

/**
 * Mark an entry as resolved
 */
function resolve(file, entry, reason, options = {}) {
    return addResolution({ file, entry }, STATUS.RESOLVED, reason, options);
}

/**
 * Mark an entry as deprecated
 */
function deprecate(file, entry, reason, options = {}) {
    return addResolution({ file, entry }, STATUS.DEPRECATED, reason, options);
}

/**
 * Mark an entry as rejected
 */
function reject(file, entry, reason, options = {}) {
    return addResolution({ file, entry }, STATUS.REJECTED, reason, options);
}

/**
 * List resolutions by status
 */
function list(status, file) {
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
    const resolution = get(file, entry);
    return !resolution || resolution.status === STATUS.ACTIVE;
}

module.exports = {
    STATUS,
    resolve,
    deprecate,
    reject,
    list,
    get,
    isActive,
    logDelta,
    getDeltas,
    getLedger
};
