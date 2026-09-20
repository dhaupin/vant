#!/usr/bin/env node
/**
 * Security Hardening Tests (referenced by labs/TASKS.md + labs/AUDIT_FINDINGS.md P0/P1)
 *
 * Verifies the claimed fixes are REAL, not just documented:
 * - P0-6: mcp vant_call cannot load arbitrary modules (registered tools only)
 * - P0-7: ConfigStorage evaluates configs in a bare vm (no require/process/fs)
 * - P0-8: transform output paths are traversal-checked
 * - P0-9: DEFAULT_CAPABILITIES deny by default (write/network/exec/spawn)
 * - P1-11: storage.write enforces path containment
 * - P1-15: vaf.checkPathTraversal catches encoded/double-encoded/overlong traversal
 * - P1-16: atomicWrite temp+rename replaces (not follows) symlinks
 * - Regression guard: trust scores stay numeric (corruption class: NaN scores)
 *
 * Run: node test/security-hardening.test.js
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0 };
const _asyncTests = [];

function _verdict(r) {
    if (r === true || (r && r.success)) return { ok: true };
    return { ok: false, why: (r && r.error) || 'assertion failed' };
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
    return fs.mkdtempSync(path.join(os.tmpdir(), `vant-sec-${label}-`));
}

console.log('\n🔒 SECURITY HARDENING TESTS\n');

// ==================== P0-6: vant_call arbitrary require RCE ====================

asyncTest('P0-6: vant_call refuses unregistered tool names (no arbitrary require)', async () => {
    const mcp = require(path.join(ROOT, 'lib', 'mcp'));
    const r = await mcp.execute('vant_call', { name: 'fs', args: { action: 'readFile' } });
    return { success: r && typeof r.error === 'string' && r.error.includes('Tool not found') };
});

asyncTest('P0-6: vant_call still works for registered tools', async () => {
    const mcp = require(path.join(ROOT, 'lib', 'mcp'));
    // Pick any registered tool and call it through vant_call
    const tools = mcp.listTools ? mcp.listTools() : [];
    const name = Array.isArray(tools) && tools.length
        ? (typeof tools[0] === 'string' ? tools[0] : (tools[0].name || null))
        : null;
    if (!name) return { success: true }; // no tools registered in test env - vacuous
    const r = await mcp.execute('vant_call', { name, args: {} });
    return { success: !(r && r.error === `Tool not found: ${name}`) };
});

// ==================== P0-7: ConfigStorage vm evaluation ====================

test('P0-7: config JS cannot require modules (RCE closed)', () => {
    const { ConfigStorage } = require(path.join(ROOT, 'lib', 'storage'));
    const dir = tmpdir('cfg');
    const canary = path.join(dir, 'pwned.txt');
    const cfgPath = path.join(dir, 'evil.config.js');
    fs.writeFileSync(cfgPath, "module.exports = (function(){ require('fs').writeFileSync('" +
        canary.replace(/\\/g, '\\\\') + "', 'x'); return {}; })();");
    const cs = new ConfigStorage({ filePath: cfgPath });
    const safe = !fs.existsSync(canary);
    const fellBack = cs.get('storage.autoSync') === false; // defaults, not the payload
    return { success: safe && fellBack };
});

test('P0-7: config JS cannot touch process', () => {
    const { ConfigStorage } = require(path.join(ROOT, 'lib', 'storage'));
    const dir = tmpdir('cfg2');
    const cfgPath = path.join(dir, 'evil2.config.js');
    fs.writeFileSync(cfgPath, "module.exports = (function(){ process.exit(1); })();");
    let survived = true;
    try { new ConfigStorage({ filePath: cfgPath }); } catch (e) { survived = false; }
    return { success: survived };
});

test('P0-7: benign data-only config still loads', () => {
    const { ConfigStorage } = require(path.join(ROOT, 'lib', 'storage'));
    const dir = tmpdir('cfg3');
    const cfgPath = path.join(dir, 'good.config.js');
    fs.writeFileSync(cfgPath, "module.exports = { storage: { autoSync: true }, features: { t: 1 } };");
    const cs = new ConfigStorage({ filePath: cfgPath });
    return { success: cs.get('storage.autoSync') === true && cs.get('features.t') === 1 };
});

// ==================== P0-8: transform path validation ====================

asyncTest('P0-8: toHorcrux blocks traversal output paths', async () => {
    const transform = require(path.join(ROOT, 'lib', 'transform'));
    let threw = null;
    try {
        await transform.toHorcrux('../../evil-horcrux.svg', {});
    } catch (e) { threw = e; }
    return { success: !!threw && /traversal|blocked/i.test(threw.message) };
});

// ==================== P0-9: deny-by-default capabilities ====================

test('P0-9: DEFAULT_CAPABILITIES deny write/network/exec/spawn', () => {
    const sandboxMod = require(path.join(ROOT, 'lib', 'sandbox'));
    const caps = sandboxMod.defaultSandbox.capabilities;
    return {
        success: caps.canWrite === false && caps.canNetwork === false &&
                 caps.canExec === false && caps.canSpawn === false
    };
});

test('P0-9: explicit capabilities are honored when configured', () => {
    const sandboxMod = require(path.join(ROOT, 'lib', 'sandbox'));
    const s = sandboxMod.create({ agentId: 'sec-test', capabilities: { canWrite: true } });
    return { success: s.can('canWrite') === true };
});

// ==================== P1-11: storage containment ====================

test('P1-11: storage.write blocks traversal paths', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    const dir = tmpdir('sto');
    const s = Storage.get('file', { basePath: dir });
    let threw = null;
    try { s.write('../../escape.txt', 'x'); } catch (e) { threw = e; }
    let absThrew = null;
    try { s.write('/tmp/vant-escape-test.md', 'x'); } catch (e) { absThrew = e; }
    return { success: !!threw && !!absThrew };
});

test('P1-11: storage.write keeps files inside basePath', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    const dir = tmpdir('sto2');
    const s = Storage.get('file', { basePath: dir });
    s.write('nested/ok.md', 'inside');
    const written = fs.existsSync(path.join(dir, 'nested', 'ok.md'));
    return { success: written };
});

// ==================== P1-15: encoded traversal (vaf) ====================

test('P1-15: vaf blocks single-encoded traversal', () => {
    const vaf = require(path.join(ROOT, 'lib', 'vaf'));
    return { success: vaf.checkPathTraversal('%2e%2e%2fevil').blocked === true };
});

test('P1-15: vaf blocks mixed-encoded traversal', () => {
    const vaf = require(path.join(ROOT, 'lib', 'vaf'));
    return { success: vaf.checkPathTraversal('..%2fpwn').blocked === true };
});

test('P1-15: vaf blocks double-encoded traversal', () => {
    const vaf = require(path.join(ROOT, 'lib', 'vaf'));
    return { success: vaf.checkPathTraversal('..%252fdouble').blocked === true };
});

test('P1-15: vaf blocks Unicode-normalized traversal dots', () => {
    const vaf = require(path.join(ROOT, 'lib', 'vaf'));
    return { success: vaf.checkPathTraversal('a\u2025b').blocked === true }; // ‥ → .. under NFKC
});

test('P1-15: vaf blocks malformed/overlong percent-encoding (fail closed)', () => {
    const vaf = require(path.join(ROOT, 'lib', 'vaf'));
    return { success: vaf.checkPathTraversal('%c0%ae%c0%ae/x').blocked === true };
});

test('P1-15: vaf still allows legitimate paths', () => {
    const vaf = require(path.join(ROOT, 'lib', 'vaf'));
    const ok1 = vaf.checkPathTraversal('models/private/notes.md').blocked === false;
    const ok2 = vaf.checkPathTraversal('file v1.2 (final).md').blocked === false;
    const ok3 = vaf.checkPathTraversal('日本語/ノート.md').blocked === false;
    return { success: ok1 && ok2 && ok3 };
});

// ==================== P1-16: symlink-safe atomic write ====================

test('P1-16: atomic write replaces a symlink instead of writing through it', () => {
    const Storage = require(path.join(ROOT, 'lib', 'storage'));
    const dir = tmpdir('sym');
    const outsideDir = path.join(dir, 'outside');
    fs.mkdirSync(outsideDir);
    const secret = path.join(outsideDir, 'secret.txt');
    fs.writeFileSync(secret, 'ORIGINAL');

    const base = path.join(dir, 'base');
    fs.mkdirSync(base);
    const linkPath = path.join(base, 'link.md');
    fs.symlinkSync(secret, linkPath);

    const s = Storage.get('file', { basePath: base });
    s.write('link.md', 'NEW CONTENT');

    const destIsSymlink = fs.lstatSync(linkPath).isSymbolicLink();
    const destContent = fs.readFileSync(linkPath, 'utf8');
    const secretUntouched = fs.readFileSync(secret, 'utf8') === 'ORIGINAL';
    return { success: !destIsSymlink && destContent === 'NEW CONTENT' && secretUntouched };
});

// ==================== Regression: corruption class (NaN scores) ====================

test('trust.record keeps scores numeric (no NaN from corruption)', () => {
    const trust = require(path.join(ROOT, 'lib', 'trust'));
    const r = trust.record('sec-nan-entity', 'help', { positive: true, value: 0.1 });
    const score = trust.getScore('sec-nan-entity');
    return { success: typeof score === 'number' && !Number.isNaN(score) };
});

test('trust exports contain no stray gatherState injections in _defaults', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'trust.js'), 'utf8');
    const defaultsBlock = src.slice(src.indexOf('const _defaults'), src.indexOf('};', src.indexOf('const _defaults')));
    return { success: !defaultsBlock.includes('gatherState') && !defaultsBlock.includes('restoreState') };
});

// ==================== RUN ====================

(async () => {
    await _runAsync();
    console.log(`\n--- RESULTS ---\n\n  Passed:  ${results.passed}\n  Failed:  ${results.failed}\n`);
    process.exit(results.failed > 0 ? 1 : 0);
})();
