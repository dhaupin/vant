/**
 * Wave G (vant#340): the boost lane — discriminating pins.
 *
 * The four laws, each pinned: a boost buys display TIME never rank (one
 * live window per cell; a second id over a busy cell refuses E_BOOST_OVERLAP;
 * there is no ordering verb in the export), boosted rows self-identify via
 * an engine-added label and the featureWindow export (no seller copy can
 * ride the purchase), tenancy is boost-neutral (the window list and the
 * plate marker are computed THROUGH the owner's gate — a boost never
 * widens a viewer), and the purchase accounting is idempotent (the same id
 * replays the SAME window with NO second recorded event; the same id with
 * a different intent refuses E_BOOST_ID_CONFLICT).
 *
 * Pre-fix check: pins marked FLIP fail against a lib/boost.js reverted to a
 * stack-anything / silent-double-record / tenancy-blind variant.
 */

const assert = require('assert');
const boost = require('../lib/boost');
const plates = require('../lib/plates');
const errors = require('../lib/error');

let passed = 0;
let failed = 0;
const failedList = [];

async function pin(name, fn) {
    try {
        await fn();
        passed++;
        console.log('  ✓ ' + name);
    } catch (e) {
        failed++;
        failedList.push(name);
        console.log('  ✗ FAILED: ' + name + ' — ' + (e.message || e));
    }
}

// --- event capture (the accounting's bus half) ------------------------------
const bus = (() => { try { return require('../lib/event'); } catch (e) { return null; } })();

// every window lives on the REAL clock — the plate render_adorns with now()
const NOW = Date.now();

// --- fixtures ----------------------------------------------------------------

const PUBLIC_ROWS = [
    { id: 'row_a', version: 1, at: 10, label: 'Forge Anniv' },
    { id: 'row_b', version: 2, at: 20, label: 'Rumor Board' },
    { id: 'row_c', version: 1, at: 30, label: 'Lot Board' }
];

const GATED_ROWS = [
    { id: 'pub_1', version: 1, at: 10, tier: 'public', label: 'Open Lot' },
    { id: 'stf_1', version: 1, at: 20, tier: 'staff', label: 'Staff Ledger' }
];

function seededActiveWindow(now) {
    boost.record({ id: 'g1', channel: 'gated-floor', rowId: 'stf_1', by: 'staff_vant', seconds: 3600, at: now });
}

async function main() {
    boost.clearState();
    plates.clearState();

    // the accounting's bus half, captured for the WHOLE purchase story
    const recorded = [];
    if (bus && bus.on) { try { bus.on('boost:recorded', (d) => recorded.push(d)); } catch (e) { /* capture is best-effort */ } }

    plates.registerChannel({
        name: 'public-floor', module: 'boards', rows: () => PUBLIC_ROWS.map((r) => ({ ...r })), visibility: 'public'
    });
    plates.registerChannel({
        name: 'gated-floor', module: 'boards', rows: () => GATED_ROWS.map((r) => ({ ...r })),
        visibility: (row, viewer) => (row.tier === 'staff' ? viewer === 'staff_vant' : true)
    });
    plates.createPlate({ name: 'tavern-postings', channels: ['public-floor'], template: { label: 'label' } });
    plates.createPlate({ name: 'archive-postings', channels: ['gated-floor'], template: { label: 'label' } });

    await pin('FLIP: a window purchase is a unit-shaped record with window math (startsAt, endsAt, seconds)', () => {
        const r = boost.record({ id: 'b1', channel: 'public-floor', rowId: 'row_a', by: 'guild_a', seconds: 300, at: NOW + 8_000 });
        assert.strictEqual(r.recorded, true);
        assert.strictEqual(r.replayed, false);
        assert.strictEqual(r.boost.startsAt, NOW + 8_000);
        assert.strictEqual(r.boost.endsAt, NOW + 8_000 + 300_000);
        assert.strictEqual(r.boost.by, 'guild_a');
    });

    await pin('the window binds a declared channel — a boost refuses a phantom surface', () => {
        const r = boost.record({ id: 'ghost', channel: 'no-such-channel', rowId: 'row_a', by: 'guild_a', seconds: 60 });
        assert.strictEqual(r.code, 'E_BOOST_UNKNOWN_CHANNEL');
        assert.strictEqual(boost.audit().records.some((b) => b.id === 'ghost'), false);
    });

    await pin('accounting names its sale — channel/rowId/by completeness + window bounds refuse typed', () => {
        assert.strictEqual(boost.record({}).code, 'E_BOOST_INPUT');
        assert.strictEqual(boost.record({ id: 'x1', channel: 'public-floor', rowId: 'row_a', seconds: 60, at: NOW }).code, 'E_BOOST_INPUT');  // no by
        assert.strictEqual(boost.record({ id: 'w0', channel: 'public-floor', rowId: 'row_b', by: 'guild_a', seconds: 0 }).code, 'E_BOOST_WINDOW');
        assert.strictEqual(boost.record({ id: 'wneg', channel: 'public-floor', rowId: 'row_b', by: 'guild_a', seconds: -5 }).code, 'E_BOOST_WINDOW');
        assert.strictEqual(boost.record({ id: 'wnan', channel: 'public-floor', rowId: 'row_b', by: 'guild_a', seconds: NaN }).code, 'E_BOOST_WINDOW');
        assert.strictEqual(boost.record({ id: 'wlease', channel: 'public-floor', rowId: 'row_b', by: 'guild_a', seconds: 10 ** 10 }).code, 'E_BOOST_WINDOW'); // a window, not a lease
    });

    await pin('FLIP: idempotent replay — the same id returns the SAME window, no second recorded event', () => {
        const again = boost.record({ id: 'b1', channel: 'public-floor', rowId: 'row_a', by: 'guild_a', seconds: 300, at: NOW + 8_000 });
        assert.strictEqual(again.recorded, true);
        assert.strictEqual(again.replayed, true, 'replay flags honestly');
        assert.strictEqual(again.boost.startsAt, NOW + 8_000, 'replay never extends nor re-prices');
        assert.strictEqual(again.boost.endsAt, NOW + 8_000 + 300_000);
        // exactly ONE recorded event for the whole purchase (no double-buy accounting)
        const mine = recorded.filter((e) => e.id === 'b1');
        assert.strictEqual(mine.length, 1);
    });

    await pin('FLIP: the same id with a DIFFERENT intent refuses (no silent repurpose of a purchase key)', () => {
        const r = boost.record({ id: 'b1', channel: 'public-floor', rowId: 'row_c', by: 'guild_a', seconds: 60 });
        assert.strictEqual(r.code, 'E_BOOST_ID_CONFLICT');
        // and the original window is untouched
        assert.strictEqual(boost.audit().records.find((b) => b.id === 'b1').rowId, 'row_a');
    });

    await pin('FLIP: rank-neutral by construction — a second live window over a busy cell stacks NOTHING', () => {
        const stack = boost.record({ id: 'b2', channel: 'public-floor', rowId: 'row_a', by: 'guild_b', seconds: 120, at: NOW });
        assert.strictEqual(stack.code, 'E_BOOST_OVERLAP');
        // another ROW is unaffected — the cell is the unit, not the surface
        const other = boost.record({ id: 'b3', channel: 'public-floor', rowId: 'row_b', by: 'guild_b', seconds: 300, at: NOW + 4_000 });
        assert.strictEqual(other.recorded, true);
    });

    await pin('expiry frees the cell — a fresh window after the old one ends is a new purchase', () => {
        const freed = boost.record({ id: 'b4', channel: 'public-floor', rowId: 'row_a', by: 'guild_c', seconds: 300, at: NOW + 310_000 });
        assert.strictEqual(freed.recorded, true);
        // at a now after the old spans end, only the fresh window is live
        const late = boost.active({ now: NOW + 320_000, channel: 'public-floor' });
        assert.deepStrictEqual(late.windows.map((w) => w.id), ['b4']);
        // and the SPAN rule holds both ways: a window that overlaps the old one is refused
        const crossing = boost.record({ id: 'bspan', channel: 'public-floor', rowId: 'row_a', by: 'guild_c', seconds: 300, at: NOW + 200_000 });
        assert.strictEqual(crossing.code, 'E_BOOST_OVERLAP');
    });

    await pin('FLIP: tenancy at the window — the boost never widens a viewer', () => {
        seededActiveWindow(NOW);
        const anon = boost.active({ viewer: 'anon' });
        assert.strictEqual(anon.windows.some((w) => w.rowId === 'stf_1'), false, 'unauthorized viewer: window withheld');
        assert.strictEqual(anon.withheld, 1, 'honest withheld count');
        const staff = boost.active({ viewer: 'staff_vant' });
        assert.ok(staff.windows.some((w) => w.rowId === 'stf_1'), 'authorized viewer sees the window');
        assert.strictEqual(staff.withheld, 0);
    });

    await pin('FLIP: boosted rows self-identify — engine-added marker + featureWindow, no seller copy', () => {
        const out = plates.renderPlate('tavern-postings', { viewer: 'anon' });
        const boosted = out.rows.find((r) => r.derive.startsWith('public-floor:row_a@'));
        assert.ok(boosted, 'row present');
        assert.ok(boosted.boost && typeof boosted.boost.id === 'string' && Number.isFinite(boosted.boost.until), 'engine label rides the row');
        // no seller copy exists anywhere on the purchase surface to leak
        assert.strictEqual(JSON.stringify(boosted.boost).includes('BUY'), false);
        const plain = out.rows.find((r) => r.derive.startsWith('public-floor:row_c@'));
        assert.strictEqual(plain && plain.boost, undefined, 'unboosted rows carry no marker');
        // featureWindow names the boosted derive ids, deterministically derive-sorted
        assert.deepStrictEqual(out.featureWindow.map((f) => f.boostId), ['b1', 'b3']);
    });

    await pin('FLIP: the boost never reorders — organic render order identical with and without windows', () => {
        const withWindows = plates.renderPlate('tavern-postings', {}).rows.map((r) => r.derive);
        boost.clearState();                               // no boosts at all
        const bare = plates.renderPlate('tavern-postings', {});
        assert.deepStrictEqual(bare.rows.map((r) => r.derive), withWindows, 'the purchase has no ordering verb');
        assert.deepStrictEqual(bare.featureWindow, [], 'bare render: an empty window, honestly');
        // restore the gated window for the following pins
        seededActiveWindow(NOW);
    });

    await pin('FLIP: tenancy is boost-neutral AT THE PLATE — a boosted gated row leaks nothing unauthorized', () => {
        const anon = plates.renderPlate('archive-postings', { viewer: 'anon' });
        assert.strictEqual(anon.withheld, 1);
        assert.strictEqual(anon.rows.some((r) => r.derive.startsWith('gated-floor:stf_1')), false);
        assert.strictEqual(JSON.stringify(anon.rows).includes('stf_1'), false, 'no boosted bytes for the unauthorized viewer');
        assert.strictEqual(anon.featureWindow.some((f) => f.derive.startsWith('gated-floor:stf_1')), false, 'the feature window obeys the same gate');
        const staff = plates.renderPlate('archive-postings', { viewer: 'staff_vant' });
        const marked = staff.rows.find((r) => r.derive.startsWith('gated-floor:stf_1'));
        assert.ok(marked && marked.boost, 'authorized viewer: the marker rides');
    });

    await pin('audit serves the purchase journal sorted and closed (a replay never double-counts)', () => {
        const a = boost.audit();
        // idempotency shows as UNIQUENESS in the record book
        const ids = a.records.map((b) => b.id);
        assert.deepStrictEqual(new Set(ids).size, ids.length, 'the replayed id is registered exactly once (or not at all)');
        for (const rec of a.records) {
            assert.ok(rec.endsAt > rec.startsAt, 'every journal row is a real span');
        }
    });

    await pin('typed refusal codes ride the CODES table (no phantom names)', () => {
        for (const code of ['E_BOOST_INPUT', 'E_BOOST_ID_CONFLICT', 'E_BOOST_UNKNOWN_CHANNEL', 'E_BOOST_WINDOW', 'E_BOOST_OVERLAP']) {
            assert.notStrictEqual(errors.CODES[code], undefined, code + ' must be a real code');
        }
    });

    // teardown so sibling suites in the same shard start clean
    boost.clearState();
    plates.clearState();

    console.log('\nPassed:  ' + passed + '\nFailed:  ' + failed);
    if (failed) {
        console.log('Failures: ' + failedList.join(', '));
        process.exit(1);
    }
}

main().catch((e) => {
    console.error('suite crashed:', e);
    process.exit(1);
});
