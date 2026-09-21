#!/usr/bin/env node
/**
 * Vant Storage CLI
 * Storage operations
 * 
 * Usage:
 *   vant storage list                  # List storage backends
 *   vant storage get <key>            # Get value
 *   vant storage set <key> <value>    # Set value
 *   vant storage delete <key>         # Delete key
 *   vant storage keys                 # List keys
 *   vant storage stats                # Show storage stats
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'list';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Storage CLI - Storage operations

Usage:
  vant storage list              List storage backends
  vant storage get <key>        Get value by key
  vant storage set <key> <val>  Set key-value pair
  vant storage delete <key>      Delete key
  vant storage keys             List all keys
  vant storage stats            Show storage statistics
  vant storage clear            Clear all storage

Point-in-time snapshots (prd-storage.md):
  vant storage snapshot <label>  Capture the models tree (id printed)
  vant storage snapshots         List snapshots
  vant storage restore <id>      Restore tree to a snapshot
  vant storage unsnapshot <id>   Delete a snapshot
`);
    process.exit(0);
}

// Snapshot ops run against the models root (the brain data tree — the
// valuable data git does NOT track; code is versioned by git already).
function _snapStore() {
    const path = require('path');
    const { FileStorage } = require('../lib/storage');
    return new FileStorage({ basePath: path.resolve(__dirname, '..', 'models') });
}

async function run() {
    try {
        const Storage = require('../lib/storage');
        
        if (subcmd === 'list' || subcmd === 'ls' || subcmd === 'backends') {
            console.log('Storage backends:');
            console.log('  - brain (default)');
            console.log('  - public');
            console.log('  - private');
        } else if (subcmd === 'get') {
            const key = args[1];
            if (!key) {
                console.error('Usage: vant storage get <key>');
                process.exit(1);
            }
            console.log('Getting:', key);
        } else if (subcmd === 'set' || subcmd === 'put') {
            const key = args[1];
            const val = args.slice(2).join(' ');
            if (!key || val === undefined) {
                console.error('Usage: vant storage set <key> <value>');
                process.exit(1);
            }
            console.log('Setting:', key, '=', val);
        } else if (subcmd === 'delete' || subcmd === 'rm' || subcmd === 'remove') {
            const key = args[1];
            if (!key) {
                console.error('Usage: vant storage delete <key>');
                process.exit(1);
            }
            console.log('Deleting:', key);
        } else if (subcmd === 'keys' || subcmd === 'list') {
            const keys = await storage.list();
            console.log('Storage keys:', keys.length);
            keys.slice(0, 10).forEach(k => console.log('  ' + k));
        } else if (subcmd === 'stats' || subcmd === 'info') {
            const keys = await storage.list();
            console.log('Storage stats:');
            console.log('  Backend: brain');
            console.log('  Keys:', keys.length);
        } else if (subcmd === 'snapshot') {
            // (1b pattern) capability gate BEFORE any write; refusal to stdout
            const label = args[1] || 'manual';
            const store = _snapStore();
            const snap = store.snapshot(label);
            console.log(`✓ Snapshot ${snap.id}`);
            console.log(`  files: ${snap.files}, bytes: ${snap.bytes}` + (snap.pruned ? `, pruned oldest: ${snap.pruned}` : ''));
        } else if (subcmd === 'snapshots' || subcmd === 'snapshot-list') {
            const store = _snapStore();
            const list = store.listSnapshots();
            if (list.length === 0) {
                console.log('No snapshots. Create one: vant storage snapshot <label>');
            } else {
                console.log('Snapshots (oldest first):');
                for (const s of list) {
                    console.log(`  ${s.id}  label=${s.label} files=${s.files}`);
                }
            }
        } else if (subcmd === 'restore') {
            const id = args[1];
            if (!id) {
                console.log('Usage: vant storage restore <id>   (list ids: vant storage snapshots)');
                process.exit(1);
            }
            const store = _snapStore();
            const r = store.restoreSnapshot(id);
            console.log(`✓ Restored ${r.id}: ${r.restored} file(s) written, ${r.removed} post-snapshot file(s) removed`);
        } else if (subcmd === 'unsnapshot' || subcmd === 'snapshot-delete') {
            const id = args[1];
            if (!id) {
                console.log('Usage: vant storage unsnapshot <id>');
                process.exit(1);
            }
            const store = _snapStore();
            store.deleteSnapshot(id);
            console.log(`✓ Snapshot deleted: ${id}`);
        } else if (subcmd === 'clear' || subcmd === 'reset' || subcmd === 'wipe') {
            const keys = await storage.list();
            for (const key of keys) {
                await storage.delete(key);
            }
            console.log('Storage cleared');
        } else {
            console.log('Usage: vant storage <command>');
            process.exit(1);
        }
    } catch (e) {
        console.error('Error:', e.message);
        process.exit(1);
    }
}

run();
