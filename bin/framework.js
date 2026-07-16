#!/usr/bin/env node
/**
 * Vant Framework CLI
 * Framework utilities
 * 
 * Usage:
 *   vant framework info             # Show framework info
 *   vant framework version         # Show version
 *   vant framework plugins         # List plugins
 *   vant framework load <plugin>  # Load plugin
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'info';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Framework CLI - Framework utilities

Usage:
  vant framework info               Show framework info
  vant framework version            Show framework version
  vant framework plugins           List loaded plugins
  vant framework load <plugin>     Load a plugin
  vant framework unload <plugin>   Unload plugin
`);
    process.exit(0);
}

function run() {
    const framework = require('../lib/framework');
    
    if (subcmd === 'info' || subcmd === 'status') {
        console.log('Vant Framework');
        console.log('  (use framework.info() for actual info)');
    } else if (subcmd === 'version' || subcmd === 'ver') {
        console.log('Framework version: (use framework.version() to get)');
    } else if (subcmd === 'plugins' || subcmd === 'list' || subcmd === 'ls') {
        console.log('Loaded plugins: (use framework.plugins() to list)');
    } else if (subcmd === 'load' || subcmd === 'add') {
        const plugin = args[1];
        if (!plugin) {
            console.error('Usage: vant framework load <plugin>');
            process.exit(1);
        }
        console.log('Loading plugin:', plugin);
    } else if (subcmd === 'unload' || subcmd === 'remove') {
        const plugin = args[1];
        if (!plugin) {
            console.error('Usage: vant framework unload <plugin>');
            process.exit(1);
        }
        console.log('Unloading plugin:', plugin);
    } else {
        console.log('Usage: vant framework <command>');
        process.exit(1);
    }
}

run();
