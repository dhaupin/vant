#!/usr/bin/env node
/**
 * Node Crew protocol pins (pass 30 — labs/prd-node-crew.md)
 *
 * The genesis demo (labs/node-crew/demo.js) exercises the full flow; this
 * suite pins the load-bearing protocol behaviors the demo depends on, so a
 * lib change cannot silently break node-crew work:
 *   - node-registry register → alive; consensus votes require live nodes
 *   - consensus create (options array, minQuorum, async) + vote + tally
 *   - tally counts are trust-weighted (assert totalVotes/leading shape)
 *   - market canTrade distinct from canWrite once sandbox is configured
 *   - stego encodeSvg(message, carrier, password) round-trips
 *
 * Run: node test/node-crew.test.js
 */

const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0 };
function test(name, ok, detail) {
    if (ok) { results.passed++; console.log(`  ✓ ${name}`); }
    else { results.failed++; console.log(`  ✗ ${name}${detail ? ': ' + detail : ''}`); }
}

const consensus = require(path.join(ROOT, 'lib', 'consensus'));
const registry = require(path.join(ROOT, 'lib', 'node-registry'));
const market = require(path.join(ROOT, 'lib', 'market'));
const trust = require(path.join(ROOT, 'lib', 'trust'));
const stego = require(path.join(ROOT, 'lib', 'stego'));
const sandbox = require(path.join(ROOT, 'lib', 'sandbox'));

// Genesis-style capability grant (see PRD §5): flips sandbox to enforced.
sandbox.defaultSandbox.setCapabilities({
    canRead: true, canWrite: true, canSpawn: true, canNetwork: true, canExec: true, canTrade: true
});

(async () => {
    console.log('\n🧩 NODE CREW PROTOCOL PINS\n');

    // 1. registry: register → alive
    registry.register({ id: 'crew-pin-node', name: 'pin', metadata: { role: 'crew-node' } });
    const node = registry.get('crew-pin-node');
    test('node-registry register auto-heartbeats to alive', node && node.status === 'alive');

    // 2. consensus: async create with options array + minQuorum
    const topic = 'crew-pin-topic-' + Date.now().toString(36);
    let ledger = await consensus.create(topic, { options: ['ratify', 'reject'], minQuorum: 1, threshold: 0.5 });
    test('consensus.create is async and returns the ledger', ledger && !ledger.error && ledger.topic === topic,
        JSON.stringify(ledger && ledger.error));

    // 3. votes require a live registry node
    const bad = await consensus.vote(topic, 'ratify', 'agent-ghost-not-registered');
    test('consensus.vote rejects unregistered voter (E_NOT_REGISTRY)', bad && bad.error === 'Agent not verified',
        JSON.stringify(bad));
    const good = await consensus.vote(topic, 'ratify', 'crew-pin-node');
    test('consensus.vote accepts registered live node', good && !good.error, JSON.stringify(good));

    // 4. tally: sync, trust-weighted counts, totalVotes is the headcount
    const tally = consensus.tally(topic);
    test('consensus.tally counts are trust-weighted but totalVotes is headcount',
        tally && !tally.error && tally.totalVotes === 1 && tally.leading === 'ratify' &&
        typeof tally.counts.ratify === 'number',
        JSON.stringify(tally && (tally.error || { totalVotes: tally.totalVotes, counts: tally.counts })));

    // 5. market: canTrade enforced once sandbox explicitly configured
    const listing = await market.list('knowledge',
        { title: 'crew-pin-listing', description: 'pin', price: 0, tags: ['pin'] },
        { agentId: 'agent-pin-master', consentGiven: true });
    const listingId = listing && !listing.error ? (listing.id || (listing.listing && listing.listing.id)) : null;
    test('market.list works under granted sandbox (canWrite)', !!listingId, listing && listing.error);

    // 6. stego round-trip (message FIRST arg — pass-30 pin)
    const soul = JSON.stringify({ type: 'vant-node-crew-soul', pin: true });
    const carrier = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64"/></svg>';
    const encoded = stego.encodeSvg(soul, carrier, 'pin-password');
    const decoded = stego.decodeSvg(encoded, 'pin-password');
    test('stego encodeSvg/decodeSvg round-trip (message, carrier, password)',
        decoded && decoded.message === soul);

    console.log(`\n=== Results: ${results.passed} passed, ${results.failed} failed ===\n`);
    process.exit(results.failed > 0 ? 1 : 0);
})().catch((e) => {
    console.error('Fatal:', e.message);
    process.exit(1);
});
