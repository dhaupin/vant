#!/usr/bin/env node
/**
 * Vant QoS CLI
 * Quality of Service management
 * 
 * Usage:
 *   vant qos status                # Show QoS status
 *   vant qos limits               # Show rate limits
 *   vant qos stats                # Show statistics
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'status';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant QoS CLI - Quality of Service management

Usage:
  vant qos status                   Show QoS status
  vant qos limits                   Show rate limits
  vant qos stats                    Show QoS statistics
  vant qos reset                    Reset counters
`);
    process.exit(0);
}

function run() {
    const qos = require('../lib/qos');
    
    if (subcmd === 'status' || subcmd === 'stat' || subcmd === 'info') {
        console.log('QoS status:');
        console.log('  (use qos.status() for actual status)');
    } else if (subcmd === 'limits' || subcmd === 'limits') {
        console.log('Rate limits: (use qos.limits() to get)');
    } else if (subcmd === 'stats' || subcmd === 'statistics' || subcmd === 'metrics') {
        console.log('QoS statistics: (use qos.stats() to get)');
    } else if (subcmd === 'reset' || subcmd === 'clear') {
        console.log('Resetting QoS counters...');
    } else {
        console.log('Usage: vant qos <command>');
        process.exit(1);
    }
}

run();
