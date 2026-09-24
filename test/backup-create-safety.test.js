#!/usr/bin/env node
/**
 * Backup Create Safety Tests (pass 25)
 *
 * backup.create({ type: 'horcrux' }) now goes through lib/horcrux-safe
 * (tmp→validate→rename) instead of overwriting the target directly. The
 * danger being pinned: the target may be the ONLY good backup — a failed
 * re-encode used to destroy it (successful encode of corrupt data still
 * replaced the good copy; a crash mid-encode left atomicWriteFile's
 * guarantees as the only line of defense).
 *
 * The whole suite runs in an ISOLATED repo copy under the OS tmpdir:
 * backup's outputPath is cwd-relative BY DESIGN (user-tree artifact), so
 * the isolated copy doubles as the cwd-anchoring fixture.
 *
 * Run: node test/backup-create-safety.test.js
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0, tests: [] };

function test(name, fn) {
    try {
        const r = fn();
        if (r === true || (r && r.success)) {
            results.passed++;
            results.tests.push({ name, status: 'passed' });
            console.log(`  ✓ ${name}`);
        } else {
            results.failed++;
            results.tests.push({ name, status: 'failed', error: (r && r.error) || 'assertion failed' });
            console.log(`  ✗ ${name}: ${(r && r.error) || 'assertion failed'}`);
        }
    } catch (e) {
        results.failed++;
        results.tests.push({ name, status: 'failed', error: e.message.split('\n')[0] });
        console.log(`  ✗ ${name}: ${e.message.split('\n')[0]}`);
    }
}

console.log('\n🛡️  BACKUP CREATE SAFETY TESTS\n');

/** Isolated repo copy (lib/bin/package.json + node_modules symlink). */
function makeIsolatedRepo() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-backup-create-'));
    for (const entry of ['lib', 'bin', 'package.json']) {
        fs.cpSync(path.join(ROOT, entry), path.join(dir, entry), { recursive: true, dereference: true });
    }
    const nmSrc = path.join(ROOT, 'node_modules');
    if (fs.existsSync(nmSrc)) {
        try { fs.symlinkSync(nmSrc, path.join(dir, 'node_modules'), 'dir'); } catch (e) { /* exists */ }
    }
    return dir;
}

/** Async script in a subprocess (harness is sync). Prints PASS <detail> / FAIL:<detail>. */
function runInRepo(repoDir, script) {
    return execFileSync('node', ['-e', script], {
        cwd: repoDir,
        encoding: 'utf8',
        timeout: 180000,
        env: { ...process.env }
    });
}

// ============================================
// HELPER CONTRACT (anchorRoot override)
// ============================================

test('safeWriteHorcrux accepts anchorRoot override (user-tree artifacts)', () => {
    const { safeWriteHorcrux } = require(path.join(ROOT, 'lib', 'horcrux-safe'));
    // No execution — just the option's presence in the signature contract.
    // A wrong-anchored backup.create would write user backups into the
    // INSTALL tree; this test fails if the option disappears again.
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'horcrux-safe.js'), 'utf8');
    if (!src.includes('anchorRoot')) {
        return { error: 'anchorRoot option removed from lib/horcrux-safe.js' };
    }
    return { success: typeof safeWriteHorcrux === 'function' };
});

// ============================================
// FULL CREATE SAFETY SCENARIO (isolated repo copy)
// ============================================

const SCENARIO = `
(async () => {
    const backup = require('./lib/backup');
    const fs = require('fs');
    const P = 'pass25-create-safety';

    // 1. NEW target: writes directly, flagged replaced=false
    let r = await backup.create({ type: 'horcrux', outputPath: 'models/backup/p25.svg', password: P });
    if (r.replaced !== false) throw new Error('new target flagged as replaced');
    if (r.path !== 'models/backup/p25.svg') throw new Error('path shape changed: ' + r.path);
    if (!(r.size > 1000)) throw new Error('suspiciously small: ' + r.size);

    // 2. REPLACE existing: tmp→validate→rename path, flagged replaced=true
    r = await backup.create({ type: 'horcrux', outputPath: 'models/backup/p25.svg', password: P });
    if (r.replaced !== true) throw new Error('replace not flagged');
    if (fs.existsSync('models/backup/p25.tmp.svg')) throw new Error('tmp left behind');

    // 3. Replaced file still decrypts (validation gate held on the write side)
    const res = await backup.restore('models/backup/p25.svg', { password: P });
    if (res.errors.length > 0) throw new Error('restore of replaced backup had errors');

    // 4. CRASH SAFETY: a failed re-encode must leave the original untouched.
    // Capture bytes HERE — after the legit replace (stego output is not
    // byte-deterministic), immediately before the sabotage.
    const before = fs.readFileSync('models/backup/p25.svg', 'utf8');
    const stego = require('./lib/stego');
    const origEncode = stego.encodeSvg;
    stego.encodeSvg = () => { throw new Error('simulated mid-encode crash'); };
    try {
        await backup.create({ type: 'horcrux', outputPath: 'models/backup/p25.svg', password: P });
        stego.encodeSvg = origEncode;
        throw new Error('FAIL-HACK: sabotaged create succeeded');
    } catch (e) {
        stego.encodeSvg = origEncode;
        if (/FAIL-HACK/.test(e.message)) throw e;
        if (!/original left untouched/.test(e.message)) throw new Error('error lost the safety note: ' + e.message);
    }
    if (fs.existsSync('models/backup/p25.tmp.svg')) throw new Error('tmp left behind after crash');
    const after = fs.readFileSync('models/backup/p25.svg', 'utf8');
    if (before !== after) throw new Error('ORIGINAL BACKUP WAS CLOBBERED');

    console.log('PASS create-safety');
})().catch(e => { console.error('FAIL:' + e.message); process.exit(1); });
`;

test('create safety in isolated repo: new → replace → tmp cleanup → crash leaves original byte-identical', () => {
    const dir = makeIsolatedRepo();
    try {
        const out = runInRepo(dir, SCENARIO);
        if (!/PASS create-safety/.test(out)) {
            throw new Error('scenario did not pass:\n' + out.split('\n').filter(l => /FAIL|Error/.test(l)).join('\n'));
        }
        return { success: true };
    } finally {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    }
});

// ============================================
// RATE LIMITER ENFORCEMENT (the never-fired check)
// ============================================

// The limiter only trips after ~205 async checks, and the sync harness
// misreads a returned Promise as a failure — so run the probe in a child
// process (same pattern as the create-safety scenario above).
const RL_PROBE = `
(async () => {
    const transform = require('./lib/transform');
    const op = 'rate-limit-canary-' + Date.now();
    const LIMIT = 200;
    let tripped = false;
    // A few over the global bucket (global + per-client share maxPerMinute).
    const series = [];
    for (let i = 0; i < LIMIT + 5; i++) series.push(transform._checkSecurity(op).catch(() => { tripped = true; }));
    await Promise.all(series);
    if (!tripped) throw new Error('rate limit never fired after ' + (LIMIT + 5) + ' ops — enforcement is broken again');
    console.log('PASS rate-limit');
})().catch(e => { console.error('FAIL:' + e.message); process.exit(1); });
`;

test('transform._checkSecurity enforces its rate limit for real (await + singleton)', () => {
    const out = runInRepo(ROOT, RL_PROBE);
    if (!/PASS rate-limit/.test(out)) {
        throw new Error('limiter probe did not pass:\n' + out.split('\n').filter(l => /FAIL|Error/.test(l)).join('\n'));
    }
    return { success: true };
});

// ============================================
// SUMMARY
// ============================================

console.log(`\n=== Results: ${results.passed} passed, ${results.failed} failed ===\n`);
const exitCode = results.failed > 0 ? 1 : 0;
process.exit(exitCode);
