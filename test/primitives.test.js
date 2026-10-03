#!/usr/bin/env node
/**
 * Primitives module tests (P2 #27 follow-up — the error.js placement move)
 *
 * atomicWriteFile briefly lived in lib/error.js — a pragmatic hack: error.js
 * happened to be the only everywhere-required module with zero load-time Vant
 * requires, which made it cycle-safe for the brain↔storage↔gate bootstrap
 * window. But error.js says nothing about file I/O, and the grab-bag pulls
 * future helpers toward it.
 *
 * The fix: lib/primitives.js — THE home for dependency-free Vant primitives.
 *
 * Hard contract, enforced below:
 *   1. primitives.js contains ZERO `require('./…')` — node builtins only,
 *      ever. No Vant module can ever be inside a require cycle with it, so
 *      anything (including cycle-trapped bootstrap code) may require it at
 *      load time.
 *   2. Gated vs ungated is a documented distinction, not an accident:
 *      primitives write WITHOUT the sandbox capability gate (that is the
 *      point — the gate is unusable mid-cycle). Anything OUTSIDE a bootstrap
 *      window that wants gated writes uses storage.atomicWrite instead —
 *      stego.js/backup.js deliberately stay there. Regression note so nobody
 *      "upgrades" stego onto the ungated primitive and silently drops sandbox
 *      enforcement.
 *   3. error.js keeps compat re-exports (sleep, atomicWriteFile) so existing
 *      require points keep working — but they delegate to primitives, and
 *      error.js itself no longer contains any fs write.
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

console.log('\n🧱 PRIMITIVES MODULE TESTS\n');

const PRIM_PATH = path.join(ROOT, 'lib', 'primitives.js');
const readPrim = () => fs.readFileSync(PRIM_PATH, 'utf8');

// ---------- 1. The hard contract ----------

test('contract: primitives.js requires ZERO Vant modules (node builtins only, ever)', () => {
    if (!fs.existsSync(PRIM_PATH)) return { success: false, error: 'lib/primitives.js missing' };
    const src = readPrim();
    // Any relative require — the cycle door — is forbidden.
    const relRequires = src.match(/require\(\s*['"]\.[^'"]*['"]\s*\)/g) || [];
    if (relRequires.length !== 0) {
        return { success: false, error: `relative requires forbidden: ${relRequires.join(', ')}` };
    }
    return true;
});

test('contract: primitives exports the documented primitives', () => {
    const p = require(PRIM_PATH);
    if (typeof p.atomicWriteFile !== 'function') return { success: false, error: 'atomicWriteFile missing' };
    if (typeof p.sleep !== 'function') return { success: false, error: 'sleep missing' };
    return true;
});

test('contract: gated-vs-ungated distinction documented (stego must stay on storage.atomicWrite)', () => {
    const src = readPrim();
    if (!/storage\.atomicWrite/i.test(src) || !/gate|sandbox/i.test(src)) {
        return { success: false, error: 'header must document: sandbox-gated callers use storage.atomicWrite' };
    }
    return true;
});

// ---------- 2. Behavioral parity (the helper is unchanged, just homed) ----------

test('atomicWriteFile: temp + rename, no leftovers, nested dirs, buffers', () => {
    const { atomicWriteFile } = require(PRIM_PATH);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-prim-'));
    try {
        const target = path.join(dir, 'final.txt');
        atomicWriteFile(target, 'hello-vant');
        if (fs.readFileSync(target, 'utf8') !== 'hello-vant') return { success: false, error: 'content mismatch' };
        const leftovers = fs.readdirSync(dir).filter(f => f !== 'final.txt');
        if (leftovers.length !== 0) return { success: false, error: `leftovers: ${leftovers.join(',')}` };
        const nested = path.join(dir, 'a', 'b', 'deep.txt');
        atomicWriteFile(nested, 'nested');
        if (fs.readFileSync(nested, 'utf8') !== 'nested') return { success: false, error: 'nested write failed' };
        atomicWriteFile(path.join(dir, 'buf.bin'), Buffer.from([1, 2, 3]));
        if (fs.readFileSync(path.join(dir, 'buf.bin')).length !== 3) return { success: false, error: 'buffer write failed' };
        return true;
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('sleep: resolves after ~the requested delay', () => {
    const { sleep } = require(PRIM_PATH);
    const t0 = Date.now();
    return sleep(60).then(() => {
        const dt = Date.now() - t0;
        if (dt < 50) return { success: false, error: `resolved too early: ${dt}ms` };
        return true;
    });
});

// ---------- 3. One door + compat shims ----------

test('storage.atomicWriteFile re-export now delegates to primitives (one door)', () => {
    const storage = require(path.join(ROOT, 'lib', 'storage.js'));
    const p = require(PRIM_PATH);
    if (storage.atomicWriteFile !== p.atomicWriteFile) {
        return { success: false, error: 'storage re-export is not the primitives helper' };
    }
    if (typeof storage.atomicWrite !== 'function') return { success: false, error: 'gated storage.atomicWrite missing' };
    return true;
});

test('error.js compat: sleep + atomicWriteFile still exported, delegated to primitives', () => {
    const err = require(path.join(ROOT, 'lib', 'error.js'));
    const p = require(PRIM_PATH);
    if (typeof err.sleep !== 'function') return { success: false, error: 'error.sleep missing (compat broken)' };
    if (err.sleep !== p.sleep) return { success: false, error: 'error.sleep is not the primitives sleep' };
    if (typeof err.atomicWriteFile !== 'function') return { success: false, error: 'error.atomicWriteFile shim missing' };
    if (err.atomicWriteFile !== p.atomicWriteFile) return { success: false, error: 'error.atomicWriteFile is not the primitives helper' };
    return true;
});

test('error.js no longer contains the fs helper (single home)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'error.js'), 'utf8');
    if (/writeFileSync|renameSync|openSync/.test(src)) {
        return { success: false, error: 'error.js still contains fs write machinery' };
    }
    return true;
});

// ---------- done ----------

_chain.then(() => {
    console.log(`\n${results.passed} passed, ${results.failed} failed\n`);
    process.exit(results.failed === 0 ? 0 : 1);
});
