#!/usr/bin/env node
/**
 * Timer Lifecycle Registry Tests
 * The v0.9.0-axolotl registry (lib/boot.js) is the single owner of
 * background intervals: modules register named timers, boot can account
 * for every one, and reset/shutdown clears them. Previously 9 intervals
 * ran with no lifecycle and kept handles alive after boot reset.
 *
 * Run: node test/timer-lifecycle.test.js
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0, tests: [] };

const suite = [];
function define(name, fn) { suite.push({ name, fn }); }
async function runSuite() {
    for (const { name, fn } of suite) {
        try {
            const result = await fn();
            const ok = result === true || (result && result.success);
            if (ok) { results.passed++; console.log(`  ✓ ${name}`); }
            else { results.failed++; console.log(`  ✗ ${name}: ${(result && result.error) || 'assertion failed'}`); }
        } catch (e) {
            results.failed++;
            console.log(`  ✗ ${name}: ${e.message}`);
        }
    }
    console.log('\n--- RESULTS ---\n');
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    console.log(`  Total:   ${results.passed + results.failed}`);
    process.exit(results.failed > 0 ? 1 : 0);
}

const boot = require(path.join(ROOT, 'lib', 'boot'));

console.log('\n⏱️  TIMER LIFECYCLE REGISTRY TESTS\n');

// ============================================
// 1. INPUT VALIDATION
// ============================================

define('registerTimer requires a name', async () => {
    let threw = null;
    try { boot.registerTimer('', () => {}, 1000); } catch (e) { threw = e; }
    try { boot.registerTimer(null, () => {}, 1000); } catch (e) { threw = threw || e; }
    return { success: !!threw, error: 'no throw on empty/null name' };
});

define('registerTimer requires handler + positive interval', async () => {
    let threw = 0;
    try { boot.registerTimer('t.bad1', null, 1000); } catch (e) { threw++; }
    try { boot.registerTimer('t.bad2', () => {}, 0); } catch (e) { threw++; }
    try { boot.registerTimer('t.bad3', () => {}, -5); } catch (e) { threw++; }
    try { boot.registerTimer('t.bad4', () => {}, 'fast'); } catch (e) { threw++; }
    return { success: threw === 4, error: `expected 4 throws, got ${threw}` };
});

// ============================================
// 2. REGISTRY SEMANTICS
// ============================================

define('registered timer appears in getTimers()', async () => {
    boot.unregisterTimer('t.alpha'); // clean slate
    boot.registerTimer('t.alpha', () => {}, 60000, { unref: true });
    const timers = boot.getTimers();
    const entry = timers['t.alpha'];
    const ok = entry && entry.intervalMs === 60000 && entry.unrefed === true && typeof entry.started === 'number';
    boot.unregisterTimer('t.alpha');
    return { success: !!ok, error: `entry=${JSON.stringify(entry)}` };
});

define('re-registration replaces (no duplicate timers)', async () => {
    boot.unregisterTimer('t.dup');
    boot.registerTimer('t.dup', () => {}, 60000);
    boot.registerTimer('t.dup', () => {}, 30000);
    const timers = boot.getTimers();
    const count = Object.keys(timers).filter(n => n === 't.dup').length;
    const ok = count === 1 && timers['t.dup'].intervalMs === 30000;
    boot.unregisterTimer('t.dup');
    return { success: ok, error: `dups=${count} interval=${timers['t.dup'] && timers['t.dup'].intervalMs}` };
});

define('unregisterTimer clears and reports; unknown name is safe', async () => {
    boot.registerTimer('t.bye', () => {}, 60000);
    const removed = boot.unregisterTimer('t.bye');
    const gone = !boot.getTimers()['t.bye'];
    const unknown = boot.unregisterTimer('t.never-existed');
    return { success: removed === true && gone && unknown === false, error: `removed=${removed} gone=${gone} unknown=${unknown}` };
});

define('stopAllTimers clears everything and returns the count', async () => {
    boot.unregisterTimer('t.s1'); boot.unregisterTimer('t.s2'); boot.unregisterTimer('t.s3');
    boot.registerTimer('t.s1', () => {}, 60000);
    boot.registerTimer('t.s2', () => {}, 60000);
    boot.registerTimer('t.s3', () => {}, 60000);
    const cleared = boot.stopAllTimers();
    const timers = boot.getTimers();
    const leftovers = Object.keys(timers).filter(n => n.startsWith('t.s'));
    boot.stopAllTimers(); // idempotent tidy
    return { success: cleared >= 3 && leftovers.length === 0, error: `cleared=${cleared} leftovers=${leftovers.length}` };
});

define('tick handler actually fires (registry owns a live interval)', async () => {
    const timersBefore = Object.keys(boot.getTimers()).length;
    let ticks = 0;
    boot.registerTimer('t.live', () => { ticks++; }, 25, { unref: true });
    await new Promise(r => setTimeout(r, 100));
    boot.unregisterTimer('t.live');
    const stopped = ticks > 0; // at least one tick in 100ms at 25ms interval
    return { success: stopped && Object.keys(boot.getTimers()).length === timersBefore, error: `ticks=${ticks}` };
});

// ============================================
// 3. RESET INTEGRATION — the shutdown contract
// ============================================

define('boot.reset() clears registered timers (the original 9-timer bug)', async () => {
    boot.registerTimer('t.resetme', () => {}, 60000);
    boot.registerTimer('t.resetme2', () => {}, 60000);
    const before = Object.keys(boot.getTimers()).filter(n => n.startsWith('t.reset')).length;
    await boot.reset();
    const after = Object.keys(boot.getTimers()).filter(n => n.startsWith('t.reset')).length;
    return { success: before === 2 && after === 0, error: `before=${before} after=${after} — reset did NOT clear timers` };
});

// ============================================
// RUN
// ============================================

runSuite();
