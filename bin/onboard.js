#!/usr/bin/env node
/**
 * Vant onboard - knowledge base / onboarding browser
 *
 * Usage: vant onboard [status|wake|summary|files|read <file>|search <term>|system|help]
 *
 * Note: this file was rewritten around an explicit async main() with a
 * guaranteed process.exit. The previous un-awaited IIFE lost the exit race
 * in some contexts (redirected stdout, spawned children) and printed nothing.
 *
 * (pass 35) Now hosts the install/migration hub: `status` and `wake` are the
 * single "where am I" surface — fresh vs legacy (needs `vant migrate`) vs
 * current — instead of each bin/ ad-hoc guessing at tree state.
 */
const vaf = require("../lib/vaf");
const onboard = require("../lib/onboard");

const args = process.argv.slice(2);

if (args[0] === '-h' || args[0] === '--help' || args[0] === 'help') {
    console.log(`
Vant Onboard - Knowledge base / onboarding

Commands:
  vant onboard status       Install state (fresh | legacy | current) + next steps
  vant onboard wake         Wake briefing: install status + brain summary
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

function printStatus(install) {
    const icons = { fresh: '🌱', legacy: '⏳', current: '🧠' };
    console.log(`\n${icons[install.state] || '❓'} Install state: ${install.state.toUpperCase()}`);
    console.log(`   Layout: ${install.layout.upToDate ? 'v' + install.layout.targetVersion + ' (multi-brain)' : 'pending migrations (' + (install.layout.pending || []).length + ')'}`);
    console.log(`   Brain:  ${install.brain.files} files, ${install.brain.systemFiles} system files`);
    console.log('\nNext steps:');
    install.next.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
    console.log('');
}

function printWakeBriefing(briefing) {
    printStatus(briefing.install);
    if (!briefing.summary) return;
    const s = briefing.summary;
    console.log('=== Wake Briefing ===');
    console.log(`Version: ${s.version} | Status: ${s.status}`);
    if (s.description) console.log(`Description: ${s.description}`);
    console.log(`Brain: ${s.brainFiles} files, ${s.systemFiles} system files\n`);
    s.files.slice(0, 12).forEach(f => {
        console.log(`  ${f.filename}: ${f.title} (${f.sections} sections)`);
    });
    if (s.files.length > 12) console.log(`  ... and ${s.files.length - 12} more (vant onboard files)`);
    if (s.succession) {
        console.log(`\nSuccession: ${s.succession.version || 'unknown'} | Trust: ${s.succession.succession?.trust?.default ?? 'n/a'}`);
    }
    console.log(`\nGenerated: ${s.generated}`);
}

async function main() {
    if (!cmd || cmd === 'summary' || cmd === 'list') {
        const summary = await onboard.getOnboardSummary()
        printSummary(summary)
    } else if (cmd === 'status') {
        printStatus(await onboard.getInstallStatus())
    } else if (cmd === 'wake') {
        printWakeBriefing(await onboard.getWakeBriefing())
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
