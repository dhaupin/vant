#!/usr/bin/env node
'use strict';

/**
 * open-items-gate — machine-visible open-item drift for the pass-ledger
 * (labs/prd-kernel.md §3 wiring map row 9 + pass-354 arc).
 *
 * The pass-ledger's openItems() census reads labs/TASKS.md + labs/MEM.md
 * on disk; this gate pins the census to a committed snapshot
 * (labs/open-items.snapshot.json) so open-item drift cannot be silent:
 *
 *   - census changes  →  the snapshot must be updated in the SAME commit
 *     as the ledger edit (npm run ledger:snapshot) — a conscious act,
 *     never background churn;
 *   - docs unreadable at the run root → the gate fails naming the real
 *     cause (ledger bytes are the input; a no-labs checkout is not a
 *     legit empty ledger, it's a gate environment error);
 *   - unparseable snapshot → typed failure, the file is the contract.
 *
 * Runs in seconds, in-process, zero sockets — same posture as the other
 * gate scripts. The weekly cron in .github/workflows/test.yml re-runs
 * the whole ci job, so drift is also re-measured weekly even when the
 * week's commits never touched the ledgers.
 */

const fs = require('fs');
const path = require('path');
const ledger = require('../lib/pass-ledger.js');

const SNAPSHOT = path.join(__dirname, '..', 'labs', 'open-items.snapshot.json');

function main() {
    // 1. The docs must read — a gate that runs over invisible bytes is a lie.
    const vis = ledger.ledgersReadable();
    if (!vis.tasks || !vis.mem) {
        console.error('ledger gate: FAIL - ledger docs unreadable at the run root');
        for (const [k, ok] of Object.entries(vis)) {
            if (!ok) console.error(`  ${k}: not readable at ${ledger.LEDGERS[k]} (the census attacks real bytes; check this gate's cwd)`);
        }
        process.exit(1);
    }

    // 2. The snapshot is the contract — typed failure on drift, parsed honestly.
    let snapshot;
    try {
        snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
    } catch (e) {
        console.error(`ledger gate: FAIL - snapshot unreadable/invalid: ${String(e.message).slice(0, 140)}`);
        console.error(`  regen: npm run ledger:snapshot  (in the same commit as the ledger change)`);
        process.exit(1);
    }
    if (!snapshot || !Array.isArray(snapshot.items)) {
        console.error('ledger gate: FAIL - snapshot shape drifted (no items array)');
        process.exit(1);
    }

    const current = ledger.openItems();
    const currentIds = new Set(current.map((i) => i.id));
    const snapIds = new Set(snapshot.items.map((i) => i.id));

    // Ids carry true file:line (source:at), so line movement inside a
    // ledger legitimately moves ids — that drift is what the gate makes
    // loud, together with real opens/closes.
    const opened = current.filter((i) => !snapIds.has(i.id));
    const closed = snapshot.items.filter((i) => !currentIds.has(i.id));

    if (opened.length || closed.length) {
        console.error('ledger gate: FAIL - open-item drift not acknowledged (update labs/open-items.snapshot.json in the SAME commit as the ledger edit):');
        for (const i of opened) console.error(`  OPENED + ${i.id} (${i.marker})`);
        for (const i of closed) console.error(`  CLOSED - ${i.id} (${i.marker || ''})`);
        console.error(`  snapshot count ${snapshot.count} vs census count ${current.length}`);
        process.exit(1);
    }

    console.log(`ledger gate: PASS - ${current.length} open item(s) match the committed snapshot (tasks+mem readable, drift zero)`);
    for (const i of current) console.log(`  - ${i.id} (${i.marker})`);
}

main();
