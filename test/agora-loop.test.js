#!/usr/bin/env node
/**
 * Agora Loop Tests (pass 40 / labs/prd-agora.md)
 *
 * Pins the owner's vision end to end, in one process (cross-process
 * transport is demo-v02's territory; this pins the SEAMS):
 *   1. forum proposal born in-thread -> consensus ledger carries scope
 *   2. forum.castVote hits consensus with the RIGHT arg order
 *      (outcome=choice, agent=agentId) — the pass-40 swapped-arg fix
 *   3. scoped vote rejects non-members (consensus scope gate)
 *   4. decision return path: vote:consensus -> forum decision record
 *      with the original proposal attached
 *   5. market: scoped listing invisible to outsiders (search/get/trade),
 *      tradable by members; public listings unaffected
 *   6. crew-bus: payload carrying scope is delivered to member nodes and
 *      DROPPED for non-member nodes (crew.decision envelope rule)
 *
 * Run: node test/agora-loop.test.js
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

// Clean orgchart + state BEFORE requiring teams (its load-on-init races rm).
fs.rmSync(path.join(ROOT, 'models', 'private', 'vant', 'orgchart'), { recursive: true, force: true });
fs.rmSync(path.join(ROOT, 'models', 'private', 'vant', 'state'), { recursive: true, force: true });

const teams = require(path.join(ROOT, 'lib', 'teams'));
const scope = require(path.join(ROOT, 'lib', 'scope'));
const forumMod = require(path.join(ROOT, 'lib', 'forum'));
const consensus = require(path.join(ROOT, 'lib', 'consensus'));
const market = require(path.join(ROOT, 'lib', 'market'));
const registry = require(path.join(ROOT, 'lib', 'node-registry'));
const crewBusMod = require(path.join(ROOT, 'lib', 'crew-bus'));
const network = require(path.join(ROOT, 'lib', 'network'));

// Org fixture: acme org, backend team (aria), org-only member (volt).
const org = teams.createOrg('acme');
const dept = teams.createDept('infra', { org: org.id });
const team = teams.createTeam('backend', { dept: dept.id });
teams.assign('aria', { org: org.id, dept: dept.id, team: team.id });
teams.assign('volt', { org: org.id });

registry.clearState();
registry.register({ id: 'aria', name: 'aria', host: '127.0.0.1', port: 1 });
registry.register({ id: 'volt', name: 'volt', host: '127.0.0.1', port: 2 });

const forum = forumMod.forum;
const SECRET = 'agora-pin-' + process.pid.toString(36);
const BASE = 47000 + (process.pid % 6000) * 2;

async function main() {
    console.log('\n🏛  AGORA LOOP TESTS (pass 40)\n');

    // ---------- 1+2+3+4: the loop ----------
    let topic = null;
    await test('forum vote -> consensus ledger carries the scope', async () => {
        const v = await forumMod.vote('Ship the agora wave', {
            options: ['ratify', 'reject'], minQuorum: 2, useTrustWeight: false,
            scope: { owner: 'team:backend', visibility: 'scope' }
        });
        assert(v.voted === true, 'vote create failed: ' + JSON.stringify(v).slice(0, 120));
        topic = v.topic;
        const ledger = consensus.get(topic);
        assert(ledger && ledger.scope && ledger.scope.owner === 'team:backend', 'ledger scope missing');
        assert(ledger.scope.visibility === 'scope', 'ledger visibility wrong');
    });

    await test('castVote arg order: outcome=choice, agent=agentId (pass-40 fix)', async () => {
        const c = await forumMod.castVote(topic, 'ratify', { agentId: 'aria' });
        assert(c.cast === true, 'cast failed: ' + JSON.stringify(c).slice(0, 120));
        const ledger = consensus.get(topic);
        const recorded = ledger.votes.aria;
        assert(!!recorded, 'vote not recorded under aria');
        assert(recorded.outcome === 'ratify', 'outcome must be the choice, got ' + JSON.stringify(recorded));
    });

    await test('scoped vote rejects non-members (consensus scope gate)', async () => {
        const c = await forumMod.castVote(topic, 'ratify', { agentId: 'volt' });
        assert(c.cast === false, 'org-only member must NOT vote a team-scoped vote');
        assert(c.code === 'E_SCOPE' || /scope/i.test(c.error || ''), 'expected scope denial, got ' + JSON.stringify(c));
    });

    await test('decision return path: consensus result -> forum record', async () => {
        // second team member vote -> passes minQuorum 2 -> vote:consensus
        registry.register({ id: 'juno', name: 'juno', host: '127.0.0.1', port: 3 });
        teams.assign('juno', { org: org.id, dept: dept.id, team: team.id });
        const c = await forumMod.castVote(topic, 'ratify', { agentId: 'juno' });
        assert(c.cast === true, 'second member vote failed: ' + JSON.stringify(c).slice(0, 120));
        await wait(150); // event delivery
        const d = forum.decisions.find((x) => x.topic === topic);
        assert(!!d, 'no decision record returned to forum');
        assert(d.winner === 'ratify', 'decision winner: ' + d.winner);
        assert(d.proposal === 'Ship the agora wave', 'decision must carry the original proposal, got ' + d.proposal);
        assert(d.author, 'decision must carry the author');
    });

    // ---------- 5: market scope ----------
    let scopedListing = null, publicListing = null;
    await test('market: scoped listing invisible to outsiders, tradable by members', async () => {
        scopedListing = await market.list('knowledge',
            { title: 'team secret sauce', summary: 's', seller: 'aria', scope: { owner: 'team:backend', visibility: 'scope' } },
            { agentId: 'aria', consentGiven: true });
        assert(!scopedListing.error, 'scoped list failed: ' + JSON.stringify(scopedListing));
        assert(scopedListing.scope && scopedListing.scope.owner === 'team:backend', 'listing scope missing');

        assert((await market.search({ agentId: 'aria' })).some((l) => l.id === scopedListing.id), 'member must see it');
        assert(!(await market.search({ agentId: 'volt' })).some((l) => l.id === scopedListing.id), 'org-only agent must NOT see it');
        assert(!(await market.search({})).some((l) => l.id === scopedListing.id), 'anonymous must NOT see it');
        assert(market.get(scopedListing.id, { agentId: 'aria' }) !== null, 'member get ok');
        assert(market.get(scopedListing.id, { agentId: 'volt' }) === null, 'outsider get must be null (scoped = unseen)');

        const denied = await market.trade(scopedListing.id, 'volt', { agentId: 'volt', consentGiven: true });
        assert(denied.error === 'Scope denied', 'outsider trade must be Scope denied, got ' + JSON.stringify(denied).slice(0, 80));
        const ok = await market.trade(scopedListing.id, 'juno', { agentId: 'juno', consentGiven: true });
        assert(!ok.error, 'member trade must succeed: ' + JSON.stringify(ok).slice(0, 80));
    });

    await test('market: malformed scope rejected; public listings unaffected', async () => {
        const bad = await market.list('knowledge', { title: 'x', summary: 's', seller: 'aria', scope: { owner: 'galaxy:x' } }, { agentId: 'aria', consentGiven: true });
        assert(bad.error && bad.code === 'E_SCOPE', 'malformed scope must reject with E_SCOPE');
        publicListing = await market.list('knowledge', { title: 'public docs', summary: 's', seller: 'aria' }, { agentId: 'aria', consentGiven: true });
        assert((await market.search({ agentId: 'volt' })).some((l) => l.id === publicListing.id), 'unscoped listing must stay public');
    });

    // ---------- 6: crew-bus scoped envelopes ----------
    await test('crew-bus: scope-carrying envelope delivered to member node, dropped for non-member', async () => {
        const busA = crewBusMod.createBus({ name: 'agora-a', port: BASE, secret: SECRET });
        const busB = crewBusMod.createBus({ name: 'agora-b', port: BASE + 1, secret: SECRET, agentId: 'aria' }); // aria's node (team member)
        const busC = crewBusMod.createBus({ name: 'agora-c', port: BASE + 2, secret: SECRET, agentId: 'volt' }); // volt's node (org-only)
        try { network.setAllowedDomains(['127.0.0.1']); } catch (e) {}

        const got = { b: null, c: null };
        busB.onDispatch('decision', (env) => { got.b = env.payload; });
        busC.onDispatch('decision', (env) => { got.c = env.payload; });
        await busA.listen(BASE);
        await busB.listen(BASE + 1);
        await busC.listen(BASE + 2);

        busA.registerNode({ name: 'agora-b', url: 'http://127.0.0.1:' + (BASE + 1), secret: SECRET });
        busA.registerNode({ name: 'agora-c', url: 'http://127.0.0.1:' + (BASE + 2), secret: SECRET });

        // crew.decision with team scope: B (member) gets it, C (org-only) drops it
        const results = await busA.broadcast('decision', {
            topic, winner: 'ratify', proposal: 'Ship the agora wave',
            scope: { owner: 'team:backend', visibility: 'scope' }
        });
        await wait(250);
        const deliveredB = results.find((r) => r.node === 'agora-b');
        const deliveredC = results.find((r) => r.node === 'agora-c');
        assert(deliveredB && deliveredB.ok, 'member node must ack (got ' + JSON.stringify(deliveredB) + ')');
        assert(deliveredC && deliveredC.ok, 'wire-level ack still fires for dropped payloads (verified by dispatcher)');
        assert(got.b !== null, 'member node dispatcher must receive payload');
        assert(got.c === null, 'non-member node dispatcher must NOT receive payload');

        // Unscoped payload flows to everyone (backwards compat)
        const results2 = await busA.broadcast('decision', { topic, winner: 'ratify' });
        await wait(250);
        assert(got.c !== null, 'unscoped payload must reach non-member node too');
        assert(results2.every((r) => r.ok), 'unscoped broadcast all-ack');

        await busA.stop(); await busB.stop(); await busC.stop();
    });

    // cleanup
    teams.unassign('aria');
    teams.unassign('volt');
    teams.unassign('juno');
    fs.rmSync(path.join(ROOT, 'models', 'private', 'vant', 'orgchart'), { recursive: true, force: true });
    fs.rmSync(path.join(ROOT, 'models', 'private', 'vant', 'state'), { recursive: true, force: true });

    console.log(`\n=== Agora loop: ${results.passed} passed, ${results.failed} failed ===\n`);
    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error('FATAL:', e.message);
    process.exit(1);
});
