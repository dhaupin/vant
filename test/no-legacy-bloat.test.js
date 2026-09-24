#!/usr/bin/env node
/**
 * No-Legacy-Bloat Guard (pass 26)
 *
 * Policy (0.8.6 axolotl, owner decision): everything is new — no legacy
 * wrappers, no compat aliases, no silent-failure fallbacks. Legacy BRAIN
 * data is supported only to migrate OFF old paths (lib/migrations.js);
 * legacy CODE patterns are removed, not maintained.
 *
 * This suite pins the removals so they cannot creep back:
 *   - errors.Error alias export (172 call sites renamed in pass 26)
 *   - silent-stub audit fallbacks (try require / catch {info:noop})
 *   - @deprecated shims with live twins (geometry.generateBarcode)
 *   - sync.js pass-through circuit wrapper exports
 *   - backup.backup() legacy alias
 *
 * Run: node test/no-legacy-bloat.test.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const results = { passed: 0, failed: 0 };

function test(name, fn) {
    try {
        const err = fn();
        if (err) {
            results.failed++;
            console.log(`  ✗ ${name}: ${err}`);
        } else {
            results.passed++;
            console.log(`  ✓ ${name}`);
        }
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message.split('\n')[0]}`);
    }
}

function readLib(rel) {
    return fs.readFileSync(path.join(ROOT, 'lib', rel), 'utf8');
}

/** Grep-shaped scan across lib/ + bin/ (no node_modules). */
function scan(pattern, dirs = ['lib', 'bin']) {
    const hits = [];
    const walk = (dir) => {
        for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, f.name);
            if (f.isDirectory()) { walk(full); continue; }
            if (!f.name.endsWith('.js')) continue;
            const src = fs.readFileSync(full, 'utf8');
            const rel = path.relative(ROOT, full).replace(/\\/g, '/');
            src.split('\n').forEach((line, i) => {
                if (pattern.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 90)}`);
            });
        }
    };
    for (const d of dirs) walk(path.join(ROOT, d));
    return hits;
}

console.log('\n🚫 NO-LEGACY-BLOAT GUARD\n');

test('error.js: no Error->VantError compat alias export', () => {
    const src = readLib('error.js');
    if (/^\s*Error:\s*VantError/m.test(src)) return 'alias export `Error: VantError` is back';
    return null;
});

test('lib/bin: every error throw uses X.VantError (no X.Error call form, any import alias)', () => {
    // (pass 26) matches ANY local alias — caught lib/rls.js error.Error()
    // after a narrower errors.Error()-only scan had already "passed".
    const hits = scan(/\.\s*Error\s*\(/);
    return hits.length ? `${hits.length} sites:\n    ${hits.slice(0, 5).join('\n    ')}` : null;
});

test('lib/bin: no silent-stub audit fallbacks (try require / catch noop-stub)', () => {
    const hits = scan(/catch\s*\(\w*\)\s*\{\s*_*\w*\s*=\s*\{\s*(info|warn|error)/);
    return hits.length ? hits.join('\n    ') : null;
});

test('lib/bin: no try/catch-wrapped require of ./audit', () => {
    const hits = scan(/try\s*\{\s*_?\w*\s*=\s*require\('\.\/audit'\)\s*\}\s*catch/);
    return hits.length ? hits.join('\n    ') : null;
});

test('lib: no @deprecated JSDoc shims', () => {
    const hits = scan(/@deprecated/, ['lib']);
    return hits.length ? hits.join('\n    ') : null;
});

test('sync.js: circuit wrapper pass-throughs not exported', () => {
    const src = readLib('sync.js');
    const m = src.match(/module\.exports\s*=\s*\{[\s\S]*?\}/);
    if (!m) return null;
    const names = ['isCircuitClosed', 'recordFailure', 'recordSuccess'];
    const bad = names.filter(n => new RegExp(`(^|[^\\w.])${n},`).test(m[0]));
    // getAllCircuits is a real consumer surface (bin/validate.js) — stays.
    return bad.length ? `re-exported: ${bad.join(', ')}` : null;
});

test('backup.js: no legacy backup() alias', () => {
    const src = readLib('backup.js');
    if (/Legacy:\s*Create a one-time backup/.test(src)) return 'backup() alias is back';
    return null;
});

test('orgchart stores: brain-scoped default only, no .agent_tmp fallback (pass 28)', () => {
    for (const rel of ['teams.js', 'escrow.js', 'agents/internal.js']) {
        // Strip // comments first: docs of the REMOVAL may name the old path;
        // only live code/strings count as a regression.
        const code = readLib(rel).replace(/\/\/.*$/gm, '');
        if (/agent_tmp/.test(code)) return rel + ' still references .agent_tmp in code';
    }
    return null;
});

test('smoke: error.js still exports VantError + CODES', () => {
    const errors = require(path.join(ROOT, 'lib', 'error.js'));
    if (typeof errors.VantError !== 'function') return 'VantError missing';
    if (!errors.CODES || !errors.CODES.RATE_LIMIT_EXCEEDED) return 'CODES missing';
    if (errors.Error !== undefined) return 'alias resurrected';
    return null;
});

console.log(`\n=== Results: ${results.passed} passed, ${results.failed} failed ===\n`);
process.exit(results.failed > 0 ? 1 : 0);
