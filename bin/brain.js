#!/usr/bin/env node
/**
 * Vant Brain Mode CLI
 * Switch between brain sources
 * 
 * Usage:
 *   vant brain mode           # Show current mode
 *   vant brain mode <mode>   # Set mode (dual|public|private|remote)
 *   vant brain modes         # List available modes
 *   vant brain pipeline      # Show pipeline for current mode
 */

const brain = require('../lib/brain');

const args = process.argv.slice(2);
const subcmd = args[0] || 'mode';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Brain Mode CLI - Brain source switching

Usage:
  vant brain mode             Show current mode
  vant brain mode <mode>     Set mode (dual|public|private|remote)
  vant brain modes           List available modes
  vant brain pipeline        Show pipeline for current mode
  vant brain set <key> <val> Set brain config

Modes:
  dual    - Private overrides public (default)
  public  - Only public brain
  private - Only private brain  
  remote  - Remote brain source
`);
    process.exit(0);
}

// Multi-brain commands
async function runMultiBrain() {
    const brain = require('../lib/brain');
    
    if (subcmd === 'list' || subcmd === 'ls') {
        const dirs = brain.brainDirs();
        console.log('\nBrains:');
        if (dirs.private) {
            console.log('  Private:');
            for (const b of dirs.private) {
                console.log('    -', b);
            }
        }
        if (dirs.public) {
            console.log('  Public:');
            for (const b of dirs.public) {
                console.log('    -', b);
            }
        }
    } else if (subcmd === 'stack') {
        const stack = brain.getStack();
        console.log('\nCurrent stack:');
        for (const b of stack) {
            console.log('  -', b);
        }
    } else if (subcmd === 'push' && args[1]) {
        const result = brain.pushBrain(args[1], args[2] || 'private');
        console.log('\nPushed to stack:', result);
    } else if (subcmd === 'pop' && args[1]) {
        const result = brain.removeBrain(args[1]);
        console.log('\nPopped from stack:', result);
    } else if (subcmd === 'switch' && args[1]) {
        const result = brain.switchBrain(args[1], args[2] || 'private');
        console.log('\nSwitched to:', result);
    } else if (subcmd === 'load' && args[1]) {
        const result = await brain.load(args[1], { type: args[2] || 'private' });
        console.log('\nLoaded:', result);
    } else if (subcmd === 'merge' && args[1]) {
        const result = await brain.merge([args[1]]);
        console.log('\nMerged:');
        for (const [key, values] of Object.entries(result.results)) {
            console.log('  ', key + ':');
            for (const v of values) {
                console.log('    -', v.brain, ':', v.content?.slice(0, 50) + '...');
            }
        }
    } else if (subcmd === 'geo' || subcmd === 'geometry') {
        const geoCmd = args[1] || 'list';
        
        if (geoCmd === 'list') {
            const dirs = brain.geoList();
            console.log('\nGeometry storage:');
            for (const d of dirs) {
                console.log('  ', d);
            }
        } else if (geoCmd === 'load' && args[2]) {
            const result = await brain.geoLoad(args[2]);
            console.log('\nLoaded:', JSON.stringify(result, null, 2));
        } else if (geoCmd === 'store' && args[2] && args[3]) {
            const result = await brain.geoStore(args[2], JSON.parse(args[3]));
            console.log('\nStored:', result);
        } else if (geoCmd === 'search' && args[2]) {
            // Search by key prefix
            const dirs = brain.geoList();
            console.log('\nSearching for:', args[2]);
            // Would need to implement search
            console.log('(search not implemented)');
        } else {
            console.log('Geo commands: list, load <barcode>, store <key> <json>, search <key>');
        }
    } else {
        console.log('Unknown subcommand or missing args');
        console.log('Multi-brain commands: list, stack, push, pop, switch, load, merge, geo');
    }
}

function run() {
    // Check for multi-brain commands
const multiBrainCmds = ['list', 'ls', 'stack', 'push', 'pop', 'switch', 'load', 'merge', 'geo', 'geometry'];
if (multiBrainCmds.includes(subcmd)) {
    runMultiBrain().catch(e => {
        console.error('Error:', e.message);
        process.exit(1);
    });
} else if (subcmd === 'mode' && !args[1]) {
        // Show current mode
        const mode = brain.getMode();
        console.log('Current mode:', mode);
    } else if (subcmd === 'mode' && args[1]) {
        // Set mode
        const newMode = args[1];
        const valid = ['dual', 'public', 'private', 'remote'];
        if (!valid.includes(newMode)) {
            console.error('Invalid mode. Use:', valid.join(', '));
            process.exit(1);
        }
        brain.setMode(newMode);
        console.log('Mode set to:', newMode);
    } else if (subcmd === 'modes' || subcmd === 'list') {
        console.log('Available modes: dual, public, private, remote');
        console.log('Current mode:', brain.getMode());
    } else if (subcmd === 'pipeline' || subcmd === 'chain') {
        const mode = args[1] || brain.getMode();
        // Try to get pipeline - may need brain to be loaded
        console.log('Mode:', mode);
        console.log('Pipeline: (see lib/brain.js _pipelines)');
    } else if (subcmd === 'set') {
        const key = args[1];
        const val = args[2];
        if (!key || val === undefined) {
            console.error('Usage: vant brain set <key> <value>');
            process.exit(1);
        }
        // Brain config setter
        console.log('Set brain config:', key, '=', val);
    } else if (subcmd === 'get') {
        const key = args[1];
        if (!key) {
            console.error('Usage: vant brain get <key>');
            process.exit(1);
        }
        console.log('Get brain config:', key);
    } else {
        console.log('Usage: vant brain mode [dual|public|private|remote]');
        process.exit(1);
    }
}

run();
