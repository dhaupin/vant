#!/usr/bin/env node
// resolution.js - CLI for thought resolution

const path = require('path');
const resolution = require('../lib/resolution');

const args = process.argv.slice(2);
const cmd = args[0];

function printStatus() {
    const ledger = resolution.getLedger();
    console.log('=== Thought Resolution ===\n');
    
    const active = ledger.resolutions.filter(r => r.status === 'active');
    const resolved = ledger.resolutions.filter(r => r.status === 'resolved');
    const deprecated = ledger.resolutions.filter(r => r.status === 'deprecated');
    const rejected = ledger.resolutions.filter(r => r.status === 'rejected');
    
    console.log('Active: ' + active.length);
    console.log('Resolved: ' + resolved.length);
    console.log('Deprecated: ' + deprecated.length);
    console.log('Rejected: ' + rejected.length);
    console.log('');
    
    console.log('Recent Deltas: ' + (ledger.deltas || []).length);
}

function printList(status, file) {
    const list = resolution.list(status, file);
    if (!list.length) {
        console.log('No resolutions found.');
        return;
    }
    
    console.log('Resolutions (' + list.length + '):\n');
    list.forEach(r => {
        console.log(r.status.toUpperCase() + ' ' + r.file + ':' + r.entry);
        console.log('  By: ' + r.resolved_by + ' | ' + r.resolved_at);
        console.log('  Reason: ' + r.reason + '\n');
    });
}

function printDeltas(file, limit) {
    const deltas = resolution.getDeltas(file, limit);
    if (!deltas.length) {
        console.log('No deltas found.');
        return;
    }
    
    console.log('Deltas for ' + file + ' (' + deltas.length + '):\n');
    deltas.forEach(d => {
        console.log(d.changed_at.slice(0, 10) + ' ' + d.change);
        console.log('  By: ' + d.changed_by + '\n');
    });
}

if (cmd === 'status' || !cmd) {
    printStatus();
} else if (cmd === 'list') {
    const status = args[1];
    const file = args[2];
    printList(status, file);
} else if (cmd === 'deltas') {
    const file = args[1] || 'all';
    const limit = parseInt(args[2]) || 10;
    if (file === 'all') {
        console.log('Specify a file: vant resolution deltas <file>');
    } else {
        printDeltas(file, limit);
    }
} else if (cmd === 'resolve' || cmd === 'deprecate' || cmd === 'reject') {
    const file = args[1];
    const entry = args[2];
    const reason = args.slice(3).join(' ') || 'No reason provided';
    
    if (!file || !entry) {
        console.log('Usage: vant resolution ' + cmd + ' <file> <entry> <reason>');
        console.log('Example: vant resolution resolve fears "fear of failure" overcame通過 therapy');
        process.exit(1);
    }
    
    const options = {
        resolved_by: process.env.VANT_AGENT_ID || 'unknown',
        branch: process.env.VANT_BRANCH || 'main'
    };
    
    let result;
    if (cmd === 'resolve') {
        result = resolution.resolve(file, entry, reason, options);
    } else if (cmd === 'deprecate') {
        result = resolution.deprecate(file, entry, reason, options);
    } else {
        result = resolution.reject(file, entry, reason, options);
    }
    
    console.log('Marked ' + file + ':' + entry + ' as ' + cmd.toUpperCase());
    console.log('Reason: ' + reason);
    console.log('At: ' + result.resolved_at);
} else if (cmd === 'is-active') {
    const file = args[1];
    const entry = args[2];
    if (!file || !entry) {
        console.log('Usage: vant resolution is-active <file> <entry>');
        process.exit(1);
    }
    const active = resolution.isActive(file, entry);
    console.log(file + ':' + entry + ' is ' + (active ? 'ACTIVE' : 'RESOLVED/DEPRECATED/REJECTED'));
} else if (cmd === 'help') {
    console.log(`
Vant Thought Resolution

Mark thoughts as resolved, deprecated, or rejected.
Tracks changes with deltas.

Commands:
  vant resolution status                Show resolution summary
  vant resolution list [status] [file]  List resolutions
  vant resolution deltas <file> [N]      Show file deltas
  vant resolution resolve <f> <e> <r>  Mark as resolved
  vant resolution deprecate <f> <e> <r> Mark as deprecated
  vant resolution reject <f> <e> <r>  Mark as rejected
  vant resolution is-active <f> <e>   Check if still active
  vant resolution help                Show this help

Status Values:
  resolved   - Solved, case closed
  deprecated - Outdated, no longer valid
  rejected   - Explicitly rejected (ethics, etc)

Examples:
  vant resolution status
  vant resolution list resolved
  vant resolution resolve fears "fear of rejection" overcame via therapy
  vant resolution deprecate goals "old goal" superseded by new approach
  vant resolution deltas identity 5
`);
} else {
    console.log('Unknown command. Use: vant resolution help');
    process.exit(1);
}
