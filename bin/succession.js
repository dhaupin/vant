#!/usr/bin/env node
const vaf = require("../lib/vaf");
// bin/succession.js - CLI for brain succession

const path = require('path')
const { execSync } = require('child_process')

// Load succession lib
const succession = require('../lib/succession')

const args = process.argv.slice(2)
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
  const commit = getGitCommit()
  const config = require('../models/public/_succession.json')
  config.succession.previous = config.succession.previous || {}
  config.succession.previous.commit = commit
  require('fs').writeFileSync(
    path.join(__dirname, '..', 'models', 'public', '_succession.json'),
    JSON.stringify(config, null, 2)
  )
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
