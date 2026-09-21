#!/usr/bin/env node
/**
 * Sync Recursion Guard Leak Tests
 * The recursion guard must never leak depth across sync calls:
 *   - check() must block at max depth (infinite sync loop protection)
 *   - the finally { guard.release() } in pushAll/pullAny must restore
 *     depth to 0 even on early returns and throws
 *   - a sync loop that recurses toward max depth must be stopped, then
 *     unwind cleanly so later top-level syncs still work
 * Runs fully OFFLINE: provider credentials are unset in-process, so
 * pushAll/pullAny exercise the guard + early-return path with no network.
 *
 * Run: node test/sync-recursion.test.js
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

console.log('\n🔁 SYNC RECURSION GUARD TESTS\n');

// OFFLINE determinism: sync's getConfiguredProviders() keys off provider
// token env vars + the git remote. Unset the tokens in-process so no
// provider is configured and pushAll/pullAny take the early-return path
// (zero network I/O) while still passing through the recursion guard.
const TOKEN_VARS = ['GITHUB_TOKEN', 'GITLAB_TOKEN', 'BITBUCKET_TOKEN', 'GITEA_TOKEN'];
const savedEnv = {};
for (const k of TOKEN_VARS) { savedEnv[k] = process.env[k]; delete process.env[k]; }

const guard = require(path.join(ROOT, 'lib', 'recursion'));
const sync = require(path.join(ROOT, 'lib', 'sync'));

// TEST-SCOPE neutralization: SelfHostedProvider.isConfigured() is hardcoded
// true ("always viable — uses generic git CLI"), meaning sync.pushAll()
// broadcasts REAL git operations (add -A, commit, push) in whatever repo it
// runs in. For these offline tests we flip the prototype to unconfigured so
// pushAll/pullAny take their true early-return path. Production behavior is
// untouched; the always-configured hazard is recorded in labs.
// (Getting the class from a live instance: requiring selfhosted.js directly
// can return a partial export mid-cycle — the F-2 cache-poison pattern.)
const remote = require(path.join(ROOT, 'lib', 'remote'));
const selfhostedProto = Object.getPrototypeOf(remote.getAllProviders().selfhosted);
const realIsConfigured = selfhostedProto.isConfigured;
selfhostedProto.isConfigured = function () { return false; };

// ============================================
// 1. GUARD PRIMITIVES (recursion.js semantics)
// ============================================

define('guard.check blocks at max depth and returns not-allowed', async () => {
    guard.reset();
    const op = 'test:block-op';
    let blocked = null;
    for (let i = 1; i <= 12; i++) {
        const r = guard.check(op, 10);
        if (!r.allowed) { blocked = { at: i, depth: r.depth, max: r.max }; break; }
    }
    const pinned = guard.getDepth(op);
    for (let i = 0; i < 12; i++) guard.release(op);
    return {
        success: blocked && blocked.at === 11 && blocked.max === 10 && pinned === 10,
        error: `blocked=${JSON.stringify(blocked)} pinnedDepth=${pinned}`
    };
});

define('guard depth returns to zero after paired check/release', async () => {
    guard.reset();
    const op = 'test:pair-op';
    for (let i = 0; i < 5; i++) guard.check(op, 10);
    const mid = guard.getDepth(op);
    for (let i = 0; i < 5; i++) guard.release(op);
    const end = guard.getDepth(op);
    return { success: mid === 5 && end === 0, error: `mid=${mid} end=${end}` };
});

// ============================================
// 2. pushAll/pullAny LEAK CHECKS (offline, early-return path)
// ============================================

define('pushAll does not leak guard depth on early return (no providers)', async () => {
    guard.reset();
    const depthBefore = guard.getDepth('sync:push');

    const r = await sync.pushAll({ commitMessage: 'recursion-leak probe' });
    if (r.success !== false || r.error !== 'No providers configured') {
        return { success: false, error: `unexpected result: ${JSON.stringify(r).slice(0, 100)}` };
    }

    const depthAfter = guard.getDepth('sync:push');
    return {
        success: depthBefore === 0 && depthAfter === 0,
        error: `depth before=${depthBefore} after=${depthAfter} — guard LEAKED`
    };
});

define('pushAll does not leak guard depth when it throws (vaf rejection)', async () => {
    guard.reset();
    let threw = false;
    try {
        // commitMessage validated by vaf with maxLength — an oversized string
        // should throw BEFORE any provider work, still hitting the finally.
        await sync.pushAll({ commitMessage: 'x'.repeat(200000) });
    } catch (e) { threw = true; }
    const depthAfter = guard.getDepth('sync:push');
    return {
        success: depthAfter === 0,
        error: `threw=${threw} depth after=${depthAfter} — guard LEAKED on throw path`
    };
});

define('sync loop toward max depth stops and unwinds cleanly', async () => {
    guard.reset();
    const MAX = 10;
    // Pin the guard at max depth, as an unbroken recursion loop would.
    for (let i = 0; i < MAX; i++) guard.check('sync:push', MAX);

    // A sync issued while pinned-at-max must be refused...
    let refused = false;
    try {
        const r = await sync.pushAll({ commitMessage: 'pinned-at-max probe' });
        // pushAll swallows the guard block only if it throws — if we got a
        // result object the guard check threw inside, so catch in the try.
        refused = r && r.success === false;
    } catch (e) { refused = true; }

    // ...and after the loop "ends" (releases), depth must unwind to zero so
    // the next top-level sync works.
    for (let i = 0; i < MAX; i++) guard.release('sync:push');
    const unwound = guard.getDepth('sync:push');

    // The unwound guard must pass a fresh check (top-level sync works again)
    const fresh = guard.check('sync:push', MAX);
    guard.release('sync:push');
    guard.reset();

    return {
        success: refused && unwound === 0 && fresh.allowed,
        error: `refused=${refused} unwound=${unwound} freshAllowed=${fresh.allowed}`
    };
});

define('pullAny does not leak guard depth on early return (no providers)', async () => {
    guard.reset();
    const r = await sync.pullAny({}).catch(e => ({ success: false, error: e.message }));
    const depthAfter = guard.getDepth('sync:pull');
    // Early return (no providers) or network error — either way depth must be 0
    return { success: depthAfter === 0, error: `depth after=${depthAfter} result=${JSON.stringify(r).slice(0, 100)}` };
});

// ============================================
// 3. POST-SUITE: restore env, verify guard clean
// ============================================

(async () => {
    await runSuite();
    for (const k of TOKEN_VARS) {
        if (savedEnv[k] !== undefined) process.env[k] = savedEnv[k];
        else delete process.env[k];
    }
    selfhostedProto.isConfigured = realIsConfigured;
    guard.reset();
})();
