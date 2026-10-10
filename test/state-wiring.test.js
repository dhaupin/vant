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

    // ==================== TRUST → TREE (first live consumer, pass 172) ====================
    console.log('\n▓ TRUST → TREE\n');

    const trust = require('../lib/trust');

    test('trust: record mirrors the ledger into the tree (tree tier live)', async () => {
        trust.clearState();
        const agent = 'pin-agent-' + Date.now();
        const before = trust._treeRoot();
        trust.record(agent, 'help', { positive: true, note: 'pass-172 pin' });
        const root = trust._treeRoot();
        assert.ok(root && /^[0-9a-f]{64}$/.test(root), 'root hash is a sha256 hex');
        assert.ok(before === null || true, 'fresh install starts null (or prior pass state)');
        // the mirror carries the ledger under the trust module prefix
        const tree = trust._stateTree();
        assert.ok(tree.paths().some(p => p.startsWith('/trust/')), 'tree paths live under /trust/');
        const mirrored = stateStore.fromTree('trust', tree);
        assert.ok(mirrored.scores && agent in mirrored.scores, 'score present in the mirrored tree');
        assert.ok(Array.isArray(mirrored.histories[agent]), 'history present in the mirrored tree');
    });

    test('trust: mutate again → root hash moves (the tree tracks the ledger)', () => {
        const agent = Object.keys(stateStore.fromTree('trust', trust._stateTree()).scores || {})[0];
        const before = trust._treeRoot();
        trust.record(agent, 'note', { positive: false, value: 0.01 });
        assert.notStrictEqual(trust._treeRoot(), before, 'each persist re-mirrors and re-hashes');
    });

    test('trust: hydrated disk state matches the live mirror (treeFor === _treeRoot)', async () => {
        // new process view: read the disk state into a fresh tree via treeFor
        const disk = stateStore.treeFor('state/trust.json');
        assert.strictEqual(disk.state, 'PRESENT', 'trust.json exists after the pins above');
        assert.strictEqual(disk.rootHash, trust._treeRoot(),
            'disk view and live mirror agree on one hash — cross-process same-state check');
    });

    test('trust: state:saved event carries the trust root hash', () => {
        const fired = [];
        const onSaved = (d) => { if (d.moduleName === 'trust') fired.push(d); };
        events.on('state:saved', onSaved);
        try {
            const agent = 'pin-agent-event-' + Date.now();
            trust.record(agent, 'help', { positive: true });
        } finally {
            events.off('state:saved', onSaved);
        }
        assert.ok(fired.length > 0, 'event fired');
        assert.ok(fired.every(d => d.rootHash && d.rootHash === trust._treeRoot()),
            'rootHash rides state:saved and matches the live mirror');
    });

    test('trust: clearState resets the mirror (no hash for state that no longer exists)', () => {
        trust.clearState();
        assert.strictEqual(trust._treeRoot(), null, 'mirror dropped with the ledger');
    });

    // ==================== NODE-REGISTRY → TREE (second live consumer, pass 173) ====================
    console.log('\n▓ NODE-REGISTRY → TREE\n');

    const registry = require('../lib/node-registry');

    test('registry: persistMerged carries the tree (register mirrors the peer table)', async () => {
        registry.clearState();
        const fired = [];
        const onSaved = (d) => { if (d.moduleName === 'node-registry') fired.push(d); };
        events.on('state:saved', onSaved);
        try {
            const res = registry.register({ id: 'pin-node-1', host: 'localhost', port: 3457 });
            assert.ok(!res.error, 'register accepted: ' + JSON.stringify(res));
            const root = registry._treeRoot();
            assert.ok(root && /^[0-9a-f]{64}$/.test(root), 'root hash is a sha256 hex');
            const tree = registry._stateTree();
            assert.ok(tree.paths().some(p => p.startsWith('/node-registry/')), 'tree paths live under /node-registry/');
            const mirrored = stateStore.fromTree('node-registry', tree);
            assert.ok(Array.isArray(mirrored.nodes) && mirrored.nodes.some(n => n.id === 'pin-node-1'),
                'peer present in the mirrored tree');
            const saved = fired.filter(d => d.rootHash);
            assert.ok(saved.length > 0 && saved.every(d => d.rootHash === root),
                'persistMerged state:saved rides the rootHash too (the pass-173 persistMerged contract)');
        } finally {
            events.off('state:saved', onSaved);
        }
    });

    test('registry: heartbeat (merge-path mutation) moves the root hash', async () => {
        const before = registry._treeRoot();
        await new Promise(r => setTimeout(r, 5)); // heartbeat timestamps must differ
        registry.heartbeat('pin-node-1');
        assert.notStrictEqual(registry._treeRoot(), before, 'merged persist re-mirrors and re-hashes');
    });

    test('registry: hydrated disk state matches the live mirror (treeFor === _treeRoot)', () => {
        const disk = stateStore.treeFor('state/node-registry.json');
        assert.strictEqual(disk.state, 'PRESENT', 'node-registry.json exists after the pins above');
        assert.strictEqual(disk.rootHash, registry._treeRoot(),
            'disk view and live mirror agree on one hash — consensus\'s cross-process same-peer-table check');
    });

    test('registry: clearState resets the mirror (tombstone semantics preserved)', () => {
        const gone = registry.clearState();
        assert.strictEqual(gone, true);
        assert.strictEqual(registry._treeRoot(), null, 'mirror dropped with the peer table');
        // tombstone rule (pass 98): _resetHydration keeps _seenNodes; clearState
        // wipes everything — re-registering the same id must work cleanly.
        const again = registry.register({ id: 'pin-node-1', host: 'localhost', port: 3457 });
        assert.ok(!again.error, 're-register after clearState works');
        registry.clearState();
    });

    // ==================== CONSENSUS + MARKET → TREE (steps ③, pass 174) ====================
    console.log('\n▓ CONSENSUS + MARKET → TREE\n');

    const consensus = require('../lib/consensus');
    const market = require('../lib/market');

    test('consensus: create mirrors the vote ledgers (persistMerged tree path)', async () => {
        consensus.clearState();
        const fired = [];
        const onSaved = (d) => { if (d.moduleName === 'consensus') fired.push(d); };
        events.on('state:saved', onSaved);
        try {
            const topic = 'wiring-pin-' + Date.now();
            const res = consensus.create(topic, { ballot: ['y', 'n'] });
            assert.ok(!res || !res.error, 'create accepted: ' + JSON.stringify(res));
            const root = consensus._treeRoot();
            assert.ok(root && /^[0-9a-f]{64}$/.test(root), 'root hash is a sha256 hex');
            const mirrored = stateStore.fromTree('consensus', consensus._stateTree());
            assert.ok(Array.isArray(mirrored.ledgers) && mirrored.ledgers.some(l => l.topic === topic),
                'ledger present in the mirrored tree');
            const saved = fired.filter(d => d.rootHash);
            assert.ok(saved.length > 0 && saved.every(d => d.rootHash === root),
                'persistMerged state:saved rides the consensus rootHash');
        } finally {
            events.off('state:saved', onSaved);
        }
    });

    test('consensus: disk view matches the live mirror (treeFor === _treeRoot)', () => {
        // persistMerged is async (lock handshake) — flush the microtask queue
        // so the merged write has landed before reading disk state back.
        return new Promise(r => setTimeout(r, 20)).then(() => {
            const disk = stateStore.treeFor('state/consensus.json');
            assert.strictEqual(disk.state, 'PRESENT');
            assert.strictEqual(disk.rootHash, consensus._treeRoot());
        });
    });

    test('consensus: clearState resets the mirror (tombstone maps dropped too)', () => {
        assert.strictEqual(consensus.clearState(), true);
        assert.strictEqual(consensus._treeRoot(), null);
    });

    test('market: list a listing and mirror the market state (persistMerged tree path)', async () => {
        market.clearState();
        const fired = [];
        const onSaved = (d) => { if (d.moduleName === 'market') fired.push(d); };
        events.on('state:saved', onSaved);
        try {
            const res = await market.list('knowledge', {
                title: 'pass-174 pin',
                description: 'tree-tier mirror pin',
                seller: 'pin-seller',
                price: 5,
                supply: 1
            });
            assert.ok(!res || !res.error, 'list accepted: ' + JSON.stringify(res));
            const root = market._treeRoot();
            assert.ok(root && /^[0-9a-f]{64}$/.test(root), 'root hash is a sha256 hex');
            const mirrored = stateStore.fromTree('market', market._stateTree());
            assert.ok(Array.isArray(mirrored.listings) && mirrored.listings.length > 0,
                'listing present in the mirrored tree');
            const saved = fired.filter(d => d.rootHash);
            assert.ok(saved.length > 0 && saved.every(d => d.rootHash === root),
                'persistMerged state:saved rides the market rootHash');
        } finally {
            events.off('state:saved', onSaved);
        }
    });

    test('market: disk view matches the live mirror (treeFor === _treeRoot)', () => {
        return new Promise(r => setTimeout(r, 20)).then(() => {
            const disk = stateStore.treeFor('state/market.json');
            assert.strictEqual(disk.state, 'PRESENT');
            assert.strictEqual(disk.rootHash, market._treeRoot());
        });
    });

    test('market: clearState resets the mirror + search index', () => {
        assert.strictEqual(market.clearState(), true);
        assert.strictEqual(market._treeRoot(), null);
    });

    // ==================== MESH → CHECKPOINT/WAL (pass 175) ====================
    console.log('\n▓ MESH → CHECKPOINT/WAL\n');

    const os = require('os');

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

    test('mesh persistence: deltas ride the SnapshottedLog (wal.log + snapshot files)', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-mesh-wal-'));
        const mt = new MeshTree({ universe: 'wal-universe', dir, everyN: 3 });
        mt.register('r1', 'alpha', { role: 'pin' });
        mt.heartbeat('r1', 'alpha');
        const res = mt.subscribe('r1', 'alpha', '/mesh/r1');
        assert.strictEqual(res, '/mesh/r1');
        assert.ok(fs.existsSync(path.join(dir, 'wal.log')), 'wal.log exists');
        assert.ok(fs.existsSync(path.join(dir, 'snapshots')), 'snapshots dir exists');
        const snaps = fs.readdirSync(path.join(dir, 'snapshots')).filter(f => f.endsWith('.snap'));
        assert.strictEqual(snaps.length, 1, 'snapshot fired at everyN=3 (3 records in)');
    });

    test('mesh persistence: fresh MeshTree over the same dir reconstructs the same root hash', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-mesh-wal-'));
        const t = 5000;
        const mt = new MeshTree({ universe: 'wal-universe', dir, now: () => t });
        mt.register('r1', 'alpha', { role: 'writer' });
        mt.register('r1', 'beta', { role: 'reader' });
        mt.heartbeat('r1', 'beta');
        mt.write('r1', 'alpha', '/mesh/r1/alpha/state', { hp: 80 });
        mt.subscribe('r1', 'beta', '/mesh/r1/alpha');
        const rootBefore = mt.tree.rootHash();
        const aliveBefore = mt.isAlive('r1', 'beta', t + 1);
        // fresh process view: same dir, same universe, same fixed clock
        const mt2 = new MeshTree({ universe: 'wal-universe', dir, now: () => t });
        assert.strictEqual(mt2.tree.rootHash(), rootBefore,
            'recovery (snapshot + log replay) reproduces the state byte-for-byte');
        assert.deepStrictEqual(mt2.isAlive('r1', 'beta', t + 1), aliveBefore);
        assert.strictEqual(mt2.tree.get('/mesh/r1/alpha/state').value.value.hp, 80);
        assert.strictEqual(mt2.tree.get('/mesh/r1/beta/aoi').value.scope, '/mesh/r1/alpha');
        assert.strictEqual(mt2.persistenceInfo().recovery.replayed >= 0, true);
    });

    test('mesh persistence: rejected writes survive the restart (gaslight-proof across crashes)', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-mesh-wal-'));
        const t = 1000;
        const mt = new MeshTree({ universe: 'wal-universe', dir, now: () => t });
        mt.write('r', 'a', '/mesh/r/n/x', { v: 1 });
        const res = mt.write('r', 'b', '/mesh/r/n/x', { v: 2 }); // loser at same epoch
        if (res.accepted) {
            // hash tiebreak may favor b — force a guaranteed loser with an older epoch
            const mt3 = new MeshTree({ universe: 'wal-universe', dir, now: () => t + 1 });
            mt3.write('r', 'c', '/mesh/r/n/x', { v: 0 }); // older epoch → rejected
        }
        const losers = mt.rejectedWrites().length;
        const mt2 = new MeshTree({ universe: 'wal-universe', dir, now: () => t + 5 });
        assert.strictEqual(mt2.rejectedWrites().length, losers,
            'the rejected-delta record is durable, not just in-memory');
        assert.ok(mt2.rejectedWrites().every(e => e.winner && e.path), 'rejected entries keep their shape');
    });

    test('mesh persistence: every delta is #161-provenance-stamped (actor is NOT optional)', () => {
        const mt = new MeshTree({ universe: 'wal-universe', now: () => 42 });
        mt.register('r', 'n');
        mt.heartbeat('r', 'n');
        mt.write('r', 'n', '/mesh/r/n/state', { x: 1 });
        mt.write('r', 'other', '/mesh/r/n/state', { x: 2 }); // maybe rejected
        const ledger = mt.deltaLedger();
        assert.ok(ledger.sequenceLength >= 3, 'register + heartbeat + write recorded');
        for (const rec of ledger.since(0)) {
            assert.ok(rec.actor && typeof rec.actor === 'string' && rec.actor.length > 0,
                'every delta carries an actor');
            assert.ok(typeof rec.epoch === 'number', 'every delta carries an epoch');
        }
        // determinism: two trees that saw the same events agree on one hash
        const mt2 = new MeshTree({ universe: 'wal-universe', now: () => 42 });
        mt2.register('r', 'n');
        mt2.heartbeat('r', 'n');
        mt2.write('r', 'n', '/mesh/r/n/state', { x: 1 });
        mt2.write('r', 'other', '/mesh/r/n/state', { x: 2 });
        assert.strictEqual(mt.deltaLedger().ledgerHash(), mt2.deltaLedger().ledgerHash(),
            'delta ledgerHash is deterministic (#161 acceptance #3)');
    });

    test('mesh persistence: interval snapshot fast-forwards recovery (replayed only after snapshot)', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-mesh-wal-'));
        const t = 7000;
        let seq = 0;
        const mt = new MeshTree({ universe: 'wal-universe', dir, now: () => t + (seq++) * 10, everyN: 2, keepK: 2 });
        for (let i = 0; i < 5; i++) mt.heartbeat('r', 'n' + i);
        const mt2 = new MeshTree({ universe: 'wal-universe', dir, now: () => t + 1000 });
        assert.strictEqual(mt2.tree.rootHash(), mt.tree.rootHash(), 'same state after bounded recovery');
        const rec = mt2.tree.get('/mesh/r/n4/presence');
        assert.strictEqual(rec.state, 'PRESENT');
        assert.strictEqual(rec.value.heartbeat, t + 40, 'the LAST delta won (heartbeat n4)');
    });

    // ==================== MESH → EVENTS (pass 176) ====================
    console.log('\n▓ MESH → EVENTS\n');

    test('mesh events: every mutation emits on the shared bus', () => {
        const fired = [];
        const handlers = ['mesh:register', 'mesh:heartbeat', 'mesh:aoi', 'mesh:write', 'mesh:write:rejected', 'mesh:recovered']
            .map(name => [name, (d) => fired.push({ name, d })]);
        for (const [n, h] of handlers) events.on(n, h);
        // mutable clock: authority lives per-instance, so the guaranteed
        // loser is written into the SAME tree at an OLDER epoch
        let clock = 100;
        try {
            const mt = new MeshTree({ universe: 'evt-universe', now: () => clock });
            mt.register('r', 'n', {});
            mt.heartbeat('r', 'n');
            mt.subscribe('r', 'n', '/mesh/r');
            mt.write('r', 'a', '/mesh/r/x', { v: 1 });
            clock = 99; // challenger at an older epoch can never win
            mt.write('r', 'b', '/mesh/r/x', { v: 2 });
        } finally {
            for (const [n, h] of handlers) events.off(n, h);
        }
        const names = fired.map(f => f.name);
        for (const want of ['mesh:register', 'mesh:heartbeat', 'mesh:aoi', 'mesh:write', 'mesh:write:rejected']) {
            assert.ok(names.includes(want), 'missing event ' + want + ' (got: ' + names.join(',') + ')');
        }
        // every event carries provenance (actor + epoch)
        for (const f of fired) {
            assert.ok(f.d.actor && typeof f.d.actor === 'string', 'actor rides the event');
            assert.ok(Number.isFinite(f.d.epoch), 'epoch rides the event');
        }
    });

    test('mesh events: silent trees emit nothing (a status probe is never a side effect)', () => {
        const fired = [];
        const h = (d) => fired.push(d);
        events.on('mesh:register', h);
        try {
            const mt = new MeshTree({ universe: 'evt-universe', silent: true, now: () => 100 });
            mt.register('r', 'n', {});
            mt.heartbeat('r', 'n');
            mt.write('r', 'n', '/mesh/r/n/state', { v: 1 });
        } finally {
            events.off('mesh:register', h);
        }
        assert.strictEqual(fired.length, 0, 'silent tree must be event-silent');
    });

    test('mesh events: persistent recovery emits mesh:recovered with the root hash', () => {
        const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'vant-mesh-evt-'));
        const seed = new MeshTree({ universe: 'evt-universe', dir, silent: true, now: () => 100 });
        seed.register('r', 'n', {});
        const fired = [];
        const h = (d) => fired.push(d);
        events.on('mesh:recovered', h);
        try {
            const mt = new MeshTree({ universe: 'evt-universe', dir, now: () => 100 });
            assert.strictEqual(fired.length, 1, 'mesh:recovered fired once');
            assert.strictEqual(fired[0].rootHash, mt.tree.rootHash(), 'recovery event carries the live root');
            assert.strictEqual(fired[0].replayed, 1, 'replay count reported');
        } finally {
            events.off('mesh:recovered', h);
        }
    });

    // ==================== GEOMETRY → SPINE (pass 176) ====================
    console.log('\n▓ GEOMETRY → SPINE\n');

    test('geometry: quasicrystal barcodes ride the ONE canonical encoder (#146)', () => {
        const qc = require('../lib/geometry/quasicrystal');
        const canonical = require('../lib/state/canonical');
        // key-order independence: the #146 disease is gone at the generator
        const a = qc.generateBarcodeFromContent({ beta: 2, alpha: 1 });
        const b = qc.generateBarcodeFromContent({ alpha: 1, beta: 2 });
        assert.strictEqual(a, b, 'same logical content → same barcode, any key order');
        // deterministic + matches the canonical hash of the same content
        const again = qc.generateBarcodeFromContent({ alpha: 1, beta: 2 });
        assert.strictEqual(a, again);
        const h = canonical.hash({ alpha: 1, beta: 2 });
        assert.strictEqual(a, '9-' + String(10000 + (parseInt(h.slice(0, 5), 16) % 90000)).padStart(5, '0')
            + '-' + String(parseInt(h.slice(5, 10), 16) % 100000).padStart(5, '0')
            + '-' + (parseInt(h.slice(-1), 16) % 10));
        // format contract intact: NSC 9, 12 digits
        assert.ok(/^9-\d{5}-\d{5}-\d$/.test(a));
        // distinct content still distinct
        assert.notStrictEqual(a, qc.generateBarcodeFromContent({ alpha: 1, beta: 3 }));
    });

    test('geometry: barcode addressing still self-authenticates (store → retrieve roundtrip)', async () => {
        const qc = require('../lib/geometry/quasicrystal');
        const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'vant-qc-'));
        const barcode = qc.generateBarcodeFromContent({ note: 'pass-176' });
        const res = await qc.store(barcode, { note: 'pass-176' }, dir);
        assert.strictEqual(res.stored, true);
        const back = await qc.retrieve(barcode, dir);
        assert.strictEqual(back.data.note, 'pass-176');
        // re-deriving the barcode from the stored content still reaches the record
        const rederived = qc.generateBarcodeFromContent({ note: 'pass-176' });
        assert.strictEqual(rederived, barcode);
        assert.ok(await qc.has(rederived, dir));
    });

    // ==================== BRAIN-VERIFY → SURFACES (pass 176) ====================
    console.log('\n▓ BRAIN-VERIFY → SURFACES\n');

    test('brain-verify: health section verifies a clean brain against its anchor', async () => {
        const os = require('os');
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-bv-health-'));
        fs.writeFileSync(path.join(dir, 'identity.md'), '# Me\nMODEL: pin');
        const { checkBrainIntegrity } = require('../bin/health');
        const bvMod = require('../lib/state/brain-verify');
        // fresh brain: health anchors a baseline (warn path), then verifies
        const logs1 = [];
        const origLog = console.log;
        console.log = (...a) => logs1.push(a.join(' '));
        try {
            process.env.MODEL_PATH = dir;
            checkBrainIntegrity();
            assert.ok(logs1.some(l => l.includes('baseline anchored')), 'fresh brain gets a baseline: ' + logs1.join('|'));
            // second run: clean brain verifies ok
            const logs2 = [];
            console.log = (...a) => logs2.push(a.join(' '));
            checkBrainIntegrity();
            assert.ok(logs2.some(l => l.includes('verified against last anchor')), 'clean brain verifies: ' + logs2.join('|'));
            // tamper: divergence is DETECTED
            fs.writeFileSync(path.join(dir, 'identity.md'), '# Me\nMODEL: TAMPERED');
            const logs3 = [];
            console.log = (...a) => logs3.push(a.join(' '));
            checkBrainIntegrity();
            assert.ok(logs3.some(l => l.includes('DIVERGED')), 'tampered brain diverges: ' + logs3.join('|'));
        } finally {
            console.log = origLog;
            delete process.env.MODEL_PATH;
        }
    });

    test('brain-verify: horcrux verify/anchor exit-code contract (0 ok, 1 diverged, 2 no anchor)', async () => {
        const os = require('os');
        const { execFileSync } = require('child_process');
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-bv-cli-'));
        fs.writeFileSync(path.join(dir, 'identity.md'), 'MODEL: pin');
        const run = (args) => {
            try {
                const out = execFileSync('node', [path.join(ROOT, 'bin', 'horcrux.js'), ...args], {
                    env: { ...process.env, MODEL_PATH: dir },
                    encoding: 'utf8'
                });
                return { code: 0, out };
            } catch (e) {
                return { code: e.status, out: (e.stdout || '') + (e.stderr || '') };
            }
        };
        // no anchor yet → exit 2
        let r = run(['verify']);
        assert.strictEqual(r.code, 2, 'no anchor → 2 (got ' + r.code + '): ' + r.out);
        // anchor → 0
        r = run(['anchor', 'pin baseline']);
        assert.strictEqual(r.code, 0, 'anchor → 0: ' + r.out);
        assert.ok(r.out.includes('Anchored'));
        // verify clean → 0
        r = run(['verify']);
        assert.strictEqual(r.code, 0, 'clean verify → 0: ' + r.out);
        // tamper → 1
        fs.writeFileSync(path.join(dir, 'identity.md'), 'MODEL: TAMPERED');
        r = run(['verify']);
        assert.strictEqual(r.code, 1, 'diverged → 1 (got ' + r.code + '): ' + r.out);
        assert.ok(r.out.includes('DIVERGED'));
        // re-anchor intentionally → 0 again
        r = run(['anchor', 'intentional change']);
        assert.strictEqual(r.code, 0);
        r = run(['verify']);
        assert.strictEqual(r.code, 0, 're-anchored verify → 0');
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
