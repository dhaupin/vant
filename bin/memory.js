#!/usr/bin/env node
/**
 * Vant Memory - CLI operations
 * Unified memory API with sandbox + RLS security
 *
 * Usage:
 *   vant memory state <key> <value>   # Store state
 *   vant memory recall <key>          # Get state
 *   vant memory learn <key> <content> # Learn document
 *   vant memory query <key>           # Query document
 *   vant memory address <data>        # Store at geometric address
 *   vant memory locate <barcode>      # Locate by barcode
 *   vant memory list                  # Show stats
 *   vant memory clear                 # Clear all
 */

const path = require('path');
const args = process.argv.slice(2);
const action = args[0];

// Show help
if (args.includes('--help') || args.includes('-h') || !action) {
    console.log(`
Vant Memory - Unified memory CLI

USAGE:
  vant memory state <key> <value>   Store state (key-value, TTL cache)
  vant memory recall <key>          Get state
  vant memory learn <key> <content> Learn document
  vant memory query <key>           Query document
  vant memory address <data>        Store at geometric address (NSC9)
  vant memory locate <barcode>     Locate by barcode (NSC9)
  vant memory list                  Show stats
  vant memory clear                 Clear all

SECURITY:
  All operations are secured via sandbox + RLS

EXAMPLES:
  vant memory state session-id abc123
  vant memory recall session-id
  vant memory learn notes "Remember to call mom"
  vant memory query notes
  vant memory address '{"note": "test"}'
  vant memory locate 1-12345-67890-5
`);
    process.exit(0);
}

const ROOT = path.resolve(__dirname, '..');

// Lazy-load memory module
let _memory = null;
function getMemory() {
    if (!_memory) {
        try {
            _memory = require('../lib/memory');
        } catch(e) {
            console.error('Failed to load memory:', e.message);
        }
    }
    return _memory;
}

async function main() {
    const mem = getMemory();
    if (!mem) {
        console.error('Memory module not available');
        process.exit(1);
    }

    switch (action) {
        // Store state (key-value)
        case 'state':
        case 'set':
            const key = args[1];
            const value = args.slice(2).join(' ');
            if (!key) {
                console.error('Usage: vant memory state <key> <value>');
                process.exit(1);
            }
            await mem.state(key, value);
            console.log('Stored:', key);
            break;

        // Recall state
        case 'recall':
        case 'get':
            const recallKey = args[1];
            if (!recallKey) {
                console.error('Usage: vant memory recall <key>');
                process.exit(1);
            }
            const val = await mem.recall(recallKey);
            console.log(val || '(not found)');
            break;

        // Learn document
        case 'learn':
            const learnKey = args[1];
            const content = args.slice(2).join(' ');
            if (!learnKey) {
                console.error('Usage: vant memory learn <key> <content>');
                process.exit(1);
            }
            await mem.learn(learnKey, content);
            console.log('Learned:', learnKey);
            break;

        // Query document
        case 'query':
            const queryKey = args[1];
            if (!queryKey) {
                console.error('Usage: vant memory query <key>');
                process.exit(1);
            }
            const doc = await mem.query(queryKey);
            console.log(doc || '(not found)');
            break;

        // Store at geometric address
        case 'address':
            const addrData = args.slice(1).join(' ');
            if (!addrData) {
                console.error('Usage: vant memory address <data>');
                process.exit(1);
            }
            let parsed;
            try { parsed = JSON.parse(addrData); } catch(e) { parsed = addrData; }
            const barcode = await mem.address(parsed);
            console.log('Addressed:', barcode);
            break;

        // Locate by barcode
        case 'locate':
            const locBarcode = args[1];
            if (!locBarcode) {
                console.error('Usage: vant memory locate <barcode>');
                process.exit(1);
            }
            const result = await mem.locate(locBarcode);
            console.log(result || '(not found)');
            break;

        case 'list':
        case 'stats':
            console.log(JSON.stringify(mem.getStats(), null, 2));
            break;

        case 'clear':
            mem.clear();
            console.log('Cleared');
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
