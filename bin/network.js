#!/usr/bin/env node
/**
 * Vant Network CLI
 * Network operations
 * 
 * Usage:
 *   vant network status           # Show network status
 *   vant network peers            # List connected peers
 *   vant network connect <host>   # Connect to peer
 *   vant network disconnect <peer> # Disconnect peer
 *   vant network ping <host>     # Ping host
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'status';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Network CLI - Network operations

Usage:
  vant network status             Show network status
  vant network peers              List connected peers
  vant network connect <host>    Connect to peer
  vant network disconnect <peer>  Disconnect peer
  vant network ping <host>       Ping host
  vant network info              Show network info
`);
    process.exit(0);
}

function run() {
    const network = require('../lib/network');
    
    if (subcmd === 'status' || subcmd === 'info' || subcmd === 'stat') {
        console.log('Network status:');
        console.log('  Status: connected');
        console.log('  (use network.status() for actual status)');
    } else if (subcmd === 'peers' || subcmd === 'nodes' || subcmd === 'connections') {
        console.log('Connected peers: (use network.peers() for list)');
    } else if (subcmd === 'connect' || subcmd === 'join') {
        const host = args[1];
        if (!host) {
            console.error('Usage: vant network connect <host>');
            process.exit(1);
        }
        console.log('Connecting to:', host);
    } else if (subcmd === 'disconnect' || subcmd === 'leave') {
        const peer = args[1];
        if (!peer) {
            console.error('Usage: vant network disconnect <peer>');
            process.exit(1);
        }
        console.log('Disconnecting:', peer);
    } else if (subcmd === 'ping' || subcmd === 'check') {
        const host = args[1];
        if (!host) {
            console.error('Usage: vant network ping <host>');
            process.exit(1);
        }
        console.log('Pinging:', host);
    } else {
        console.log('Usage: vant network <command>');
        process.exit(1);
    }
}

run();
