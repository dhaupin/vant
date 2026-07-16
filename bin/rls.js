#!/usr/bin/env node
/**
 * Vant RLS CLI
 * Row-level security context manager
 * 
 * Usage:
 *   vant rls init                    # Initialize RLS
 *   vant rls workspace <name>       # Set workspace context
 *   vant rls get-workspace          # Get current workspace
 *   vant rls context                # Show full security context
 *   vant rls allow <op> <resource> # Check if operation allowed
 */

const rls = require('../lib/rls');

const args = process.argv.slice(2);
const subcmd = args[0] || 'context';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant RLS CLI - Row-level security context

Usage:
  vant rls init                    Initialize RLS
  vant rls workspace <name>       Set workspace context
  vant rls get-workspace          Get current workspace
  vant rls context                Show full security context
  vant rls allow <op> <resource> Check if operation allowed
  vant rls habitats              List available habitats
`);
    process.exit(0);
}

function run() {
    if (subcmd === 'init') {
        rls.init();
        console.log('RLS initialized');
    } else if (subcmd === 'workspace') {
        const name = args[1];
        if (!name) {
            console.error('Usage: vant rls workspace <name>');
            process.exit(1);
        }
        rls.setWorkspace(name);
        console.log('Workspace set:', name);
    } else if (subcmd === 'get-workspace' || subcmd === 'workspace') {
        const ws = rls.getWorkspace();
        console.log('Current workspace:', ws);
    } else if (subcmd === 'context') {
        const ctx = rls.context();
        console.log(JSON.stringify(ctx, null, 2));
    } else if (subcmd === 'allow') {
        const op = args[1];
        const resource = args[2];
        if (!op || !resource) {
            console.error('Usage: vant rls allow <op> <resource>');
            process.exit(1);
        }
        const allowed = rls.isOperationAllowed(op, resource);
        console.log(allowed ? 'ALLOWED' : 'DENIED');
    } else if (subcmd === 'habitats' || subcmd === 'habitat') {
        const habitat = rls.getHabitat();
        console.log(JSON.stringify(habitat, null, 2));
    } else {
        console.log('Available: init, workspace, context, allow, habitats');
        process.exit(1);
    }
}

run();
