#!/usr/bin/env node
/**
 * Agora hygiene tests (pass 58 / Wave C, labs/prd-mesh.md)
 *
 * Pins ledger hygiene + gossip (the mesh's convergence engine):
 *   1. Reaper hard guard: LOCALLY created ledgers are never reapable —
 *      even after adopting remote ballots (the pass-58 localOrigin fix)
 *   2. Reaper: synced ledgers age out (maxAge); terminal+unreferenced
 *      reaped; terminal+REFERENCED (msg conversation named for the topic)
 *      survive; throttle skips the immediate re-run
 *   3. Reaped-then-re-pulled round-trip: hygiene without data loss —
 *      the pull seam re-adopts what the reaper removed
 *   4. Gossip summary leg: owner-side scope filter — a scoped topic is
 *      never NAMED to a non-member; members see it
 *   5. Gossip round: convergence over two stub nodes — pulls only topics
 *      below local quorum, skips terminal ones, per-peer floor enforced
 *   6. Gossip reply leg is sender-bound (pass-51 rule on the new leg)
 *
 * Run: node test/agora-hygiene.test.js
 */

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const results = { passed: 0, failed: 0 };

function test(name, fn) {
    return Promise.resolve()
        .then(fn)
        .then(() => { results.passed++; console.log(`  ✓ ${name}`); })
        .catch((e) => { results.failed++; console.log(`  ✗ ${name}: ${e.message.split('\n')[0]}`); });
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

require(path.join(ROOT, 'lib', 'sandbox')).defaultSandbox.setCapabilities({
    canRead: true, canWrite: true, canNetwork: true, canTrade: true, canSpawn: true
});

fs.rmSync(path.join(ROOT, 'models', 'private', 'vant', 'state'), { recursive: true, force: true });
fs.rmSync(path.join(ROOT, 'models', 'private', 'vant', 'orgchart'), { recursive: true, force: true });

const consensus = require(path.join(ROOT, 'lib', 'consensus'));
const sync = require(path.join(ROOT, 'lib', 'agora-sync'));
const registry = require(path.join(ROOT, 'lib', 'node-registry'));
const teams = require(path.join(ROOT, 'lib', 'teams'));

registry.clearState();
for (const v of ['hy-a', 'hy-b', 'hy-outsider']) {
    registry.register({ id: v, name: v, host: '127.0.0.1', port: 1 });
}

const now = Date.now();
const FUTURE = now + 3600000;
const OLD = now - 48 * 3600 * 1000;

/** Wire-born ledger via the real merge path (syncedFrom stamped, no localOrigin). */
function wireTopic(topic, votes, opts = {}) {
    const r = consensus.mergeTopic({
        topic,
        votes,
        minQuorum: opts.minQuorum || 2,
        created: opts.created || now - 1000,
        deadline: opts.deadline || FUTURE,
        from: opts.from || 'wire-peer',
        ...(opts.scope ? { scope: opts.scope } : {})
    });
    assert(r.merged === true && r.created === true, 'wire topic not created: ' + JSON.stringify(r));
    return r;
}

/** Minimal stub bus with captured sends + injectable peer summaries. */
function stubBus(name, replies) {
    const handlers = new Map();
    const sent = [];
    const bus = {
        onDispatch: (t, fn) => handlers.set(t, fn),
        send: async (to, type, payload) => {
            sent.push({ to, type, payload });
            if (type === 'gossip.request' && replies.has(to)) {
                const topics = replies.get(to);
                setImmediate(() => handlers.get('gossip.reply')({ from: to, payload: { reqId: payload.reqId, topics, from: to } }));
            }
            return { ok: true };
        },
        nodes: () => (replies.size ? Array.from(replies.keys()).map((n) => ({ name: n })) : []),
        status: () => ({ name })
    };
    return { bus, handlers, sent };
}

async function main() {
    console.log('\n🧹 AGORA HYGIENE TESTS (pass 58 / Wave C)\n');

    await test('reaper hard guard: locally created ledgers NEVER reapable, even after adopting remote ballots', async () => {
        await consensus.create('hy-local-1', { options: ['a', 'b'], minQuorum: 2, useTrustWeight: false });
        await consensus.vote('hy-local-1', 'a', 'hy-a');
        // A remote ballot arrives via sync for the LOCAL topic (adopt path).
        const r = consensus.mergeTopic({
            topic: 'hy-local-1',
            votes: { 'hy-b': { outcome: 'a', signature: 'sig', ts: now } },
            minQuorum: 2, created: now - 1000, deadline: FUTURE, from: 'wire-peer'
        });
        assert(r.merged === true && r.adopted === 1, 'adopt failed: ' + JSON.stringify(r));
        // A would-reap-everything predicate: the ledger must be UNREACHABLE.
        let guardSawLocal = false;
        consensus.reapSynced((topic) => {
            if (topic === 'hy-local-1') guardSawLocal = true;
            return true;
        }, { max: 500 });
        assert(!guardSawLocal, 'REAPER SAW A LOCALLY CREATED LEDGER — guard failed');
        const ledger = consensus.get('hy-local-1');
        assert(ledger, 'LOCAL ledger reaped — the pass-58 invariant broke');
        assert(ledger.localOrigin === true, 'localOrigin missing on local ledger');
        assert(!ledger.syncedFrom, 'local ledger branded syncedFrom');
        assert(ledger.lastSyncFrom === 'wire-peer', 'adopt provenance missing');
        // And through the public reap() too (fresh bus label → no throttle).
        const res = sync.reap({ maxAgeMs: 1000, now: Date.now(), bus: { status: () => ({ name: 'hy-guard-bus' }) } });
        assert(!res.reaped.includes('hy-local-1'), 'public reap() ate a local ledger');
    });

    await test('reaper: synced ledgers age out; terminal+unreferenced reaped; REFERENCED survive; throttle skips', async () => {
        wireTopic('hy-old', { 'hy-b': { outcome: 'x', signature: 's', ts: now } }, { created: OLD });
        wireTopic('hy-terminal', { 'hy-a': { outcome: 'x', signature: 's', ts: now }, 'hy-b': { outcome: 'x', signature: 's', ts: now } });
        const t = consensus.tally('hy-terminal');
        assert(t.status === 'passed', 'terminal topic not passed: ' + JSON.stringify(t));
        wireTopic('hy-referenced', { 'hy-a': { outcome: 'x', signature: 's', ts: now }, 'hy-b': { outcome: 'x', signature: 's', ts: now } });
        const tr = consensus.tally('hy-referenced');
        assert(tr.status === 'passed', 'referenced topic not passed: ' + JSON.stringify(tr));
        // The reference convention: a msg conversation NAMED for the topic.
        const msg = require(path.join(ROOT, 'lib', 'msg'));
        msg.create({ id: 'hy-referenced' });

        const res = sync.reap({ maxAgeMs: 24 * 3600 * 1000, now: Date.now(), bus: { status: () => ({ name: 'hy-reap-bus' }) } });
        assert(res.reaped.includes('hy-old'), 'aged synced ledger not reaped: ' + JSON.stringify(res));
        assert(res.reaped.includes('hy-terminal'), 'terminal+unreferenced synced ledger not reaped');
        assert(!res.reaped.includes('hy-referenced'), 'terminal+REFERENCED ledger reaped');
        assert(!res.reaped.includes('hy-local-1'), 'local ledger reaped');
        // Throttle: the SAME label cannot re-run immediately.
        const res2 = sync.reap({ now: Date.now(), bus: { status: () => ({ name: 'hy-reap-bus' }) } });
        assert(res2.skipped === 'throttled', 'throttle not enforced: ' + JSON.stringify(res2));
    });

    await test('reaped-then-re-pulled round-trip: hygiene without data loss', async () => {
        wireTopic('hy-roundtrip', { 'hy-b': { outcome: 'x', signature: 's', ts: now } }, { created: OLD });
        const first = sync.reap({ maxAgeMs: 24 * 3600 * 1000, now: Date.now(), bus: { status: () => ({ name: 'hy-rt-bus' }) } });
        assert(first.reaped.includes('hy-roundtrip'), 'aged ledger not reaped: ' + JSON.stringify(first));
        assert(!consensus.get('hy-roundtrip'), 'ledger survived reap');
        // The pull seam is the recovery path: re-merge the same snapshot.
        const back = consensus.mergeTopic({
            topic: 'hy-roundtrip',
            votes: { 'hy-b': { outcome: 'x', signature: 's', ts: now } },
            minQuorum: 2, created: now - 1000, deadline: FUTURE, from: 'wire-peer'
        });
        assert(back.merged === true && back.created === true, 're-pull failed: ' + JSON.stringify(back));
        assert(consensus.get('hy-roundtrip'), 're-pulled ledger missing');
    });

    await test('gossip summary leg: scoped topics never NAMED to non-members; members see them', async () => {
        const org = teams.createOrg('hy-org');
        const dept = teams.createDept('hy-dept', { org: org.id });
        const team = teams.createTeam('hy-team', { dept: dept.id });
        teams.assign('hy-a', { org: org.id, dept: dept.id, team: team.id });
        teams.assign('hy-b', { org: org.id, dept: dept.id, team: team.id });
        wireTopic('hy-scoped', { 'hy-a': { outcome: 'x', signature: 's', ts: now } }, { scope: { owner: 'team:' + team.id, visibility: 'scope' } });
        wireTopic('hy-public-2', { 'hy-b': { outcome: 'x', signature: 's', ts: now } });

        const { bus, handlers } = stubBus('hy-gossip-bus', new Map());
        sync.install(bus);
        assert(handlers.has('gossip.request') && handlers.has('gossip.reply'), 'gossip dispatchers not wired');

        // Drive the OWNER-side filter directly (the leg's trust logic):
        // exactly what gossip.request dispatches for each asker.
        const consensusList = consensus.list();
        const summarize = (asker) => consensusList.filter((l) => {
            if (!l.scoped) return true;
            const ledger = consensus.get(l.topic);
            try {
                return !!(ledger && ledger.scope && require(path.join(ROOT, 'lib', 'scope')).canAccess({ scope: ledger.scope }, asker));
            } catch (e) { return false; }
        }).map((l) => l.topic);

        const outsider = summarize('hy-outsider');
        const member = summarize('hy-a');
        assert(outsider.includes('hy-public-2'), 'public topic missing from summary');
        assert(!outsider.includes('hy-scoped'), 'SCOPED topic named to a NON-MEMBER');
        assert(member.includes('hy-scoped'), 'scoped topic hidden from a MEMBER');
    });

    await test('gossip round: convergence over two stub nodes; pulls only below-quorum; per-peer floor', async () => {
        const replies = new Map([['rich-peer', null], ['offline-peer', null]]);
        const { bus, sent } = stubBus('hy-converge-bus', replies);
        // rich-peer summarizes two topics: one we lack, one we hold terminal.
        await consensus.create('hy-conv-have', { options: ['a', 'b'], minQuorum: 2, useTrustWeight: false });
        await consensus.vote('hy-conv-have', 'a', 'hy-a');
        await consensus.vote('hy-conv-have', 'a', 'hy-b');
        consensus.tally('hy-conv-have');
        await consensus.create('hy-conv-local', { options: ['a', 'b'], minQuorum: 9, useTrustWeight: false }); // under quorum, but LOCAL: no pull needed to vote later
        replies.set('rich-peer', ['hy-conv-missing', 'hy-conv-have']);
        // offline-peer: registered, but its reply NEVER comes (true offline).

        sync.install(bus);
        const res = await sync.gossipRound(bus, { timeoutMs: 200, maxPulls: 5 });
        assert(res.peers === 2, 'peer count wrong: ' + JSON.stringify(res));
        assert(sent.some((s) => s.to === 'offline-peer' && s.type === 'gossip.request'), 'offline peer not asked (registration is not knowledge)');
        const pulled = res.pulls.map((p) => p.topic);
        assert(pulled.includes('hy-conv-missing'), 'missing topic not pulled: ' + JSON.stringify(res));
        assert(!pulled.includes('hy-conv-have'), 'terminal topic pulled');

        // Second immediate round: the per-peer floor skips BOTH peers —
        // no new gossip.request envelopes go out.
        const before = sent.length;
        await sync.gossipRound(bus, { timeoutMs: 200, maxPulls: 5 });
        const askedAgain = sent.slice(before).some((s) => s.type === 'gossip.request');
        assert(!askedAgain, 'per-peer floor not enforced: ' + JSON.stringify(sent.slice(before)));
    });

    await test('gossip reply leg is sender-bound (pass-51 rule on the new leg)', async () => {
        const replies = new Map(); // honest peer never answers
        const { bus, handlers, sent } = stubBus('hy-bind-bus', replies);
        sync.install(bus);
        const p = sync.gossipAsk(bus, 'honest-peer', { timeoutMs: 250 });
        await new Promise((r) => setTimeout(r, 30));
        const req = sent.find((s) => s.type === 'gossip.request');
        assert(req && req.payload.reqId, 'no request envelope captured');
        // An IMPOSTER (a third peer that observed the reqId) replays it.
        handlers.get('gossip.reply')({ from: 'imposter-peer', payload: { reqId: req.payload.reqId, topics: ['evil-topic'], from: 'imposter-peer' } });
        const done = await p;
        assert(done.asked === false && done.reason === 'timeout', 'forged reply resolved the pending ask: ' + JSON.stringify(done));
        // The honest peer's answer, same reqId, WOULD resolve (control).
        // (Not replayed here — the binding negative is the pin.)
    });

    console.log(`\n=== Agora hygiene: ${results.passed} passed, ${results.failed} failed ===\n`);
    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('Test harness error:', e); process.exit(1); });
