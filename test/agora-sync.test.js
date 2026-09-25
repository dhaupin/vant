#!/usr/bin/env node
/**
 * Cross-machine state sync tests (pass 49, next-wave candidate 2)
 *
 * Pins the agora state-sync seam (lib/agora-sync.js + consensus
 * exportTopic/mergeTopic). The hazard: protocol state is per-node; a peer
 * that never saw topic X could not vote on it, and the owner could not
 * count a peer's vote cast elsewhere (demo-v02's re-hydrate trick only
 * works same-disk).
 *   1. merge re-derives status LOCALLY — a wire snapshot can never declare
 *      a topic passed
 *   2. merge adopts only unknown agents' votes (local votes never overwritten)
 *   3. merge validation: invalid topic / malformed scope rejected fail-closed
 *   4. round-trip: export -> merge -> tally reaches passed locally at quorum
 *   5. agora-sync: install idempotent; pull validates topics; push refuses
 *      missing topics; pull round-trip merges over a stub bus (the real
 *      2-process wire is live-probed separately)
 *   6. (pass 51 live-fire) merge scope-filter: non-member ballots in a
 *      pushed/pulled snapshot are dropped; unresolvable scope rejects
 *   7. (pass 51 live-fire) reply legs are sender-bound: a forged ack or
 *      ledger reply from a peer that merely observed the reqId resolves
 *      nothing
 *
 * Run: node test/agora-sync.test.js
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

// Clean brain state BEFORE requiring modules (load-on-init races rm).
fs.rmSync(path.join(ROOT, 'models', 'private', 'vant', 'state'), { recursive: true, force: true });
fs.rmSync(path.join(ROOT, 'models', 'private', 'vant', 'orgchart'), { recursive: true, force: true });

const consensus = require(path.join(ROOT, 'lib', 'consensus'));
const sync = require(path.join(ROOT, 'lib', 'agora-sync'));
const registry = require(path.join(ROOT, 'lib', 'node-registry'));
const teams = require(path.join(ROOT, 'lib', 'teams'));

registry.clearState();
for (const v of ['local-agent', 'rt-a', 'rt-b', 'rt-b-mirror']) {
    registry.register({ id: v, name: v, host: '127.0.0.1', port: 1 });
}

const now = Date.now();
function wireSnapshot(overrides = {}) {
    return {
        topic: 'p49-wire-topic',
        votes: { 'peer-agent': { outcome: 'yes', signature: 'sig', ts: now } },
        minQuorum: 5,
        threshold: 0.51,
        created: now - 1000,
        deadline: now + 3600000,
        status: 'passed',            // BOGUS claim from the wire
        hash: 'deadbeef',            // BOGUS claim from the wire
        outcomes: { yes: 99 },       // BOGUS claim from the wire
        metadata: { proposal: 'Synced across machines' },
        ...overrides
    };
}

async function main() {
    console.log('\n🔀 AGORA STATE SYNC TESTS (pass 49)\n');

    await test('merge re-derives status LOCALLY (wire cannot declare passed)', async () => {
        const r = consensus.mergeTopic(wireSnapshot());
        assert(r.merged === true && r.created === true, 'merge failed: ' + JSON.stringify(r));
        const ledger = consensus.get('p49-wire-topic');
        assert(ledger, 'merged ledger missing');
        assert(ledger.status !== 'passed', 'wire status ADOPTED — wire declares truth!');
        // tally() only writes back to the ledger on passed/rejected; the
        // DERIVED truth for an under-quorum topic lives in the tally result.
        const t = consensus.tally('p49-wire-topic');
        assert(t.status === 'quorum', 'expected re-derived quorum tally: ' + JSON.stringify(t));
        assert(!ledger.hash || ledger.hash !== 'deadbeef', 'wire hash adopted');
        assert(!ledger.outcomes || !ledger.outcomes.yes, 'wire outcomes adopted');
        assert(Object.keys(ledger.votes).length === 1, 'vote not adopted');
        assert(ledger.syncedFrom === 'unknown', 'sync provenance not recorded');
    });

    await test('merge adopts only unknown votes; local votes never overwritten', async () => {
        // Local topic with one vote from 'local-agent'.
        await consensus.create('p49-local', { options: ['yes', 'no'], minQuorum: 3, useTrustWeight: false });
        await consensus.vote('p49-local', 'yes', 'local-agent');
        // Peer snapshot: local-agent voted NO on the peer (conflict), plus
        // a genuinely new vote from 'remote-agent'.
        const r = consensus.mergeTopic({
            topic: 'p49-local',
            votes: {
                'local-agent': { outcome: 'no', signature: 'sig', ts: now },
                'remote-agent': { outcome: 'yes', signature: 'sig', ts: now }
            },
            minQuorum: 3,
            created: now - 1000,
            deadline: now + 3600000,
            from: 'peer-node'
        });
        assert(r.merged === true && r.created === false, 'unexpected merge result: ' + JSON.stringify(r));
        assert(r.adopted === 1, 'adoption count wrong: ' + r.adopted);
        const ledger = consensus.get('p49-local');
        assert(ledger.votes['local-agent'].outcome === 'yes', 'local vote OVERWRITTEN by wire');
        assert(ledger.votes['remote-agent'] && ledger.votes['remote-agent'].outcome === 'yes', 'new vote not adopted');
        assert(ledger.syncedFrom === 'peer-node', 'provenance missing on adopt path');
    });

    await test('merge validation: invalid topic / malformed scope rejected fail-closed', async () => {
        const badTopic = consensus.mergeTopic({ topic: 'bad topic!', votes: {}, minQuorum: 2 });
        assert(badTopic.merged === false && badTopic.reason === 'invalid_topic', 'bad topic accepted: ' + JSON.stringify(badTopic));
        const badScope = consensus.mergeTopic({ topic: 'p49-scope-x', votes: {}, minQuorum: 2, scope: { owner: 'nope;drop', visibility: 'scope' } });
        assert(badScope.merged === false && badScope.reason === 'invalid_scope', 'malformed scope accepted: ' + JSON.stringify(badScope));
        const nothing = consensus.mergeTopic(null);
        assert(nothing.merged === false, 'null accepted');
    });

    await test('round-trip: export -> merge into a fresh node view -> passed at quorum', async () => {
        await consensus.create('p49-rt', { options: ['yes', 'no'], minQuorum: 2, useTrustWeight: false });
        await consensus.vote('p49-rt', 'yes', 'rt-a');
        const snap = consensus.exportTopic('p49-rt');
        assert(snap && snap.topic === 'p49-rt', 'export failed');
        // "Remote node" perspective: the snapshot lands as a DIFFERENT
        // topic name (one process = one ledger map; a real remote node is
        // a separate map — the live 2-process probe covers that path).
        const mirror = { ...snap, topic: 'p49-rt-mirror', syncedFrom: 'rt-owner' };
        const r = consensus.mergeTopic(mirror);
        assert(r.merged === true && r.created === true, 'mirror merge failed: ' + JSON.stringify(r));
        await consensus.vote('p49-rt-mirror', 'yes', 'rt-b-mirror');
        const tally = consensus.tally('p49-rt-mirror');
        assert(tally.status === 'passed' && tally.totalVotes === 2, 'quorum not reached on mirror: ' + JSON.stringify(tally));
    });

    await test('agora-sync: install idempotent; pull validates; push refuses missing', async () => {
        const handlers = new Map();
        const sent = [];
        const bus = {
            onDispatch: (t, fn) => handlers.set(t, fn),
            send: async (to, type, payload) => { sent.push({ to, type, payload }); return { ok: true, handlers: 1 }; },
            nodes: () => [{ name: 'stub-peer', url: 'http://127.0.0.1:1' }],
            status: () => ({ name: 'stub-bus' })
        };
        const first = sync.install(bus);
        assert(first.installed === true, 'install failed');
        const second = sync.install(bus);
        assert(second.already === true, 'install not idempotent');
        assert(handlers.has('state.request') && handlers.has('state') && handlers.has('state.push'), 'dispatchers not wired');

        const badPull = await sync.pull(bus, 'stub-peer', 'bad topic!');
        assert(badPull.pulled === false && badPull.reason === 'invalid_topic', 'invalid topic pulled: ' + JSON.stringify(badPull));

        const missingPush = await sync.push(bus, 'stub-peer', 'p49-does-not-exist');
        assert(missingPush.pushed === false && missingPush.reason === 'not_found', 'pushed missing topic: ' + JSON.stringify(missingPush));

        // Pull round-trip over the stub: capture the request, replay the
        // owner's reply through the 'state' dispatcher, assert merge.
        const pending = sync.pull(bus, 'stub-peer', 'p49-rt');
        const req = sent.find((s) => s.type === 'state.request');
        assert(req && req.payload.topic === 'p49-rt' && req.payload.reqId, 'request envelope malformed: ' + JSON.stringify(req));
        handlers.get('state')({
            from: 'stub-peer',
            payload: { ledger: consensus.exportTopic('p49-rt'), from: 'stub-bus-owner', reqId: req.payload.reqId }
        });
        const pulled = await pending;
        assert(pulled.pulled === true, 'pull failed: ' + JSON.stringify(pulled));
        assert(pulled.merged.merged === true, 'pulled snapshot not merged: ' + JSON.stringify(pulled.merged));
    });

    await test('merge scope-filter: non-member ballots in a snapshot are dropped (pass 51)', async () => {
        for (const v of ['member-a', 'member-b', 'outsider']) {
            registry.register({ id: v, name: v, host: '127.0.0.1', port: 1 });
        }
        const org = teams.createOrg('p51-acme');
        const dept = teams.createDept('p51-infra', { org: org.id });
        const team = teams.createTeam('p51-crew', { dept: dept.id });
        teams.assign('member-a', { org: org.id, dept: dept.id, team: team.id });
        teams.assign('member-b', { org: org.id, dept: dept.id, team: team.id });
        const SCOPE = { owner: 'team:' + team.id, visibility: 'scope' };

        await consensus.create('p51-scoped', { options: ['yes', 'no'], minQuorum: 3, useTrustWeight: false, scope: SCOPE });
        const local = await consensus.vote('p51-scoped', 'yes', 'member-a');
        assert(!local.error, 'member local vote denied: ' + JSON.stringify(local));

        // Hostile push: member ballot (adoptable) + a NON-MEMBER ballot
        // pre-stuffed by the peer. Only the member's ballot may land.
        const r = consensus.mergeTopic({
            topic: 'p51-scoped',
            votes: {
                'member-b': { outcome: 'yes', signature: 'sig', ts: now },
                'outsider': { outcome: 'no', signature: 'sig', ts: now }
            },
            minQuorum: 3,
            created: now - 1000,
            deadline: now + 3600000,
            from: 'hostile-peer'
        });
        assert(r.merged === true, 'legit member ballot not adopted: ' + JSON.stringify(r));
        assert(r.adopted === 1, 'adoption count wrong: ' + JSON.stringify(r));
        const ledger = consensus.get('p51-scoped');
        assert(!ledger.votes['outsider'], 'NON-MEMBER BALLOT ADOPTED from the wire');
        assert(ledger.votes['member-b'] && ledger.votes['member-b'].outcome === 'yes', 'member ballot missing');

        // Fail-closed: a wire-born topic whose scope owner does not exist
        // locally rejects the merge — we cannot prove its ballots are legit.
        const bad = consensus.mergeTopic({
            topic: 'p51-scoped-2',
            votes: { 'someone': { outcome: 'yes', signature: 'sig', ts: now } },
            minQuorum: 2,
            scope: { owner: 'team:ghost-team-xyz', visibility: 'scope' }
        });
        assert(bad.merged === false && bad.reason === 'scope_unresolved', 'unresolvable scope accepted: ' + JSON.stringify(bad));
        assert(!consensus.get('p51-scoped-2'), 'rejected snapshot left partial state');
    });

    await test('reply legs are sender-bound: forged ack/reply resolves nothing (pass 51)', async () => {
        const handlers = new Map();
        const sent = [];
        const bus = {
            onDispatch: (t, fn) => handlers.set(t, fn),
            send: async (to, type, payload) => { sent.push({ to, type, payload }); return { ok: true, handlers: 1 }; },
            nodes: () => [{ name: 'stub-peer', url: 'http://127.0.0.1:1' }],
            status: () => ({ name: 'stub-bus' })
        };
        sync.install(bus);

        // PULL leg: forged ledger reply with a STOLEN reqId but the wrong
        // sender must not resolve the pull — it must die on its timeout.
        const pullP = sync.pull(bus, 'stub-peer', 'p49-rt', { timeoutMs: 250 });
        const req = sent.filter((s) => s.type === 'state.request').pop();
        assert(req && req.payload.reqId, 'pull request malformed');
        handlers.get('state')({
            from: 'reqid-sniffer-node',
            payload: { ledger: consensus.exportTopic('p49-rt'), from: 'reqid-sniffer-node', reqId: req.payload.reqId }
        });
        const race = await Promise.race([pullP, new Promise((r) => setTimeout(() => r('still-pending'), 60))]);
        assert(race === 'still-pending', 'FORGED ledger reply resolved the pull: ' + JSON.stringify(race));
        const timedOut = await pullP;
        assert(timedOut.pulled === false && timedOut.reason === 'timeout', 'pull resolved wrong: ' + JSON.stringify(timedOut));
        // The REAL peer, same reqId flow, still works.
        const pull2P = sync.pull(bus, 'stub-peer', 'p49-rt', { timeoutMs: 2000 });
        const req2 = sent.filter((s) => s.type === 'state.request').pop();
        handlers.get('state')({
            from: 'stub-peer',
            payload: { ledger: consensus.exportTopic('p49-rt'), from: 'stub-peer', reqId: req2.payload.reqId }
        });
        const ok = await pull2P;
        assert(ok.pulled === true, 'legit reply blocked by binding: ' + JSON.stringify(ok));

        // VOTE leg: a spoofed "accepted" verdict (error null, tally 99)
        // must not resolve the voter's promise; the real owner's ack does.
        const voteP = sync.vote(bus, 'stub-peer', 'p49-rt', 'yes', { timeoutMs: 250 });
        const vreq = sent.filter((s) => s.type === 'vote').pop();
        assert(vreq && vreq.payload.reqId, 'vote envelope malformed');
        handlers.get('vote.ack')({
            from: 'reqid-sniffer-node',
            payload: { reqId: vreq.payload.reqId, result: { error: null, code: null, status: 'passed', totalVotes: 99 } }
        });
        const vrace = await Promise.race([voteP, new Promise((r) => setTimeout(() => r('still-pending'), 60))]);
        assert(vrace === 'still-pending', 'FORGED vote verdict resolved the ballot: ' + JSON.stringify(vrace));
        const vTimedOut = await voteP;
        assert(vTimedOut.voted === false && vTimedOut.reason === 'timeout', 'vote resolved wrong: ' + JSON.stringify(vTimedOut));
        const vote2P = sync.vote(bus, 'stub-peer', 'p49-rt', 'yes', { timeoutMs: 2000, agentId: 'rt-b' });
        const vreq2 = sent.filter((s) => s.type === 'vote').pop();
        handlers.get('vote.ack')({
            from: 'stub-peer',
            payload: { reqId: vreq2.payload.reqId, result: { error: 'Already voted', code: null, status: null, totalVotes: null } }
        });
        const vOk = await vote2P;
        assert(vOk.voted === false && /Already voted/.test(vOk.reason || ''), 'real ack blocked by binding: ' + JSON.stringify(vOk));
    });

    console.log(`\n=== Agora state sync: ${results.passed} passed, ${results.failed} failed ===\n`);
    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error('Test harness error:', e);
    process.exit(1);
});
