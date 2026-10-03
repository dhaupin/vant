#!/usr/bin/env node
/**
 * Backup Restore Round-Trip Tests (pass 24)
 *
 * Restoring mutates brain state, so this suite runs the whole round trip in
 * an ISOLATED repo copy under the OS tmpdir (lib/ + bin/ + package.json +
 * node_modules symlink; models/ is created fresh by the backup itself).
 *
 * Bugs pinned here (all three found in pass 24):
 * 1. lib/backup.js restore() had `data` block-scoped inside the validation
 *    `if` but referenced after it — EVERY restore threw ReferenceError
 *    before touching anything.
 * 2. lib/backup.js never exported restore — bin/backup.js's `if (mod.restore)`
 *    was always false, so `vant backup restore <file>` printed
 *    "Restoring from: X" and exited 0 having done nothing.
 * 3. Nothing validated the backup file before restore. Now decode + validate
 *    always gate the restore: wrong password / corrupted SVG / missing file
 *    fail BEFORE any brain state changes.
 *
 * Run: node test/backup-restore.test.js
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

console.log('\n💾 BACKUP RESTORE ROUND-TRIP TESTS\n');

/**
 * Isolated repo copy: restore mutates brain state, so the round trip must
 * never run against the live tree. Mirrors fresh-dir-routing's sandbox
 * (lib/bin/package.json + node_modules symlink; models/ starts absent).
 */
function makeIsolatedRepo() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-backup-rt-'));
    for (const entry of ['lib', 'bin', 'package.json']) {
        fs.cpSync(path.join(ROOT, entry), path.join(dir, entry), { recursive: true, dereference: true });
    }
    const nmSrc = path.join(ROOT, 'node_modules');
    if (fs.existsSync(nmSrc)) {
        try { fs.symlinkSync(nmSrc, path.join(dir, 'node_modules'), 'dir'); } catch (e) { /* exists */ }
    }
    return dir;
}

/**
 * Node -e helper: the round trip is async, and the test harness is sync.
 * Run it in a subprocess that prints PASS/FAIL:<detail> and exit 0/1.
 */
function runInRepo(repoDir, script) {
    const out = execFileSync('node', ['-e', script], {
        cwd: repoDir,
        encoding: 'utf8',
        timeout: 120000,
        env: { ...process.env }
    });
    return out;
}

// ============================================
// EXPORT SHAPE (the silent-stub guard)
// ============================================

test('lib/backup exports restore (was missing — CLI restore was a silent no-op)', () => {
    const backup = require(path.join(ROOT, 'lib', 'backup'));
    if (typeof backup.restore !== 'function') {
        return { error: 'restore missing from exports — vant backup restore is a silent no-op again' };
    }
    return { success: true };
});

test('scheduler instance exposes restore too', () => {
    const backup = require(path.join(ROOT, 'lib', 'backup'));
    return { success: typeof backup.getInstance().restore === 'function' };
});

// ============================================
// FULL ROUND TRIP (isolated repo copy)
// ============================================

const ROUND_TRIP = `
(async () => {
    const backup = require('./lib/backup');
    const fs = require('fs');
    const PW = 'roundtrip-pass-24';

    // 1. Create a real horcrux backup
    const created = await backup.create({
        type: 'horcrux',
        outputPath: 'models/backup/rt-test.svg',
        password: PW
    });
    if (!created || !created.path) throw new Error('create returned no path');
    if (!fs.existsSync(created.path)) throw new Error('backup file missing after create');
    if (fs.statSync(created.path).size < 1000) throw new Error('backup suspiciously small');

    // 2. Restore it (pre-pass-24 this threw ReferenceError: data is not defined)
    const res = await backup.restore(created.path, { password: PW });
    if (!res || !Array.isArray(res.restored)) throw new Error('restore returned no restored[]');
    if (res.errors.length > 0) throw new Error('restore had errors: ' + JSON.stringify(res.errors));

    // 3. Wrong password must be REJECTED by validation, before any restore
    try {
        await backup.restore(created.path, { password: 'definitely-wrong' });
        throw new Error('FAIL-HACK: restore succeeded with wrong password');
    } catch (e) {
        if (/FAIL-HACK/.test(e.message)) throw e;
        // expected: invalid password / validation failure
    }

    // 4. Missing file must fail fast (not silently "restore nothing")
    try {
        await backup.restore('models/backup/never-existed.svg', { password: PW });
        throw new Error('FAIL-HACK: restore succeeded on a missing file');
    } catch (e) {
        if (/FAIL-HACK/.test(e.message)) throw e;
        // expected: FILE_NOT_FOUND / validation failure
    }

    console.log('PASS restored=' + res.restored.length);
})().catch(e => { console.error('FAIL:' + e.message); process.exit(1); });
`;

test('full round trip in isolated repo: create → restore → rejects wrong pw + missing file', () => {
    const dir = makeIsolatedRepo();
    try {
        const out = runInRepo(dir, ROUND_TRIP);
        if (!/PASS restored=/.test(out)) {
            throw new Error('round trip did not pass:\n' + out);
        }
        return { success: true };
    } finally {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    }
});

// ============================================
// CLI PATH (bin/backup.js restore now really restores)
// ============================================

test('CLI restore: exits 0 on real restore, nonzero on missing file (isolated)', () => {
    const dir = makeIsolatedRepo();
    try {
        // Create a backup via the lib inside the isolated repo, then drive
        // bin/backup.js restore against it (lib was never exported before).
        runInRepo(dir, `
(async () => {
    const backup = require('./lib/backup');
    await backup.create({ type: 'horcrux', outputPath: 'models/backup/cli.svg', password: 'clipass' });
    console.log('PASS');
})().catch(e => { console.error('FAIL:' + e.message); process.exit(1); });
        `);

        // Real restore through the CLI. Before the fix this exited 0 while
        // doing NOTHING; the "Restored from:" line only exists on success.
        execFileSync('node', [path.join(dir, 'bin', 'backup.js'), 'restore', 'models/backup/cli.svg'], {
            cwd: dir,
            encoding: 'utf8',
            timeout: 120000,
            env: { ...process.env, VANT_BRAIN_PASSWORD: 'clipass' }
        });
        // (throws on nonzero exit — reaching here means exit 0)

        // Missing file must exit nonzero (main().catch → exit 1).
        let missedCode = 0;
        try {
            execFileSync('node', [path.join(dir, 'bin', 'backup.js'), 'restore', 'models/backup/nope.svg'], {
                cwd: dir,
                encoding: 'utf8',
                timeout: 120000,
                env: { ...process.env, VANT_BRAIN_PASSWORD: 'clipass' }
            });
        } catch (e) {
            missedCode = e.status === undefined ? -1 : e.status;
        }
        if (missedCode === 0) throw new Error('CLI restore accepted a missing file with exit 0');
        return { success: true };
    } finally {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    }
});

// ============================================
// SUMMARY
// ============================================

console.log(`\n=== Results: ${results.passed} passed, ${results.failed} failed ===\n`);
process.exit(results.failed > 0 ? 1 : 0);
