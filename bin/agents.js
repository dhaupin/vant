#!/usr/bin/env node
/**
 * Vant Agents CLI
 * Agent management
 * 
 * Usage:
 *   vant agents list               # List agents
 *   vant agents spawn <name>        # Spawn agent
 *   vant agents kill <id>           # Kill agent
 *   vant agents status             # Show status
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'list';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Agents CLI - Agent management

Usage:
  vant agents list                   List agents
  vant agents spawn <name>          Spawn new agent
  vant agents kill <id>             Kill agent
  vant agents status                Show agent status
  vant agents info <id>             Show agent info
`);
    process.exit(0);
}

function run() {
    const agents = require('../lib/agents');
    
    if (subcmd === 'list' || subcmd === 'ls' || subcmd === 'all') {
        console.log('Agents: (use agents.list() for actual list)');
    } else if (subcmd === 'spawn' || subcmd === 'create' || subcmd === 'new') {
        const name = args[1];
        if (!name) {
            console.error('Usage: vant agents spawn <name>');
            process.exit(1);
        }
        console.log('Spawning agent:', name);
    } else if (subcmd === 'kill' || subcmd === 'stop' || subcmd === 'terminate') {
        const id = args[1];
        if (!id) {
            console.error('Usage: vant agents kill <id>');
            process.exit(1);
        }
        console.log('Killing agent:', id);
    } else if (subcmd === 'status' || subcmd === 'stat' || subcmd === 'info') {
        console.log('Agent status: (use agents.status() to get)');
    } else if (subcmd === 'info' || subcmd === 'show') {
        const id = args[1];
        if (!id) {
            console.error('Usage: vant agents info <id>');
            process.exit(1);
        }
        console.log('Agent info:', id);
    } else {
        console.log('Usage: vant agents <command>');
        process.exit(1);
    }
}

run();
