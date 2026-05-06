#!/usr/bin/env node
/**
 * Vant Repos CLI
 * Multi-repo management
 * 
 * All args should have both long (--arg) and short (-a) forms.
 * 
 * Usage: vant repos [-h|--help] [-l|--list] [-m|--mount <name>] [-p|--pull] [-r|--register <name> <url>]
 */

// -h/--help: show help and exit
const args = process.argv.slice(2);
if (args[0] === '-h' || args[0] === '--help') {
    console.log('Usage: vant repos [-h|--help] [-l|--list] [-m|--mount <name>] [-p|--pull] [-r|--register <name> <url>]');
    console.log('');
    console.log('  -h, --help          Show this help');
    console.log('  -l, --list        List mounted repos');
    console.log('  -m, --mount <name> Mount a repo');
    console.log('  -p, --pull       Pull mounted repos');
    console.log('  -r, --register   Register new repo <name> <url>');
    process.exit(0);
}

// Parse: support both forms
const argsSet = new Set(args);
const action = args.find(a => a === '-l' || a === '--list') ? 'list' :
              args.find(a => a.startsWith('-m') || a.startsWith('--mount')) ? 'mount' :
              args.find(a => a === '-p' || a === '--pull') ? 'pull' :
              args.find(a => a === '-r' || a.startsWith('--register')) ? 'register' : 'list';

const path = require('path');
const DIR = path.join(__dirname, '..');
const repos = require(path.join(DIR, 'lib', 'repos'));

async function run() {
    if (!action || action === '--list' || action === '-l') {
        console.log(`
╔═══════════════════════════════════════╗
║         Vant Repos                  ║
╚═══════════════════════════════════════╝

Registered: ${repos.list().join(', ')}
Mounted: ${repos.getMounted().join(', ') || 'none'}
`);
        process.exit(0);
    }
    
    if (action === '--mount') {
        const name = args[1] || process.argv[3]; // arg or position 2
        if (!name) {
            console.error('Usage: vant repos --mount <name>');
            process.exit(1);
        }
        await repos.mount(name);
        console.log('✓ Mounted: ' + name);
        process.exit(0);
    }
    
    if (action === '--pull') {
        await repos.pull();
        console.log('✓ Pulled all mounted');
        process.exit(0);
    }
    
    if (action === '--register') {
        const name = args[1];
        const url = args[2];
        if (!name || !url) {
            console.error('Usage: vant repos --register <name> <url>');
            process.exit(1);
        }
        repos.register(name, url);
        console.log('✓ Registered: ' + name);
        process.exit(0);
    }
    
    console.log('Usage: vant repos [--list|--mount <name>|--pull|--register <name> <url>]');
    process.exit(1);
}

run().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});