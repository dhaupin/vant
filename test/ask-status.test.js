#!/usr/bin/env node
/**
 * Ask-peers status legs tests (pass 68, Wave G — frame §5 gap: ask-peers)
 *
 * Pins the federated Stewardship leg (lib/agora-sync.js status legs +
 * lib/mesh-status.js shareableReport/buildFederatedReport):
 *   1. shareableReport is bounded and carries NO content (no msg bodies,
 *      no listing ids, no settlement memo/topic, no per-agent wallets)
 *   2. pass-65 rule does the scope work: a member viewer is named the
 *      topics it can access; a non-member viewer gets them stripped
 *   3. status.request → status.reply round-trip over a stub bus
 *   4. registered peers only: a stranger's ask gets no report
 *   5. sender binding: a forged reply from a third node resolves nothing
 *   6. malformed asks are dropped (no oracle, no crash)
 *   7. buildFederatedReport degrades per-peer (silent peer = UNAVAILABLE
 *      row, aggregate stands)
 *   8. the local report is untouched by any of it (read-only posture)
 *
 * Run: node test/ask-status.test.js
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

fs.rmSync(path.join(ROOT, 'models', 'private', 'vant', 'state'), { recursive: true, force: true });
fs.rmSync(path.join(ROOT, 'models', 'private', 'vant', 'orgchart'), { recursive: true, force: true });

const crewBusMod = require(path.join(ROOT, 'lib', 'crew-bus'));
const agoraSync = require(path.join(ROOT, 'lib', 'agora-sync'));
const meshStatus = require(path.join(ROOT, 'lib', 'mesh-status'));
const consensus = require(path.join(ROOT, 'lib', 'consensus'));
const market = require(path.join(ROOT, 'lib', 'market'));
const teams = require(path.join(ROOT, 'lib', 'teams'));
const registry = require(path.join(ROOT, 'lib', 'node-registry'));

const SECRET = 'p68-ask-status-secret';

// Twin buses: hub (asks) + org (answers).
const hubBus = crewBusMod.createBus();
const orgBus = crewBusMod.createBus();

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

async function main() {
    console.log('\n🛰️  ASK-PEERS STATUS TESTS (pass 68 — Wave G)\n');

    // ---- setup: JV org model + one scoped topic + one public topic ----
    const org = teams.createOrg('p68-jv');
    const dept = teams.createDept('p68-d', { org: org.id });
    const team = teams.createTeam('p68-t', { dept: dept.id });
    teams.assign('hub-agent', { org: org.id, dept: dept.id, team: team.id });
    const SCOPE = { owner: 'team:' + team.id, visibility: 'scope' };

    hubBus.configure({ name: 'hub-node', port: 1, secret: SECRET, agentId: 'hub-agent' });
    orgBus.configure({ name: 'org-node', port: 2, secret: SECRET, agentId: 'org-agent' });
    hubBus.registerNode({ name: 'org-node', url: 'http://127.0.0.1:2', secret: SECRET });
    orgBus.registerNode({ name: 'hub-node', url: 'http://127.0.0.1:1', secret: SECRET });
    agoraSync.install(hubBus);
    agoraSync.install(orgBus);
    stubDeliver(hubBus, orgBus);
    stubDeliver(orgBus, hubBus);

    // Registry: vetted principals carry the NODE NAME (pass-59 shape).
    registry.clearState();
    registry.register({ id: 'hub-agent', name: 'hub-node', host: 'h', port: 1 });
    registry.register({ id: 'org-agent', name: 'org-node', host: 'h', port: 2 });

    // Topics: one JV-scoped, one public — both on the ORG node.
    await consensus.create('p68-public-topic', { ballot: ['yes', 'no'], minQuorum: 9, useTrustWeight: false });
    await consensus.create('p68-scoped-topic', { ballot: ['yes', 'no'], minQuorum: 9, useTrustWeight: false, scope: SCOPE });
    const scopedListing = await market.list('knowledge', {
        title: 'p68 secret sauce', summary: 'scoped', seller: 'org-agent', price: 5, scope: SCOPE
    }, { agentId: 'org-agent', consentGiven: true });
    assert(!scopedListing.error, 'listing failed');

    await test('shareableReport: member viewer is named BOTH topics; non-member only the public one (pass-65 gate)', async () => {
        const asMember = meshStatus.shareableReport('hub-agent');
        const topics = (asMember.agora.topics || []).map((t) => t.topic);
        assert(topics.includes('p68-public-topic'), 'member missing public topic');
        assert(topics.includes('p68-scoped-topic'), 'member missing their scoped topic');

        const asStranger = meshStatus.shareableReport('nobody-relevant');
        const strangerTopics = (asStranger.agora.topics || []).map((t) => t.topic);
        assert(strangerTopics.includes('p68-public-topic'), 'stranger missing public topic');
        assert(!strangerTopics.includes('p68-scoped-topic'),
            'SCOPED TOPIC NAMED TO A NON-MEMBER: ' + JSON.stringify(strangerTopics));

        const anon = meshStatus.shareableReport(null);
        assert((anon.agora.topics || []).map((t) => t.topic).includes('p68-public-topic'), 'anonymous missing public topic');
        assert(!(anon.agora.topics || []).some((t) => t.topic === 'p68-scoped-topic'), 'anonymous sees scoped');
    });

    await test('shareableReport carries NO content: counts and aggregates only', async () => {
        const r = meshStatus.shareableReport('hub-agent');
        const flat = JSON.stringify(r);
        assert(!flat.includes('p68 secret sauce'), 'LISTING TITLE LEAKED through the shareable report');
        assert(!flat.includes('sprint'), 'memo content leaked');
        // No per-agent wallet: budgets are aggregates.
        assert(r.budgets && r.budgets.agents !== undefined && r.budgets.totalSpent !== undefined, 'budget aggregates missing');
        assert(!('p68-t' in JSON.parse(flat)), 'scope owner leaked');
        // The shareable kind marker — receivers reject anything else.
        assert(r.kind === 'vant-mesh-status-shareable', 'wrong kind: ' + r.kind);
    });

    await test('round-trip: hub asks, org answers through the pass-65 filter', async () => {
        const r = await agoraSync.askStatus(hubBus, 'org-node');
        assert(r.asked === true, 'ask failed: ' + JSON.stringify(r));
        assert(r.from === 'org-node', 'reply from wrong node: ' + r.from);
        assert(r.report && r.report.kind === 'vant-mesh-status-shareable', 'bad report kind');
        // THE federation promise: the hub (a JV member) sees the org's
        // scoped topic named; counts ride along; content does not.
        const topics = (r.report.agora.topics || []).map((t) => t.topic);
        assert(topics.includes('p68-public-topic') && topics.includes('p68-scoped-topic'),
            'hub should see both topics as a member: ' + JSON.stringify(topics));
        const flat = JSON.stringify(r.report);
        assert(!flat.includes('p68 secret sauce'), 'listing title crossed the wire');
    });

    await test('registered peers only: a stranger gets no report', async () => {
        const strangerBus = crewBusMod.createBus();
        strangerBus.configure({ name: 'stranger', port: 3, secret: SECRET });
        agoraSync.install(strangerBus);
        stubDeliver(strangerBus, orgBus); // delivers, but from an unregistered origin
        const r = await agoraSync.askStatus(strangerBus, 'org-node', { timeoutMs: 200 });
        assert(r.asked === false && r.reason === 'timeout', 'stranger got a report: ' + JSON.stringify(r).slice(0, 120));
    });

    await test('sender binding: a forged reply with the REAL reqId from a third node resolves nothing', async () => {
        // Capture the ask's reqId and SWALLOW it (no reply will come).
        const realSend = hubBus.send;
        let capturedReqId = null;
        hubBus.send = async (nodeName, type, payload) => {
            if (type === 'status.request') {
                capturedReqId = payload.reqId;
                return { ok: true, handlers: 0 }; // delivered into the void
            }
            return realSend(nodeName, type, payload);
        };
        const sendPromise = agoraSync.askStatus(hubBus, 'org-node', { timeoutMs: 900 });
        let settled = null;
        sendPromise.then((v) => { settled = v; }).catch(() => {});
        await wait(10);
        assert(capturedReqId, 'reqId not captured');

        // Forgery #1: wrong reqId from mallory — must be ignored.
        hubBus._state.dispatchers.get('status.reply')({
            from: 'mallory-node', type: 'status.reply',
            payload: { reqId: 'totally-unrelated', report: { kind: 'vant-mesh-status-shareable', evil: 'wrong-id' } }
        });
        // Forgery #2: the CORRECT reqId but from mallory — the pass-51 rule
        // must still drop it (reqId alone is not proof).
        hubBus._state.dispatchers.get('status.reply')({
            from: 'mallory-node', type: 'status.reply',
            payload: { reqId: capturedReqId, report: { kind: 'vant-mesh-status-shareable', evil: 'right-id-wrong-node' } }
        });
        await wait(40);
        assert(settled === null, 'a forged reply RESOLVED the pending');

        // The legit node replies with the same reqId — the ONLY thing that
        // may resolve it.
        hubBus._state.dispatchers.get('status.reply')({
            from: 'org-node', type: 'status.reply',
            payload: { reqId: capturedReqId, report: { kind: 'vant-mesh-status-shareable', honest: true } }
        });
        const r = await sendPromise;
        hubBus.send = realSend;
        assert(r.asked === true && r.report && r.report.honest === true, 'legit reply failed to resolve: ' + JSON.stringify(r).slice(0, 120));
    });

    await test('malformed asks are dropped silently (no oracle)', async () => {
        const before = orgBus._state.dispatchers;
        const dispatch = orgBus._state.dispatchers.get('status.request');
        dispatch({ from: 'hub-node', type: 'status.request', payload: {} }); // no reqId
        dispatch({ from: 'hub-node', type: 'status.request' }); // no payload
        await wait(30);
        assert(before, 'dispatcher vanished');
        // No crash, no reply — pass.
    });

    await test('buildFederatedReport: silent peer degrades its row, aggregate stands', async () => {
        // The hub's registered peers: org-node (will answer). Add a deaf
        // peer registered on the hub that has no listener at all.
        hubBus.registerNode({ name: 'ghost-node', url: 'http://127.0.0.1:59999', secret: SECRET });
        const fed = await meshStatus.buildFederatedReport(hubBus, { timeoutMs: 250 });
        assert(fed.asked === 2, 'expected 2 targets: ' + fed.asked);
        const orgRow = fed.peers.find((p) => p.node === 'org-node');
        const ghostRow = fed.peers.find((p) => p.node === 'ghost-node');
        assert(orgRow && orgRow.report, 'org row missing report');
        assert(ghostRow && !ghostRow.report && ghostRow.error, 'ghost row should degrade: ' + JSON.stringify(ghostRow));
        assert(fed.answered === 1, 'answered count wrong: ' + fed.answered);
        const text = meshStatus.renderFederated(fed);
        assert(text.includes('UNAVAILABLE') && text.includes('ghost-node'), 'render lacks degraded row');
        // The report content is the org's shareable subset — counts only.
        assert(orgRow.report.market && orgRow.report.market.listings !== undefined, 'market counts missing');
    });

    await test('local report untouched: read-only posture holds', async () => {
        const before = JSON.stringify(meshStatus.buildReport());
        await agoraSync.askStatus(hubBus, 'org-node').catch(() => {});
        await meshStatus.buildFederatedReport(hubBus, { timeoutMs: 150 }).catch(() => {});
        const after = JSON.stringify(meshStatus.buildReport());
        // generatedAt differs by design; compare the sections minus timestamps.
        const strip = (s) => s.replace(/"generatedAt":[0-9]+/g, '"generatedAt":0');
        assert(strip(before) === strip(after), 'local report mutated by federation');
    });

    console.log(`\n=== Ask-peers status: ${results.passed} passed, ${results.failed} failed ===\n`);
    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error('Test harness error:', e);
    process.exit(1);
});
