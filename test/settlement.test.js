#!/usr/bin/env node
/**
 * Cross-node settlement tests (pass 67, frame §5 gap 4 — weights & measures)
 *
 * Pins the first ECONOMIC leg of the Commons (lib/settlement.js):
 *   1. owner records a claim for a valid scoped listing settled by a
 *      member partner (claim carries envelope provenance; price + scope
 *      verified owner-side; debit lands on the PARTNER's books)
 *   2. idempotency: replayed invoice re-acks the SAME claim, no
 *      double-record
 *   3. insufficient budget: refused locally BEFORE the wire, no claim
 *   4. unknown listing: explicit refusal unwinds the partner (refund —
 *      never a silent timeout)
 *   5. buyer identity: an invoice claiming a non-vetted buyer is
 *      refused (E_BUYER_MISMATCH) and the attempted spend unwinds
 *   6. timeout unwinds: partner money never hangs in flight
 *   7. sender binding (pass-51 rule): a forged settle.record from a
 *      third node resolves nothing; only the addressed owner's reply does
 *   8. registered peers only: an unregistered origin gets no recorder
 *   9. malformed invoices are dropped (validation matrix)
 *
 * Harness note: dispatchers are driven directly (stubbed bus.send) —
 * the HMAC/version/scope envelope gates are crew-bus's own and are
 * pinned in test/crew-bus.test.js; these pins target settlement's OWN
 * gate stack. The live two-process wire is exercised in the star
 * exercise pattern (labs/node-crew/).
 *
 * Run: node test/settlement.test.js
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

require(path.join(ROOT, 'lib', 'sandbox')).defaultSandbox.setCapabilities({
    canRead: true, canWrite: true, canNetwork: true, canTrade: true, canSpawn: true
});

// Clean brain state BEFORE requiring modules (load-on-init races rm):
// settlement claims + market listings + escrow budgets.
fs.rmSync(path.join(ROOT, 'models', 'private', 'vant', 'state'), { recursive: true, force: true });
fs.rmSync(path.join(ROOT, 'models', 'private', 'vant', 'orgchart'), { recursive: true, force: true });

const crewBusMod = require(path.join(ROOT, 'lib', 'crew-bus'));
const settlement = require(path.join(ROOT, 'lib', 'settlement'));
const market = require(path.join(ROOT, 'lib', 'market'));
const escrowMod = require(path.join(ROOT, 'lib', 'escrow'));
const registry = require(path.join(ROOT, 'lib', 'node-registry'));
const teams = require(path.join(ROOT, 'lib', 'teams'));

// Twin in-process buses: owner (nova-crew, sells) + partner (buffy-labs, buys).
const SECRET = 'p67-settlement-secret';
const ownerBus = crewBusMod.createBus();
const partnerBus = crewBusMod.createBus();

// Direct-dispatch stub (no HTTP): source bus's send delivers to the
// target bus's dispatchers, mirroring crew-bus's ack shape.
function stubDeliver(sourceBus, targetBus) {
    const targetName = targetBus.status().name;
    sourceBus.send = async (nodeName, type, payload) => {
        if (nodeName !== targetName) throw new Error('Unknown crew node: ' + nodeName);
        const env = { event: 'crew.' + type, from: sourceBus.status().name, type, payload, ts: Date.now(), nonce: Math.random() };
        const handler = targetBus._state.dispatchers.get(type);
        if (handler) handler(env);
        return { ok: true, handlers: handler ? 1 : 0 };
    };
}

const ownerEscrow = () => new escrowMod.Escrow();
const partnerEscrow = () => new escrowMod.Escrow();

async function main() {
    console.log('\n⚖️ CROSS-NODE SETTLEMENT TESTS (pass 67 — weights & measures)\n');

    // ---- setup: JV org model + scoped listing on the owner node ----
    const org = teams.createOrg('p67-jv');
    const dept = teams.createDept('p67-eng', { org: org.id });
    const team = teams.createTeam('p67-core', { dept: dept.id });
    teams.assign('nova-lead', { org: org.id, dept: dept.id, team: team.id });
    teams.assign('buffy-lead', { org: org.id, dept: dept.id, team: team.id });
    const SCOPE = { owner: 'team:' + team.id, visibility: 'scope' };

    ownerBus.configure({ name: 'nova-crew', port: 1, secret: SECRET, agentId: 'nova-lead' });
    partnerBus.configure({ name: 'buffy-labs', port: 2, secret: SECRET, agentId: 'buffy-lead' });
    // BUS-level peer registration (the registered-peers gate reads this,
    // NOT the node-registry — same distinction as agora-sync's legs).
    ownerBus.registerNode({ name: 'buffy-labs', url: 'http://127.0.0.1:2', secret: SECRET });
    partnerBus.registerNode({ name: 'nova-crew', url: 'http://127.0.0.1:1', secret: SECRET });
    settlement.install(ownerBus);
    settlement.install(partnerBus);
    stubDeliver(ownerBus, partnerBus);
    stubDeliver(partnerBus, ownerBus);

    // Vetting identities for resolvePrincipal (owner-side buyer check).
    // THE pass-59 shape: the vetted agent identity carries the NODE NAME
    // ("both entries carry the node name"), so resolvePrincipal finds
    // the vetted principal AND the crew_ transport id and prefers the
    // principal. The transport self-registrations stand in for what
    // listen() writes for real.
    registry.clearState();
    registry.register({ id: 'nova-lead', name: 'nova-crew', host: '127.0.0.1', port: 1 });
    registry.register({ id: 'buffy-lead', name: 'buffy-labs', host: '127.0.0.1', port: 2 });
    registry.register({ id: 'crew_nova-crew', name: 'nova-crew', host: '127.0.0.1', port: 1, metadata: { kind: 'crew-node' } });
    registry.register({ id: 'crew_buffy-labs', name: 'buffy-labs', host: '127.0.0.1', port: 2, metadata: { kind: 'crew-node' } });

    const listing = await market.list('knowledge', {
        title: 'p67 JV deliverable', summary: 'cross-node settlement pin',
        seller: 'nova-lead', price: 12, scope: SCOPE
    }, { agentId: 'nova-lead', consentGiven: true });
    assert(!listing.error, 'listing failed: ' + JSON.stringify(listing));

    partnerEscrow().setBudgetLimit('buffy-lead', 100);

    await test('happy path: partner settles a scoped listing; owner records the claim; debit lands on the partner books', async () => {
        const inv = settlement.makeInvoice({
            listingId: listing.id, price: 12, buyer: 'buffy-lead', seller: 'nova-lead',
            topic: 'p67-jv-plan', memo: 'sprint-1 build'
        });
        const r = await settlement.sendInvoice(partnerBus, 'nova-crew', inv);
        assert(r.settled === true, 'not settled: ' + JSON.stringify(r));
        assert(r.record && r.record.role === 'owner-claim', 'record missing: ' + JSON.stringify(r.record));

        // The claim lives on the OWNER node (where the envelope landed —
        // the stub delivered it there). Envelope provenance, not payload.
        const claim = settlement.get(inv.settlementId);
        assert(claim, 'owner claim not recorded');
        assert(claim.node === 'buffy-labs', 'provenance not the envelope: ' + claim.node);
        assert(claim.buyer === 'buffy-lead', 'buyer not the vetted principal: ' + claim.buyer);
        assert(claim.price === 12 && claim.listingId === listing.id, 'claim fields wrong');
        assert(claim.scope && claim.scope.owner === SCOPE.owner, 'scope not carried on the claim');

        // Partner-side mirroring (role: 'partner-paid') happens in a REAL
        // two-process mesh — in this shared-ledger single process, the
        // owner's claim wins the merge (the claims Map is one file), and
        // the pin holds the merge-ONLY rule: exactly one record, the
        // owner's. (The two-process mirror is live-probed in the star
        // exercise pattern, labs/node-crew/.)
        const sameId = settlement.list().filter((s) => s.id === inv.settlementId);
        assert(sameId.length === 1 && sameId[0].role === 'owner-claim', 'merge not single-record: ' + JSON.stringify(sameId.map((s) => s.role)));

        // The DEBIT lives where the budget lives: the partner's books.
        const pb = partnerEscrow().getBudget('buffy-lead');
        assert(pb.spent === 12, 'partner not debited: spent=' + pb.spent);
        assert(pb.available === 88, 'partner available wrong: ' + pb.available);
        // The owner's escrow is UNTOUCHED on this leg (credit-side is a
        // deliberate non-goal — the claim is evidence, not income).
        const ob = ownerEscrow().getBudget('nova-lead');
        assert(ob.spent === 0, 'owner escrow moved on the settlement leg: ' + ob.spent);

        // The escrow HOLD was released on acceptance (no dangling holds).
        const holdCheck = partnerEscrow().checkHold('settlement:' + inv.settlementId);
        assert(holdCheck.held === false, 'hold not released: ' + JSON.stringify(holdCheck));
    });

    await test('idempotency: replayed invoice re-acks the SAME claim, no double-record', async () => {
        const inv = settlement.makeInvoice({
            listingId: listing.id, price: 12, buyer: 'buffy-lead', seller: 'nova-lead'
        });
        const r1 = await settlement.sendInvoice(partnerBus, 'nova-crew', inv);
        assert(r1.settled === true, 'first settle failed: ' + JSON.stringify(r1));
        const before = settlement.list().length;

        // Replay the same settlementId through the owner dispatcher directly.
        ownerBus._state.dispatchers.get('settle.request')({
            from: 'buffy-labs', type: 'settle.request',
            payload: { invoice: { ...inv, ts: Date.now() } }
        });
        await wait(50);
        assert(settlement.list().length === before, 'claim double-recorded on replay');
        assert(settlement.get(inv.settlementId), 'replayed id not re-acked (claim missing)');
    });

    await test('insufficient budget: refused locally BEFORE the wire, no claim', async () => {
        const spentBefore = partnerEscrow().getBudget('buffy-lead').spent;
        const inv = settlement.makeInvoice({
            listingId: listing.id, price: 99999, buyer: 'buffy-lead', seller: 'nova-lead'
        });
        const r = await settlement.sendInvoice(partnerBus, 'nova-crew', inv);
        assert(r.settled === false && r.code === 'E_BUDGET', 'expected local budget refusal: ' + JSON.stringify(r));
        assert(settlement.list().every((s) => s.id !== inv.settlementId), 'claim recorded for a refused invoice');
        const pb = partnerEscrow().getBudget('buffy-lead');
        assert(pb.spent === spentBefore, 'partner debited on refusal: spent=' + pb.spent + ' before=' + spentBefore);
    });

    await test('unknown listing: explicit refusal unwinds the partner (no silent timeout)', async () => {
        const spentBefore = partnerEscrow().getBudget('buffy-lead').spent;
        const inv = settlement.makeInvoice({
            listingId: 'listing_missing1', price: 5, buyer: 'buffy-lead', seller: 'nova-lead'
        });
        const r = await settlement.sendInvoice(partnerBus, 'nova-crew', inv);
        assert(r.settled === false && r.code === 'E_NO_LISTING', 'expected listing refusal: ' + JSON.stringify(r));
        const pb = partnerEscrow().getBudget('buffy-lead');
        assert(pb.spent === spentBefore, 'refund missing after refusal: spent=' + pb.spent + ' before=' + spentBefore);
    });

    await test('buyer identity: non-vetted buyer refused (E_BUYER_MISMATCH); attempted spend unwinds', async () => {
        partnerEscrow().setBudgetLimit('outsider', 50);
        const inv = settlement.makeInvoice({
            listingId: listing.id, price: 5, buyer: 'outsider', seller: 'nova-lead'
        });
        // The sending node's vetted principal is buffy-lead; the invoice
        // claims 'outsider' → identity gate refuses. The local debit for
        // 'outsider' (already spent before the wire) must be refunded.
        const r = await settlement.sendInvoice(partnerBus, 'nova-crew', inv);
        assert(r.settled === false && r.code === 'E_BUYER_MISMATCH', 'expected buyer-mismatch refusal: ' + JSON.stringify(r));
        const pb = partnerEscrow().getBudget('outsider');
        assert(pb.spent === 0, 'unwind missing after identity refusal: spent=' + pb.spent);
        assert(settlement.list().every((s) => s.id !== inv.settlementId), 'claim recorded for a mismatched buyer');
    });

    await test('timeout unwinds: partner money never hangs in flight', async () => {
        // A peer that is REGISTERED but has no settle recorder on the
        // other end: delivered (stub acks), no reply, timeout fires.
        // The deaf target is NAMED nova-crew so the stub's target check
        // passes and the envelope drops into a handlerless bus.
        const deafTarget = crewBusMod.createBus();
        deafTarget.configure({ name: 'nova-crew', port: 4, secret: SECRET });
        const lonelyBus = crewBusMod.createBus();
        lonelyBus.configure({ name: 'lonely-node', port: 3, secret: SECRET, agentId: 'buffy-lead' });
        lonelyBus.registerNode({ name: 'nova-crew', url: 'http://127.0.0.1:1', secret: SECRET });
        settlement.install(lonelyBus);
        stubDeliver(lonelyBus, deafTarget);

        partnerEscrow().setBudgetLimit('buffy-lead', 100);
        const spentBefore = partnerEscrow().getBudget('buffy-lead').spent;
        const inv = settlement.makeInvoice({
            listingId: 'listing_nowhere', price: 7, buyer: 'buffy-lead', seller: 'nova-lead'
        });
        const r = await settlement.sendInvoice(lonelyBus, 'nova-crew', inv, { timeoutMs: 150 });
        assert(r.settled === false && r.reason === 'timeout', 'expected timeout: ' + JSON.stringify(r));
        const pb = partnerEscrow().getBudget('buffy-lead');
        assert(pb.spent === spentBefore, 'timeout did not unwind: spent=' + pb.spent + ' before=' + spentBefore);
    });

    await test('sender binding: a forged settle.record from a third node resolves nothing', async () => {
        const inv = settlement.makeInvoice({
            listingId: listing.id, price: 4, buyer: 'buffy-lead', seller: 'nova-lead'
        });
        // Arm a real pending WITHOUT the owner replying: swallow the
        // settle.request in the stub (handlers 0 — delivered, no recorder).
        const realSend = partnerBus.send;
        partnerBus.send = async () => ({ ok: true, handlers: 0 });
        const sendPromise = settlement.sendInvoice(partnerBus, 'nova-crew', inv, { timeoutMs: 800 });
        await wait(30);
        assert(settlement.status().pending >= 1, 'pending not armed');

        // Forgery from a node the invoice was NOT addressed to: dropped.
        partnerBus._state.dispatchers.get('settle.record')({
            from: 'mallory-node', type: 'settle.record',
            payload: { settlementId: inv.settlementId, accepted: true, record: { id: inv.settlementId, forged: true } }
        });
        await wait(30);
        assert(settlement.status().pending >= 1, 'forged record RESOLVED the pending!');
        const spentAfterForge = partnerEscrow().getBudget('buffy-lead').spent;
        assert(spentAfterForge >= 4, 'partner unexpectedly unwound by forgery');

        // The LEGIT owner replies; only that resolves.
        partnerBus._state.dispatchers.get('settle.record')({
            from: 'nova-crew', type: 'settle.record',
            payload: { settlementId: inv.settlementId, accepted: true, record: { id: inv.settlementId, forged: false } }
        });
        const r = await sendPromise;
        partnerBus.send = realSend;
        assert(r.settled === true, 'legit record failed to resolve: ' + JSON.stringify(r));
        assert(r.record && r.record.forged === false, 'forged record won: ' + JSON.stringify(r.record));
        const mirror = settlement.get(inv.settlementId);
        assert(mirror && mirror.forged === false, 'mirror adopted the forged record');
    });

    await test('registered peers only: an unregistered origin gets no recorder', async () => {
        const before = settlement.list().length;
        const inv = settlement.makeInvoice({
            listingId: listing.id, price: 3, buyer: 'buffy-lead', seller: 'nova-lead'
        });
        ownerBus._state.dispatchers.get('settle.request')({
            from: 'stranger-node', type: 'settle.request', payload: { invoice: inv }
        });
        await wait(50);
        assert(settlement.list().length === before, 'claim recorded for an unregistered origin');
    });

    await test('malformed invoices are dropped (validation matrix)', async () => {
        const before = settlement.list().length;
        const dispatch = ownerBus._state.dispatchers.get('settle.request');
        const cases = [
            null,
            {},
            { settlementId: 'bad', listingId: 'listing_x', price: 1, buyer: 'a', seller: 'b' },
            { settlementId: 'stl_valid1', listingId: 'x', price: 1, buyer: 'a', seller: 'b' },
            { settlementId: 'stl_valid1', listingId: 'listing_ok', price: -5, buyer: 'a', seller: 'b' },
            { settlementId: 'stl_valid1', listingId: 'listing_ok', price: 1, buyer: 'bad agent!', seller: 'b' },
            { settlementId: 'stl_valid1', listingId: 'listing_ok', price: 1, buyer: 'a', seller: 'b', memo: 'x'.repeat(300) }
        ];
        for (const inv of cases) {
            dispatch({ from: 'buffy-labs', type: 'settle.request', payload: { invoice: inv } });
        }
        await wait(50);
        assert(settlement.list().length === before, 'a malformed invoice produced a claim');
        // Pre-flight outbound validation throws, never sends junk.
        let threw = false;
        try { await settlement.sendInvoice(partnerBus, 'nova-crew', { garbage: true }); } catch (e) { threw = true; }
        assert(threw, 'sendInvoice accepted a garbage invoice');
    });

    await test('settlement.status(): aggregate counts only, no memo/topic leak', async () => {
        const s = settlement.status();
        assert(s.count === settlement.list().length, 'count mismatch');
        assert(typeof s.ownerClaims === 'number' && typeof s.partnerPaid === 'number', 'role counts missing');
        for (const k of ['memo', 'topic', 'buyer', 'seller']) {
            assert(!(k in s), 'status leaks ' + k);
        }
    });

    console.log(`\n=== Cross-node settlement: ${results.passed} passed, ${results.failed} failed ===\n`);
    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error('Test harness error:', e);
    process.exit(1);
});
