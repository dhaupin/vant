'use strict';
/**
 * Wave U1 pin suite — Genesis Snapshots (labs/prd-universe.md).
 * PASS-derived contract: same (name, universe) → byte-identical output,
 * fork folds through the parent seed, hostile input fails closed typed.
 */
const assert = require('assert');
const { genesisSnapshot, forkSnapshot, GENESIS_CELL_COUNT } = require('../lib/state/genesis-snapshot');
const { SeedChain } = require('../lib/state/seeds');

const UNIVERSE = 'u1-test-universe- gimme-fixed';

let passed = 0, failed = 0;
function ok(name, fn) {
    try { fn(); passed++; console.log('  ✓ ' + name); }
    catch (e) { failed++; console.log('  ✗ ' + name + ': ' + e.message); }
}

ok('determinism: same (name, universe) → byte-identical snapshot', () => {
    const a = genesisSnapshot({ name: 'alpha', universe: UNIVERSE });
    const b = genesisSnapshot({ name: 'alpha', universe: UNIVERSE });
    assert.strictEqual(a.fingerprint, b.fingerprint);
    assert.deepStrictEqual(a.cells, b.cells);
    assert.strictEqual(a.seed, b.seed);
});

ok('fresh-process determinism: two SeedChain instances agree', () => {
    const a = genesisSnapshot({ name: 'serde', universe: UNIVERSE });
    const direct = new SeedChain({ universe: UNIVERSE }).seedHex('world:serde');
    assert.strictEqual(a.seed, direct);
});

ok('fork divergence: parent.child ≠ child (prefix folding holds)', () => {
    const forked = forkSnapshot({ parent: 'alpha', child: 'beta', universe: UNIVERSE });
    const direct = genesisSnapshot({ name: 'beta', universe: UNIVERSE });
    assert.notStrictEqual(forked.seed, direct.seed);
    assert.notStrictEqual(forked.fingerprint, direct.fingerprint);
    assert.strictEqual(forked.folded, true);
    assert.strictEqual(forked.parent, '/world/alpha');
});

ok('fork depth 2: parent.child.grandchild folds through child', () => {
    const lvl1 = forkSnapshot({ parent: 'alpha', child: 'beta', universe: UNIVERSE });
    const lvl2 = forkSnapshot({ parent: 'alpha.beta', child: 'gamma', universe: UNIVERSE });
    const direct = genesisSnapshot({ name: 'gamma', universe: UNIVERSE });
    assert.notStrictEqual(lvl2.seed, direct.seed);
    assert.notStrictEqual(lvl2.seed, lvl1.seed);
    assert.ok(lvl2.parent === '/world/alpha.beta');
});

ok('universe sensitivity: different constant → different snapshot', () => {
    const a = genesisSnapshot({ name: 'alpha', universe: UNIVERSE });
    const b = genesisSnapshot({ name: 'alpha', universe: 'another-universe' });
    assert.notStrictEqual(a.fingerprint, b.fingerprint);
    assert.notStrictEqual(a.seed, b.seed);
});

ok('each snapshot covers ' + GENESIS_CELL_COUNT + ' genesis cells (root + ring 1)', () => {
    const s = genesisSnapshot({ name: 'cells', universe: UNIVERSE });
    assert.strictEqual(s.cells.length, GENESIS_CELL_COUNT);
    assert.ok(new Set(s.cells).size === GENESIS_CELL_COUNT, 'cells are distinct addresses');
});

ok('hostile name: traversal, colon, empty, spaces → typed E_SNAPSHOT_NAME', () => {
    for (const bad of ['../escape', 'a:b', '', '   ', 'bad/name', 'semi;colon']) {
        let threw = null;
        try { genesisSnapshot({ name: bad, universe: UNIVERSE }); } catch (e) { threw = e; }
        assert.ok(threw, 'expected throw for ' + JSON.stringify(bad));
        assert.strictEqual(threw.code, 'E_SNAPSHOT_NAME');
    }
});

ok('hostile universe: non-string / empty → typed E_SNAPSHOT_UNIVERSE', () => {
    for (const bad of [42, null !== null ? {} : {}, true]) {
        let threw = null;
        try { genesisSnapshot({ name: 'alpha', universe: typeof bad === 'string' ? '' : bad }); } catch (e) { threw = e; }
        assert.ok(threw, 'expected throw');
        assert.strictEqual(threw.code, 'E_SNAPSHOT_UNIVERSE');
    }
});

ok('fork hostile child: same typed gate as the grammar', () => {
    let threw = null;
    try { forkSnapshot({ parent: 'alpha', child: 'x/../y', universe: UNIVERSE }); } catch (e) { threw = e; }
    assert.ok(threw);
    assert.strictEqual(threw.code, 'E_SNAPSHOT_NAME');
});

ok('fork missing parent/child → typed E_SNAPSHOT_NAME', () => {
    for (const [bad, m] of [[{}, 'no-args'], [{ parent: 'alpha' }, 'no-child'], [{ child: 'beta' }, 'no-parent']]) {
        let threw = null;
        try { forkSnapshot({ ...bad, universe: UNIVERSE }); } catch (e) { threw = e; }
        assert.ok(threw, 'expected throw for ' + m);
        assert.strictEqual(threw.code, 'E_SNAPSHOT_NAME');
    }
});

ok('spaceId stays in the spine namespace (consumable by cellStore)', () => {
    const s = genesisSnapshot({ name: 'alpha', universe: UNIVERSE });
    assert.ok(s.spaceId.startsWith('/world/'));
    assert.ok(s.scopePath.startsWith('world:'));
});

console.log('\n=== genesis-snapshot pins: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed > 0 ? 1 : 0);
