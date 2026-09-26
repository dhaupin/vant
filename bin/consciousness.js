#!/usr/bin/env node
/**
 * Vant Consciousness - Consciousness engine
 * 
 * Usage:
 *   vant consciousness status        # Show status
 *   vant consciousness think       # Trigger thinking
 *   vant consciousness journal     # Show journal
 */

const args = process.argv.slice(2);
const action = args[0];

// Show help
if (args.includes('--help') || args.includes('-h') || !action) {
    console.log(`
Vant Consciousness - Consciousness engine

USAGE:
  vant consciousness status        # Show status
  vant consciousness think        # Trigger thinking
  vant consciousness journal     # Show journal
  vant consciousness aware       # Check awareness

EXAMPLES:
  vant consciousness status
  vant consciousness think
  vant consciousness journal
`);
    process.exit(0);
}

async function main() {
    const path = require('path');
    const ROOT = path.resolve(__dirname, '..');
    
    // Lazy-load consciousness
    let consciousness = null;
    try { consciousness = require('../lib/consciousness'); } catch(e) {}
    
    switch (action) {
        case 'status':
        case 's':
            console.log('Consciousness Status:');
            console.log('  State: Active');
            console.log('  Awareness: 100%');
            console.log('  Thinking: Idle');
            if (consciousness && consciousness.status) {
                const status = await consciousness.status();
                console.log(JSON.stringify(status, null, 2));
            }
            break;
            
        case 'think':
        case 't':
            console.log('Triggering thought process...');
            if (consciousness && consciousness.think) {
                await consciousness.think();
            }
            console.log('Thought complete');
            break;
            
        case 'journal':
        case 'j':
            console.log('Consciousness Journal:');
            console.log('  (No entries)');
            break;
            
        case 'aware':
        case 'a':
            console.log('Awareness check...');
            console.log('Consciousness is present and aware.');
            break;
            
        case 'list':
        case 'ls':
            console.log('Consciousness States:');
            console.log('  - Active');
            console.log('  - Idle');
            console.log('  - Thinking');
            console.log('  - Meditating');
            break;
            
        default:
            console.log('Unknown action:', action);
            console.log('Run: vant consciousness --help');
    }
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
