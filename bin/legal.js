#!/usr/bin/env node
/**
 * Vant Legal CLI
 * Legal/compliance utilities
 * 
 * Usage:
 *   vant legal check <item>         # Check compliance
 *   vant legal license <name>      # Check license
 *   vant legal audit               # Run legal audit
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'help';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Legal CLI - Legal/compliance utilities

Usage:
  vant legal check <item>           Check compliance
  vant legal license <name>         Check license
  vant legal audit                  Run legal audit
  vant legal report                 Generate legal report
`);
    process.exit(0);
}

function run() {
    const legal = require('../lib/legal');
    
    if (subcmd === 'check' || subcmd === 'verify' || subcmd === 'validate') {
        const item = args[1];
        if (!item) {
            console.error('Usage: vant legal check <item>');
            process.exit(1);
        }
        console.log('Checking:', item);
    } else if (subcmd === 'license' || subcmd === 'lic') {
        const name = args[1];
        if (!name) {
            console.error('Usage: vant legal license <name>');
            process.exit(1);
        }
        console.log('Checking license:', name);
    } else if (subcmd === 'audit' || subcmd === 'compliance') {
        console.log('Running legal audit...');
    } else if (subcmd === 'report' || subcmd === 'summary') {
        console.log('Generating legal report...');
    } else {
        console.log('Usage: vant legal <command>');
        process.exit(1);
    }
}

run();
