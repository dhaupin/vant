/**
 * Wave F (vant#339): the channel + plate primitive — discriminating pins.
 *
 * The issue's three laws, each pinned: template fields only (authorial
 * text at render refuses typed), tenancy enforced at the plate fail-closed
 * (undeclared visibility refuses at registration; gated rows withheld and
 * counted, never leaked), the plate never mutates (no write verbs in the
 * export; render output carries template fields and derivation only).
 * Provenance law: the derive identity `${channel}:${rowId}@${version}` is
 * deterministic across renders so one derivation serves many readers.
 *
 * Pre-fix check: pins marked FLIP fail against a lib/plates.js reverted to
 * a stub / tenancy-omitted / free-text-tolerant variant.
 */

const assert = require('assert');
const path = require('path');
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

// --- fixture channels -----------------------------------------------------

const ROWS = [
    { id: 'lst_2', version: 3, at: 1000, title: 'Steel Axe', price: 42, status: 'open', owner: 'guild_w', tier: 'public' },
    { id: 'lst_1', version: 1, at: 900, title: 'Copper Ring', price: 7, status: 'open', owner: 'guild_a', tier: 'public' },
    { id: 'lst_3', version: 2, at: 1100, title: 'Unlisted Vault', price: 999, status: 'draft', owner: 'guild_w', tier: 'staff' }
];

const publicMarketRows = () => ROWS.map((r) => ({ ...r }));
const gatedMarketRows = () => ROWS.map((r) => ({ ...r }));

async function main() {
    plates.clearState();

    await pin('channel registers with declared public tenancy; derive-ready', async () => {
        const r = plates.registerChannel({
            name: 'market-listings', module: 'market', rows: publicMarketRows, visibility: 'public'
        });
        assert.strictEqual(r.registered, true);
        assert.strictEqual(r.tenancy, 'public');
    });

    await pin('FLIP: undeclared visibility refuses fail-closed (never defaults to public)', async () => {
        const r = plates.registerChannel({
            name: 'secret-led', module: 'ledger', rows: publicMarketRows
        });
        assert.strictEqual(r.code, 'E_CHANNEL_VISIBILITY');
        // and the ghost channel is not half-registered
        assert.strictEqual(plates.listChannels().some((c) => c.name === 'secret-led'), false);
    });

    await pin('plate over template fields renders rows with derive identity; deterministic order', async () => {
        const def = plates.createPlate({
            name: 'guild-storefront',
            channels: ['market-listings'],
            template: { title: 'title', price: 'price', status: 'status' }
        });
        assert.strictEqual(def.defined, true);
        const out = plates.renderPlate('guild-storefront', { viewer: 'anon' });
        assert.strictEqual(out.count, 3);
        // derive ids are channel:rowId@version — stable provenance
        assert.ok(out.rows.some((row) => row.derive === 'market-listings:lst_2@3'));
        // deterministic: sorted by derive id across renders (same truth for every reader)
        const out2 = plates.renderPlate('guild-storefront', { viewer: 'anon' });
        assert.deepStrictEqual(out.rows.map((r) => r.derive), out2.rows.map((r) => r.derive));
        // JSON-safe by construction
        JSON.stringify(out);
        void gatedMarketRows;
    });

    await pin('FLIP: render carries template fields ONLY — unselected row fields never leak', async () => {
        const out = plates.renderPlate('guild-storefront', { viewer: 'anon' });
        for (const row of out.rows) {
            assert.deepStrictEqual(Object.keys(row.fields).sort(), ['price', 'status', 'title']);
            // owner/tier (unselected) must not ride the render
            assert.strictEqual(JSON.stringify(row.fields).includes('guild_w'), false);
            assert.strictEqual(JSON.stringify(row.fields).includes('staff'), false);
            // and the whole row body is never attached
            assert.strictEqual(row.owner, undefined);
            assert.strictEqual(row.tier, undefined);
        }
    });

    await pin('FLIP: tenancy at the plate — gated rows withheld and counted, never leaked', async () => {
        plates.registerChannel({
            name: 'market-gated', module: 'market', rows: gatedMarketRows,
            visibility: (row, viewer) => (row.tier === 'staff' ? viewer === 'staff_vant' : true)
        });
        plates.createPlate({
            name: 'staff-storefront', channels: ['market-gated'],
            template: { title: 'title', status: 'status' }
        });
        const anon = plates.renderPlate('staff-storefront', { viewer: 'anon' });
        assert.strictEqual(anon.count, 2);                       // lst_3 withheld
        assert.strictEqual(anon.withheld, 1);                    // honest count
        assert.strictEqual(anon.rows.some((r) => r.derive.includes('lst_3')), false);
        const staff = plates.renderPlate('staff-storefront', { viewer: 'staff_vant' });
        assert.strictEqual(staff.count, 3);                      // staffing viewer sees all
        assert.strictEqual(staff.withheld, 0);
        assert.ok(staff.rows.some((r) => r.derive.includes('lst_3')));
    });

    await pin('FLIP: authorial text at render time refuses typed (template fields only, law 1)', async () => {
        const inject = plates.createPlate({
            name: 'evil-plate', channels: ['market-listings'],
            template: { blurb: 'Best deals on the mesh — trusted seller {{owner}}!' }
        });
        assert.strictEqual(inject.code, 'E_PLATE_TEMPLATE');
        const injObj = plates.createPlate({
            name: 'evil-plate2', channels: ['market-listings'],
            template: { blurb: { html: '<img src=x onerror=alert(1)>' } }
        });
        assert.strictEqual(injObj.code, 'E_PLATE_TEMPLATE');
        // and nothing got half-registered
        assert.strictEqual(plates.listPlates().some((p) => p.name.startsWith('evil-plate')), false);
    });

    await pin('the plate NEVER mutates — export carries no write verbs for rows', async () => {
        const mutators = Object.keys(plates).filter((k) =>
            /^(add|set|update|delete|clear|write|edit|patch|append|put)/i.test(k) && k !== 'clearState');
        assert.deepStrictEqual(mutators, [], 'no unowned write verbs beside clearState (a test seam)');
        // render twice with different "viewer" objects does not change stored rows
        // renderedAt is a per-call stamp on an otherwise immutable export — strip it
        // before the strict compare, so a 1ms clock boundary can never flake the pin
        const plateExportOf = () => {
            const e = plates.renderPlate('guild-storefront', {});
            delete e.renderedAt;
            return JSON.stringify(e);
        };
        const before = plateExportOf();
        plates.renderPlate('guild-storefront', { limit: 2 });
        assert.strictEqual(plateExportOf(), before);
    });

    await pin('unknown plate / unknown channel / dup names refuse typed', async () => {
        assert.strictEqual(plates.renderPlate('no-such-plate').code, 'E_PLATE_UNKNOWN');
        assert.strictEqual(
            plates.createPlate({ name: 'x1', channels: ['ghost'], template: { a: 'b' } }).code,
            'E_PLATE_UNKNOWN_CHANNEL'
        );
        assert.strictEqual(
            plates.createPlate({ name: 'guild-storefront', channels: ['market-listings'], template: { a: 'b' } }).code,
            'E_PLATE_DUPLICATE'
        );
        assert.strictEqual(
            plates.registerChannel({ name: 'market-listings', module: 'm', rows: publicMarketRows, visibility: 'public' }).code,
            'E_CHANNEL_DUPLICATE'
        );
    });

    await pin('multi-channel plate: one derivation serves both channels with per-row identity', async () => {
        // second channel from the forum module (decision chapters)
        plates.registerChannel({
            name: 'forum-chapters', module: 'forum', rows: () => ([
                { id: 'ch_7', version: 1, at: 1200, title: 'Chapter 7', status: 'open' }
            ]), visibility: 'public'
        });
        plates.createPlate({
            name: 'tavern-board', channels: ['market-listings', 'forum-chapters'],
            template: { title: 'title', status: 'status' }
        });
        const out = plates.renderPlate('tavern-board', {});
        assert.strictEqual(out.count, 4);
        assert.deepStrictEqual(
            new Set(out.rows.map((r) => r.channel)),
            new Set(['market-listings', 'forum-chapters'])
        );
        // since filter rides the rows' own `at`
        const recent = plates.renderPlate('tavern-board', { since: 1000 });
        assert.strictEqual(recent.total, 3);
    });

    await pin('typed refusal codes ride the CODES table (no phantom names)', async () => {
        for (const code of ['E_CHANNEL_VISIBILITY', 'E_PLATE_TEMPLATE', 'E_PLATE_UNKNOWN', 'E_CHANNEL_DUPLICATE']) {
            assert.notStrictEqual(errors.CODES[code], undefined, code + ' must be a real code');
        }
    });

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
