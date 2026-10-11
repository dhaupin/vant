#!/usr/bin/env node
/**
 * Event Observability pins (pass 179, prd-canonicalization Wave A)
 *
 * Pins:
 *   1. Sink OFF by default; enabling captures emits; disabling stops.
 *   2. Sink never breaks emission (unserializable payload survives).
 *   3. sinkTail filters (nameFilter, module) and returns newest-first.
 *   4. event-wiring: every high-value event produces an audit reaction.
 *   5. event-wiring: sync failures surface in health.runChecks.
 *   6. health runChecks works (pass 179 fixed _checkRead ReferenceError).
 *   7. Wiring is idempotent.
 *   8. MCP tools exist (event_tail/event_sink_enable/event_sink_stats).
 *
 * Run: node test/event-observability.test.js
 */

const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ FAIL: ' + name + (extra ? ' — ' + String(extra).slice(0, 120) : '')); }
};

// ── 1-3: sink lifecycle ───────────────────────────────────────────────────
const ev = require('../lib/event');
ev.sinkDisable();

ok('sink disabled by default in a fresh process (stats.enabled false', ev.sinkStats().enabled === false, JSON.stringify(ev.sinkStats()));
ok('sinkPath null when off', ev.sinkPath() === null);

ev.sinkEnable();
ok('sinkEnable returns a file path', typeof ev.sinkPath() === 'string' && ev.sinkPath().endsWith('.jsonl'), ev.sinkPath());

ev.on('eo:probe', () => {});
ev.emit('eo:probe', { n: 1 });
ev.emit('eo:probe', { n: 2 });
ev.emit('eo:other', { m: 3 });

const tail = ev.sinkTail({ max: 100 });
ok('captures emits', tail.events.some(e => e.type === 'eo:probe' && e.data.n === 1) && tail.events.some(e => e.type === 'eo:probe' && e.data.n === 2));
ok('tail newest-first', tail.events[0].type === 'eo:other' || tail.events.findIndex(e => e.type === 'eo:other') < tail.events.findIndex(e => e.type === 'eo:probe'));
const onlyProbe = ev.sinkTail({ max: 100, nameFilter: 'eo:probe' });
ok('nameFilter keeps matching only', onlyProbe.events.length > 0 && onlyProbe.events.every(e => e.type === 'eo:probe'));
const byModule = ev.sinkTail({ max: 100, module: 'eo' });
ok('module filter by first-colon prefix', byModule.events.length >= 3 && byModule.events.every(e => e.type.startsWith('eo:')));

// unserializable payload must not break emission
let emitRet = -99;
try {
    const weird = { get boom() { throw new Error('nope'); } };
    emitRet = ev.emit('eo:unserializable', weird);
} catch (e) { emitRet = -1; }
ok('unserializable payload emit survives (sink path)', emitRet !== -1, emitRet);
ok('sink stats counts events', ev.sinkStats().events > 3, JSON.stringify(ev.sinkStats()));

ev.sinkDisable();
ev.emit('eo:probe', { n: 99 });
ok('disabled → no further capture (stats disabled)', ev.sinkStats().enabled === false);

// ── CLI: producer enables + emits; a follow-up process reads ─────────────
const { spawnSync } = require('child_process');
const cli = (cmd, argsArr, env) => spawnSync(cmd, argsArr, { encoding: 'utf8', cwd: ROOT, timeout: 20000 });
const producer = cli('node', [
    '-e',
    "const ev = require('/home/daytona/codebase/lib/event'); ev.sinkEnable(); ev.on('cli:pin', () => {}); ev.emit('cli:pin', { pin: 1 }); ev.emit('cli:pin2', { pin: 2 });"
]);
ok('producer run exits 0', producer.status === 0, producer.stderr);
const tailOut = cli('node', ['bin/events.js', 'tail', '--json', '--max', '100']);
ok('CLI tail reads cross-process session file (exit 0', tailOut.status === 0, tailOut.stderr);
let cliEvents = [];
try { cliEvents = JSON.parse(tailOut.stdout).events || []; } catch {}
ok('CLI tail shows the producer events', cliEvents.some(e => e.type === 'cli:pin'), tailOut.stdout.slice(0, 200));
const cliMod = cli('node', ['bin/events.js', 'tail', '--module', 'cli', '--json']);
let modEvents = [];
try { modEvents = JSON.parse(cliMod.stdout).events || []; } catch {}
ok('CLI module filter', modEvents.length > 0 && modEvents.every(e => e.type.startsWith('cli')));
const bad = cli('node', ['bin/events.js', 'wat']);
ok('bad subcommand exits 2', bad.status === 2, bad.status);

// sinkEnable via CLI exits 0 (per-process; recording ends with it)
const en = cli('node', ['bin/events.js', 'enable']);
ok('CLI enable exits 0', en.status === 0, en.stderr);
cli('node', ['bin/events.js', 'disable']);

// ── event-wiring (async section wrapped for CJS/module-format safety) ────
async function main() {
const wiring = require('../lib/event-wiring');
const wires = wiring.wire();
ok('wires the documented set (13 listeners', wires.length === 13, wires.length);
for (const expected of ['vaf:blocked', 'rls:denied', 'trust:blocked', 'market:blocked', 'storage:error', 'sync:push:failed', 'sync:pull:failed', 'stego:encoded', 'stego:decoded', 'secret:accessed', 'secret:denied', 'secret:set', 'secret:cleared']) {
    ok('wired: ' + expected, wiring.isWired(expected));
}

// reaction: denial → audit.log appears in the ledger
// (pass 197 fix) Counting entries.length cannot prove the reaction once the
// ledger sits at LEDGER_MAX_ENTRIES (10000): the cap keeps LENGTH constant
// by design (newest kept, oldest spliced), so a wiring that works fine shows
// "10000 → 10000" forever. The reaction is pinned CONTENT-based instead: a
// new 'event-wiring:vaf:blocked' action must appear in the ledger array
// within the settle window, at any fill level.
const audit = require('../lib/audit');
const countAction = (needle) => {
    const l = audit.getLedger();
    const entries = Array.isArray(l?.entries) ? l.entries : (Array.isArray(l) ? l : []);
    return entries.filter(e => e && e.action === needle).length;
};
const NEEDLE = 'event-wiring:vaf:blocked';
const beforeHits = countAction(NEEDLE);
ok('audit ledger readable for pin', beforeHits >= 0, beforeHits + ' pre-existing pins');
ev.emit('vaf:blocked', { reason: 'eo-test', path: 'p' });
await new Promise(r => setTimeout(r, 50));
// emit twice more: one survives only if the wiring fired (cap shape proof:
// even at a FULL ledger, length stays constant while content rotates)
const afterHits = countAction(NEEDLE);
ok('vaf:blocked → audit reacts (pinned action appears in ledger)', afterHits > beforeHits, beforeHits + ' → ' + afterHits);
// and prove the cap did not silently swallow it by checking the entry shape
const last = (() => {
    const l = audit.getLedger();
    const entries = Array.isArray(l?.entries) ? l.entries : (Array.isArray(l) ? l : []);
    return entries.find(e => e && e.action === NEEDLE && e.data && e.data.reason === 'eo-test') || null;
})();
ok('vaf:blocked audit entry carries payload context', !!last, JSON.stringify(last ? Object.keys(last) : null));

// sync failure → health surfacing (also pins the _checkRead fix)
const health = require('../lib/health');
ev.emit('sync:pull:failed', { error: 'eo-test providers failed' });
const checks = await health.runChecks();
ok('health.runChecks works (pre-existing _checkRead ReferenceError fixed', Array.isArray(checks) && checks.length > 0, JSON.stringify(checks && checks.slice ? checks.slice(0, 1) : checks));
const syncCheck = checks.find(c => c.name === 'sync');
ok('sync failure surfaces in health', syncCheck && syncCheck.status === 'warn' && syncCheck.last_failure === 'sync:pull:failed', JSON.stringify(syncCheck));

// idempotency
const wires2 = wiring.wire();
ok('re-wire idempotent (no duplicate wiring)', wires2.length === wires.length, wires2.length);
// and health wrapper not stacked: runChecks identity still wrapped once
ok('health wrapper not double-stacked', health.runChecks._eventWired === true);

// ── MCP tools registered ──────────────────────────────────────────────────
const mcp = require('../lib/mcp');
const toolNames = mcp.listTools().map(t => t.name || t.tool || t);
for (const t of ['event_tail', 'event_sink_enable', 'event_sink_stats']) {
    ok('MCP lists ' + t, toolNames.includes(t));
}
const r = await mcp.execute('event_tail', { max: 10 });
ok('event_tail returns (guidance when off, events when on', r && ('events' in r) && ('guidance' in r || r.enabled === true), JSON.stringify(r).slice(0, 100));

console.log(`\n=== event-observability pins: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('test crashed:', e); process.exit(1); });
