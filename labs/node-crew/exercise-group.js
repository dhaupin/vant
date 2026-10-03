#!/usr/bin/env node
/**
 * THREE-ORG GROUP — Live Exercise (pass 69, Wave J + the N-node soak)
 *
 * The owner's scenario: a corporate group of separate orgs sharing one
 * decision chain (frame §4's group pattern; the Acme/Beta/Theta shape
 * with the steward playing the group's dedicated router install). Every
 * leg is the shipped mechanism, zero custom trust code:
 *
 *   STEWARD — "group-steward" (port P3, agentId steward-lead)
 *     Hosts the GROUP org model (org group > dept group-ops > team
 *     group-chain; ALL agents from all three orgs assigned). Owns the
 *     group topic. Pushes its model via org-sync.replicate. Runs NO
 *     production work — it is the router install.
 *   MEMBER A — "acme-node" (port P2, agentId acme-1): proposes under
 *     group scope, votes, settles a group listing.
 *   MEMBER B — "beta-node" (port P1, agentId beta-1): votes REMOTELY,
 *     then — the Wave-J goal — READS the group topic on ITS OWN NODE
 *     through the org-sync replica.
 *
 *   1. Three stacks boot independently; signed mesh over one ring secret.
 *   2. Steward forms the group org model; REPLICATES it to both members.
 *   3. Acme proposes under group scope (owner-side gates on the steward);
 *      acme-1 votes locally.
 *   4. beta-1 votes REMOTELY via agora-sync.vote — quorum reached, PASSED.
 *   5. beta-1 READS the group topic on beta-node (replica-resolved
 *      scope) — the thing that was fail-closed denial before Wave J.
 *   6. Execution economics: scoped group listing; acme's payment settles
 *      into the steward-side CLAIMS ledger (claims-not-cash).
 *   7. The outcome bridges to the noticeboard (unscoped only).
 *   8. Cold fourth process: group ledger + replica generation + claim
 *      all survive (the soak: nothing depends on a live process).
 *
 * HONEST-RECORD MODE: gaps are recorded, never papered over.
 *
 * Run: node labs/node-crew/exercise-group.js
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

const BASE = 47500 + (process.pid % 5000) * 3;
const PORT_BETA = BASE;      // beta-node (member B)
const PORT_ACME = BASE + 1;  // acme-node (member A)
const PORT_STEW = BASE + 2;  // group-steward
const SECRET = 'vant-group-69-' + process.pid.toString(36);
const STATE_DIR = path.join(ROOT, 'models', 'private', 'vant', 'state');
const ORGCHART_DIR = path.join(ROOT, 'models', 'private', 'vant', 'orgchart');

// PER-NODE BRAIN ISOLATION: each child gets its OWN brain dir (the
// pass-53 VANT_BRAIN seam) — the real deployment shape. The first
// draft shared one orgchart/registry store across all three children:
// beta's local book merged the steward's group model (minus beta-1,
// whose id collided with beta's sovereign local assignment in the
// one-record-per-agent map), local resolution "succeeded" with a
// poisoned member set, the replica never got its turn — and the
// members' registry.clearState() calls wiped the steward's vetting
// anchors mid-flight. Separate brains = separate disks = honest.
// Per-child brain env, spliced BEFORE the prelude (VANT_BRAIN must be
// set before any lib resolves its brain paths).
const CHILD_BRAIN = (name) => `process.env.VANT_BRAIN = ${JSON.stringify(name)};`;

const PRELUDE = `
require('./lib/sandbox.js').defaultSandbox.setCapabilities({
    canRead: true, canWrite: true, canNetwork: true, canTrade: true
});
const network = require('./lib/network');
try { network.setAllowedDomains(['127.0.0.1']); } catch (e) {}
const say = (m) => console.log(m);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
`;

// ---------------- STEWARD: the group's router install ----------------
const CHILD_STEWARD = CHILD_BRAIN('gx-steward') + PRELUDE + `
const registry = require('./lib/node-registry');
const crewBus = require('./lib/crew-bus');
const agoraSync = require('./lib/agora-sync');
const orgSync = require('./lib/org-sync');
const settlement = require('./lib/settlement');
const teams = require('./lib/teams');
const consensus = require('./lib/consensus');
const SECRET = ${JSON.stringify(SECRET)};
const PORT_BETA = ${PORT_BETA}, PORT_ACME = ${PORT_ACME}, PORT_STEW = ${PORT_STEW};
(async () => {
    registry.clearState();
    crewBus.configure({ name: 'group-steward', port: PORT_STEW, secret: SECRET, agentId: 'steward-lead' });
    crewBus.registerNode({ name: 'acme-node', url: 'http://127.0.0.1:' + PORT_ACME, secret: SECRET });
    crewBus.registerNode({ name: 'beta-node', url: 'http://127.0.0.1:' + PORT_BETA, secret: SECRET });
    agoraSync.install(crewBus);
    settlement.install(crewBus);
    orgSync.install(crewBus);
    orgSync.configureStewards(['group-steward']); // the steward never accepts foreign models
    await crewBus.listen(PORT_STEW);
    // Registry vetting anchors (requireRegistry): every voter principal
    // plus the steward itself. name = the NODE name so resolvePrincipal
    // (pass-59) maps transport ids to principals for the settlement leg.
    registry.register({ id: 'steward-lead', name: 'group-steward', host: '127.0.0.1', port: PORT_STEW });
    registry.register({ id: 'acme-1', name: 'acme-node', host: '127.0.0.1', port: PORT_ACME });
    registry.register({ id: 'beta-1', name: 'beta-node', host: '127.0.0.1', port: PORT_BETA });
    say('STEWARD_UP');

    // The group org model: every org's agents in one decision chain.
    const org = teams.createOrg('group-commons');
    const dept = teams.createDept('group-ops', { org: org.id });
    const team = teams.createTeam('group-chain', { dept: dept.id });
    for (const a of ['steward-lead', 'acme-1', 'beta-1']) {
        teams.assign(a, { org: org.id, dept: dept.id, team: team.id });
    }
    say('STEWARD_MODEL_FORMED:' + team.id);

    // Wait for both members, then REPLICATE the model to each (Wave J).
    let members = 0;
    crewBus.onDispatch('group.hello', () => { members++; });
    const t0 = Date.now();
    while (members < 2 && Date.now() - t0 < 20000) await wait(100);
    if (members < 2) throw new Error('not all members helloed: ' + members);
    const rAcme = await orgSync.replicate(crewBus, 'acme-node');
    const rBeta = await orgSync.replicate(crewBus, 'beta-node');
    say('STEWARD_REPLICATED:' + JSON.stringify({ acme: rAcme.pushed && rAcme.ok, beta: rBeta.pushed && rBeta.ok }));

    // THE GROUP TOPIC LIVES HERE: pass-50's rule — scope resolves where
    // the model lives, so the steward owns the group topic and its gates.
    // Both members vote REMOTELY; steward-lead votes locally.
    const forumMod = require('./lib/forum');
    const forum = forumMod.forum || forumMod;
    const SCOPE = { owner: 'team:' + team.id, visibility: 'scope' };
    const v = await forum.vote('group-q3-platform-call', {
        options: ['thursday-1400utc', 'friday-0900utc'], minQuorum: 3, useTrustWeight: false,
        scope: SCOPE
    });
    if (!v || !v.voted) throw new Error('forum.vote failed: ' + JSON.stringify(v).slice(0, 140));
    say('STEWARD_PROPOSED:' + v.topic);
    const c0 = await forum.castVote(v.topic, 'thursday-1400utc', { agentId: 'steward-lead' });
    say('STEWARD_VOTE:' + JSON.stringify({ cast: !!c0.cast }));
    // The group listing lives on the STEWARD (the group's marketplace —
    // pass-50 shape; market has no cross-node sync leg by recorded
    // design, and the claim is only as good as the owner-side listing).
    const market = require('./lib/market');
    const listing = await market.list('knowledge', {
        title: 'group deliverable: platform-call minutes pack', summary: 'wave J live-fire',
        seller: 'acme-1', price: 6, scope: SCOPE
    }, { agentId: 'steward-lead', consentGiven: true });
    if (listing.error) throw new Error('market.list: ' + JSON.stringify(listing).slice(0, 120));
    await crewBus.send('acme-node', 'group.topic', { topic: v.topic, listingId: listing.id, price: 6 });
    await crewBus.send('beta-node', 'group.topic', { topic: v.topic });
    say('STEWARD_READY');

    // Wait for the remote ballots (owner-side gates admit them), then close.
    let votes = 0, voters = [], status = 'open';
    const t1 = Date.now();
    while (Date.now() - t1 < 25000) {
        const row = consensus.list().find((l) => l.topic && l.topic.includes('group-q3-platform-call'));
        const ledger = row ? consensus.get(row.topic) : null;
        votes = ledger ? Object.keys(ledger.votes).length : 0;
        voters = ledger ? Object.keys(ledger.votes) : [];
        status = row ? (consensus.tally(row.topic).status || 'open') : 'missing';
        if (votes >= 3 && status === 'passed') break;
        await wait(200);
    }
    say('STEWARD_TALLY:' + JSON.stringify({ votes, status, voters }));
    // LIVE TAIL: members still pull the ledger, settle the listing, and
    // post the plain notice — the steward is the router, it exits LAST.
    await wait(9000);
    process.exit(0);
})().catch((e) => { console.error('STEWARD_FAIL:' + e.message); process.exit(1); });
`;

// ---------------- MEMBER A: Acme (voter + settler) ----------------
const CHILD_ACME = CHILD_BRAIN('gx-acme') + PRELUDE + `
const registry = require('./lib/node-registry');
const crewBus = require('./lib/crew-bus');
const agoraSync = require('./lib/agora-sync');
const orgSync = require('./lib/org-sync');
const settlement = require('./lib/settlement');
const escrowMod = require('./lib/escrow');
const market = require('./lib/market');
const forumMod = require('./lib/forum');
const consensus = require('./lib/consensus');
const notices = require('./lib/notices');
const SECRET = ${JSON.stringify(SECRET)};
const PORT_BETA = ${PORT_BETA}, PORT_ACME = ${PORT_ACME}, PORT_STEW = ${PORT_STEW};
(async () => {
    registry.clearState();
    crewBus.configure({ name: 'acme-node', port: PORT_ACME, secret: SECRET, agentId: 'acme-1' });
    crewBus.registerNode({ name: 'group-steward', url: 'http://127.0.0.1:' + PORT_STEW, secret: SECRET });
    agoraSync.install(crewBus);
    settlement.install(crewBus);
    orgSync.install(crewBus);
    orgSync.setProvider();
    notices.install(crewBus);
    await crewBus.listen(PORT_ACME);
    registry.register({ id: 'acme-1', name: 'acme-node', host: '127.0.0.1', port: PORT_ACME });
    // Dispatcher BEFORE hello: the steward sends the topic immediately
    // after replicating — an envelope arriving to no handler is dropped.
    let planTopic = null, listingId = null, listingPrice = 0;
    crewBus.onDispatch('group.topic', (env) => {
        planTopic = env.payload && env.payload.topic;
        listingId = env.payload && env.payload.listingId;
        listingPrice = (env.payload && env.payload.price) || 0;
    });
    await crewBus.send('group-steward', 'group.hello', { from: 'acme-node' });
    say('ACME_UP');

    // Wait for the replica (the steward pushes after both members hello).
    const t0 = Date.now();
    while (orgSync.replicaStatus().generation === 0 && Date.now() - t0 < 15000) await wait(150);
    if (orgSync.replicaStatus().generation === 0) throw new Error('acme replica never arrived');
    say('ACME_REPLICA:' + orgSync.replicaStatus().generation);

    // The steward owns the group topic (pass-50: scope resolves where the
    // model lives). Acme proposes NOTHING — it votes REMOTELY.
    const t1 = Date.now();
    while (!planTopic && Date.now() - t1 < 15000) await wait(100);
    if (!planTopic) throw new Error('group topic never received');
    say('ACME_TOPIC_RX:' + planTopic);
    const r1 = await agoraSync.vote(crewBus, 'group-steward', planTopic, 'thursday-1400utc');
    say('ACME_VOTE:' + JSON.stringify({ voted: !!(r1 && r1.voted), error: (r1 && r1.result && r1.result.error) || null }));

    // Wait for the joint ledger to close, then pull it local (the bridge
    // reads LOCAL consensus).
    const consensus = require('./lib/consensus');
    let votes = 0, status = 'open';
    const t2 = Date.now();
    while (Date.now() - t2 < 20000) {
        const pull = await agoraSync.pull(crewBus, 'group-steward', planTopic, { timeoutMs: 6000 });
        const l = consensus.get(planTopic);
        votes = l ? Object.keys(l.votes).length : 0;
        status = l ? l.status : 'open';
        if (votes >= 3 && status === 'passed') break;
        await wait(300);
    }
    say('ACME_TALLY:' + JSON.stringify({ votes, status }));

    // ---- Execution economics: buyer debits OWN escrow; steward claims ----
    const inv = settlement.makeInvoice({
        listingId, price: listingPrice, buyer: 'acme-1', seller: 'steward-lead',
        memo: 'group live-fire settlement'
    });
    // The BUYER debits its own escrow; the STEWARD records a CLAIM.
    const esc = new escrowMod.Escrow();
    esc.setBudgetLimit('acme-1', 50);
    const settle = await settlement.sendInvoice(crewBus, 'group-steward', inv);
    say('ACME_SETTLE:' + JSON.stringify({ settled: !!settle.settled, reason: settle.reason || null }));

    // ---- The outcome crosses the boundary the pass-52 way ----
    // The decision topic is GROUP-SCOPED: bridgeDecision must REFUSE it
    // (a scope's existence is not nameable on the commons board — the
    // notices pin). The plain notice is the inter-org leg: outcome facts,
    // no scoped name.
    const bridge = notices.bridgeDecision(planTopic, { bus: crewBus });
    say('ACME_BRIDGE_REFUSED:' + (bridge.bridged === false && bridge.reason === 'scoped_topic'));
    const note = notices.post({
        title: 'Group decision: Q3 platform call — thursday-1400utc (3 orgs, unanimous)',
        body: 'Joint ledger closed at 3 ballots across 3 orgs. Deliberation stays in the group agora; this board carries the outcome.',
        ttlMs: 14 * 24 * 3600 * 1000
    });
    say('ACME_PLAIN_NOTICE:' + (note.ok === true));
    setTimeout(() => process.exit(0), 800);
})().catch((e) => { console.error('ACME_FAIL:' + e.message); process.exit(1); });
`;

// ---------------- MEMBER B: Beta (the remote reader) ----------------
const CHILD_BETA = CHILD_BRAIN('gx-beta') + PRELUDE + `
const registry = require('./lib/node-registry');
const crewBus = require('./lib/crew-bus');
const agoraSync = require('./lib/agora-sync');
const orgSync = require('./lib/org-sync');
const consensus = require('./lib/consensus');
const scope = require('./lib/scope');
const teams = require('./lib/teams');
const SECRET = ${JSON.stringify(SECRET)};
const PORT_BETA = ${PORT_BETA}, PORT_ACME = ${PORT_ACME}, PORT_STEW = ${PORT_STEW};
(async () => {
    registry.clearState();
    crewBus.configure({ name: 'beta-node', port: PORT_BETA, secret: SECRET, agentId: 'beta-1' });
    crewBus.registerNode({ name: 'group-steward', url: 'http://127.0.0.1:' + PORT_STEW, secret: SECRET });
    agoraSync.install(crewBus);
    orgSync.install(crewBus);
    orgSync.setProvider();
    await crewBus.listen(PORT_BETA);
    registry.register({ id: 'beta-1', name: 'beta-node', host: '127.0.0.1', port: PORT_BETA });
    // Dispatcher BEFORE hello (same race as acme's).
    let planTopic = null;
    crewBus.onDispatch('group.topic', (env) => { planTopic = env.payload && env.payload.topic; });
    await crewBus.send('group-steward', 'group.hello', { from: 'beta-node' });
    say('BETA_UP');

    // Beta's SOVEREIGN local org model (must survive the replica untouched).
    const homeOrg = teams.createOrg('beta-local');
    const homeDept = teams.createDept('beta-home', { org: homeOrg.id });
    const homeTeam = teams.createTeam('beta-core', { dept: homeDept.id });
    teams.assign('beta-1', { org: homeOrg.id, dept: homeDept.id, team: homeTeam.id });
    say('BETA_LOCAL_OK');

    // Wait for the replica — the steward pushes after both members hello.
    const t0 = Date.now();
    while (orgSync.replicaStatus().generation === 0 && Date.now() - t0 < 15000) await wait(150);
    if (orgSync.replicaStatus().generation === 0) throw new Error('beta replica never arrived');
    say('BETA_REPLICA:' + orgSync.replicaStatus().generation);

    // The Wave-J moment BEFORE the vote: beta-1 can already resolve the
    // GROUP scope on its own node (local sovereign model + replica cache).
    // Diagnostics ride along: the routed-replica answer, the provider
    // presence, and the replica shape — a bare false teaches nothing.
    const preRead = scope.canAccess({ scope: { owner: 'team:group-chain', visibility: 'scope' } }, 'beta-1');
    say('BETA_SCOPE_LOCAL:' + preRead);
    say('BETA_DIAG:' + JSON.stringify({
        status: orgSync.replicaStatus(),
        routed: (() => { try { return [...(scope.resolveMembersRouted('team:group-chain', 'replica') || [])]; } catch (e) { return 'ERR:' + e.message; } })(),
        auto: (() => { try { return [...(scope.resolveMembers('team:group-chain') || [])]; } catch (e) { return 'ERR:' + e.message; } })(),
        providerPresent: !!(require('./lib/org-sync').provider())
    }));

    // Wait for the plan topic, then vote REMOTELY (owner-side gates decide).
    const t1 = Date.now();
    while (!planTopic && Date.now() - t1 < 15000) await wait(100);
    if (!planTopic) throw new Error('group topic never received');
    say('BETA_TOPIC_RX:' + planTopic);
    const r1 = await agoraSync.vote(crewBus, 'group-steward', planTopic, 'thursday-1400utc');
    say('BETA_VOTE:' + JSON.stringify({ voted: !!(r1 && r1.voted), error: (r1 && r1.result && r1.result.error) || null }));

    // ---- THE GOAL: read the group topic ON BETA'S OWN NODE ----
    // agora-sync.pull brings the ledger over; scope.canAccess must admit
    // beta-1 through the REPLICA (local-first, replica-on-miss).
    const pull = await agoraSync.pull(crewBus, 'group-steward', planTopic, { timeoutMs: 8000 });
    say('BETA_PULL:' + JSON.stringify({ ok: !!(pull && (pull.ok || pull.pulled)), reason: (pull && pull.reason) || null }));
    let read = null;
    const t2 = Date.now();
    while (Date.now() - t2 < 8000) {
        read = consensus.get(planTopic, 'beta-1');
        if (read) break;
        await wait(200);
    }
    say('BETA_REMOTE_READ:' + JSON.stringify({
        readable: !!read,
        votes: read ? Object.keys(read.votes).length : 0,
        status: read ? read.status : null
    }));
    setTimeout(() => process.exit(0), 600);
})().catch((e) => { console.error('BETA_FAIL:' + e.message); process.exit(1); });
`;

// ---------------- COLD PROCESS: what survived on disk ----------------
// COLD SOAK, per node: each install's disk independently proves its
// state survived the process deaths — steward (ledger + claim), acme
// (the plain notice), beta (the replica).
const COLD_FOR = (brain) => `process.env.VANT_BRAIN = ${JSON.stringify(brain)};
require('./lib/sandbox.js').defaultSandbox.setCapabilities({ canRead: true, canWrite: true });
const consensus = require('./lib/consensus');
const orgSync = require('./lib/org-sync');
const settlement = require('./lib/settlement');
const notices = require('./lib/notices');
consensus._resetHydration();
const row = consensus.list(undefined).find((l) => l.topic && l.topic.includes('group-q3-platform-call'));
const ledger = row ? consensus.get(row.topic) : null;
let claim = null;
try {
    const claims = settlement.list();
    claim = claims.length ? { id: claims[0].settlementId, price: claims[0].price } : null;
} catch (e) { claim = { error: e.message }; }
// The PLAIN notice deliberately carries NO scoped ref (that is the
// boundary rule) — find it by title.
const note = notices.list().find((n) => n.title && n.title.includes('platform call')) || null;
console.log(JSON.stringify({
    brain: ${JSON.stringify(brain)},
    topic: row ? row.topic : null,
    votes: ledger ? Object.keys(ledger.votes).length : 0,
    status: ledger ? ledger.status : null,
    replicaGeneration: orgSync.replicaStatus().generation,
    claim,
    bridgeNote: note ? note.title.slice(0, 40) : null
}));
`;

function run(script, label, onLine) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['-e', script], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
        let out = '', err = '';
        const feed = (d) => {
            out += d.toString();
            // FAIL markers go to stderr — feed BOTH streams through onLine
            // or the parent blind-waits while a child is already dead.
            if (onLine) for (const line of d.toString().split('\n')) if (line.trim()) onLine(line.trim());
        };
        child.stdout.on('data', feed);
        child.stderr.on('data', (d) => { err += d.toString(); feed(d); });
        child.on('close', (code) => resolve({ code, out, err }));
        child.on('error', reject);
        child.stdin.end();
    });
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
    console.log('\n🏢 THREE-ORG GROUP — LIVE EXERCISE (pass 69, Wave J + the N-node soak)');
    console.log('   beta ' + PORT_BETA + ' | acme ' + PORT_ACME + ' | steward ' + PORT_STEW + '\n');

    for (const brain of ['gx-steward', 'gx-acme', 'gx-beta']) {
        fs.rmSync(path.join(ROOT, 'models', 'private', brain), { recursive: true, force: true });
    }
    fs.rmSync(STATE_DIR, { recursive: true, force: true });
    fs.rmSync(ORGCHART_DIR, { recursive: true, force: true });

    const obs = {
        stewardUp: false, modelFormed: null, replicated: null, stewardReady: false,
        betaUp: false, betaLocal: false, betaReplica: null, betaScopeLocal: null,
        acmeUp: false, acmeReplica: null, proposed: null, acmeVote: null,
        betaTopic: null, betaVote: null, betaPull: null, betaRead: null,
        acmeTally: null, acmeSettle: null, acmeBridgeRefused: null, acmeNotice: null, stewardTally: null,
        stewardFail: null, acmeFail: null, betaFail: null
    };
    const childSteward = run(CHILD_STEWARD, 'steward', (line) => {
        if (line === 'STEWARD_UP') obs.stewardUp = true;
        if (line.startsWith('STEWARD_MODEL_FORMED:')) obs.modelFormed = line.slice(21);
        if (line.startsWith('STEWARD_REPLICATED:')) { try { obs.replicated = JSON.parse(line.slice(19)); } catch (e) {} }
        if (line === 'STEWARD_READY') obs.stewardReady = true;
        if (line.startsWith('STEWARD_TALLY:')) { try { obs.stewardTally = JSON.parse(line.slice(14)); } catch (e) {} }
        if (line.startsWith('STEWARD_FAIL:')) obs.stewardFail = line;
    });
    await wait(1200); // steward boots first (model + proposal ownership)

    const childBeta = run(CHILD_BETA, 'beta', (line) => {
        if (line === 'BETA_UP') obs.betaUp = true;
        if (line === 'BETA_LOCAL_OK') obs.betaLocal = true;
        if (line.startsWith('BETA_REPLICA:')) obs.betaReplica = parseInt(line.slice(13), 10) || 0;
        if (line.startsWith('BETA_SCOPE_LOCAL:')) obs.betaScopeLocal = line.slice(17) === 'true';
        if (line.startsWith('BETA_DIAG:')) { try { obs.betaDiag = JSON.parse(line.slice(10)); } catch (e) { obs.betaDiag = String(line.slice(10)).slice(0, 200); } }
        if (line.startsWith('BETA_TOPIC_RX:')) obs.betaTopic = line.slice(14);
        if (line.startsWith('BETA_VOTE:')) { try { obs.betaVote = JSON.parse(line.slice(10)); } catch (e) {} }
        if (line.startsWith('BETA_PULL:')) { try { obs.betaPull = JSON.parse(line.slice(10)); } catch (e) {} }
        if (line.startsWith('BETA_REMOTE_READ:')) { try { obs.betaRead = JSON.parse(line.slice(17)); } catch (e) {} }
        if (line.startsWith('BETA_FAIL:')) obs.betaFail = line;
    });
    const childAcme = run(CHILD_ACME, 'acme', (line) => {
        if (line === 'ACME_UP') obs.acmeUp = true;
        if (line.startsWith('ACME_REPLICA:')) obs.acmeReplica = parseInt(line.slice(13), 10) || 0;
        if (line.startsWith('ACME_TOPIC_RX:')) obs.proposed = line.slice(14);
        if (line.startsWith('ACME_VOTE:')) { try { obs.acmeVote = JSON.parse(line.slice(10)); } catch (e) {} }
        if (line.startsWith('ACME_TALLY:')) { try { obs.acmeTally = JSON.parse(line.slice(11)); } catch (e) {} }
        if (line.startsWith('ACME_SETTLE:')) { try { obs.acmeSettle = JSON.parse(line.slice(12)); } catch (e) {} }
        if (line.startsWith('ACME_BRIDGE_REFUSED:')) obs.acmeBridgeRefused = line.slice(20) === 'true';
        if (line.startsWith('ACME_PLAIN_NOTICE:')) obs.acmeNotice = line.slice(18) === 'true';
        if (line.startsWith('ACME_FAIL:')) obs.acmeFail = line;
    });

    const deadline = Date.now() + 75000;
    while (Date.now() < deadline && !(obs.acmeNotice !== null && obs.betaRead !== null) && !(obs.stewardFail || obs.acmeFail || obs.betaFail)) {
        await wait(300);
    }
    const rs = await Promise.race([childSteward, wait(3000)]) || { out: '' };
    const ra = await Promise.race([childAcme, wait(2000)]) || { out: '' };
    const rb = await Promise.race([childBeta, wait(2000)]) || { out: '' };

    // ---- Phase reporting (honest-record mode) ----
    const anyFail = obs.stewardFail || obs.acmeFail || obs.betaFail;
    phase('1. three stacks boot independently; signed mesh on one ring secret',
        obs.stewardUp && obs.betaUp && obs.acmeUp && !anyFail,
        'steward/beta/acme ' + [obs.stewardUp, obs.betaUp, obs.acmeUp].map((b) => b ? 'up' : 'DOWN').join('/') + (anyFail ? ' — ' + anyFail : ''));

    phase('2. steward forms the group org model and REPLICATES it to both members (Wave J leg)',
        !!obs.modelFormed && !!obs.replicated && obs.replicated.acme === true && obs.replicated.beta === true,
        'team ' + (obs.modelFormed || 'MISSING') + ', replicated ' + JSON.stringify(obs.replicated));

    phase('3. member replicas live (both members hold a generation-stamped cache)',
        obs.betaReplica > 0 && obs.acmeReplica > 0,
        'acme gen ' + obs.acmeReplica + ', beta gen ' + obs.betaReplica);

    phase('3b. beta resolves the GROUP scope on its own node BEFORE any vote (local sovereign + replica cache)',
        obs.betaScopeLocal === true,
        'canAccess: ' + obs.betaScopeLocal + ', diag: ' + JSON.stringify(obs.betaDiag));

    phase('4. acme receives the steward-owned topic and votes REMOTELY (owner-side gates on the steward)',
        !!obs.proposed && !!(obs.acmeVote && obs.acmeVote.voted === true),
        'topic ' + (obs.proposed || 'MISSING') + ', remote vote ' + JSON.stringify(obs.acmeVote));

    phase('5. beta-1 votes REMOTELY — owner-side gates admit the ballot',
        !!(obs.betaVote && obs.betaVote.voted === true),
        JSON.stringify(obs.betaVote) + (obs.betaPull ? ' | pull ' + JSON.stringify(obs.betaPull) : ''));

    phase('6. ONE joint ledger: 3 ballots from 3 orgs, PASSED',
        !!(obs.acmeTally && obs.acmeTally.votes >= 3 && obs.acmeTally.status === 'passed') &&
        !!(obs.stewardTally && obs.stewardTally.votes >= 3 && obs.stewardTally.status === 'passed'),
        'acme view ' + JSON.stringify(obs.acmeTally) + ' | steward view ' + JSON.stringify(obs.stewardTally));

    phase('7. THE WAVE-J GOAL: beta-1 READS the group topic on beta-node (replica-resolved scope)',
        !!(obs.betaRead && obs.betaRead.readable === true && obs.betaRead.votes >= 3),
        JSON.stringify(obs.betaRead));

    if (obs.acmeSettle && obs.acmeSettle.settled !== true) {
        gap('settlement leg: ' + JSON.stringify(obs.acmeSettle) + ' — claims ledger / budget state needs inspection before the soak is called clean.');
    }
    phase('8. execution economics: group-scoped listing; buyer debits OWN escrow; steward records the CLAIM (claims-not-cash)',
        !!(obs.acmeSettle && obs.acmeSettle.settled === true),
        JSON.stringify(obs.acmeSettle));

    phase('9. boundary discipline: bridge REFUSES the scoped topic (correct-by-design pin); the plain notice carries the outcome',
        obs.acmeBridgeRefused === true && obs.acmeNotice === true,
        'refusal ' + JSON.stringify(obs.acmeBridgeRefused) + ', plain notice ' + JSON.stringify(obs.acmeNotice));

    // ---- Cold processes (the soak): every node's disk, independently ----
    await wait(500);
    const coldSteward = await run(COLD_FOR('gx-steward'), 'cold-steward');
    const coldAcme = await run(COLD_FOR('gx-acme'), 'cold-acme');
    const coldBeta = await run(COLD_FOR('gx-beta'), 'cold-beta');
    const parse = (r) => { try { return JSON.parse(r.out.trim().split('\n').pop()); } catch (e) { return null; } };
    const cs = parse(coldSteward), ca = parse(coldAcme), cb = parse(coldBeta);
    const soakOk = !!(cs && cs.votes >= 3 && cs.status === 'passed' && cs.claim && !cs.claim.error) &&
        !!(ca && ca.bridgeNote) && !!(cb && cb.replicaGeneration > 0);
    phase('10. cold soak, per node: steward (ledger + claim), acme (plain notice), beta (replica) all survive process death',
        soakOk,
        'steward ' + JSON.stringify(cs) + ' | acme ' + JSON.stringify(ca && { note: ca.bridgeNote }) + ' | beta ' + JSON.stringify(cb && { gen: cb.replicaGeneration }));

    console.log('');
    if (obs.stewardFail || obs.acmeFail || obs.betaFail || results.failed > 0) {
        // FORENSICS: a child that dies without its FAIL marker (syntax
        // error, bind failure pre-catch) is invisible otherwise.
        for (const [name, r] of [['STEWARD', rs], ['ACME', ra], ['BETA', rb]]) {
            console.log('--- ' + name + ' tail ---\n' + (r.out || '').split('\n').filter(Boolean).slice(-6).join('\n'));
        }
    }
    if (results.gaps.length) {
        console.log('═══ GAPS FOUND (' + results.gaps.length + ') ═══');
        results.gaps.forEach((g, i) => console.log('  ' + (i + 1) + '. ' + g));
        console.log('');
    }
    if (results.failed === 0) {
        console.log('=== THREE-ORG GROUP EXERCISE: ' + results.passed + '/' + results.phases.length + ' phases passed, ' + results.gaps.length + ' gap(s) ===');
    } else {
        console.log('=== THREE-ORG GROUP EXERCISE: ' + results.failed + ' phase(s) FAILED, ' + results.gaps.length + ' gap(s) ===');
    }
    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error('Exercise harness error:', e);
    process.exit(1);
});
