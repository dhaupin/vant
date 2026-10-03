#!/usr/bin/env node
/**
 * lock mutex primitive unit tests (lib/lock.js)
 *
 * Pins pass 103: acquire() reports WHY it failed ({reason}), withLock()
 * honours failMode, mutex() is poison-proof, and pathFor() names every lock
 * under the one brain-root root.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.VANT_BRAIN = 'qc-lock-prim';

const ROOT = path.resolve(__dirname, '..');
const lock = require(path.join(ROOT, 'lib', 'lock'));

const results = { passed: 0, failed: 0 };
const suite = [];

function test(name, fn) { suite.push({ name, fn }); }

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-lock-test-'));
const p = (name) => path.join(scratch, name);

console.log('\n🔒 LOCK MUTEX PRIMITIVE TESTS\n');

// ============================================
// ACQUIRE / RELEASE
// ============================================

test('acquire returns {ok:true, reason:"acquired"}', () => {
    const r = lock.acquire(p('a.lock'));
    lock.release(p('a.lock'));
    return { success: r.ok === true && r.reason === 'acquired' };
});

test('second acquire is refused with reason "held" (not generic false)', () => {
    lock.acquire(p('b.lock'));
    const r2 = lock.acquire(p('b.lock'), { waitMs: 0 });
    lock.release(p('b.lock'));
    return { success: r2.ok === false && r2.reason === 'held' };
});

test('release frees the lock for the next acquirer', () => {
    lock.acquire(p('c.lock'));
    lock.release(p('c.lock'));
    const r = lock.acquire(p('c.lock'));
    lock.release(p('c.lock'));
    return { success: r.ok === true };
});

test('unusable parent (a regular file) reports reason "unavailable"', () => {
    fs.writeFileSync(p('notdir'), 'x');
    const r = lock.acquire(p('notdir') + '/child.lock', { waitMs: 0 });
    return { success: r.ok === false && r.reason === 'unavailable' };
});

// ============================================
// withLock + failMode
// ============================================

test('withLock closed: does NOT run fn without the lock', async () => {
    lock.acquire(p('d.lock'));
    let ran = false;
    const out = await lock.withLock(p('d.lock'), () => { ran = true; }, { waitMs: 0 });
    lock.release(p('d.lock'));
    return { success: !ran && out && out.ok === false && out.aborted === true && out.reason === 'held' };
});

test('withLock open: runs fn with {ok:false} when the lock is unavailable', async () => {
    lock.acquire(p('e.lock'));
    let seen = null;
    const out = await lock.withLock(p('e.lock'), (res) => { seen = res; return 'ran-open'; }, { waitMs: 0, failMode: 'open' });
    lock.release(p('e.lock'));
    return { success: !!seen && seen.ok === false && out === 'ran-open' };
});

test('withLock runs + releases a sync fn (lock free afterwards)', async () => {
    const out = await lock.withLock(p('f.lock'), () => 42);
    const again = lock.acquire(p('f.lock'));
    lock.release(p('f.lock'));
    return { success: out === 42 && again.ok === true };
});

// ============================================
// mutex()
// ============================================

test('mutex serializes queued work in order', async () => {
    const m = lock.mutex();
    const order = [];
    await Promise.all([
        m.run(() => { order.push('a'); }),
        m.run(() => { order.push('b'); }),
        m.run(() => { order.push('c'); })
    ]);
    return { success: order.join('') === 'abc' };
});

test('mutex does not let a rejection poison the chain', async () => {
    const m = lock.mutex();
    const bad = m.run(() => { throw new Error('boom'); }).catch(() => 'caught');
    const good = m.run(() => 'ok');
    const [b, g] = await Promise.all([bad, good]);
    return { success: b === 'caught' && g === 'ok' };
});

// ============================================
// pathFor()
// ============================================

test('pathFor puts every lock under models/private/<brain>/.locks', () => {
    const lp = lock.pathFor('state', 'state/consensus.json');
    return {
        success: lp.includes(path.join('models', 'private', 'qc-lock-prim', '.locks')) && lp.endsWith('.lock')
    };
});

test('pathFor namespaces kind + id and sanitizes separators', () => {
    const lp = lock.pathFor('market-trade', 'listing/../evil');
    const base = path.basename(lp);
    // Path separators are neutralized into a single flat filename (no traversal).
    return { success: base.startsWith('market-trade__') && !base.includes('/') && !base.includes('\\') };
});

// ============================================

(async () => {
    for (const t of suite) {
        try {
            const r = await t.fn();
            if (r === true || (r && r.success)) {
                results.passed++;
                console.log(`  ✓ ${t.name}`);
            } else {
                results.failed++;
                console.log(`  ✗ ${t.name}: ${(r && r.error) || 'assertion failed'}`);
            }
        } catch (e) {
            results.failed++;
            console.log(`  ✗ ${t.name}: ${e.message}`);
        }
    }
    try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (e) {}

    console.log('\n--- RESULTS ---\n');
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    console.log(`  Total:   ${results.passed + results.failed}`);
    process.exit(results.failed > 0 ? 1 : 0);
})();
