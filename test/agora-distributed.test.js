#!/usr/bin/env node
/**
 * Distributed agora tests (pass 50, next-wave candidate 3)
 *
 * Pins remote voting over the crew-bus: a peer casts a ballot by envelope
 * (agora-sync.vote), the OWNER runs consensus's FULL local gate stack
 * (scope resolved where the team lives, requireRegistry against the
 * OWNER's registry, quarantine, one vote) and acks the verdict.
 *   1. happy path: registered remote agent votes, ack carries the tally
 *   2. scope: team-scoped topic denies a non-member agent (owner-side)
 *   3. registry: unregistered voter denied (E_NOT_REGISTRY) — vetting is real
 *   4. double vote: second ballot refused
 *   5. unknown peer: owner answers nothing (no state/vote oracle)
 *   6. client-side validation: bad topic/outcome/no identity refused locally
 * The real 2-process wire is live-probed separately (see TASKS pass 50).
 *
 * Run: node test/agora-distributed.test.js
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
// OWNER-side registry: only 'vetted-remote' and locals are known.
for (const v of ['vetted-remote', 'owner-agent', ' rogue-agent']) {
    registry.register({ id: v.trim(), name: v.trim(), host: '127.0.0.1', port: 1 });
}
// Owner-side org model: team 'remote-team' owns the topic; vetted-remote is a member.
const org = teams.createOrg('p50-acme');
const dept = teams.createDept('p50-infra', { org: org.id });
const team = teams.createTeam('remote-team', { dept: dept.id });
teams.assign('vetted-remote', { org: org.id, dept: dept.id, team: team.id });
// The owner's own principal votes too — and the scope gate applies to it
// exactly like anyone else (this bit us: without the assignment the local
// vote was silently scope-denied and the topic sat at 0 ballots).
teams.assign('owner-agent', { org: org.id, dept: dept.id, team: team.id });

const SCOPE = { owner: 'team:' + team.id, visibility: 'scope' };

// OWNER bus stub, module-level (voteRoundTrip + tests share it). Defined
// after ownerBus below via assignment.
let bus = null;

// Owner bus stub: dispatchers captured, sends recorded.
function ownerBus() {
    const handlers = new Map();
    const sent = [];
    return {
        handlers, sent,
        onDispatch: (t, fn) => handlers.set(t, fn),
        send: async (to, type, payload) => { sent.push({ to, type, payload }); return { ok: true, handlers: 1 }; },
        nodes: () => [{ name: 'peer-b', url: 'http://127.0.0.1:1' }],
        status: () => ({ name: 'owner-a', agentId: 'owner-agent' })
    };
}

bus = ownerBus(); // one owner stub for the whole run
sync.install(bus);

// Simulate the wire: the owner's outgoing envelope POSTs to the peer's
// webhook route, whose dispatcher is `peer.handlers.get(type)`. Returns
// after the envelope is delivered (dispatchers are sync).
function deliver(ownerStub, peerStub) {
    const last = ownerStub.sent[ownerStub.sent.length - 1];
    if (last && peerStub.handlers.has(last.type)) {
        peerStub.handlers.get(last.type)({ from: 'owner-a', payload: last.payload });
    }
    return last;
}

// Drive one remote vote end-to-end over the stubs and wait for the ack.
async function voteRoundTrip(peer, topic, outcome, opts) {
    const p = sync.vote(peer, 'owner-a', topic, outcome, opts);
    const req = peer.sent.find((s) => s.type === 'vote' && s.payload.topic === topic && (!opts || !opts.agentId || s.payload.agentId === opts.agentId));
    assert(req, 'vote envelope never sent');
    bus.handlers.get('vote')({ from: 'peer-b', payload: req.payload });
    await new Promise((r) => setTimeout(r, 20)); // owner ack is async (lock-wrapped vote)
    deliver(bus, peer); // owner's vote.ack POSTs back to the peer
    return p;
}

// Peer bus stub (client side): captures outgoing, replays owner acks.
function peerBus() {
    const handlers = new Map();
    const sent = [];
    return {
        handlers, sent,
        onDispatch: (t, fn) => handlers.set(t, fn),
        send: async (to, type, payload) => { sent.push({ to, type, payload }); return { ok: true, handlers: 1 }; },
        nodes: () => [{ name: 'owner-a', url: 'http://127.0.0.1:1' }],
        status: () => ({ name: 'peer-b', agentId: 'vetted-remote' })
    };
}

async function main() {
    console.log('\n🌐 DISTRIBUTED AGORA TESTS (pass 50)\n');

    // Owner-side topic: team-scoped, quorum 2 (owner + one remote).
    await consensus.create('p50-team-vote', { options: ['yes', 'no'], minQuorum: 2, useTrustWeight: false, scope: SCOPE });
    const ownerVote = await consensus.vote('p50-team-vote', 'yes', 'owner-agent');
    assert(!ownerVote.error, 'owner vote denied (scope applies to the owner too!): ' + JSON.stringify(ownerVote));

    await test('happy path: vetted remote agent votes by envelope, ack carries tally', async () => {
        const peer = peerBus();
        const r = await voteRoundTrip(peer, 'p50-team-vote', 'yes');
        assert(r.voted === true, 'remote vote denied: ' + JSON.stringify(r));
        assert(r.tally && r.tally.totalVotes === 2, 'ack tally wrong: ' + JSON.stringify(r.tally));
        const t = consensus.tally('p50-team-vote');
        assert(t.status === 'passed' && t.totalVotes === 2, 'owner tally wrong: ' + JSON.stringify(t));
        const ack = bus.sent.find((s) => s.type === 'vote.ack');
        assert(ack && ack.to === 'peer-b', 'ack not sent to voter');
    });

    await test('scope: non-member remote agent denied by the owner-side gate', async () => {
        // rogue-agent is registry-known but NOT a team member. The topic is
        // already closed by the happy-path vote — the scope gate MUST still
        // fire before the closed gate (state reads are post-scope), so the
        // denial is a scope denial, not a 'Vote closed' existence leak.
        const peer = peerBus();
        const r = await voteRoundTrip(peer, 'p50-team-vote', 'yes', { agentId: 'rogue-agent' });
        assert(r.voted === false, 'non-member vote ACCEPTED: ' + JSON.stringify(r));
        assert(/scope/i.test(r.reason || ''), 'denial reason not scope: ' + JSON.stringify(r));
        const t = consensus.tally('p50-team-vote');
        assert(t.totalVotes === 2, 'denied ballot counted: ' + t.totalVotes);
    });

    await test('registry: unregistered voter denied (vetting is real)', async () => {
        const peer = peerBus();
        const r = await voteRoundTrip(peer, 'p50-team-vote', 'yes', { agentId: 'ghost-agent' });
        assert(r.voted === false, 'unregistered vote ACCEPTED: ' + JSON.stringify(r));
        const t = consensus.tally('p50-team-vote');
        assert(t.totalVotes === 2, 'unregistered ballot counted: ' + t.totalVotes);
    });

    await test('double vote: second ballot refused (one vote per agent)', async () => {
        const peer = peerBus();
        const r = await voteRoundTrip(peer, 'p50-team-vote', 'no');
        assert(r.voted === false, 'double vote ACCEPTED: ' + JSON.stringify(r));
        const t = consensus.tally('p50-team-vote');
        assert(t.totalVotes === 2, 'double ballot counted: ' + t.totalVotes);
    });

    await test('unknown peer: owner answers nothing (no vote oracle)', async () => {
        const before = bus.sent.length;
        bus.handlers.get('vote')({ from: 'stranger', payload: { topic: 'p50-team-vote', outcome: 'yes', agentId: 'vetted-remote', reqId: 'x' } });
        await new Promise((r) => setTimeout(r, 30));
        const acks = bus.sent.slice(before).filter((s) => s.type === 'vote.ack');
        assert(acks.length === 0, 'owner acked a stranger: ' + JSON.stringify(acks));
        // Stranger ballots must not have been counted either.
        const t = consensus.tally('p50-team-vote');
        assert(t.totalVotes === 2, 'stranger ballot counted: ' + t.totalVotes);
    });

    await test('client-side validation: bad topic/outcome/identity refused locally', async () => {
        const peer = peerBus();
        const sentBefore = peer.sent.length;
        const badTopic = await sync.vote(peer, 'owner-a', 'bad topic!', 'yes');
        assert(badTopic.voted === false && badTopic.reason === 'invalid_topic', 'bad topic sent: ' + JSON.stringify(badTopic));
        const badOutcome = await sync.vote(peer, 'owner-a', 'p50-team-vote', '');
        assert(badOutcome.voted === false && badOutcome.reason === 'invalid_outcome', 'bad outcome sent: ' + JSON.stringify(badOutcome));
        const noIdentity = await sync.vote({ ...peer, status: () => ({ name: null, agentId: null }) }, 'owner-a', 'p50-team-vote', 'yes');
        assert(noIdentity.voted === false && noIdentity.reason === 'no_agent_id', 'identity-less vote sent: ' + JSON.stringify(noIdentity));
        assert(peer.sent.length === sentBefore, 'invalid ballots hit the wire');
    });

    console.log(`\n=== Distributed agora: ${results.passed} passed, ${results.failed} failed ===\n`);
    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error('Test harness error:', e);
    process.exit(1);
});
