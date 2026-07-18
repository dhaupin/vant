#!/usr/bin/env node
/**
 * Vant Nature CLI
 * Nature/environment module
 * 
 * Usage:
 *   vant nature status             # Show nature status
 *   vant nature config             # Show config
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'status';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Nature CLI - Nature module

Usage:
  vant nature status                Show nature status
  vant nature config                Show nature config
  vant nature info                  Show nature info
`);
    process.exit(0);
}

function run() {
    const boot = require('../lib/boot');
    const config = require('../lib/config');
    
    if (subcmd === 'status' || subcmd === 'stat' || subcmd === 'info') {
        const status = boot.getStatus();
        console.log('Nature status:');
        console.log('  Initialized:', status.initialized);
        console.log('  Uptime:', status.uptime + 'ms');
        console.log('  Layers:', status.layers.length);
    } else if (subcmd === 'config' || subcmd === 'cfg') {
        const all = config.getAll();
        console.log('Nature config:', JSON.stringify(all, null, 2));
    } else if (subcmd === 'info' || subcmd === 'show') {
        console.log('Nature: Vant runtime environment');
        console.log('  Modules: boot, config, brain, escrow');
    } else {
        console.log('Usage: vant nature <command>');
        process.exit(1);
    }
}

run();
