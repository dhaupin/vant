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
    const nature = require('../lib/nature');
    
    if (subcmd === 'status' || subcmd === 'stat' || subcmd === 'info') {
        console.log('Nature status: (use nature.status() to get)');
    } else if (subcmd === 'config' || subcmd === 'cfg') {
        console.log('Nature config: (use nature.config() to get)');
    } else if (subcmd === 'info' || subcmd === 'show') {
        console.log('Nature info: (use nature.info() to get)');
    } else {
        console.log('Usage: vant nature <command>');
        process.exit(1);
    }
}

run();
