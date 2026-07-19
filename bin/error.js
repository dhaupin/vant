#!/usr/bin/env node
/**
 * Vant Error CLI
 * Error handling utilities
 * 
 * Usage:
 *   vant error list                 # List error types
 *   vant error code <code>         # Get error info
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'list';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Error CLI - Error handling

Usage:
  vant error list                   List error types
  vant error code <code>           Get error info
  vant error explain <code>        Explain error
`);
    process.exit(0);
}

function run() {
    const error = require('../lib/error');
    
    if (subcmd === 'list' || subcmd === 'ls' || subcmd === 'all') {
        console.log('Error Codes:');
        const codes = error.CODES;
        Object.entries(codes).forEach(([name, code]) => {
            console.log(`  ${name}: ${code}`);
        });
    } else if (subcmd === 'code' || subcmd === 'info') {
        const code = args[1];
        if (!code) {
            console.error('Usage: vant error code <code>');
            process.exit(1);
        }
        console.log('Error info:', error.CODES[code] || 'Unknown code');
    } else if (subcmd === 'stats') {
        const stats = error.getStats();
        console.log(JSON.stringify(stats, null, 2));
    } else if (subcmd === 'recent') {
        const recent = error.getRecent(10);
        console.log('Recent errors:', recent);
    } else if (subcmd === 'explain' || subcmd === 'describe') {
        const code = args[1];
        if (!code) {
            console.error('Usage: vant error explain <code>');
            process.exit(1);
        }
        const codeVal = error.CODES[code];
        console.log(`Error ${code}: ${codeVal || 'Unknown'} - ${getErrorDescription(code)}`);
    } else {
        console.log('Usage: vant error <command>');
        process.exit(1);
    }
}

function getErrorDescription(code) {
    const descriptions = {
        NOT_FOUND: 'Resource not found',
        STORAGE_NOT_FOUND: 'Storage location not found',
        NETWORK_ERROR: 'Network operation failed',
        AUTH_FAILED: 'Authentication failed',
        PERMISSION_DENIED: 'Permission denied',
        VALIDATION_ERROR: 'Input validation failed',
        RATE_LIMITED: 'Rate limit exceeded',
        TIMEOUT: 'Operation timed out'
    };
    return descriptions[code] || 'No description available';
}

run();
