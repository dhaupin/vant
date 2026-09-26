#!/usr/bin/env node
/**
 * Distributed Agora — Live Wire Demo v0.3 (pass 51, next-wave candidate 3)
 *
 * The pass-50 distributed agora, live-probed on TWO REAL node processes
 * (the pass-50 TASKS note promised this probe; demo-v02's pattern):
 *
 *   node A (owner "agora-owner", port P1)     node B (peer "agora-peer", port P2)
 *   ------------------------------------      ------------------------------------
 *   1. crew-bus up WITH agentId, sync wired   1. crew-bus up WITH agentId, sync wired
 *   2. team + scope created OWNER-side        2. (waiting on the wire)
 *   3. team-scoped topic + owner vote
 *   4. OWNER_READY marker ──────────────────▶ 3. agora-sync.vote() → signed envelope
 *                                             4. OWNER runs its FULL local gate stack
 *                                                (scope where the team lives, registry
 *                                                vetting, one vote) and acks the verdict
 *   5. owner tally: 2 ballots, PASSED ◀────── 5. peer sees { voted: true, tally }
 *   6. cold third process tallies the persisted state (2 votes, passed)
 *
 * The peer NEVER sees the team model — scope resolves where the team
 * registry lives (owner), and the wire carries only {topic,outcome,agentId}.
 *
 * Run: node labs/node-crew/demo-v03-agora-wire.js
 * Exit 0 only if every phase passed. Cleans its state files on exit.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
process.chdir(ROOT); // brain paths are cwd-relative (models/…)

const results = { passed: 0, failed: 0, phases: [] };
function phase(name, ok, detail) {
    results.phases.push({ name, ok, detail: detail || '' });
    console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
    if (ok) results.passed++; else results.failed++;
    return ok;
}

// Ports: run-scoped ephemeral pair derived from the parent pid (no clashes
// with reruns, the dev server, or MCP).
const BASE = 46000 + (process.pid % 8000) * 2;
const PORT_OWNER = BASE;
const PORT_PEER = BASE + 1;
const SECRET = 'vant-agora-v03-' + process.pid.toString(36);
const TOPIC = 'agora-v03-team-vote-' + Date.now().toString(36);
const STATE_DIR = path.join(ROOT, 'models', 'private', 'vant', 'state');
const ORGCHART_DIR = path.join(ROOT, 'models', 'private', 'vant', 'orgchart');

// ---------- child node scripts (each = one real process) ----------

// OWNER: boots the bus with its principal agentId, builds the team model
// (org > dept > team with BOTH voters assigned), creates the team-scoped
// topic, casts its own vote, then signals the peer to send its ballot.
const CHILD_OWNER = `
require('./lib/sandbox.js').defaultSandbox.setCapabilities({
    canRead: true, canWrite: true, canNetwork: true, canTrade: true
});
const registry = require('./lib/node-registry');
const crewBus = require('./lib/crew-bus');
const consensus = require('./lib/consensus');
const agoraSync = require('./lib/agora-sync');
const teams = require('./lib/teams');
const network = require('./lib/network');
const SECRET = ${JSON.stringify(SECRET)};
const TOPIC = ${JSON.stringify(TOPIC)};
const PORT_OWNER = ${PORT_OWNER};
const PORT_PEER = ${PORT_PEER};
(async () => {
    registry.clearState();
    try { network.setAllowedDomains(['127.0.0.1']); } catch (e) {}
    crewBus.configure({ name: 'agora-owner', port: PORT_OWNER, secret: SECRET, agentId: 'owner-agent' });
    crewBus.registerNode({ name: 'agora-peer', url: 'http://127.0.0.1:' + PORT_PEER, secret: SECRET });
    agoraSync.install(crewBus);
    await crewBus.listen(PORT_OWNER);

    // The OWNER's trust anchors: registry (vetting) + team model (scope).
    // The peer's principal 'vetted-remote' is PRE-REGISTERED here — the
    // genesis flow — and is a team member; the team lives ONLY on this node.
    registry.register({ id: 'owner-agent', name: 'agora-owner', host: '127.0.0.1', port: PORT_OWNER });
    registry.register({ id: 'vetted-remote', name: 'agora-peer', host: '127.0.0.1', port: PORT_PEER });
    const org = teams.createOrg('v03-acme');
    const dept = teams.createDept('v03-infra', { org: org.id });
    const team = teams.createTeam('v03-crew', { dept: dept.id });
    teams.assign('vetted-remote', { org: org.id, dept: dept.id, team: team.id });
    teams.assign('owner-agent', { org: org.id, dept: dept.id, team: team.id });

    const SCOPE = { owner: 'team:' + team.id, visibility: 'scope' };
    const ledger = await consensus.create(TOPIC, { options: ['ratify', 'reject'], minQuorum: 2, useTrustWeight: false, scope: SCOPE });
    if (ledger.error) throw new Error('consensus.create: ' + ledger.error);
    const v = await consensus.vote(TOPIC, 'ratify', 'owner-agent');
    if (v.error && !v.totalVotes) throw new Error('owner vote: ' + JSON.stringify(v).slice(0, 120));
    console.log('OWNER_READY');
    setTimeout(() => process.exit(0), 9000); // stay up for the ballot + ack
})().catch((e) => { console.error('OWNER_FAIL:' + e.message); process.exit(1); });
`;

// PEER: boots its own bus (its agentId is the team-member principal),
// waits for OWNER_READY, then casts a REMOTE ballot by envelope via
// agora-sync.vote. The ack's verdict is printed for the parent to pin.
const CHILD_PEER = `
require('./lib/sandbox.js').defaultSandbox.setCapabilities({
    canRead: true, canWrite: true, canNetwork: true, canTrade: true
});
const crewBus = require('./lib/crew-bus');
const agoraSync = require('./lib/agora-sync');
const network = require('./lib/network');
const SECRET = ${JSON.stringify(SECRET)};
const TOPIC = ${JSON.stringify(TOPIC)};
const PORT_OWNER = ${PORT_OWNER};
const PORT_PEER = ${PORT_PEER};
(async () => {
    try { network.setAllowedDomains(['127.0.0.1']); } catch (e) {}
    crewBus.configure({ name: 'agora-peer', port: PORT_PEER, secret: SECRET, agentId: 'vetted-remote' });
    crewBus.registerNode({ name: 'agora-owner', url: 'http://127.0.0.1:' + PORT_OWNER, secret: SECRET });
    agoraSync.install(crewBus);
    await crewBus.listen(PORT_PEER);
    console.log('PEER_UP');
    // Small stagger: the owner's create+vote write-through must be on disk
    // before our ballot lands (documented multi-process contract).
    setTimeout(async () => {
        try {
            const r = await agoraSync.vote(crewBus, 'agora-owner', TOPIC, 'ratify');
            if (r.voted) {
                console.log('PEER_VOTED:' + JSON.stringify(r.tally));
            } else {
                console.log('PEER_VOTE_FAIL:' + JSON.stringify(r));
            }
            setTimeout(() => process.exit(0), 100);
        } catch (e) {
            console.log('PEER_VOTE_FAIL:' + e.message);
            process.exit(1);
        }
    }, 700);
    setTimeout(() => { console.error('PEER_TIMEOUT'); process.exit(1); }, 15000);
})().catch((e) => { console.error('PEER_FAIL:' + e.message); process.exit(1); });
`;

// Cold third process: read the RESTARTED owner state only. Two ballots
// and a PASSED tally can only exist if the remote envelope ballot was
// gated and counted by the owner.
const CHILD_COLD_TALLY = `
require('./lib/sandbox.js').defaultSandbox.setCapabilities({ canRead: true, canWrite: true });
const consensus = require('./lib/consensus');
consensus._resetHydration();
const t = consensus.tally(${JSON.stringify(TOPIC)});
console.log(JSON.stringify({ totalVotes: t.totalVotes, leading: t.leading, status: t.status }));
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
    console.log('\n🏛️  DISTRIBUTED AGORA — LIVE WIRE DEMO v0.3 (two real node processes)');
    console.log('   owner port ' + PORT_OWNER + ' | peer port ' + PORT_PEER + '\n');

    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.rmSync(path.join(STATE_DIR, 'consensus.json'), { force: true });
    fs.rmSync(path.join(STATE_DIR, 'node-registry.json'), { force: true });
    fs.rmSync(ORGCHART_DIR, { recursive: true, force: true });

    const observed = { ownerReady: false, peerUp: false, peerVoted: null, peerFail: null, ownerFail: null };
    const ownerPromise = run(CHILD_OWNER, 'agora-owner', (line) => {
        if (line === 'OWNER_READY') observed.ownerReady = true;
        if (line.startsWith('OWNER_FAIL:')) observed.ownerFail = line;
    });
    const peerPromise = run(CHILD_PEER, 'agora-peer', (line) => {
        if (line === 'PEER_UP') observed.peerUp = true;
        if (line.startsWith('PEER_VOTED:')) observed.peerVoted = line.slice('PEER_VOTED:'.length);
        if (line.startsWith('PEER_VOTE_FAIL:') || line.startsWith('PEER_FAIL:')) observed.peerFail = line;
    });

    const deadline = Date.now() + 20000;
    while (Date.now() < deadline && !(observed.peerVoted || observed.peerFail || observed.ownerFail)) {
        await wait(100);
    }
    await Promise.race([peerPromise, wait(1500)]);
    await Promise.race([ownerPromise, wait(500)]);

    phase('1. two node processes booted crew-bus + sync (both with agentId)', observed.ownerReady && observed.peerUp,
        'ports ' + PORT_OWNER + '/' + PORT_PEER);
    phase('2. remote ballot accepted over the signed wire', !!observed.peerVoted,
        observed.peerVoted ? 'ack: ' + observed.peerVoted : (observed.peerFail || observed.ownerFail || 'no PEER_VOTED'));

    let peerTally = null;
    try { peerTally = JSON.parse(observed.peerVoted || 'null'); } catch (e) { /* unparseable */ }
    phase('3. ack carried the live tally (owner-side gate stack ran remotely)', !!(peerTally && peerTally.totalVotes === 2),
        peerTally ? ('status=' + peerTally.status + ' votes=' + peerTally.totalVotes) : 'no tally in ack');

    // ---- Cold-process tally across every process death ----
    await wait(300); // let the last write-through flush settle
    const cold = await run(CHILD_COLD_TALLY, 'cold');
    let tally = null;
    try { tally = JSON.parse(cold.out.trim().split('\n').pop()); } catch (e) { tally = null; }
    phase('4. cold-process tally: 2 ballots, PASSED (state survived all exits)',
        !!(tally && tally.totalVotes === 2 && tally.status === 'passed'),
        tally ? ('status=' + tally.status + ' votes=' + tally.totalVotes + ' leading=' + tally.leading) : 'no tally: ' + cold.out.slice(0, 80));

    console.log('');
    if (results.failed === 0) {
        console.log('=== v0.3 distributed agora: ALL PHASES PASSED (' + results.passed + '/' + results.phases.length + ') ===');
    } else {
        console.log('=== v0.3 distributed agora: ' + results.failed + ' phase(s) FAILED ===');
        if (!observed.peerVoted && (observed.peerFail || observed.ownerFail)) {
            console.log('   failure detail: ' + (observed.peerFail || observed.ownerFail));
        }
    }
    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error('Demo harness error:', e);
    process.exit(1);
});
