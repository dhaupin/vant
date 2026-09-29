#!/usr/bin/env node
/**
 * Vant Succession - Trust level management
 * Controls agent autonomy via trust levels
 *
 * Usage: vant succession [get|set <level>]
 */

const vaf = require("../lib/vaf");

// (1b) Capability gate — the 'log' subcommand rewrites the succession ledger
function _checkWrite() {
    try {
        const sandbox = require('../lib/sandbox');
        if (!sandbox) return;
        // (pass 74) Align with the storage middleware philosophy: a fresh,
        // unconfigured sandbox ALLOWS with a warning — that is how every
        // other write path in the CLI works (storage.js logs "Sandbox not
        // configured; allowing by default"). The old unconditional
        // canWrite() gate made `vant succession log` unreachable on every
        // default install, since DEFAULT_CAPABILITIES.canWrite is false.
        // Enforce denial only when the sandbox was explicitly configured.
        if (sandbox.defaultSandbox && sandbox.defaultSandbox._explicitlyConfigured !== true) return;
        if (!sandbox.canWrite()) {
            throw new Error('Write capability required for succession log - grant write to this process (explicit sandbox capabilities or sudo escalate) and retry in the SAME process');
        }
    } catch (e) {
        if (/capability/i.test(e.message)) throw e;
    }
}

// -h/--help
const args = process.argv.slice(2);
if (args[0] === '-h' || args[0] === '--help') {
    console.log("'Usage: vant succession [options]'");
    process.exit(0);
}
// bin/succession.js - CLI for brain succession

const path = require('path')
const { execSync } = require('child_process')

// Load succession lib
const succession = require('../lib/succession')

const cmd = args[0];
if (cmd) vaf.check(cmd, {type: "string", name: "cmd", maxLength: 20});

function getGitCommit() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim().slice(0, 7)
  } catch {
    return 'unknown'
  }
}

function printStatus() {
  const version = succession.getCurrentVersion()
  const trust = succession.getTrustLevel()
  const previous = succession.getPreviousBrain()
  const ledger = succession.getLedger()
  
  console.log('=== Brain Succession ===\n')
  console.log(`Current Version: ${version}`)
  console.log(`Trust Level: ${trust}\n`)
  
  console.log('Previous Brain:')
  if (previous) {
    console.log(`  Version: ${previous.version}`)
    console.log(`  Commit: ${previous.commit}`)
    console.log(`  Date: ${previous.date}`)
    console.log(`  Label: ${previous.label}`)
  } else {
    console.log('  None')
  }
  
  console.log('\nTrust Levels:')
  const files = succession.getFilesForTrust(trust)
  console.log(`  Behavior: ${files.behavior}`)
  
  console.log('\nSuccession History:')
  if (ledger?.successions?.length) {
    ledger.successions.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.from} → ${s.to}: ${s.label}`)
    })
  } else {
    console.log('  No history')
  }
  
  console.log(`\nRegistry: ${ledger?.registry || 'unknown'}`)
  console.log(`Active: ${ledger?.active || 'unknown'}`)
}

if (cmd === 'status' || !cmd) {
  printStatus()
} else if (cmd === 'trust') {
  const level = args[1]
  if (!level) {
    console.log('Usage: vant succession trust <level>')
    console.log('Levels: high, medium, low, none')
    process.exit(1)
  }
  try {
    const result = succession.setTrustLevel(level)
    console.log(`Trust level set to: ${result.level}`)
    console.log(`  ${result.description}`)
  } catch (e) {
    console.error('Error:', e.message)
    process.exit(1)
  }
} else if (cmd === 'log') {
  const to = args[1] || 'new'
  const label = args.slice(2).join(' ') || `Update to ${to}`
  _checkWrite()
  const commit = getGitCommit()
  // (pass 74, multibrain census) The succession config lives in the ACTIVE
  // brain's public tree — getPublicPath(), exactly where lib/succession
  // reads it and where the file actually exists on every real install
  // (models/public/vant/_succession.json). The old hardcoded
  // models/public root path threw MODULE_NOT_FOUND on this repo: a root
  // _succession.json was never deployed anywhere.
  const brain = require('../lib/brain')
  const fsMod = require('fs')
  const configPath = path.join(brain.getPublicPath(), '_succession.json')
  let config
  try {
    config = JSON.parse(fsMod.readFileSync(configPath, 'utf8'))
  } catch (e) {
    // Fresh install with no succession config yet — seed one from the
    // running version instead of crashing.
    config = { version: brain.getVersion(), succession: {} }
  }
  config.succession = config.succession || {}
  config.succession.previous = config.succession.previous || {}
  config.succession.previous.commit = commit
  fsMod.writeFileSync(configPath, JSON.stringify(config, null, 2))
  const ledger = succession.logSuccession(to, label)
  console.log(`Logged succession: ${label}`)
  console.log(`Active: ${ledger.active}`)
} else if (cmd === 'help') {
  console.log(`
Vant Succession - Brain version and trust management

Commands:
  vant succession status   Show current succession state
  vant succession trust    Show/set trust level (high|medium|low|none)
  vant succession log     Log a succession event
  vant succession help    Show this help

Trust Levels:
  high   - Trust previous brain fully, inherit all memories
  medium - Trust but verify, cherry-pick key learnings (default)
  low    - Treat previous brain as reference only
  none   - Ignore previous brain completely
`)
} else {
  console.log('Unknown command. Use: vant succession help')
  process.exit(1)
}
