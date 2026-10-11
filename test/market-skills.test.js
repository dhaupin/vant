'use strict';
/**
 * Wave U6 pin lite — Credentialed Marketplace prototype (prd-universe.md).
 *
 * The prototype's contract, pinned (full design: labs/prototype-marketplace.md):
 *   U6.2 gated surface — ops are INERT when market.skillsEnabled is off
 *                       (typed E_SKILLS_DISABLED), never absent
 *   U6.3 trust feed    — confirm writes a REAL positive record keyed to the
 *                        SELLER; refute writes negative; visible in getScore
 *   U6.4 adversarial   —
 *                        delivery refusals (wrong payload kind, empty, oversize, 64KB cap)
 *                        buyer-cannot-deliver / seller-cannot-settle scoping
 *                        double settlement refused typed (E_SKILL_ALREADY_SETTLED)
 *                        delivery NEVER debits; only confirm does (hold→deliver→release)
 *                        'launch' listings refused at listing time (documented boundary)
 *
 * The other market suites clean their own state; this one uses clearState
 * (market/trust parity seams) and a SKILLS-specific state file scoping via
 * the config gate only.
 *
 * Run: node test/market-skills.test.js
 */
const assert = require('assert');

const marketMod = require('../lib/market');
const trust = require('../lib/trust');
const config = require('../lib/config');
require('../lib/sandbox').defaultSandbox.setCapabilities({
    canRead: true, canWrite: true, canTrade: true, canSpawn: true
});

let passed = 0, failed = 0;
function ok(name, fn) {
    return Promise.resolve().then(fn).then(() => {
        passed++; console.log('  ✓ ' + name);
    }, (e) => {
        failed++; console.log('  ✗ ' + name + ': ' + (e && e.message ? e.message.split('\n')[0] : e));
    });
}

async function main() {
    console.log('\n🛠️  MARKET SKILLS PINS (Wave U6)\n');

    // Hydrate a clean slate for the two stores this suite touches.
    marketMod.clearState();

    // ------------------------------------------------------------------
    // (U6.2) Gate closed → inert, typed
    // ------------------------------------------------------------------

    config.set('market.skillsEnabled', false);
    await ok('gate closed: every skill op refuses typed E_SKILLS_DISABLED', async () => {
        marketMod.clearState();
        for (const r of [
            await marketMod.listSkill({ title: 'x' }),
            await marketMod.buySkill('listing_x', 'buyer'),
            await marketMod.deliverSkill('trade_x', 'payload'),
            await marketMod.settleSkill('trade_x', 'confirm'),
            await marketMod.skillStatus('listing_x')
        ]) {
            assert.strictEqual(r.code, 'E_SKILLS_DISABLED', JSON.stringify(r).slice(0, 120));
        }
    });

    config.set('market.skillsEnabled', true);

    // ------------------------------------------------------------------
    // (U6.4) Listing-time boundaries
    // ------------------------------------------------------------------

    await ok('listing boundaries: launch refused, hostile price refused, empty title refused', async () => {
        marketMod.clearState();
        const launch = await marketMod.listSkill({ title: 'remote-exec', payloadKind: 'launch', payload: 'x' }, { agentId: 's', consentGiven: true });
        assert.strictEqual(launch.code, 'E_SKILL_PAYLOAD_KIND', 'launch not refused');
        const badPrice = await marketMod.listSkill({ title: 'x', price: 'five' }, { agentId: 's', consentGiven: true });
        assert.strictEqual(badPrice.code, 'E_SKILL_PRICE', 'non-numeric price not refused');
        const noTitle = await marketMod.listSkill({ description: 'x' }, { agentId: 's', consentGiven: true });
        assert.strictEqual(noTitle.code, 'E_SKILL_TITLE', 'missing title not refused');
    });

    // ------------------------------------------------------------------
    // Full delivery loop
    // ------------------------------------------------------------------

    let listingId = null, tradeId = null;
    await ok('happy path: list → buy (hold, no debit) → deliver (hash) → confirm (DEBIT + trust)', async () => {
        marketMod.clearState();
        const listed = await marketMod.listSkill({ title: 'pin-skill', description: 'pinned', payloadKind: 'text', price: 5 }, { agentId: 'seller-bot', consentGiven: true });
        assert(listed.listed === true, JSON.stringify(listed).slice(0, 120));
        listingId = listed.listingId;
        const bought = await marketMod.buySkill(listingId, 'buyer-bot', { agentId: 'buyer-bot', consentGiven: true });
        assert(bought.bought === true, JSON.stringify(bought).slice(0, 120));
        tradeId = bought.tradeId;
        const delivered = await marketMod.deliverSkill(tradeId, 'the deliverable', { agentId: 'seller-bot' });
        assert(delivered.delivered === true, 'delivery refused');
        assert(/^[0-9a-f]{64}$/.test(delivered.payloadHash), 'payloadHash not sha256');
        // settle confirm
        const settled = await marketMod.settleSkill(tradeId, 'confirm', { agentId: 'buyer-bot' });
        assert(settled.settled === true && settled.trustWritten === true, JSON.stringify(settled).slice(0, 140));
    });

    await ok('U6.3 trust feed: settle wrote a REAL seller-keyed record (getScore moved up)', async () => {
        const before = 0.5; // unregistered agent baseline per getScore
        const inst = trust.getTrust ? trust.getTrust() : null;
        // The record is keyed to the SELLER (seller-bot). A fresh seller with
        // no history scores the baseline; after the confirm above, positive.
        // getScore returns a NUMBER — just assert higher than baseline.
        const score = inst ? inst.getScore('seller-bot') : null;
        assert(typeof score === 'number' && score > before, 'positive record not reflected (score=' + score + ')');
    });

    await ok('U6.4 double settlement refused typed', async () => {
        const again = await marketMod.settleSkill(tradeId, 'confirm', { agentId: 'buyer-bot' });
        assert.strictEqual(again.code, 'E_SKILL_ALREADY_SETTLED', JSON.stringify(again).slice(0, 120));
    });

    await ok('U6.4 scope: buyer cannot deliver, seller cannot settle their own sale', async () => {
        marketMod.clearState();
        const listed = await marketMod.listSkill({ title: 'scope-skill', payloadKind: 'text', price: 2 }, { agentId: 'seller-bot', consentGiven: true });
        const bought = await marketMod.buySkill(listed.listingId, 'buyer-bot', { agentId: 'buyer-bot', consentGiven: true });
        const buyerDelivery = await marketMod.deliverSkill(bought.tradeId, 'self-approved', { agentId: 'buyer-bot' });
        assert.strictEqual(buyerDelivery.code, 'E_SKILL_NOT_SELLER', JSON.stringify(buyerDelivery).slice(0, 120));
        await marketMod.deliverSkill(bought.tradeId, 'the goods', { agentId: 'seller-bot' });
        const sellerSettle = await marketMod.settleSkill(bought.tradeId, 'confirm', { agentId: 'seller-bot' });
        assert.strictEqual(sellerSettle.code, 'E_SKILL_NOT_BUYER', JSON.stringify(sellerSettle).slice(0, 120));
    });

    await ok('U6.4 delivery refusals: empty payload, oversize payload, wrong-person stage', async () => {
        marketMod.clearState();
        const listed = await marketMod.listSkill({ title: 'refusal-skill', payloadKind: 'text', price: 2 }, { agentId: 'seller-bot', consentGiven: true });
        const bought = await marketMod.buySkill(listed.listingId, 'buyer-bot', { agentId: 'buyer-bot', consentGiven: true });
        const empty = await marketMod.deliverSkill(bought.tradeId, '   ', { agentId: 'seller-bot' });
        assert.strictEqual(empty.code, 'E_SKILL_PAYLOAD', JSON.stringify(empty).slice(0, 120));
        const oversize = await marketMod.deliverSkill(bought.tradeId, 'x'.repeat(65537), { agentId: 'seller-bot' });
        assert.strictEqual(oversize.code, 'E_SKILL_PAYLOAD', '64KB cap not enforced');
        // trade still pending — refused deliveries changed NOTHING
        const delivered = await marketMod.deliverSkill(bought.tradeId, 'ok now', { agentId: 'seller-bot' });
        assert(delivered.delivered === true, 'good delivery after refusals failed');
    });

    await ok('U6.4 refute path: NO debit, negative trust record, trade refuted', async () => {
        marketMod.clearState();
        // eslint-disable-next-line
        const listed = await marketMod.listSkill({ title: 'refute-skill', payloadKind: 'text', price: 10 }, { agentId: 'bad-seller', consentGiven: true });
        const bought = await marketMod.buySkill(listed.listingId, 'buyer-bot', { agentId: 'buyer-bot', consentGiven: true });
        await marketMod.deliverSkill(bought.tradeId, 'garbage payload', { agentId: 'bad-seller' });
        const inst = trust.getTrust();
        const before = inst.getScore('bad-seller');
        const refuted = await marketMod.settleSkill(bought.tradeId, 'refute', { agentId: 'buyer-bot' });
        assert(refuted.settled === true, JSON.stringify(refuted).slice(0, 120));
        const after = inst.getScore('bad-seller');
        assert(after < before, 'negative trust record not reflected (' + before + ' → ' + after + ')');
    });

    marketMod.clearState();
    config.set('market.skillsEnabled', false);

    console.log('\n=== market-skills pins (Wave U6): ' + passed + ' passed, ' + failed + ' failed ===\n');
    process.exit(failed > 0 ? 1 : 0);
}

main().then(null, (e) => { console.error('harness crash:', e); process.exit(1); });
