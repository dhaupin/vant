#!/usr/bin/env node
/**
 * Vant Compute CLI
 * Multi-language code runner
 * 
 * Usage:
 *   vant compute run <lang> <code>   # Run code in language
 *   vant compute eval <lang> <code>  # Eval and return result
 *   vant compute list                 # List available connectors
 *   vant compute status              # Show compute status
 */

const compute = require('../lib/compute');

const args = process.argv.slice(2);
const subcmd = args[0] || 'help';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Compute CLI - Multi-language runner

Usage:
  vant compute run <lang> <code>   Run code in language (python, node, go, etc.)
  vant compute eval <lang> <code>  Eval and return result
  vant compute list                 List available connectors
  vant compute status              Show compute status

Examples:
  vant compute run python "print('hello')"
  vant compute run node "console.log('hello')"
`);
    process.exit(0);
}

async function run() {
    if (subcmd === 'list' || subcmd === 'ls') {
        const connectors = compute.list();
        console.log('Available connectors:', connectors.join(', '));
    } else if (subcmd === 'status') {
        const status = compute.status();
        console.log('Compute status:', JSON.stringify(status, null, 2));
    } else if (subcmd === 'run' || subcmd === 'eval') {
        const lang = args[1];
        const code = args.slice(2).join(' ');
        if (!lang || !code) {
            console.error('Usage: vant compute run <lang> <code>');
            process.exit(1);
        }
        const result = await compute.run(lang, code);
        console.log(result);
    } else {
        console.log('Available: run, eval, list, status');
        process.exit(1);
    }
}

run();
