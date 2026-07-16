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

async function run() {
    const qos = require('../lib/qos');
    
    if (subcmd === 'status' || subcmd === 'stat' || subcmd === 'info') {
        const status = await qos.getStatus();
        console.log('QoS status:');
        console.log('  Active:', status.active || 0);
        console.log('  Max concurrent:', status.maxConcurrent || 'N/A');
        console.log('  Circuit open:', status.circuitOpen || false);
    } else if (subcmd === 'limits' || subcmd === 'limits') {
        console.log('Rate limits:');
        console.log('  Max concurrent:', qos.MAX_CONCURRENT || 'N/A');
        console.log('  Max input size:', qos.MAX_INPUT_SIZE || 'N/A');
        console.log('  Default timeout:', qos.DEFAULT_TIMEOUT_MS || 'N/A');
    } else if (subcmd === 'stats' || subcmd === 'statistics' || subcmd === 'metrics') {
        const status = await qos.getStatus();
        console.log('QoS statistics:');
        console.log('  Active count:', qos.getActiveCount());
        console.log('  Failure count:', qos.getFailureCount());
        console.log('  Circuit status:', qos.getCircuitStatus());
    } else if (subcmd === 'reset' || subcmd === 'clear') {
        qos.resetCircuit();
        console.log('QoS counters reset');
    } else {
        console.log('Usage: vant qos <command>');
        process.exit(1);
    }
}

run().catch(console.error);
