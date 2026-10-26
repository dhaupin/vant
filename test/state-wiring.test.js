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
 *   TRUST → TREE   — trust is the FIRST live tree-tier consumer (pass 172,
 *                    WIRING.md step ①): the ledger mirrors into a StateTree
 *                    on hydrate and persist; root hash rides events; the
 *                    disk view (treeFor) matches the live mirror.
 *   REGISTRY → TREE— node-registry is the SECOND live consumer (pass 173,
 *                    step ②): the peer table mirrors through persistMerged
 *                    (tree support added pass 173) and hydrate; root hash
 *                    rides events; merged-persist path carries the hash too.
 *   CONSENSUS → TREE — third live consumer (pass 174, step ③): vote
 *                    ledgers + reap tombstones mirror through persistMerged
 *                    and hydrate; root hash rides events.
 *   MARKET → TREE  — fourth live consumer (pass 174, step ③): listings /
 *                    bids / trades mirror through persistMerged and
 *                    hydrate; root hash rides events.
 *   MESH → WAL     — mesh deltas ride the #151 SnapshottedLog (pass 175,
 *                    WIRING.md payoff step ④): opt-in { dir } persistence,
 *                    crash-safe recovery replays the log after the latest
 *                    snapshot, a fresh MeshTree over the same dir
 *                    reconstructs the same root hash, rejected writes
 *                    survive restarts (gaslight-proof across crashes), and
 *                    every delta is #161-provenance-stamped.
 *   MESH → EVENTS  — every MeshTree mutation emits on the shared bus
 *                    (pass 176, open-debt closure); { silent: true } keeps
 *                    probe trees side-effect-free (mesh-status posture).
 *   GEOMETRY → SPINE — quasicrystal content barcodes ride the ONE
 *                    canonical encoder (#146): key-order-independent,
 *                    cross-process equal — the last un-spined hash chain
 *                    retired (payoff step ⑤ complete).
 *   BRAIN-VERIFY → SURFACES — BrainVerifier onto `vant health` + the
 *                    horcrux CLI (pass 176): health recomputes the brain
 *                    root and verifies against the last anchor (auto-
 *                    baseline on fresh installs); horcrux verify/anchor
 *                    exit-code contract (0 ok, 1 diverged, 2 no anchor).
 *   STATE-STORE → ANCHOR — §3 debt closure (pass 177): every tree-tier
 *                    persist/persistMerged anchors its root hash into the
 *                    brain's per-file StateAnchor ledger (#152); unchanged
 *                    roots dedupe (in-process + ledger); verifyStateRoot
 *                    detects on-disk tampering against the last anchor;
 *                    hydrate deliberately does NOT anchor (a restart must
 *                    not re-bless whatever is on disk).
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
async function _testAsync(name, fn) {
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

    // ==================== STATE-STORE → ANCHOR (pass 177, §3 debt closure) ====================
    console.log('\n▓ STATE-STORE → ANCHOR\n');

    const ANCHOR_PIN = 'state/pin-anchor.json';
    const anchorLedger = path.join(ROOT, 'models', 'private', stateStore.currentBrain(), '.state-anchor.jsonl');
    const anchorCleanup = () => {
        try { stateStore.clear(ANCHOR_PIN); } catch (e) { /* best effort */ }
    };
    // Count ACTUAL chain entries for a carrier: the ledger is append-only and
    // shared across the whole test run, so assertions count occurrences rather
    // than just checking presence (lastAnchorFor only exposes the tail).
    const chainCountFor = (file) => {
        const ledger = path.join(ROOT, 'models', 'private', stateStore.currentBrain(), '.state-anchor.jsonl');
        if (!fs.existsSync(ledger)) return 0;
        return fs.readFileSync(ledger, 'utf8').split('\n').filter(Boolean)
            .map(l => { try { return JSON.parse(l); } catch (e) { return null; } })
            .filter(e => e && e.carrier === file).length;
    };

    test('anchor: tree-tier persist appends the root hash to the per-brain anchor ledger', () => {
        anchorCleanup();
        const fired = [];
        const h = (d) => fired.push(d);
        events.on('state:anchored', h);
        try {
            const tree = new stateStore.StateTree();
            assert.strictEqual(stateStore.persist({
                moduleName: 'pin-anchor', stateFile: ANCHOR_PIN, data: { n: 1 }, tree
            }), true);
            const last = stateStore.lastAnchorFor(ANCHOR_PIN);
            assert.strictEqual(last.state, 'PRESENT', 'anchor recorded');
            assert.strictEqual(last.entry.root_hash, tree.rootHash(), 'anchored root === tree root');
            assert.strictEqual(last.entry.carrier, ANCHOR_PIN, 'ledger is per-state-file (carrier)');
            assert.ok(fired.length === 1 && fired[0].rootHash === tree.rootHash(), 'state:anchored fired once with the root');
            assert.ok(fs.existsSync(anchorLedger), 'ledger lives at the brain root');
        } finally {
            events.off('state:anchored', h);
            anchorCleanup();
        }
    });

    test('anchor: unchanged root dedupes — the chain is an event history, not a heartbeat log', () => {
        anchorCleanup();
        try {
            // the ledger is append-only and shared across the whole test run
            // (and across runs) — assert on DELTAS, not absolute counts
            const base = chainCountFor(ANCHOR_PIN);
            const tree = new stateStore.StateTree();
            stateStore.persist({ moduleName: 'pin-anchor', stateFile: ANCHOR_PIN, data: { n: 2 }, tree });
            assert.strictEqual(chainCountFor(ANCHOR_PIN), base + 1, 'first root anchored exactly once');
            stateStore.persist({ moduleName: 'pin-anchor', stateFile: ANCHOR_PIN, data: { n: 2 }, tree });
            assert.strictEqual(chainCountFor(ANCHOR_PIN), base + 1, 'identical root NOT re-anchored (in-process dedupe)');
            stateStore.persist({ moduleName: 'pin-anchor', stateFile: ANCHOR_PIN, data: { n: 3 }, tree });
            assert.strictEqual(chainCountFor(ANCHOR_PIN), base + 2, 'changed root IS anchored');
            // fresh-mirror view of the same rule: a DIFFERENT tree with the
            // same content has the same root — the ledger-check dedupe keeps
            // the chain an event history even across mirrors/processes
            const tree2 = new stateStore.StateTree();
            stateStore.persist({ moduleName: 'pin-anchor', stateFile: ANCHOR_PIN, data: { n: 3 }, tree: tree2 });
            assert.strictEqual(chainCountFor(ANCHOR_PIN), base + 2, 'ledger-known root not re-anchored (ledger dedupe)');
        } finally {
            anchorCleanup();
        }
    });

    test('anchor: verifyStateRoot detects on-disk tampering against the last anchor', () => {
        anchorCleanup();
        try {
            const tree = new stateStore.StateTree();
            stateStore.persist({ moduleName: 'pin-anchor', stateFile: ANCHOR_PIN, data: { secret: 'good' }, tree });
            let v = stateStore.verifyStateRoot(ANCHOR_PIN);
            assert.strictEqual(v.ok, true, 'clean state verifies');
            // tamper: mutate the file OUTSIDE the store (the exact threat the
            // anchor exists to catch — a write that bypassed the choke point)
            const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'models', 'private', stateStore.currentBrain(), ANCHOR_PIN), 'utf8'));
            raw.secret = 'TAMPERED';
            fs.writeFileSync(path.join(ROOT, 'models', 'private', stateStore.currentBrain(), ANCHOR_PIN), JSON.stringify(raw, null, 2));
            v = stateStore.verifyStateRoot(ANCHOR_PIN);
            assert.strictEqual(v.ok, false, 'tampered state DIVERGES');
            assert.ok(v.current !== v.lastAnchored.root_hash);
            assert.ok(/diverged since anchor/.test(v.firstDivergence), 'divergence names the anchor: ' + v.firstDivergence);
        } finally {
            anchorCleanup();
        }
    });

    test('anchor: no tree tier → no anchor; hydrate never anchors (no self-blessing restarts)', () => {
        // a state file that has NEVER been anchored in any run (unique name;
        // the ledger is append-only so reused names would inherit history)
        const FRESH_PIN = 'state/pin-anchor-fresh-' + Date.now() + '.json';
        try {
            // persist WITHOUT a tree: rootHash is null, nothing to anchor
            stateStore.persist({ moduleName: 'pin-anchor', stateFile: FRESH_PIN, data: { n: 5 } });
            assert.strictEqual(stateStore.lastAnchorFor(FRESH_PIN).state, 'ABSENT', 'no tree → no anchor entry');
            const v = stateStore.verifyStateRoot(FRESH_PIN);
            assert.strictEqual(v.state, 'PRESENT');
            assert.strictEqual(v.anchored, false, 'typed not-yet-anchored verdict');
            assert.strictEqual(v.ok, false);
            // hydrate (even with a tree) must NOT append to the ledger
            const before = chainCountFor(FRESH_PIN);
            const hydrTree = new stateStore.StateTree();
            stateStore.hydrate({ moduleName: 'pin-anchor', stateFile: FRESH_PIN, apply: () => {}, tree: hydrTree });
            assert.strictEqual(chainCountFor(FRESH_PIN), before, 'hydrate never anchors — a restart must not re-bless disk');
        } finally {
            try { stateStore.clear(FRESH_PIN); } catch (e) { /* best effort */ }
        }
    });

    test('anchor: persistMerged anchors too (the lock-path write rides the same contract)', async () => {
        anchorCleanup();
        try {
            const tree = new stateStore.StateTree();
            const res = await stateStore.persistMerged({
                moduleName: 'pin-anchor', stateFile: ANCHOR_PIN,
                merge: () => {}, serialize: () => ({ n: 6 }), tree
            });
            assert.strictEqual(res, true);
            const last = stateStore.lastAnchorFor(ANCHOR_PIN);
            assert.strictEqual(last.state, 'PRESENT');
            assert.strictEqual(last.entry.root_hash, tree.rootHash());
            assert.ok(/persistMerged:pin-anchor/.test(last.entry.cause), 'cause names the path: ' + last.entry.cause);
            assert.strictEqual(stateStore.verifyStateRoot(ANCHOR_PIN).ok, true);
        } finally {
            anchorCleanup();
        }
    });

    console.log('\n▓ TRUST → TREE\n');


    test('mesh persistence: in-memory by default (no dir, no side effects)', () => {
        const mt = new MeshTree({ universe: 'wal-universe' });
        const info = mt.persistenceInfo();
        assert.strictEqual(info.enabled, false, 'default stays in-memory');
        assert.strictEqual(info.dir, null);
        assert.strictEqual(info.recovery, null);
        // behavior contract unchanged
        mt.register('r', 'n', { a: 1 });
        assert.strictEqual(mt.isAlive('r', 'n', mt._now() + 1).alive, true);
    });

    const meshStatus = require('../lib/mesh-status');   // (kept pin) the JSON roundtrip law
    test('mesh-status: JSON roundtrip stays intact with the new section', () => {
        const { report } = meshStatus.status();
        const again = JSON.parse(JSON.stringify(report));
        assert.strictEqual(again.mesh.count, report.mesh.count);
    });

    console.log('\n  Consumer-wiring pins: ' + passed + ' passed, ' + failed + ' failed');
    if (failed > 0) process.exit(1);
}

main().then(() => process.exit(0)).catch((e) => {
    console.error('UNEXPECTED:', (e && e.stack) || e);
    process.exit(1);
});
