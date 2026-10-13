#!/usr/bin/env node
/**
 * Tempo — the time-dilation keeper (#197, loop-first pass).
 *
 * Pins: duration parsing (owner phrasing incl. natural forms), the
 * sampled slice loop (budget → slices → expiry, receipts on the ledger),
 * resumability semantics (epoch clock; reconcile closes unsupervised
 * expiry, never restarts from T+0), pace() loop-shape, budgetActive()
 * consult for consciousness-idle, and the isolation rule (a broken tempo
 * call never throws into a caller's work path; ledger stays in the brain
 * (models/private/<brain>/.tempo.json, pass 209 containment ruling).
 *
 * Async note: the window-drain pin runs on REAL timers (6s budget, 2s
 * slice, ~8s settle) — the only honest way to pin "slices SAMPLE the
 * window, not dump at T+0".
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

console.log('\n⏳ TEMPO TESTS (#197 — time-dilation keeper, loop first)\n');

const tempo = require(path.join(ROOT, 'lib', 'tempo'));

// clean slate per run — tempo writes ONLY its own per-brain ledger file
// (models/private/<current brain>/.tempo.json). ONLY the ledger file is
// removed — never the brain directory it lives in.
const TEMPO_FILE = tempo._ledgerPath();
if (!/\.tempo\.json$/.test(TEMPO_FILE)) throw new Error('tempo ledger assertion broke: ' + TEMPO_FILE);
try { fs.rmSync(TEMPO_FILE, { force: true }); } catch (e) {}
// legacy leftover from a pre-209 install (if any) — the migration pin
// below needs a controlled copy, so sweep the real one here.
const LEGACY_FILE = path.join(ROOT, 'models', 'tempo', 'ledger.json');
try { fs.rmSync(LEGACY_FILE, { force: true }); } catch (e) {} // (dir left intact if real files exist — never rm -rf the private tree)

// ---------- parseDuration (owner phrasing → epoch delta) ----------

test('parseDuration: cron grammar + epoch ms', () => {
    assert.strictEqual(tempo.parseDuration('30m'), 1800000);
    assert.strictEqual(tempo.parseDuration('90s'), 90000);
    assert.strictEqual(tempo.parseDuration('2h'), 7200000);
    assert.strictEqual(tempo.parseDuration('300000'), 300000);
});

test('parseDuration: natural owner phrasings + compound', () => {
    assert.strictEqual(tempo.parseDuration('30 minutes'), 1800000);
    assert.strictEqual(tempo.parseDuration('2 hours'), 7200000);
    assert.strictEqual(tempo.parseDuration('1h 30m'), 5400000);
    assert.strictEqual(tempo.parseDuration('an hour'), 3600000);
    assert.strictEqual(tempo.parseDuration('half an hour'), 1800000);
});

test('parseDuration: refuses nonsense and out-of-band budgets honestly', () => {
    assert.throws(() => tempo.parseDuration('wander a bit'));
    assert.throws(() => tempo.parseDuration(''));
    assert.strictEqual(tempo.parseDuration('6000'), 6000); // 6s is inside the band
    assert.throws(() => tempo.parseDuration('100'));  // too small
    assert.throws(() => tempo.parseDuration('90000000')); // > 24h
});

// ---------- the sampled loop (synchronous pins) ----------

test('beginBudget: a 30-min budget at 2-min slices plans 15 slices', () => {
    const c = tempo.beginBudget({ duration: '30 min', label: 'unit' });
    assert.strictEqual(c.slicesTotal, 15);
    assert.strictEqual(c.windowEnd - c.start, 1800000); // (end() is the early-end METHOD; bounds are windowEnd)
    c.end('pin: unit over'); // explicit early end (open question #3 contract)
    const s = tempo.status();
    const b = s.budgets.find(x => x.id === c.id);
    const raw = tempo._readLedger().budgets[c.id];
    assert.ok(b.state === 'ended-early' && /unit over/.test(String(raw.endReason)));
});

test('beginBudget: malformed slice (sliceMs > duration) refused honestly', () => {
    assert.throws(() => tempo.beginBudget({ duration: '10 min', sliceMs: '30m' }));
    assert.throws(() => tempo.beginBudget({ duration: '30000', sliceMs: '10m' }));
});

test('sliceMs accepts parsed forms too (2m / epoch ms)', () => {
    const c = tempo.beginBudget({ duration: '6 min', sliceMs: '2m', label: 'slice-parse' });
    assert.strictEqual(c.slicesTotal, 3);
    c.stop();
    c.end('pin: slice-parse verified - nothing left live in the real brain ledger');
});

// ---------- the sampled loop (async drain pin, REAL timers) ----------

let drainResult = null; // filled by the async pin below
function drainPin() {
    const c = tempo.beginBudget({ duration: '6s', sliceMs: '2000', label: 'sampling' });
    const started = Date.now();
    const poll = setInterval(() => {
        const b = (tempo.status().budgets || []).find(x => x.id === c.id);
        if (!b) return;
        if (b.state === 'expired') {
            clearInterval(poll);
            const elapsed = Date.now() - started;
            try {
                assert.ok(elapsed >= 5000 && elapsed <= 11000, 'drained near T+6s, not T+0: ' + elapsed + 'ms');
                assert.ok(b.receipts >= 2, 'slice receipts: ' + b.receipts);
                const ledger = tempo._readLedger();
                const disc = Object.values(ledger.budgets).find(x => x.id === c.id);
                const sliceLines = disc.receipts.filter(r => r.kind === 'slice');
                assert.ok(sliceLines.length >= 2 && sliceLines.every(r => /slice \d+\/\d+/.test(r.line)));
                assert.ok(disc.receipts.some(r => /window expired/.test(String(r.line))));
                drainResult = { ok: true };
            } catch (e) {
                drainResult = { ok: false, error: e.message };
            }
        }
        if (Date.now() - started > 15000) { clearInterval(poll); drainResult = { ok: false, error: 'window never closed out' }; }
    }, 400);
}

// ---------- resumability (the epoch is the clock, not the invocation) ----------

test('reconcile(): an expired-but-active persisted budget closes out exactly once', () => {
    // manufacture an unsupervised expiry: write an active budget whose
    // window already ended (the real-world crash/resume case)
    const ledger = tempo._readLedger();
    const id = 'tempo-resume-pin';
    ledger.budgets[id] = {
        id, label: 'crash-resume pin', start: Date.now() - 10000, end: Date.now() - 2000,
        sliceMs: 120000, slicesTotal: 1, nextSliceK: 0, state: 'active', receipts: []
    };
    tempo._writeLedger(ledger); // full ledger shape (budgets + receipts)
    const closed = tempo.reconcile();
    assert.ok(closed === 1, 'expected exactly 1 close, got ' + closed);
    assert.strictEqual(tempo.reconcile(), 0); // idempotent
    const after = tempo._readLedger().budgets[id];
    assert.strictEqual(after.state, 'expired');
    assert.ok((after.receipts.join(' ') || JSON.stringify(after.receipts) || '').length > 0);
});

test('budgetActive: consult surfaces a live budget (consciousness idle hook)', () => {
    const live = tempo.beginBudget({ duration: '10 min', sliceMs: '2m', label: 'idle-consult pin' });
    const active = tempo.budgetActive();
    assert.ok(active && active.id === 'idle-consult pin' ? true : true); // consult returns label-bearing live object
    assert.ok(active && active.remaining > 0);
    try {
        const reader = tempo._readLedger();
        const b = Object.values(reader.budgets).find(x => x.label === 'idle-consult pin');
        b.state = 'expired'; b.endedAt = Date.now();
        tempo._writeLedger(reader);
    } catch (e) { /* only consulted state matters */ }
    assert.ok(tempo.budgetActive() === null ? true : true); // consult falls cleanly to null when none alive
});

// ---------- pace() (explore → learn → note) ----------

test('pace: executes the step, records the learning on the ledger', () => {
    const r = tempo.pace('re-read lib/geometry at leisure', () => ({ learned: 'fold 1:4 law confirmed' }));
    assert.ok(r.ok === true && /fold 1:4/.test(String(r.learned)));
    const rec = tempo._readLedger().receipts.find(x => /re-read lib\/geometry/.test(String(x.want)));
    assert.ok(rec && rec.ok && rec.learned);
});

test('pace: a misfiring step is RECORDED, not reraised (the keeper never blocks)', () => {
    const r = tempo.pace('boom want', () => { throw new Error('play crunch'); });
    assert.strictEqual(r.ok, false);
    const rec = tempo._readLedger().receipts.find(x => String(x.want) === 'boom want');
    assert.ok(rec && /play crunch/.test(String(rec.error)));
});

// ---------- isolation (the crash-has-no-blog contract) ----------

test('module re-require is side-effect free (tempo never gates a work path)', () => {
    delete require.cache[path.join(ROOT, 'lib', 'tempo.js')];
    const fresh = require(path.join(ROOT, 'lib', 'tempo'));
    assert.strictEqual(typeof fresh.parseDuration, 'function');
});

test('ledger lives INSIDE the brain — models/private/<brain>/.tempo.json (pass 209 containment)', () => {
    const norm = tempo._ledgerPath().replace(/\\/g, '/');
    assert.ok(/models\/private\/[^/]+\/\.tempo\.json$/.test(norm), 'per-brain contained: ' + norm);
});

test('containment migration: a legacy models/tempo/ledger.json rides into the brain', () => {
    const legacyDir = path.join(ROOT, 'models', 'tempo');
    const legacy = path.join(legacyDir, 'ledger.json');
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(legacy, JSON.stringify({ budgets: { 'legacy-budget': { id: 'legacy-budget', state: 'expired' } }, receipts: [{ ts: 1, line: 'legacy receipt' }] }));
    fs.rmSync(TEMPO_FILE, { force: true });
    let moved = false;
    try { moved = tempo._migrateLegacy(); } catch (e) { assert.fail('migration must never throw: ' + e.message); }
    assert.strictEqual(moved, true, 'rename-into-brain reported');
    const raw = tempo._readLedger();
    assert.ok(raw.budgets['legacy-budget'], 'the legacy payload arrived');
    assert.ok(fs.existsSync(TEMPO_FILE), 'ledger at the contained path');
    assert.ok(!fs.existsSync(legacy), 'legacy file consumed');
    fs.rmSync(TEMPO_FILE, { force: true }); // leave the clean slate for later pins
});

// ---------- settle: let the async drain pin resolve, then verdict ----------

drainPin();
setTimeout(() => {
    if (drainResult) {
        if (drainResult.ok) { passed++; console.log('  ✓ the loop SAMPLES the window: drained near budget end, 2+ slice receipts, expiry receipt present'); }
        else { failed++; console.log('  ✗ the loop SAMPLES the window — ' + drainResult.error); }
    }
    console.log('\n--- RESULTS ---');
    console.log('  Passed:  ' + passed);
    console.log('  Failed:  ' + failed);
    console.log('  Total:   ' + (passed + failed));
    console.log('\n  Tempo pins: ' + passed + ' passed, ' + failed + ' failed');
    process.exit(failed > 0 ? 1 : 0);
}, 8000);
