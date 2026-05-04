#!/usr/bin/env node
const vaf = require("../lib/vaf");
// bin/onboard.js - CLI for knowledge base / onboarding

const onboard = require('../lib/onboard')

const args = process.argv.slice(2)
const cmd = args[0]
if (cmd) vaf.check(cmd, {type: "string", name: "cmd", maxLength: 20})

function printSummary() {
  const summary = onboard.getOnboardSummary()
  
  console.log('=== Vant Onboarding ===\n')
  console.log(`Version: ${summary.version}`)
  console.log(`Status: ${summary.status}`)
  console.log(`Description: ${summary.description}\n`)
  
  console.log(`Brain Files (${summary.brainFiles}):`)
  summary.files.forEach(f => {
    console.log(`  ${f.filename}: ${f.title} (${f.sections} sections)`)
  })
  
  console.log(`\nSystem Files (${summary.systemFiles}):`)
  summary.systems.forEach(f => {
    console.log(`  ${f.filename}`)
  })
  
  if (summary.succession) {
    console.log(`\nSuccession: ${summary.succession.version}`)
    console.log(`  Previous: ${summary.succession.succession?.previous?.version || 'none'}`)
    console.log(`  Trust: ${summary.succession.succession?.trust?.default}`)
  }
  
  console.log(`\nGenerated: ${summary.generated}`)
}

if (cmd === 'summary' || cmd === 'list' || !cmd) {
  printSummary()
} else if (cmd === 'files') {
  const files = onboard.getBrainFiles()
  console.log('Brain files:')
  files.forEach(f => console.log(`  ${f}`))
} else if (cmd === 'read') {
  const filename = args[1]
  if (!filename) {
    console.log('Usage: vant onboard read <filename>')
    process.exit(1)
  }
  const file = onboard.getFile(filename)
  if (!file) {
    console.error(`File not found: ${filename}`)
    process.exit(1)
  }
  console.log(`# ${file.title}\n`)
  console.log(file.content)
} else if (cmd === 'search') {
  const query = args[1]
  if (!query) {
    console.log('Usage: vant onboard search <keyword>')
    process.exit(1)
  }
  const results = onboard.search(query)
  console.log(`Found ${results.length} files matching "${query}":\n`)
  results.forEach(r => {
    console.log(`  ${r.filename}: ${r.title}`)
    console.log(`    ${r.preview}\n`)
  })
} else if (cmd === 'system') {
  console.log('System files (internal):')
  onboard.getSystemFiles().forEach(f => console.log(`  ${f}`))
} else if (cmd === 'help') {
  console.log(`
Vant Onboard - Knowledge base / onboarding

Commands:
  vant onboard summary     Show full onboarding summary
  vant onboard files      List brain files
  vant onboard read <file>  Read a brain file
  vant onboard search <term> Search brain files
  vant onboard system    Show system files
  vant onboard help      Show this help
`)
} else {
  console.log('Unknown command. Use: vant onboard help')
  process.exit(1)
}
