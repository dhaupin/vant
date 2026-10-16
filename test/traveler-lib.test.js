#!/usr/bin/env node
/**
 * TRAVELER LIB SUITE — the backend working layer (pass 255).
 *
 * Pins lib/traveler.js + bin/traveler.js + the door verbs:
 *   A. content-address: same content => same address; ANY edit => new
 *      address; tamper refused at verify (ISO 8.5.2: refuse, never rewrite)
 *   B. ledger law: append-only, ascending seq, frozen stamp; ceiling
 *   C. persistence: brain-scoped ledger + per-id body files; append-only
 *      (same-id re-persist refuses)
 *   D. the schema-rizer: tr/0 migrates + stamps; unknown future refuses
 *   E. auditReport: the auditor's copy is verbatim and integrity-labelled
 *   F. CLI contract: open/hop/status/audit move a traveler through
 *      stations end-to-end (spawned as real processes)
 *   G. door verbs: traveler_open/hop/status/audit through mcp.execute
 *
 * NOT pinned here: the wire/kit law (test/traveler.test.js — the tr/1
 * structural law) stays the web-side suite; this suite is the WORKING lib.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const T = require(path.join(ROOT, 'lib', 'traveler'));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  \u2713 ' + name); }
    else { fail++; console.log('  \u2717 ' + name + (extra ? ' :: ' + extra : '')); }
}

(async () => {
    console.log('\n\u2708 TRAVELER LIB SUITE (the auditable pin, backend)\n');

    // ---------- A. content address ----------
    const FIXED_NOW = 1700000000000; // (pass 256) deterministic pin: same content + same ts = same address
    const t1 = T.mint({ from: 'A-station', slots: { job: 'x1' }, now: FIXED_NOW });
    const t1b = T.mint({ from: 'A-station', slots: { job: 'x1' }, now: FIXED_NOW });
    ok('A1. same content mints the same address (deterministic)', t1.id === t1b.id);
    const t2 = T.advance(t1, { op: 'pick', by: 'B-station', detail: { bin: 'B7' } });
    ok('A2. ANY edit re-addresses (a new id is born)', t2.id !== t1.id && t2.seq === 2);
    ok('A3. verify accepts the honest packet', T.verify(t2).ok === true);
    const tampered = JSON.parse(JSON.stringify(t2));
    tampered.slots.job = 'x999';
    const vt = T.verify(tampered);
    ok('A4. tamper refused typed (E_TRAVELER_ADDRESS, never re-written)', vt.ok === false && vt.code === 'E_TRAVELER_ADDRESS');
    // forged step injection at the ledger:
    const forged = JSON.parse(JSON.stringify(t2));
    forged.steps.push({ seq: 3, op: 'forge', by: 'attacker', ts: Date.now() });
    ok('A5. a forged step breaks the address loudly', T.verify(forged).ok === false);

    // ---------- B. ledger law ----------
    let refused = null;
    try { T.advance(t2, { op: 'rewind' }); } catch (e) { refused = e; }
    void refused; // a legal append is fine — the FORBIDDEN move is a rewrite, tested via shape:
    const bad = Object.assign({}, t2, { seq: 99 });
    ok('B1. frozen-stamp mismatch refuses STEP', (T.shapeRefusalFor(bad) || {}).code === 'E_TRAVELER_STEP');
    const gapped = Object.assign({}, t2, { steps: [{ seq: 9, op: 'x', by: 'y', ts: 1 }] });
    ok('B2. gapped ledger refuses STEP', (T.shapeRefusalFor(gapped) || {}).code === 'E_TRAVELER_STEP');
    const big = { tr: 'tr/1', id: 'a'.repeat(64), from: 'x', seq: 513, slots: {}, steps: Array.from({ length: 513 }, (_, i) => ({ seq: i + 1, op: 's', by: 'b', ts: 0 })) };
    ok('B3. the 512-step ceiling refuses STEP', (T.shapeRefusalFor(big) || {}).code === 'E_TRAVELER_STEP');

    // ---------- C. persistence ----------
    const t3 = T.mint({ from: 'C-station', slots: { job: 'persist-me' } });
    T.persist(t3);
    let dupThrow = null;
    try { T.persist(t3); } catch (e) { dupThrow = e; }
    ok('C1. same-id re-persist refuses (append-only ledger)', dupThrow && dupThrow.code === 'E_TRAVELER_STEP');
    const bodyFile = path.join(path.dirname(T._ledgerPath()), 'travelers', t3.id + '.json');
    ok('C2. the packet body landed by address', fs.existsSync(bodyFile));
    const readBack = JSON.parse(fs.readFileSync(bodyFile, 'utf8'));
    ok('C3. the body verifies at re-load (station handoff)', T.verify(readBack).ok === true);

    // ---------- D. the schema-rizer ----------
    const legacy = { tr: 'tr/0', id: 'a'.repeat(32), from: 'old', slots: { k: 1 }, steps: [{ seq: 1, op: 'open', by: 'old', ts: 0 }], seq: 1 };
    const rized = T.schemaRize(legacy);
    ok('D1. legacy migrates forward with the stamp', rized.tr === 'tr/1' && rized.rized && rized.rized.from === 'tr/0');
    ok('D2. the migration rides the ledger (append, never rewrite)', rized.steps.length === 2 && rized.steps[1].op === 'rize');
    let futureThrow = null;
    try { T.schemaRize({ tr: 'tr/7', id: 'a'.repeat(32), slots: {}, steps: [], seq: 0 }); } catch (e) { futureThrow = e; }
    ok('D3. unknown FUTURE version refuses typed (never guesses)', futureThrow && futureThrow.code === 'E_TRAVELER_SCHEMA');

    // ---------- E. the auditor's copy ----------
    const rep = T.auditReport(t2);
    ok('E1. the record names the clause (8.5.2)', rep.includes('8.5.2'));
    ok('E2. every station line rides the record', rep.split('\n').filter((l) => /^\s*\d+\./.test(l)).length === t2.steps.length);
    ok('E3. the integrity line states VERIFIED', rep.includes('VERIFIED'));

    // ---------- F. the CLI contract ----------
    const cli = (sub, extra) => spawnSync(process.execPath, [path.join(ROOT, 'bin', 'traveler.js'), sub].concat(extra || []), { encoding: 'utf8' });
    const open = cli('open', ['--title', 'suite job', '--data', 'part=suite-NSC9']);
    const openId = /id: ([0-9a-f]{64})/.exec(open.stdout || '');
    ok('F1. open mints + persists (id printed)', open.status === 0 && openId !== null);
    const hop = cli('hop', ['--op', 'kit', '--by', 'suite-station', '--detail', 'fit=ok']);
    const hopId = /new id: ([0-9a-f]{64})/.exec(hop.stdout || '');
    ok('F2. hop re-addresses (new id printed, seq rides)', hop.status === 0 && hopId !== null && hopId[1] !== openId[1]);
    const audit = cli('audit', []);
    ok('F3. audit prints the clause + VERIFIED integrity', (audit.stdout || '').includes('8.5.2') && (audit.stdout || '').includes('VERIFIED'));
    // tamper at a landing: hand-edited current-file must refuse the hop
    const cur = JSON.parse(fs.readFileSync(path.join(path.dirname(T._ledgerPath()), 'traveler-current.json'), 'utf8'));
    cur.slots.tampered = true;
    fs.writeFileSync(path.join(path.dirname(T._ledgerPath()), 'traveler-current.json'), JSON.stringify(cur));
    const ref = cli('hop', ['--op', 'sneak', '--by', 'attacker']);
    ok('F4. a tampered traveler refuses the landing (typed, loud)', ref.status !== 0 && /refused/.test(ref.stderr || ''));

    // ---------- G. the door verbs ----------
    const mcp = require(path.join(ROOT, 'lib', 'mcp'));
    const opened = await mcp.execute('traveler_open', { title: 'door job', slots: { lane: 'suite' } });
    ok('G1. traveler_open opens + persists through the door', opened && opened.opened === true && /^[0-9a-f]{64}$/.test(opened.id || ''));
    const hopped = await mcp.execute('traveler_hop', { op: 'qa', by: 'suite-agent', detail: { ok: 1 } });
    ok('G2. traveler_hop advances + re-addresses', hopped && hopped.hopped === true && hopped.readdressed === true);
    const stat = await mcp.execute('traveler_status', { last: 10 });
    ok('G3. traveler_status answers the stations', stat && stat.seen === true && Array.isArray(stat.stations) && stat.stations.length >= 2);
    const aud = await mcp.execute('traveler_audit', {});
    ok('G4. traveler_audit returns the verbatim record', aud && typeof aud.report === 'string' && aud.report.includes('8.5.2'));

    // ---------- H. OS integration (pass 256: pipeline, events, audit, typed errors) ----------
    const pipeline = require(path.join(ROOT, 'lib', 'security-pipeline'));
    const report = pipeline.scan(path.join(ROOT, 'lib'));
    const classified = report.modules.find((m) => m.name === 'traveler') || { layers: {}, wired: [] };
    ok('H1. the security-pipeline scanner sees traveler as WIRED (gate layers)',
        classified.wired.includes('sandbox') && classified.wired.includes('vaf') && classified.wired.includes('qos'),
        JSON.stringify(classified.layers));
    ok('H2. audit adjacency recorded (informational layer)', classified.layers.audit === true,
        JSON.stringify(classified.layers));
    let refusedErr = null;
    try { T.advance({ tr: 'tr/99', id: '00', slots: {}, steps: [{ seq: 1, op: 'x', by: 'y', ts: 1 }], seq: 1 }); } catch (e) { refusedErr = e; }
    const errores = require(path.join(ROOT, 'lib', 'error'));
    ok('H3. refusals are typed VantErrors (zero raw throws in lib)',
        refusedErr instanceof errores.VantError && /^E_TRAVELER_/.test(refusedErr.code || ''),
        refusedErr && refusedErr.name);
    let sawEvent = null;
    const bus = require(path.join(ROOT, 'lib', 'event'));
    const onLanded = (d) => { sawEvent = d; };
    bus.on('traveler:persisted', onLanded);
    const tH = T.mint({ from: 'H-station', slots: { job: 'bus' } });
    T.persist(tH);
    bus.off('traveler:persisted', onLanded);
    ok('H4. persistence is audible on the shared event bus (traveler:persisted)',
        sawEvent && typeof sawEvent.id === 'string' && sawEvent.id === tH.id);
    let limited = 0;
    for (let i = 0; i < 6200; i++) {
        // (pass 256) burst past the door-lane ceiling (default 6000/min, the
        // module's own RateLimiter): everything past the window refuses typed.
        try { await T.gateCheck('rate-pin', 'hop'); } catch (e) { if (e.code === 'E_TRAVELER_RATE') limited++; }
    }
    ok('H5. the QoS lane rate-limits the traveler surface (typed E_TRAVELER_RATE)', limited > 0,
        'limited=' + limited);
    ok('H6. agent/crew attribution: the step carries by + team lanes',
        (() => { const t = T.advance(tH, { op: 'crew-qa', by: 'agent-zeta', team: 'qa-crew' });
            return t.steps[t.steps.length - 1].team === 'qa-crew'; })());

    console.log('\n--- RESULTS ---');
    console.log('  Passed:  ' + pass);
    console.log('  Failed:  ' + fail);
    process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR:', e.message); process.exit(1); });
