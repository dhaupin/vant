#!/usr/bin/env node
/**
 * Strict Brain Storage Restore Tests (pass 29)
 *
 * Policy (0.8.6 axolotl): transform.restore() accepts ONLY the gather()
 * brains-object format ({ brains: { <name>: { type, files } } }). Legacy
 * shapes (brainStorage.files flat array, privateBrains per-brain list) are
 * REJECTED with E_LEGACY_FORMAT — the bridge is
 * transform.migrateLegacyBrainStorage(data), same migrate-or-reject pattern
 * as teams.restoreState (pass 27).
 *
 * Pins:
 *   - legacy privateBrains payload → E_LEGACY_FORMAT, disk untouched
 *   - legacy flat brainStorage.files → E_LEGACY_FORMAT, disk untouched
 *   - malformed brains entries (bad type / non-array files) → rejected
 *   - migrateLegacyBrainStorage: flat + list conversion, purity, unsafe-name
 *     rejection, merge warnings
 *   - round-trip: migrated payload restores for real
 *   - benign new-format payload still restores (control)
 *
 * Run: node test/brain-storage-strict.test.js
 */

const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0 };

const suite = [];
function define(name, fn) { suite.push({ name, fn }); }
async function runSuite() {
    for (const { name, fn } of suite) {
        try {
            const result = await fn();
            const ok = result === true || (result && result.success);
            if (ok) { results.passed++; console.log(`  ✓ ${name}`); }
            else { results.failed++; console.log(`  ✗ ${name}: ${(result && result.error) || 'assertion failed'}`); }
        } catch (e) {
            results.failed++;
            console.log(`  ✗ ${name}: ${e.message}`);
        }
    }
    console.log('\n--- RESULTS ---');
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    console.log(`  Total:   ${results.passed + results.failed}`);
    cleanup();
    process.exit(results.failed > 0 ? 1 : 0);
}

const transform = require(path.join(ROOT, 'lib', 'transform'));

const MODELS = path.join(ROOT, 'models');
const PROBE_BRAINS = ['qc-strict-probe', 'qc-migrated-probe'];

// Wrapped horcrux factory — proven shape that reaches the brainStorage
// restore path (same as malicious-restore.test.js).
function payload(brainsObject) {
    return {
        type: 'vant-horcrux',
        timestamp: Date.now(),
        version: '0.8.6',
        payload: {
            timestamp: Date.now(),
            version: '0.8.6',
            mode: { loaded: false },
            brainStorage: {
                loaded: true,
                brains: brainsObject
            }
        }
    };
}

// Unwrapped legacy payload (no type field) carrying ONLY the legacy
// privateBrains section.
function legacyPrivateBrainsPayload(brains) {
    return {
        timestamp: Date.now(),
        version: '0.8.6',
        privateBrains: { loaded: true, brains }
    };
}

// Unwrapped legacy payload carrying ONLY the flat files array.
function legacyFlatPayload(files) {
    return {
        timestamp: Date.now(),
        version: '0.8.6',
        brainStorage: { loaded: true, files }
    };
}

function cleanup() {
    for (const name of PROBE_BRAINS) {
        try { fs.rmSync(path.join(MODELS, 'private', name), { recursive: true, force: true }); } catch (e) {}
    }
    // Flat-format canaries would have landed at the models root or in the
    // current brain's dir — neither may exist.
    for (const f of [
        path.join(MODELS, 'qc-pass29-canary.md'),
        path.join(MODELS, 'private', 'qc-pass29-canary.md'),
        path.join(MODELS, 'private', 'vant', 'qc-pass29-canary.md')
    ]) {
        try { fs.unlinkSync(f); } catch (e) {}
    }
}

// ============================================
// 1. LEGACY REJECTIONS — migrate-or-reject
// ============================================

define('restore rejects legacy privateBrains payload with E_LEGACY_FORMAT', async () => {
    let err = null;
    try {
        await transform.restore(legacyPrivateBrainsPayload([
            { name: 'old-brain', files: [{ name: 'identity', content: '# old' }] }
        ]));
    } catch (e) { err = e; }
    return {
        success: !!err && err.code === 'E_LEGACY_FORMAT' && /migrateLegacyBrainStorage/.test(err.message),
        error: err ? `wrong rejection: ${err.code} ${err.message}` : 'legacy payload was accepted'
    };
});

define('restore rejects legacy flat brainStorage.files with E_LEGACY_FORMAT', async () => {
    let err = null;
    try {
        await transform.restore(legacyFlatPayload([
            { path: 'identity.md', content: '# old' }
        ]));
    } catch (e) { err = e; }
    return {
        success: !!err && err.code === 'E_LEGACY_FORMAT' && /migrateLegacyBrainStorage/.test(err.message),
        error: err ? `wrong rejection: ${err.code} ${err.message}` : 'flat payload was accepted'
    };
});

define('rejection leaves disk untouched (no canary written)', async () => {
    try {
        await transform.restore(legacyFlatPayload([
            { path: 'qc-pass29-canary.md', content: 'should never land' }
        ]));
    } catch (e) { /* expected */ }
    try {
        await transform.restore(legacyPrivateBrainsPayload([
            { name: 'qc-pass29-canary-brain', files: [{ name: 'qc-pass29-canary', content: 'x' }] }
        ]));
    } catch (e) { /* expected */ }
    const canaries = [
        path.join(MODELS, 'qc-pass29-canary.md'),
        path.join(MODELS, 'private', 'qc-pass29-canary.md'),
        path.join(MODELS, 'private', 'vant', 'qc-pass29-canary.md'),
        path.join(MODELS, 'private', 'qc-pass29-canary-brain')
    ];
    const landed = canaries.filter(f => fs.existsSync(f));
    return { success: landed.length === 0, error: `canaries landed: ${landed.join(', ')}` };
});

define('restore rejects brainStorage without a brains object', async () => {
    let err = null;
    try {
        await transform.restore(payload(undefined));
    } catch (e) { err = e; }
    return {
        success: !!err && err.code === 'E_LEGACY_FORMAT',
        error: err ? `wrong rejection: ${err.code}` : 'missing brains object was accepted'
    };
});

define('restore rejects brain entry with invalid type', async () => {
    let err = null;
    try {
        await transform.restore(payload({ 'x-brain': { type: 'weird', files: [] } }));
    } catch (e) { err = e; }
    return {
        success: !!err && err.code === 'E_LEGACY_FORMAT' && /type must be/.test(err.message),
        error: err ? `wrong rejection: ${err.code} ${err.message}` : 'invalid type was accepted'
    };
});

define('restore rejects brain entry with non-array files', async () => {
    let err = null;
    try {
        await transform.restore(payload({ 'x-brain': { type: 'private', files: 'nope' } }));
    } catch (e) { err = e; }
    return {
        success: !!err && err.code === 'E_LEGACY_FORMAT' && /files must be an array/.test(err.message),
        error: err ? `wrong rejection: ${err.code} ${err.message}` : 'non-array files was accepted'
    };
});

// ============================================
// 2. MIGRATION BRIDGE — migrateLegacyBrainStorage
// ============================================

define('bridge converts flat files into a brains object (pure)', () => {
    const data = legacyFlatPayload([
        { path: 'a.md', content: 'A' },
        { path: 'sub/b.md', content: 'B' }
    ]);
    const snapshot = JSON.stringify(data);
    const { converted, counts, warnings } = transform.migrateLegacyBrainStorage(data, { brainName: 'qc-legacy' });
    const brains = converted.brainStorage && converted.brainStorage.brains;
    const ok = !!brains && !!brains['qc-legacy'] &&
        brains['qc-legacy'].type === 'private' &&
        JSON.stringify(brains['qc-legacy'].files.map(f => f.path)) === JSON.stringify(['a.md', 'sub/b.md']) &&
        counts['qc-legacy'] === 2 &&
        warnings.length >= 1 &&
        // purity: input untouched
        JSON.stringify(data) === snapshot;
    return { success: ok, error: `converted=${JSON.stringify(brains && brains['qc-legacy'])} counts=${JSON.stringify(counts)}` };
});

define('bridge converts privateBrains list (name → name.md, key removed)', () => {
    const data = legacyPrivateBrainsPayload([
        { name: 'nova', files: [{ name: 'identity', content: '# nova' }] }
    ]);
    const { converted, counts } = transform.migrateLegacyBrainStorage(data);
    const f = converted.brainStorage.brains.nova.files[0];
    const ok = f.path === 'identity.md' && f.content === '# nova' &&
        counts.nova === 1 &&
        converted.privateBrains === undefined &&
        !!converted._migratedPrivateBrains;
    return { success: ok, error: `file=${JSON.stringify(f)} privateBrains=${JSON.stringify(converted.privateBrains)}` };
});

define('bridge merges both legacy shapes into one brain with a warning', () => {
    const data = {
        timestamp: Date.now(),
        version: '0.8.6',
        brainStorage: { loaded: true, files: [{ path: 'flat.md', content: 'F' }] },
        privateBrains: { loaded: true, brains: [{ name: 'qc-merged', files: [{ name: 'list', content: 'L' }] }] }
    };
    const { converted, warnings } = transform.migrateLegacyBrainStorage(data, { brainName: 'qc-merged' });
    const files = converted.brainStorage.brains['qc-merged'].files.map(f => f.path).sort();
    return {
        success: JSON.stringify(files) === JSON.stringify(['flat.md', 'list.md']) && warnings.length >= 1,
        error: `files=${JSON.stringify(files)} warnings=${JSON.stringify(warnings)}`
    };
});

define('bridge throws on unsafe brain name', () => {
    try {
        transform.migrateLegacyBrainStorage(legacyPrivateBrainsPayload([
            { name: '../evil', files: [] }
        ]));
        return { success: false, error: 'unsafe brain name accepted' };
    } catch (e) {
        return { success: /unsafe brain name/.test(e.message), error: `wrong error: ${e.message}` };
    }
});

define('bridge throws when no legacy data is present', () => {
    try {
        transform.migrateLegacyBrainStorage({ brainStorage: { loaded: true, brains: {} } });
        return { success: false, error: 'new-format payload accepted by bridge' };
    } catch (e) {
        return { success: /no legacy brain data/.test(e.message), error: `wrong error: ${e.message}` };
    }
});

// ============================================
// 3. ROUND-TRIP — bridge output restores for real
// ============================================

define('migrated payload passes strict restore and writes brain files', async () => {
    cleanup();
    const legacy = legacyPrivateBrainsPayload([
        { name: 'qc-migrated-probe', files: [{ name: 'identity', content: '# migrated\nNAME: QC29' }] }
    ]);
    const { converted } = transform.migrateLegacyBrainStorage(legacy);
    const r = await transform.restore({
        timestamp: Date.now(),
        version: '0.8.6',
        mode: { loaded: false },
        brainStorage: converted.brainStorage
    });
    const landed = fs.existsSync(path.join(MODELS, 'private', 'qc-migrated-probe', 'identity.md'));
    return {
        success: landed && r.restored.includes('brainStorage') && !r.errors.length,
        error: `landed=${landed} restored=${JSON.stringify(r.restored)} errors=${JSON.stringify(r.errors)}`
    };
});

define('benign new-format payload still restores (control)', async () => {
    cleanup();
    const r = await transform.restore(payload({
        'qc-strict-probe': { type: 'private', files: [
            { path: 'identity.md', content: '# probe\nNAME: QC29' }
        ] }
    }));
    const landed = fs.existsSync(path.join(MODELS, 'private', 'qc-strict-probe', 'identity.md'));
    return {
        success: landed && r.restored.includes('brainStorage'),
        error: `landed=${landed} restored=${JSON.stringify(r.restored)} errors=${JSON.stringify(r.errors)}`
    };
});

// ============================================
// 4. PREVIEW — inspectHorcrux migration hint
// ============================================

define('inspectHorcrux flags legacy brain data instead of double-counting', async () => {
    const tmp = path.join(ROOT, '.qc-pass29-horcrux.json');
    fs.writeFileSync(tmp, JSON.stringify({
        type: 'vant-horcrux',
        timestamp: Date.now(),
        version: '0.8.6',
        payload: {
            timestamp: Date.now(),
            version: '0.8.6',
            brainStorage: { loaded: true, brains: { 'one': { type: 'private', files: [] } } },
            privateBrains: { loaded: true, brains: [{ name: 'two', files: [] }] }
        }
    }));
    try {
        // JSON horcrux: password is unused for parsing but resolve-before-read
        // is inspect's contract, so pass one explicitly (no stdin prompt).
        const result = await transform.inspectHorcrux(tmp, { password: 'qc-pass29' });
        const p = result.preview || {};
        const ok = p.hasLegacyPrivateBrains === true &&
            result.legacyBrainData === true &&
            p.brainCount === 1 && // only the new-format brain counts
            p.hasBothFormats === undefined;
        return { success: ok, error: `preview=${JSON.stringify({ hasLegacy: p.hasLegacyPrivateBrains, brainCount: p.brainCount, legacy: result.legacyBrainData })}` };
    } finally {
        try { fs.unlinkSync(tmp); } catch (e) {}
    }
});

// ============================================
// RUN
// ============================================

console.log('\n🧠 STRICT BRAIN STORAGE RESTORE TESTS (pass 29)\n');
runSuite();
