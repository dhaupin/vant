#!/usr/bin/env node
/**
 * Vant Framework CLI (v0.8.6)
 * Now uses vant.js (framework absorbed)
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'info';

if (subcmd === '-h' || subcmd === '--help') {
    console.log('Vant Framework CLI (v0.8.6) - Framework absorbed into vant.js');
    console.log('Usage: vant framework <info|version|compute|embed>');
    process.exit(0);
}

async function run() {
    const vant = require('../lib/vant');
    
    if (subcmd === 'info' || subcmd === 'status') {
        console.log('Vant (v0.8.6)');
        console.log('  computeEval:', typeof vant.computeEval === 'function' ? 'ok' : 'missing');
        console.log('  embedText:', typeof vant.embedText === 'function' ? 'ok' : 'missing');
    } else if (subcmd === 'version' || subcmd === 'ver') {
        console.log('0.8.6');
    } else {
        console.log('Usage: vant framework <info|version>');
    }
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
