#!/usr/bin/env node
/**
 * Vant Rules CLI
 * Rule management
 * 
 * Usage:
 *   vant rules list                 # List rules
 *   vant rules add <rule>          # Add rule
 *   vant rules check <item>        # Check against rules
 *   vant rules validate            # Validate rules
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'list';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Rules CLI - Rule management

Usage:
  vant rules list                   List all rules
  vant rules add <rule>            Add a rule
  vant rules check <item>         Check item against rules
  vant rules validate             Validate rules
  vant rules export               Export rules
`);
    process.exit(0);
}

function run() {
    const rules = require('../lib/rules');
    
    if (subcmd === 'list' || subcmd === 'ls' || subcmd === 'all') {
        console.log('Rules: (use rules.list() for actual list)');
    } else if (subcmd === 'add' || subcmd === 'create' || subcmd === 'new') {
        const rule = args.slice(1).join(' ');
        if (!rule) {
            console.error('Usage: vant rules add <rule>');
            process.exit(1);
        }
        console.log('Adding rule:', rule);
    } else if (subcmd === 'check' || subcmd === 'verify' || subcmd === 'test') {
        const item = args.slice(1).join(' ');
        if (!item) {
            console.error('Usage: vant rules check <item>');
            process.exit(1);
        }
        console.log('Checking against rules:', item);
    } else if (subcmd === 'validate' || subcmd === 'valid') {
        console.log('Validating rules...');
    } else if (subcmd === 'export' || subcmd === 'dump') {
        console.log('Exporting rules...');
    } else {
        console.log('Usage: vant rules <command>');
        process.exit(1);
    }
}

run();
