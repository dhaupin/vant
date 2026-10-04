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

test('withLock releases the lock when fn throws (no leak)', async () => {
    let threw = false;
    try { await lock.withLock(p('g.lock'), () => { throw new Error('boom'); }); }
    catch (e) { threw = true; }
    const again = lock.acquire(p('g.lock'));
    lock.release(p('g.lock'));
    return { success: threw && again.ok === true };
});

test('withLock closed does NOT delete a peer-held lock on abort', async () => {
    const peer = p('h.lock');
    lock.acquire(peer); // "peer" holds it
    const out = await lock.withLock(peer, () => 'nope', { waitMs: 0 });
    const stillHeld = fs.existsSync(peer);
    lock.release(peer);
    return { success: out && out.aborted === true && stillHeld };
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
// PASS 108 — OWNERSHIP-CHECKED RELEASE
// ============================================

test('release does NOT delete a successor lock after stale takeover (pass 108)', () => {
    const f = p('succ.lock');
    lock.acquire(f); // ours
    // Simulate a successor taking over via stale sweep: file replaced with a foreign pid.
    fs.writeFileSync(f, JSON.stringify({ pid: process.pid + 999999, at: Date.now() }));
    lock.release(f); // stalled original holder lets go
    const survived = fs.existsSync(f); // pre-fix: deleted — successor left exposed
    // cleanup: restore our pid so release removes it
    fs.writeFileSync(f, JSON.stringify({ pid: process.pid, at: Date.now() }));
    lock.release(f);
    return { success: survived === true, error: survived ? null : 'successor live lock was clobbered by predecessor release' };
});

test('exit hook leaves a successor lock alone (pass 108)', async () => {
    const { spawn } = require('child_process');
    const f = p('hook.lock');
    const flag = p('hook.flag');
    const child = spawn(process.execPath, ['-e', `
        const lock = require(${JSON.stringify(path.join(ROOT, 'lib', 'lock.js'))});
        const fs = require('fs');
        const r = lock.acquire(process.argv[1]);
        if (r.ok) {
            fs.writeFileSync(process.argv[2], '1');
            setTimeout(() => process.exit(0), 2500); // hold, then exit (hook runs)
        } else process.exit(1);
    `, f, flag], { cwd: ROOT });
    const t0 = Date.now();
    while (!fs.existsSync(flag) && Date.now() - t0 < 3000) { /* wait for child hold */ }
    // Successor takeover while the child holds: file replaced with a foreign pid.
    fs.writeFileSync(f, JSON.stringify({ pid: process.pid + 999999, at: Date.now() }));
    await new Promise((resolve) => child.on('exit', resolve));
    const survived = fs.existsSync(f); // child's exit hook must NOT delete it
    fs.writeFileSync(f, JSON.stringify({ pid: process.pid, at: Date.now() }));
    lock.release(f);
    try { fs.unlinkSync(flag); } catch (e) { /* already gone */ }
    return { success: survived === true, error: survived ? null : 'exit hook clobbered a successor lock' };
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
