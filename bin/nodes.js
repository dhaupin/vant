#!/usr/bin/env node
/**
 * Vant Nodes CLI
 * Peer discovery and node registry
 * 
 * Usage:
 *   vant nodes list              # List known nodes
 *   vant nodes discover         # Discover new nodes
 *   vant nodes ping <node>     # Ping a node
 *   vant nodes info <node>      # Get node info
 *   vant nodes register         # Register this node
 *   vant nodes status           # Show node status
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'list';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Nodes CLI - Peer discovery and registry

Usage:
  vant nodes list              List known nodes
  vant nodes discover         Discover new peers
  vant nodes ping <node>      Ping a node
  vant nodes info <node>      Get node details
  vant nodes register         Register this node
  vant nodes status           Show local node status
  vant nodes metrics          Show node metrics
`);
    process.exit(0);
}

async function run() {
    try {
        const registry = require('../lib/node-registry');
        
        if (subcmd === 'list' || subcmd === 'ls' || subcmd === 'peers') {
            const peers = await registry.discover();
            console.log('Known nodes:', peers.length || 0);
            if (peers && peers.length) {
                peers.forEach(p => console.log(' -', p));
            }
        } else if (subcmd === 'discover' || subcmd === 'scan') {
            console.log('Discovering nodes...');
        } else if (subcmd === 'ping' || subcmd === 'check') {
            const node = args[1];
            if (!node) {
                console.error('Usage: vant nodes ping <node>');
                process.exit(1);
            }
            console.log('Pinging:', node);
        } else if (subcmd === 'info' || subcmd === 'status') {
            const node = args[1];
            if (!node) {
                console.error('Usage: vant nodes info <node>');
                process.exit(1);
            }
            console.log('Node info:', node);
        } else if (subcmd === 'register' || subcmd === 'add') {
            console.log('Registering node...');
        } else if (subcmd === 'metrics' || subcmd === 'stats') {
            console.log('Node metrics:');
            console.log('  (use registry.metrics() for actual stats)');
        } else {
            console.log('Usage: vant nodes <command>');
            process.exit(1);
        }
    } catch (e) {
        console.error('Error:', e.message);
        process.exit(1);
    }
}

run();
