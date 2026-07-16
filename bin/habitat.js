#!/usr/bin/env node
/**
 * Vant Habitat CLI
 * Environment/habitat management
 * 
 * Usage:
 *   vant habitat status             # Show habitat status
 *   vant habitat config            # Show config
 *   vant habitat init <name>      # Initialize habitat
 *   vant habitat switch <name>    # Switch habitat
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'status';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Habitat CLI - Environment management

Usage:
  vant habitat status               Show habitat status
  vant habitat config               Show habitat config
  vant habitat init <name>          Initialize habitat
  vant habitat switch <name>       Switch to habitat
  vant habitat list                 List habitats
`);
    process.exit(0);
}

function run() {
    const habitat = require('../lib/habitat');
    
    if (subcmd === 'status' || subcmd === 'stat' || subcmd === 'info') {
        console.log('Habitat status:');
        console.log('  (use habitat.status() for actual status)');
    } else if (subcmd === 'config' || subcmd === 'cfg') {
        console.log('Habitat config: (use habitat.config() to get)');
    } else if (subcmd === 'init' || subcmd === 'create' || subcmd === 'new') {
        const name = args[1];
        if (!name) {
            console.error('Usage: vant habitat init <name>');
            process.exit(1);
        }
        console.log('Initializing habitat:', name);
    } else if (subcmd === 'switch' || subcmd === 'use' || subcmd === 'activate') {
        const name = args[1];
        if (!name) {
            console.error('Usage: vant habitat switch <name>');
            process.exit(1);
        }
        console.log('Switching to habitat:', name);
    } else if (subcmd === 'list' || subcmd === 'ls' || subcmd === 'available') {
        console.log('Available habitats: (use habitat.list() to list)');
    } else {
        console.log('Usage: vant habitat <command>');
        process.exit(1);
    }
}

run();
