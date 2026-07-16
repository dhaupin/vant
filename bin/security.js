#!/usr/bin/env node
/**
 * Vant Security CLI
 * Security utilities
 * 
 * Usage:
 *   vant security scan <path>       # Scan for issues
 *   vant security audit             # Run security audit
 *   vant security report            # Generate report
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'help';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Security CLI - Security utilities

Usage:
  vant security scan <path>          Scan for security issues
  vant security audit                Run security audit
  vant security report              Generate security report
  vant security check <item>        Check specific item
`);
    process.exit(0);
}

function run() {
    const security = require('../lib/security');
    
    if (subcmd === 'scan' || subcmd === 'check') {
        const path = args[1] || '.';
        console.log('Scanning:', path);
    } else if (subcmd === 'audit' || subcmd === 'review') {
        console.log('Running security audit...');
    } else if (subcmd === 'report' || subcmd === 'summary') {
        console.log('Generating security report...');
    } else {
        console.log('Usage: vant security <command>');
        process.exit(1);
    }
}

run();
