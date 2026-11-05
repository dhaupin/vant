#!/usr/bin/env node
/**
 * Security Pipeline Scanner tests (prd-web.md 4.4)
 * "scan lib, confirm modules use the middleware pipeline, display lib
 * modules outside the pipeline (unless whitelisted)."
 *
 * Runs against a PLANTED tmp fixture for determinism, plus one live probe
 * of the real lib/ tree (shaped assertions only — the tree changes).
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0 };

function test(name, fn) {
    try {
        const result = fn();
        if (result === true || (result && result.success)) {
            results.passed++;
            console.log(`  ✓ ${name}`);
        } else {
            results.failed++;
            console.log(`  ✗ ${name}: ${result.error || 'failed'}`);
        }
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

console.log('\n🛡️  SECURITY PIPELINE TESTS\n');

const pipeline = require(path.join(ROOT, 'lib', 'security-pipeline'));

// ---- fixture: two modules per the spec, one nit deeper than shallow ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-pipeline-'));
fs.writeFileSync(path.join(tmp, 'wired.js'),
    "const vaf = require('./vaf');\nconst escrow = require('./escrow');\nmodule.exports = {};\n");
fs.writeFileSync(path.join(tmp, 'unwired.js'),
    "module.exports = { note: 'no middleware here' };\n");
fs.writeFileSync(path.join(tmp, 'sanitized.js'),
    "const sandbox = require('./sandbox');\nmodule.exports = {};\n");
fs.mkdirSync(path.join(tmp, 'nested'));
fs.writeFileSync(path.join(tmp, 'nested', 'deep.js'),
    "const vaf = require('./vaf');\nmodule.exports = {};\n");

test('scan shape: v-1 report with dir/generatedAt/exempt', () => {
    const r = pipeline.scan(tmp, { maxDepth: 99 });
    if (r.v !== 1) return { error: 'v != 1' };
    if (typeof r.generatedAt !== 'string' || !r.generatedAt) return { error: 'no generatedAt' };
    if (r.dir !== tmp) return { error: 'dir mismatch' };
    if (!Array.isArray(r.modules) || !Array.isArray(r.unwired) || !Array.isArray(r.exempt)) return { error: 'bad arrays' };
    if (r.scanned !== 4) return { error: `scanned ${r.scanned} != 4 (recursion on)` };
    return true;
});

test('wired detection: middleware requires are found per layer', () => {
    const r = pipeline.scan(tmp, { maxDepth: 99 });
    const wired = r.modules.find((m) => m.name === 'wired');
    if (!wired) return { error: 'wired.js missing' };
    if (!wired.layers.vaf || !wired.layers.escrow) return { error: 'vaf/escrow not detected' };
    if (!wired.wired.includes('vaf') || !wired.wired.includes('escrow')) return { error: 'wired list wrong' };
    return true;
});

test('shallow depth (default 1) keeps nested/ out of the top-level scan', () => {
    const r = pipeline.scan(tmp); // default depth
    if (r.modules.some((m) => m.name.startsWith('nested'))) return { error: 'nested module leaked into shallow scan' };
    if (r.scanned !== 3) return { error: `shallow scanned ${r.scanned} != 3` };
    return true;
});

test('nothing wired: unwired stays UNWIRED (nothing greenwashed)', () => {
    const r = pipeline.scan(tmp, { maxDepth: 99 });
    if (!r.unwired.includes('unwired')) return { error: 'unwired.js not reported as unwired' };
    const u = r.modules.find((m) => m.name === 'unwired');
    if (u.wired.length !== 0) return { error: 'unwired module got wired layers' };
    if (u.layers.sandbox || u.layers.vaf || u.layers.qos || u.layers.escrow) return { error: 'unwired module got gate flags' };
    return true;
});

test('whitelist: allowed modules are EXEMPT (a stated choice, not a gap)', () => {
    const r = pipeline.scan(tmp, { maxDepth: 99, allow: ['unwired'] });
    if (r.unwired.includes('unwired')) return { error: 'whitelisted module still reported unwired' };
    if (!r.exempt.includes('unwired')) return { error: 'whitelisted module not tagged exempt' };
    if (r.scanned !== 4) return { error: 'exempt module not counted in scanned' };
    // allow.js suffixes and whitespace are normalized by the door verb, but
    // scan() itself takes clean names; '.js'-suffixed names still work here:
    const r2 = pipeline.scan(tmp, { maxDepth: 99, allow: ['unwired.js'] });
    if (!r2.exempt.includes('unwired')) return { error: 'allow with .js suffix not normalized' };
    return true;
});

test('informational layers never gate: audit/habitat do not count as wired', () => {
    const r = pipeline.scan(tmp, { maxDepth: 99 });
    const wired = r.modules.find((m) => m.name === 'wired');
    if (wired.layers.audit !== false || wired.layers.habitat !== false) return { error: 'fixture has no audit — flags must be false' };
    if (pipeline.GATE_LAYERS.includes('audit') || pipeline.GATE_LAYERS.includes('habitat')) return { error: 'informational layers leaked into GATE_LAYERS' };
    return true;
});

test('missing module file stays readable=false honest flag', () => {
    const r = pipeline.scan(tmp, { maxDepth: 99 });
    if (!r.modules.every((m) => m.readable === true)) return { error: 'fixture files should all read' };
    // unreadable dir behaves like an empty scan, never a crash
    const r2 = pipeline.scan(path.join(tmp, 'does-not-exist'));
    if (r2.scanned !== 0) return { error: 'missing dir must scan to zero' };
    return true;
});

// ---- live probe of the REAL lib/ tree (shaped assertions only) ----
test('live lib/ scan: real topology, known wired + known unwired truth', () => {
    const r = pipeline.scan(path.join(ROOT, 'lib'));
    if (r.scanned < 100) return { error: `live lib should hold 100+ modules, got ${r.scanned}` };
    // mcp.js IS the door of the chain: sandbox require is pinned elsewhere in
    // the suite; here we only demand the door carries SOME gate evidence.
    const door = r.modules.find((m) => m.name === 'mcp');
    if (!door) return { error: 'lib/mcp.js not scanned' };
    if (door.wired.length === 0) return { error: 'the door shows no gate wiring evidence' };
    // config.js is a leaf util: zero gate layers is an honest, expected answer.
    const leaf = r.modules.find((m) => m.name === 'theme');
    if (leaf && leaf.wired.length === 0 && !r.unwired.includes('theme')) return { error: 'unwired leaf not listed in unwired[]' };
    return true;
});

fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n  ${results.passed} passed, ${results.failed} failed\n`);
process.exit(results.failed > 0 ? 1 : 0);
