#!/usr/bin/env node
/**
 * Consumer-wiring pins (pass 171 — "finish out everything" follow-up).
 *
 * The pass-170 spine shipped modules; this pass wires the consumers and
 * pins each wiring's acceptance criteria:
 *
 *   SEEDS → MESH   — MeshTree rides the ONE SeedChain (#158): region seed
 *                    scopes are universe-scoped and deterministic; cell
 *                    addressing goes through the spine's one PRF (#165).
 *   AUTHORITY      — mesh writer claims hash via the ONE canonical encoder
 *                    (#146): key-order independent, cross-process equal.
 *   STATE-STORE    — opt-in tree tier: toTree/fromTree roundtrip, root
 *                    hashes deterministic, treeFor typed absence, events
 *                    carry the root hash.
 *   MESH-STATUS    — the coordinator's report carries the MeshTree presence
 *                    view (registry peers projected onto tree paths) plus
 *                    the region's seed scope; read-only, degraded-not-dead.
 *
 * Exit code is the verdict, per house test conventions.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);

let passed = 0, failed = 0;
function ok(name) { passed++; console.log('  ✓ ' + name); }
function fail(name, detail) { failed++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
function test(name, fn) {
    try { fn(); ok(name); } catch (e) { fail(name, e.message); }
}
async function testAsync(name, fn) {
    try { await fn(); ok(name); } catch (e) { fail(name, e.message); }
}

const { MeshTree } = require('../lib/state/mesh');
const { AddressingSpine } = require('../lib/state/spine');
const stateStore = require('../lib/state-store');
const events = require('../lib/event');

async function main() {
    // ==================== SEEDS → MESH (#158 wiring) ====================
    console.log('\n▓ SEEDS → MESH\n');

    test('seeds: two fresh MeshTrees in the same universe derive identical region seeds', () => {
        const a = new MeshTree({ universe: 'wire-test' }).seedScope('r1');
        const b = new MeshTree({ universe: 'wire-test' }).seedScope('r1');
        assert.strictEqual(a.scopePath, 'mesh:r1');
        assert.strictEqual(a.seedHex, b.seedHex);
    });

    test('seeds: a different universe shards mesh addressing (different seeds)', () => {
        const a = new MeshTree({ universe: 'u-alpha' }).seedScope('r1');
        const b = new MeshTree({ universe: 'u-beta' }).seedScope('r1');
        assert.notStrictEqual(a.seedHex, b.seedHex);
    });

    test('seeds: VANT_UNIVERSE_SEED env flows through the default constructor', () => {
        const prev = process.env.VANT_UNIVERSE_SEED;
        try {
            const baseline = new MeshTree().seedScope('r1').seedHex;
            process.env.VANT_UNIVERSE_SEED = 'env-sharded-universe';
            const envd = new MeshTree().seedScope('r1').seedHex;
            assert.notStrictEqual(baseline, envd, 'env override must change the derived seed');
        } finally {
            if (prev === undefined) delete process.env.VANT_UNIVERSE_SEED;
            else process.env.VANT_UNIVERSE_SEED = prev;
        }
    });

    test('seeds: invalid region refused (path-segment hygiene at the seed boundary)', () => {
        assert.throws(() => new MeshTree().seedScope('../evil'), /invalid region/);
        assert.throws(() => new MeshTree().seedScope(''), /invalid region/);
    });

    test('seeds: MeshTree.cellAddress === spine PRF for the same space (one chain, no adapters)', () => {
        const universe = 'parity-universe';
        const mt = new MeshTree({ universe });
        const spine = new AddressingSpine({ universe });
        assert.strictEqual(mt.cellAddress('r1', 7), spine.cellAddress('/mesh/r1', 7));
        assert.strictEqual(mt.cellAddress('r1', 7), mt.cellAddress('r1', 7)); // stable
        assert.notStrictEqual(mt.cellAddress('r1', 7), mt.cellAddress('r1', 8));
    });

    // ==================== CANONICAL AUTHORITY ====================
    console.log('\n▓ CANONICAL AUTHORITY\n');

    test('authority: same writes in different key order → identical tree root (canonical encoder)', () => {
        // fixed clock: epochs are part of the stored delta, so they must match too
        const t1 = new MeshTree({ universe: 'u', now: () => 1000 });
        const t2 = new MeshTree({ universe: 'u', now: () => 1000 });
        t1.write('r', 'n', '/mesh/r/n/state', { beta: 2, alpha: 1 });
        t2.write('r', 'n', '/mesh/r/n/state', { alpha: 1, beta: 2 });
        assert.strictEqual(t1.tree.rootHash(), t2.tree.rootHash(),
            'JSON key order must not change the authority hash');
    });

    test('authority: deterministic winner + recorded loser still hold (regression)', () => {
        const mt = new MeshTree({ universe: 'u', now: () => 1000 });
        mt.write('r', 'a', '/mesh/r/n/x', { v: 1 });
        const res = mt.write('r', 'b', '/mesh/r/n/x', { v: 2 }); // same epoch → hash tiebreak
        const rejected = mt.rejectedWrites();
        assert.ok(res.accepted === true || rejected.length === 1, 'winner-or-recorded-loser');
        assert.ok(rejected.length <= 1);
    });

    // ==================== STATE-STORE → TREE (opt-in tier) ====================
    console.log('\n▓ STATE-STORE → TREE\n');

    const PIN_FILE = 'state/pin-wiring.json';
    const cleanup = () => { try { stateStore.clear(PIN_FILE); } catch (e) { /* best effort */ } };

    test('tree tier: toTree/fromTree roundtrip (state keys only, metadata excluded)', () => {
        const data = { peers: { a: 1 }, config: { x: 'y' }, kind: 'vant-protocol-state', module: 'pin', savedAt: 42 };
        const tree = stateStore.toTree('pin', data);
        const back = stateStore.fromTree('pin', tree);
        assert.deepStrictEqual(back, { peers: { a: 1 }, config: { x: 'y' } }, 'metadata must not ride the tree');
        assert.strictEqual(tree.paths().join(','), '/pin/config,/pin/peers');
    });

    test('tree tier: same payload in fresh trees → identical root hash', () => {
        const data = { a: [1, 2, 3], b: { nested: true } };
        const t1 = stateStore.toTree('mod', data);
        const t2 = stateStore.toTree('mod', { b: { nested: true }, a: [1, 2, 3] });
        assert.strictEqual(t1.rootHash(), t2.rootHash());
    });

    test('tree tier: persist({tree}) mirrors state, event + audit carry the root hash', async () => {
        const fired = [];
        const onSaved = (d) => fired.push(d);
        events.on('state:saved', onSaved);
        try {
            const tree = new stateStore.StateTree();
            const res = stateStore.persist({
                moduleName: 'pin-wiring', stateFile: PIN_FILE,
                data: { hits: 3 }, tree
            });
            assert.strictEqual(res, true);
            assert.ok(tree.has('/pin-wiring/hits'), 'tree mirrored');
            const saved = fired.find(d => d.rootHash);
            assert.ok(saved && saved.rootHash === tree.rootHash(), 'state:saved carries rootHash');
        } finally {
            events.off('state:saved', onSaved);
            cleanup();
        }
    });

    test('tree tier: treeFor reads the disk state back into a tree (typed presence)', async () => {
        cleanup();
        const tree = new stateStore.StateTree();
        stateStore.persist({ moduleName: 'pin-wiring', stateFile: PIN_FILE, data: { n: 9 }, tree });
        const disk = stateStore.treeFor(PIN_FILE);
        assert.strictEqual(disk.state, 'PRESENT');
        assert.strictEqual(disk.rootHash, tree.rootHash(), 'disk view matches the in-memory mirror');
        cleanup();
    });

    test('tree tier: treeFor typed ABSENT for a missing file (not a fake empty tree)', () => {
        const disk = stateStore.treeFor('state/pin-never-was.json');
        assert.strictEqual(disk.state, 'ABSENT');
        assert.strictEqual(disk.tree, undefined);
    });

    test('tree tier: hydrate({tree}) populates the caller tree and returns the root hash', async () => {
        cleanup();
        stateStore.persist({ moduleName: 'pin-wiring', stateFile: PIN_FILE, data: { n: 11 } });
        const tree = new stateStore.StateTree();
        const res = stateStore.hydrate({
            moduleName: 'pin-wiring', stateFile: PIN_FILE,
            apply: () => {}, tree
        });
        assert.strictEqual(res.applied, true);
        assert.ok(res.rootHash && res.rootHash === tree.rootHash());
        assert.strictEqual(stateStore.fromTree('pin-wiring', tree).n, 11);
        cleanup();
    });

    // ==================== MESH-STATUS → MESHTREE ====================
    console.log('\n▓ MESH-STATUS → MESHTREE\n');

    const meshStatus = require('../lib/mesh-status');

    test('mesh-status: report carries the mesh section (seed scope, TTL, peers)', () => {
        const { report } = meshStatus.status();
        assert.ok(report.mesh, 'mesh section present');
        if (report.mesh.error) throw new Error('mesh section degraded: ' + report.mesh.error);
        assert.ok(report.mesh.seedScope && report.mesh.seedScope.seedHex.length === 64, 'seed scope hex');
        assert.strictEqual(report.mesh.seedScope.scopePath, 'mesh:local');
        assert.ok(report.mesh.presenceTtlMs > 0);
        assert.ok(Array.isArray(report.mesh.peers));
    });

    test('mesh-status: mesh seed scope is a pure function (report twice, same hex)', () => {
        const a = meshStatus.status().report.mesh.seedScope.seedHex;
        const b = meshStatus.status().report.mesh.seedScope.seedHex;
        assert.strictEqual(a, b, 'status probes must not perturb the derivation');
    });

    test('mesh-status: seed scope tracks VANT_UNIVERSE_SEED (the report proves the env flows)', () => {
        const prev = process.env.VANT_UNIVERSE_SEED;
        try {
            const base = meshStatus.status().report.mesh.seedScope.seedHex;
            process.env.VANT_UNIVERSE_SEED = 'report-universe';
            const envd = meshStatus.status().report.mesh.seedScope.seedHex;
            assert.notStrictEqual(base, envd);
        } finally {
            if (prev === undefined) delete process.env.VANT_UNIVERSE_SEED;
            else process.env.VANT_UNIVERSE_SEED = prev;
        }
    });

    test('mesh-status: JSON roundtrip stays intact with the new section', () => {
        const { report } = meshStatus.status();
        const again = JSON.parse(JSON.stringify(report));
        assert.strictEqual(again.mesh.count, report.mesh.count);
    });

    test('mesh-status: renderReport prints the mesh line even when degraded', () => {
        const text = meshStatus.renderReport({ ...meshStatus.status().report, mesh: { error: 'poisoned leg' } });
        const line = text.split('\n').find(l => l.startsWith('mesh')) || '';
        assert.ok(/\(error: poisoned leg\)/.test(line), 'error IS the status: ' + line);
        assert.ok(/mesh\s+\(unavailable\)/.test(line), 'degraded section still renders its label: ' + line);
    });

    console.log('\n  Consumer-wiring pins: ' + passed + ' passed, ' + failed + ' failed');
    if (failed > 0) process.exit(1);
}

main().then(() => process.exit(0)).catch((e) => {
    console.error('UNEXPECTED:', (e && e.stack) || e);
    process.exit(1);
});
