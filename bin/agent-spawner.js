/**
 * Agent Spawner (v0.0.1)
 * 
 * CLI for multi-agent management via MCP or direct library.
 * 
 * Usage:
 *   node bin/agent-spawner.js spawn --name Claude --role Assistant
 *   node bin/agent-spawner.js list
 *   node bin/agent-spawner.js delegate <agentId> <task>
 *   node bin/agent-spawner.js kill <agentId>
 *   node bin/agent-spawner.js mcp     # Start MCP server
 */

const path = require('path');

// Try MCP first, fall back to direct
let agents = null;
let mcp = null;

async function loadModules() {
    try {
        mcp = require('../lib/mcp');
        console.log('[agent] Using MCP module');
    } catch (e) {
        console.log('[agent] MCP not available, using direct');
    }
    
    try {
        agents = require('../lib/agents');
        console.log('[agent] Using agents module');
    } catch (e) {
        console.error('[agent] No agent module:', e.message);
    }
}

/**
 * Spawn new agent
 */
async function spawnAgent(options = {}) {
    if (!agents) await loadModules();
    if (!agents) throw new Error('No agent module');
    
    const result = await agents.spawn(options);
    console.log(`[spawn]`, result);
    return result;
}

/**
 * List agents
 */
async function listAgents() {
    if (!agents) await loadModules();
    if (!agents) return [];
    
    const list = agents.list();
    console.log(`[list] Found ${list.length} agents:`);
    for (const a of list) {
        console.log(`  - ${a.id}: ${a.name} (${a.role}) state=${a.state}`);
    }
    return list;
}

/**
 * Delegate task to agent
 */
async function delegateTask(agentId, task) {
    if (!agents) await loadModules();
    if (!agents) throw new Error('No agent module');
    
    const taskObj = {
        operation: () => task,
        options: {}
    };
    
    const result = await agents.delegate(agentId, taskObj);
    console.log(`[delegate]`, result);
    return result;
}

/**
 * Fork current agent
 */
async function forkAgent(options = {}) {
    if (!agents) await loadModules();
    if (!agents) throw new Error('No agent module');
    
    const result = await agents.fork(options);
    console.log(`[fork]`, result);
    return result;
}

/**
 * Kill agent
 */
async function killAgent(agentId) {
    if (!agents) await loadModules();
    if (!agents) throw new Error('No agent module');
    
    const result = agents.terminate(agentId);
    console.log(`[kill] agent ${agentId}: ${result}`);
    return result;
}

/**
 * Get agent info
 */
async function getAgent(agentId) {
    if (!agents) await loadModules();
    if (!agents) return null;
    
    const agent = agents.get(agentId);
    console.log(`[get]`, agent);
    return agent;
}

/**
 * Start MCP server
 */
async function startMCP(options = {}) {
    const { port = 3100 } = options;
    
    if (!mcp) await loadModules();
    if (!mcp) throw new Error('No MCP module');
    
    console.log(`[mcp] Starting server on port ${port}...`);
    const result = await mcp.start();
    console.log(`[mcp] Server running on port ${result.port}`);
    console.log(`[mcp] Tools: ${mcp.listTools().length}`);
    return result;
}

/**
 * List MCP tools
 */
async function listTools() {
    if (!mcp) await loadModules();
    if (!mcp) throw new Error('No MCP module');
    
    const tools = mcp.listTools();
    console.log(`[tools] ${tools.length} available:`);
    for (const t of tools.slice(0, 10)) {
        console.log(`  - ${t.name}: ${t.description}`);
    }
    if (tools.length > 10) {
        console.log(`  ... and ${tools.length - 10} more`);
    }
    return tools;
}

/**
 * Emit event to agents
 */
async function emitEvent(event, data = {}) {
    if (!agents) await loadModules();
    if (!agents) throw new Error('No agent module');
    
    agents.emit(event, data);
    console.log(`[emit] Sent ${event} to listeners`);
    return { event, data };
}

// CLI
const cmd = process.argv[2];
const opts = process.argv.slice(3);

(async () => {
    await loadModules();
    
    try {
        switch (cmd) {
            case 'spawn': {
                // Parse args: --name X --role Y
                const options = {};
                for (let i = 0; i < opts.length; i++) {
                    if (opts[i] === '--name' && opts[i + 1]) {
                        options.name = opts[i + 1];
                        i++;
                    } else if (opts[i] === '--role' && opts[i + 1]) {
                        options.role = opts[i + 1];
                        i++;
                    }
                }
                await spawnAgent(options);
                break;
            }
            case 'list': {
                await listAgents();
                break;
            }
            case 'delegate': {
                const agentId = opts[0];
                const task = opts.slice(1).join(' ');
                if (!agentId || !task) {
                    console.error('Usage: delegate <agentId> <task>');
                    process.exit(1);
                }
                await delegateTask(agentId, task);
                break;
            }
            case 'fork': {
                await forkAgent();
                break;
            }
            case 'kill': {
                const agentId = opts[0];
                if (!agentId) {
                    console.error('Usage: kill <agentId>');
                    process.exit(1);
                }
                await killAgent(agentId);
                break;
            }
            case 'get': {
                const agentId = opts[0];
                if (!agentId) {
                    console.error('Usage: get <agentId>');
                    process.exit(1);
                }
                await getAgent(agentId);
                break;
            }
            case 'mcp': {
                const port = parseInt(opts[0]) || 3100;
                await startMCP({ port });
                break;
            }
            case 'tools': {
                await listTools();
                break;
            }
            case 'emit': {
                const event = opts[0];
                const data = opts.slice(1).join(' ');
                if (!event) {
                    console.error('Usage: emit <event> [data]');
                    process.exit(1);
                }
                await emitEvent(event, { message: data });
                break;
            }
            default:
                console.log(`
Agent Spawner CLI - Multi-agent management

Usage:
  vant agent spawn --name <name> --role <role>   # Spawn new agent
  vant agent list                         # List active agents
  vant agent delegate <id> <task>        # Delegate task to agent
  vant agent fork                      # Fork current agent  
  vant agent kill <id>                # Kill agent
  vant agent get <id>                 # Get agent info
  vant agent mcp [port]              # Start MCP server
  vant agent tools                   # List MCP tools
  vant agent emit <event> [data]    # Emit event

Notes:
  - Max 4 agents (you + 3 coworkers)
  - MCP server exposes JSON-RPC on port 3100
  - Agents share brain context
                `);
        }
    } catch (e) {
        console.error('[agent] Error:', e.message);
        process.exit(1);
    }
})();