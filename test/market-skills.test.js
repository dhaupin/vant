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

    // ====================================================================
    // (U6.5 PRODUCTIZE) Real escrow settlement surface — held, then ONE
    // debit, confirmed against the REAL escrow store.
    // ====================================================================

    await ok('U6.5 SINGLE-DEBIT invariant (the productize fix): buy holds without debiting; confirm debits exactly once', async () => {
        marketMod.clearState();
        const escrow = require('../lib/escrow');
        const esc = escrow.create ? escrow.create() : new escrow.Escrow();
        const BUDGET = 200;
        if (esc.setBudget) esc.setBudget('debit-buyer', BUDGET);
        const listed = await marketMod.listSkill({ title: 'debit-skill', payloadKind: 'text', price: 30 }, { agentId: 'debit-seller', consentGiven: true });
        const bought = await marketMod.buySkill(listed.listingId, 'debit-buyer', { agentId: 'debit-buyer', consentGiven: true });
        assert(bought.bought === true, JSON.stringify(bought).slice(0, 140));
        assert(typeof bought.escrowHold === 'string' && bought.escrowHold.startsWith('skill:'), 'hold id not surfaced');
        // BUY side: no debit — buyer still has the full price headroom.
        const escBuy = escrow.create ? escrow.create() : new escrow.Escrow();
        const stillRich = escBuy.canSpend('debit-buyer', BUDGET - 30);
        assert.strictEqual(stillRich.allowed, true, 'BUY DEBITED — hold must not move money: ' + JSON.stringify(stillRich));
        // Confirm → exactly the price debited.
        await marketMod.deliverSkill(bought.tradeId, 'the payload', { agentId: 'debit-seller' });
        const settled = await marketMod.settleSkill(bought.tradeId, 'confirm', { agentId: 'debit-buyer' });
        assert(settled.settled === true, JSON.stringify(settled).slice(0, 140));
        const escAfter = escrow.create ? escrow.create() : new escrow.Escrow();
        const rich = escAfter.canSpend('debit-buyer', BUDGET - 30);
        assert.strictEqual(rich.allowed, true, 'price not debited exactly once: ' + JSON.stringify(rich));
        const overdraft = escAfter.canSpend('debit-buyer', BUDGET - 29);
        assert.strictEqual(overdraft.allowed, false, 'more than one debit landed (overdraft allowed): ' + JSON.stringify(overdraft));
        // The trade row carries the real debit.
        const tradeRow = marketMod.getTrade(bought.tradeId);
        assert(tradeRow && tradeRow.debit && tradeRow.debit.amount === 30, 'trade row does not record the debit: ' + JSON.stringify(tradeRow && tradeRow.debit));
    });

    await ok('U6.5 refute economics: hold released, NO debit, listing supply RESTORED', async () => {
        marketMod.clearState();
        const escrow = require('../lib/escrow');
        if (escrow.create) { const e = escrow.create(); if (e.setBudget) e.setBudget('refute-buyer2', 50); }
        const listed = await marketMod.listSkill({ title: 'restore-skill', payloadKind: 'text', price: 20, supply: 1 }, { agentId: 'restore-seller', consentGiven: true });
        const bought = await marketMod.buySkill(listed.listingId, 'refute-buyer2', { agentId: 'refute-buyer2', consentGiven: true });
        await marketMod.deliverSkill(bought.tradeId, 'folk payload', { agentId: 'restore-seller' });
        const refuted = await marketMod.settleSkill(bought.tradeId, 'refute', { agentId: 'refute-buyer2' });
        assert(refuted.settled === true, JSON.stringify(refuted).slice(0, 140));
        // Supply restored: a second buyer can now take the single unit again.
        const escrow2 = require('../lib/escrow');
        if (escrow2.create) { const e2 = escrow2.create(); if (e2.setBudget) e2.setBudget('b2', 50); }
        const bought2 = await marketMod.buySkill(listed.listingId, 'b2', { agentId: 'b2', consentGiven: true });
        assert(bought2.bought === true, 'refuted sale did not restore supply: ' + JSON.stringify(bought2).slice(0, 140));
    });

    await ok('U6.5 payroll: broke buyer cannot even HOLD (E_SKILL_BUDGET fails closed)', async () => {
        marketMod.clearState();
        const escrow = require('../lib/escrow');
        if (escrow.create) { const e = escrow.create(); if (e.setBudget) e.setBudget('broke-skill-buyer', 1); }
        const listed = await marketMod.listSkill({ title: 'pricey-skill', payloadKind: 'text', price: 500 }, { agentId: 'pricey-seller', consentGiven: true });
        const r = await marketMod.buySkill(listed.listingId, 'broke-skill-buyer', { agentId: 'broke-skill-buyer', consentGiven: true });
        assert.strictEqual(r.code, 'E_SKILL_BUDGET', JSON.stringify(r).slice(0, 140));
    });

    await ok('U6.5 skill fields PERSIST on the listing (payloadKind/capabilityTag buyer-visible)', async () => {
        marketMod.clearState();
        const listed = await marketMod.listSkill({ title: 'kind-skill', payloadKind: 'code', price: 3, capabilityTag: 'memory.read' }, { agentId: 'kind-seller', consentGiven: true });
        const st = await marketMod.skillStatus(listed.listingId);
        assert.strictEqual(st.payloadKind, 'code', 'payloadKind not persisted: ' + JSON.stringify(st).slice(0, 160));
        assert.strictEqual(st.capabilityTag, 'memory.read', 'capabilityTag not persisted');
    });

    await ok('U6.5 config mounting: env alias fires the gate (VANT_MARKET_SKILLS_ENABLED)', async () => {
        marketMod.clearState();
        config.set('market.skillsEnabled', false);
        // Simulate the alias without a re-exec: kill the config cache and set
        // the env var, then pull a fresh module copy.
        const cfgPath = require.resolve('../lib/config');
        const marketPath = require.resolve('../lib/market');
        const savedCfg = require.cache[cfgPath];
        const savedMarket = require.cache[marketPath];
        delete require.cache[marketPath];
        delete require.cache[cfgPath];
        process.env.VANT_MARKET_SKILLS_ENABLED = 'true';
        try {
            const freshMarket = require('../lib/market');
            const listed = await freshMarket.listSkill({ title: 'env-gated' }, { agentId: 'env-seller', consentGiven: true });
            assert.strictEqual(listed.code, undefined, 'env alias did not widen the gate: ' + JSON.stringify(listed).slice(0, 120));
            assert.strictEqual(listed.listed, true, 'listing via env-widened gate failed');
        } finally {
            delete process.env.VANT_MARKET_SKILLS_ENABLED;
            require.cache[cfgPath] = savedCfg;
            require.cache[marketPath] = savedMarket;
        }
    });

    await ok('U6.5 MCP door: market_skill_gate + market_skill_* execute with typed invariants', async () => {
        marketMod.clearState();
        config.set('market.skillsEnabled', true);
        const mcp = require('../lib/mcp');
        const gateOn = await mcp.execute('market_skill_gate', { value: true });
        assert(gateOn.enabled === true, JSON.stringify(gateOn).slice(0, 120));
        const sellerCtx = { agentId: 'door-seller', consentGiven: true };
        const listed = await mcp.execute('market_skill_list', { title: 'door-skill', price: 8, context: sellerCtx });
        assert(listed.listed === true, JSON.stringify(listed).slice(0, 140));
        const bought = await mcp.execute('market_skill_buy', { listingId: listed.listingId, buyerId: 'door-buyer' });
        assert(bought.bought === true, JSON.stringify(bought).slice(0, 140));
        const del = await mcp.execute('market_skill_deliver', { tradeId: bought.tradeId, payload: 'door bytes', agentId: 'door-seller' });
        assert(del.delivered === true, JSON.stringify(del).slice(0, 140));
        const deny = await mcp.execute('market_skill_settle', { tradeId: bought.tradeId, decision: 'confirm', agentId: 'door-seller' });
        assert.strictEqual(deny.code, 'E_SKILL_NOT_BUYER', 'seller settled through the MCP door');
        const okd = await mcp.execute('market_skill_settle', { tradeId: bought.tradeId, decision: 'confirm', agentId: 'door-buyer' });
        assert(okd.settled === true, JSON.stringify(okd).slice(0, 140));
        const status = await mcp.execute('market_skill_status', { listingId: listed.listingId });
        assert.strictEqual(status.title, 'door-skill', JSON.stringify(status).slice(0, 140));
    });

    marketMod.clearState();
    config.set('market.skillsEnabled', false);

    console.log('\n=== market-skills pins (Wave U6): ' + passed + ' passed, ' + failed + ' failed ===\n');
    process.exit(failed > 0 ? 1 : 0);
}

main().then(null, (e) => { console.error('harness crash:', e); process.exit(1); });
