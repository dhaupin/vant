#!/usr/bin/env node
/**
 * Brain Lock Module Unit Tests (lib/brain-lock.js)
 *
 * Includes pass-105 "truth-up" gates: getLayerStatus shape (F2), real
 * listStackLocks rows (F3), and the CLI release-vs-denied regression (F4).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BRAIN_LOCK = path.join(ROOT, 'lib', 'brain-lock');

const results = { passed: 0, failed: 0 };
const suite = [];

function test(name, fn) { suite.push({ name, fn }); }

console.log('\n🔒 BRAIN LOCK MODULE TESTS\n');

// ============================================
// LOAD
// ============================================

test('brain-lock module loads', () => {
    return { success: !!require(BRAIN_LOCK) };
});

test('brain-lock has acquireBrainLock function', () => {
    const lock = require(BRAIN_LOCK);
    return { success: typeof lock.acquireBrainLock === 'function' };
});

test('brain-lock has releaseBrainLock function', () => {
    const lock = require(BRAIN_LOCK);
    return { success: typeof lock.releaseBrainLock === 'function' };
});

test('brain-lock has brainLockStatus function', () => {
    const lock = require(BRAIN_LOCK);
    return { success: typeof lock.brainLockStatus === 'function' };
});

test('brain-lock has forceReleaseBrainLock function', () => {
    const lock = require(BRAIN_LOCK);
    return { success: typeof lock.forceReleaseBrainLock === 'function' };
});

test('brain-lock has getAgentId function', () => {
    const lock = require(BRAIN_LOCK);
    return { success: typeof lock.getAgentId === 'function' };
});

// ============================================
// MULTIBRAIN STACK TESTS
// ============================================

console.log('\n📚 STACK SUPPORT TESTS\n');

test('brain-lock has getStackLockStatus function', () => {
    const lock = require(BRAIN_LOCK);
    return { success: typeof lock.getStackLockStatus === 'function' };
});

test('brain-lock has listStackLocks function', () => {
    const lock = require(BRAIN_LOCK);
    return { success: typeof lock.listStackLocks === 'function' };
});

test('getStackLockStatus returns object with source stack', () => {
    const lock = require(BRAIN_LOCK);
    const status = lock.getStackLockStatus();
    return { success: status && status.source === 'stack' };
});

test('listStackLocks returns array', () => {
    const lock = require(BRAIN_LOCK);
    const locks = lock.listStackLocks();
    return { success: Array.isArray(locks) };
});

// ============================================
// TRUTH-UP (pass 105)
// ============================================

console.log('\n🩺 TRUTH-UP TESTS (pass 105)\n');

test('getLayerStatus matches the sibling-layer shape (F2)', () => {
    const lock = require(BRAIN_LOCK);
    const s = lock.getLayerStatus();
    return { success: !!s && s.name === 'Brain lock' && s.type === 'authorization_lease' && s.enabled === true };
});

test('listStackLocks emits real rows for a held lock (F3)', async () => {
    const lock = require(BRAIN_LOCK);
    const brain = require(path.join(ROOT, 'lib', 'brain'));
    const target = brain.getStack()[0];
    const agent = 'stack-row-test';
    const token = await lock.acquireBrainLock(agent, lock.DEFAULT_TIMEOUT_MS, { brain: target });
    if (!token) return { success: false, error: 'could not acquire lease for ' + target };
    let rows;
    try {
        rows = lock.listStackLocks();
    } finally {
        await lock.releaseBrainLock(agent, token, { brain: target });
    }
    const row = Array.isArray(rows) ? rows.find(r => r.brain === target && r.agentId === agent) : null;
    // row[0] === undefined proves it is NOT the old spread-string junk shape.
    return { success: !!row && row.valid === true && row[0] === undefined };
});

test('getState().lockStatus is DATA, not a function reference (F5)', () => {
    const vant = require(path.join(ROOT, 'lib', 'vant'));
    const st = vant.getState();
    return { success: st && typeof st.lockStatus !== 'function' };
});

test('vant lock release reports FAILURE + keeps the token on a denied release (F4)', () => {
    const tokenFile = path.join(ROOT, '.lock-brain-token');
    const had = fs.existsSync(tokenFile);
    const prev = had ? fs.readFileSync(tokenFile, 'utf8') : null;
    fs.writeFileSync(tokenFile, 'definitely-wrong-token');
    let out = '';
    let preserved = false;
    try {
        const r = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'lock.js'), 'release'], {
            cwd: ROOT, encoding: 'utf8', env: { ...process.env }
        });
        out = (r.stdout || '') + (r.stderr || '');
        // The old bug called clearToken() on a DENIED release — so the file
        // must still be present here for the fix to be working.
        preserved = fs.existsSync(tokenFile);
    } finally {
        if (had) fs.writeFileSync(tokenFile, prev);
        else { try { fs.unlinkSync(tokenFile); } catch (e) {} }
    }
    return { success: /lock/i.test(out) && !/Lock released/.test(out) && preserved };
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

    console.log('\n--- RESULTS ---\n');
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    console.log(`  Total:   ${results.passed + results.failed}`);
    process.exit(results.failed > 0 ? 1 : 0);
})();
