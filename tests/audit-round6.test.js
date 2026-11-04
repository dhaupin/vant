#!/usr/bin/env node
/**
 * Audit Round 6 — discriminating pins (QoS/escrow/carriers frontier walk).
 *
 * Every pin here FAILS against the pre-fix code and PASSES after the fix;
 * none is a restatement of existing coverage:
 *
 * - R6-1: methods.throttle keyed the limiter INSIDE the returned wrapper on
 *         `fn.name || Encrypt.key(16)`, so an anonymous function drew a fresh
 *         random key on EVERY call — the limit never bound and the throttle
 *         was a silent no-op for exactly the inline arrows users throttle.
 *         Fixed: the key is computed once at throttle() time.
 * - R6-2: RateLimiter parsed `maxPerHour` (and surfaced it in its config but
 *         NEVER enforced it anywhere — the hourly cap was config fiction and
 *         a client could burn its minute quota every minute, 24x over). Also
 *         a garbage VANT_QOS_* env integer produced NaN limits, which made
 *         every >= comparison false: an env-only route to switching the
 *         limiter off. Fixed: the hour cap is enforced (per-client + global,
 *         mirroring the minute window's anti-rotation law) and env integers
 *         fall back to their documented defaults when non-finite.
 * - R6-3: the protection-layer circuit (module-level recordFailure/
 *         isCircuitOpen) exported FAILURE_WINDOW_MS but had NO clock: five
 *         failures bricked the circuit forever (no auto-close, no decay) —
 *         an availability denial one transient blip could leave behind.
 *         Fixed: an open circuit recovers closed on the first read after its
 *         window elapses (in-window open stays open, fail-closed); the
 *         window is env-tunable (VANT_QOS_FAILURE_WINDOW_MS) with the
 *         setFailureWindow() test seam.
 * - R6-4: escrow.RecordSpend/refund happily mutated the ledger on a
 *         NEGATIVE amount — spent decremented and available re-derived as
 *         max(0, limit - spent) with NO upper clamp, so a negative spend
 *         minted budget past the limit (free credits in the money seam); a
 *         NaN poisoned the row into permanent denial. Fixed: spend requires
 *         a strictly positive finite number, refund a nonnegative one,
 *         typed refusal, before any row is touched (workspace rows too).
 * - R6-5: carriers.replay built its typed refusal label with a raw
 *         JSON.stringify, so a CYCLIC arrival crashed the helper with a raw
 *         TypeError instead of the typed E_CARRIER_SHAPE it exists to name.
 *         Fixed: the label stringify is total.
 *
 * Run: node tests/audit-round6.test.js
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0 };
const _asyncTests = [];

function _verdict(r) {
    if (r === true || (r && r.success)) return { ok: true };
    return { ok: false, why: (r && r.error) || (r && r.why) || 'assertion failed' };
}
function test(name, fn) {
    let v;
    try { v = _verdict(fn()); } catch (e) { v = { ok: false, why: e.message }; }
    if (v.ok) { results.passed++; console.log(`  ✓ ${name}`); }
    else { results.failed++; console.log(`  ✗ ${name}: ${v.why}`); }
}
function asyncTest(name, fn) { _asyncTests.push({ name, fn }); }
async function _runAsync() {
    for (const { name, fn } of _asyncTests) {
        let v;
        try { v = _verdict(await fn()); } catch (e) { v = { ok: false, why: e.message }; }
        if (v.ok) { results.passed++; console.log(`  ✓ ${name}`); }
        else { results.failed++; console.log(`  ✗ ${name}: ${v.why}`); }
    }
}

const qos = require(path.join(ROOT, 'lib/qos'));
const escrow = require(path.join(ROOT, 'lib/escrow'));
const carriers = require(path.join(ROOT, 'lib/carriers'));

// ==================== R6-1: the throttle key binds ====================

test('R6-1 an anonymous fn is throttled to the limit (the per-call key bypass is closed)', () => {
    const t = new qos.Throttler({ limit: 3, window: 60000 });
    let executed = 0;
    const wrapped = t.throttle(() => { executed++; });   // anonymous: key was already a fresh random per call
    for (let i = 0; i < 6; i++) wrapped('arg' + i);
    if (executed !== 3) return { ok: false, why: `pre-fix bypass: ${executed}/6 executions against limit 3` };
    return true;
});

test('R6-1 a named fn is still throttled to the limit', () => {
    const t = new qos.Throttler({ limit: 2, window: 60000 });
    let executed = 0;
    function myTask() { executed++; }
    const wrapped = t.throttle(myTask);
    for (let i = 0; i < 5; i++) wrapped();
    if (executed !== 2) return { ok: false, why: `limit does not bind for a named fn: ${executed}/5` };
    return true;
});

test('R6-1 the throttled fn still receives its args and return value shape is preserved', () => {
    const t = new qos.Throttler({ limit: 5, window: 60000 });
    const seen = [];
    const wrapped = t.throttle((a, b) => { seen.push([a, b]); });
    wrapped(1, 'x'); wrapped(2, 'y');
    if (seen.length !== 2 || seen[0][0] !== 1 || seen[1][1] !== 'y') return { ok: false, why: 'args no longer ride the wrapper' };
    return true;
});

// ==================== R6-2: the hourly cap is real ====================

asyncTest('R6-2 the per-client hourly cap is enforced (was parsed but never applied)', async () => {
    const rl = new qos.RateLimiter({ maxPerMinute: 1000, maxPerHour: 2 });
    const first = await rl.check('r6-hour-client');
    const second = await rl.check('r6-hour-client');
    const third = await rl.check('r6-hour-client');
    if (!first || !second) return { ok: false, why: 'the first two checks inside the hour cap must pass' };
    if (third !== false) return { ok: false, why: 'THE FINDING: the third check passed — maxPerHour is config fiction again' };
    return true;
});

asyncTest('R6-2 the GLOBAL hourly cap survives client rotation (the minute window law)', async () => {
    const rl = new qos.RateLimiter({ maxPerMinute: 1000, maxPerHour: 2 });
    const a = await rl.check('rot-1');
    const b = await rl.check('rot-2');
    const c = await rl.check('rot-3');   // fresh clientId: the pre-fix code only had a minute ceiling
    if (!a || !b) return { ok: false, why: 'rotation within the cap must pass' };
    if (c !== false) return { ok: false, why: 'a rotated third global request passed the hourly cap' };
    return true;
});

asyncTest('R6-2 the minute window still binds (regression guard on the new globals)', async () => {
    const rl = new qos.RateLimiter({ maxPerMinute: 3, maxPerHour: 1000 });
    const first = await rl.check('r6-minute-client');
    await rl.check('r6-minute-client'); await rl.check('r6-minute-client');
    const fourth = await rl.check('r6-minute-client');
    if (!first) return { ok: false, why: 'the first check must pass' };
    if (fourth !== false) return { ok: false, why: 'the minute cap no longer binds' };
    return true;
});

asyncTest('R6-2 garbage VANT_QOS_* env integers fall back to their defaults', async () => {
    const QOS_PATH = path.join(ROOT, 'lib/qos.js');
    const prev = process.env.VANT_QOS_MAX_PER_MINUTE;
    process.env.VANT_QOS_MAX_PER_MINUTE = 'not-a-number';
    let rl;
    try {
        delete require.cache[QOS_PATH];   // a fresh module load re-reads the env
        rl = new (require(QOS_PATH)).RateLimiter({ maxPerHour: 10 });
    } finally {
        process.env.VANT_QOS_MAX_PER_MINUTE = prev;
        delete require.cache[QOS_PATH];
    }
    if (!(rl.options.maxPerMinute > 0)) {
        return { ok: false, why: `a NaN env limit persisted (maxPerMinute=${rl.options.maxPerMinute}) — the limiter silently disables itself` };
    }
    // restore the require shared with the other pins (getter exports rehydrate)
    return true;
});

// ==================== R6-3: the protection circuit recovers ====================

test('R6-3 five failures open the circuit and an IN-WINDOW open stays open (fail-closed)', () => {
    try {
        qos.resetCircuit();
        for (let i = 0; i < 'FAILURES'.length; i++) qos.recordFailure();   // threshold 5
        if (!qos.isCircuitOpen()) return { ok: false, why: 'the threshold does not open the circuit' };
        // A same-tick read must keep it open (recovery only happens after the window).
        if (!qos.isCircuitOpen()) return { ok: false, why: 'the circuit recovered within its window (fail-closed lost)' };
        return true;
    } finally {
        qos.resetCircuit();
        qos.setFailureWindow(60000);
    }
});

asyncTest('R6-3 the circuit AUTO-RECOVERS after its window elapses (the window finally means something)', async () => {
    qos.setFailureWindow(20);
    qos.resetCircuit();
    try {
        for (let i = 0; i < 5; i++) qos.recordFailure();
        if (!qos.isCircuitOpen()) return { ok: false, why: 'baseline: the circuit did not open' };
        await new Promise((r) => setTimeout(r, 45));
        if (qos.isCircuitOpen()) {
            return { ok: false, why: 'THE FINDING: still open past its window — one transient blip bricks the circuit forever' };
        }
        if (qos.getFailureCount() !== 0) return { ok: false, why: 'recovery did not reset the failure count' };
        return true;
    } finally {
        qos.resetCircuit();
        qos.setFailureWindow(60000);
    }
});

test('R6-3 setFailureWindow refuses garbage typed', () => {
    for (const bad of [-1, NaN, '10', Infinity]) {
        let err = null;
        try { qos.setFailureWindow(bad); } catch (e) { err = e; }
        if (!err || err.code !== 'VAF_INPUT_INVALID') {
            return { ok: false, why: `a ${String(bad)} window was accepted (${err ? err.code : 'no throw'})` };
        }
    }
    return true;
});

// ==================== R6-4: escrow amounts are numbers ====================

escrow.Escrow;   // touch the lazy export surface before the pins

function freshEscrow() {
    return new escrow.Escrow({ persistBudgets: false });
}

test('R6-4 a NEGATIVE spend is a typed refusal, never free budget', () => {
    const e = freshEscrow();
    let err = null;
    try { e.recordSpend('r6-neg', -50); } catch (x) { err = x; }
    if (!err || err.code !== 'VAF_INPUT_INVALID') {
        return { ok: false, why: `THE FINDING: a negative spend mutated the ledger (throw=${err ? err.code : 'none'})` };
    }
    const b = e.getBudget('r6-neg');
    if (b.available !== b.limit) return { ok: false, why: 'the refusal left the row damaged: available ' + b.available + ' vs limit ' + b.limit };
    return true;
});

test('R6-4 a NaN spend is a typed refusal and the row stays intact', () => {
    const e = freshEscrow();
    let err = null;
    try { e.recordSpend('r6-nan', NaN); } catch (x) { err = x; }
    if (!err || err.code !== 'VAF_INPUT_INVALID') {
        return { ok: false, why: `a NaN spend reached the ledger (throw=${err ? err.code : 'none'})` };
    }
    const b = e.getBudget('r6-nan');
    if (b.available !== b.limit) return { ok: false, why: 'NaN poisoned the row (available ' + b.available + ')' };
    return true;
});

test('R6-4 a zero or non-number spend is refused typed', () => {
    const e = freshEscrow();
    for (const bad of [0, '50', undefined]) {
        let err = null;
        try { e.recordSpend('r6-zero', bad); } catch (x) { err = x; }
        if (!err || err.code !== 'VAF_INPUT_INVALID') return { ok: false, why: `a ${String(bad)} spend was accepted (${err ? err.code : 'no throw'})` };
    }
    return true;
});

test('R6-4 a NEGATIVE refund is a typed refusal', () => {
    const e = freshEscrow();
    let err = null;
    try { e.refund('r6-ref', -5); } catch (x) { err = x; }
    if (!err || err.code !== 'VAF_INPUT_INVALID') {
        return { ok: false, why: `a negative refund mutated the ledger (throw=${err ? err.code : 'none'})` };
    }
    return true;
});

test('R6-4 a workspace-scoped negative spend is refused too', () => {
    const e = freshEscrow();
    let err = null;
    try { e.recordSpend('r6-ws-agent', -1, { workspace: 'r6-ws' }); } catch (x) { err = x; }
    if (!err || err.code !== 'VAF_INPUT_INVALID') return { ok: false, why: `garbage reached the workspace rows (throw=${err ? err.code : 'none'})` };
    return true;
});

test('R6-4 a legitimate spend/refund round-trip still records (the gate is not over-broad)', () => {
    const e = freshEscrow();
    e.recordSpend('r6-ok', 10);
    const afterSpend = e.getBudget('r6-ok');
    if (afterSpend.spent !== 10 || afterSpend.available !== afterSpend.limit - 10) {
        return { ok: false, why: 'a legitimate spend no longer records: ' + JSON.stringify(afterSpend) };
    }
    e.refund('r6-ok', 10);
    const afterRefund = e.getBudget('r6-ok');
    if (afterRefund.spent !== 0 || afterRefund.available !== afterRefund.limit) {
        return { ok: false, why: 'a legitimate refund no longer records: ' + JSON.stringify(afterRefund) };
    }
    return true;
});

// ==================== R6-5: replay totality ====================

test('R6-5 replay refuses a CYCLIC arrival typed (the refusal itself no longer crashes)', () => {
    const cyclic = { name: 'loop' };
    cyclic.self = cyclic;
    let err = null;
    try { carriers.replay([cyclic]); } catch (x) { err = x; }
    if (!err) return { ok: false, why: 'a cyclic arrival was accepted' };
    if (err.code !== 'E_CARRIER_SHAPE') {
        return { ok: false, why: 'THE FINDING: raw throw out of the refusal (code=' + err.code + ', ' + err.message.slice(0, 50) + ')' };
    }
    return true;
});

test('R6-5 replay still refuses sane malformed input typed (regression guard)', () => {
    for (const bad of [{}, [], 'packet']) {
        let err = null;
        try { carriers.replay([bad]); } catch (x) { err = x; }
        if (!err || err.code !== 'E_CARRIER_SHAPE') return { ok: false, why: `input ${JSON.stringify(bad)} answered ${err ? err.code : 'no throw'}` };
    }
    return true;
});

(async () => {
    await _runAsync();
    console.log(`\naudit-round6: ${results.passed} passed, ${results.failed} failed`);
    process.exit(results.failed ? 1 : 0);
})();
