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

function run() {
    if (subcmd === 'mode' && !args[1]) {
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
