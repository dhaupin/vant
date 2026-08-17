/**
 * Vant MCP Server
 *
 * CLI entry point - delegates to lib/mcp.js
 * Format: supports yaml/json input (via format.js)
 *
 * Usage:
 *   node bin/mcp.js -h|--help
 *   node bin/mcp.js -s|--stdio
 *   node bin/mcp.js -S|--server [-p|--port <port>]
 */

const mcp = require('../lib/mcp');
const format = require('../lib/format');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Parse args
const args = process.argv.slice(2);
let mode = 'server';
let port = parseInt(process.env.VANT_MCP_PORT || '3100');
let help = false;

for (let i = 0; i < args.length; i++) {
    if (args[i] === '-h' || args[i] === '--help') help = true;
    else if (args[i] === '-s' || args[i] === '--stdio') mode = 'stdio';
    else if (args[i] === '-S' || args[i] === '--server') mode = 'server';
    else if (args[i] === '-p' || args[i] === '--port') port = parseInt(args[++i]);
}

if (help) {
    console.log(`
Vant MCP Server

Usage:
  node bin/mcp.js [options]

Options:
  -h, --help     Show this help
  -s, --stdio   Run in stdio mode (for AI agents)
  -S, --server  Run as HTTP server (default)
  -p, --port    Port for server mode (default: 3457)

Environment:
  VANT_MCP_PORT    Port (default: 3457)
  GITHUB_TOKEN    GitHub auth for sync

Authentication:
  MCP requires API key if VANT_MCP_API_KEY is set.
  Pass key via header: X-API-Key: <key> or Authorization: Bearer <key>

  Set key in config:
    vant config set mcp.requireKey true
    vant config set mcp.apiKey "your-secret-key"

  Or environment:
    export VANT_MCP_API_KEY=your-secret-key
    export VANT_MCP_REQUIRE_KEY=true

TTL (Time-To-Live):
  Use --ttl flag with learn/remember to auto-expire:
    vant learn key "content" --ttl 60000
  Result includes { ttl, expiresAt } fields

Resolution:
  Track thought resolutions:
    vant resolution status
    vant resolution resolve <entry>
    vant resolution reject <entry>

Headless Mode:
  Use Vant as library without MCP:
    const vant = require('../lib/vant');
    await vant.startHeadless({ port: 3000 });
  Or: process.env.VANT_MODE=headless
`);
    process.exit(0);
}

if (mode === 'stdio') {
    // STDIO mode - read JSON/YAML from stdin, write to stdout
    let buffer = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => buffer += chunk);
    process.stdin.on('end', async () => {
        try {
            // Use format.js for flexible parsing (yaml/json)
            const parsed = format.parse(buffer, { validate: false });
            const request = parsed.data || JSON.parse(buffer);  // Fallback
            const { method, params = {}, id } = request;
            
            const tools = mcp.methods;
            // Method names in tools map have prefixes (brain_, context_, etc.)
            // Don't strip prefixes - use method name as-is
            const handler = tools.get(method);
            
            if (!handler) {
                console.log(JSON.stringify({ jsonrpc: '2.0', error: { code: -32601, message: 'Method not found: ' + method }, id }));
                return;
            }
            
            const result = await handler.handler(params);
            console.log(JSON.stringify({ jsonrpc: '2.0', result, id }));
        } catch (e) {
            console.log(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: e.message }, id: null }));
        }
    });
} else {
    // Server mode - pass port to mcp.start()
    const options = port ? { port } : {};
    mcp.start(options).then(({ port }) => {
        console.log(`[MCP] Server running on port ${port}`);
        console.log(`[MCP] Tools: ${mcp.listTools().length} available`);
    }).catch(err => {
        console.error('[MCP] Failed to start:', err.message);
        process.exit(1);
    });
}
