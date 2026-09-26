#!/usr/bin/env node
/**
 * WAL crash-recovery tests (prd-storage — Slice C)
 *
 * lib/wal.js: per-store intent journal; replay on store open re-applies
 * intents whose target is missing/older (idempotent mtime rule); abort
 * tombstones skip; DONE acks resolve; large payloads spill to blobs.
 * Every journal failure is best-effort — never throws into caller paths.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { Wal } = require('../lib/wal');
const mod = require('../lib/storage');
const { FileStorage } = mod;

const results = { passed: 0, failed: 0 };
const failures = [];

function test(name, fn) {
    try {
        const ok = fn();
        if (ok === true || (ok && ok.success)) {
            results.passed++;
            console.log(`  ✓ ${name}`);
        } else {
            results.failed++;
            const msg = (ok && ok.error) || 'failed';
            failures.push(`${name}: ${msg}`);
            console.log(`  ✗ ${name}: ${msg}`);
        }
    } catch (e) {
        results.failed++;
        failures.push(`${name}: ${e.message}`);
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vant-wal-test-'));
const rm = (p) => { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) { /* best effort */ } };

console.log('\n📝 WAL CRASH-RECOVERY TESTS\n');

test('module exposes Wal + getWalStatus', () => {
    if (typeof Wal !== 'function') return { success: false, error: 'Wal class missing' };
    if (typeof mod.getWalStatus !== 'function') return { success: false, error: 'getWalStatus missing' };
    if (typeof mod.Wal !== 'function') return { success: false, error: 'Wal not re-exported from storage' };
    return true;
});

test('intent + done produce resolvable journal (0 pending)', () => {
    const base = mk();
    try {
        const w = new Wal(base, { enabled: true });
        const seq = w.intent('write', 'f.txt', 'data');
        if (!seq) return { success: false, error: 'no seq returned' };
        w.done(seq, 'f.txt');
        const st = mod.getWalStatus(base);
        if (!st.exists) return { success: false, error: 'journal missing' };
        if (st.pendingIntents !== 0) return { success: false, error: `pending ${st.pendingIntents}` };
        return true;
    } finally { rm(base); }
});

test('crash recovery: intent without DONE re-applies on reopen', () => {
    const base = mk();
    try {
        const s1 = new FileStorage({ basePath: base, wal: true });
        s1._wal.intent('write', 'lost.txt', 'recovered-content');
        const s2 = new FileStorage({ basePath: base, wal: true });
        return s2.read('lost.txt') === 'recovered-content' || { success: false, error: 'lost write not recovered' };
    } finally { rm(base); }
});

test('replay is idempotent: newer target is dropped, not clobbered', () => {
    const base = mk();
    try {
        const w = new Wal(base, { enabled: true });
        w.intent('write', 'f.txt', 'old');  // no done — looks pending
        fs.writeFileSync(path.join(base, 'f.txt'), 'new');
        // bump mtime safely into the future
        const then = Date.now() + 5000;
        fs.utimesSync(path.join(base, 'f.txt'), new Date(then), new Date(then));
        let applied = 0;
        w.replay(() => { applied++; fs.writeFileSync(path.join(base, 'f.txt'), 'old'); });
        if (applied !== 0) return { success: false, error: `applied ${applied} times on newer target` };
        if (fs.readFileSync(path.join(base, 'f.txt'), 'utf8') !== 'new') {
            return { success: false, error: 'newer target clobbered' };
        }
        return true;
    } finally { rm(base); }
});

test('abort tombstone skips replay of that intent', () => {
    const base = mk();
    try {
        const w = new Wal(base, { enabled: true });
        const seq = w.intent('write', 'aborted.txt', 'nope');
        w.abort(seq, 'aborted.txt');
        let applied = 0;
        w.replay(() => { applied++; });
        if (applied !== 0) return { success: false, error: `aborted intent applied ${applied} times` };
        return true;
    } finally { rm(base); }
});

test('delete intent re-deletes resurrected file on replay', () => {
    const base = mk();
    try {
        const w = new Wal(base, { enabled: true });
        fs.writeFileSync(path.join(base, 'doomed.txt'), 'x');
        w.intent('delete', 'doomed.txt'); // crash before unlink
        let deleted = false;
        w.replay((op, file) => {
            if (op === 'delete' && file === 'doomed.txt') {
                try { fs.unlinkSync(path.join(base, file)); deleted = true; } catch (e) { /* gone */ }
            }
        });
        return deleted && !fs.existsSync(path.join(base, 'doomed.txt'));
    } finally { rm(base); }
});

test('large payloads spill to blobs and recover', () => {
    const base = mk();
    try {
        const big = 'z'.repeat(200000);
        const s1 = new FileStorage({ basePath: base, wal: true });
        s1._wal.intent('write', 'big.txt', big); // > MAX_INLINE → blob spill
        const s2 = new FileStorage({ basePath: base, wal: true });
        return s2.read('big.txt') === big || { success: false, error: 'blob recovery failed' };
    } finally { rm(base); }
});

test('escaping paths are refused (traversal, absolute, escaping rel)', () => {
    const base = mk();
    try {
        const w = new Wal(base, { enabled: true });
        if (w.intent('write', '../escape.txt', 'x') !== null) return { success: false, error: 'relative traversal accepted' };
        if (w.intent('write', path.join(base, 'abs.txt'), 'x') !== null) return { success: false, error: 'absolute path accepted' };
        if (w.intent('write', 'sub/../../up.txt', 'x') !== null) return { success: false, error: 'dotdot-in-middle accepted' };
        return true;
    } finally { rm(base); }
});

test('WAL disabled → no journal, no replay', () => {
    const base = mk();
    try {
        const s = new FileStorage({ basePath: base });
        s.write('x.txt', 'y');
        const st = mod.getWalStatus(base);
        if (st.exists) return { success: false, error: 'journal created while disabled' };
        return true;
    } finally { rm(base); }
});

test('corrupt journal lines are skipped, valid ones still replay', () => {
    const base = mk();
    try {
        const w = new Wal(base, { enabled: true });
        w.intent('write', 'good.txt', 'fine');
        fs.appendFileSync(path.join(base, '.wal', 'wal.log'), '{corrupt json\n');
        const stats = w.replay((op, file, payload) => {
            fs.writeFileSync(path.join(base, file), payload || '');
        });
        if (stats.dropped < 1) return { success: false, error: 'corrupt line not counted as dropped' };
        if (stats.replayed !== 1) return { success: false, error: `valid intent lost (replayed ${stats.replayed})` };
        return true;
    } finally { rm(base); }
});

test('journal failure never throws into caller paths', () => {
    const base = mk();
    try {
        // Sabotage WITHOUT /proc or other exotic paths: a regular FILE sits
        // where the journal dir would be → mkdir/append fail fast (ENOTDIR)
        // on ordinary filesystems. (mkdir under /proc HANGS in some
        // containers — lesson recorded.)
        const blocker = path.join(base, '.wal');
        fs.writeFileSync(blocker, 'not a directory');
        const w = new Wal(base, { enabled: true });
        const seq = w.intent('write', 'f.txt', 'x');   // must return null, not throw or hang
        if (seq !== null) return { success: false, error: 'sabotaged journal returned seq' };
        return true;
    } catch (e) {
        return { success: false, error: `threw: ${e.message}` };
    } finally { rm(base); }
});

test('env opt-in (VANT_WAL=1) enables journal', () => {
    const base = mk();
    const prev = process.env.VANT_WAL;
    process.env.VANT_WAL = '1';
    try {
        const s = new FileStorage({ basePath: base });
        s.write('env.txt', 'v');
        const st = mod.getWalStatus(base);
        return st.exists === true || { success: false, error: 'env opt-in did not enable journal' };
    } finally {
        if (prev === undefined) delete process.env.VANT_WAL; else process.env.VANT_WAL = prev;
        rm(base);
    }
});

test('CLI: wal --status reports pending intents', () => {
    const base = mk();
    try {
        const w = new Wal(base, { enabled: true });
        w.intent('write', 'pending.txt', 'data'); // no done
        const st = mod.getWalStatus(base);
        if (st.pendingIntents !== 1) return { success: false, error: `pending ${st.pendingIntents}` };
        if (st.pending[0].file !== 'pending.txt') return { success: false, error: 'pending entry wrong' };
        return true;
    } finally { rm(base); }
});

test('compaction truncates fully-acked oversized journals', () => {
    const base = mk();
    try {
        const w = new Wal(base, { enabled: true });
        // ~5MB of acked records (2 × ~60B lines × 40000 ≈ 5.2MB > 4MB limit)
        w._ensureDirs?.();
        const lines = [];
        for (let i = 0; i < 40000; i++) {
            lines.push(JSON.stringify({ seq: i, op: 'write', file: `f${i}.txt`, ts: Date.now() }));
            lines.push(JSON.stringify({ seq: i, done: true, file: `f${i}.txt`, ts: Date.now() }));
        }
        fs.mkdirSync(path.join(base, '.wal'), { recursive: true });
        fs.writeFileSync(path.join(base, '.wal', 'wal.log'), lines.join('\n') + '\n');
        const r = w.compact();
        if (!r.compacted) return { success: false, error: `not compacted: ${JSON.stringify(r)}` };
        if (fs.statSync(path.join(base, '.wal', 'wal.log')).size !== 0) {
            return { success: false, error: 'log not truncated' };
        }
        return true;
    } finally { rm(base); }
});

// cleanup any registry series from these tests
try { require('../lib/metrics').reset(); } catch (e) { /* noop */ }

console.log('\n--- RESULTS ---\n');
console.log(`  Passed:  ${results.passed}`);
console.log(`  Failed:  ${results.failed}`);
if (results.failed > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
}
process.exit(0);
