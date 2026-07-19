#!/usr/bin/env node
/**
 * Vant Registry - General registry
 * 
 * Usage:
 *   vant registry set <key> <value>   # Set registry value
 *   vant registry get <key>            # Get registry value
 *   vant registry list                 # List registry
 *   vant registry delete <key>        # Delete key
 */

const path = require('path');

const args = process.argv.slice(2);
const action = args[0];

// Show help
if (args.includes('--help') || args.includes('-h') || !action) {
    console.log(`
Vant Registry - General registry

USAGE:
  vant registry set <key> <value>   # Set value
  vant registry get <key>            # Get value
  vant registry list                 # List all
  vant registry delete <key>        # Delete key
  vant registry clear                # Clear all

EXAMPLES:
  vant registry set theme dark
  vant registry get theme
  vant registry list
  vant registry delete theme
`);
    process.exit(0);
}

const ROOT = path.resolve(__dirname, '..');

// Lazy-load registry module
let registry = null;
function getRegistry() {
    if (!registry) {
        try { registry = require('../lib/registry'); } catch(e) {}
    }
    return registry;
}

async function main() {
    const mod = getRegistry();
    
    switch (action) {
        case 'set':
            const key = args[1];
            const value = args.slice(2).join(' ');
            if (!key) {
                console.error('Usage: vant registry set <key> <value>');
                process.exit(1);
            }
            console.log('Setting:', key);
            if (mod && mod.register) {
                await mod.register(key, value);
            }
            console.log('Set:', key);
            break;
            
        case 'get':
            const getKey = args[1];
            if (!getKey) {
                console.error('Usage: vant registry get <key>');
                process.exit(1);
            }
            console.log('Getting:', getKey);
            if (mod && mod.get) {
                const value = await mod.get(getKey);
                console.log(value || '(empty)');
            }
            break;
            
        case 'list':
        case 'ls':
            console.log('Registry:');
            if (mod && mod.list) {
                const items = await mod.list();
                if (items && items.length) {
                    items.forEach(item => {
                        console.log(' -', item.key || item, '=', item.value);
                    });
                } else {
                    console.log(' (Empty)');
                }
            }
            break;
            
        case 'delete':
        case 'del':
            const delKey = args[1];
            if (!delKey) {
                console.error('Usage: vant registry delete <key>');
                process.exit(1);
            }
            console.log('Deleting:', delKey);
            if (mod && mod.remove) {
                await mod.remove(delKey);
            }
            console.log('Deleted');
            break;
            
        case 'clear':
            console.log('Clearing registry...');
            if (mod && mod.clear) {
                await mod.clear();
            }
            console.log('Cleared');
            break;
            
        case 'stats':
            console.log('Registry Stats:');
            if (mod && mod.count) {
                const count = await mod.count();
                console.log('Total entries:', count);
            }
            if (mod && mod.summary) {
                const summary = await mod.summary();
                console.log(JSON.stringify(summary, null, 2));
            }
            break;
            
        default:
            console.log('Unknown action:', action);
            console.log('Run: vant registry --help');
    }
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
