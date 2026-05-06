#!/usr/bin/env node
/**
 * Vant Hybrid CLI
 * Public/Private sync
 */

// -h/--help: show help and exit
const args = process.argv.slice(2);
if (args[0] === '-h' || args[0] === '--help') {
    console.log('Usage: vant hybrid [--public|--private]');
    console.log('');
    console.log('  --public   Push public only');
    console.log('  --private  Push private only');
    process.exit(0);
}

const path = require('path');
const DIR = path.join(__dirname, '..');
const hybrid = require(path.join(DIR, 'lib', 'hybrid'));

// Parse args
const args = process.argv.slice(2);
const action = args[0];

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