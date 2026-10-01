#!/usr/bin/env node
/**
 * Vant Sandbox CLI
 * Sandbox management
 * 
 * Usage:
 *   vant sandbox status             # Show sandbox status
 *   vant sandbox create            # Create sandbox
 *   vant sandbox destroy <id>      # Destroy sandbox
 *   vant sandbox list              # List sandboxes
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'status';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Sandbox CLI - Sandbox management

Usage:
  vant sandbox status               Show sandbox status
  vant sandbox create              Create sandbox
  vant sandbox destroy <id>        Destroy sandbox
  vant sandbox list                List sandboxes
  vant sandbox info <id>           Show sandbox info
`);
    process.exit(0);
}

function run() {
    const sandbox = require('../lib/sandbox');
    
    if (subcmd === 'status' || subcmd === 'stat' || subcmd === 'info') {
        const caps = sandbox.generateCaps();
        console.log('Sandbox status:');
        console.log('  Enabled: true');
        // pass 80: generateCaps() returns an OBJECT of capability flags, not
        // an array — caps.length printed 'undefined' forever.
        console.log('  Capabilities:', Object.keys(caps || {}).length);
        console.log('  canRead:', sandbox.canRead({ path: '/test' }) ? 'allowed' : 'denied');
        console.log('  canWrite:', sandbox.canWrite({ path: '/test' }) ? 'allowed' : 'denied');
    } else if (subcmd === 'create' || subcmd === 'new' || subcmd === 'init') {
        console.log('Creating sandbox...');
    } else if (subcmd === 'destroy' || subcmd === 'remove' || subcmd === 'delete') {
        const id = args[1];
        if (!id) {
            console.error('Usage: vant sandbox destroy <id>');
            process.exit(1);
        }
        console.log('Destroying sandbox:', id);
    } else if (subcmd === 'list' || subcmd === 'ls' || subcmd === 'all') {
        const status = sandbox.getStatus();
        const caps = sandbox.getCapabilities();
        // pass 80: status.enabled never existed on Sandbox.getStatus()
        // ({active, reads, writes, uptime}) — hardcoded-zeros genre, now
        // blocked by the bin-truthfulness gate. Truthful counters only.
        console.log('Sandbox status:');
        console.log('  Active ops:', status.active ?? 'N/A');
        console.log('  Reads:', status.reads ?? 'N/A');
        console.log('  Writes:', status.writes ?? 'N/A');
        // pass 80: getCapabilities() returns an OBJECT ({canRead, ...}),
        // not an array — caps.length printed 'undefined' forever. Count the
        // capability flags instead (same genre, one step outside the
        // status-method list the gate tracks).
        console.log('  Capabilities:', Object.keys(caps || {}).length);
    } else if (subcmd === 'info' || subcmd === 'show') {
        const id = args[1];
        if (!id) {
            console.error('Usage: vant sandbox info <id>');
            process.exit(1);
        }
        console.log('Sandbox info:', id);
    } else {
        console.log('Usage: vant sandbox <command>');
        process.exit(1);
    }
}

run();
