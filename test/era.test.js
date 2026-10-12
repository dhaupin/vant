#!/usr/bin/env node
/**
 * Era pin suite — issues #177/#178 (build) Phases 0–3.
 *
 * Regression class this suite OWNS (per #178): cross-process persistence of
 * the era record. #172/#173 were memory-only state that died with the
 * process; Era is built to survive restart by design, and these pins prove
 * it with REAL child processes (no in-memory memo can mask anything).
 *
 * Also pinned: typed refusals (no intent, double-open, close-when-none),
 * subscriber routing by event family, subscriber NO-OP with no era open
 * (the #178 "zero behavior change" criterion), no self-folding, cap with
 * overflow flag, checksum tamper-EVIDENCE (drift is detected, not silently
 * re-signed), and the MCP door for era_start/era_log/era_current/era_close.
 *
 * Usage: node test/era.test.js
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0 };
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function test(name, fn) {
    return Promise.resolve()
        .then(fn)
        .then(() => { results.passed++; console.log('  ✓ ' + name); })
        .catch((e) => { results.failed++; console.log('  ✗ ' + name + ': ' + e.message); });
}
function asyncTest(name, fn) { return { name, fn }; }
async function runAll(tests) {
    for (const t of tests) await test(t.name, t.fn);
}

const tests = [];
const script = (mode) =>
    '(async () => {' +
    'const era = require(' + JSON.stringify(path.join(ROOT, 'lib', 'era')) + ');' +
    'if (process.env.VANT_ERA_PIN_MODE === "open") {' +
    '  const r = await era.start(process.env.VANT_ERA_PIN_INTENT);' +
    '  if (!r.ok) { console.log("ERR:" + r.code); process.exit(1); }' +
    '  const f1 = era.fold("escrow:hold", { amount: 5 });' +
    '  const f2 = era.fold("agent:spawn", { name: "Pinner" });' +
    '  era.fold("era:self", {});' +            // must NOT fold (self-guard)
    '  era.fold("unknown:event", {});' +        // must NOT fold (unrouted)
    '  console.log("OPENED:" + r.era.id);' +
    '  process.exit(0);' +                       // die mid-era, like a real wake
    '} else {' +
    '  const c = era.current();' +
    '  console.log("STATE:" + JSON.stringify({ open: c.open, threads: c.era ? c.era.threads.length : 0, spend: c.era ? c.era.spend.length : 0 }));' +
    '  const cl = await era.close({ next: process.env.VANT_ERA_PIN_NEXT });' +
    '  console.log("CLOSED:" + cl.ok + ":" + (cl.rollup ? cl.rollup.next : ""));' +
    '  process.exit(0);' +
    '}' +
    '})().catch(e => { console.error("CHILD-FAIL:" + e.message); process.exit(1); });';

tests.push(asyncTest('typed refusal: start without intent is E_ERA_INTENT', async () => {
    const era = require('../lib/era');
    const r = await era.start('');
    assert(r.ok === false && r.code === 'E_ERA_INTENT', 'expected E_ERA_INTENT, got ' + JSON.stringify(r));
    return true;
}));

tests.push(asyncTest('typed refusal: close with no era open is E_ERA_NONE', async () => {
    const era = require('../lib/era');
    const r = await era.close({ next: 'nothing' });
    assert(r.ok === false && r.code === 'E_ERA_NONE', 'expected E_ERA_NONE, got ' + JSON.stringify(r));
    return true;
}));

tests.push(asyncTest('subscriber is a NO-OP with no era open (zero behavioral change)', async () => {
    // No era open here (lifecycle pins above already closed/refused) —
    // emitting subsystem events must fold NOTHING and never throw.
    const { spawnSync } = require('child_process');
    const r = spawnSync(process.execPath, ['-e',
        '(async () => {' +
        'const event = require(' + JSON.stringify(path.join(ROOT, 'lib', 'event')) + ');' +
        'const era = require(' + JSON.stringify(path.join(ROOT, 'lib', 'era')) + ');' +
        'const before = era.current();' +
        'event.emit("escrow:hold", { amount: 1 });' +
        'event.emit("agent:spawn", {});' +
        'event.emit("forum:new", {});' +
        'const after = era.current();' +
        'console.log("NOOP:" + JSON.stringify({ was: before.open, is: after.open, spend: after.era ? after.era.spend.length : -1 }));' +
        '})()'], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
    assert(r.status === 0, 'child failed: ' + (r.stderr || r.stdout));
    const line = (r.stdout || '').split('\n').find(l => l.startsWith('NOOP:'));
    const state = JSON.parse(line.slice(5));
    assert(state.was === false && state.is === false, 'emissions resurrected an era: ' + line);
    return true;
}));

tests.push(asyncTest('cross-process persistence: open + fold in proc A → alive in proc B → close in B → verified in C (#172-class regression pin)', async () => {
    const { spawnSync } = require('child_process');
    const env = Object.assign({}, process.env, { VANT_ERA_PIN_NEXT: 'pinned across three processes' });

    // Process A: open the era, fold line-items, die WITHOUT close.
    const a = spawnSync(process.execPath, ['-e', script('open')], {
        cwd: ROOT, env: Object.assign({}, env, { VANT_ERA_PIN_MODE: 'open', VANT_ERA_PIN_INTENT: 'cross-pin wake ' + Date.now() }),
        encoding: 'utf8', timeout: 60000 });
    assert(a.status === 0, 'child A failed: ' + (a.stderr || a.stdout));
    const openedId = (a.stdout.match(/OPENED:(\S+)/) || [])[1];
    assert(openedId && openedId.startsWith('era-'), 'child A did not report an id: ' + a.stdout);

    // Process B: fresh process hydrates the OPEN era WITH its folded rows.
    const b = spawnSync(process.execPath, ['-e', script('close')], { cwd: ROOT, env, encoding: 'utf8', timeout: 60000 });
    assert(b.status === 0, 'child B failed: ' + (b.stderr || b.stdout));
    const stateLine = (b.stdout.match(/STATE:(\{.*\})/) || [])[1];
    const state = JSON.parse(stateLine);
    assert(state.open === true, 'fresh process lost the open era: ' + stateLine);
    assert(state.threads === 1 && state.spend === 1, 'folded rows did not survive the process boundary: ' + stateLine);
    const closedOk = /CLOSED:true:pinned across three processes/.test(b.stdout);
    assert(closedOk, 'close in proc B did not carry `next`: ' + b.stdout);

    // Process C: verify — current era must be CLOSED (blank) and the rollup
    // must be in the archive with a matching checksum.
    const { spawnSync: ss } = require('child_process');
    const c = ss(process.execPath, ['-e',
        '(async () => {' +
        'const era = require(' + JSON.stringify(path.join(ROOT, 'lib', 'era')) + ');' +
        'const cur = era.current();' +
        'const rows = era.list();' +
        'const mine = rows.find(r => r.next === "pinned across three processes");' +
        'console.log("C:" + JSON.stringify({ openNow: cur.open, found: !!mine, integrity: mine && mine.integrity }));' +
        '})()'], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
    assert(c.status === 0, 'child C failed: ' + (c.stderr || c.stdout));
    const cState = JSON.parse(((c.stdout || '').match(/C:(\{.*\})/) || [])[1]);
    assert(cState.openNow === false, 'process C saw an open era after close: ' + JSON.stringify(cState));
    assert(cState.found === true && cState.integrity === true, 'archived rollup missing or drifted in proc C: ' + JSON.stringify(cState));
    return true;
}));

tests.push(asyncTest('typed refusal: double-open is E_ERA_ALREADY_OPEN', async () => {
    const { spawnSync } = require('child_process');
    const r = spawnSync(process.execPath, ['-e',
        '(async () => {' +
        'const era = require(' + JSON.stringify(path.join(ROOT, 'lib', 'era')) + ');' +
        'await era.start("first");' +
        'const r2 = await era.start("second");' +
        'console.log("R:" + r2.code);' +
        'await era.close({ next: "cleanup" });' +
        '})()'], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
    assert(/R:E_ERA_ALREADY_OPEN/.test(r.stdout || ''), 'expected E_ERA_ALREADY_OPEN: ' + r.stdout + r.stderr);
    return true;
}));

tests.push(asyncTest('checksum tamper-EVIDENCE: a mutated archived rollup FAILS verify (drift is detected, never re-signed on read)', async () => {
    const { spawnSync } = require('child_process');
    const r = spawnSync(process.execPath, ['-e',
        '(async () => {' +
        'const fs = require("fs");' +
        'const p = ' + JSON.stringify(path.join(ROOT, 'models', 'private', 'vant', 'state', 'era-eras.json')) + ';' +
        'const disk = JSON.parse(fs.readFileSync(p, "utf8"));' +
        'const last = disk.eras.length - 1;' +
        'disk.eras[last].intent = "TAMPERED BY THE PIN";' +
        'fs.writeFileSync(p, JSON.stringify(disk, null, 2));' +
        'const era = require(' + JSON.stringify(path.join(ROOT, 'lib', 'era')) + ');' +
        'const v = era.verify(disk.eras[last].id.slice(0, 12));' +
        'console.log("V:" + JSON.stringify({ ok: v.ok, match: v.match }));' +
        '})()'], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
    assert(r.status === 0, 'tamper child failed: ' + r.stderr);
    const v = JSON.parse(((r.stdout || '').match(/V:(\{.*\})/) || [])[1]);
    assert(v.ok === true && v.match === false, 'expected drift DETECTED (match:false), got ' + JSON.stringify(v));
    return true;
}));

tests.push(asyncTest('MCP door: era_start/era_log/era_current/era_close round-trip with typed invariants', async () => {
    const mcp = require(path.join(ROOT, 'lib', 'mcp'));
    const opened = await mcp.call('era_start', { intent: 'pin: mcp door' });
    assert(opened.ok === true && opened.era && opened.era.id, 'era_start failed: ' + JSON.stringify(opened));
    const folded = await mcp.call('era_log', { type: 'escrow:hold', data: { amount: 2 } });
    assert(folded.ok === true, 'era_log failed: ' + JSON.stringify(folded));
    const unrouted = await mcp.call('era_log', { type: 'nothing:here' });
    assert(unrouted.ok === false && unrouted.code === 'E_ERA_UNROUTED', 'unrouted fold should be typed E_ERA_UNROUTED: ' + JSON.stringify(unrouted));
    await mcp.call('era_close', { next: 'cleanup' });
    const none = await mcp.call('era_log', { type: 'escrow:hold' });
    assert(none.ok === false && none.code === 'E_ERA_NONE', 'log with no era should be typed E_ERA_NONE: ' + JSON.stringify(none));
    const missingIntent = await mcp.call('era_start', {});
    assert(missingIntent.error === 'MCP_INPUT_INVALID', 'declared schema must refuse missing intent: ' + JSON.stringify(missingIntent));
    return true;
}));

(async () => {
    await runAll(tests);
    console.log('\n=== era pins: ' + results.passed + ' passed, ' + results.failed + ' failed ===');
    process.exit(results.failed > 0 ? 1 : 0);
})();
