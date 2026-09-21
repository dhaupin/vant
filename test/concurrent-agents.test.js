#!/usr/bin/env node
/**
 * Concurrent Agent Operation Tests
 * The real multi-agent contention flow: lock acquisition races, mutual
 * exclusion, token-secured release, stale-lock takeover, and multibrain
 * isolation. Kills the typeof-only coverage gap in lock.test.js that
 * hid F-4/F-7/F-9/F-11.
 *
 * Run: node test/concurrent-agents.test.js
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0, tests: [] };

function test(name, fn) {
    return new Promise(resolve => {
        Promise.resolve()
            .then(fn)
            .then(result => {
                const ok = result === true || (result && result.success);
                if (ok) { results.passed++; console.log(`  ✓ ${name}`); }
                else { results.failed++; console.log(`  ✗ ${name}: ${(result && result.error) || 'assertion failed'}`); }
                results.tests.push({ name, ok });
                resolve();
            })
            .catch(e => {
                results.failed++;
                console.log(`  ✗ ${name}: ${e.message}`);
                results.tests.push({ name, ok: false, error: e.message });
                resolve();
            });
    });
}

const lock = require(path.join(ROOT, 'lib', 'lock'));

console.log('\n🤝 CONCURRENT AGENT TESTS\n');

// Collect test invocations into an ordered runner so async assertions
// complete before the summary (lock.test.js convention is sync; these are
// real-async by nature).
const suite = [];
function define(name, fn) { suite.push({ name, fn }); }

// ============================================
// MUTUAL EXCLUSION — the core property
// ============================================

define('two agents cannot both hold the brain lock (contention race)', async () => {
    const lockPath = path.join(ROOT, 'models', 'locks', 'brain.lock');
    try { require('fs').unlinkSync(lockPath); } catch (e) {}

    const [a, b] = await Promise.all([
        lock.acquire('agent-A', 1500),
        lock.acquire('agent-B', 1500)
    ]);

    // Exactly one gets a token; the loser gets null (or the SAME token only
    // if it's the same agent identity — here identities differ).
    const holders = new Set();
    let validCount = 0;
    if (a) validCount++;
    if (b) validCount++;

    // Verify exactly one lock file state consistent with one winner
    const status = lock.status ? lock.status() : null;
    if (validCount !== 1) {
        // Both acquired = broken mutual exclusion... unless one was a
        // re-entrant refresh of the other's process — not the case here.
        return { success: false, error: `both agents acquired (${a}/${b}) — no mutual exclusion` };
    }
    holders.add(a || b);
    await lock.release(a ? 'agent-A' : 'agent-B', a || b);
    return { success: true };
});

define('loser can acquire after winner releases', async () => {
    const lockPath = path.join(ROOT, 'models', 'locks', 'brain.lock');
    try { require('fs').unlinkSync(lockPath); } catch (e) {}

    const tokenA = await lock.acquire('agent-A', 1000);
    if (!tokenA) return { success: false, error: 'A could not acquire empty lock' };

    const tokenB = await lock.acquire('agent-B', 300); // short timeout, expect fail
    if (tokenB) {
        await lock.release('agent-B', tokenB);
        return { success: false, error: 'B acquired while A held the lock' };
    }

    const rel = await lock.release('agent-A', tokenA);
    if (!rel.success) return { success: false, error: `A release failed: ${rel.message}` };

    const tokenB2 = await lock.acquire('agent-B', 1000);
    if (!tokenB2) return { success: false, error: 'B could not acquire after A released' };
    await lock.release('agent-B', tokenB2);
    return { success: true };
});

// ============================================
// TOKEN SECURITY — release is not forgeable
// ============================================

define('release with wrong token is refused (lock survives)', async () => {
    const lockPath = path.join(ROOT, 'models', 'locks', 'brain.lock');
    try { require('fs').unlinkSync(lockPath); } catch (e) {}

    const tokenA = await lock.acquire('agent-A', 1000);
    if (!tokenA) return { success: false, error: 'acquire failed' };

    const evil = await lock.release('agent-B', 'forged-token-123');
    if (evil.success) {
        await lock.release('agent-A', tokenA);
        return { success: false, error: 'wrong agent + forged token released the lock!' };
    }

    // Lock must still be held by A
    const tokenB = await lock.acquire('agent-B', 200);
    if (tokenB) {
        await lock.release('agent-B', tokenB);
        return { success: false, error: 'lock was gone after refused release' };
    }

    await lock.release('agent-A', tokenA);
    return { success: true };
});

define('release without token from a FOREIGN process is refused', async () => {
    const lockPath = path.join(ROOT, 'models', 'locks', 'brain.lock');
    try { require('fs').unlinkSync(lockPath); } catch (e) {}

    const tokenA = await lock.acquire('agent-A', 1000);
    if (!tokenA) return { success: false, error: 'acquire failed' };

    // In-process tokenless release is allowed (owner convenience: the
    // acquire() token cache counts). The security property is cross-process:
    // a fresh process has NO cache, so a tokenless release must be refused.
    const { spawnSync } = require('child_process');
    const probe = spawnSync(process.execPath, ['-e', `
        const lock = require('${path.join(ROOT, 'lib', 'lock').replace(/'/g, "\\'")}');
        lock.release('agent-A', null).then(r => {
            console.log('RESULT:' + (r.success ? 'released' : 'refused'));
            process.exit(0);
        });
    `], { encoding: 'utf8', timeout: 10000 });

    const out = (probe.stdout || '') + (probe.stderr || '');
    if (!out.includes('RESULT:refused')) {
        await lock.release('agent-A', tokenA);
        return { success: false, error: `foreign tokenless release was NOT refused (out: ${out.slice(0, 120)})` };
    }

    // Lock must still be held by A
    const tokenB = await lock.acquire('agent-B', 200);
    if (tokenB) {
        await lock.release('agent-B', tokenB);
        return { success: false, error: 'lock was gone after foreign tokenless release' };
    }

    await lock.release('agent-A', tokenA);
    return { success: true };
});

// ============================================
// STALE LOCK TAKEOVER — crash recovery
// ============================================

define('stale lock (expired timeout) can be taken over', async () => {
    const lockPath = path.join(ROOT, 'models', 'locks', 'brain.lock');
    try { require('fs').unlinkSync(lockPath); } catch (e) {}

    // Acquire with a tiny timeout, then simulate a crashed agent by NOT
    // releasing and waiting past expiry.
    const tokenA = await lock.acquire('agent-A', 50);
    if (!tokenA) return { success: false, error: 'acquire failed' };

    // Wait for expiry (timeout 50ms + poll margin)
    await new Promise(r => setTimeout(r, 150));

    const tokenB = await lock.acquire('agent-B', 1000);
    if (!tokenB) {
        await lock.release('agent-A', tokenA);
        return { success: false, error: 'stale lock not takeable — B starved' };
    }
    await lock.release('agent-B', tokenB);
    return { success: true };
});

// ============================================
// MULTIBRAIN ISOLATION — per-brain locks
// ============================================

define('different brains lock independently', async () => {
    const t1 = await lock.acquire('agent-A', 1000, { brain: 'brain-one' });
    if (!t1) return { success: false, error: 'brain-one acquire failed' };

    // Same agent, different brain — must succeed independently
    const t2 = await lock.acquire('agent-B', 1000, { brain: 'brain-two' });
    if (!t2) {
        await lock.release('agent-A', t1, { brain: 'brain-one' });
        return { success: false, error: 'brain-two lock blocked by brain-one — no isolation' };
    }

    await lock.release('agent-A', t1, { brain: 'brain-one' });
    await lock.release('agent-B', t2, { brain: 'brain-two' });
    return { success: true };
});

// ============================================
// SUMMARY
// ============================================

(async () => {
    for (const { name, fn } of suite) await test(name, fn);

    console.log('\n--- RESULTS ---\n');
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    console.log(`  Total:   ${results.passed + results.failed}`);

    process.exit(results.failed > 0 ? 1 : 0);
})();
