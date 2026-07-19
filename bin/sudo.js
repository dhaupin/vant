#!/usr/bin/env node
/**
 * Vant Sudo CLI
 * Sudo/privilege management
 * 
 * Usage:
 *   vant sudo status               # Show sudo status
 *   vant sudo enable              # Enable sudo
 *   vant sudo disable            # Disable sudo
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'status';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Sudo CLI - Privilege management

Usage:
  vant sudo status                 Show sudo status
  vant sudo enable                Enable sudo
  vant sudo disable               Disable sudo
  vant sudo run <cmd>             Run command with sudo
`);
    process.exit(0);
}

function run() {
    const sudo = require('../lib/sudo');
    
    if (subcmd === 'status' || subcmd === 'stat' || subcmd === 'info') {
        const scopes = sudo.getScopes();
        console.log('Sudo status:');
        console.log('  Scopes:', scopes.length);
        console.log('  can(>):', sudo.can('test') ? 'allowed' : 'denied');
    } else if (subcmd === 'enable' || subcmd === 'on' || subcmd === 'activate') {
        console.log('Enabling sudo...');
    } else if (subcmd === 'disable' || subcmd === 'off' || subcmd === 'deactivate') {
        console.log('Disabling sudo...');
    } else if (subcmd === 'run' || subcmd === 'exec') {
        const cmd = args.slice(1).join(' ');
        if (!cmd) {
            console.error('Usage: vant sudo run <command>');
            process.exit(1);
        }
        console.log('Running with sudo:', cmd);
    } else {
        console.log('Usage: vant sudo <command>');
        process.exit(1);
    }
}

run();
