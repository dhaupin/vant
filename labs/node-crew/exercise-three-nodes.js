#!/usr/bin/env node
/**
 * THREE-NODE STAR — Live Exercise (pass 65, "normal OP" distribution test)
 *
 * The white paper's worked example at trio scale: two orgs PLUS a
 * coordination node. The pair exercise (exercise-two-orgs.js) proved
 * the JV; the star adds the questions only a third node can ask:
 *
 *   OPS HQ (coordination, node ops-hq, port P0, agentId ops-lead)
 *     Boots FIRST. Receives genesis hellos from both orgs. Publishes a
 *     shop-wide notice. Runs the pass-62 mesh-status aggregation and
 *     answers the coordinator's question: what can the hub see?
 *     Deliberately NOT a JV member — the hub must stay outside the
 *     JV boundary while remaining a first-class peer.
 *
 *   HOST ORG (nova-crew, port P1, agentId nova-lead) — as in the pair
 *     exercise: forms the JV org model, proposes, counts the joint
 *     ledger, publishes scoped + plain decisions.
 *
 *   PARTNER ORG (buffy-labs, port P2, agentId buffy-lead) — votes
 *     remotely through the owner's gates, settles payment.
 *
 * Phases:
 *   1. three independent stacks boot; genesis hellos from BOTH orgs
 *      reach the coordinator
 *   2. coordinator publishes a shop-wide notice; both orgs receive it
 *   3. JV formation on the host — pair inside the star, coordinator
 *      deliberately outside the boundary
 *   4. JV vote: 4 ballots from 2 orgs, PASSED (the pair result, under
 *      the star)
 *   5. TRIO-SCALE SCOPE: scoped JV decision reaches the partner but is
 *      DROPPED at the hub (fail-closed); plain notice reaches everyone
 *   6. the coordinator's view: mesh-status sees both peers alive, and
 *      its agora topic list EXCLUDES the scoped JV ledger (it counts
 *      what it may see, no more)
 *   7. Wave-E live-fire: a signed future-major envelope from the
 *      coordinator is refused loudly by the host (version gate fires,
 *      mismatch event observable), while honest traffic flows
 *   8. cold process: JV ledger + the coordinator's registry view
 *      persisted
 *
 * HONEST-RECORD MODE (pass-52 rule): every phase asserts what vant
 * ACTUALLY does; gaps are recorded, not hidden. Known harness
 * simplifications, stated up front: one shared pair secret across the
 * trio (a real deployment runs per-pair genesis secrets), and a
 * same-disk orgchart store (the cross-machine deny path resolves
 * fail-closed either way — see gap notes).
 *
 * Run: node labs/node-crew/exercise-three-nodes.js
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
process.chdir(ROOT);

const results = { passed: 0, failed: 0, phases: [], gaps: [] };
function phase(name, ok, detail) {
    results.phases.push({ name, ok, detail: detail || '' });
    console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
    if (ok) results.passed++; else results.failed++;
    return ok;
}
function gap(text) {
    results.gaps.push(text);
    console.log(`  ⚠ GAP: ${text}`);
}

const BASE = 48000 + (process.pid % 5000) * 3;
const PORT_OPS = BASE;       // ops-hq (coordinator)
const PORT_NOVA = BASE + 1;  // nova-crew (host org)
const PORT_BUFFY = BASE + 2; // buffy-labs (partner org)
const SECRET = 'vant-star-65-' + process.pid.toString(36);
const STATE_DIR = path.join(ROOT, 'models', 'private', 'vant', 'state');
const ORGCHART_DIR = path.join(ROOT, 'models', 'private', 'vant', 'orgchart');

// ---------------- COORDINATOR: Ops HQ ----------------
const CHILD_OPS = `
require('./lib/sandbox.js').defaultSandbox.setCapabilities({
    canRead: true, canWrite: true, canNetwork: true, canTrade: true
});
const registry = require('./lib/node-registry');
const crewBus = require('./lib/crew-bus');
const Encrypt = require('./lib/encrypt');
const network = require('./lib/network');
const SECRET = ${JSON.stringify(SECRET)};
const PORT_OPS = ${PORT_OPS};
const PORT_NOVA = ${PORT_NOVA};
const PORT_BUFFY = ${PORT_BUFFY};
const say = (m) => console.log(m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
    // The coordinator owns a clean registry: it wipes stale runs so its
    // peer view is exactly this exercise's two orgs.
    registry.clearState();
    try { network.setAllowedDomains(['127.0.0.1']); } catch (e) {}
    crewBus.configure({ name: 'ops-hq', port: PORT_OPS, secret: SECRET, agentId: 'ops-lead' });
    crewBus.registerNode({ name: 'nova-crew', url: 'http://127.0.0.1:' + PORT_NOVA, secret: SECRET });
    crewBus.registerNode({ name: 'buffy-labs', url: 'http://127.0.0.1:' + PORT_BUFFY, secret: SECRET });
    await crewBus.listen(PORT_OPS);
    say('OPS_UP');

    // What the hub observes:
    let genesisRx = 0, plainDecisionRx = false, scopedDecisionRx = false;
    crewBus.onDispatch('ops.genesis', () => { genesisRx++; });
    crewBus.onDispatch('decision', (env) => {
        if (env.payload && env.payload.scope) scopedDecisionRx = true;
        else plainDecisionRx = true;
    });

    // Wait for BOTH orgs' hellos.
    const t0 = Date.now();
    while (genesisRx < 2 && Date.now() - t0 < 20000) await wait(100);
    if (genesisRx < 2) throw new Error('genesis hellos incomplete: ' + genesisRx);
    say('OPS_GENESIS_BOTH');

    // Shop-wide notice: unscoped broadcast to both orgs.
    const nb = await crewBus.broadcast('ops.notice', { notice: 'shop-wide: standup in 5, ops-hq presiding' });
    say('OPS_NOTICE_ACKS:' + JSON.stringify(nb.map((r) => r.ok)));

    // Wait for the JV decisions (scoped should NEVER dispatch here).
    const t1 = Date.now();
    while (Date.now() - t1 < 12000 && !(plainDecisionRx && scopedDecisionRx === false)) await wait(200);
    say('OPS_RX:' + JSON.stringify({ plain: plainDecisionRx, scoped: scopedDecisionRx }));

    // The coordinator's view (pass-62 mesh status, from the hub's seat).
    // The registry REFRESH comes first (pass 65): the hub hydrated at
    // boot and never saw the orgs' later registrations on the shared
    // store — the teams-refresh-seam rule applied to the peer registry.
    const rr = registry.refresh();
    say('OPS_REFRESH:' + JSON.stringify(rr));
    const meshStatus = require('./lib/mesh-status');
    const report = meshStatus.buildReport();
    const peers = report.registry && report.registry.stats ? report.registry.stats : {};
    const jvVisible = (report.agora.topics || []).some((t) => String(t.topic).indexOf('jv') !== -1);
    say('OPS_MESH:' + JSON.stringify({
        kind: report.kind,
        peersTotal: peers.total, peersAlive: peers.alive,
        agoraTopics: (report.agora.topics || []).length,
        jvVisibleToHub: jvVisible,
        selfBrain: report.self && report.self.brain
    }));

    // ---- Wave-E live-fire: signed future-major probe at the hub ----
    // A real envelope, correctly signed with the shared secret, carrying
    // a version the receiver cannot parse. The VERSION gate must refuse
    // it loudly (crew:version:mismatch fires on the receiver) BEFORE any
    // payload interpretation. An honest v1 probe must still flow.
    const mkProbe = (v) => {
        const envelope = {
            event: 'crew.ops.probe', from: 'ops-hq', type: 'ops.probe',
            payload: { n: 1, at: Date.now() }, ts: Date.now(), nonce: Date.now() + Math.floor(Math.random() * 1000),
            v
        };
        const body = JSON.stringify(envelope);
        const signature = Encrypt.hmacSign(body, SECRET);
        return { body, signature };
    };
    const sendProbe = async (v) => {
        const p = mkProbe(v);
        try {
            const raw = await network.fetch('http://127.0.0.1:' + PORT_NOVA + '/nova-crew', {
                method: 'POST', body: p.body,
                headers: { 'Content-Type': 'application/json', 'X-Signature-256': p.signature },
                circuit: false, system: true
            });
            return JSON.parse(raw);
        } catch (e) { return { error: e.message }; }
    };
    const refused = await sendProbe({ major: 9, minor: 0 });   // future major: refused at the version gate
    const honest = await sendProbe({ major: 1, minor: 0 });    // current major: dispatches
    // (pass 65 live-fire fix) The ack now carries a dispatched field -
    // the receiver's honest per-route answer. A version-gated envelope
    // acks received:true (HMAC verified) but dispatched:0 (refused
    // silently locally - by design, no oracle to the sender about WHY).
    say('OPS_PROBES:' + JSON.stringify({
        futureMajor: refused && refused.received !== undefined ? { dispatched: refused.dispatched } : ((refused && refused.error) || 'no-ack'),
        honest: honest && honest.received !== undefined ? { dispatched: honest.dispatched } : ((honest && honest.error) || 'no-ack')
    }));
    setTimeout(() => process.exit(0), 600);
})().catch((e) => { console.error('OPS_FAIL:' + e.message); process.exit(1); });
`;

// ---------------- HOST ORG: Nova Crew ----------------
const CHILD_HOST = `
require('./lib/sandbox.js').defaultSandbox.setCapabilities({
    canRead: true, canWrite: true, canNetwork: true, canTrade: true
});
const registry = require('./lib/node-registry');
const crewBus = require('./lib/crew-bus');
const agoraSync = require('./lib/agora-sync');
const consensus = require('./lib/consensus');
const teams = require('./lib/teams');
const market = require('./lib/market');
const forum = require('./lib/forum').forum;
const network = require('./lib/network');
const SECRET = ${JSON.stringify(SECRET)};
const PORT_OPS = ${PORT_OPS};
const PORT_NOVA = ${PORT_NOVA};
const PORT_BUFFY = ${PORT_BUFFY};
const say = (m) => console.log(m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
    try { network.setAllowedDomains(['127.0.0.1']); } catch (e) {}
    crewBus.configure({ name: 'nova-crew', port: PORT_NOVA, secret: SECRET, agentId: 'nova-lead' });
    crewBus.registerNode({ name: 'ops-hq', url: 'http://127.0.0.1:' + PORT_OPS, secret: SECRET });
    crewBus.registerNode({ name: 'buffy-labs', url: 'http://127.0.0.1:' + PORT_BUFFY, secret: SECRET });
    agoraSync.install(crewBus);
    await crewBus.listen(PORT_NOVA);
    for (const [id, port] of [['buffy-lead', PORT_BUFFY], ['buffy-eng', PORT_BUFFY], ['nova-lead', PORT_NOVA], ['nova-eng', PORT_NOVA]]) {
        registry.register({ id, name: id, host: '127.0.0.1', port });
    }
    // The org nodes' wire identities: crew-bus.listen self-registers each
    // bus (crew_<name>); the org NAMES go in as first-class peers so a
    // cold process can see the full star topology (hub + both orgs).
    registry.register({ id: 'nova-crew', name: 'nova-crew', host: '127.0.0.1', port: PORT_NOVA, metadata: { kind: 'org-node' } });
    registry.register({ id: 'buffy-labs', name: 'buffy-labs', host: '127.0.0.1', port: PORT_BUFFY, metadata: { kind: 'org-node' } });
    say('HOST_UP');

    // The hub's shop-wide notice + Wave-E live-fire observation:
    let noticeRx = false, vmismatchRx = null, probeOk = false;
    crewBus.onDispatch('ops.notice', (env) => { noticeRx = true; });
    crewBus.onDispatch('ops.probe', () => { probeOk = true; });
    try { require('./lib/event').on('crew:version:mismatch', (d) => { vmismatchRx = d; }); } catch (e) {}

    // Genesis hello to the hub (retries while it boots).
    let ack = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 15000) {
        try { ack = await crewBus.send('ops-hq', 'ops.genesis', { from: 'nova-crew' }); if (ack.ok) break; } catch (e) {}
        await wait(300);
    }
    if (!ack || !ack.ok) throw new Error('genesis to hub not acked');
    say('HOST_GENESIS_SENT');

    // ---- JV formation: host org model, both orgs' agents, NO hub agent ----
    const org = teams.createOrg('jv-nova-buffy');
    const dept = teams.createDept('jv-eng', { org: org.id });
    const team = teams.createTeam('jv-core', { dept: dept.id });
    for (const a of ['buffy-lead', 'buffy-eng', 'nova-lead', 'nova-eng']) {
        teams.assign(a, { org: org.id, dept: dept.id, team: team.id });
    }
    const SCOPE = { owner: 'team:' + team.id, visibility: 'scope' };
    say('HOST_JV_FORMED:' + team.id);

    // ---- The plan: propose under JV scope; host crew votes locally ----
    const v = await forum.vote('JV: ship the joint deliverable in 2 sprints', {
        options: ['ratify', 'reject'], minQuorum: 4, useTrustWeight: false,
        scope: SCOPE
    });
    if (!v.voted) throw new Error('forum.vote: ' + JSON.stringify(v).slice(0, 140));
    await forum.castVote(v.topic, 'ratify', { agentId: 'nova-lead' });
    await forum.castVote(v.topic, 'ratify', { agentId: 'nova-eng' });

    // Tell the partner what to vote on (direct pair leg inside the star).
    await crewBus.send('buffy-labs', 'jv.topic', { topic: v.topic });

    // Wait for the partner's remote ballots.
    let votes = 0, voters = [];
    const t1 = Date.now();
    while (Date.now() - t1 < 15000) {
        const ledger = consensus.get(v.topic);
        votes = ledger ? Object.keys(ledger.votes).length : 0;
        voters = ledger ? Object.keys(ledger.votes) : [];
        if (votes >= 4) break;
        await wait(200);
    }
    const t = consensus.tally(v.topic);
    say('HOST_TALLY:' + JSON.stringify({ votes, status: t.status, voters, topic: v.topic }));

    // ---- Trio-scale decision delivery: broadcast hits BOTH peers ----
    // The scoped envelope must pass at buffy (member) and DIE at ops-hq
    // (non-member hub, fail-closed). The plain notice must reach both.
    const bcastScoped = await crewBus.broadcast('decision', {
        topic: v.topic, winner: 'ratify', proposal: 'JV: ship the joint deliverable in 2 sprints',
        scope: SCOPE
    });
    say('HOST_BCAST_SCOPED:' + JSON.stringify(bcastScoped.map((r) => r.ok)));
    const bcastPlain = await crewBus.broadcast('decision', {
        topic: v.topic, winner: 'ratify', notice: 'unscoped JV decision notice'
    });
    say('HOST_BCAST_PLAIN:' + JSON.stringify(bcastPlain.map((r) => r.ok)));

    // ---- Execution economics (as the pair exercise) ----
    const listing = await market.list('knowledge', {
        title: 'JV deliverable: integration build', summary: 'sprint-1 build',
        seller: 'nova-lead', price: 8,
        scope: SCOPE
    }, { agentId: 'nova-lead', consentGiven: true });
    if (listing.error) throw new Error('market.list: ' + JSON.stringify(listing).slice(0, 120));
    await crewBus.send('buffy-labs', 'jv.listing', { listingId: listing.id, price: 8 });

    await wait(3500);
    const escrowMod = require('./lib/escrow');
    const e = new escrowMod.Escrow();
    const b = e.getBudget('buffy-lead');
    say('HOST_BUDGET:' + JSON.stringify({ agent: 'buffy-lead', spent: b.spent, limit: b.limit }));

    // Wave-E observation window: the hub's future-major probe must have
    // been REFUSED (mismatch event fired here) and the honest probe
    // DISPATCHED.
    const t2 = Date.now();
    while (Date.now() - t2 < 6000 && !(vmismatchRx && probeOk)) await wait(150);
    say('HOST_WAVEE:' + JSON.stringify({
        refused: !!(vmismatchRx && vmismatchRx.sender && vmismatchRx.sender.major === 9),
        direction: vmismatchRx ? vmismatchRx.direction : null,
        honestDispatched: probeOk
    }));
    setTimeout(() => process.exit(0), 400);
})().catch((e) => { console.error('HOST_FAIL:' + e.message); process.exit(1); });
`;

// ---------------- PARTNER ORG: Buffy Labs ----------------
const CHILD_PARTNER = `
require('./lib/sandbox.js').defaultSandbox.setCapabilities({
    canRead: true, canWrite: true, canNetwork: true, canTrade: true
});
const crewBus = require('./lib/crew-bus');
const agoraSync = require('./lib/agora-sync');
const escrowMod = require('./lib/escrow');
const network = require('./lib/network');
const SECRET = ${JSON.stringify(SECRET)};
const PORT_OPS = ${PORT_OPS};
const PORT_NOVA = ${PORT_NOVA};
const PORT_BUFFY = ${PORT_BUFFY};
const say = (m) => console.log(m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
    try { network.setAllowedDomains(['127.0.0.1']); } catch (e) {}
    crewBus.configure({ name: 'buffy-labs', port: PORT_BUFFY, secret: SECRET, agentId: 'buffy-lead' });
    crewBus.registerNode({ name: 'ops-hq', url: 'http://127.0.0.1:' + PORT_OPS, secret: SECRET });
    crewBus.registerNode({ name: 'nova-crew', url: 'http://127.0.0.1:' + PORT_NOVA, secret: SECRET });
    agoraSync.install(crewBus);
    await crewBus.listen(PORT_BUFFY);

    let noticeRx = false, scopedDecisionRx = null, plainDecisionRx = null, planTopic = null, listing = null;
    crewBus.onDispatch('ops.notice', () => { noticeRx = true; });
    crewBus.onDispatch('decision', (env) => {
        if (env.payload && env.payload.scope) scopedDecisionRx = env.payload;
        else plainDecisionRx = env.payload || true;
    });
    crewBus.onDispatch('jv.topic', (env) => { planTopic = env.payload && env.payload.topic; });
    crewBus.onDispatch('jv.listing', (env) => { listing = env.payload || true; });

    // Genesis hello to the hub (retries while it boots).
    let ack = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 15000) {
        try { ack = await crewBus.send('ops-hq', 'ops.genesis', { from: 'buffy-labs' }); if (ack.ok) break; } catch (e) {}
        await wait(300);
    }
    if (!ack || !ack.ok) throw new Error('genesis to hub not acked');
    say('PARTNER_GENESIS_SENT');

    // Hub notice receipt.
    const tn = Date.now();
    while (!noticeRx && Date.now() - tn < 8000) await wait(100);
    say('PARTNER_NOTICE_RX:' + noticeRx);

    // Wait for the plan topic from the host (direct pair leg).
    const t1 = Date.now();
    while (!planTopic && Date.now() - t1 < 15000) await wait(100);
    if (!planTopic) throw new Error('plan topic never received');

    // ---- Remote ballots through the owner's gate stack ----
    const r1 = await agoraSync.vote(crewBus, 'nova-crew', planTopic, 'ratify');
    const r2 = await agoraSync.vote(crewBus, 'nova-crew', planTopic, 'ratify', { agentId: 'buffy-eng' });
    say('PARTNER_VOTES:' + JSON.stringify({ lead: r1 && r1.voted, eng: r2 && r2.voted }));

    // Settlement (same-disk harness; escrow sync is the standing gap).
    await wait(800);
    const esc = new escrowMod.Escrow();
    esc.setBudgetLimit('buffy-lead', 100);
    const spend = esc.recordSpend('buffy-lead', 8);
    say('PARTNER_PAY:' + JSON.stringify({ allowed: !(spend && spend.error), amount: spend && spend.error ? 0 : 8 }));

    // Decisions + listing receipt (scoped MUST arrive here — member).
    const t2 = Date.now();
    while (Date.now() - t2 < 12000 && !(scopedDecisionRx && plainDecisionRx && listing)) await wait(150);
    say('PARTNER_RX:' + JSON.stringify({ scoped: !!scopedDecisionRx, plain: !!plainDecisionRx, listing: !!listing }));
    setTimeout(() => process.exit(0), 500);
})().catch((e) => { console.error('PARTNER_FAIL:' + e.message); process.exit(1); });
`;

// Cold process: what SURVIVED — the host's JV ledger + the hub's registry view.
const CHILD_COLD = `
require('./lib/sandbox.js').defaultSandbox.setCapabilities({ canRead: true, canWrite: true });
const consensus = require('./lib/consensus');
const escrowMod = require('./lib/escrow');
consensus._resetHydration();
const found = consensus.list().find((l) => l.votes === 4 && l.status === 'passed');
const t = found ? consensus.tally(found.topic) : { totalVotes: 0, status: 'missing' };
let escrow = null;
try {
    const e = new escrowMod.Escrow();
    const b = e.getBudget('buffy-lead');
    escrow = { spent: b.spent, limit: b.limit };
} catch (err) { escrow = { error: err.message }; }
const registry = require('./lib/node-registry');
const names = (registry.list() || []).map((n) => n.name);
console.log(JSON.stringify({
    topic: found ? found.topic : null,
    totalVotes: t.totalVotes, status: t.status, escrow,
    registryHasHub: names.indexOf('ops-hq') !== -1,
    registryHasOrgs: names.indexOf('nova-crew') !== -1 && names.indexOf('buffy-labs') !== -1
}));
`;

function run(script, label, onLine) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['-e', script], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
        let out = '', err = '';
        child.stdout.on('data', (d) => {
            out += d.toString();
            if (onLine) for (const line of d.toString().split('\n')) if (line.trim()) onLine(line.trim());
        });
        child.stderr.on('data', (d) => (err += d.toString()));
        child.on('close', (code) => resolve({ code, out, err }));
        child.on('error', reject);
        child.stdin.end();
    });
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
    console.log('\n⭐ THREE-NODE STAR — LIVE EXERCISE (pass 65, normal OP)');
    console.log('   ops-hq :' + PORT_OPS + ' (coordinator) | nova-crew :' + PORT_NOVA
        + ' (host) | buffy-labs :' + PORT_BUFFY + ' (partner)\n');

    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.rmSync(path.join(STATE_DIR, 'consensus.json'), { force: true });
    fs.rmSync(path.join(STATE_DIR, 'node-registry.json'), { force: true });
    fs.rmSync(ORGCHART_DIR, { recursive: true, force: true });

    const obs = {
        opsUp: false, opsGenesis: null, opsNoticeAcks: null, opsRx: null, opsMesh: null, opsProbes: null,
        hostUp: false, hostGenesis: false, jvTeamId: null, hostTally: null,
        bcastScoped: null, bcastPlain: null, hostBudget: null, hostWaveE: null,
        partnerGenesis: false, partnerNotice: null, partnerVotes: null, partnerPay: null, partnerRx: null,
        opsFail: null, hostFail: null, partnerFail: null
    };

    const childOps = run(CHILD_OPS, 'ops-hq', (line) => {
        if (line === 'OPS_UP') obs.opsUp = true;
        if (line === 'OPS_GENESIS_BOTH') obs.opsGenesis = true;
        if (line.startsWith('OPS_NOTICE_ACKS:')) { try { obs.opsNoticeAcks = JSON.parse(line.slice(16)); } catch (e) {} }
        if (line.startsWith('OPS_RX:')) { try { obs.opsRx = JSON.parse(line.slice(7)); } catch (e) {} }
        if (line.startsWith('OPS_REFRESH:')) { try { obs.opsRefresh = JSON.parse(line.slice(12)); } catch (e) {} }
        if (line.startsWith('OPS_MESH:')) { try { obs.opsMesh = JSON.parse(line.slice(9)); } catch (e) {} }
        if (line.startsWith('OPS_PROBES:')) { try { obs.opsProbes = JSON.parse(line.slice(11)); } catch (e) {} }
        if (line.startsWith('OPS_FAIL:')) obs.opsFail = line;
    });

    // Give the hub a moment to bind, then bring both orgs up concurrently
    // (their genesis hellos retry with backoff — the pass-57 rule).
    await wait(600);
    const childHost = run(CHILD_HOST, 'nova-crew', (line) => {
        if (line === 'HOST_UP') obs.hostUp = true;
        if (line === 'HOST_GENESIS_SENT') obs.hostGenesis = true;
        if (line.startsWith('HOST_JV_FORMED:')) obs.jvTeamId = line.slice(15);
        if (line.startsWith('HOST_TALLY:')) { try { obs.hostTally = JSON.parse(line.slice(11)); } catch (e) {} }
        if (line.startsWith('HOST_BCAST_SCOPED:')) obs.bcastScoped = line.slice(18);
        if (line.startsWith('HOST_BCAST_PLAIN:')) obs.bcastPlain = line.slice(17);
        if (line.startsWith('HOST_BUDGET:')) { try { obs.hostBudget = JSON.parse(line.slice(12)); } catch (e) {} }
        if (line.startsWith('HOST_WAVEE:')) { try { obs.hostWaveE = JSON.parse(line.slice(11)); } catch (e) {} }
        if (line.startsWith('HOST_FAIL:')) obs.hostFail = line;
    });
    const childPartner = run(CHILD_PARTNER, 'buffy-labs', (line) => {
        if (line === 'PARTNER_GENESIS_SENT') obs.partnerGenesis = true;
        if (line.startsWith('PARTNER_NOTICE_RX:')) obs.partnerNotice = line.slice(18) === 'true';
        if (line.startsWith('PARTNER_VOTES:')) { try { obs.partnerVotes = JSON.parse(line.slice(14)); } catch (e) {} }
        if (line.startsWith('PARTNER_PAY:')) { try { obs.partnerPay = JSON.parse(line.slice(12)); } catch (e) {} }
        if (line.startsWith('PARTNER_RX:')) { try { obs.partnerRx = JSON.parse(line.slice(11)); } catch (e) {} }
        if (line.startsWith('PARTNER_FAIL:')) obs.partnerFail = line;
    });

    const deadline = Date.now() + 75000;
    while (Date.now() < deadline && !(obs.hostBudget !== null && obs.hostWaveE !== null && obs.opsProbes !== null) && !obs.opsFail && !obs.hostFail && !obs.partnerFail) {
        await wait(250);
    }
    await Promise.race([childOps, wait(2000)]);
    await Promise.race([childHost, wait(2000)]);
    await Promise.race([childPartner, wait(2000)]);

    // ---- Phase reporting (honest-record mode) ----
    const bootOk = obs.opsUp && obs.hostUp && obs.partnerGenesis && obs.opsGenesis && obs.hostGenesis;
    phase('1. three independent stacks boot; genesis hellos from BOTH orgs reach the hub', bootOk,
        'ops ' + (obs.opsUp ? 'up' : 'DOWN') + ', host ' + (obs.hostUp ? 'up' : 'DOWN')
        + ', hellos ' + (obs.opsGenesis ? 'both received' : 'INCOMPLETE') + (obs.opsFail || obs.hostFail || obs.partnerFail ? ' — ' + (obs.opsFail || obs.hostFail || obs.partnerFail) : ''));

    phase('2. hub publishes a shop-wide notice; both orgs acknowledge', !!obs.opsNoticeAcks && obs.opsNoticeAcks.length === 2 && obs.opsNoticeAcks.every((x) => x === true) && obs.partnerNotice === true,
        'acks ' + JSON.stringify(obs.opsNoticeAcks) + ', partner rx ' + obs.partnerNotice);

    phase('3. JV formed on the host — a pair INSIDE the star, hub deliberately outside the boundary', !!obs.jvTeamId,
        'team ' + (obs.jvTeamId || 'MISSING'));

    const pv = obs.partnerVotes || {};
    const tally = obs.hostTally || {};
    phase('4. JV vote: 4 ballots from 2 orgs, PASSED (the pair result holds under the star)',
        tally.votes === 4 && tally.status === 'passed' && pv.lead === true && pv.eng === true,
        'votes=' + tally.votes + ' status=' + tally.status + ' partner ballots ' + JSON.stringify(pv));

    phase('5. TRIO-SCALE SCOPE: scoped decision reaches the partner, DROPPED at the hub (fail-closed); plain reaches everyone',
        !!obs.bcastScoped && obs.bcastScoped.includes('true')
        && obs.partnerRx && obs.partnerRx.scoped === true
        && obs.opsRx && obs.opsRx.plain === true && obs.opsRx.scoped === false,
        'partner rx ' + JSON.stringify(obs.partnerRx) + ', hub rx ' + JSON.stringify(obs.opsRx));

    const mesh = obs.opsMesh || {};
    phase('6. the hub counts what it MAY see: both peers alive in its view, the scoped JV topic NOT in its agora list',
        mesh.kind === 'vant-mesh-status' && mesh.peersAlive >= 2 && mesh.jvVisibleToHub === false,
        'mesh ' + JSON.stringify(mesh));

    const we = obs.hostWaveE || {};
    const probes = obs.opsProbes || {};
    phase('7. Wave-E live-fire: signed future-major probe refused (mismatch event fired, ack says dispatched:0), honest v1 probe dispatched',
        we.refused === true && we.direction === 'newer sender' && we.honestDispatched === true
        && probes.futureMajor && probes.futureMajor.dispatched === 0
        && probes.honest && probes.honest.dispatched >= 1,
        'wave-e ' + JSON.stringify(we) + ', hub acks ' + JSON.stringify(obs.opsProbes));

    phase('8. execution economics: partner payment settles into the budget ledger',
        obs.partnerPay && obs.partnerPay.allowed === true && obs.partnerPay.amount === 8
        && obs.hostBudget && obs.hostBudget.spent === 8,
        'partner ' + JSON.stringify(obs.partnerPay) + ', host sees ' + JSON.stringify(obs.hostBudget));

    // ---- Cold process: what survived ----
    await wait(400);
    const cold = await run(CHILD_COLD, 'cold');
    let coldData = null;
    try { coldData = JSON.parse(cold.out.trim().split('\n').pop()); } catch (e) {}
    phase('9. cold process: JV ledger + hub registry view persisted',
        !!(coldData && coldData.totalVotes === 4 && coldData.status === 'passed'
            && coldData.escrow && coldData.escrow.spent === 8
            && coldData.registryHasHub === true && coldData.registryHasOrgs === true),
        coldData ? ('votes=' + coldData.totalVotes + ' status=' + coldData.status
            + ' escrow=' + JSON.stringify(coldData.escrow)
            + ' hub=' + coldData.registryHasHub + ' orgs=' + coldData.registryHasOrgs) : 'no cold data');

    // ---- Honest gaps (the exercise's product) ----
    gap('the hub observes only its OWN registry + what arrives unsolicited: mesh status has no ASK-PEERS leg (a coordinator cannot pull peer reports over the wire). Next frame leg: status pull (gated like every other snapshot).');
    gap('harness shares ONE secret across the trio; a real deployment runs per-pair genesis secrets (lib/genesis). Trio genesis productization is open.');
    gap('same-disk orgchart: the hub\u2019s scope DENY is fail-closed either way, but a true cross-machine hub would deny via unresolvable scope — worth pinning in a split-brain variant.');

    console.log('');
    console.log('═══ GAPS (' + results.gaps.length + ') — the next federation backlog ═══');
    results.gaps.forEach((g, i) => console.log('  ' + (i + 1) + '. ' + g));
    console.log('');
    if (results.failed === 0) {
        console.log('=== THREE-NODE STAR: ' + results.passed + '/' + results.phases.length + ' phases passed ===');
    } else {
        console.log('=== THREE-NODE STAR: ' + results.failed + ' phase(s) FAILED ===');
    }
    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error('Exercise harness error:', e);
    process.exit(1);
});
