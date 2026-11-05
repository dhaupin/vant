#!/usr/bin/env node
/**
 * Audit-ledger archive inspector + global-lock coverage gates (pass 118)
 *
 * #6a — the pass-113 ledger cap rotates trimmed entries into
 * models/audit-rotate/audit-<ts>.json (BARE JSON ARRAYS) with no tool to
 * look inside. audit.listArchives()/readArchive() + `vant audit-ledger`
 * make it queryable. Gates drive the REAL lib functions and the REAL CLI
 * binary against a planted archive (bogus entries are namespaced and
 * removed afterwards; the live ledger is never touched).
 *
 * #6b — audit-locks global-kind allowlist: every pathForGlobal() kind must
 * be in the §8.5 allowlist, and the three S5 global writers must still use
 * it. Gated by running the audit against a deliberately broken COPY of the
 * check (the real script must stay green; a temp lib file with an unknown
 * kind proves the check catches new callers, without breaking the real run).
 *
 * (scratch brain qc-alcli, wiped before and after; the vant brain ledger is
 * only ever READ)
 */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

process.env.VANT_BRAIN = 'qc-alcli';

const ROOT = path.resolve(__dirname, '..');
const ARCHIVE_DIR = path.join(ROOT, 'models', 'audit-rotate');
const BRAIN = path.join(ROOT, 'models', 'private', 'qc-alcli');
fs.rmSync(BRAIN, { recursive: true, force: true });

const results = { passed: 0, failed: 0 };
function report(name, ok, err) {
    if (ok) { results.passed++; console.log(`  ✓ ${name}`); }
    else { results.failed++; console.log(`  ✗ ${name}: ${err || 'assertion failed'}`); }
}
function run(cmd, args) {
    return new Promise((resolve) => {
        execFile(cmd, args, { cwd: ROOT, env: { ...process.env, VANT_BRAIN: 'qc-alcli' } }, (err, stdout, stderr) => {
            resolve({ code: err ? (err.code || 1) : 0, out: String(stdout || ''), err: String(stderr || '') });
        });
    });
}

console.log('\n🗂  AUDIT LEDGER INSPECTOR + GLOBAL-LOCK COVERAGE (pass 118)\n');

// Planted archive: namespaced actions make it identifiable and removable.
const FAKE_TS = 1770000000000;
const FAKE_FILE = `audit-${FAKE_TS}.json`;
const planted = [
    { timestamp: '2026-01-01T00:00:00.000Z', action: 'gate:archive-alpha', data: { n: 1 }, hash: 'x' },
    { timestamp: '2026-01-01T00:01:00.000Z', action: 'gate:archive-beta', data: { n: 2 }, hash: 'x' },
    { timestamp: '2026-01-01T00:02:00.000Z', action: 'gate:archive-alpha', data: { n: 3 }, hash: 'x' }
];
let cleaned = false;
function cleanup() {
    if (cleaned) return;
    cleaned = true;
    try { fs.rmSync(path.join(ARCHIVE_DIR, FAKE_FILE), { force: true }); } catch (e) { }
    fs.rmSync(BRAIN, { recursive: true, force: true });
}
process.on('exit', cleanup);

(async () => {
    // ============================================
    // GATE A — listArchives + readArchive (lib functions)
    // ============================================
    try {
        fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
        fs.writeFileSync(path.join(ARCHIVE_DIR, FAKE_FILE), JSON.stringify(planted));
        const audit = require(path.join(ROOT, 'lib', 'audit'));

        const list = audit.listArchives();
        const mine = list.find(a => path.basename(a.file) === FAKE_FILE);
        report('gate A: listArchives finds the planted archive with true counts',
            !!mine && mine.entries === 3 && mine.bytes > 0
                && mine.first === planted[0].timestamp && mine.last === planted[2].timestamp,
            JSON.stringify(mine));

        const readOne = audit.readArchive(FAKE_FILE);
        report('gate A: readArchive(file) returns all entries oldest-first',
            readOne.total === 3 && readOne.entries.length === 3
                && readOne.entries[0].action === 'gate:archive-alpha',
            `total=${readOne.total}`);

        const filtered = audit.readArchive(FAKE_FILE, { action: 'archive-alpha' });
        report('gate A: readArchive action filter matches substring',
            filtered.entries.length === 2 && filtered.entries.every(e => e.action.includes('archive-alpha')),
            `filtered=${filtered.entries.length}`);

        const limited = audit.readArchive(FAKE_FILE, { action: 'archive-alpha', limit: 1 });
        report('gate A: readArchive limit returns the NEWEST match',
            limited.entries.length === 1 && limited.entries[0].data.n === 3,
            JSON.stringify(limited.entries[0] && limited.entries[0].data));

        let threw = null;
        try { audit.readArchive('../escape.json'); } catch (e) { threw = e; }
        report('gate A: readArchive rejects non-archive names (no traversal)',
            threw && threw.code === 'E_INVALID_ARCHIVE',
            threw ? threw.message : 'no throw');

        const all = audit.readArchive(null, {});
        report('gate A: readArchive() with no file concatenates all archives',
            all.entries.some(e => e.action === 'gate:archive-beta'),
            `total=${all.total}`);
    } catch (e) {
        report('gate A (inspector lib)', false, e.message);
    }

    // ============================================
    // GATE B — the real CLI binary
    // ============================================
    try {
        const listRun = await run(process.execPath, [path.join(ROOT, 'bin', 'audit-ledger.js')]);
        report('gate B: `audit-ledger` lists the planted archive',
            listRun.code === 0 && listRun.out.includes(FAKE_FILE) && listRun.out.includes('3 entries'),
            `code=${listRun.code} out=${listRun.out.slice(0, 160)}`);

        const allRun = await run(process.execPath, [path.join(ROOT, 'bin', 'audit-ledger.js'), '--all', '--action', 'archive-beta']);
        let parsed = null;
        try { parsed = JSON.parse(allRun.out); } catch (e) { }
        report('gate B: `audit-ledger --all --action` returns filtered JSON',
            allRun.code === 0 && parsed && parsed.total === 3 && parsed.returned === 1
                && parsed.entries[0].action === 'gate:archive-beta',
            `code=${allRun.code} parsed=${JSON.stringify(parsed && { total: parsed.total, returned: parsed.returned })}`);

        const fileRun = await run(process.execPath, [path.join(ROOT, 'bin', 'audit-ledger.js'), FAKE_FILE]);
        report('gate B: `audit-ledger <file>` dumps one archive',
            fileRun.code === 0 && fileRun.out.includes('gate:archive-alpha'),
            `code=${fileRun.code}`);

        const badRun = await run(process.execPath, [path.join(ROOT, 'bin', 'audit-ledger.js'), '../escape.json']);
        report('gate B: traversal name exits non-zero (E_INVALID_ARCHIVE)',
            badRun.code === 2,
            `code=${badRun.code} err=${badRun.err.trim().slice(0, 80)}`);
    } catch (e) {
        report('gate B (CLI)', false, e.message);
    }

    // ============================================
    // GATE C — audit-locks global-kind allowlist (temp-file break test)
    // ============================================
    try {
        // The REAL audit must stay green.
        const realRun = await run(process.execPath, [path.join(ROOT, 'scripts', 'audit-locks.js')]);
        report('gate C: real audit-locks run is green (allowlist satisfied)',
            realRun.code === 0 && realRun.out.includes('global kinds (allowlist):            auth-lockout, vaf-blocked, mcp-insights'),
            `code=${realRun.code} ${realRun.err.slice(0, 120)}`);

        // A temp lib file using an UNKNOWN global kind must be CAUGHT.
        const tmpLib = path.join(ROOT, 'lib', 'zz-gate-tmp.js');
        fs.writeFileSync(tmpLib, `
// (test fixture, removed right after) deliberately unlisted global kind
const lock = require('./lock');
function persist() {
    return lock.withLock(lock.pathForGlobal('gate-tmp-unknown'), () => true);
}
module.exports = { persist };
`);
        let caught = null;
        try {
            const bad = await run(process.execPath, [path.join(ROOT, 'scripts', 'audit-locks.js')]);
            caught = bad.code !== 0 && /gate-tmp-unknown/.test(bad.err + bad.out);
        } finally {
            fs.rmSync(tmpLib, { force: true });
        }
        report('gate C: unknown pathForGlobal kind FAILS the audit (caught live, fixture removed)',
            caught === true,
            `caught=${caught}`);

        // And after removing the fixture the audit is green again.
        const rerun = await run(process.execPath, [path.join(ROOT, 'scripts', 'audit-locks.js')]);
        report('gate C: audit green again after fixture removal',
            rerun.code === 0,
            `code=${rerun.code}`);
    } catch (e) {
        report('gate C (global-kind allowlist)', false, e.message);
    }

    // ============================================
    // Summary
    // ============================================
    cleanup();
    console.log(`\n--- RESULTS ---\n`);
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    console.log(`  Total:   ${results.passed + results.failed}`);
    process.exit(results.failed > 0 ? 1 : 0);
})().catch(e => {
    console.error('fatal:', e.message);
    cleanup();
    process.exit(1);
});
