#!/usr/bin/env node
/**
 * Vant Memory - Memory operations
 * 
 * Usage:
 *   vant memory set <key> <value>    # Set memory
 *   vant memory get <key>             # Get memory
 *   vant memory list                  # List memories
 *   vant memory clear                 # Clear memories
 */

const path = require('path');

const args = process.argv.slice(2);
const action = args[0];

// Show help
if (args.includes('--help') || args.includes('-h') || !action) {
    console.log(`
Vant Memory - In-memory storage

USAGE:
  vant memory set <key> <value>    # Set memory
  vant memory get <key>             # Get memory
  vant memory list                  # List memories
  vant memory clear                 # Clear all
  vant memory delete <key>          # Delete key
  vant memory stats                 # Show stats

EXAMPLES:
  vant memory set session-id abc123
  vant memory get session-id
  vant memory list
  vant memory delete session-id
`);
    process.exit(0);
}

const ROOT = path.resolve(__dirname, '..');

// Lazy-load memory module
let memory = null;
function getMemory() {
    if (!memory) {
        try { memory = require('../lib/memory'); } catch(e) {}
    }
    return memory;
}

async function main() {
    const mod = getMemory();
    
    switch (action) {
        case 'set':
            const key = args[1];
            const value = args.slice(2).join(' ');
            if (!key) {
                console.error('Usage: vant memory set <key> <value>');
                process.exit(1);
            }
            console.log('Setting:', key);
            if (mod && mod.set) {
                await mod.set(key, value);
            }
            console.log('Set:', key, '=', value);
            break;
            
        case 'get':
            const getKey = args[1];
            if (!getKey) {
                console.error('Usage: vant memory get <key>');
                process.exit(1);
            }
            console.log('Getting:', getKey);
            if (mod && mod.get) {
                const value = await mod.get(getKey);
                console.log(value);
            }
            break;
            
        case 'list':
        case 'ls':
            console.log('Memories:');
            if (mod && mod.keys) {
                const keys = await mod.keys();
                keys.forEach(k => console.log(' -', k));
            }
            break;
            
        case 'delete':
        case 'del':
            const delKey = args[1];
            if (!delKey) {
                console.error('Usage: vant memory delete <key>');
                process.exit(1);
            }
            console.log('Deleting:', delKey);
            if (mod && mod.delete) {
                await mod.delete(delKey);
            }
            break;
            
        case 'clear':
            console.log('Clearing all memories...');
            if (mod && mod.clear) {
                await mod.clear();
            }
            console.log('Cleared');
            break;
            
        case 'stats':
            console.log('Memory Stats:');
            if (mod && mod.stats) {
                const stats = await mod.stats();
                console.log(JSON.stringify(stats, null, 2));
            } else {
                console.log('Memory operational');
            }
            break;
            
        default:
            console.log('Unknown action:', action);
            console.log('Run: vant memory --help');
    }
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
