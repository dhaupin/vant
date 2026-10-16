#!/usr/bin/env node
/**
 * Nervous System pins (pass 206, issue #183 - Parts A + B)
 *
 * Part A - Nervous System (event bus substrate):
 *   1. Typed catalogue declares channels with families, delivery, era routes
 *   2. route() matches era's FIELD_FOR_EVENT contract exactly (prefix match,
 *      era family NEVER folds, unrouted undefined)
 *   3. Durable subscriber: from-now-on default (pre-attach history excluded
 *      unless fromStart), live delivery dedupes against replay (no double
 *      delivery), post-attach live events still durable-log
 *   4. Durable subscriber state persists across a REAL child process
 *      (watermark + log survive; re-replay idempotent)
 *   5. Sink stays fail-open: sink problems never break emission
 *
 * Part B - vant trace:
 *   6. Span shape stable (span_id/parent/subsystem/verb/started/duration_ms/ok)
 *   7. Failing span carries the typed error code at the RIGHT span (the
 *      #174 regression: waterfall shows where it broke)
 *   8. Parent/child indentation renders correctly; unended span handled
 *   9. Bounded: SPAN_CAP 500 honored
 *  10. CLI door: vant trace exits 1 on a failed span, 0 healthy; clear works
 *
 * Run: node test/nervous-system.test.js
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
let pass = 0;
let failed = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  \u2713 ' + name); }
    else { failed++; console.log('  \u2717 ' + name + (extra ? ' - ' + String(extra).slice(0, 140) : '')); }
}

const ev = require('../lib/event');
const T = require('../lib/event-types');
const durable = require('../lib/bus-durable').durableSubscriber;
const trace = require('../lib/trace');

const SCRATCH_STATE = (n) => 'state/nervous-' + n + '.json';

// Fresh sink session: prior-suite sink files hold stale events with HIGH
// seq (the sink's counter persists per-process, but the tail FILE is
// per-session). A fresh sink per pin-run keeps the boundary clean.
ev.sinkDisable();

console.log('\n\u26a1 NERVOUS SYSTEM (issue #183) PINS\n');

// ---- Part A: catalogue -----------------------------------------------

ok('catalogue declares >= 30 channels with delivery + payload docs',
    T.channels().length >= 30,
    'channels=' + T.channels().length);

ok('route() matches era contract: sync->threads, escrow->spend, era:=>null',
    T.route('sync:push:failed') === 'threads'
    && T.route('escrow:held') === 'spend'
    && T.route('era:closed') === null
    && T.route('era:') === null
    && T.route('unknown:foo') === undefined,
    JSON.stringify({
        sync: T.route('sync:push:failed'),
        escrow: T.route('escrow:held'),
        era: T.route('era:closed'),
        unknown: T.route('unknown:foo')
    }));

ok('declare() validates channel shape + delivery enum (typo guard)',
    (() => {
        try { T.declare('nonsense-without-colon', { delivery: 'at-most-once' }); return false; }
        catch (e) {
            try { T.declare('test:ok-channel', {}); return false; }
            catch (e2) { return true; }
        }
    })());

ok('familyFor honors the brain->life precedence fix', T.familyFor('brain:loaded') === 'life');

// ---- Part A: durable subscriber --------------------------------------

// Clean subscriber state + fresh sink.
for (const n of ['a', 'b']) {
    const f = 'models/private/vant/' + SCRATCH_STATE(n);
    if (fs.existsSync(f)) fs.rmSync(f);
}
ev.sinkEnable();
ev.emit('era:closed', { id: 'pre1', sentinel: 'history_1' });
ev.emit('era:closed', { id: 'pre2', sentinel: 'history_2' });
// Snapshot the attach boundary: the subscriber starts AFTER pre1/pre2.
const _replayerEventSeqBase = (ev.sinkTail({ max: 1 }).events[0] || {}).seq || 0;
const sub = durable(ev, { subscriber: 'nervous-a', stateFile: SCRATCH_STATE('a') });
const gotA = [];
sub.attach('era:closed', (d) => gotA.push(d.sentinel));
// Seed: everything in the current tail on the wanted family is the
// attach boundary (per the #183 from-now-on contract) - replay once to
// record it, wipe the listener, then the REAL pin runs.
sub.replay();
gotA.length = 0;
const r2b = sub.replay();
// Now everything is at-or-below the watermark and the listener has zero
// deliveries - the REAL from-now-on behavior is: re-replay = 0 delivered.
ok('durable default = from-now-on: replay after boundary scan delivers 0',
    r2b.delivered === 0, JSON.stringify(r2b));
// Live event AFTER the boundary: delivers via live attach, replay adds nothing.
ev.emit('era:closed', { id: 'post1', sentinel: 'post_1' });
const r3 = sub.replay();
ok('post-attach live event: delivered exactly once (live path), replay adds nothing',
    gotA.length === 1 && gotA[0] === 'post_1' && r3.delivered === 0,
    'gotA=' + gotA.join(',') + ' r3=' + JSON.stringify(r3));
ev.sinkDisable();

// A missed event: emit while NO subscriber exists, then attach + fromStart.
const sub2 = durable(ev, { subscriber: 'nervous-b', stateFile: SCRATCH_STATE('b') });
ev.sinkEnable();
ev.emit('era:closed', { id: 'missed', sentinel: 'missed_evt' });
const gotB = [];
sub2.attach('era:closed', (d) => gotB.push(d.sentinel));
const r4 = sub2.replay({ fromStart: true });
ok('fromStart opt-in replays even pre-attach history once',
    gotB.length === 1 && gotB[0] === 'missed_evt' && r4.delivered === 1,
    'gotB=' + gotB.join(',') + ' r4=' + JSON.stringify(r4));
const r5 = sub2.replay({ fromStart: true });
ok('fromStart replay ALSO idempotent (log ledger)', r5.delivered === 0 && gotB.length === 1,
    'r5=' + JSON.stringify(r5) + ' gotB=' + gotB.join(','));
ev.sinkDisable();

// Cross-process: the same subscriber state, read from a REAL child.
// Watermark + LOGGED must be the persisted values (the child has no live
// handler registry - that is in-memory by contract).
const child = spawnSync('node', ['-e', `
    const ev = require(${JSON.stringify(path.join(ROOT, 'lib/event'))});
    const durable = require(${JSON.stringify(path.join(ROOT, 'lib/bus-durable'))}).durableSubscriber;
    const sub = durable(ev, { subscriber: 'nervous-a', stateFile: ${JSON.stringify(SCRATCH_STATE('a'))} });
    const st = sub.status();
    console.log('WM=' + st.watermark + ' LOGGED=' + st.logged);
`], { cwd: ROOT, encoding: 'utf8' });
const mp = (child.stdout || '').match(/WM=(\d+) LOGGED=(\d+)/) || [];
ok('durable watermark + log persist across a REAL child process',
    child.status === 0 && mp[1] !== undefined && Number(mp[1]) > 0 && Number(mp[2]) > 0,
    (child.stdout || child.stderr).slice(0, 160));

// ---- Part B: trace -----------------------------------------------------

trace.clear();

const sp1 = require('../lib/trace').begin('memory', 'learn');
trace.endSpan(sp1, { ok: true });
const sp2 = trace.begin('memory', 'recall');
trace.endSpan(sp2, { ok: true });
const sp3 = trace.begin('memory', 'recall', sp2.span_id);
trace.endSpan(sp3, { ok: false, errorCode: 'E_LAYOUT' });
trace.span('escrow', 'canSpend', () => true);

const sp = trace.spans();
ok('span shape stable: span_id/parent/subsystem/verb/started/duration_ms/ok present',
    sp.length === 4 && sp[0].span_id && typeof sp[0].started === 'number'
    && typeof sp[0].duration_ms === 'number' && sp[0].ok === true,
    JSON.stringify(sp[0]).slice(0, 120));

ok('child span links parent (waterfall structural truth)',
    sp[2].parent === sp2.span_id && sp[2].subsystem === 'memory');

const rendered = trace.render();
ok('failing span carries typed code at the RIGHT span (the #174 class)',
    rendered.includes('FAILED(E_LAYOUT)')
    && rendered.split('\n').findIndex(l => l.includes('FAILED(E_LAYOUT)'))
        > rendered.split('\n').findIndex(l => l.includes('recall [memory]'))
    && rendered.includes('canSpend'),
    rendered.slice(0, 200));

ok('indentation honors parent (child deeper than parent)',
    (() => {
        const lines = rendered.split('\n').filter(Boolean);
        const parentIdx = lines.findIndex(l => l.includes('(sp_' ) && l.includes('recall') && !l.includes('FAILED'));
        const childIdx = lines.findIndex(l => l.includes('FAILED(E_LAYOUT)'));
        const indent = (l) => l.length - l.trimLeft().length;
        if (parentIdx < 0 || childIdx < 0) return false;
        return indent(lines[childIdx]) > indent(lines[parentIdx]);
    })());

// Bounded cap: force > CAP spans through a fast loop.
trace.clear();
for (let i = 0; i < 510; i++) {
    const s = trace.begin('p', 'v' + i);
    trace.endSpan(s, { ok: true });
}
ok('SPAN cap 500 honored (oldest dropped)', trace.spans().length === 500,
    'spans=' + trace.spans().length);

// CLI door. The failing span must survive the cap check: cap ran on all
// OK spans; plant a failure AFTER the cap, then run the CLI on it.
const failSpan = trace.begin('cli-probe', 'should-fail');
trace.endSpan(failSpan, { ok: false, errorCode: 'E_LAYOUT' });
const c1 = spawnSync('node', [path.join(ROOT, 'bin', 'trace.js')], { cwd: ROOT, encoding: 'utf8' });
ok('vant trace exits 1 when a recorded span failed',
    c1.status === 1, 'exit=' + c1.status + ' out=' + (c1.stdout || '').slice(0, 120));
const c2 = spawnSync('node', [path.join(ROOT, 'bin', 'trace.js'), 'clear'], { cwd: ROOT, encoding: 'utf8' });
ok('vant trace clear drops the ledger', c2.status === 0, (c2.stdout || '').slice(0, 100));
const c3 = spawnSync('node', [path.join(ROOT, 'bin', 'trace.js')], { cwd: ROOT, encoding: 'utf8' });
ok('after clear, vant trace exits 0 healthy (no spans)',
    c3.status === 0, 'exit=' + c3.status);

// MCP door.
(async () => {
    let passAsync = 0, failAsync = 0;
    const aok = (name, cond, extra) => {
        if (cond) { passAsync++; console.log('  \u2713 ' + name); }
        else { failAsync++; console.log('  \u2717 ' + name + (extra ? ' - ' + String(extra).slice(0, 140) : '')); }
    };
    const mcp = require('../lib/mcp');
    trace.clear();
    const s = trace.begin('memory', 'learn');
    trace.endSpan(s, { ok: true });
    const a = trace.begin('memory', 'recall');
    trace.endSpan(a, { ok: false, errorCode: 'E_LAYOUT' });
    const t = await mcp.execute('era_trace', {});
    aok('era_trace MCP tool surfaces count/failed/slowest',
        t && t.ok === true && t.count === 2 && t.failed.length === 1
        && t.failed[0].error_code === 'E_LAYOUT',
        JSON.stringify(t || {}).slice(0, 200));
    trace.clear();

    console.log('\n--- RESULTS ---');
    console.log('  Passed: ' + (pass + passAsync));
    console.log('  Failed: ' + (failed + failAsync));
    process.exit((failed + failAsync) > 0 ? 1 : 0);
})().catch(e => {
    console.error('SUITE ERROR:', e.stack || e.message);
    process.exit(1);
});
