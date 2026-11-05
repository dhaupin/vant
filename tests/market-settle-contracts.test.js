#!/usr/bin/env node
/**
 * Market SETTLE-BY-THE-RECORD pins (wave C, vant#333 + vant#334).
 *
 * 1. vend-able settle contracts (#333): the template gate refuses shapes
 *    fail-closed (and skill-only surface), the buyer's confirm key only
 *    triggers the deterministic re-verification, unmet clauses refuse typed
 *    with the unmet list, met clauses settle with contractMode:true, and
 *    refute never consults the record (release path unchanged).
 * 2. settle-verifier seam (#334): the registered verdict IS the settle
 *    decision (a release never bites the seller's trust feed), a non-
 *    deterministic verdict withholds settlement typed.
 * 3. trustMode per-tenant opt-out (#334): 'off' writes no feed, reads no
 *    reputation, and reports trustWritten honestly; default 'record' unchanged.
 *
 * DISCRIMINATING: stashing the lib/market.js wave-C fixes flips the pins.
 */

const config = require('../lib/config');
const marketMod = require('../lib/market');
const trust = require('../lib/trust');

const results = { passed: 0, failed: 0 };
const order = [];
function ok(name, fn) { order.push({ name, fn }); }
function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
    return true;
}

async function settle(listingId, buyer, extras = {}, contract = null) {
    const listed = await marketMod.listSkill(
        Object.assign({
            title: 'pin-skill', description: 'pinned', payloadKind: 'text', price: 5,
            ...(contract ? { contract } : {})
        }, extras.contractTemplate ? extras.contractTemplate : {}),
        { agentId: 'settle-seller', consentGiven: true }
    );
    assert(listed.listed === true, JSON.stringify(listed).slice(0, 160));
    const bought = await marketMod.buySkill(listed.listingId, buyer, { agentId: buyer, consentGiven: true });
    assert(bought.bought === true, JSON.stringify(bought).slice(0, 160));
    return { listingId: listed.listingId, tradeId: bought.tradeId };
}

async function deliver(listingId, tradeId, body, seller = 'settle-seller') {
    const delivered = await marketMod.deliverSkill(tradeId, body, { agentId: seller });
    assert(delivered.delivered === true, JSON.stringify(delivered).slice(0, 160));
    return delivered;
}

async function main() {
    console.log('\n🛒 MARKET SETTLE-BY-THE-RECORD PINS (wave C, vant#333/#334)\n');
    marketMod.clearState();
    config.set('market.skillsEnabled', true);

    for (const { name, fn } of order) {
        try {
            await fn();
            results.passed++;
            console.log(`  ✓ ${name}`);
        } catch (e) {
            results.failed++;
            console.log(`  ✗ ${name}: ${e.message}`);
        }
    }

    config.set('market.trustMode', 'record');
    config.set('market.skillsEnabled', false);
    marketMod.clearState();
    console.log(`\nPassed:  ${results.passed}`);
    console.log(`Failed:  ${results.failed}`);
    process.exit(results.failed > 0 ? 1 : 0);
}

// ------------------------------------------------------------------
// 1. contract template gate (fail-closed, skill-only)
// ------------------------------------------------------------------

ok('a generic (non-skill) listing carrying a settle contract is refused typed', async () => {
    marketMod.clearState();
    const r = await marketMod.list('insight', { title: 'g', contract: { payloadIncludes: ['x'] } }, { agentId: 'settle-seller', consentGiven: true });
    assert(r.code === 'E_SKILL_CONTRACT', JSON.stringify(r).slice(0, 140));
});

ok('template hygiene: free-text clause keys, malformed tokens and bad bounds all refuse', async () => {
    marketMod.clearState();
    const stringy = await marketMod.listSkill({ title: 'x', contract: 'rubber-stamp' }, { agentId: 's', consentGiven: true });
    assert(stringy.code === 'E_SKILL_CONTRACT', JSON.stringify(stringy).slice(0, 140));
    const unknown = await marketMod.listSkill({ title: 'x', contract: { includes: 'secret-handshake' } }, { agentId: 's', consentGiven: true });
    assert(unknown.code === 'E_SKILL_CONTRACT', 'free-text clause key accepted');
    const emptyTokens = await marketMod.listSkill({ title: 'x', contract: { payloadIncludes: [] } }, { agentId: 's', consentGiven: true });
    assert(emptyTokens.code === 'E_SKILL_CONTRACT', 'empty token list accepted');
    const badBounds = await marketMod.listSkill({ title: 'x', contract: { payloadLength: { gte: 100, lte: 10 } } }, { agentId: 's', consentGiven: true });
    assert(badBounds.code === 'E_SKILL_CONTRACT', 'gte > lte accepted');
    const literal = await marketMod.listSkill({ title: 'x', contract: { payloadLength: [10] } }, { agentId: 's', consentGiven: true });
    assert(literal.code === 'E_SKILL_CONTRACT', 'non-object bounds accepted');
});

// ------------------------------------------------------------------
// 1. the deterministic settle (the record is the judge)
// ------------------------------------------------------------------

ok('unmet clauses refuse the confirm typed with the unmet list; the hold is untouched', async () => {
    marketMod.clearState();
    const t = await settle('L', 'contract-buyer', {}, { payloadIncludes: ['must-have-token'], payloadLength: { lte: 100 } });
    await deliver(t.listingId, t.tradeId, 'a payload that misses the clause');
    const refused = await marketMod.settleSkill(t.tradeId, 'confirm', { agentId: 'contract-buyer' });
    assert(refused.code === 'E_SKILL_CONTRACT', JSON.stringify(refused).slice(0, 160));
    assert(Array.isArray(refused.unmet) && refused.unmet.some((u) => u.startsWith('payloadIncludes:')),
        'unmet list lost the failing clause: ' + JSON.stringify(refused.unmet));
    const status = await marketMod.skillStatus(t.listingId);
    assert(status.settleContract && Array.isArray(status.settleContract.payloadIncludes),
        'the contract is not buyer-visible on the status surface: ' + JSON.stringify(status.settleContract));
    const evidence = marketMod.contractCheck(t.tradeId);
    assert(evidence.mode === true && evidence.ok === false, 'contractCheck lost the evidence read');
});

ok('met clauses settle deterministically: the buyer key only triggered the re-verification', async () => {
    marketMod.clearState();
    const t = await settle('L', 'contract-buyer-2', {}, { payloadIncludes: ['must-have-token'], payloadLength: { gte: 5, lte: 200 } });
    await deliver(t.listingId, t.tradeId, 'the deliverable carries must-have-token inside');
    const settled = await marketMod.settleSkill(t.tradeId, 'confirm', { agentId: 'contract-buyer-2' });
    assert(settled.settled === true && settled.decision === 'confirm' && settled.contractMode === true,
        JSON.stringify(settled).slice(0, 160));
});

ok('refute never consults the record: a contract listing still releases on the buyer hand', async () => {
    marketMod.clearState();
    const t = await settle('L', 'contract-buyer-3', {}, { payloadIncludes: ['never-present-token'] });
    await deliver(t.listingId, t.tradeId, 'whatever the seller delivered');
    const refuted = await marketMod.settleSkill(t.tradeId, 'refute', { agentId: 'contract-buyer-3' });
    assert(refuted.settled === true && refuted.decision === 'refute',
        JSON.stringify(refuted).slice(0, 160));
});

// ------------------------------------------------------------------
// 2. the settle-verifier seam
// ------------------------------------------------------------------

ok('seam release: the deterministic verdict IS the settle, and it never bites the trust feed', async () => {
    marketMod.clearState();
    const t = await settle('L', 'verifier-buyer');
    await deliver(t.listingId, t.tradeId, 'delivered body');
    const inst = trust.getTrust ? trust.getTrust() : null;
    const before = inst ? inst.getScore('settle-seller') : null;
    const reg = marketMod.registerSettleVerifier(t.tradeId, () => ({ verdict: 'release' }));
    assert(reg.registered === true, JSON.stringify(reg).slice(0, 140));
    const settled = await marketMod.settleSkill(t.tradeId, 'confirm', { agentId: 'verifier-buyer' });
    assert(settled.settled === true && settled.decision === 'refute' && settled.verifierRuled === true,
        JSON.stringify(settled).slice(0, 160));
    const after = inst ? inst.getScore('settle-seller') : null;
    assert(after === before, 'a seam-ruled release wrote a negative feed (' + before + ' -> ' + after + ')');
});

ok('seam confirm: the record settles the trade the buyer triggered', async () => {
    marketMod.clearState();
    const t = await settle('L', 'verifier-buyer-2');
    await deliver(t.listingId, t.tradeId, 'delivered body');
    marketMod.registerSettleVerifier(t.tradeId, () => ({ verdict: 'confirm' }));
    const settled = await marketMod.settleSkill(t.tradeId, 'confirm', { agentId: 'verifier-buyer-2' });
    assert(settled.settled === true && settled.decision === 'confirm' && settled.verifierRuled === true,
        JSON.stringify(settled).slice(0, 160));
});

ok('seam hygiene: a non-deterministic verdict or a throwing verifier withholds settlement typed', async () => {
    marketMod.clearState();
    const t1 = await settle('L', 'verifier-buyer-3');
    await deliver(t1.listingId, t1.tradeId, 'body');
    marketMod.registerSettleVerifier(t1.tradeId, () => ({ verdict: 'banana' }));
    const w1 = await marketMod.settleSkill(t1.tradeId, 'confirm', { agentId: 'verifier-buyer-3' });
    assert(w1.code === 'E_SKILL_VERIFIER', JSON.stringify(w1).slice(0, 160));
    const t2 = await settle('L', 'verifier-buyer-4');
    await deliver(t2.listingId, t2.tradeId, 'body');
    marketMod.registerSettleVerifier(t2.tradeId, () => { throw new Error('boom'); });
    const w2 = await marketMod.settleSkill(t2.tradeId, 'confirm', { agentId: 'verifier-buyer-4' });
    assert(w2.code === 'E_SKILL_VERIFIER', JSON.stringify(w2).slice(0, 160));
    const badReg = marketMod.registerSettleVerifier('nnnn-trade', () => ({}));
    assert(badReg.code === 'E_SKILL_ABSENT', 'registry registered against nothing');
    const badVerd = marketMod.registerSettleVerifier('nnnn-trade', 'not-a-function');
    assert(badVerd.code === 'E_SKILL_VERIFIER', 'non-function verifier accepted');
});

// ------------------------------------------------------------------
// 3. the trust layer as a per-tenant opt-out
// ------------------------------------------------------------------

ok("trustMode 'off': settle writes NO feed (trustWritten:false, honestly), reads NO reputation; default 'record' still writes", async () => {
    marketMod.clearState();
    // default record: trust written
    const tRecord = await settle('L', 'record-buyer');
    await deliver(tRecord.listingId, tRecord.tradeId, 'body', 'record-mode-seller');
    const rRecord = await marketMod.settleSkill(tRecord.tradeId, 'confirm', { agentId: 'record-buyer' });
    assert(rRecord.settled === true && rRecord.trustWritten === true, JSON.stringify(rRecord).slice(0, 160));

    // off: no write, honest flag, no reputation read
    config.set('market.trustMode', 'off');
    const tOff = await settle('L', 'off-buyer');
    await deliver(tOff.listingId, tOff.tradeId, 'body', 'off-mode-seller');
    const rOff = await marketMod.settleSkill(tOff.tradeId, 'confirm', { agentId: 'off-buyer' });
    assert(rOff.settled === true && rOff.trustWritten === false, JSON.stringify(rOff).slice(0, 160));
    const inst = trust.getTrust ? trust.getTrust() : null;
    const offScore = inst ? inst.getScore('off-mode-seller') : null;
    const baseline = inst ? inst.getScore('never-traded-' + Math.random()) : 0.5;
    assert(offScore === baseline, 'trust off still wrote a feed (' + offScore + ' vs baseline ' + baseline + ')');
    const st = await marketMod.skillStatus(tOff.listingId);
    assert(st.sellerReputation === null, "trustMode 'off' still surfaced a reputation read: " + JSON.stringify(st.sellerReputation));
});

// ------------------------------------------------------------------
main();
