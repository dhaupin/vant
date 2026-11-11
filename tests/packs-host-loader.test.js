#!/usr/bin/env node
/**
 * packs-host-loader — the packstruct conformance host face (crashtest #33).
 *
 * `scripts/audit-host-loader.js` is the face packstruct's `audit-conformance`
 * runs over each materialized bundle. It must load a conforming bundle under
 * the HOST (packstruct) profile — manifest contract fully enforced, scenario
 * shape deferred (`validateProfile: false`) — and refuse a bundle whose
 * manifest violates the contract. This suite pins both directions against the
 * repo's REAL crashtest engine, so the face cannot silently regress to the
 * strict scenario profile (the class that refused the SPEC §7 clean fixture
 * before the host-profile path landed).
 *
 * Run: node tests/packs-host-loader.test.js     (also picked up by the sweep)
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LOADER = path.join(ROOT, 'scripts', 'audit-host-loader.js');

const results = { passed: 0, failed: 0 };

function test(name, fn) {
    try {
        const r = fn();
        if (r === true || (r && r.success)) {
            results.passed++;
            console.log(`  ✓ ${name}`);
        } else {
            results.failed++;
            console.log(`  ✗ ${name}: ${(r && r.error) || 'assertion failed'}`);
        }
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

// Materialize a <bundle>/public/<name>/ fixture the way the packstruct
// harness does, and run the face over the bundle dir.
function makeBundle(manifest, entryBody) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-host-loader-'));
    const dir = path.join(root, 'public', manifest.name || 'pack');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'pack.json'), JSON.stringify(manifest, null, 2) + '\n');
    if (entryBody !== undefined) fs.writeFileSync(path.join(dir, manifest.entry || 'index.js'), entryBody);
    return root;
}

function runLoader(bundleDir) {
    return spawnSync(process.execPath, [LOADER, bundleDir], { encoding: 'utf8' });
}

console.log('\n🔌 PACKS HOST-LOADER TESTS (crashtest #33)\n');

// ---------- the accept direction (the host profile) ----------

test('host profile: a profile-minimal (manifest-conformant) bundle loads, exit 0', () => {
    // The SPEC §7 clean shape: manifest-conformant, entry-importable, NOT
    // scenario-shaped. Under the strict scenario profile this refused; under
    // the host profile it must load.
    const bundle = makeBundle(
        { schemaVersion: 1, name: 'clean-pack', description: 'a profile-minimal pack', entry: 'index.js' },
        "export default { name: 'clean-pack' };\n"
    );
    const r = runLoader(bundle);
    return {
        success: r.status === 0 && /host-loader OK: 1 pack/.test(r.stdout),
        error: `exit ${r.status}, out=${JSON.stringify(r.stdout.trim())}, err=${JSON.stringify(r.stderr.trim())}`,
    };
});

// ---------- the refuse direction (the manifest contract stays enforced) ----------

test('manifest contract: an unsupported schemaVersion refuses loudly, non-zero', () => {
    const bundle = makeBundle(
        { schemaVersion: 9, name: 'bad-schema', description: 'x', entry: 'index.js' },
        "export default { name: 'bad-schema' };\n"
    );
    const r = runLoader(bundle);
    return {
        success: r.status !== 0 && /REFUSED/.test(r.stderr),
        error: `exit ${r.status}, err=${JSON.stringify(r.stderr.trim())}`,
    };
});

// ---------- the argument contract ----------

test('a missing bundle path exits 2 (usage), never a silent pass', () => {
    const r = runLoader(path.join(os.tmpdir(), 'vant-host-loader-does-not-exist-xyz'));
    return { success: r.status === 2, error: `exit ${r.status}` };
});

console.log(`\n${results.passed} passed, ${results.failed} failed\n`);
process.exit(results.failed === 0 ? 0 : 1);
