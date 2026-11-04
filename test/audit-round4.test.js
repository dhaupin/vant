#!/usr/bin/env node
/**
 * Audit Round 4 — discriminating pins (MCP agent-OS security walk).
 *
 * Every pin here FAILS against the pre-fix code and PASSES after the fix;
 * none is a restatement of existing coverage:
 *
 * - R4-1: lib/connectors/node.js `eval`/`invoke` ran untrusted code in a vm
 *         context seeded with HOST objects (`{ console: fakeConsole }`), so
 *         `this.constructor.constructor('return process')()` reached the host
 *         Function constructor and escaped the sandbox to full RCE
 *         (child_process). eval also had NO timeout. Fixed: context root is
 *         null-prototype, no host objects injected, `codeGeneration` disabled,
 *         timeout enforced.
 * - R4-2: lib/config.js and lib/storage/config.js evaluated `vant.config.js`
 *         in a vm context seeded with a HOST `{ module: { exports: {} } }`,
 *         so `module.constructor.constructor('return process')()` escaped.
 *         Fixed the same way; legitimate configs still load.
 * - R4-3: lib/persistent-grants.js revocation was exact-key: a scoped revoke
 *         left a wildcard grant LIVE (silent fail-open), and a re-grant after
 *         a revoke could never restore the capability. Fixed with sequential
 *         tombstone replay + fail-closed scope coverage.
 *
 * Run: node test/audit-round4.test.js
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0 };
const _asyncTests = [];

function _verdict(r) {
    if (r === true || (r && r.success)) return { ok: true };
    return { ok: false, why: (r && r.error) || (r && r.why) || 'assertion failed' };
}
function test(name, fn) {
    let v;
    try { v = _verdict(fn()); } catch (e) { v = { ok: false, why: e.message }; }
    if (v.ok) { results.passed++; console.log(`  ✓ ${name}`); }
    else { results.failed++; console.log(`  ✗ ${name}: ${v.why}`); }
}
function asyncTest(name, fn) { _asyncTests.push({ name, fn }); }
async function _runAsync() {
    for (const { name, fn } of _asyncTests) {
        let v;
        try { v = _verdict(await fn()); } catch (e) { v = { ok: false, why: e.message }; }
        if (v.ok) { results.passed++; console.log(`  ✓ ${name}`); }
        else { results.failed++; console.log(`  ✗ ${name}: ${v.why}`); }
    }
}
function tmpdir(label) {
    return fs.mkdtempSync(path.join(os.tmpdir(), `vant-r4-${label}-`));
}

function nodeConnector() {
    const mod = require(path.join(ROOT, 'lib', 'connectors', 'node.js'));
    // node.js exports a ready instance; the class is available on some builds.
    if (mod && typeof mod.NodeConnector === 'function') return new mod.NodeConnector();
    return mod;
}

console.log('\n🔎 AUDIT ROUND 4 — DISCRIMINATING PINS\n');

// ==================== R4-1: node connector vm escape + timeout ====================

asyncTest('R4-1: node connector eval cannot reach the host realm (RCE closed)', async () => {
    const c = nodeConnector();
    const r = await c.eval(
        "this.constructor.constructor('return process')().getBuiltinModule('child_process').execSync('id').toString()"
    );
    // Pre-fix: success:true and stdout is the `id` output (uid=...).
    // Post-fix: success:false with a code-generation refusal.
    return { success: r && r.success === false };
});

asyncTest('R4-1: node connector eval still runs legit code', async () => {
    const c = nodeConnector();
    const expr = await c.eval('2 + 2');
    const logged = await c.eval('console.log(6 * 7)');
    return { success: expr && expr.stdout === '4' && logged && logged.stdout === '42' };
});

asyncTest('R4-1: node connector eval bounds runaway loops (timeout enforced)', async () => {
    const c = nodeConnector();
    // Pre-fix `_runIsolated` does not exist -> fast fail, never a hang.
    if (typeof c._runIsolated !== 'function') {
        return { success: false, why: 'no hardened _runIsolated path' };
    }
    const t0 = Date.now();
    const r = await c.eval('while(true){}', { timeout: 1500 });
    const elapsed = Date.now() - t0;
    return { success: r && r.success === false && /timed out/i.test(r.stderr || '') && elapsed < 6000 };
});

// ==================== R4-2: config vm escape (lib/config.js + storage) ====================

test('R4-2: lib/storage/config.js cannot escape via module.constructor (RCE closed)', () => {
    const { ConfigStorage } = require(path.join(ROOT, 'lib', 'storage'));
    const dir = tmpdir('cfg');
    const cfgPath = path.join(dir, 'evil.config.js');
    fs.writeFileSync(cfgPath,
        "module.exports = { port: 3457, escaped: (function(){ try { return this.constructor.constructor('return process')().version; } catch(e){ return false; } })() };");
    const cs = new ConfigStorage({ filePath: cfgPath });
    const escaped = cs.get('escaped');
    const legit = cs.get('port') === 3457;
    return { success: escaped !== true && escaped !== process.version && legit };
});

test('R4-2: lib/config.js cannot escape via module.constructor (RCE closed)', () => {
    const dir = tmpdir('cfgroot');
    const cfgPath = path.join(dir, 'vant.config.js');
    fs.writeFileSync(cfgPath,
        "module.exports = { port: 3457, escaped: (function(){ try { return module.constructor.constructor('return process')().version; } catch(e){ return false; } })() };");
    const prev = process.env.VANT_CONFIG;
    process.env.VANT_CONFIG = cfgPath;
    try {
        // fresh require so the loader re-reads the file
        delete require.cache[require.resolve(path.join(ROOT, 'lib', 'config.js'))];
        const config = require(path.join(ROOT, 'lib', 'config.js'));
        const all = typeof config.getAll === 'function' ? config.getAll() : {};
        return { success: all.escaped !== true && all.escaped !== process.version && all.port === 3457 };
    } finally {
        if (prev === undefined) delete process.env.VANT_CONFIG; else process.env.VANT_CONFIG = prev;
        delete require.cache[require.resolve(path.join(ROOT, 'lib', 'config.js'))];
    }
});

// ==================== R4-3: persistent-grants revocation ====================

function grantsAt(label) {
    const { PersistentGrants } = require(path.join(ROOT, 'lib', 'persistent-grants'));
    return new PersistentGrants({ ledgerPath: path.join(tmpdir(label), 'grants.jsonl') });
}

test('R4-3: a scoped revoke covers a wildcard grant (fail-open closed)', () => {
    const g = grantsAt('rev-scope');
    g.persist({ capability: 'canExec', grantor: 'admin' });      // scope defaults '*'
    g.revoke({ capability: 'canExec', scope: 'exec', actor: 'admin' });
    // Pre-fix: allowed:true (revoke silently did nothing).
    return { success: g.allows('canExec').allowed === false };
});

test('R4-3: a wildcard revoke covers a scoped grant', () => {
    const g = grantsAt('rev-wild');
    g.persist({ capability: 'canExec', scope: 'exec', grantor: 'admin' });
    g.revoke({ capability: 'canExec', actor: 'admin' });
    return { success: g.allows('canExec').allowed === false };
});

test('R4-3: a re-grant after a revoke restores the capability', () => {
    const g = grantsAt('regrant');
    g.persist({ capability: 'canExec', grantor: 'admin' });
    g.revoke({ capability: 'canExec', actor: 'admin' });
    g.persist({ capability: 'canExec', grantor: 'admin' });
    // Pre-fix: allowed:false forever (revoked capability un-restorable).
    return { success: g.allows('canExec').allowed === true };
});

test('R4-3: an unrelated revoke does not touch other capabilities', () => {
    const g = grantsAt('unrelated');
    g.persist({ capability: 'canWrite', grantor: 'admin' });
    g.revoke({ capability: 'canExec', actor: 'admin' });
    return { success: g.allows('canWrite').allowed === true };
});

test('R4-3: an exact-scope revoke leaves a sibling scope live', () => {
    const g = grantsAt('sibling');
    g.persist({ capability: 'canExec', scope: 'exec', grantor: 'admin' });
    g.persist({ capability: 'canExec', scope: 'network', grantor: 'admin' });
    g.revoke({ capability: 'canExec', scope: 'exec', actor: 'admin' });
    return { success: g.allows('canExec').allowed === true };
});

// ==================== R4-4: org grant --persist durable tier ====================

test('R4-4: `vant org grant --persist` writes the durable grants ledger', () => {
    const { execFileSync } = require('child_process');
    const dir = tmpdir('orgpersist');
    const brain = 'auditbrain';
    // Pre-fix: `--persist` was documented (lib/persistent-grants.js header +
    // lib/sandbox.js:728) but no writer existed, so the ledger was never
    // created and the durable tier was inert.
    execFileSync('node', [path.join(ROOT, 'bin', 'org.js'), 'grant',
        '--capabilities', 'canWrite', '--scopes', 'write', '--persist'], {
        cwd: dir, encoding: 'utf8', timeout: 30000,
        env: { ...process.env, VANT_BRAIN: brain, VANT_GATE_QUIET: '1' }
    });
    const ledgerPath = path.join(dir, 'models', 'private', brain, 'grants.jsonl');
    if (!fs.existsSync(ledgerPath)) {
        return { success: false, why: 'org grant --persist wrote no ledger' };
    }
    const { PersistentGrants } = require(path.join(ROOT, 'lib', 'persistent-grants'));
    const g = new PersistentGrants({ ledgerPath });
    return { success: g.allows('canWrite').allowed === true };
});

// ==================== RUN ====================

(async () => {
    await _runAsync();
    console.log(`\n--- RESULTS ---\n\n  Passed:  ${results.passed}\n  Failed:  ${results.failed}\n`);
    process.exit(results.failed > 0 ? 1 : 0);
})();
