// succession.js - Runtime for brain succession and trust levels

const fs = require('fs')
const vaf = require("./vaf")
const path = require('path')

const PUBLIC_DIR = path.join(__dirname, '..', 'models', 'public')
const LEDGER_PATH = path.join(__dirname, '..', 'models', '.ledger.json')

// Read succession config
function getConfig() {
  const configPath = path.join(PUBLIC_DIR, '_succession.json')
  if (!fs.existsSync(configPath)) return null
  return JSON.parse(fs.readFileSync(configPath, 'utf8'))
}

// Get current trust level
function getTrustLevel() {
  const config = getConfig()
  return config?.succession?.trust?.default || 'medium'
}

// Set trust level
function setTrustLevel(level) {
  vaf.check(level, {type: 'string', name: 'level', maxLength: 20, pattern: /^(high|medium|low|none)$/});
  const configPath = path.join(PUBLIC_DIR, '_succession.json')
  const config = getConfig()
  if (!config) throw new Error('No _succession.json found')
  
  const validLevels = ['high', 'medium', 'low', 'none']
  if (!validLevels.includes(level)) {
    throw new Error(`Invalid level: ${level}. Use: ${validLevels.join(', ')}`)
  }
  
  config.succession.trust.default = level
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
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
  if (!fs.existsSync(LEDGER_PATH)) return null
  return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'))
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
