#!/usr/bin/env node
/**
 * TWO-ORG JOINT VENTURE — Live Exercise (pass 52)
 *
 * The scenario: two orgs come together to work on a project, using vant
 * as the layer to hash out plans and execute them.
 *
 *   HOST ORG — "Nova Crew" (node nova-crew, port P2, agentId nova-lead)
 *     crew: nova-lead (node principal), nova-eng
 *     HOSTS the JV org model: org jv-nova-buffy > dept jv-eng > team
 *     jv-core, with ALL FOUR agents (both orgs) assigned. Owns the plan
 *     topic (its gates resolve the JV scope where the model lives).
 *
 *   PARTNER ORG — "Buffy Labs" (node buffy-labs, port P1, agentId buffy-lead)
 *     crew: buffy-lead (node principal), buffy-eng
 *     Boots its own independent stack and participates REMOTELY: votes
 *     via agora-sync.vote() through the owner's gate stack, receives
 *     decision envelopes, settles payment.
 *
 *   1. Both stacks boot INDEPENDENTLY; genesis handshake over the HMAC wire.
 *   2. Host forms the JV org model (both orgs' agents assigned).
 *   3. Host proposes the plan under JV scope; host crew votes locally.
 *   4. Partner crew votes REMOTELY — owner-side gates admit the ballots.
 *   5. One joint ledger: 4 ballots from 2 orgs, PASSED.
 *   6. Decision broadcast crosses the org boundary (scope rules observed).
 *   7. Execution economics: scoped listing + payment settlement.
 *   8. Cold third process tallies the persisted JV state.
 *
 * HONEST-RECORD MODE: every phase asserts what vant ACTUALLY does. Where
 * federation is not there yet, the harness records a GAP instead of
 * failing — the gaps are the exercise's product.
 *
 * Run: node labs/node-crew/exercise-two-orgs.js
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
process.chdir(ROOT); // brain paths are cwd-relative (models/…)

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

const BASE = 47000 + (process.pid % 6000) * 2;
const PORT_A = BASE;      // buffy-labs (partner)
const PORT_B = BASE + 1;  // nova-crew (host)
const SECRET = 'vant-jv-52-' + process.pid.toString(36);
const STATE_DIR = path.join(ROOT, 'models', 'private', 'vant', 'state');
const ORGCHART_DIR = path.join(ROOT, 'models', 'private', 'vant', 'orgchart');

// ---------------- HOST: Nova Crew ----------------
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
const PORT_A = ${PORT_A};
const PORT_B = ${PORT_B};
const say = (m) => console.log(m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
    registry.clearState();
    try { network.setAllowedDomains(['127.0.0.1']); } catch (e) {}
    crewBus.configure({ name: 'nova-crew', port: PORT_B, secret: SECRET, agentId: 'nova-lead' });
    crewBus.registerNode({ name: 'buffy-labs', url: 'http://127.0.0.1:' + PORT_A, secret: SECRET });
    agoraSync.install(crewBus);
    await crewBus.listen(PORT_B);
    for (const [id, port] of [['buffy-lead', PORT_A], ['buffy-eng', PORT_A], ['nova-lead', PORT_B], ['nova-eng', PORT_B]]) {
        registry.register({ id, name: id, host: '127.0.0.1', port });
    }
    say('HOST_UP');

    // Genesis from the partner org arrives here.
    let genesisRx = false;
    crewBus.onDispatch('jv.genesis', () => { genesisRx = true; });
    const t0 = Date.now();
    while (!genesisRx && Date.now() - t0 < 15000) await wait(100);
    if (!genesisRx) throw new Error('no genesis handshake from buffy-labs');
    say('HOST_GENESIS_OK');

    // ---- JV formation: the HOST org model, all four agents (both orgs) ----
    const org = teams.createOrg('jv-nova-buffy');
    const dept = teams.createDept('jv-eng', { org: org.id });
    const team = teams.createTeam('jv-core', { dept: dept.id });
    for (const a of ['buffy-lead', 'buffy-eng', 'nova-lead', 'nova-eng']) {
        teams.assign(a, { org: org.id, dept: dept.id, team: team.id });
    }
    const SCOPE = { owner: 'team:' + team.id, visibility: 'scope' };
    say('HOST_JV_FORMED:' + team.id);

    // ---- The plan: host proposes under JV scope, host crew votes ----
    const v = await forum.vote('JV: ship the joint deliverable in 2 sprints', {
        options: ['ratify', 'reject'], minQuorum: 4, useTrustWeight: false,
        scope: SCOPE
    });
    if (!v.voted) throw new Error('forum.vote: ' + JSON.stringify(v).slice(0, 140));
    const c1 = await forum.castVote(v.topic, 'ratify', { agentId: 'nova-lead' });
    const c2 = await forum.castVote(v.topic, 'ratify', { agentId: 'nova-eng' });
    say('HOST_VOTES:' + JSON.stringify({ c1: !!c1.cast, c2: !!c2.cast }));

    // Tell the partner what to vote on.
    const tp = await crewBus.send('buffy-labs', 'jv.topic', { topic: v.topic });
    say('HOST_TOPIC_SENT:' + (tp.ok ? 'OK' : 'FAIL'));

    // Wait for the partner's remote ballots (owner gates accept them here).
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
    say('HOST_TALLY:' + JSON.stringify({ votes, status: t.status, voters }));

    // ---- Decision broadcast: scoped + unscoped notice ----
    const bcast = await crewBus.broadcast('decision', {
        topic: v.topic, winner: 'ratify', proposal: 'JV: ship the joint deliverable in 2 sprints',
        scope: SCOPE
    });
    say('HOST_BCAST_SCOPED:' + JSON.stringify(bcast.map((r) => r.ok)));
    const bcast2 = await crewBus.broadcast('decision', {
        topic: v.topic, winner: 'ratify', notice: 'unscoped JV decision notice'
    });
    say('HOST_BCAST_PLAIN:' + JSON.stringify(bcast2.map((r) => r.ok)));

    // ---- Execution economics: scoped listing on the host ----
    const listing = await market.list('knowledge', {
        title: 'JV deliverable: integration build', summary: 'sprint-1 build',
        seller: 'nova-lead', price: 8,
        scope: SCOPE
    }, { agentId: 'nova-lead', consentGiven: true });
    if (listing.error) throw new Error('market.list: ' + JSON.stringify(listing).slice(0, 120));
    const pub = await crewBus.send('buffy-labs', 'jv.listing', { listingId: listing.id, price: 8 });
    say('HOST_LISTED:' + (pub.ok ? 'SENT' : 'SEND_FAIL'));

    // Give the partner time to settle payment, then read the shared
    // budget ledger fresh (write-through from the partner lands on disk).
    await wait(3500);
    const escrowMod = require('./lib/escrow');
    const e = new escrowMod.Escrow();
    const b = e.getBudget('buffy-lead');
    say('HOST_BUDGET:' + JSON.stringify({ agent: 'buffy-lead', spent: b.spent, limit: b.limit }));
    setTimeout(() => process.exit(0), 400);
})().catch((e) => { console.error('HOST_FAIL:' + e.message); process.exit(1); });
`;

// ---------------- PARTNER: Buffy Labs ----------------
const CHILD_PARTNER = `
require('./lib/sandbox.js').defaultSandbox.setCapabilities({
    canRead: true, canWrite: true, canNetwork: true, canTrade: true
});
const registry = require('./lib/node-registry');
const crewBus = require('./lib/crew-bus');
const agoraSync = require('./lib/agora-sync');
const escrowMod = require('./lib/escrow');
const network = require('./lib/network');
const SECRET = ${JSON.stringify(SECRET)};
const PORT_A = ${PORT_A};
const PORT_B = ${PORT_B};
const say = (m) => console.log(m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
    registry.clearState();
    try { network.setAllowedDomains(['127.0.0.1']); } catch (e) {}
    crewBus.configure({ name: 'buffy-labs', port: PORT_A, secret: SECRET, agentId: 'buffy-lead' });
    crewBus.registerNode({ name: 'nova-crew', url: 'http://127.0.0.1:' + PORT_B, secret: SECRET });
    agoraSync.install(crewBus);
    await crewBus.listen(PORT_A);
    for (const [id, port] of [['buffy-lead', PORT_A], ['buffy-eng', PORT_A], ['nova-lead', PORT_B], ['nova-eng', PORT_B]]) {
        registry.register({ id, name: id, host: '127.0.0.1', port });
    }

    // What the partner observes during the JV:
    let scopedDecisionRx = null, plainDecisionRx = null, planTopic = null, listing = null;
    crewBus.onDispatch('decision', (env) => {
        if (env.payload && env.payload.scope) scopedDecisionRx = env.payload;
        else plainDecisionRx = env.payload || true;
    });
    crewBus.onDispatch('jv.topic', (env) => { planTopic = env.payload && env.payload.topic; });
    crewBus.onDispatch('jv.listing', (env) => { listing = env.payload || true; });

    // Genesis handshake (retries while the host boots).
    const t0 = Date.now();
    let ack = null;
    while (Date.now() - t0 < 15000) {
        try { ack = await crewBus.send('nova-crew', 'jv.genesis', { from: 'buffy-labs', blessing: 'JV proposed' }); if (ack.ok) break; } catch (e) {}
        await wait(300);
    }
    if (!ack || !ack.ok) throw new Error('genesis handshake not acked');
    say('PARTNER_GENESIS_SENT');

    // Wait for the plan topic from the host.
    const t1 = Date.now();
    while (!planTopic && Date.now() - t1 < 12000) await wait(100);
    if (!planTopic) throw new Error('plan topic never received');
    say('PARTNER_TOPIC_RX:' + planTopic);

    // ---- Partner crew votes REMOTELY (owner-side gates decide) ----
    const r1 = await agoraSync.vote(crewBus, 'nova-crew', planTopic, 'ratify');
    say('PARTNER_VOTE1:' + JSON.stringify(r1));
    const r2 = await agoraSync.vote(crewBus, 'nova-crew', planTopic, 'ratify', { agentId: 'buffy-eng' });
    say('PARTNER_VOTE2:' + JSON.stringify(r2));

    // Settlement: pay the partner-org invoice into the budget ledger
    // (same-disk harness; a real cross-machine node needs escrow sync).
    await wait(800);
    const esc = new escrowMod.Escrow();
    esc.setBudgetLimit('buffy-lead', 100);
    const spend = esc.recordSpend('buffy-lead', 8);
    say('PARTNER_PAY:' + JSON.stringify({ allowed: !(spend && spend.error), amount: spend && spend.error ? 0 : 8, err: spend && spend.error ? spend.error : null }));

    // Wait for the decision broadcasts + listing publication.
    const t2 = Date.now();
    while (Date.now() - t2 < 9000 && !(scopedDecisionRx && plainDecisionRx && listing)) await wait(150);
    say('PARTNER_RX:' + JSON.stringify({
        scopedDecision: !!scopedDecisionRx,
        plainDecision: !!plainDecisionRx,
        listingRx: !!listing
    }));

    // Can the partner SEE/trade the scoped listing remotely?
    const market = require('./lib/market');
    const seen = listing ? market.get(listing.listingId, { agentId: 'buffy-lead' }) : null;
    say('PARTNER_LISTING_VISIBLE:' + JSON.stringify(!!(seen && !seen.error)));
    setTimeout(() => process.exit(0), 500);
})().catch((e) => { console.error('PARTNER_FAIL:' + e.message); process.exit(1); });
`;

// Cold third process: the JV state as the HOST persisted it. The topic
// is discovered from the persisted list (list() carries status + vote
// counts; the JV ledger is the 4-vote passed one).
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
console.log(JSON.stringify({ topic: found ? found.topic : null, totalVotes: t.totalVotes, status: t.status, escrow }));
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
    console.log('\n🤝 TWO-ORG JOINT VENTURE — LIVE EXERCISE (pass 52)');
    console.log('   partner buffy-labs port ' + PORT_A + ' | host nova-crew port ' + PORT_B + '\n');

    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.rmSync(path.join(STATE_DIR, 'consensus.json'), { force: true });
    fs.rmSync(path.join(STATE_DIR, 'node-registry.json'), { force: true });
    fs.rmSync(ORGCHART_DIR, { recursive: true, force: true });

    const obs = {
        hostUp: false, partnerGenesis: false, hostGenesis: false,
        hostVotes: null, partnerTopic: null, partnerVote1: null, partnerVote2: null,
        hostTally: null, bcastScoped: null, bcastPlain: null, hostListed: null,
        partnerPay: null, partnerRx: null, partnerVisible: null,
        hostBudget: null, hostFail: null, partnerFail: null
    };
    const childHost = run(CHILD_HOST, 'nova-crew', (line) => {
        if (line === 'HOST_UP') obs.hostUp = true;
        if (line === 'HOST_GENESIS_OK') obs.hostGenesis = true;
        if (line.startsWith('HOST_JV_FORMED:')) obs.jvTeamId = line.slice(15);
        if (line.startsWith('HOST_VOTES:')) obs.hostVotes = line.slice(11);
        if (line.startsWith('HOST_TALLY:')) { try { obs.hostTally = JSON.parse(line.slice(11)); } catch (e) {} }
        if (line.startsWith('HOST_BCAST_SCOPED:')) obs.bcastScoped = line.slice(18);
        if (line.startsWith('HOST_BCAST_PLAIN:')) obs.bcastPlain = line.slice(17);
        if (line.startsWith('HOST_LISTED:')) obs.hostListed = line.slice(12);
        if (line.startsWith('HOST_BUDGET:')) { try { obs.hostBudget = JSON.parse(line.slice(12)); } catch (e) {} }
        if (line.startsWith('HOST_FAIL:')) obs.hostFail = line;
    });
    const childPartner = run(CHILD_PARTNER, 'buffy-labs', (line) => {
        if (line === 'PARTNER_GENESIS_SENT') obs.partnerGenesis = true;
        if (line.startsWith('PARTNER_TOPIC_RX:')) obs.partnerTopic = line.slice(17);
        if (line.startsWith('PARTNER_VOTE1:')) { try { obs.partnerVote1 = JSON.parse(line.slice(14)); } catch (e) {} }
        if (line.startsWith('PARTNER_VOTE2:')) { try { obs.partnerVote2 = JSON.parse(line.slice(14)); } catch (e) {} }
        if (line.startsWith('PARTNER_PAY:')) { try { obs.partnerPay = JSON.parse(line.slice(12)); } catch (e) {} }
        if (line.startsWith('PARTNER_RX:')) { try { obs.partnerRx = JSON.parse(line.slice(11)); } catch (e) {} }
        if (line.startsWith('PARTNER_LISTING_VISIBLE:')) obs.partnerVisible = line.slice(24) === 'true';
        if (line.startsWith('PARTNER_FAIL:')) obs.partnerFail = line;
    });

    const deadline = Date.now() + 60000;
    while (Date.now() < deadline && !(obs.hostBudget !== null && obs.partnerVisible !== null) && !obs.hostFail && !obs.partnerFail) {
        await wait(250);
    }
    await Promise.race([childHost, wait(3000)]);
    await Promise.race([childPartner, wait(1500)]);

    // ---- Phase reporting (honest-record mode) ----
    phase('1. both org stacks boot independently; genesis handshake over the HMAC wire',
        obs.hostUp && obs.partnerGenesis && obs.hostGenesis,
        'host ' + (obs.hostUp ? 'up' : 'DOWN') + ', genesis ' + (obs.hostGenesis && obs.partnerGenesis ? 'both ways' : 'INCOMPLETE') + (obs.hostFail || obs.partnerFail ? ' — ' + (obs.hostFail || obs.partnerFail) : ''));

    phase('2. JV org model formed on the host (both orgs assigned to jv-core)', !!obs.jvTeamId,
        'team ' + (obs.jvTeamId || 'MISSING'));

    const hostVotesOk = !!(obs.hostVotes && /"c1":true/.test(obs.hostVotes) && /"c2":true/.test(obs.hostVotes));
    phase('3. plan proposed under JV scope; host crew votes locally', hostVotesOk,
        obs.hostVotes || 'no HOST_VOTES marker');

    const remoteOk = !!(obs.partnerVote1 && obs.partnerVote1.voted === true && obs.partnerVote2 && obs.partnerVote2.voted === true);
    phase('4. partner org votes REMOTELY — owner-side gates admit both ballots', remoteOk,
        'buffy-lead: ' + JSON.stringify(obs.partnerVote1) + ' | buffy-eng: ' + JSON.stringify(obs.partnerVote2));

    const tally = obs.hostTally || {};
    const voters = Array.isArray(tally.voters) ? tally.voters : [];
    phase('5. ONE joint ledger: 4 ballots from both orgs, PASSED', tally.votes === 4 && tally.status === 'passed',
        'votes=' + tally.votes + ' status=' + tally.status + ' voters=' + voters.join(','));

    if (obs.partnerRx && obs.partnerRx.scopedDecision === false) {
        gap('partner dropped the scoped decision even WITH the pass-53 refresh seam — investigate: the miss-retry should have rescued a stale teams view via teams._refreshSync (merge-only, throttled). This would mean the refresh raced or the store read failed.');
    }
    phase('6. decision crosses the boundary per scope rules — scoped delivery correct BY DESIGN (pass-53 refresh seam rescues the partner\'s stale teams view on scope-miss), plain notice flows',
        !!obs.bcastScoped && obs.bcastScoped.includes('true') && !!obs.partnerRx && obs.partnerRx.scopedDecision === true && obs.partnerRx.plainDecision === true,
        'bcast acks ' + obs.bcastScoped + ' + ' + obs.bcastPlain + ', partner rx: ' + JSON.stringify(obs.partnerRx));

    if (obs.partnerRx && obs.partnerRx.listingRx && obs.partnerVisible === false) {
        gap('market has no cross-node sync leg (consensus does via agora-sync): the scoped listing is invisible to the partner node — no remote trade path yet. Payment settled via escrow instead.');
    }
    phase('7. execution economics: scoped listing published; partner payment settles into the budget ledger',
        obs.partnerPay && obs.partnerPay.allowed === true && obs.partnerPay.amount === 8,
        'pay: ' + JSON.stringify(obs.partnerPay) + ', listing rx: ' + JSON.stringify(obs.partnerRx && obs.partnerRx.listingRx) + ', remote trade: ' + JSON.stringify(obs.partnerVisible));

    // ---- Cold process: what SURVIVED on the host's disk ----
    await wait(400);
    const cold = await run(CHILD_COLD, 'cold');
    let coldData = null;
    try { coldData = JSON.parse(cold.out.trim().split('\n').pop()); } catch (e) {}
    phase('8. cold third process: JV ledger (4 votes, passed) + partner payment persisted',
        !!(coldData && coldData.totalVotes === 4 && coldData.status === 'passed' && coldData.escrow && coldData.escrow.spent === 8),
        coldData ? ('votes=' + coldData.totalVotes + ' status=' + coldData.status + ' escrow=' + JSON.stringify(coldData.escrow)) : 'no cold data');

    console.log('');
    if (results.gaps.length) {
        console.log('═══ GAPS FOUND (' + results.gaps.length + ') — the federation backlog ═══');
        results.gaps.forEach((g, i) => console.log('  ' + (i + 1) + '. ' + g));
        console.log('');
    }
    if (results.failed === 0) {
        console.log('=== TWO-ORG JV EXERCISE: ' + results.passed + '/' + results.phases.length + ' phases passed, ' + results.gaps.length + ' gap(s) recorded ===');
    } else {
        console.log('=== TWO-ORG JV EXERCISE: ' + results.failed + ' phase(s) FAILED, ' + results.gaps.length + ' gap(s) ===');
    }
    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error('Exercise harness error:', e);
    process.exit(1);
});
