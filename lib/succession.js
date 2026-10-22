/**
 * Succession - Brain succession and trust levels (v0.8.6)
 * WITH EVENT EMISSIONS - trust changes emit globally
 * Controls agent autonomy via trust levels
 *
 * Usage:
 *   const succession = require('./succession');
 *   succession.getTrustLevel();      // Get current trust level
 *   succession.setTrustLevel('high'); // 'high' | 'medium' | 'low' | 'none'
 *   succession.getFilesForTrust(level); // Files the agent may use at a level
 *
 * Levels:
 *   3 = high (full autonomy)
 *   2 = medium (most ops, ask for big)
 *   1 = low (limited, ask first)
 *   0 = none (wait for instructions)
 *
 * SECURITY: Only modifies trust config
 *
 * Related: guides/succession.md
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

const vaf = require("./vaf");
const path = require('path');
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
                throw new errors.VantError('Read permission required for succession operations', { code: errors.CODES.STORAGE_READ_DENIED, retryable: false });
            }
        } catch (e) {}
    }
}

function _checkWrite() {
    const sandbox = _getSandbox();
    if (sandbox && sandbox.canWrite) {
        try {
            if (!sandbox.canWrite()) {
                throw new errors.VantError('Write permission required for succession operations', { code: errors.CODES.STORAGE_WRITE_DENIED, retryable: false });
            }
        } catch (e) {}
    }
}

// Use brain router for paths. Resolved PER CALL through the shared models
// FileStorage (containment/symlink/VAF/atomic-write) - the old module-load
// constants (PUBLIC_DIR/LEDGER_PATH) froze the original brain's paths, so
// pushBrain() had no effect and getStackTrustLevels/getStackLedgers always
// read/wrote the first brain regardless of the stack position.
const brain = require('./brain');
const _modelsRoot = path.resolve(process.cwd(), 'models');
let _store = null;
function _getStore() {
    if (!_store) {
        const Storage = require('./storage');
        _store = new Storage.FileStorage({ basePath: _modelsRoot });
    }
    return _store;
}
function _rel(...segs) {
    return path.relative(_modelsRoot, path.join(...segs));
}

// Read succession config
function getConfig() {
    _checkRead();

  // (storage migration: containment/VAF via FileStorage; read() returns null
  // when the config is missing - same contract as the old existsSync check)
  const content = _getStore().read(_rel(brain.getPublicPath(), '_succession.json'));
  if (!content) return null;
  try { return JSON.parse(content) } catch { return null }
}

// Get current trust level
function getTrustLevel() {
  const config = getConfig()
  return config?.succession?.trust?.default || 'medium'
}

// Set trust level
function setTrustLevel(level) {
    _checkWrite();

  vaf.check(level, {type: 'string', name: 'level', maxLength: 20, pattern: /^(high|medium|low|none)$/});
  const configRel = _rel(brain.getPublicPath(), '_succession.json');
  const config = getConfig()
  if (!config) throw new errors.VantError('No _succession.json found', { code: errors.CODES.CONFIG_NOT_FOUND, retryable: false });

  const validLevels = ['high', 'medium', 'low', 'none']
  if (!validLevels.includes(level)) {
    throw new errors.VantError('Invalid level: ' + level + '. Use: ' + validLevels.join(', '), { code: errors.CODES.INVALID_LEVEL, retryable: false });
  }

  config.succession.trust.default = level
  _getStore().write(configRel, JSON.stringify(config, null, 2))

  // EVENT: trust level changed
  _emit('succession:level-changed', { level, timestamp: Date.now() });

  return { level, description: config.succession.trust.levels[level] }
}

// Get previous brain info
function getPreviousBrain() {
  const config = getConfig()
  return config?.succession?.previous || null
}

// Get current version
function getCurrentVersion() {
  const config = getConfig()
  return config?.version || null
}

// Get ledger
function getLedger() {
    _checkRead();

  const content = _getStore().read(_rel(brain.getBrainPath(), '.ledger.json'));
  if (!content) return null
  try { return JSON.parse(content) } catch { return { entries: [] } }
}

// ==================== READ-SIDE TRUST FLOOR (#233-2 fix) ====================
// The trust floor is now ENFORCED at the private read seam, not just
// described. Until this landed, the floor was behavioral description only
// (getFilesForTrust's prose) — nothing gated brain.read, and the
// succession-trust-inheritance pack oracle measured a low-trust successor
// resolving FULL private state. The verdict predicate is the
// descriptor's letter, enforced:
//   high/medium (medium = the default) → unchanged; every existing
//     install behaves byte-identically.
//   none → private reads resolve ONLY identity ("load only identity,
//     ignore previous").
//   low  → private reads REFUSED by default. "Treat as reference" is the
//     PUBLIC trees, which stay open — public memory is published by
//     definition. The operator's own config can raise the floor by
//     declaring succession.trust.core (array of brain-file names) as the
//     minimal core a low-trust successor may resolve privately; nothing
//     else gets through. There is deliberately NO code-side bypass: trust
//     is operator policy, the seam enforces it, and boot flows that need
//     private inheritance declare their core in the config.

function _trustFloorVerdict(name, level, core) {
    if (!level || level === 'high' || level === 'medium') return { allowed: true, level: level || 'medium' };
    if (level === 'none') {
        if (name === 'identity') return { allowed: true, level };
        return { allowed: false, level, reason: 'trust floor none: private state resolves only identity' };
    }
    if (level === 'low') {
        if (Array.isArray(core) && core.includes(name)) return { allowed: true, level };
        return { allowed: false, level, reason: 'trust floor low: private state resolves only the succession.trust.core the config declares (public trees stay open for reference)' };
    }
    return { allowed: false, level, reason: 'trust floor: unknown level ' + String(level) };
}

// Live wrapper used by lib/brain's private read seam. Never throws — a
// sandbox window or a missing config degrades to the level\\=medium default
// (existing behavior), never into a fake. Returns { allowed, level, reason? }.
function privateReadVerdict(name) {
    let level = 'medium';
    let core = null;
    try {
        const config = getConfig();
        level = config?.succession?.trust?.default || 'medium';
        core = config?.succession?.trust?.core || null;
    } catch (e) { /* degraded: default (medium) applies, never a fake refusal */ }
    return _trustFloorVerdict(String(name || ''), level, core);
}

// Apply trust level to brain loading
// Returns which files to load based on trust
function getFilesForTrust(trustLevel) {
  const config = getConfig()
  const levels = config?.succession?.trust?.levels || {}

  return {
    trustLevel,
    description: levels[trustLevel] || 'Unknown',
    behavior: {
      high: 'load all files, inherit memories',
      medium: 'load core files, cherry-pick learnings',
      low: 'load minimal core, treat as reference',
      none: 'load only identity, ignore previous'
    }[trustLevel] || 'unknown'
  }
}

// Log succession event to ledger
function logSuccession(toVersion, label) {
    _checkWrite();

  const config = getConfig()
  const currentVersion = config?.version

  let ledger = getLedger() || { version: toVersion, created: new Date().toISOString(), successions: [] }

  ledger.successions.push({
    from: currentVersion,
    to: toVersion,
    commit: null, // Would be set by git
    date: new Date().toISOString(),
    label: label || `Update to ${toVersion}`,
    initiator: 'runtime'
  })

  ledger.active = toVersion
  ledger.version = toVersion

  _getStore().write(_rel(brain.getBrainPath(), '.ledger.json'), JSON.stringify(ledger, null, 2))
  return ledger
}

// ==================== MULTIBRAIN STACK SUPPORT ====================

/**
 * Get succession config from all brains in the stack
 * @returns {Object} Combined config
 */
function getStackTrustLevels() {
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
            const config = getConfig();
            const trust = getTrustLevel();
            results.byBrain[brainName] = { config, trustLevel: trust };
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }

    return results;
}

/**
 * Get ledger from all brains in the stack
 * @returns {Object} Combined ledgers
 */
function getStackLedgers() {
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
            const ledger = getLedger();
            results.byBrain[brainName] = ledger;
        } catch (e) {
            results.byBrain[brainName] = { error: e.message };
        } finally {
            brain.removeBrain();
        }
    }

    return results;
}

module.exports = {
  getConfig,
  getTrustLevel,
  setTrustLevel,
  getPreviousBrain,
  getCurrentVersion,
  getLedger,
  getFilesForTrust,
  privateReadVerdict,
  _trustFloorVerdict,
  logSuccession,

  // Multibrain Stack
  getStackTrustLevels,
  getStackLedgers
}
