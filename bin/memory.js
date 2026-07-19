#!/usr/bin/env node
/**
 * Vant Memory - Memory operations
 * 
 * Usage:
 *   vant memory add <topic> <content>   # Add learning
  vant memory set <key> <value>      # Set memory
 *   vant memory get <key>              # Get memory
  vant memory query <topic>          # Query learning
 *   vant memory list                  # List memories
 *   vant memory clear                 # Clear memories
 */

const path = require('path');

const args = process.argv.slice(2);
const action = args[0];

// Show help
if (args.includes('--help') || args.includes('-h') || !action) {
    console.log(`
Vant Memory - Unified memory & learning system

USAGE:
  vant memory add <topic> <content>   # Add learning
  vant memory set <key> <value>      # Set memory
  vant memory get <key>              # Get memory
  vant memory query <topic>          # Query learning
  vant memory list                  # List memories
  vant memory clear                 # Clear all
  vant memory delete <key>            # Delete key
  vant memory forget <topic>        # Remove learning
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
let memoryInstance = null;
function getMemory() {
    if (!memory) {
        try { 
            memory = require('../lib/memory');
            if (memory.MemorySystem) {
                memoryInstance = new memory.MemorySystem();
            }
        } catch(e) {}
    }
    return memoryInstance;
}

async function main() {
    const mod = getMemory();
    
    switch (action) {
        // Add learning (alias for set)
        case 'add':
        case 'set':
            const key = args[1];
            const value = args.slice(2).join(' ');
            if (!key) {
                console.error('Usage: vant memory add <topic> <content>');
                process.exit(1);
            }
            console.log('Adding:', key);
            if (mod && mod.remember) {
                const result = await mod.remember(key, value);
                console.log('Added:', key, '(total:', result.total + ')');
            } else {
                console.log('Memory module not available');
            }
            break;
            
        // Get memory (alias for query)
        case 'get':
        case 'query':
            const getKey = args[1];
            if (!getKey) {
                console.error('Usage: vant memory get <key>');
                process.exit(1);
            }
            console.log('Getting:', getKey);
            if (mod && mod.find) {
                const results = await mod.find(getKey);
                if (results && results.length) {
                    results.forEach(r => console.log(r.data || r));
                } else {
                    console.log('Not found');
                }
            }
            break;
            
        case 'list':
        case 'ls':
            console.log('Memories:');
            if (mod && mod.experiences) {
                const exps = mod.experiences || [];
                if (exps.length) {
                    exps.forEach(e => console.log(' -', e.type));
                } else {
                    console.log(' (No memories)');
                }
            } else {
                console.log(' (No memories)');
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
            if (mod && mod.patterns && mod.patterns.delete) {
                mod.patterns.delete(delKey);
                console.log('Deleted');
            }
            break;
            
        case 'clear':
            console.log('Clearing all memories...');
            if (mod) {
                mod.experiences = [];
                mod.patterns = new Map();
            }
            console.log('Cleared');
            break;
            
        case 'stats':
            console.log('Memory Stats:');
            if (mod) {
                console.log('Total memories:', mod.experiences ? mod.experiences.length : 0);
                console.log('Max capacity:', mod.maxExperiences || 1000);
            } else {
                console.log('Memory module not available');
            }
            break;
            
        // Forget learning (alias for delete)
        case 'forget':
            const forgetKey = args[1];
            if (!forgetKey) {
                console.error('Usage: vant memory forget <topic>');
                process.exit(1);
            }
            console.log('Forgetting:', forgetKey);
            if (mod && mod.patterns && mod.patterns.delete) {
                mod.patterns.delete(forgetKey);
                console.log('Forgotten');
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
