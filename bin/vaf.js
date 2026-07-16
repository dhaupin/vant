#!/usr/bin/env node
/**
 * Vant VAF CLI
 * Validation & Audit Framework
 * 
 * Usage:
 *   vant vaf validate <data>       # Validate data
 *   vant vaf check <item>         # Check item
 *   vant vaf audit                # Run audit
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'help';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant VAF CLI - Validation & Audit Framework

Usage:
  vant vaf validate <data>          Validate data
  vant vaf check <item>            Check item
  vant vaf audit                   Run full audit
  vant vaf rules                   List validation rules
`);
    process.exit(0);
}

function run() {
    const vaf = require('../lib/vaf');
    
    if (subcmd === 'validate' || subcmd === 'valid') {
        const data = args.slice(1).join(' ');
        if (!data) {
            console.error('Usage: vant vaf validate <data>');
            process.exit(1);
        }
        console.log('Validating:', data);
    } else if (subcmd === 'check' || subcmd === 'verify') {
        const item = args[1];
        if (!item) {
            console.error('Usage: vant vaf check <item>');
            process.exit(1);
        }
        console.log('Checking:', item);
    } else if (subcmd === 'audit' || subcmd === 'run') {
        console.log('Running VAF audit...');
    } else if (subcmd === 'rules' || subcmd === 'list') {
        console.log('Validation rules: (use vaf.rules() to list)');
    } else {
        console.log('Usage: vant vaf <command>');
        process.exit(1);
    }
}

run();
