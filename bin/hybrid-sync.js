#!/usr/bin/env node
/**
 * Vant Hybrid-Sync CLI
 * Public/Private brain sync
 * 
 * All args should have both long (--arg) and short (-a) forms.
 * 
 * Usage: vant hybrid-sync [-h|--help] [-p|--public] [-r|--private]
 */

// -h/--help: show help and exit
const args = process.argv.slice(2);
if (args[0] === '-h' || args[0] === '--help') {
    console.log('Usage: vant hybrid-sync [-h|--help] [-p|--public] [-r|--private]');
    console.log('');
    console.log('  -h, --help    Show this help');
    console.log('  -p, --public  Push public only');
    console.log('  -r, --private Push private only');
    process.exit(0);
}

// Parse: support both short and long
const argsSet = new Set(args);
const action = (argsSet.has('-p') || argsSet.has('--public')) ? 'public' :
              (argsSet.has('-r') || argsSet.has('--private')) ? 'private' :
              args[0];

const path = require('path');
const DIR = path.join(__dirname, '..');
const hybrid = require(path.join(DIR, 'lib', 'hybrid-sync'));

async function run() {
    if (!action) {
        // Show summary
        const summary = hybrid.getSummary();
        console.log(`
╔═══════════════════════════════════════╗
║        Vant Hybrid Sync             ║
╚═══════════════════════════════════════╝

Default Privacy: ${summary.defaultPrivacy}
Public Repos: ${summary.publicRepos.join(', ') || 'none'}
Private Repos: ${summary.privateRepos.join(', ') || 'none'}
`);
        process.exit(0);
    }
    
    if (action === '--public') {
        await hybrid.pushPublic();
        console.log('✓ Pushed to public repos');
        process.exit(0);
    }
    
    if (action === '--private') {
        await hybrid.pushPrivate();
        console.log('✓ Pushed to private repos');
        process.exit(0);
    }
    
    if (action === '--set') {
        const repo = args[1];
        const privacy = args[2];
        if (!repo || !privacy) {
            console.error('Usage: vant hybrid --set <repo> <public|private>');
            process.exit(1);
        }
        hybrid.setPrivacy(repo, privacy);
        console.log('✓ Set ' + repo + ' to ' + privacy);
        process.exit(0);
    }
    
    console.log('Usage: vant hybrid [--public|--private|--set <repo> <public|private>]');
    process.exit(1);
}

run().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});