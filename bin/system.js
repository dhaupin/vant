#!/usr/bin/env node
/**
 * Vant System CLI
 * System diagnostics and layer status
 * 
 * Usage:
 *   vant system status              # Show system status
 *   vant system healthy             # Check if system is healthy
 *   vant system layers              # Show layer status
 *   vant system allow <op>          # Check if operation allowed
 */

const system = require('../lib/system');

const args = process.argv.slice(2);
const subcmd = args[0] || 'status';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant System CLI - System diagnostics

Usage:
  vant system status              Show system status
  vant system healthy            Check if system is healthy
  vant system layers              Show layer status
  vant system allow <op>         Check if operation allowed
`);
    process.exit(0);
}

function run() {
    if (subcmd === 'status' || subcmd === 'stats') {
        const status = system.status();
        console.log(JSON.stringify(status, null, 2));
    } else if (subcmd === 'healthy' || subcmd === 'health') {
        const healthy = system.healthy();
        console.log(healthy ? '✓ System healthy' : '✗ System unhealthy');
    } else if (subcmd === 'layers') {
        const layers = system.getLayerStatus();
        console.log(JSON.stringify(layers, null, 2));
    } else if (subcmd === 'allow' || subcmd === 'allowed') {
        const op = args[1];
        if (!op) {
            console.error('Usage: vant system allow <operation>');
            process.exit(1);
        }
        // (round-9 audit, R9-2) isOperationAllowed returns a VERDICT OBJECT
        // ({ allowed, ... }), never a boolean. The old `allowed ? 'ALLOWED'`
        // truthy-tested the object — always true — so every word, including
        // a typo, printed ALLOWED. Read the field and set the exit code the
        // way bin/rls.js already does.
        const verdict = system.isOperationAllowed(op);
        const allowed = !!(verdict && verdict.allowed === true);
        console.log(allowed ? 'ALLOWED' : 'DENIED');
        if (!allowed) process.exit(1);
    } else {
        console.log('Available: status, healthy, layers, allow');
        process.exit(1);
    }
}

run();
