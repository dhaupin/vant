#!/usr/bin/env node
/**
 * Market escrow debit-on-trade tests (pass 48, next-wave candidate 1)
 *
 * Closes the economic loop: trades used to release their escrow hold
 * without ever debiting the buyer (escrow.hold records a condition
 * entry; release deletes it — no budget moved). Now the settle point
 * calls escrow.recordSpend for NUMERIC prices.
 *   1. numeric trade -> buyer budget actually debited (spent/available
 *      move, persisted), trade.debit records the settlement
 *   2. barter (string price) -> no escrow cost, trade.debit null
 *   3. insufficient budget -> trade refused BEFORE settlement
 *   4. debit refusal (runaway guard) -> unwind: reservation + hold
 *      released, listing not consumed, structured error
 *
 * Run: node test/market-debit.test.js
 */

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const results = { passed: 0, failed: 0 };

function test(name, fn) {
    return Promise.resolve()
        .then(fn)
        .then(() => {
            results.passed++;
            console.log(`  ✓ ${name}`);
        })
        .catch((e) => {
            results.failed++;
            console.log(`  ✗ ${name}: ${e.message.split('\n')[0]}`);
        });
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

require(path.join(ROOT, 'lib', 'sandbox')).defaultSandbox.setCapabilities({
    canRead: true, canWrite: true, canNetwork: true, canTrade: true, canSpawn: true
});

// Clean brain state BEFORE requiring modules (load-on-init races rm):
// market/trust state + escrow budgets (orgchart/escrow.json).
fs.rmSync(path.join(ROOT, 'models', 'private', 'vant', 'state'), { recursive: true, force: true });
fs.rmSync(path.join(ROOT, 'models', 'private', 'vant', 'orgchart'), { recursive: true, force: true });

const market = require(path.join(ROOT, 'lib', 'market'));
const escrowMod = require(path.join(ROOT, 'lib', 'escrow'));

const CONSENT = (who) => ({ agentId: who, consentGiven: true });
const freshEscrow = () => new escrowMod.Escrow(); // loads persisted budgets

async function listFor(seller, price) {
    const listing = await market.list('knowledge', {
        title: 'p48 listing ' + seller + ' ' + String(price),
        summary: 'debit pin',
        seller,
        price
    }, CONSENT(seller));
    assert(!listing.error, 'list failed: ' + JSON.stringify(listing));
    return listing;
}

async function main() {
    console.log('\n💸 MARKET DEBIT-ON-TRADE TESTS (pass 48)\n');

    await test('numeric trade debits the buyer (budget moves, persisted, trade.debit recorded)', async () => {
        const listing = await listFor('p48-seller-a', 25);
        const trade = await market.trade(listing.id, 'p48-buyer-a', CONSENT('p48-buyer-a'));
        assert(!trade.error, 'trade failed: ' + JSON.stringify(trade));
        assert(trade.debit && trade.debit.amount === 25 && trade.debit.agent === 'p48-buyer-a',
            'trade.debit missing/wrong: ' + JSON.stringify(trade.debit));

        const budget = freshEscrow().getBudget('p48-buyer-a');
        assert(budget.spent === 25, 'buyer not debited: spent=' + budget.spent);
        assert(budget.available === budget.limit - 25, 'available not reduced: ' + budget.available);

        // Persisted (a fresh instance reads orgchart/escrow.json — already
        // proven above; assert the spend survives a second instance read).
        const again = freshEscrow().getBudget('p48-buyer-a');
        assert(again.spent === 25, 'debit not persisted');
    });

    await test('barter trade: no escrow debit, trade.debit null', async () => {
        const listing = await listFor('p48-seller-b', 'favor:review');
        const trade = await market.trade(listing.id, 'p48-buyer-b', CONSENT('p48-buyer-b'));
        assert(!trade.error, 'barter trade failed: ' + JSON.stringify(trade));
        assert(trade.debit === null, 'barter debited escrow: ' + JSON.stringify(trade.debit));
        const budget = freshEscrow().getBudget('p48-buyer-b');
        assert(budget.spent === 0, 'barter buyer spent escrow credit: ' + budget.spent);
    });

    await test('insufficient budget: trade refused before settlement', async () => {
        freshEscrow().setBudgetLimit('p48-poor-buyer', 5);
        const listing = await listFor('p48-seller-c', 25);
        const trade = await market.trade(listing.id, 'p48-poor-buyer', CONSENT('p48-poor-buyer'));
        assert(trade.error === 'Insufficient budget', 'expected budget refusal: ' + JSON.stringify(trade));
        const fresh = await market.get(listing.id);
        assert(fresh.trades === 0, 'refused trade consumed supply: ' + fresh.trades);
        const budget = freshEscrow().getBudget('p48-poor-buyer');
        assert(budget.spent === 0, 'refused buyer was debited');
    });

    await test('debit refusal unwinds: reservation + hold released, listing not consumed', async () => {
        // Trip the runaway guard for a dedicated buyer: >30 spends/min.
        const hammer = freshEscrow();
        for (let i = 0; i < 31; i++) hammer.recordSpend('p48-runaway-buyer', 1);

        const listing = await listFor('p48-seller-d', 10);
        const trade = await market.trade(listing.id, 'p48-runaway-buyer', CONSENT('p48-runaway-buyer'));
        assert(trade.error && /debit/i.test(trade.error), 'expected debit refusal: ' + JSON.stringify(trade));
        assert(trade.code === 'E_RUNAWAY', 'runaway code not surfaced: ' + JSON.stringify(trade));

        const fresh = await market.get(listing.id);
        assert(fresh.trades === 0, 'unwind failed: trade consumed: ' + fresh.trades);
        const budget = freshEscrow().getBudget('p48-runaway-buyer');
        // 31 hammer attempts, but the 31st is itself refused (30/min) —
        // recorded spend is 30, and the trade's debit attempt adds nothing.
        assert(budget.spent === 30, 'unexpected spend after unwind: ' + budget.spent);
    });

    console.log(`\n=== Market debit-on-trade: ${results.passed} passed, ${results.failed} failed ===\n`);
    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error('Test harness error:', e);
    process.exit(1);
});
