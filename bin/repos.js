#!/usr/bin/env node
/**
 * Vant Repos CLI
 * Multi-repo management
 */

// -h/--help: show help and exit
const args = process.argv.slice(2);
if (args[0] === '-h' || args[0] === '--help') {
    console.log('Usage: vant repos [--list|--mount <name>|--pull|--register <name> <url>]');
    console.log('');
    console.log('  --list           List mounted repos');
    console.log('  --mount <name>  Mount a repo');
    console.log('  --pull          Pull mounted repos');
    console.log('  --register      Register new repo');
    process.exit(0);
}

const path = require('path');
const DIR = path.join(__dirname, '..');
const repos = require(path.join(DIR, 'lib', 'repos'));

// Parse args (use existing args from -h check)
const action = args[0];

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