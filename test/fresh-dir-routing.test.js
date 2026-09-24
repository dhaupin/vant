#!/usr/bin/env node
/**
 * Fresh-Directory Routing Tests
 *
 * Pass 19/20 regression guard. The vant dispatcher intentionally spawns
 * subcommands in the CALLER'S cwd (so brains resolve to the user's project),
 * which means any routed command that resolves files from cwd instead of
 * __dirname is cwd-fragile by construction. test-all crashed with
 * MODULE_NOT_FOUND and build-test/format-test false-failed from fresh dirs
 * before this was fixed.
 *
 * Strategy: copy bin/ + lib/ + package.json into a temp dir WITHOUT models/,
 * then run routed commands there from a DIFFERENT cwd. Each command must:
 *   - exit 0 (or an expected nonzero code)
 *   - not crash with MODULE_NOT_FOUND / Cannot find module
 *   - not report a cwd-relative false failure
 *
 * Run: node test/fresh-dir-routing.test.js
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0, skipped: 0 };
let sandbox = null;

function test(name, fn) {
    try {
        const r = fn();
        if (r === true || (r && r.success)) {
            results.passed++;
            console.log(`  ✓ ${name}`);
        } else {
            results.failed++;
            console.log(`  ✗ ${name}: ${(r && r.error) || 'failed'}`);
        }
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message.split('\n')[0]}`);
    }
}

/**
 * Copy the minimum tree a routed command needs into a fresh sandbox dir.
 * Deliberately excludes models/ so commands get NO brain data — the point
 * is that they must not crash or misreport just because cwd moved.
 */
function makeSandbox() {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-fresh-dir-'));
    for (const entry of ['bin', 'lib', 'package.json']) {
        const src = path.join(ROOT, entry);
        const dest = path.join(sandbox, entry);
        fs.cpSync(src, dest, { recursive: true, dereference: true });
    }
    // Keep repo config.example.ini so build-test's template check passes;
    // build-test resolves it from __dirname/.., NOT cwd.
    for (const f of ['config.example.ini', '.env.example', 'docker-compose.yml']) {
        const src = path.join(ROOT, f);
        if (fs.existsSync(src)) fs.copyFileSync(src, path.join(sandbox, f));
    }
    // npm real installs resolve deps (yaml/js-yaml/chalk) from the package's
    // own node_modules — mirror that with a symlink so format-test's YAML
    // checks exercise real resolution, not a missing-dep false failure.
    const nmSrc = path.join(ROOT, 'node_modules');
    if (fs.existsSync(nmSrc)) {
        try { fs.symlinkSync(nmSrc, path.join(sandbox, 'node_modules'), 'dir'); } catch (e) { /* already there */ }
    }
    return sandbox;
}

/**
 * Run a vant command with cwd = ANOTHER dir inside the sandbox (not the
 * sandbox root, not the repo) — the harshest realistic case.
 */
function runInFreshCwd(sandboxDir, args) {
    const cwd = fs.mkdtempSync(path.join(sandboxDir, 'cwd-'));
    try {
        const out = execFileSync('node', [path.join(sandboxDir, 'bin', 'vant.js'), ...args], {
            cwd,
            encoding: 'utf8',
            timeout: 120000,
            env: { ...process.env, VANT_FRESH_DIR_TEST: '1' }
        });
        return { code: 0, out };
    } catch (e) {
        return {
            code: e.status === undefined ? -1 : e.status,
            out: (e.stdout || '') + (e.stderr || ''),
            err: e.message
        };
    } finally {
        try { fs.rmSync(cwd, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    }
}

function assertNoModuleCrash(r, label) {
    if (/Cannot find module|MODULE_NOT_FOUND/.test(r.out)) {
        throw new Error(`${label}: module resolution broke outside repo cwd`);
    }
}

// ==================== TESTS ====================

test('sandbox builds without models/', () => {
    const dir = makeSandbox();
    if (!fs.existsSync(path.join(dir, 'bin', 'vant.js'))) return { error: 'bin/vant.js missing' };
    if (fs.existsSync(path.join(dir, 'models'))) return { error: 'models/ should not be copied' };
    return true;
});

test('test-all: 17/17 from fresh cwd', () => {
    const r = runInFreshCwd(sandbox, ['test-all']);
    assertNoModuleCrash(r, 'test-all');
    if (!/Passed: 17\/17/.test(r.out)) {
        throw new Error('expected "Passed: 17/17", got:\n' + r.out.split('\n').filter(l => /Passed|✗/.test(l)).join('\n'));
    }
    if (r.code !== 0) throw new Error('exit ' + r.code);
    return true;
});

test('build-test: no cwd-relative false failures', () => {
    const r = runInFreshCwd(sandbox, ['build-test']);
    assertNoModuleCrash(r, 'build-test');
    if (/config\.example\.ini not found|\.env\.example not found/.test(r.out)) {
        throw new Error('template checks resolved from cwd, not ROOT');
    }
    // The identity check may legitimately fail (no models/ in sandbox) —
    // but the two former cwd-relative checks must pass.
    if (!/config\.example\.ini exists/.test(r.out)) throw new Error('template check did not run');
    return true;
});

test('format-test: 32/32 from fresh cwd', () => {
    const r = runInFreshCwd(sandbox, ['format-test']);
    assertNoModuleCrash(r, 'format-test');
    if (/Results: 32 passed, 0 failed/.test(r.out)) return true;
    if (/Results: (\d+) passed, (\d+) failed/.test(r.out)) {
        const m = r.out.match(/Results: (\d+) passed, (\d+) failed/);
        throw new Error(`got ${m[1]}/${m[2]} — loadFile checks likely cwd-anchored:\n` +
            r.out.split('\n').filter(l => /❌/.test(l)).join('\n'));
    }
    throw new Error('no results line');
});

test('help: prints usage from fresh cwd', () => {
    const r = runInFreshCwd(sandbox, ['help']);
    assertNoModuleCrash(r, 'help');
    if (!/vant test-all/.test(r.out)) throw new Error('help listing missing');
    if (r.code !== 0) throw new Error('exit ' + r.code);
    return true;
});

test('unknown command: suggestion + exit 1 from fresh cwd', () => {
    const r = runInFreshCwd(sandbox, ['helth']);
    assertNoModuleCrash(r, 'unknown-command');
    if (!/Unknown command: helth/.test(r.out)) throw new Error('no unknown-command message');
    if (!/Did you mean: .*(health|help)/.test(r.out)) throw new Error('no did-you-mean suggestion');
    if (r.code !== 1) throw new Error('expected exit 1, got ' + r.code);
    return true;
});

test('hybrid: banner renders from fresh cwd', () => {
    const r = runInFreshCwd(sandbox, ['hybrid']);
    assertNoModuleCrash(r, 'hybrid');
    if (!/Hybrid Sync/.test(r.out)) throw new Error('banner missing');
    return true;
});

test('test-all --help: usage without running checks', () => {
    const r = runInFreshCwd(sandbox, ['test-all', '--help']);
    assertNoModuleCrash(r, 'test-all --help');
    if (!/Usage: vant test-all/.test(r.out)) throw new Error('no usage');
    if (/Passed:/.test(r.out)) throw new Error('ran the suite instead of showing usage');
    return true;
});

// (pass 22) cwd-anchor + containment contract: the brain runtime is
// cwd-anchored BY DESIGN (dispatcher comment: subcommands run in the user's
// project so models/ resolves there), so a routed command MAY create the
// models tree in the caller's cwd. What must NEVER happen again: the escrow
// store's two-anchor bug (cwd-anchored store path joined against the install
// root) producing escape-shaped paths — which the hardened FileStorage.write
// containment check now rejects, crashing every foreign-cwd invocation.
// Pin: routed command succeeds from a foreign dir, no 'Path escape' error,
// and the store lands INSIDE the caller's designed models tree.
test('escrow store: foreign-cwd writes contained + land in designed location', () => {
    const cwd = fs.mkdtempSync(path.join(sandbox, 'cwd-escrow-'));
    try {
        let out = '';
        let code = 0;
        try {
            const r = execFileSync('node', [path.join(sandbox, 'bin', 'vant.js'), 'rate'], {
                cwd,
                encoding: 'utf8',
                timeout: 60000,
                env: { ...process.env, VANT_FRESH_DIR_TEST: '1' }
            });
            out = r || '';
        } catch (e) {
            out = (e.stdout || '') + (e.stderr || '');
            code = e.status === undefined ? -1 : e.status;
        }
        if (/Path escape detected|SECURITY_PATH_ESCAPE/.test(out)) {
            throw new Error('containment rejected a DESIGNED store write (two-anchor bug is back)');
        }
        if (/Cannot find module|MODULE_NOT_FOUND/.test(out)) {
            throw new Error('module resolution broke outside repo cwd');
        }
        // The designed store location (caller-cwd-anchored, brain-scoped).
        const designed = path.join(cwd, 'models', 'private', 'vant', 'orgchart', 'escrow.json');
        if (!fs.existsSync(designed)) {
            throw new Error('escrow store not written to the designed cwd-anchored location');
        }
        return true;
    } finally {
        try { fs.rmSync(cwd, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    }
});

// (pass 22) Containment unit: FileStorage.write must refuse to place files
// outside its basePath, whatever path.join does with hostile relative paths.
test('storage.write: containment pre-check rejects escape-shaped paths', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-contain-'));
    try {
        const Storage = require(path.join(ROOT, 'lib', 'storage'));
        const store = new Storage.FileStorage({ basePath: dir, wal: false });
        for (const hostile of ['../escape.txt', 'a/../../escape2.txt', 'nested/ok.txt']) {
            if (hostile.includes('..')) {
                let threw = false;
                try { store.write(hostile, 'x'); } catch (e) { threw = /escape|blocked/i.test(e.message); }
                if (!threw) return { error: `write accepted escape path: ${hostile}` };
                if (fs.existsSync(path.join(dir, '..', 'escape.txt')) || fs.existsSync(path.join(dir, '..', 'escape2.txt'))) {
                    return { error: `escape file materialized: ${hostile}` };
                }
            } else {
                // Normal nested write must still work.
                store.write(hostile, 'ok');
                if (!fs.existsSync(path.join(dir, hostile))) return { error: `normal write broken: ${hostile}` };
            }
        }
        return true;
    } finally {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    }
});

// (pass 23) lib/horcrux-safe unit paths with a FAKE encoder/decoder — no
// real horcrux work, so this is fast and hermetic. The helper is async; the
// harness here is sync, so each scenario runs in a child `node -e` that
// prints a JSON verdict. Covers: new target direct write + round-trip,
// existing target tmp→validate→rename, decode failure (original untouched,
// tmp cleaned), validation failure (same).
const HSAFE_SCENARIO = `
const fs = require('fs');
const path = require('path');
const dir = process.env.HSAFE_DIR;
const scenario = process.argv[1];
const { safeWriteHorcrux } = require(process.env.HSAFE_LIB);
(async () => {
    const enc = (content) => async (rel) => { fs.writeFileSync(path.join(dir, rel), content); return { size: content.length, format: 'steganography' }; };
    const dec = (val) => async () => val;
    if (scenario === 'new-target') {
        const out = await safeWriteHorcrux('backups/h.svg', {
            encode: enc('<svg>NEW</svg>'), decode: dec({ ok: true })
        });
        console.log(JSON.stringify({
            ok: out.usedTmp === false && out.replaced === false && out.data && out.data.ok === true
                && fs.readFileSync(path.join(dir, 'backups/h.svg'), 'utf8') === '<svg>NEW</svg>'
        }));
    } else if (scenario === 'happy-replace') {
        const out = await safeWriteHorcrux('backups/h.svg', {
            encode: enc('<svg>FRESH</svg>'), decode: dec({ ok: true })
        });
        console.log(JSON.stringify({
            ok: out.usedTmp === true && out.replaced === true
                && fs.readFileSync(path.join(dir, 'backups/h.svg'), 'utf8') === '<svg>FRESH</svg>'
                && !fs.existsSync(path.join(dir, 'backups/h.tmp.svg'))
        }));
    } else if (scenario === 'post-rename-fail') {
        // (pass 25.1) Decode succeeds on the TMP (pre-rename gate) but fails
        // on the FINAL target — the last good copy must come back intact.
        try {
            await safeWriteHorcrux('backups/h.svg', {
                encode: enc('<svg>FRESH2</svg>'),
                decode: async (rel) => {
                    if (rel === 'backups/h.svg') throw new Error('final file corrupt');
                    return { ok: true };
                }
            });
            console.log(JSON.stringify({ ok: false, why: 'should have thrown' }));
        } catch (e) {
            console.log(JSON.stringify({
                ok: /replaced but FAILED post-rename verification/.test(e.message)
                    && /original restored byte-for-byte/.test(e.message)
                    && fs.readFileSync(path.join(dir, 'backups/h.svg'), 'utf8') === '<svg>FRESH</svg>'
                    && !fs.existsSync(path.join(dir, 'backups/h.tmp.svg'))
            }));
        }
    } else if (scenario === 'decode-fail' || scenario === 'validate-fail') {
        try {
            await safeWriteHorcrux('backups/h.svg', scenario === 'decode-fail'
                ? { encode: enc('<svg>BAD</svg>'), decode: async () => { throw new Error('decrypt failed'); } }
                : { encode: enc('<svg>BAD2</svg>'), decode: dec({}), validate: () => ({ valid: false, errors: ['structure wrong'] }) });
            console.log(JSON.stringify({ ok: false, why: 'should have thrown' }));
        } catch (e) {
            const expect = scenario === 'decode-fail' ? /original left untouched/ : /post-encode validation failed/;
            console.log(JSON.stringify({
                ok: expect.test(e.message)
                    && fs.readFileSync(path.join(dir, 'backups/h.svg'), 'utf8') === '<svg>FRESH</svg>'
                    && !fs.existsSync(path.join(dir, 'backups/h.tmp.svg'))
            }));
        }
    }
})().catch(e => console.log(JSON.stringify({ ok: false, why: e.message })));
`;

function runHsafeScenario(scenario, seedOriginal) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-hsafe-'));
    try {
        fs.mkdirSync(path.join(dir, 'backups'), { recursive: true });
        if (seedOriginal) fs.writeFileSync(path.join(dir, 'backups', 'h.svg'), '<svg>FRESH</svg>');
        const r = execFileSync('node', ['-e', HSAFE_SCENARIO, scenario], {
            encoding: 'utf8',
            timeout: 30000,
            env: {
                ...process.env,
                HSAFE_DIR: dir,
                HSAFE_LIB: path.join(ROOT, 'lib', 'horcrux-safe.js'),
                VANT_REPO_ROOT: dir
            }
        });
        const verdict = JSON.parse(r.trim().split('\n').pop());
        if (!verdict.ok) return { error: verdict.why || `scenario ${scenario} failed` };
        return true;
    } finally {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    }
}

test('horcrux-safe: new target writes directly + round-trips', () => runHsafeScenario('new-target', false));

test('horcrux-safe: existing target tmp→validate→rename', () => runHsafeScenario('happy-replace', true));

test('horcrux-safe: decode failure leaves original + cleans tmp', () => runHsafeScenario('decode-fail', true));

test('horcrux-safe: validation failure leaves original + cleans tmp', () => runHsafeScenario('validate-fail', true));

test('horcrux-safe: post-rename failure restores original byte-for-byte', () => runHsafeScenario('post-rename-fail', true));

test('anchor: VANT_REPO_ROOT env wins over install tree', () => {
    const anchor = require(path.join(ROOT, 'lib', 'anchor'));
    const prevRoot = process.env.VANT_REPO_ROOT;
    try {
        process.env.VANT_REPO_ROOT = '/tmp/vant-anchor-probe';
        if (anchor.getRepoRoot() !== '/tmp/vant-anchor-probe') return { error: 'env not honored' };
        delete process.env.VANT_REPO_ROOT;
        if (anchor.getRepoRoot() !== path.resolve(ROOT)) return { error: 'install-tree fallback broken: ' + anchor.getRepoRoot() };
        return true;
    } finally {
        if (prevRoot === undefined) delete process.env.VANT_REPO_ROOT; else process.env.VANT_REPO_ROOT = prevRoot;
    }
});

// ==================== RUNNER ====================

function main() {
    console.log('=== Fresh-Directory Routing Tests ===\n');
    try {
        // Run the suite
        const tests = [
            'sandbox builds without models/',
            'test-all: 17/17 from fresh cwd',
            'build-test: no cwd-relative false failures',
            'format-test: 32/32 from fresh cwd',
            'help: prints usage from fresh cwd',
            'unknown command: suggestion + exit 1 from fresh cwd',
            'hybrid: banner renders from fresh cwd',
            'test-all --help: usage without running checks'
        ];
        // The runner above executes tests at module scope in order; nothing to do here.
        results.skipped = 0;
        void tests;
    } finally {
        if (sandbox) {
            try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch (e) { /* ignore */ }
        }
    }
    console.log('');
    console.log(`Results: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped`);
    if (results.failed > 0) process.exit(1);
}

// Execute tests in declaration order (they run at module scope).
main();

// If anything above failed, main already exited nonzero.
if (results.failed === 0) {
    console.log('\nAll fresh-dir routing tests passed ✅');
}
