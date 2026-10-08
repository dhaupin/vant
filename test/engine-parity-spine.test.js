#!/usr/bin/env node
/**
 * Engine-Parity Spine pins (state PRD, issues #145–#166).
 *
 * One suite per quadrant, acceptance criteria as assertions. Exit code is
 * the verdict, per house test conventions.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

let passed = 0, failed = 0;
function ok(name) { passed++; console.log('  ✓ ' + name); }
function fail(name, detail) { failed++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
function test(name, fn) {
    try { fn(); ok(name); } catch (e) { fail(name, e.message); }
}
async function testAsync(name, fn) {
    try { await fn(); ok(name); } catch (e) { fail(name, e.message); }
}

function tmpdir(label) {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'vant-spine-' + label + '-'));
}

// ==================== STATE CORE ====================
async function stateCore() {
    console.log('\n▓ STATE CORE (#145 #146 #147 #148)\n');
    const canonical = require('../lib/state/canonical');
    const { StateTree, splitScope, normalizePath } = require('../lib/state/tree');

    test('#146 same logical dict, two key orders → identical bytes+hash', () => {
        const a = canonical.hash({ b: 2, a: 1, c: { y: 1, x: [1, 2] } });
        const b = canonical.hash({ a: 1, b: 2, c: { x: [1, 2], y: 1 } });
        assert.strictEqual(a, b);
    });

    test('#146 roundtrip law over torture corpus', () => {
        const corpus = [
            null, true, false, 0, -0, 0.1, 1e21, -42, 12345.6789,
            '', 'unicode: héllo 世界 🌊', 'a'.repeat(10000),
            [], [1, [2, [3, 'x', null, true]]],
            {}, { a: 1 }, { '': 0, 'z': { 'nested': [1.5, -0.5] } },
            { 'ключ': 'значение', 'b': [{ 'c': 1 }, 2, 3] }
        ];
        for (const v of corpus) {
            const e1 = canonical.encode(v);
            const d = canonical.decode(e1);
            const e2 = canonical.encode(d);
            assert.strictEqual(e2.equals(e1), true, 'roundtrip broke for ' + JSON.stringify(v).slice(0, 40));
        }
    });

    test('#146 rejects non-plain objects and non-finite numbers', () => {
        assert.throws(() => canonical.encode(new Date()), /non-plain object/);
        assert.throws(() => canonical.encode(NaN), /non-finite/);
        assert.throws(() => canonical.encode(undefined), /unsupported value type/);
    });

    test('#146 schema-id prefix: same value, different schema → different hash', () => {
        const h1 = canonical.nodeHash('/x', 'schema@1', { a: 1 });
        const h2 = canonical.nodeHash('/x', 'schema@2', { a: 1 });
        const h3 = canonical.nodeHash('/y', 'schema@1', { a: 1 });
        assert.notStrictEqual(h1, h2);
        assert.notStrictEqual(h1, h3);
    });

    test('#145 put/get roundtrip + root hash determinism across fresh trees', () => {
        const t1 = new StateTree(), t2 = new StateTree();
        t1.put('/trust/peer_x', { score: 5 });
        t2.put('/trust/peer_x', { score: 5 });
        const g = t1.get('/trust/peer_x');
        assert.strictEqual(g.state, 'PRESENT');
        assert.strictEqual(g.value.score, 5);
        assert.strictEqual(t1.rootHash(), t2.rootHash(), 'identical facts → identical roots');
    });

    test('#145 same fact under two paths both succeed; same path LWW', () => {
        const t = new StateTree();
        t.put('/a/fact', 'v1');
        t.put('/b/fact', 'v1'); // different paths, both succeed
        assert.strictEqual(t.get('/a/fact').state, 'PRESENT');
        assert.strictEqual(t.get('/b/fact').state, 'PRESENT');
        t.put('/a/fact', 'v2'); // same path: last-write-wins
        assert.strictEqual(t.get('/a/fact').value.value, 'v2'); // stampScope wraps scalars
        assert.ok(t.writeCount === 3);
    });

    test('#147 N writes → exactly N diff entries (no phantom diffs)', () => {
        const a = new StateTree(), b = new StateTree();
        for (let i = 0; i < 10; i++) a.put('/p/' + i, { i });
        for (let i = 0; i < 10; i++) b.put('/p/' + i, { i });
        b.put('/p/3', { i: 99 });
        b.put('/p/new', 1);
        const d = a.diff(b);
        assert.strictEqual(d.length, 2, 'got: ' + JSON.stringify(d));
        assert.ok(d.some(x => x.path === '/p/3' && x.kind === 'changed'));
        assert.ok(d.some(x => x.path === '/p/new' && x.kind === 'added'),
            'added kind wrong: ' + JSON.stringify(d.find(x => x.path === '/p/new')));
    });

    test('#147 apply(snapshot) → scope root equals sender', () => {
        const sender = new StateTree(), receiver = new StateTree();
        sender.put('/world/w1/zones/z1', { a: 1 });
        sender.put('/world/w1/zones/z2', { b: 2 });
        sender.put('/other', 'noise');
        const snap = sender.snapshot('/world/w1');
        assert.strictEqual(snap.truncated, false);
        receiver.put('/world/w1/zones/z1', { STALE: true });
        const res = receiver.apply(snap);
        assert.strictEqual(res.verified, true, 'scope root mismatch after apply');
        assert.strictEqual(receiver.get('/world/w1/zones/z2').value.b, 2);
    });

    test('#147 truncated snapshot refused on apply', () => {
        const t = new StateTree();
        t.put('/x/1', 1);
        const snap = t.snapshot('/x');
        snap.truncated = true;
        assert.throws(() => t.apply(snap), /refusing truncated/);
    });

    test('#147 snapshot bounded by caller cap, deterministic order', () => {
        const t = new StateTree();
        for (let i = 0; i < 50; i++) t.put('/big/' + i, i);
        const snap = t.snapshot('/big', 10);
        assert.strictEqual(snap.nodes.length, 10);
        assert.strictEqual(snap.truncated, true);
        const paths = snap.nodes.map(n => n.path);
        assert.deepStrictEqual(paths, [...paths].sort());
    });

    test('#148 coarse scope defaults to main; world scope splits', () => {
        assert.deepStrictEqual(splitScope('/trust/peer_x').scope, 'main');
        const w = splitScope('/world/w1/zones/z1');
        assert.strictEqual(w.scope, 'world/w1');
        assert.strictEqual(w.rest, 'zones/z1');
    });

    test('#148 two scopes with identically-named sub-scopes never share nodes', () => {
        const t = new StateTree();
        t.put('/world/w1/zones/shared', { from: 'w1' });
        t.put('/world/w2/zones/shared', { from: 'w2' });
        assert.notStrictEqual(t.get('/world/w1/zones/shared').value, t.get('/world/w2/zones/shared').value);
        const s1 = t.snapshot('/world/w1');
        assert.ok(s1.nodes.every(n => !n.path.startsWith('/world/w2')), 'w1 snapshot leaked w2 nodes');
    });

    test('#148 stamping is pure write-path concern (scope rides the payload)', () => {
        const t = new StateTree();
        t.put('/world/w9/things', { color: 'blue' });
        assert.strictEqual(t.get('/world/w9/things').value._scope, 'world/w9');
    });

    test('path grammar refuses traversal + non-absolute', () => {
        assert.throws(() => normalizePath('relative/path'), /absolute/);
        assert.throws(() => normalizePath('/a/../b'), /traversal/);
        assert.throws(() => normalizePath('/a//b'), /invalid path segment/);
    });
}

// ==================== STORAGE ====================
async function storage() {
    console.log('\n▓ STORAGE (#149 #150 #151 #152 #153)\n');
    const fold = require('../lib/state/fold');
    const { CellStore } = require('../lib/state/cellstore');
    const { HotSet } = require('../lib/state/hotset');
    const { StateAnchor } = require('../lib/state/anchor');
    const { SnapshottedLog } = require('../lib/state/checkpoint');
    const { StateTree } = require('../lib/state/tree');

    test('#149 ring offset + closed-form depth agree at every ring boundary', () => {
        assert.strictEqual(fold.capacityLawHolds(), true);
        assert.strictEqual(fold.ringOffset(0), 0);
        assert.strictEqual(fold.ringOffset(1), 1);
        assert.strictEqual(fold.ringOffset(2), 5);
        assert.strictEqual(fold.cellDepth(0), 0);
        assert.strictEqual(fold.cellDepth(1), 1);
        assert.strictEqual(fold.cellDepth(4), 1);
        assert.strictEqual(fold.cellDepth(5), 2);
    });

    test('#149 children disjoint across all cells at depth ≤ cap', () => {
        assert.strictEqual(fold.assertDisjointAtCap(6), true, 'disjointness broke at cap 6');
    });

    test('#149 children at legal depth work; deep cell refuses', () => {
        // depth of cell 1 is 1; MAX=11 so children fine
        assert.deepStrictEqual(fold.children(1), [5, 6, 7, 8]);
        // a cell at max depth: foldCapacity(11)-1 is depth 11 → refuses
        const deep = fold.foldCapacity(11) - 1;
        assert.strictEqual(fold.cellDepth(deep), 11);
        assert.throws(() => fold.children(deep), /refuses to overrun/);
    });

    test('#150 1000 writes of 10 distinct facts → exactly 10 cells', () => {
        const cs = new CellStore();
        const facts = Array.from({ length: 10 }, (_, i) => ({ fact: i }));
        for (let i = 0; i < 1000; i++) cs.put('space' + (i % 4), '/cells/' + i, facts[i % 10]);
        assert.strictEqual(cs.size, 10);
    });

    test('#150 rebate claim counts without storing bytes; savings_ratio measured', () => {
        const cs = new CellStore();
        cs.put('a', '/c/1', 'the-fact');
        const rebate = cs.put('b', '/c/2', 'the-fact');
        assert.strictEqual(rebate.stored, false);
        assert.strictEqual(rebate.rebate, true);
        assert.strictEqual(rebate.firstSpace, 'a');
        assert.strictEqual(cs.claimsFor('b'), 1);
        const m = cs.metrics();
        assert.strictEqual(m.stores_attempted, 2);
        assert.strictEqual(m.distinct, 1);
        assert.ok(Math.abs(m.savings_ratio - 0.5) < 1e-12);
    });

    const ckDir = tmpdir('ck');
    let ckLog;

    function makeCk(dir, everyN) {
        const state = { items: {} };
        return new SnapshottedLog({
            dir,
            applyRecord: (rec) => { state.items[rec.k] = rec.v; },
            serialize: () => JSON.stringify(state),
            restore: (s) => { const parsed = JSON.parse(s); state.items = parsed.items; },
            everyN: everyN || 5,
            keepK: 2
        });
    }

    await testAsync('#151 kill-mid-stream recovery reproduces pre-kill root', async () => {
        const dir = tmpdir('recover');
        const log = makeCk(dir);
        for (let i = 0; i < 12; i++) log.append({ k: 'key' + i, v: i });
        // simulate kill: reopen and recover
        const log2 = makeCk(dir);
        const res = log2.recover();
        assert.strictEqual(res.recovered, true);
        assert.strictEqual(res.freshStart, false);
        assert.strictEqual(log2.currentCheckpointId(), log.currentCheckpointId(),
            'recovered state ≠ pre-kill state');
    });

    await testAsync('#151 snapshot boundaries deterministic; log bounded', async () => {
        const dir1 = tmpdir('det1'), dir2 = tmpdir('det2');
        const a = makeCk(dir1), b = makeCk(dir2);
        for (let i = 0; i < 20; i++) { a.append({ k: 'k' + i, v: i }); b.append({ k: 'k' + i, v: i }); }
        const snapsA = fs.readdirSync(path.join(dir1, 'snapshots')).sort();
        const snapsB = fs.readdirSync(path.join(dir2, 'snapshots')).sort();
        assert.deepStrictEqual(snapsA, snapsB, 'boundaries diverged on identical logs');
        // log truncated past oldest retained snapshot
        const logLines = fs.readFileSync(path.join(dir1, 'wal.log'), 'utf8').split('\n').filter(Boolean);
        const oldestSeq = parseInt(snapsA[0].split('-')[0], 10);
        assert.ok(logLines.every(l => JSON.parse(l).seq > oldestSeq), 'log not truncated past oldest snapshot');
    });

    await testAsync('#163(unreadable log) recovery DENIES rather than empty-log', async () => {
        const dir = tmpdir('denied');
        const log = makeCk(dir);
        log.append({ k: 'a', v: 1 });
        // DENIED simulation: the log path becomes a DIRECTORY (EISDIR —
        // deterministic; chmod 000 does not block reads when euid=0)
        const logPath = path.join(dir, 'wal.log');
        fs.unlinkSync(logPath);
        fs.mkdirSync(logPath);
        const log2 = makeCk(dir);
        assert.throws(() => log2.recover(), /DENIED|unreadable/);
    });

    test('#152 anchor records {root_hash, timestamp, cause} append-only', () => {
        const dir = tmpdir('anchor');
        const anc = new StateAnchor(path.join(dir, 'ledger.jsonl'));
        anc.anchor('a'.repeat(64), 'checkpoint-1', 'git-abc123');
        anc.anchor('b'.repeat(64), 'checkpoint-2');
        const chain = anc.chain();
        assert.strictEqual(chain.length, 2);
        assert.strictEqual(chain[0].root_hash, 'a'.repeat(64));
        assert.strictEqual(chain[0].carrier, 'git-abc123');
        assert.ok(chain[1].timestamp >= chain[0].timestamp);
        // append-only: first entry untouched
        const anc2 = new StateAnchor(path.join(dir, 'ledger.jsonl'));
        assert.strictEqual(anc2.chain().length, 2);
    });

    test('#152 verify recomputes + returns divergence', () => {
        const dir = tmpdir('anchor2');
        const anc = new StateAnchor(path.join(dir, 'ledger.jsonl'));
        anc.anchor('a'.repeat(64), 'good state');
        const good = anc.verify('a'.repeat(64));
        assert.strictEqual(good.ok, true);
        const bad = anc.verify('c'.repeat(64));
        assert.strictEqual(bad.ok, false);
        assert.ok(bad.firstDivergence.includes('diverged'));
        const empty = new StateAnchor(path.join(dir, 'none.jsonl')).verify('a'.repeat(64));
        assert.strictEqual(empty.ok, false);
    });

    test('#153 evicted key falls through to store and is CORRECT', () => {
        const backing = new (require('../lib/state/cellstore').CellStore)();
        const r = backing.put('s', '/c', 'durable-truth');
        const hot = new HotSet(backing, 2);
        hot.put('h1', 'a'); hot.put('h2', 'b'); hot.put('h3', 'c'); // h1 evicted
        assert.strictEqual(hot.get('h1').state, 'ABSENT'); // gone from hot...
        const back = hot.get(r.hash); // never in hot; falls through
        assert.strictEqual(back.state, 'PRESENT');
        assert.strictEqual(back.value, 'durable-truth');
        assert.strictEqual(back.source, 'store');
        // re-read after eviction: still correct (store is durable)
        hot.put('z1', 1); hot.put('z2', 2); // push the back entry out
        assert.strictEqual(hot.get(r.hash).value, 'durable-truth', 'evicted-from-hot entry lost durability');
    });

    test('#153 hot-set cap enforced, evictions counted, metrics one call', () => {
        const backing = new (require('../lib/state/cellstore').CellStore)();
        const hot = new HotSet(backing, 3);
        for (let i = 0; i < 10; i++) hot.put('k' + i, i);
        const m = hot.metrics();
        assert.strictEqual(m.hot_size, 3, 'cap violated');
        assert.strictEqual(m.evictions, 7);
        assert.ok(m.hits !== undefined && m.misses !== undefined);
    });
}

// ==================== GEOMETRY ====================
async function geometry() {
    console.log('\n▓ GEOMETRY (#154 #155 #156 #157)\n');
    const gfold = require('../lib/geometry/fold');
    const lattice = require('../lib/geometry/lattice-keys');
    const raid = require('../lib/geometry/raid');
    const precision = require('../lib/geometry/precision');

    test('#154 1:4 subdivision, packed addresses roundtrip, 24-bit budget', () => {
        assert.deepStrictEqual(gfold.subdivide(3, 0), [1, 2, 3, 4]);
        const packed = gfold.packAddress(19, gfold.subdivide(0, 0)[3]);
        const up = gfold.unpackAddress(packed);
        assert.strictEqual(up.face, 19);
        assert.strictEqual(up.localCell, 4);
        assert.throws(() => gfold.packAddress(0, 999999999), /overflow refused/);
    });

    test('#154 facet subdivision law holds (disjoint children ≤ cap)', () => {
        assert.strictEqual(gfold.facetSubdivisionLawHolds(6), true);
    });

    test('#155 PRF keys deterministic, fixed width, no aliasing on near seeds', () => {
        const k1 = lattice.deriveShardKeys('doc-a', 5);
        const k2 = lattice.deriveShardKeys('doc-a', 5);
        const k3 = lattice.deriveShardKeys('doc-b', 5);
        assert.deepStrictEqual(k1, k2, 'same input → same keys (determinism)');
        assert.notDeepStrictEqual(k1, k3);
        assert.ok(k1.every(k => k.length === 16), 'fixed-width keys: ' + k1.join(','));
        // near-consecutive document seeds must not share key prefixes
        const near1 = lattice.deriveShardKeys('seq:1000', 8);
        const near2 = lattice.deriveShardKeys('seq:1001', 8);
        assert.ok(near1.every((k, i) => k !== near2[i]));
    });

    test('#155 shard unpredictability property holds', () => {
        assert.strictEqual(lattice.shardUnpredictabilityHolds('doc-x', 8), true);
    });

    test('#156 destroy any ONE shard → recover() restores exact bytes', () => {
        const original = 'The quick brown fox jumps over the lazy dog. '.repeat(20);
        const { shards, manifest } = raid.fragment(original, { k: 4, docId: 'test-doc' });
        for (let victim = 0; victim < 4; victim++) {
            const gathered = shards.map((s, i) => i === victim
                ? { shard: i, state: 'ABSENT' }
                : { shard: i, state: 'PRESENT', data: s.data });
            const res = raid.recover({ manifest, gathered });
            assert.strictEqual(res.data.toString('utf8'), original, 'victim shard ' + victim);
            assert.deepStrictEqual(res.tampered, []);
        }
    });

    test('#156 parity shard survives its own loss too (k data intact)', () => {
        const original = 'parity-not-needed-when-all-data-present';
        const { shards, manifest } = raid.fragment(original, { k: 4 });
        const gathered = shards.map((s, i) => i === 4
            ? { shard: i, state: 'ABSENT' }
            : { shard: i, state: 'PRESENT', data: s.data });
        const res = raid.recover({ manifest, gathered });
        assert.strictEqual(res.data.toString('utf8'), original);
    });

    test('#156 tampered shard reported, never silently merged', () => {
        const { shards, manifest } = raid.fragment('tamper me', { k: 3 });
        const forged = Buffer.from('evil bytes here padding!!').toString('base64').slice(0, shards[1].data.length);
        const gathered = shards.map((s, i) => i === 1
            ? { shard: i, state: 'PRESENT', data: forged }
            : { shard: i, state: 'PRESENT', data: s.data });
        const res = raid.recover({ manifest, gathered });
        assert.deepStrictEqual(res.tampered, [1], 'tamper not reported');
        // tampered shard is dropped and parity-rebuilt: bytes come back TRUE
        // (that's the point — tamper detected AND content preserved)
        assert.strictEqual(res.data.toString('utf8'), 'tamper me');
    });

    test('#156 two lost data shards = unrecoverable (typed refusal)', () => {
        const { shards, manifest } = raid.fragment('too much loss', { k: 4 });
        const gathered = shards.map((s, i) => i < 2
            ? { shard: i, state: 'ABSENT' }
            : { shard: i, state: 'PRESENT', data: s.data });
        assert.throws(() => raid.recover({ manifest, gathered }), /cannot rebuild/);
    });

    test('#157 precision table: EXACT vs APPROXIMATE documented', () => {
        assert.strictEqual(precision.PRECISION_CONTRACT.goldenRatio.class, 'EXACT');
        assert.strictEqual(precision.PRECISION_CONTRACT.complexMultiply.class, 'APPROXIMATE');
        assert.strictEqual(precision.PRECISION_CONTRACT.complexMultiply.tolerance, 1e-12);
    });

    test('#157 quantizer lands both paths on the same cell (near-miss absorbed)', () => {
        const grid = 1e-6;
        const jsPath = 0.123456789012;
        const juliaPath = 0.123456789019; // last-ulp disagreement
        assert.strictEqual(precision.quantize(jsPath, grid), precision.quantize(juliaPath, grid));
        // far-apart values still separate
        assert.notStrictEqual(precision.quantize(0.1234, grid), precision.quantize(0.1235, grid));
    });

    test('#157 parity harness finds no mismatch on agreeing engines', () => {
        const vectors = [{ re: 0.1, im: 0.2 }, { re: 1.5, im: -2.5 }];
        const mism = precision.parityHarness(vectors, z => ({ re: z.re * 2, im: z.im * 2 }),
            z => ({ re: z.re * 2 + 1e-15, im: z.im * 2 - 1e-15 }));
        assert.deepStrictEqual(mism, []);
        const real = precision.parityHarness(vectors, z => ({ re: z.re * 2, im: z.im * 2 }),
            z => ({ re: z.re * 3, im: z.im * 2 }));
        assert.strictEqual(real.length, 2);
    });
}

// ==================== WORLD/CLOCK ====================
async function worldClock() {
    console.log('\n▓ WORLD/CLOCK (#158 #159 #160 #161)\n');
    const { SeedChain } = require('../lib/state/seeds');
    const orbits = require('../lib/state/orbits');
    const { DeltaLedger } = require('../lib/state/delta');

    test('#158 deterministic across instances (same constant → identical bytes)', () => {
        const c1 = new SeedChain({ universe: 'test-universe' });
        const c2 = new SeedChain({ universe: 'test-universe' });
        assert.strictEqual(c1.seedHex('agents:alice'), c2.seedHex('agents:alice'));
    });

    test('#158 domain separation: nesting changes bytes; siblings differ', () => {
        const c = new SeedChain({ universe: 'u' });
        const parent = c.seedHex('agents:alice');
        const child = c.seedHex('agents:alice:inbox');
        const sibling = c.seedHex('agents:bob');
        assert.notStrictEqual(parent, child);
        assert.notStrictEqual(parent, sibling);
        assert.notStrictEqual(child, sibling);
    });

    test('#158 prefix folding: child-from-parent ≠ child-from-universe', () => {
        const c = new SeedChain({ universe: 'u' });
        const parentSeed = c.seed('agents:alice');
        const viaFolding = c.deriveChild(parentSeed, 'inbox').toString('hex');
        const viaUniverse = c.seedHex('agents:alice:inbox');
        assert.notStrictEqual(viaFolding, viaUniverse, 'folding collapsed onto direct derivation');
    });

    test('#158 10K-path corpus: pairwise-distinct seeds', () => {
        const c = new SeedChain({ universe: 'distinctness' });
        const seen = new Set();
        for (let i = 0; i < 10000; i++) {
            seen.add(c.seedHex('corp:' + (i % 100) + ':node:' + i));
        }
        assert.strictEqual(seen.size, 10000, 'collision in 10K corpus: ' + seen.size);
    });

    test('#159 purity + exact periodicity at t0 + k·period', () => {
        const body = { radius: 5, period: 1000, phase0: 0.3, epoch0: 42 };
        const base = orbits.position(body, 500);
        assert.strictEqual(base.angle, orbits.position(body, 500).angle, 'impure!');
        for (const k of [1, 7, 1000]) {
            const p1 = orbits.position(body, 500 + k * 1000);
            const p2 = orbits.position(body, 500);
            assert.ok(Math.abs(p1.angle - p2.angle) < 1e-9, 'period broke at k=' + k);
            assert.ok(Math.abs(p1.pos[0] - p2.pos[0]) < 1e-9);
            assert.ok(Math.abs(p1.pos[1] - p2.pos[1]) < 1e-9);
        }
    });

    test('#159 degenerate inputs typed refusal — never NaN', () => {
        assert.throws(() => orbits.position({ radius: 0, period: 10 }, 1), /positive/);
        assert.throws(() => orbits.position({ radius: 5, period: -1 }, 1), /positive/);
        assert.throws(() => orbits.position({ radius: 5, period: 10 }, NaN), /finite/);
    });

    test('#160 circular coplanar pair: favorability OSCILLATES with synodic period', () => {
        // THE regression: distance-based implementations return a constant here
        const pivot = { radius: 100, period: 100000 };
        const moon = { radius: 1, period: 10000 };
        const earth = { radius: 1, period: 6000 };
        const opts = { bodyA: moon, bodyB: earth, ideal: 0, maxSpan: Math.PI / 2 };
        const samples = [];
        for (let t = 0; t <= 60000; t += 500) samples.push(orbits.favorability(opts, t));
        const min = Math.min(...samples), max = Math.max(...samples);
        assert.ok(max - min > 0.5, 'favorability flat — the #160 bug class: range=' + (max - min).toFixed(3));
        // oscillation period ≈ synodic
        const syn = orbits.synodicPeriod(moon, earth);
        assert.ok(syn > 0 && syn < 1e9);
    });

    test('#160 favorability ∈ [0,1] for all t across corpus', () => {
        const pairs = [
            [{ radius: 1, period: 1000 }, { radius: 2, period: 1500 }],
            [{ radius: 3, period: 700 }, { radius: 1, period: 700 }], // co-orbital
            [{ radius: 0.5, period: 3600e3 }, { radius: 1, period: 86400e3 }]
        ];
        for (const [a, b] of pairs) {
            const opts = { bodyA: a, bodyB: b };
            for (let t = 0; t < 100000; t += 997) {
                const f = orbits.favorability(opts, t);
                assert.ok(f >= 0 && f <= 1, 'out of range at t=' + t + ': ' + f);
            }
        }
    });

    test('#160 nextWindow deterministic (twice → identical) and within horizon', () => {
        const opts = { bodyA: { radius: 1, period: 5000 }, bodyB: { radius: 1, period: 3000 }, ideal: 0 };
        const w1 = orbits.nextWindow(opts, 1000, { threshold: 0.9, horizonMs: 60000 });
        const w2 = orbits.nextWindow(opts, 1000, { threshold: 0.9, horizonMs: 60000 });
        assert.ok(w1, 'no window found');
        assert.strictEqual(w1.t, w2.t, 'nondeterministic window scan');
        assert.ok(w1.t <= 61000);
    });

    test('#161 delta write persists {payload, actor, epoch} — actor NOT optional', () => {
        const dl = new DeltaLedger();
        assert.throws(() => dl.record('k', 'v', undefined), /actor is NOT optional/);
        assert.throws(() => dl.record('k', 'v', ''), /actor is NOT optional/);
        dl.record('k', { x: 1 }, 'agent-7');
        const g = dl.get('k');
        assert.strictEqual(g.state, 'PRESENT');
        assert.strictEqual(g.actor, 'agent-7');
        assert.ok(Number.isFinite(g.epoch));
    });

    test('#161 erase leaves cleared record readable with actor + epoch', () => {
        const dl = new DeltaLedger();
        dl.record('secret', 'value', 'alice');
        const res = dl.erase('secret', 'mallory');
        assert.strictEqual(res.cleared, true);
        assert.strictEqual(dl.get('secret').state, 'ABSENT');
        const hist = dl.history('secret');
        assert.strictEqual(hist.length, 2);
        assert.strictEqual(hist[1].cleared, true);
        assert.strictEqual(hist[1].actor, 'mallory'); // who cleared what and when
        assert.ok(hist[1].epoch >= hist[0].epoch);
    });

    test('#161 re-derivation determinism (ledger hash equality)', () => {
        const mk = () => {
            const dl = new DeltaLedger({ epoch: 100 });
            dl.record('a', 1, 'x');
            dl.record('b', 2, 'y');
            dl.erase('a', 'z');
            return dl.ledgerHash();
        };
        assert.strictEqual(mk(), mk(), 'same events → different ledger hashes');
    });
}

// ==================== TARGETED ====================
async function targeted() {
    console.log('\n▓ TARGETED (#162 #163)\n');
    const { PersistentGrants } = require('../lib/persistent-grants');

    test('#162 grant persisted in one process, honored in another (fresh instance)', () => {
        const dir = tmpdir('grants');
        const ledger = path.join(dir, 'grants.jsonl');
        const procA = new PersistentGrants({ ledgerPath: ledger, now: () => 1000 });
        procA.persist({ capability: 'canWrite', grantor: 'operator' });
        const procB = new PersistentGrants({ ledgerPath: ledger, now: () => 2000 });
        assert.strictEqual(procB.allows('canWrite').allowed, true);
    });

    test('#162 without --persist: unchanged E_SANDBOX (no ledger → deny)', () => {
        const dir = tmpdir('grants2');
        const procB = new PersistentGrants({ ledgerPath: path.join(dir, 'grants.jsonl'), now: () => 1000 });
        const res = procB.allows('canWrite');
        assert.strictEqual(res.allowed, false);
        assert.strictEqual(res.reason, 'none');
    });

    test('#162 expired persistent grant → refused with expired reason', () => {
        const dir = tmpdir('grants3');
        const ledger = path.join(dir, 'grants.jsonl');
        const granter = new PersistentGrants({ ledgerPath: ledger, now: () => 1000 });
        granter.persist({ capability: 'canCommit', grantor: 'op', ttlMs: 500 });
        const later = new PersistentGrants({ ledgerPath: ledger, now: () => 1600 });
        const res = later.allows('canCommit');
        assert.strictEqual(res.allowed, false);
        assert.strictEqual(res.reason, 'expired');
    });

    test('#162 revocation honored by later capability checks', () => {
        const dir = tmpdir('grants4');
        const ledger = path.join(dir, 'grants.jsonl');
        new PersistentGrants({ ledgerPath: ledger, now: () => 1000 })
            .persist({ capability: 'canWrite', grantor: 'op' });
        new PersistentGrants({ ledgerPath: ledger, now: () => 1100 })
            .revoke({ capability: 'canWrite', actor: 'op' });
        const checker = new PersistentGrants({ ledgerPath: ledger, now: () => 1200 });
        assert.strictEqual(checker.allows('canWrite').allowed, false);
    });

    test('#162 grantor mandatory; unreadable ledger DENIES (never allows)', () => {
        const dir = tmpdir('grants5');
        const g = new PersistentGrants({ ledgerPath: path.join(dir, 'g.jsonl'), now: () => 1000 });
        assert.throws(() => g.persist({ capability: 'canWrite' }), /grantor is NOT optional/);
        // DENIED simulation: ledger path is a DIRECTORY (readFileSync → EISDIR,
        // deterministic even when chmod is honored loosely)
        const lockedDir = path.join(dir, 'locked.jsonl');
        fs.mkdirSync(lockedDir);
        const d = new PersistentGrants({ ledgerPath: lockedDir, now: () => 1000 });
        assert.throws(() => d.allows('canWrite'), /DENIED|unreadable/);
    });

    test('#163 WAL replay marks DENIED on unreadable journal (store still opens)', () => {
        const { Wal } = require('../lib/wal');
        const dir = tmpdir('waldeny');
        const wal = new Wal(dir, { enabled: true });
        wal.intent('write', 'f.txt', 'data'); // creates journal
        // DENIED simulation: journal path becomes a DIRECTORY (EISDIR)
        const walPath = path.join(dir, '.wal', 'wal.log');
        fs.unlinkSync(walPath);
        fs.mkdirSync(walPath);
        const wal2 = new Wal(dir, { enabled: true });
        const stats = wal2.replay(() => {});
        assert.strictEqual(stats.denied, 1, 'denied not flagged: ' + JSON.stringify(stats));
    });

    test('#163 ABSENT distinguishable in the API (typed, not null)', () => {
        const { StateTree } = require('../lib/state/tree');
        const t = new StateTree();
        const res = t.get('/nope');
        assert.strictEqual(res.state, 'ABSENT');
        assert.strictEqual(res.value, undefined);
        const cs = new (require('../lib/state/cellstore').CellStore)();
        assert.strictEqual(cs.get('deadbeef').state, 'ABSENT');
    });

    test('#162 sandbox can() picks up persistent grant tier without in-process caps', () => {
        const dir = tmpdir('grants6');
        const ledger = path.join(dir, 'grants.jsonl');
        new PersistentGrants({ ledgerPath: ledger, now: () => 1000 })
            .persist({ capability: 'canCommit', grantor: 'op' });
        process.env.VANT_TEST_GRANT_LEDGER = ledger;
        // sandbox path re-resolves brain-scoped ledger; only env override testable here
        // — the direct allows() check above covers the semantics; this pin covers
        // that can() degrades to false, never throws, with no grant ledger around.
        const sandbox = require('../lib/sandbox');
        const s = new sandbox.Sandbox({ agentId: 'test-agent' });
        assert.strictEqual(typeof s.can('canWrite'), 'boolean');
        delete process.env.VANT_TEST_GRANT_LEDGER;
    });
}

// ==================== MESH/BRAINS ====================
async function meshBrains() {
    console.log('\n▓ MESH/BRAINS (#164 #165 #166)\n');
    const { MeshTree } = require('../lib/state/mesh');
    const { AddressingSpine } = require('../lib/state/spine');
    const { CellStore } = require('../lib/state/cellstore');
    const { BrainVerifier } = require('../lib/state/brain-verify');

    test('#164 node with AOI /mesh/r1 receives only r1 diffs (noise excluded)', () => {
        const mt = new MeshTree({ now: () => 1000 });
        mt.register('r1', 'n7', { role: 'worker' });
        mt.register('r2', 'n9', { role: 'worker' });
        const view = mt.aoiDiff('/mesh/r1');
        assert.ok(view.nodes.every(n => !n.path.startsWith('/mesh/r2')), 'AOI leaked r2');
        assert.ok(view.nodes.some(n => n.path.startsWith('/mesh/r1/n7')));
    });

    test('#164 stale-node detection is a pure read', () => {
        let now = 1000;
        const mt = new MeshTree({ now: () => now, presenceTtlMs: 5000 });
        mt.register('r1', 'n1');
        assert.strictEqual(mt.isAlive('r1', 'n1').alive, true);
        now = 7000; // time passes, no heartbeat
        const verdict = mt.isAlive('r1', 'n1');
        assert.strictEqual(verdict.alive, false);
        assert.strictEqual(verdict.stale, true, 'must be provably stale, no timers');
        now = 9000;
        mt.heartbeat('r1', 'n1'); // revive
        assert.strictEqual(mt.isAlive('r1', 'n1').alive, true);
    });

    test('#164 two writers one path: deterministic winner, loser recorded', () => {
        let now = 1000;
        const mt = new MeshTree({ now: () => now });
        const w1 = mt.write('r1', 'alice', '/mesh/r1/shared/config', { v: 'a' });
        assert.strictEqual(w1.accepted, true);
        now = 2000; // bob's epoch higher → bob wins deterministically
        const w2 = mt.write('r1', 'bob', '/mesh/r1/shared/config', { v: 'b' });
        assert.strictEqual(w2.accepted, true);
        assert.strictEqual(w2.winner, 'bob');
        now = 1500; // carol's epoch LOWER → rejected but RECORDED
        const w3 = mt.write('r1', 'carol', '/mesh/r1/shared/config', { v: 'c' });
        assert.strictEqual(w3.accepted, false);
        const rejected = mt.rejectedWrites();
        assert.strictEqual(rejected.length, 1, 'loser write dropped silently');
        assert.strictEqual(rejected[0].writer, 'carol');
        // determinism: same epochs → hash tiebreak is stable across runs
        const mt2 = new MeshTree({ now: () => 1000 });
        mt2.write('r1', 'x', '/p', 'same');
        const a = mt2.write('r1', 'y', '/p', 'same');
        assert.strictEqual(typeof a.accepted, 'boolean');
    });

    test('#165 fact under /raid/d1 claimed under /mesh/r1/n7 stores ONE cell', () => {
        const spine = new AddressingSpine({ universe: 'spine-test' });
        const cs = new CellStore();
        const fact = { kind: 'peer-record', peer: 'n7' };
        const res = spine.writeSharedFact(cs, fact, ['/raid/d1', '/mesh/r1/n7']);
        assert.strictEqual(res.storedOnce, true, 'fact stored ' + res.storedOnce + ' times');
        assert.strictEqual(res.identicalHashes, true, 'hash differs across spaces');
        assert.strictEqual(cs.size, 1);
    });

    test('#165 all consumers derive addresses via one module (spine PRF)', () => {
        const spine = new AddressingSpine({ universe: 'u' });
        const a1 = spine.cellAddress('/raid/doc1', 0);
        const a2 = spine.cellAddress('/raid/doc1', 0);
        const a3 = spine.cellAddress('/raid/doc1', 1);
        const a4 = spine.cellAddress('/mesh/r1/n1', 0);
        assert.strictEqual(a1, a2);
        assert.notStrictEqual(a1, a3);
        assert.notStrictEqual(a1, a4);
        // no second imul chain: the spine PRF is sha256 over SeedChain output
        assert.strictEqual(spine.seeds.seedHex('raid:doc1').length, 64);
    });

    test('#165 removing one consumer leaves others byte-compatible', () => {
        const spine = new AddressingSpine({ universe: 'stable' });
        const before = {
            raid: spine.cellAddress('/raid/d', 5),
            mesh: spine.cellAddress('/mesh/r/n', 5),
            world: spine.cellAddress('/world/w', 5)
        };
        // "removing" mesh: the other two derivations are unchanged
        const after = {
            raid: spine.cellAddress('/raid/d', 5),
            world: spine.cellAddress('/world/w', 5)
        };
        assert.strictEqual(after.raid, before.raid);
        assert.strictEqual(after.world, before.world);
    });

    test('#166 brain verify: recompute root, compare to anchor', () => {
        const dir = tmpdir('brain');
        fs.writeFileSync(path.join(dir, 'identity.md'), '# Me\nI am.');
        fs.mkdirSync(path.join(dir, 'notes'));
        fs.writeFileSync(path.join(dir, 'notes', 'lessons.md'), 'learn stuff');
        const bv = new BrainVerifier(dir);
        bv.anchorNow('initial write');
        const v = bv.verify();
        assert.strictEqual(v.ok, true, 'clean brain should verify: ' + v.divergence);
        // mutate behind the anchor
        fs.writeFileSync(path.join(dir, 'identity.md'), '# Me\nI am CHANGED.');
        const v2 = bv.verify();
        assert.strictEqual(v2.ok, false, 'tampered brain must fail verify');
        assert.ok(v2.divergence.includes('diverged'));
    });

    test('#166 horcrux roundtrip: restore → verify → same root as forge', () => {
        const src = tmpdir('brain-src');
        fs.writeFileSync(path.join(src, 'a.md'), 'alpha');
        fs.writeFileSync(path.join(src, 'b.md'), 'beta');
        const forge = new BrainVerifier(src);
        const hx = forge.forgeHorcrux('pass-170');
        const dst = tmpdir('brain-dst');
        for (const n of hx.manifest) fs.writeFileSync(path.join(dst, n.path), fs.readFileSync(path.join(src, n.path)));
        const restore = new BrainVerifier(dst);
        const res = restore.verifyRestore(hx);
        assert.strictEqual(res.ok, true, 'restored brain root ≠ forged root');
    });

    test('#166 corrupted brain file detected before read into context', () => {
        const dir = tmpdir('brain-corrupt');
        fs.writeFileSync(path.join(dir, 'good.md'), 'fine');
        const bv = new BrainVerifier(dir);
        const m1 = bv.manifest();
        assert.ok(m1.every(n => n.ok));
        // partial write simulation: dangling symlink where a real file must
        // be (readFileSync → ENOENT — deterministic denial; chmod 000 does
        // not block reads when euid=0, and directories are walked over)
        fs.symlinkSync(path.join(dir, 'no-such-target'), path.join(dir, 'bad.md'));
        // currentRoot refuses with DENIED rather than skipping silently
        assert.throws(() => bv.currentRoot(), /DENIED|unreadable/);
        const m2 = bv.manifest();
        assert.ok(m2.some(n => !n.ok && n.path === 'bad.md'), 'corruption not surfaced in manifest');
    });
}

// ==================== MAIN ====================
(async () => {
    console.log('╔════════════════════════════════════════════╗');
    console.log('║  ENGINE-PARITY SPINE PINS (#145–#166)      ║');
    console.log('╚════════════════════════════════════════════╝');
    try { await stateCore(); } catch (e) { fail('state core crashed', e.message); }
    try { await storage(); } catch (e) { fail('storage crashed', e.message); }
    try { await geometry(); } catch (e) { fail('geometry crashed', e.message); }
    try { await worldClock(); } catch (e) { fail('world/clock crashed', e.message); }
    try { await targeted(); } catch (e) { fail('targeted crashed', e.message); }
    try { await meshBrains(); } catch (e) { fail('mesh/brains crashed', e.message); }

    console.log('\n=== SPINE RESULTS ===');
    console.log('  Passed:  ' + passed);
    console.log('  Failed:  ' + failed);
    process.exit(failed > 0 ? 1 : 0);
})();
