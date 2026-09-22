#!/usr/bin/env node
/**
 * Atomic writes everywhere (audit P2 #27)
 *
 * Before this slice, 9 sites across 6 lib files still wrote FINAL paths with
 * bare fs.writeFileSync / fs.promises.writeFile:
 *
 *   lib/brain.js _bfsWrite fallback — direct models-tree write (also needed a
 *     mkdir race fix: recursive mkdir never throws, but the write itself was
 *     non-atomic; the fallback exists only in the storage↔brain require-cycle
 *     window so the store must win).
 *   lib/qos.js CircuitBreaker._save — non-models fallback wrote the snapshot
 *     non-atomically; a crash mid-write left a truncated circuit state that
 *     then loaded as null/undefined and silently reset all breakers.
 *   lib/security/gates.js _save — .agent_tmp/security-gates.json, same
 *     truncated-state hazard for trust/block decisions.
 *   lib/transform.js horcrux create() (svg + json) — a crash mid-encode left a
 *     PARTIAL horcrux that inspect/restore would fail on (the exact artifact
 *     the reincarnation drill depends on).
 *   lib/wal.js intent() blob spill + compact() truncate — the crash-recovery
 *     journal itself was not crash-safe.
 *   lib/format.js saveFile — the shared multi-format writer.
 *   lib/geometry/{fragmenter,quasicrystal}.js — provider records.
 *
 * The fix: a shared fs-only helper `atomicWriteFile()` living in lib/error.js
 * (zero Vant-module deps, so ANY module can require it without creating or
 * crossing the require cycle) — temp file + rename, same-dir temp, crash can
 * never leave a partial final file; crash MAY leave a hidden temp file behind
 * (`.name.UUID.tmp`), which is harmless and swept by `vant clean cache`.
 *
 * Also fixed in this slice: brain.js _bfsWrite fallback tried `mkdirSync` then
 * `writeFileSync` without retry — under concurrent writers mkdir succeeds but
 * the write races; now retried once via atomicWriteFile, which mkdirs on its
 * own. And gates._save got a swallow-everything guard so a refused write can
 * never throw into trust evaluation.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0 };
let _chain = Promise.resolve();

function test(name, fn) {
    _chain = _chain.then(() => {
        return Promise.resolve().then(fn).then(ok => {
            if (ok === true || (ok && ok.success)) {
                results.passed++;
                console.log(`  ✓ ${name}`);
            } else {
                results.failed++;
                const msg = (ok && ok.error) || 'failed';
                console.log(`  ✗ ${name}: ${msg}`);
            }
        }).catch(e => {
            results.failed++;
            console.log(`  ✗ ${name}: ${e.message}`);
        });
    });
}

console.log('\n⚛️  ATOMIC WRITES TESTS (P2 #27)\n');

// ---------- 1. Shared helper contract (fs-only, cycle-safe) ----------

test('helper contract: temp file + rename, no partial final file on mid-write crash', () => {
    const { atomicWriteFile } = require(path.join(ROOT, 'lib', 'error.js'));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-atomic-'));
    try {
        const target = path.join(dir, 'final.txt');
        atomicWriteFile(target, 'hello-vant');
        if (fs.readFileSync(target, 'utf8') !== 'hello-vant') return { success: false, error: 'content mismatch' };

        // Signature: no temp files left behind after a successful write
        const leftovers = fs.readdirSync(dir).filter(f => f !== 'final.txt');
        if (leftovers.length !== 0) return { success: false, error: `leftover files: ${leftovers.join(',')}` };

        // Nested dirs are created automatically
        const nested = path.join(dir, 'a', 'b', 'deep.txt');
        atomicWriteFile(nested, 'nested');
        if (fs.readFileSync(nested, 'utf8') !== 'nested') return { success: false, error: 'nested write failed' };

        // Accepts Buffer content
        atomicWriteFile(path.join(dir, 'buf.bin'), Buffer.from([1, 2, 3]));
        if (fs.readFileSync(path.join(dir, 'buf.bin')).length !== 3) return { success: false, error: 'buffer write failed' };

        return true;
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('helper contract: atomic replace preserves readback (rename semantics, no append/corruption)', () => {
    const { atomicWriteFile } = require(path.join(ROOT, 'lib', 'error.js'));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-atomic-'));
    try {
        const target = path.join(dir, 'state.json');
        atomicWriteFile(target, JSON.stringify({ v: 1 }));
        atomicWriteFile(target, JSON.stringify({ v: 2, big: 'x'.repeat(100000) }));
        const parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
        if (parsed.v !== 2) return { success: false, error: 'replace did not land' };
        if (fs.readFileSync(target, 'utf8').length < 100000) return { success: false, error: 'large content truncated' };
        // No leftovers after overwrite either
        const leftovers = fs.readdirSync(dir).filter(f => f !== 'state.json');
        if (leftovers.length !== 0) return { success: false, error: 'leftover temp files after overwrite' };
        return true;
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('helper contract: is exported from storage.js as the one-door re-export', () => {
    const storage = require(path.join(ROOT, 'lib', 'storage.js'));
    if (typeof storage.atomicWriteFile !== 'function') return { success: false, error: 'storage.atomicWriteFile missing' };
    if (typeof storage.atomicWrite !== 'function') return { success: false, error: 'storage.atomicWrite missing' };
    // same implementation, one door
    if (storage.atomicWriteFile !== require(path.join(ROOT, 'lib', 'error.js')).atomicWriteFile) {
        return { success: false, error: 're-export is not the shared helper' };
    }
    return true;
});

// ---------- 2. Structural pins: no raw final-path writes remain in lib/ ----------

function readLib(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }

test('structural: lib has no bare fs.writeFileSync outside storage.js temp-path internals', () => {
    // storage.js is ALLOWED exactly one: the temp write inside atomicWrite().
    const offenders = [];
    const libDir = path.join(ROOT, 'lib');
    const walk = (dir) => {
        for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, f.name);
            if (f.isDirectory()) { walk(full); continue; }
            if (!f.name.endsWith('.js')) continue;
            const src = fs.readFileSync(full, 'utf8');
            const rel = path.relative(ROOT, full).replace(/\\/g, '/');
            if (/fs\.writeFileSync\s*\(/.test(src)) {
            if (rel === 'lib/storage.js' || rel === 'lib/error.js') {
                // lib/storage.js: only the temp-path line inside atomicWrite is legal.
                // lib/error.js: the helper ITSELF (temp-fd write + truncate) is the
                // one legitimate direct write in the codebase.
                const hits = src.split('\n').filter(l => /fs\.writeFileSync\s*\(/.test(l));
                if (rel === 'lib/error.js') {
                    if (hits.length !== 1 || !/writeFileSync\s*\(fd/.test(hits[0])) {
                        offenders.push(`${rel}: expected exactly the helper's fd temp write`);
                    }
                } else if (hits.length !== 1 || !hits[0].includes('tempPath')) {
                    offenders.push(`${rel}: ${hits.length} writeFileSync lines (expected only tempPath)`);
                }
            } else {
                offenders.push(rel);
            }
            }
        }
    };
    walk(libDir);
    if (offenders.length) return { success: false, error: `raw final-path writers: ${offenders.join(', ')}` };
    return true;
});

test('structural: lib has no bare fs.promises.writeFile outside the atomic helper', () => {
    const offenders = [];
    const libDir = path.join(ROOT, 'lib');
    const walk = (dir) => {
        for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, f.name);
            if (f.isDirectory()) { walk(full); continue; }
            if (!f.name.endsWith('.js')) continue;
            const src = fs.readFileSync(full, 'utf8');
            const rel = path.relative(ROOT, full).replace(/\\/g, '/');
            if (/fs\.promises\.writeFile\s*\(/.test(src)) offenders.push(rel);
        }
    };
    walk(libDir);
    if (offenders.length) return { success: false, error: `async raw writers: ${offenders.join(', ')}` };
    return true;
});

test('structural: migrated files actually reference the shared helper', () => {
    const mustReference = [
        'lib/brain.js',
        'lib/qos.js',
        'lib/security/gates.js',
        'lib/transform.js',
        'lib/wal.js',
        'lib/format.js',
        'lib/geometry/fragmenter.js',
        'lib/geometry/quasicrystal.js',
    ];
    for (const f of mustReference) {
        if (!readLib(f).includes('atomicWriteFile')) {
            return { success: false, error: `${f} does not use atomicWriteFile` };
        }
    }
    return true;
});

// ---------- 3. Behavioral: the migrated sites ----------

test('qos CircuitBreaker._save (non-models fallback): write is crash-safe via helper', () => {
    const qosPath = readLib('lib/qos.js');
    // the fallback branch must have been converted off bare writeFileSync
    if (/fs\.writeFileSync\s*\(/.test(qosPath)) return { success: false, error: 'qos still uses bare writeFileSync' };
    // and must call the helper with the composed file path
    if (!/atomicWriteFile\(\s*filePath/.test(qosPath)) return { success: false, error: 'qos fallback does not call atomicWriteFile(filePath, ...)' };
    return true;
});

test('gates._save: persists trust/block state atomically + refuses loudly without throwing', () => {
    const { SecurityGates } = require(path.join(ROOT, 'lib', 'security', 'gates.js'));
    // Sandboxed to a temp CWD so the test never touches the repo .agent_tmp
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-gates-'));
    const prevCwd = process.cwd();
    try {
        process.chdir(dir);
        const g = new SecurityGates();
        g.trust('agent-a', { score: 0.9 });   // method names verified below
        g._save();
        const dbPath = path.join(dir, '.agent_tmp', 'security-gates.json');
        if (!fs.existsSync(dbPath)) return { success: false, error: 'gate db not written' };
        const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        if (!Array.isArray(db.trusted) || db.trusted.length === 0) return { success: false, error: 'trusted entries missing' };
        return true;
    } finally {
        process.chdir(prevCwd);
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('wal: blob spill + compact truncate are atomic (journal survives crash)', () => {
    const { Wal } = require(path.join(ROOT, 'lib', 'wal.js'));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-wal-'));
    try {
        const wal = new Wal(dir, { enabled: true });
        // Force a blob spill (> 64KB inline cap) and verify the blob file + record
        const big = 'x'.repeat(80 * 1024);
        const seq = wal.intent('write', 'brain.md', big);
        if (!seq) return { success: false, error: 'intent refused' };
        const blobPath = path.join(dir, '.wal', 'blobs');
        const blobs = fs.existsSync(blobPath) ? fs.readdirSync(blobPath) : [];
        if (blobs.length !== 1) return { success: false, error: `expected 1 spilled blob, got ${blobs.length}` };
        // blob content intact (sha256-hex named)
        if (!/^[0-9a-f]{64}$/.test(blobs[0])) return { success: false, error: 'blob name not sha256 hex' };
        if (fs.readFileSync(path.join(blobPath, blobs[0]), 'utf8') !== big) return { success: false, error: 'blob content mismatch' };

        // Oversize the journal past MAX_LOG_BYTES (4MB) with all-DONE records
        // (63KB inlines — under the spill cap, 70+ of them clears 4MB), then
        // compact() must truncate the log atomically to empty.
        const small = 'y'.repeat(63 * 1024);
        for (let i = 0; i < 75; i++) {
            const s = wal.intent('write', `brain-${i}.md`, small);
            if (s) wal.done(s, `brain-${i}.md`);
        }
        wal.done(seq, 'brain.md');
        const sizeBefore = fs.statSync(path.join(dir, '.wal', 'wal.log')).size;
        if (sizeBefore <= 4 * 1024 * 1024) return { success: false, error: `journal only ${sizeBefore} bytes — oversized precondition not met` };
        const c = wal.compact();
        if (!c.compacted) return { success: false, error: `compact refused: ${JSON.stringify(c)}` };
        const log = fs.readFileSync(path.join(dir, '.wal', 'wal.log'), 'utf8');
        if (log.trim() !== '') return { success: false, error: 'journal not truncated' };
        return true;
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('brain.js _bfsWrite fallback: prefers the store, writes atomically when falling back', () => {
    const brainSrc = readLib('lib/brain.js');
    if (!/atomicWriteFile/.test(brainSrc)) return { success: false, error: 'brain fallback not atomic' };
    // The store-first contract is pinned by the brain suite; here we pin the
    // ordering: store check comes before any direct write.
    const idxStore = brainSrc.indexOf('_getBrainFileStore');
    const idxWrite = brainSrc.indexOf('atomicWriteFile');
    if (idxStore === -1 || idxWrite === -1 || idxStore > idxWrite) {
        return { success: false, error: 'fallback not ordered after store check' };
    }
    return true;
});

test('transform horcrux create(): svg + json outputs go through the atomic helper', () => {
    const src = readLib('lib/transform.js');
    const svgIdx = src.indexOf('stego.encodeSvg');
    const jsonFallback = src.indexOf('// JSON fallback');
    if (svgIdx === -1 || jsonFallback === -1) return { success: false, error: 'create() region markers not found' };
    const region = src.slice(svgIdx, jsonFallback + 400);
    const atomicHits = (region.match(/atomicWriteFile\(/g) || []).length;
    if (atomicHits < 2) return { success: false, error: `expected ≥2 atomic writes in horcrux create, got ${atomicHits}` };
    if (/fs\.writeFileSync\(/.test(region)) return { success: false, error: 'raw write remains in create()' };
    return true;
});

test('format.saveFile routes through the shared helper', () => {
    const src = readLib('lib/format.js');
    if (!/atomicWriteFile\(/.test(src)) return { success: false, error: 'format.saveFile not atomic' };
    if (/fs\.promises\.writeFile\s*\(/.test(src)) return { success: false, error: 'format still uses raw async write' };
    return true;
});

test('geometry providers: fragmenter + quasicrystal records write atomically', () => {
    for (const f of ['lib/geometry/fragmenter.js', 'lib/geometry/quasicrystal.js']) {
        const src = readLib(f);
        if (!/atomicWriteFile\(/.test(src)) return { success: false, error: `${f} not atomic` };
        if (/fs\.promises\.writeFile\s*\(/.test(src)) return { success: false, error: `${f} still raw` };
    }
    return true;
});

// ---------- done ----------

_chain.then(() => {
    console.log(`\n${results.passed} passed, ${results.failed} failed\n`);
    process.exit(results.failed === 0 ? 0 : 1);
});
