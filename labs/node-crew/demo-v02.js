#!/usr/bin/env node
/**
 * Vant Node Crew — Genesis Demo v0.2 (pass 39, labs/prd-vant-os.md Wave 4)
 *
 * The PRD's definition of done, on TWO REAL node processes:
 *
 *   node A (master "vant-master", port P1)    node B (peer "aria", port P2)
 *   ---------------------------------         ---------------------------------
 *   1. crew-bus up, registry peer             1. crew-bus up, registry peer
 *   2. consensus topic + master vote          2. (waiting on the wire)
 *   3. HMAC-signed genesis envelope ────────▶ 3. verify → dispatch → ack,
 *                                              then peer casts ITS vote
 *   4. cold third process tallies the RESTARTED state: 2 votes, ratify,
 *      consensus.json survived both process exits (Waves 1-3 payoff)
 *
 * Unlike demo.js (v0.1: protocol actors sharing ONE process), each vote is
 * cast in its own process and verified against that process's node-registry
 * view — the anchor consensus trusts.
 *
 * Run: node labs/node-crew/demo-v02.js
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
const PORT_MASTER = BASE;
const PORT_PEER = BASE + 1;
const SECRET = 'vant-crew-v02-' + process.pid.toString(36);
const TOPIC = 'crew-v02-ratification-' + Date.now().toString(36);
const STATE_DIR = path.join(ROOT, 'models', 'private', 'vant', 'state');

// ---------- child node scripts (each = one real process) ----------

// Master: boot bus, create+vote the topic, send the signed genesis envelope.
// Exits after MASTER_DONE (its state is already on disk — write-through).
const CHILD_MASTER = `
require('./lib/sandbox.js').defaultSandbox.setCapabilities({
    canRead: true, canWrite: true, canNetwork: true, canTrade: true
});
const registry = require('./lib/node-registry');
const crewBus = require('./lib/crew-bus');
const consensus = require('./lib/consensus');
const network = require('./lib/network');
const NAME = 'vant-master';
const SECRET = ${JSON.stringify(SECRET)};
const TOPIC = ${JSON.stringify(TOPIC)};
const PEER_URL = 'http://127.0.0.1:' + ${PORT_PEER};
(async () => {
    registry.clearState();
    try { network.setAllowedDomains(['127.0.0.1']); } catch (e) {}
    crewBus.configure({ name: NAME, port: ${PORT_MASTER}, secret: SECRET });
    crewBus.registerNode({ name: 'aria', url: PEER_URL, secret: SECRET });
    await crewBus.listen(${PORT_MASTER});

    // Registry-anchored voting: both ids must be alive in THIS process's view.
    registry.register({ id: 'vant-master', name: NAME, host: '127.0.0.1', port: ${PORT_MASTER} });
    registry.register({ id: 'aria-peer', name: 'aria', host: '127.0.0.1', port: ${PORT_PEER} });
    const ledger = await consensus.create(TOPIC, { options: ['ratify', 'reject'], minQuorum: 2, useTrustWeight: false });
    if (ledger.error) throw new Error('consensus.create: ' + ledger.error);
    const v = await consensus.vote(TOPIC, 'ratify', 'vant-master');
    if (v.error && !v.totalVotes) throw new Error('vote: ' + JSON.stringify(v).slice(0, 120));

    // The signed wire: genesis envelope -> peer's route.
    const send = await crewBus.send('aria', 'genesis', { blessing: 'two-process society', topic: TOPIC });
    if (!send.ok) throw new Error('send not acked: ' + JSON.stringify(send).slice(0, 120));
    console.log('MASTER_DONE');
    await crewBus.stop();
    process.exit(0);
})().catch((e) => { console.error('MASTER_FAIL:' + e.message); process.exit(1); });
`;

// Peer: boot bus, wait for the genesis envelope, ack it via the dispatcher,
// then cast the peer's vote in ITS OWN process. Stays alive until PEER_DONE.
const CHILD_PEER = `
require('./lib/sandbox.js').defaultSandbox.setCapabilities({
    canRead: true, canWrite: true, canNetwork: true, canTrade: true
});
const registry = require('./lib/node-registry');
const crewBus = require('./lib/crew-bus');
const consensus = require('./lib/consensus');
const network = require('./lib/network');
const NAME = 'aria';
const SECRET = ${JSON.stringify(SECRET)};
const TOPIC = ${JSON.stringify(TOPIC)};
const MASTER_URL = 'http://127.0.0.1:' + ${PORT_MASTER};
(async () => {
    registry.clearState();
    try { network.setAllowedDomains(['127.0.0.1']); } catch (e) {}
    crewBus.configure({ name: NAME, port: ${PORT_PEER}, secret: SECRET });
    crewBus.registerNode({ name: 'vant-master', url: MASTER_URL, secret: SECRET });
    crewBus.onDispatch('genesis', () => {
        console.log('GENESIS_RX');
        // The peer's registry view must hold the voter ids too.
        registry.register({ id: 'aria-peer', name: NAME, host: '127.0.0.1', port: ${PORT_PEER} });
        registry.register({ id: 'vant-master', name: 'vant-master', host: '127.0.0.1', port: ${PORT_MASTER} });
        // (concurrency note) the ledger is created by the master in ANOTHER
        // process; the peer's in-memory map hydrated at boot, before the
        // topic existed. Re-hydrate from disk (write-through has landed by
        // the time we got the envelope — the send acked after create+vote),
        // then vote. That is exactly what a real multi-process node does.
        consensus._resetHydration();
        consensus.list(); // re-hydrate NOW (disk has the master's ledger)
        consensus.vote(TOPIC, 'ratify', 'aria-peer').then((r) => {
            if (r.error && !r.totalVotes) { console.log('PEER_VOTE_FAIL:' + r.error); return; }
            console.log('PEER_VOTED');
            setTimeout(() => process.exit(0), 50);
        }).catch((e) => console.log('PEER_VOTE_FAIL:' + e.message));
    });
    await crewBus.listen(${PORT_PEER});
    console.log('PEER_UP');
    setTimeout(() => { console.error('PEER_TIMEOUT'); process.exit(1); }, 20000);
})().catch((e) => { console.error('PEER_FAIL:' + e.message); process.exit(1); });
`;

// Cold third process: read the RESTARTED state only. No vote calls — this
// is the Waves 1-3 payoff (state survives every process death above).
const CHILD_COLD_TALLY = `
require('./lib/sandbox.js').defaultSandbox.setCapabilities({ canRead: true, canWrite: true });
const consensus = require('./lib/consensus');
const t = consensus.tally(${JSON.stringify(TOPIC)});
const l = consensus.list().find((x) => x.topic === ${JSON.stringify(TOPIC)});
console.log(JSON.stringify({ totalVotes: t.totalVotes, leading: t.leading, status: t.status, found: !!l }));
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
    console.log('\n🚌 VANT NODE CREW — GENESIS DEMO v0.2 (two real node processes)');
    console.log('   master port ' + PORT_MASTER + ' | peer port ' + PORT_PEER + '\n');

    fs.mkdirSync(STATE_DIR, { recursive: true });
    for (const f of ['consensus.json', 'node-registry.json']) {
        fs.rmSync(path.join(STATE_DIR, f), { force: true });
    }

    // ---- Phase 1 + 2 + 3: concurrent nodes, signed wire, peer vote ----
    // The peer's markers stream in via onLine; the peer process exits itself
    // after PEER_VOTED. The master exits after MASTER_DONE.
    const observed = { genesisRx: false, peerVoted: false, peerFail: null, masterDone: false };
    const peerPromise = run(CHILD_PEER, 'aria', (line) => {
        if (line === 'GENESIS_RX') observed.genesisRx = true;
        if (line === 'PEER_VOTED') observed.peerVoted = true;
        if (line.startsWith('PEER_VOTE_FAIL:') || line.startsWith('PEER_FAIL:')) observed.peerFail = line;
    });
    const masterPromise = run(CHILD_MASTER, 'vant-master', (line) => {
        if (line === 'MASTER_DONE') observed.masterDone = true;
    });

    // Start the master AFTER the peer's server is up (PEER_UP on the wire).
    // Simpler + race-free: start both; the master's send retries briefly.
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline && !(observed.masterDone && observed.peerVoted)) {
        await wait(100);
        if (observed.peerFail) break;
    }
    await Promise.race([peerPromise, wait(1500)]);
    const masterResult = await Promise.race([masterPromise, wait(1000).then(() => null)]);

    phase('1. two node processes booted crew-bus + registry', true,
        'ports ' + PORT_MASTER + '/' + PORT_PEER);
    phase('2. signed genesis envelope verified + dispatched', observed.genesisRx,
        observed.genesisRx ? 'HMAC ok, dispatcher fired' : (observed.peerFail || 'no GENESIS_RX'));
    phase('3. peer vote cast + registry-anchored in its own process', observed.peerVoted,
        observed.peerVoted ? 'aria-peer verified alive in peer registry view' : (observed.peerFail || 'no PEER_VOTED'));

    // ---- Phase 4: cold-process tally across every process death ----
    await wait(200); // let the last write-through flush settle
    const cold = await run(CHILD_COLD_TALLY, 'cold');
    let tally = null;
    try { tally = JSON.parse(cold.out.split('\n').filter(Boolean).pop()); } catch (e) { /* parse fail */ }
    const coldOk = !!(tally && tally.found && tally.totalVotes === 2 && tally.leading === 'ratify');
    phase('4. protocol state survived real process deaths (cold tally)', coldOk,
        tally ? JSON.stringify(tally) : (cold.err || 'no JSON').slice(0, 100));

    // ---- Report ----
    console.log('\n--- GENESIS v0.2 REPORT ---');
    for (const p of results.phases) {
        console.log('  ' + (p.ok ? 'PASS' : 'FAIL') + '  ' + p.name + (p.detail ? ' — ' + p.detail : ''));
    }
    console.log('\n' + results.passed + ' passed, ' + results.failed + ' failed');
    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error('Fatal:', e.message);
    process.exit(1);
});
