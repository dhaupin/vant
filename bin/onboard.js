#!/usr/bin/env node
/**
 * Vant onboard - knowledge base / onboarding browser
 *
 * Usage: vant onboard [summary|files|read <file>|search <term>|system|help]
 *
 * Note: this file was rewritten around an explicit async main() with a
 * guaranteed process.exit. The previous un-awaited IIFE lost the exit race
 * in some contexts (redirected stdout, spawned children) and printed nothing.
 */
const vaf = require("../lib/vaf");
const onboard = require("../lib/onboard");

const args = process.argv.slice(2);

if (args[0] === '-h' || args[0] === '--help' || args[0] === 'help') {
    console.log(`
Vant Onboard - Knowledge base / onboarding

Commands:
  vant onboard summary      Show full onboarding summary
  vant onboard files        List brain files
  vant onboard read <file>  Read a brain file
  vant onboard search <term>  Search brain files
  vant onboard system       Show system files
  vant onboard help         Show this help
`);
    process.exit(0);
}

const cmd = args[0];
if (cmd) vaf.check(cmd, { type: "string", name: "cmd", maxLength: 20 });

function printSummary(summary) {
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

async function main() {
    if (!cmd || cmd === 'summary' || cmd === 'list') {
        const summary = await onboard.getOnboardSummary()
        printSummary(summary)
    } else if (cmd === 'files') {
        const files = await onboard.getBrainFiles()
        console.log('Brain files:')
        files.forEach(f => console.log(`  ${f}`))
    } else if (cmd === 'read') {
        const filename = args[1]
        if (!filename) {
            console.log('Usage: vant onboard read <filename>')
            process.exitCode = 1
            return
        }
        // getFile is async in lib (pipeline-wrapped)
        const file = await onboard.getFile(filename)
        if (!file) {
            console.error(`File not found: ${filename}`)
            process.exitCode = 1
            return
        }
        console.log(`# ${file.title}\n`)
        console.log(file.content)
    } else if (cmd === 'search') {
        const query = args.slice(1).join(' ')
        if (!query) {
            console.log('Usage: vant onboard search <keyword>')
            process.exitCode = 1
            return
        }
        // search is async in lib (loadCorpus is a promise)
        const results = await onboard.search(query)
        console.log(`Found ${results.length} files matching "${query}":\n`)
        results.forEach(r => {
            console.log(`  ${r.filename}: ${r.title}`)
            console.log(`    ${r.preview}\n`)
        })
    } else if (cmd === 'system') {
        console.log('System files (internal):')
        // async in lib
        const systems = await onboard.getSystemFiles()
        systems.forEach(f => console.log(`  ${f}`))
    } else {
        console.log('Unknown command. Use: vant onboard help')
        process.exitCode = 1
        return
    }
    // Hard exit: the summary's promise chain does not reliably hold the loop
    // in spawned/redirected contexts; exiting here is deterministic.
    process.exit(process.exitCode || 0)
}

main().catch(e => {
    console.error('Onboard failed:', e.message)
    process.exit(1)
})
