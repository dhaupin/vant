'use strict';

/**
 * Pins for the pass-ledger surface (labs/prd-kernel.md §3 wiring map
 * row 9: "formal census of open items | queue as census entries").
 *
 * The dos the PRD locks on this row:
 *  - the census is REAL: it reads labs/TASKS.md + labs/MEM.md from disk;
 *  - open-item markers are the ledger's OWN dialect (Next/NEXT-UP/
 *    Owner queue), not an invented format;
 *  - succeed = the ceremony formatter (pure, never writes);
 *  - kernel census carries are dated (journal seq + hash), typed, and
 *    self-heal across resets within the call (clerk-not-judge);
 *  - no fs mutation anywhere in the module.
 *
 * Run: node test/pass-ledger.test.js  (picked up by test/run-all.js)
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const ledger = require(path.join(ROOT, 'lib', 'pass-ledger.js'));
const kernel = require(path.join(ROOT, 'lib', 'kernel.js'));

let failures = 0;
function check(name, ok, detail) {
    if (!ok) failures++;
    console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `: ${detail}`}`);
}

kernel._unwind();

// ---- reads what's real ----
{
    const fs = require('fs');
    for (const [key, file] of Object.entries(ledger.LEDGERS)) {
        check(`ledger file exists on disk: ${key}`, fs.existsSync(file), file);
    }

    const vis = ledger.ledgersReadable();
    check('ledgersReadable sees both docs at the repo root', vis.tasks === true && vis.mem === true, JSON.stringify(vis));

    const ps = ledger.passes();
    check('passes parsed newest-first (pass id, date, title, line)',
        ps.length > 0 && typeof ps[0].pass === 'string' && typeof ps[0].date === 'string' &&
        typeof ps[0].title === 'string' && Number.isInteger(ps[0].line),
        JSON.stringify(ps[0] || {}).slice(0, 140));

    const limited = ledger.passes(3);
    check('passes(limit) honors the cap', limited.length === Math.min(3, ps.length), `${limited.length} of ${ps.length}`);
}

// ---- the ledger's own open-item dialect ----
{
    check('marker regex recognizes TASKS.md dialect',
        ledger.OPEN_ITEM_RE.test('**Next:** the next lift') &&
        ledger.OPEN_ITEM_RE.test('**NEXT-UP:** something') &&
        ledger.OPEN_ITEM_RE.test('Owner queue: held'),
        String(ledger.OPEN_ITEM_RE));

    const items = ledger.openItems();
    check('openItems returns real markers with file+line sources',
        items.length > 0 && items.every((i) => typeof i.id === 'string' && i.id.includes(':') && Number.isInteger(i.at) && (i.source === 'tasks' || i.source === 'mem')),
        JSON.stringify(items.slice(0, 2)));
}

// ---- succeed = ceremony formatter, pure ----
{
    const block = ledger.formatPassEntry({ pass: 'PIN', date: '2026-10-25', title: 'PIN TEST', body: 'Body line.\n' });
    check('formatPassEntry uses the ledger header dialect',
        block.startsWith('## Pass PIN (2026-10-25) - PIN TEST\n') && block.includes('Body line.'),
        JSON.stringify(block.slice(0, 80)));

    let caught = null;
    try { ledger.formatPassEntry({}); } catch (e) { caught = e; }
    check('formatPassEntry refuses unnamed passes at cause (typed)',
        caught && (caught.code === 'E_NAMING' || caught.name === 'TypeError'),
        caught && !(caught instanceof Error) ? 'not an error' : String((caught && caught.message) || 'no throw'));

    const fs = require('fs');
    const before = fs.readFileSync(ledger.LEDGERS.tasks, 'utf8');
    ledger.formatPassEntry({ pass: 'PIN2', title: 'MUST NOT WRITE' });
    check('formatter never writes the ledger doc', fs.readFileSync(ledger.LEDGERS.tasks, 'utf8') === before, 'TASKS.md mutated');
}

// ---- kernel census: dated, typed, self-healing ----
{
    const entries = ledger.ledgerCensus();
    check('kernel census carries dated, typed entries',
        Array.isArray(entries) && entries.length > 0 &&
        entries.every((e) => typeof e.id === 'string' && Number.isInteger(e.at) && e.at > 0 && typeof e.kind === 'string'),
        JSON.stringify(entries).slice(0, 200));

    check('census leads with the pass count and queues open items as entries',
        entries[0].kind === 'pass-ledger-census' && entries.slice(1).every((e) => e.kind === 'open-item'),
        JSON.stringify(entries.slice(0, 2)));

    kernel._unwind(); // registry reset the module didn't cause
    const after = ledger.ledgerCensus();
    check('re-registers after kernel reset within the call',
        Array.isArray(after) && after.length > 0 && after[0].kind === 'pass-ledger-census',
        JSON.stringify(after || {}).slice(0, 120));
}

console.log(`\npass-ledger pins: ${failures === 0 ? 'ALL PASS' : `${failures} pin(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
