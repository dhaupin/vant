#!/usr/bin/env node
/**
 * Proactive tombstone semantics for the append-only modules (pass 99)
 *
 * market and settlement are append-only today — nothing hard-deletes a
 * listing/bid/trade or a settlement claim — so adopt-unseen alone was
 * correct. But the merge only had a tombstone guard for the DELETE-capable
 * modules (node-registry unregister, consensus reap). pass 99 gives market
 * and settlement the same seen-set + tombstone-aware merge up front, so the
 * moment a delete path lands it is already safe: the id stays in `_seen*`,
 * the row leaves the live map, and a peer's stale snapshot can never
 * resurrect it.
 *
 * Because no real delete API exists yet, the delete is modelled with the
 * `_deleteForTest` seam (drop the row, keep the seen entry) — exactly what a
 * future `removeListing`/`forgetSettlement` would do.
 *
 * Gated here:
 *   A. market: a deleted (seen-but-absent) listing is NOT resurrected by a
 *      stale peer snapshot, while an unseen newcomer IS adopted and the
 *      process's own rows survive.
 *   B. settlement: same invariant over the claims ledger.
 *
 * Run: node test/state-store-tombstones.test.js
 */

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const BRAIN = 'qc-tombstone-gate';
process.env.VANT_BRAIN = BRAIN; // isolate state from the real brains

const DIR = path.join(ROOT, 'models', 'private', BRAIN);
const MARKET_STATE = path.join(DIR, 'state', 'market.json');
const SETTLEMENT_STATE = path.join(DIR, 'state', 'settlements.json');

const results = { passed: 0, failed: 0 };

async function test(name, fn) {
    try {
        await fn();
        results.passed++;
        console.log(`  ✓ ${name}`);
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function wipe() { fs.rmSync(DIR, { recursive: true, force: true }); }
function writeStale(p, data) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 2));
}
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return {}; } }

(async () => {
    console.log('\n🪦 STATE-STORE TOMBSTONE TESTS (pass 99)\n');

    // ============================================
    // GATE A — market: seen-but-absent listing is not resurrected
    // ============================================
    await test('market: deleted (seen-but-absent) listing NOT resurrected by stale snapshot', async () => {
        wipe();
        const market = require(path.join(ROOT, 'lib', 'market'));
        market.clearState();

        const ctx = { agentId: 'tomb-agent', consentGiven: true };
        const a = await market.list('knowledge', { title: 'Victim', summary: 'gone soon', seller: 's1' }, ctx);
        const b = await market.list('knowledge', { title: 'Keeper', summary: 'stays', seller: 's2' }, ctx);
        assert(a && a.id && b && b.id, 'listings were not created');

        // Model a future hard-delete: row leaves the live map, id stays "seen".
        market._deleteForTest('listing', a.id);

        // A crashed peer's STALE snapshot: the dead listing back + an unseen newcomer.
        writeStale(MARKET_STATE, {
            kind: 'vant-protocol-state', module: 'market',
            listings: [
                { id: a.id, type: 'knowledge', title: 'Victim', seller: 's1', tags: [], supply: null },
                { id: 'listing_phantom_99', type: 'insight', title: 'Newcomer', seller: 's3', tags: [], supply: null }
            ],
            bids: [], trades: [], savedAt: Date.now()
        });
        market._persistNow(); // persistMerged → merge the stale snapshot

        assert(market.get(a.id) === null, 'deleted listing was resurrected (tombstone failed)');
        assert(market.get('listing_phantom_99'), 'unseen newcomer was not adopted');
        assert(market.get(b.id), 'process-own listing was lost to the merge');

        const disk = readJson(MARKET_STATE);
        const ids = (disk.listings || []).map((l) => l.id);
        assert(!ids.includes(a.id), 'deleted listing leaked back onto disk: ' + ids);
        assert(ids.includes(b.id) && ids.includes('listing_phantom_99'), 'union write incomplete: ' + ids);
    });

    // ============================================
    // GATE B — settlement: seen-but-absent claim is not resurrected
    // ============================================
    await test('settlement: deleted (seen-but-absent) claim NOT resurrected by stale snapshot', async () => {
        wipe();
        // Seed one claim on disk so requiring the module hydrates it (marks seen).
        writeStale(SETTLEMENT_STATE, {
            kind: 'vant-protocol-state', module: 'settlement',
            settlements: [
                { id: 'stl_victim99', kind: 'mesh_settlement', role: 'owner-claim', listingId: 'listing_x', price: 5, seller: 's1', status: 'recorded' }
            ],
            savedAt: Date.now()
        });
        const settlement = require(path.join(ROOT, 'lib', 'settlement'));
        assert(settlement.get('stl_victim99'), 'seed claim was not hydrated');

        // Model a future hard-delete of the claim.
        settlement._deleteForTest('stl_victim99');

        // Stale peer snapshot: dead claim back + an unseen newcomer claim.
        writeStale(SETTLEMENT_STATE, {
            kind: 'vant-protocol-state', module: 'settlement',
            settlements: [
                { id: 'stl_victim99', kind: 'mesh_settlement', role: 'owner-claim', status: 'recorded' },
                { id: 'stl_newcomer99', kind: 'mesh_settlement', role: 'partner-paid', status: 'recorded' }
            ],
            savedAt: Date.now()
        });
        settlement._persistNow();

        assert(settlement.get('stl_victim99') === null, 'deleted claim was resurrected (tombstone failed)');
        assert(settlement.get('stl_newcomer99'), 'unseen newcomer claim was not adopted');

        const disk = readJson(SETTLEMENT_STATE);
        const ids = (disk.settlements || []).map((s) => s.id);
        assert(!ids.includes('stl_victim99'), 'deleted claim leaked back onto disk: ' + ids);
        assert(ids.includes('stl_newcomer99'), 'union write missing newcomer: ' + ids);
    });

    console.log(`\n${results.passed} passed, ${results.failed} failed`);
    wipe();
    process.exit(results.failed > 0 ? 1 : 0);
})().catch((e) => {
    console.error('fatal:', e.message);
    wipe();
    process.exit(1);
});
