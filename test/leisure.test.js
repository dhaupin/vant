#!/usr/bin/env node
/**
 * Leisure — the want-list keeper (#196, free-time methodology).
 *
 * Pins: want recording (dedupe, note refresh, refusal), spirit-first
 * ordering (never-pursued and longest-held rotation; NOT a queue),
 * markPursued receipts + history cap, forget semantics, suggest
 * rotation, pursue() one-shot AND stretched (arms a REAL tempo budget
 * keyed to the want — the #196/#197 clock pair), consultBreath cadence,
 * dreamReview rollup, and the isolation rule (typed refusals instead of
 * raw crashes; side-effect-free re-require; ledger stays under
 * models/leisure, per brain).
 *
 * Determinism note: every state-sensitive test RESETS the throwaway
 * brain's ledger (file wipe + module reload) first — the keeper's whole
 * point is persistence, so the suite must not depend on what a previous
 * run already held.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log('  ✓ ' + name); }
    catch (e) { failed++; console.log('  ✗ ' + name + ' — ' + e.message); }
}

console.log('\n🪷 LEISURE TESTS (#196 — want-list keeper, free-time methodology)\n');

const BRAIN = 'lwtest';
const OPT = { brain: BRAIN };

const LEISURE_PATH = path.join(ROOT, 'lib', 'leisure.js');
function load() {
    delete require.cache[require.resolve(LEISURE_PATH)];
    return require(LEISURE_PATH);
}
let leisure = load();
const tempo = require(path.join(ROOT, 'lib', 'tempo'));

const LW_FILE = leisure._ledgerPath(BRAIN);
assert.ok(LW_FILE.includes(path.join('models', 'leisure')), 'ledger stays under models/leisure: ' + LW_FILE);
assert.ok(/lwtest\.json$/.test(LW_FILE), 'per-brain filename: ' + LW_FILE);

function resetLedger() {
    try { fs.rmSync(LW_FILE, { force: true }); } catch (e) {}
    leisure = load();
}

// ---------- want: recording, dedupe, refusal ----------

test('want: records an entry with id + defaults', () => {
    resetLedger();
    const e = leisure.want('re-read the geometry lib for pleasure', OPT);
    assert.ok(e.id && e.id.startsWith('lw-'));
    assert.strictEqual(e.pursuedCount, 0);
    assert.strictEqual(e.lastPursued, null);
    assert.strictEqual(e.brain, BRAIN);
});

test('want: dedupes normalized text; pursued-count survives a re-statement; note refreshes', () => {
    resetLedger();
    const a = leisure.want('Re-Read the Geometry LIB  for Pleasure', OPT);
    leisure.markPursued(a.id, OPT);
    const b = leisure.want('re-read the geometry lib for pleasure', { ...OPT, note: 'fold laws' });
    assert.strictEqual(b.id, a.id, 'same want, same entry');
    assert.strictEqual(b.pursuedCount, 1, 'dedupe never resets the pursued count');
    assert.strictEqual(b.note, 'fold laws', 're-statement refreshes the context note');
    const s = leisure.status(OPT);
    assert.strictEqual(s.wants.length, 1, 'one entry, not two');
});

test('want: empty text refused with a typed error (no raw crash)', () => {
    const errors = require(path.join(ROOT, 'lib', 'error'));
    for (const bad of ['', '   ']) {
        let code = null;
        try { leisure.want(bad, OPT); } catch (e) { code = e && e.code; }
        assert.strictEqual(code, errors.CODES.VAF_INPUT_INVALID, 'typed refusal for ' + JSON.stringify(bad) + ', got: ' + code);
    }
});

// ---------- the spirit-first order (a want-list, NOT a queue) ----------

test('wantsToDo/suggest: never-pursued leads the once-pursued (held-longest rotation, NOT a queue)', () => {
    resetLedger();
    const alpha = leisure.want('orbit-pin alpha want', OPT);          // never pursued
    const beta = leisure.want('orbit-pin beta want', OPT);            // will be pursued once
    leisure.markPursued(beta.id, { ...OPT, note: 'orbit-pin receipt' });
    const list = leisure.wantsToDo(OPT);
    const ia = list.findIndex(w => w.id === alpha.id);
    const ib = list.findIndex(w => w.id === beta.id);
    assert.ok(ia >= 0 && ib >= 0, 'both fresh wants are on the list');
    assert.strictEqual(list[ib].pursuedCount, 1);
    assert.ok(list[ib].lastPursued > 0);
    assert.ok(ia < ib, 'never-pursued (alpha) leads the pursued (beta): ia=' + ia + ' ib=' + ib);
    assert.strictEqual(leisure.suggest(OPT).id, list[0].id, 'suggest reads the same rotation');
    leisure.forget(alpha.id, OPT);
    leisure.forget(beta.id, OPT);
});

// ---------- markPursued / forget ----------

resetLedger();
leisure.want('stare at the amber field pin', OPT);

test('markPursued: fuzzy text match, receipt note, history, unknown honest refusal', () => {
    const out = leisure.markPursued('amber field', { ...OPT, note: '85 seed dots at 137.5 degrees' });
    assert.ok(out.ok, JSON.stringify(out));
    assert.ok(out.entry.pursuedCount >= 1);
    assert.strictEqual(out.entry.lastNote, '85 seed dots at 137.5 degrees');
    const s = leisure.status(OPT);
    assert.ok(s.recentHistory.some(h => /amber field/.test(h.want) && /137.5/.test(h.note)), 'history carries the receipt');
    const unknown = leisure.markPursued('no-such-want-anywhere', OPT);
    assert.strictEqual(unknown.ok, false);
    assert.ok(unknown.reason);
});

test('forget: removes by id or fuzzy text; honest refusal when absent', () => {
    const e = leisure.want('temporary whim pin', OPT);
    assert.ok(leisure.forget(e.id, OPT).ok);
    assert.strictEqual(leisure.wantsToDo(OPT).some(w => w.want === 'temporary whim pin'), false);
    const fuzzy = leisure.forget('amber field pin', OPT);
    assert.ok(fuzzy.ok && /amber field/.test(fuzzy.removed.want), 'fuzzy removal works');
    assert.strictEqual(leisure.forget('nothing-matches', OPT).ok, false);
});

// ---------- suggest / pursue (the DOING seam) ----------

test('suggest: honest null on an empty ledger brain', () => {
    assert.strictEqual(leisure.suggest({ brain: 'lwempty-brain' }), null);
});

resetLedger();
leisure.want('dodecahedra duals pin (one-shot pursuit)', OPT);

test('pursue: one-shot runs a real step through tempo.pace and marks pursued', () => {
    const before = leisure.status(OPT).pursuedTotal;
    const top = leisure.suggest(OPT);
    assert.ok(top, 'a want exists to pursue');
    const out = leisure.pursue({
        ...OPT,
        step: () => ({ learned: 'duals of dodecahedra are icosahedra' })
    });
    assert.ok(out.ok, JSON.stringify(out));
    assert.strictEqual(out.stretched, false);
    assert.ok(/learned/.test(JSON.stringify(out.pace)));
    assert.ok(leisure.status(OPT).pursuedTotal > before, 'the pursuit was marked');
    assert.strictEqual(out.want, top.want, 'pursue picks the rotation\'s top when no want is named: ' + out.want);
});

test('pursue: stretched arms a REAL tempo budget keyed to the want', () => {
    const out = leisure.pursue({
        ...OPT,
        want: 'stretch-pin want (amber field, until the sunflower appears)',
        duration: '6s', sliceMs: '2000',
        step: () => ({ learned: 'slice pin' })
    });
    assert.ok(out.ok && out.stretched);
    assert.ok(out.controller.id.startsWith('tempo-'), 'budget via tempo: ' + out.controller.id);
    assert.ok(/leisure/.test(out.controller.label), 'label carries the want context');
    const ledger = tempo._readLedger();
    assert.ok(ledger.budgets[out.controller.id], 'the budget exists on the tempo ledger');
    out.controller.end('pin: stretch verified'); // explicit early end; leave the tempo ledger clean
    leisure.forget('stretch-pin want', OPT);
});

test('pursue: refuses without a step and on an empty want-list (typed)', () => {
    const errors = require(path.join(ROOT, 'lib', 'error'));
    let code1 = null, code2 = null;
    try { leisure.pursue({}); } catch (e) { code1 = e && e.code; }
    try { leisure.pursue({ brain: 'lwempty-brain', step: () => {} }); } catch (e) { code2 = e && e.code; }
    assert.strictEqual(code1, errors.CODES.VAF_INPUT_INVALID, 'no step fn → typed: ' + code1);
    assert.strictEqual(code2, errors.CODES.VAF_INPUT_INVALID, 'empty list → typed: ' + code2);
});

// ---------- the loop seams: zen breath + dream review ----------

resetLedger();
leisure.want('breath-pin: what play is held', OPT);

test('consultBreath: rotated consult on the 4th-breath cadence only', () => {
    assert.strictEqual(leisure.consultBreath(1), null, 'off-cadence');
    assert.strictEqual(leisure.consultBreath(2), null);
    const s4 = leisure.consultBreath(4, OPT);
    assert.ok(s4 && s4.want, '4th breath consults the list: ' + JSON.stringify(s4));
    assert.ok(leisure.consultBreath(8, OPT).want, 'every 4th');
    assert.strictEqual(leisure.consultBreath(0), null, 'breath 0 never consults');
    assert.strictEqual(leisure.consultBreath(3, { brain: 'lwempty-brain' }), null, 'off-cadence + empty ledger both honestly null');
    assert.strictEqual(leisure.consultBreath(4, { brain: 'lwempty-brain' }), null, 'empty ledger on cadence → honest null, never a fake suggestion');
});

test('dreamReview: read-only rollup of what is aging', () => {
    const r = leisure.dreamReview(OPT);
    assert.ok(r && r.open > 0, 'sees the open wants: ' + JSON.stringify(r));
    assert.ok(typeof r.aging === 'number');
    assert.ok(r.oldestUntouchedDays >= 0);
    assert.ok(r.suggestion, 'carries the top candidate for dream to note in its own style');
    assert.strictEqual(leisure.dreamReview({ brain: 'lwempty-brain' }), null, 'empty ledger → honest null');
});

// ---------- isolation + contracts ----------

resetLedger();
leisure.want('re-require pin: play survives a reload', OPT);

test('isolation: re-require is side-effect free and path-stable', () => {
    const p1 = leisure._ledgerPath(BRAIN);
    const fresh = load();
    assert.strictEqual(fresh._ledgerPath(BRAIN), p1, 'no new path discipline on reload');
    assert.ok(Array.isArray(fresh.wantsToDo(OPT)) && fresh.wantsToDo(OPT).length === 1, 'reload sees the persisted list (disk truth)');
});

test('isolation: non-safe brain names cannot escape models/leisure', () => {
    for (const hostile of ['../../evil', '../..', '/abs/path', 'a/b/c']) {
        const p = leisure._ledgerPath(hostile);
        const resolved = path.resolve(p);
        assert.ok(!p.includes('..'), 'no traversal survives the brain name: ' + p);
        assert.ok(resolved.endsWith(path.join('models', 'leisure') + path.sep + path.basename(p)), 'every ledger stays inside models/leisure: ' + resolved);
    }
});

// ---------- report ----------

console.log('\n=== leisure pins: ' + passed + ' passed, ' + failed + ' failed ===\n');
process.exit(failed > 0 ? 1 : 0);
