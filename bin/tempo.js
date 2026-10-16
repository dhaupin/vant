#!/usr/bin/env node
/**
 * Tempo CLI — the time-dilation keeper's door (#197, pass 207c).
 *
 * Usage:
 *   vant tempo begin <duration> [--slice <dur>] [--label <text>] [--note <text>]
 *   vant tempo status                          Active budget + recent budgets
 *   vant tempo stop <budgetId>                 Un-arm an in-process scheduler
 *                                              (budget persists on disk, re-arms on load)
 *   vant tempo end <budgetId> [reason]         End a budget early (explicit only)
 *   vant tempo receipts [n]                    The last N receipt lines (the audit trail)
 *   vant tempo pace <want>                     One loop-shaped want-list step
 *
 * The loop the module runs: an owner-stated wall-clock budget ("30 minutes")
 * becomes N sampled slices spread ACROSS the interval — explore → learn →
 * note → re-enter — until the epoch tick catches up. This door manages the
 * budgets and reads the receipts; the AGENT's slice behavior (what to do
 * each wake) is described in docs/memory/tempo.md.
 */

const args = process.argv.slice(2);
const subcmd = args[0] || 'help';
const tempo = require('../lib/tempo');

function budgetIdArg() {
    const id = args[1];
    if (!id || id.startsWith('--')) {
        console.error('Usage: vant tempo ' + subcmd + ' <budgetId> ...');
        process.exit(1);
    }
    return id;
}

if (subcmd === '-h' || subcmd === '--help' || subcmd === 'help') {
    console.log(`
Tempo — time-dilation keeper (#197). Agent attention sampled ACROSS a
stated wall-clock window, not dumped at T+0 (loop first; formula later
from per-slice telemetry).

Usage:
  vant tempo begin <duration> [--slice <dur>] [--label <text>] [--note <text>]
  vant tempo status                    Active budget + recent budgets
  vant tempo stop <budgetId>           Un-arm in-process schedule ( disk budget persists)
  vant tempo end <budgetId> [reason]   End the window early (explicit only)
  vant tempo receipts [n]              Last N receipt lines (audit trail)
  vant tempo pace <want>               One loop-shaped want step (explore→learn→note)

Durations: "30 minutes", "1h 30m", "90s", "2 hours", epoch ms.
Slice default: one per 2 wall-minutes (the fixed-slice floor).
`);
    process.exit(0);
}

if (subcmd === 'begin') {
    const duration = args[1];
    if (!duration || duration.startsWith('--')) {
        console.error('Usage: vant tempo begin <duration> [--slice <dur>] [--label <text>]');
        process.exit(1);
    }
    const flag = (name) => {
        const i = args.indexOf(name);
        return i >= 0 && args[i + 1] && !args[i + 1].startsWith('-') ? args[i + 1] : undefined;
    };
    const label = flag('--label') || 'agent free-time window';
    const inputOptions = {
        duration,
        label,
        sliceMs: flag('--slice'),
        note: flag('--note')
    };
    let controller;
    let started;
    try {
        controller = tempo.beginBudget(inputOptions);
        started = controller;
    } catch (e) {
        console.error('❌ ' + e.message);
        process.exit(1);
    }
    console.log('⏳ Budget armed: ' + started.id);
    console.log('   label:        ' + started.label);
    console.log('   window:       ' + new Date(started.start).toISOString() + ' → ' + new Date(started.windowEnd).toISOString());
    console.log('   slices:       ' + started.slicesTotal + ' × ' + started.sliceMs + 'ms (fixed-slice floor; formula D tuned later from receipts)');
    console.log('   persistence:  ' + tempo._ledgerPath());
    console.log('   The scheduler lives in THIS process; the budget survives on disk (vant tempo status).');
    // Explicit keep-alive? No: the timers are unref'd — the door exits after
    // reporting; long-lived hosts (mcp/server) carry the scheduler. Status
    // + on-load reconcile keep the ledger truthful across processes.
    process.exit(0);
}

if (subcmd === 'status') {
    const s = tempo.status();
    console.log('⏳ Tempo status (' + new Date(s.now).toISOString() + ')');
    if (s.active) {
        console.log('   ACTIVE: ' + s.active.id + ' — ' + s.active.label);
        console.log('   remaining: ' + Math.round(s.active.remaining / 1000) + 's · slices fired: ' + s.active.slicesFired + '/' + s.active.slicesTotal + ' · receipts: ' + s.active.receipts);
    } else {
        console.log('   No active budget. Arm one: vant tempo begin "30 minutes" --label exploring');
    }
    for (const b of s.budgets) {
        if (b.state !== 'active') {
            console.log('   [' + b.state + '] ' + b.id + ' — ' + b.label + ' (' + b.slicesFired + '/' + b.slicesTotal + ' slices, ' + b.receipts + ' receipts)');
        }
    }
    process.exit(0);
}

if (subcmd === 'stop') {
    const id = budgetIdArg();
    console.log('⏸  Note: schedulers are per-process. Cross-process stop is the ledger: this ends nothing.');
    const s = tempo.status();
    const b = s.budgets.find(x => x.id === id);
    if (!b) {
        console.error('❌ Unknown budget: ' + id);
        process.exit(1);
    }
    console.log('   Budget ' + id + ' remains ' + (b.state === 'active' ? 'ACTIVE on disk (re-arms from remaining window on next load)' : b.state));
    process.exit(0);
}

if (subcmd === 'end') {
    const ledger = tempo._readLedger();
    const id = budgetIdArg();
    const b = ledger.budgets[id];
    if (!b || b.state !== 'active') {
        console.error((!b ? '❌ Unknown budget: ' + '❓' + id : 'Budget not active: ' + id + ' (state ' + b.state + ')'));
        process.exit(1);
    }
    // Cross-process honest end: mark the ledger directly (scheduler in
    // another process sees the state flip on its next slice or reconcile).
    b.state = 'ended-early';
    b.endedAt = Date.now();
    b.endReason = args[2] ? args.slice(2).join(' ') : 'ended via CLI (vant tempo end)';
    if (!b.receipts) b.receipts = [];
    b.receipts.push({ ts: b.endedAt, kind: 'budget-end', line: 'ended early: ' + b.endReason });
    ledger.receipts = ledger.receipts || [];
    ledger.receipts.push({ ts: b.endedAt, budget: id, kind: 'cli-end', line: 'ended via CLI: ' + id });
    tempo._writeLedger(ledger);
    console.log('✔ Budget ' + id + ' marked ended-early: ' + b.endReason);
    process.exit(0);
}

if (subcmd === 'receipts') {
    const n = parseInt(args[1], 10) || 20;
    const ledger = tempo._readLedger();
    const all = [];
    for (const id of Object.keys(ledger.budgets)) {
        for (const r of (ledger.budgets[id].receipts || [])) all.push('[' + new Date(r.ts).toISOString() + '] ' + (r.line || r.kind || JSON.stringify(r)));
    }
    for (const r of (ledger.receipts || [])) if (r.line) all.push('[' + new Date(r.ts).toISOString() + '] ' + r.line);
    const tail = all.slice(-n);
    console.log(tail.length ? tail.join('\n') : '(no receipts yet)');
    process.exit(0);
}

if (subcmd === 'pace') {
    const want = args.slice(1).join(' ').trim();
    if (!want) {
        console.error('Usage: vant tempo pace "<what you wanted to do when free>"');
        console.error('  The step runs as the loop shapes it in-process: explore → learn → note.');
        console.error('  Example: vant tempo pace "re-read lib/geometry for the fold law"');
        process.exit(1);
    }
    const out = tempo.pace(want, (w) => ({ learned: '(in-process one-shots learn here; agents use pace(fn) with real steps)' }));
    console.log(out.line);
    process.exit(out.ok ? 0 : 1);
}

console.log('Unknown tempo verb: ' + subcmd + ' — try: vant tempo --help');
process.exit(1);
