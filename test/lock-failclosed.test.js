#!/usr/bin/env node
/**
 * Fail-closed gates (pass 103)
 *
 * Pass 103 changed state-store/teams/agents/habitat from "warn + last-writer-
 * wins" to FAIL-CLOSED: when the lock cannot be acquired, the write is refused
 * rather than performed unlocked. These are the adversarial gates proving it —
 * stub lock.acquire to fail and assert NOTHING is written (and that the caller
 * recovers once the lock is available again).
 *
 * market's fail-closed path is pinned separately in market-crossprocess gate D.
 * (scratch brain qc-lock-fc, wiped at start)
 */

process.env.VANT_BRAIN = 'qc-lock-fc';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BRAIN = path.join(ROOT, 'models', 'private', 'qc-lock-fc');
fs.rmSync(BRAIN, { recursive: true, force: true });

const lock = require(path.join(ROOT, 'lib', 'lock'));
const stateStore = require(path.join(ROOT, 'lib', 'state-store'));
const teams = require(path.join(ROOT, 'lib', 'teams'));
const Habitat = require(path.join(ROOT, 'lib', 'habitat'));

// teams's createOrg write is capability-gated; grant write in-process.
require(path.join(ROOT, 'lib', 'sandbox')).defaultSandbox.setCapabilities({
    canRead: true, canWrite: true, canNetwork: true, canTrade: true, canSpawn: true
});

const results = { passed: 0, failed: 0 };
const suite = [];

function test(name, fn) { suite.push({ name, fn }); }

// A failing acquire stub that mimics a peer holding the lock.
const heldFail = () => ({ ok: false, reason: 'held' });

console.log('\n🔒 FAIL-CLOSED GATES (pass 103)\n');

// ============================================
// state-store.persistMerged
// ============================================

const SF = 'state/qc-fc.json';

function readState() {
    const { store, file } = stateStore.getStore(SF);
    return store.has(file) ? JSON.parse(store.read(file)) : null;
}

test('persistMerged refuses an unlocked write and leaves disk untouched', async () => {
    stateStore.persist({ moduleName: 'qc', stateFile: SF, data: { sentinel: 'original' } });
    const real = lock.acquire;
    lock.acquire = heldFail;
    let ret;
    try {
        ret = await stateStore.persistMerged({
            moduleName: 'qc',
            stateFile: SF,
            merge: () => {},
            serialize: () => ({ sentinel: 'clobbered' })
        });
    } finally {
        lock.acquire = real;
    }
    const disk = readState();
    return { success: ret === false && disk && disk.sentinel === 'original' };
});

test('persistMerged writes normally once the lock is available', async () => {
    const ret = await stateStore.persistMerged({
        moduleName: 'qc',
        stateFile: SF,
        merge: () => {},
        serialize: () => ({ sentinel: 'written' })
    });
    const disk = readState();
    return { success: ret === true && disk && disk.sentinel === 'written' };
});

// ============================================
// teams._saveTeams
// ============================================

const TEAMS_STORE = path.join(BRAIN, 'orgchart', 'teams.json');

test('teams refuses an unlocked save (org not persisted) but keeps it in memory', async () => {
    const real = lock.acquire;
    lock.acquire = heldFail;
    let org;
    try {
        org = teams.createOrg('FcDenied-' + Date.now());
        await teams.flush();
    } finally {
        lock.acquire = real;
    }
    const persisted = fs.existsSync(TEAMS_STORE)
        ? JSON.parse(fs.readFileSync(TEAMS_STORE, 'utf8'))
        : { orgs: [] };
    const onDisk = (persisted.orgs || []).some((o) => o.id === org.id);
    return { success: !!org.id && !onDisk };
});

test('teams persists again once the lock is available', async () => {
    const org = teams.createOrg('FcAllowed-' + Date.now());
    await teams.flush();
    const persisted = JSON.parse(fs.readFileSync(TEAMS_STORE, 'utf8'));
    return { success: (persisted.orgs || []).some((o) => o.id === org.id) };
});

// ============================================
// habitat.save
// ============================================

test('habitat refuses an unlocked save (returns null, no write)', async () => {
    let wrote = false;
    const h = new Habitat({
        persistence: {
            recall: async () => null,
            state: async () => { wrote = true; }
        }
    });
    const real = lock.acquire;
    lock.acquire = heldFail;
    let out;
    try {
        out = await h.save();
    } finally {
        lock.acquire = real;
    }
    return { success: out === null && wrote === false };
});

test('habitat saves normally once the lock is available', async () => {
    let wrote = false;
    const h = new Habitat({
        persistence: {
            recall: async () => null,
            state: async () => { wrote = true; }
        }
    });
    const out = await h.save();
    return { success: !!out && wrote === true };
});

// ============================================

(async () => {
    for (const t of suite) {
        try {
            const r = await t.fn();
            if (r === true || (r && r.success)) {
                results.passed++;
                console.log(`  ✓ ${t.name}`);
            } else {
                results.failed++;
                console.log(`  ✗ ${t.name}: ${(r && r.error) || 'assertion failed'}`);
            }
        } catch (e) {
            results.failed++;
            console.log(`  ✗ ${t.name}: ${e.message}`);
        }
    }
    fs.rmSync(BRAIN, { recursive: true, force: true });

    console.log('\n--- RESULTS ---\n');
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    console.log(`  Total:   ${results.passed + results.failed}`);
    process.exit(results.failed > 0 ? 1 : 0);
})();
