#!/usr/bin/env node
/**
 * Vant API CLI
 * API utilities
 * 
 * Usage:
 *   vant api status                # Show API status
 *   vant api routes               # List routes
 *   vant api call <endpoint>      # Call endpoint
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'status';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant API CLI - API utilities

Usage:
  vant api status                   Show API status
  vant api routes                   List API routes
  vant api call <endpoint>         Call endpoint
  vant api docs                     Show API docs
`);
    process.exit(0);
}

function run() {
    const api = require('../lib/api');
    
    if (subcmd === 'status' || subcmd === 'stat' || subcmd === 'info') {
        console.log('API status: (use api.status() to get)');
    } else if (subcmd === 'routes' || subcmd === 'list' || subcmd === 'ls') {
        console.log('API routes: (use api.routes() to list)');
    } else if (subcmd === 'call' || subcmd === 'request' || subcmd === 'get') {
        const endpoint = args[1];
        if (!endpoint) {
            console.error('Usage: vant api call <endpoint>');
            process.exit(1);
        }
        console.log('Calling endpoint:', endpoint);
    } else if (subcmd === 'docs' || subcmd === 'documentation') {
        console.log('API docs: (use api.docs() to get)');
    } else {
        console.log('Usage: vant api <command>');
        process.exit(1);
    }
}

run();
