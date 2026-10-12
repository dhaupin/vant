#!/usr/bin/env node
/**
 * Vant Era CLI — the resumable incarnation ledger (issues #177/#178 Phase 2).
 *
 * Usage (via `vant era`):
 *   vant era start <intent>     Open a new era (one at a time)
 *   vant era                    Alias of `current`
 *   vant era current [--json]   Show the open era (or typed absence)
 *   vant era close [--next "sentence"] [--json]
 *                               Close + archive the era with a signed rollup
 *   vant era list [--json]      List archived rollups (integrity-checked)
 *   vant era verify <id-prefix> Re-verify an archived rollup's checksum
 *
 * Exit codes: 0 ok · 1 typed lib error · 2 usage.
 */

const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === '-h' || cmd === '--help') {
    console.log(`
Vant Era — resumable incarnation ledger

Usage:
  vant era start <intent>          Open a new era (one at a time)
  vant era [current] [--json]      Show the open era (or typed absence)
  vant era close [--next "…"] [--json]
                                   Close + archive with a signed rollup
  vant era list [--json]           List archived rollups (integrity-checked)
  vant era verify <id-prefix>      Re-verify an archived rollup's checksum

The subscriber folds bus events (escrow, agents, forum, …) into the OPEN
era automatically — no era open means everything stays a no-op.
`);
    process.exit(0);
}

const era = require('../lib/era');

const wantJson = args.includes('--json');

function printEra(e) {
    console.log('Era ID:      ' + e.id);
    console.log('Intent:      ' + e.intent);
    console.log('Opened:      ' + new Date(e.startedAt).toISOString());
    console.log('Closed:      ' + (e.closedAt ? new Date(e.closedAt).toISOString() : '(open)'));
    if (e.next) console.log('Next:        ' + e.next);
    if (e.checksum) console.log('Checksum:    ' + e.checksum);
    for (const f of ['threads', 'spend', 'social', 'stones', 'memory']) {
        const v = e[f];
        if (Array.isArray(v)) console.log('  ' + f + ':       ' + v.length + ' line-items');
        else if (v && typeof v === 'object') {
            console.log('  ' + f + ':       ' + v.count + ' (compacted' + (v.overflow ? ', OVERFLOWED — counts may be lower than observed' : '') + ')');
            for (const [t, n] of Object.entries(v.byType || {})) console.log('    ' + t + ' ×' + n);
        }
    }
}

function nextHint(id) {
    console.log('');
    console.log('Next steps:');
    console.log('  • Do your work — subscribed bus events fold in automatically.');
    console.log('  • vant era close --next "what the next wake must do first"');
    console.log('  • vant horcrux refresh   (carries the rollup\'s `next` into the boot stone)');
}

async function run() {
    switch (cmd) {
        case undefined:
        case 'current': {
            const c = era.current();
            if (!c.open) {
                if (wantJson) console.log(JSON.stringify({ open: false }, null, 2));
                else console.log('No era is open. Start one: vant era start "<why this wake exists>"');
                process.exit(0);
            }
            if (wantJson) console.log(JSON.stringify({ open: true, era: c.era, integrity: c.integrity }, null, 2));
            else {
                printEra(c.era);
                console.log('Integrity:   ' + (c.integrity ? 'OK (checksum matches)' : 'DRIFTED — last write may have been torn'));
            }
            process.exit(0);
        }
        case 'start': {
            const intent = args.slice(1).filter(a => !a.startsWith('-')).join(' ');
            if (!intent) { console.error('Usage: vant era start <intent>'); process.exit(2); }
            const r = await era.start(intent);
            if (!r.ok) {
                console.error('era: ' + (r.error || 'failed'));
                if (wantJson) console.error(JSON.stringify(r, null, 2));
                process.exit(r.code === 'E_ERA_ALREADY_OPEN' ? 1 : 1);
            }
            if (wantJson) console.log(JSON.stringify(r, null, 2));
            else {
                console.log('Era opened: ' + r.era.id);
                console.log('Intent: ' + r.era.intent);
                nextHint(r.era.id);
            }
            process.exit(0);
        }
        case 'close': {
            const nextIdx = args.indexOf('--next');
            const next = nextIdx !== -1 && args[nextIdx + 1] ? args[nextIdx + 1] : undefined;
            const r = await era.close({ next });
            if (!r.ok) { console.error('era: ' + (r.error || 'failed')); process.exit(1); }
            if (wantJson) console.log(JSON.stringify(r, null, 2));
            else {
                console.log('Era closed: ' + r.rollup.id);
                console.log('Rollup archived to: ' + r.archiveFile + ' (checksum signed, vant era verify <id>)');
                if (r.rollup.next) console.log('Next: ' + r.rollup.next);
                console.log('');
                console.log('Reminder: vant horcrux refresh regenerates the boot stone —');
                console.log('the next wake inherits `next` as its boot prompt (the #175 hook).');
            }
            process.exit(0);
        }
        case 'list': {
            const rows = era.list();
            if (wantJson) console.log(JSON.stringify(rows, null, 2));
            else if (rows.length === 0) console.log('No archived eras yet.');
            else {
                console.log('Archived eras (' + rows.length + '):');
                for (const row of rows) {
                    console.log('  ' + row.id.slice(0, 18) + '  ' + (row.closedAt ? new Date(row.closedAt).toISOString().slice(0, 16) : '?') + '  "' + String(row.intent).slice(0, 50) + '"' + (row.next ? '  → next: ' + String(row.next).slice(0, 40) : '') + (row.integrity ? '' : '  ✗ DRIFTED'));
                }
            }
            process.exit(0);
        }
        case 'verify': {
            const id = args.slice(1).filter(a => !a.startsWith('-')).join(' ').trim();
            if (!id) { console.error('Usage: vant era verify <id-prefix>'); process.exit(2); }
            const r = era.verify(id);
            if (!r.ok) { console.error('era: ' + (r.error || 'failed')); process.exit(1); }
            if (wantJson) console.log(JSON.stringify(r, null, 2));
            else console.log((r.match ? '✓ checksum MATCHES: ' : '✗ checksum DRIFTED: ') + r.id);
            process.exit(r.match ? 0 : 1);
        }
        default:
            console.error('Unknown era verb: ' + cmd + ' (try: start | current | close | list | verify)');
            process.exit(2);
    }
}

run().catch(e => {
    console.error('era: ' + (e && e.message || e));
    process.exit(1);
});
