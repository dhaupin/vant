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
            if (mod && mod.set) {
                await mod.set(key, value);
            }
            console.log('Set:', key, '=', value);
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
                console.log(value);
            }
            break;
            
        case 'list':
        case 'ls':
            console.log('Registry:');
            if (mod && mod.keys) {
                const keys = await mod.keys();
                keys.forEach(async k => {
                    const v = await mod.get(k);
                    console.log(' -', k, '=', v);
                });
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
            if (mod && mod.delete) {
                await mod.delete(delKey);
            }
            break;
            
        case 'clear':
            console.log('Clearing registry...');
            if (mod && mod.clear) {
                await mod.clear();
            }
            console.log('Cleared');
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
