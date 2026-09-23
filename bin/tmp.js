#!/usr/bin/env node
/**
 * Vant Tmp CLI
 * Temp file management
 * 
 * Usage:
 *   vant tmp list                  # List temp files
 *   vant tmp clean                 # Clean temp files
 *   vant tmp create <content>      # Create temp file
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'list';

if (subcmd === '-h' || subcmd === '--help') {
    console.log(`
Vant Tmp CLI - Temp file management

Usage:
  vant tmp list                     List temp files
  vant tmp clean                    Clean temp files
  vant tmp create <content>         Create temp file
  vant tmp stats                    Show temp stats
`);
    process.exit(0);
}

async function run() {
    const tmp = require('../lib/tmp');
    const boot = require('../lib/boot');

    // CLI boot (pass 19 bin sweep): TmpSpace is sudo-secured, so a bare CLI
    // process (taskId 'default', never registered) got EPERM on EVERY
    // operation — the command was advertised but never worked standalone.
    // boot.init() creates the task with CLI scopes (same trust level as
    // `vant org grant`). Also wire global._lock for TmpSpace put/delete,
    // which acquire through it.
    try {
        await boot.init({ taskId: 'vant-cli', scopes: ['read', 'write', 'exec'] });
        if (!global._lock) global._lock = require('../lib/lock');
    } catch (e) {
        console.error('[tmp] boot failed:', e.message);
        process.exit(1);
    }
    
    if (subcmd === 'list' || subcmd === 'ls' || subcmd === 'all') {
        const files = await tmp.list('workspace');
        if (files && files.files) {
            console.log('Temp files (' + files.space + '):', files.files.length);
            for (const f of files.files) console.log('  -', f.name);
        } else {
            console.log('Temp files:', JSON.stringify(files));
        }
    } else if (subcmd === 'clean' || subcmd === 'clear' || subcmd === 'wipe') {
        await tmp.clear('workspace');
        console.log('Temp files cleaned');
    } else if (subcmd === 'create' || subcmd === 'new' || subcmd === 'init') {
        const content = args.slice(1).join(' ') || 'temp';
        const key = await tmp.put('workspace', 'tmp-' + Date.now().toString(36), content);
        console.log('Created temp file:', JSON.stringify(key));
    } else if (subcmd === 'stats' || subcmd === 'info' || subcmd === 'status') {
        const files = await tmp.list('workspace');
        console.log('Temp stats:');
        console.log('  Files:', files && files.files ? files.files.length : JSON.stringify(files));
        console.log('  Task:', tmp.getTaskId());
    } else {
        console.log('Usage: vant tmp <command>');
        process.exit(1);
    }
}

run().catch(console.error);
