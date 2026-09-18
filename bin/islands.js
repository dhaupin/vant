/**
 * Islands CLI (v0.9.0)
 * 
 * CLI wrapper using runtime - lib/islands.js and lib/mcp.js
 * 
 * Usage:
 *   node bin/islands.js list                        # List islands via runtime
 *   node bin/islands.js create <name> --triggers x,y  # Create via runtime
 *   node bin/islands.js trigger <query>           # Find triggers via runtime
 *   node bin/islands.js mcp                        # Start MCP server
 */

const path = require('path');
const REPO_ROOT = path.join(__dirname, '..');

// Load runtime modules properly
const islands = require(path.join(REPO_ROOT, 'lib', 'islands'));
const brain = require(path.join(REPO_ROOT, 'lib', 'brain'));

// CLI commands using runtime
const cmd = process.argv[2];
const opts = process.argv.slice(3);

(async () => {
    try {
        switch (cmd) {
            case 'list': {
                const list = islands.getAvailable();
                const m = await islands.getManifest();
                console.log(`[islands] ${list.length} islands:`);
                for (const island of list) {
                    console.log(`  - ${island.key} (${island.type}) triggers=[${island.triggers?.join(', ') || 'none'}]`);
                }
                break;
            }
            case 'create': {
                const name = opts[0];
                if (!name) {
                    console.error('Usage: create <name> [--triggers x,y,z]');
                    process.exit(1);
                }
                const triggersIdx = opts.indexOf('--triggers');
                const triggers = triggersIdx >= 0 
                    ? opts[triggersIdx + 1]?.split(',') || []
                    : [];
                const result = islands.createIsland(name, { type: 'static', triggers });
                console.log(`[islands] Created:`, result);
                break;
            }
            case 'trigger': {
                const query = opts.join(' ');
                const matches = islands.findTriggers(query);
                console.log(`[islands] Query: "${query}"`);
                console.log(`[islands] Matching: ${matches.join(', ') || 'none'}`);
                break;
            }
            case 'load': {
                const name = opts[0];
                if (!name) {
                    console.error('Usage: load <name>');
                    process.exit(1);
                }
                const data = await islands.load(name);
                console.log(`[islands] Loaded ${name}:`, data?.content?.slice(0, 100) || 'empty');
                break;
            }
            case 'mcp': {
                const mcp = require(path.join(REPO_ROOT, 'lib', 'mcp'));
                const port = parseInt(process.env.VANT_MCP_PORT || '3100');
                console.log(`[mcp] Starting on port ${port}...`);
                await mcp.start();
                console.log(`[mcp] Running on port ${port}`);
                const tools = mcp.listTools().filter(t => t.name.includes('island'));
                console.log(`[mcp] Island tools: ${tools.length}`);
                for (const t of tools) {
                    console.log(`  - ${t.name}`);
                }
                break;
            }
            default:
                console.log(`
Islands CLI (runtime wrapper)

Usage:
  islands list                     # List via lib/islands.js
  islands create <name> --triggers x,y   # Create via runtime
  islands trigger <query>           # Find triggers
  islands load <name>             # Load island content
  islands mcp                   # Start MCP server

Runtime: lib/islands.js + lib/mcp.js
                `);
        }
    } catch (e) {
        console.error('[islands] Error:', e.message);
        process.exit(1);
    }
})();