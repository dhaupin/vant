#!/usr/bin/env node
/**
 * branch-manager tests (QC_WAVE gap #1 — tests FIRST, refactor second)
 *
 * Pins bin/branch-manager.js behavior before and after the args-array
 * execFileSync refactor:
 *   - exports exist (test seam; CLI behavior unchanged)
 *   - read-only git reads work against the real repo
 *   - silent-mode failure contract
 *   - SHELL-INJECTION resistance: git args containing `;`, `&&`, quotes,
 *     backticks must reach git as literal argv elements — never shell-
 *     interpreted. Canary files in os.tmpdir() prove it (the OLD shell-string
 *     implementation creates them — that is the vuln being fixed).
 *   - CLI usage/status commands still work
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'bin', 'branch-manager.js');

const results = { passed: 0, failed: 0 };
const failures = [];

function test(name, fn) {
    try {
        const ok = fn();
        if (ok === false) throw new Error('returned false');
        results.passed++;
        console.log(`  ✓ ${name}`);
    } catch (e) {
        results.failed++;
        failures.push(`${name}: ${e.message}`);
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

console.log('\n🌿 BRANCH-MANAGER TESTS (QC_WAVE gap #1)\n');

const bm = require('../bin/branch-manager.js');

test('exports: all public functions available', () => {
    for (const fn of ['git', 'getBranch', 'getStatus', 'getCommit', 'getRemoteDiff',
        'isDirty', 'getChangedBrains', 'autoBranch', 'autoCommit', 'push',
        'createPR', 'status']) {
        if (typeof bm[fn] !== 'function') throw new Error(`missing export: ${fn}`);
    }
});

test('getBranch returns current branch (real git, read-only)', () => {
    const branch = bm.getBranch();
    assert(typeof branch === 'string' && branch.length > 0, 'empty branch: ' + JSON.stringify(branch));
    assert(!branch.includes('\n'), 'branch contains newline');
    // Must match what git itself says
    const real = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
    assert(branch === real.stdout.trim(), `mismatch: ${branch} vs ${real.stdout.trim()}`);
});

test('getCommit returns short hash (7 chars)', () => {
    const c = bm.getCommit();
    assert(typeof c === 'string' && c.length === 7, 'bad hash: ' + JSON.stringify(c));
});

test('isDirty + status() shape (read-only)', () => {
    const s = bm.status();
    assert(typeof s.branch === 'string', 'branch not string');
    assert(typeof s.dirty === 'boolean', 'dirty not boolean');
    assert(Array.isArray(s.changed), 'changed not array');
    assert(typeof s.diverged === 'boolean', 'diverged not boolean');
    assert(Number.isInteger(s.diffLines), 'diffLines not integer');
});

test('silent mode returns null on git failure', () => {
    const out = bm.git(['rev-parse', '--verify', 'definitely-not-a-ref-xyz-12345'], { silent: true });
    assert(out === null, 'expected null, got: ' + JSON.stringify(out));
});

function injectionProbe(canarySuffix, bogusArg) {
    const canary = path.join(os.tmpdir(), `bm-canary-${process.pid}-${canarySuffix}`);
    try {
        if (typeof bm.git !== 'function') throw new Error('exports seam missing (bm.git)');
        let threw = null;
        try { bm.git(['rev-parse', '--verify', bogusArg]); }
        catch (e) { threw = e; }
        assert(threw, 'expected git to reject the bogus revision (args-array mode)');
        assert(!fs.existsSync(canary), 'CANARY CREATED — shell-interpreted! Injection vuln present.');
    } finally { try { fs.unlinkSync(canary); } catch (_) {} }
}

test('INJECTION: `;`-chained command in arg is NOT shell-interpreted', () => {
    injectionProbe('semi', `HEAD; touch ${path.join(os.tmpdir(), `bm-canary-${process.pid}-semi`)}`);
});

test('INJECTION: `&&` + quote escape is NOT shell-interpreted', () => {
    injectionProbe('and', `HEAD" && touch "${path.join(os.tmpdir(), `bm-canary-${process.pid}-and`)}`);
});

test('INJECTION: backtick command substitution is NOT shell-interpreted', () => {
    injectionProbe('bt', 'HEAD`touch ' + path.join(os.tmpdir(), `bm-canary-${process.pid}-bt`) + '`');
});

test('CLI: usage output unchanged (no args)', () => {
    const r = spawnSync(process.execPath, [CLI], { cwd: ROOT, encoding: 'utf8' });
    assert(r.status === 0, 'exit ' + r.status + ': ' + (r.stderr || '').slice(0, 200));
    assert(r.stdout.includes('Brain Branch Manager'), 'usage banner missing');
});

test('CLI: status command works (read-only)', () => {
    const r = spawnSync(process.execPath, [CLI, 'status'], { cwd: ROOT, encoding: 'utf8' });
    assert(r.status === 0, 'exit ' + r.status + ': ' + (r.stderr || '').slice(0, 200));
    assert(r.stdout.includes('Branch:'), 'status output missing');
});

console.log(`\n  ${results.passed} passed, ${results.failed} failed`);
if (results.failed > 0) {
    console.log('\n  FAILURES:');
    failures.forEach(f => console.log('   - ' + f));
}
process.exit(results.failed > 0 ? 1 : 0);
