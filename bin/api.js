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

async function run() {
    const api = require('../lib/api');
    
    if (subcmd === 'status' || subcmd === 'stat' || subcmd === 'info') {
        const status = await api.getStatus();
        console.log('API Status:');
        console.log('  Running:', status.running || false);
        console.log('  Port:', status.port || 'N/A');
        console.log('  Mode:', status.mode || 'N/A');
    } else if (subcmd === 'routes' || subcmd === 'list' || subcmd === 'ls') {
        // MCP methods as "routes"
        const mcp = require('../lib/mcp');
        const tools = mcp.listTools();
        console.log('API Routes (MCP tools):', tools.length);
        tools.slice(0, 10).forEach(t => console.log('  ' + t.name));
        if (tools.length > 10) console.log('  ... and', tools.length - 10, 'more');
    } else if (subcmd === 'call' || subcmd === 'request' || subcmd === 'get') {
        const endpoint = args[1];
        if (!endpoint) {
            console.error('Usage: vant api call <endpoint>');
            process.exit(1);
        }
        const mcp = require('../lib/mcp');
        const result = await mcp.call(endpoint, {});
        console.log('Result:', JSON.stringify(result, null, 2));
    } else if (subcmd === 'docs' || subcmd === 'documentation') {
        const mcp = require('../lib/mcp');
        const tools = mcp.listTools();
        console.log('API Docs:');
        console.log('  Total MCP tools:', tools.length);
    } else {
        console.log('Usage: vant api <command>');
        process.exit(1);
    }
}

run().catch(console.error);
