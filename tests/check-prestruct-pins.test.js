#!/usr/bin/env node
/**
 * prestruct pins guard (issue #328) fixture tests.
 *
 * Pins scripts/check-prestruct-pins.cjs:
 *   - FLOOR: web/home's prestruct pin must be at/above the family floor
 *     ^1.2.0; an exact 1.1.0 pin (the pre-#328 state) and a floating range
 *     (*, latest, ~) are both refused.
 *   - CARET is accepted (the floor is ^1.2.0; ^1.2.0 and an exact 1.2.0 are
 *     both at the floor, not below it).
 *   - FRESHNESS: the vendored web/home/src/islands.js must name the pinned
 *     version in its header AND carry the 1.2.0 observer-lifecycle markers
 *     (the `observing` WeakSet + the `observers` WeakMap); the pre-1.2.0
 *     copy lacks them.
 *   - PASS contract on the real repo tree.
 *
 * The guard accepts a rootDir arg, so every case drives it over a throwaway
 * fixture tree, never the real docs.
 *
 * Run: node tests/check-prestruct-pins.test.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const GUARD = path.join(ROOT, 'scripts', 'check-prestruct-pins.cjs');

const results = { passed: 0, failed: 0 };

function test(name, fn) {
    try {
        const err = fn();
        if (err) {
            results.failed++;
            console.log(`  ✗ ${name}: ${err.message || err}`);
        } else {
            results.passed++;
            console.log(`  ✓ ${name}`);
        }
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

// The 1.2.0 engine body (post observer-lifecycle fix).
const FRESH_ISLANDS = `/**
 * src/islands.js
 * ==============
 * Engine file: vendored COPY from prestruct@1.2.0 (init/src/islands.js),
 * never edited locally; upgrades come from the package's init template.
 */
const mounted = new WeakSet()
const observing = new WeakSet()
const observers = new WeakMap()
export function mountIslands(registry = {}) {}
`;

// The pre-1.2.0 copy: no observing WeakSet, no observers WeakMap.
const STALE_ISLANDS = `/**
 * src/islands.js
 * ==============
 * Engine file: vendored COPY from prestruct@1.1.0.
 */
const mounted = new WeakSet()
export function mountIslands(registry = {}) {}
`;

function fixture({ pin, islands = FRESH_ISLANDS }) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prestruct-pins-'));
    fs.mkdirSync(path.join(root, 'web', 'home', 'src'), { recursive: true });
    fs.writeFileSync(
        path.join(root, 'web', 'home', 'package.json'),
        JSON.stringify({ devDependencies: { prestruct: pin } }, null, 2)
    );
    if (islands !== null) fs.writeFileSync(path.join(root, 'web', 'home', 'src', 'islands.js'), islands);
    return root;
}

function runGuard(root) {
    try {
        const out = execFileSync('node', [GUARD, root], { encoding: 'utf8' });
        return { exit: 0, out };
    } catch (e) {
        return { exit: e.status || 1, out: (e.stdout || '') + (e.stderr || '') };
    }
}

console.log('\n🔒 PRESTRUCT PINS GUARD (issue #328) FIXTURE TESTS\n');

test('pass contract: the real repo tree exits 0 with a PASS summary', () => {
    const r = runGuard(ROOT);
    if (r.exit !== 0) return new Error(`exit ${r.exit}: ${r.out}`);
    if (!/PRESTRUCT PINS: PASS/.test(r.out)) return new Error('no PASS summary');
});

test('refuses an exact 1.1.0 pin (below the family floor) — the pre-#328 state', () => {
    const r = runGuard(fixture({ pin: '1.1.0', islands: STALE_ISLANDS }));
    if (r.exit === 0) return new Error('expected FAIL for the 1.1.0 pin');
    if (!/below the family floor/.test(r.out)) return new Error('did not name the floor: ' + r.out);
});

test('refuses a floating range (* / latest) — a range floats the engine', () => {
    for (const pin of ['*', 'latest', '~1.2.0', '>=1.2.0']) {
        const r = runGuard(fixture({ pin }));
        if (r.exit === 0) return new Error(`expected FAIL for floating pin "${pin}"`);
        if (!/floats/.test(r.out)) return new Error(`"${pin}" did not name the float: ${r.out}`);
    }
});

test('accepts the caret floor ^1.2.0 (at the floor, not below it)', () => {
    const r = runGuard(fixture({ pin: '^1.2.0' }));
    if (r.exit !== 0) return new Error(`expected PASS for ^1.2.0: ${r.out}`);
});

test('accepts an exact 1.2.0 pin (what the site carries today)', () => {
    const r = runGuard(fixture({ pin: '1.2.0' }));
    if (r.exit !== 0) return new Error(`expected PASS for 1.2.0: ${r.out}`);
});

test('refuses a stale vendored islands.js (no observing WeakSet) even when the pin is at the floor', () => {
    const r = runGuard(fixture({ pin: '1.2.0', islands: STALE_ISLANDS }));
    if (r.exit === 0) return new Error('expected FAIL for the pre-1.2.0 vendored copy');
    if (!/observing WeakSet|predates prestruct/.test(r.out)) return new Error('did not name the marker: ' + r.out);
});

test('refuses a vendored copy whose header names the wrong version', () => {
    const r = runGuard(fixture({ pin: '1.2.0', islands: FRESH_ISLANDS.replace('prestruct@1.2.0', 'prestruct@1.1.0') }));
    if (r.exit === 0) return new Error('expected FAIL for the mismatched header');
    if (!/does not name the pinned prestruct@1\.2\.0/.test(r.out)) return new Error('did not name the header drift: ' + r.out);
});

console.log(`\n  ${results.passed} passed, ${results.failed} failed\n`);
process.exit(results.failed > 0 ? 1 : 0);
