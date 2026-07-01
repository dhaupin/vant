/**
 * Succession - Brain succession and trust levels (v0.8.6)
 * WITH EVENT EMISSIONS - trust changes emit globally
 * Controls agent autonomy via trust levels
 *
 * Usage:
 *   const succession = require('./succession');
 *   succession.getLevel();        // Get current trust level
 *   succession.setLevel(3);   // Set level: high=3, medium=2, low=1, none=0
 *   succession.can(permission);  // Check if action allowed
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

const fs = require('fs');
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
                throw new errors.Error('Read permission required for succession operations', { code: errors.CODES.STORAGE_READ_DENIED, retryable: false });
            }
        } catch (e) {}
    }
}

function _checkWrite() {
    const sandbox = _getSandbox();
    if (sandbox && sandbox.canWrite) {
        try {
            if (!sandbox.canWrite()) {
                throw new errors.Error('Write permission required for succession operations', { code: errors.CODES.STORAGE_WRITE_DENIED, retryable: false });
            }
        } catch (e) {}
    }
}

// Use brain router for paths
const brain = require('./brain');
const PUBLIC_DIR = brain.getPublicPath();
const LEDGER_PATH = path.join(brain.getBrainPath(), '.ledger.json');

// Read succession config
function getConfig() {
    _checkRead();

  const configPath = path.join(PUBLIC_DIR, '_succession.json')
  if (!fs.existsSync(configPath)) return null
  try { return JSON.parse(fs.readFileSync(configPath, 'utf8')) } catch { return null }
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
  const configPath = path.join(PUBLIC_DIR, '_succession.json')
  const config = getConfig()
  if (!config) throw new errors.Error('No _succession.json found', { code: errors.CODES.CONFIG_NOT_FOUND, retryable: false });
  
  const validLevels = ['high', 'medium', 'low', 'none']
  if (!validLevels.includes(level)) {
    throw new errors.Error('Invalid level: ' + level + '. Use: ' + validLevels.join(', '), { code: errors.CODES.INVALID_LEVEL, retryable: false });
  }
  
  config.succession.trust.default = level
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
  
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

  if (!fs.existsSync(LEDGER_PATH)) return null
  try { return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8')) } catch { return { entries: [] } }
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
  
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2))
  return ledger
}

module.exports = {
  getConfig,
  getTrustLevel,
  setTrustLevel,
  getPreviousBrain,
  getCurrentVersion,
  getLedger,
  getFilesForTrust,
  logSuccession
}
