#!/usr/bin/env node
/**
 * CROSS-INSTALL REAL RUN — the first two-install federation (2026-11-09)
 *
 * Two INDEPENDENT vant installs, two brains, two repos, federate over the
 * layer vant already ships. This is not the same-disk JV harness: each side
 * is a separate install with its own brain (its own private tree, its own
 * protocol state), spawned in its own cwd.
 *
 *   INSTALL A — vant (this repo), brain `vant`
 *     HOST: genesis.create -> pair secret (returned ONCE, handed
 *     out-of-band), JV org model, the work topic, its own ballot, and the
 *     traveler mint (the triage pin).
 *
 *   INSTALL B — cairn (VANT_PEER_ROOT), brain `cairn`
 *     JOINER: genesis.join with the out-of-band secret (the ack proves
 *     both sides booted the same key), a REMOTE agora ballot through the
 *     genesis-formed pair, and the traveler's gapped leg.
 *
 * The two transports a real (possibly airgapped) install pair rides:
 *   1. LIVE WIRE  — the HMAC-signed crew bus (genesis + agora-sync). Needs
 *      a reachable socket; this is the networked leg.
 *   2. GAPPED LANE — the traveler (content-addressed, append-only ledger)
 *      over a CARRIER. Here the carrier is a FILE the two installs hand
 *      across; in production it is a git commit, a stone, a scan frame —
 *      the same packet, a different physical interface. This leg needs NO
 *      socket at all.
 *
 * HONEST-RECORD MODE: every phase asserts what vant ACTUALLY does. Where a
 * federation leg is not there yet, the harness records a GAP, never a fake
 * pass — the gaps are the exercise's product.
 *
 * Run: node labs/mesh/cross-install-real-run.js
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');          // install A (vant)
const PEER_ROOT = process.env.VANT_PEER_ROOT || '/workspace/cairn-install'; // install B (cairn)

const results = { passed: 0, failed: 0, phases: [], gaps: [] };
function phase(name, ok, detail) {
    results.phases.push({ name, ok, detail: detail || '' });
    console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
    if (ok) results.passed++; else results.failed++;
    return ok;
}
function gap(text) { results.gaps.push(text); console.log(`  ⚠ GAP: ${text}`); }

const pidSuffix = process.pid.toString(36);
const PORT_H = 53000 + (parseInt(pidSuffix, 36) % 5000) * 2;   // vant host
const PORT_J = PORT_H + 1;                                     // cairn joiner
const TOPIC = 'cross-install-triage-' + pidSuffix;
const CARRIER_OUT = path.join('/tmp', 'vant-carrier-' + pidSuffix + '.json');   // A -> B
const CARRIER_BACK = CARRIER_OUT + '.return';                                  // B -> A

console.log('\n🌐 CROSS-INSTALL REAL RUN — two installs federating\n');
console.log('   install A: vant  ' + ROOT + '  (port ' + PORT_H + ')');
console.log('   install B: cairn ' + PEER_ROOT + '  (port ' + PORT_J + ')\n');

// ---------------- INSTALL A: vant (host) ----------------
const HOST_SCRIPT = `
require('./lib/sandbox.js').defaultSandbox.setCapabilities({
    canRead: true, canWrite: true, canNetwork: true, canTrade: true
});
const genesis = require('./lib/genesis');
const consensus = require('./lib/consensus');
const traveler = require('./lib/traveler');
const carriers = require('./lib/carriers');
const brain = require('./lib/brain');
const fs = require('fs');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
    console.log('HOST_BRAIN:' + brain.getCurrentBrain());

    const r = await genesis.create({
        name: 'vant', agentId: 'vant-lead', port: ${PORT_H},
        joiner: { name: 'cairn', agentId: 'cairn-lead', port: ${PORT_J} },
        jv: { org: 'jv-vant-cairn', dept: 'struct-family', team: 'gamestruct-lane' }
    });
    if (!r.ok) { console.log('HOST_FAIL:create ' + JSON.stringify(r)); process.exit(1); }
    console.log('HOST_SECRET:' + r.secret);
    console.log('HOST_JV:' + (r.jv && r.jv.team ? r.jv.team.id : 'none') + ':' + JSON.stringify(r.jv ? r.jv.scope : null));

    // The joint work topic, under the JV scope the ceremony formed.
    const c = await consensus.create(${JSON.stringify(TOPIC)}, {
        ballot: ['ratify', 'reject'], minQuorum: 2, useTrustWeight: false, scope: r.jv.scope
    });
    if (c.error) { console.log('HOST_FAIL:topic ' + c.error); process.exit(1); }
    const v = await consensus.vote(${JSON.stringify(TOPIC)}, 'ratify', 'vant-lead');
    if (v.error && !v.totalVotes) { console.log('HOST_FAIL:vote ' + JSON.stringify(v).slice(0, 120)); process.exit(1); }
    console.log('HOST_VOTED');

    // MINT the triage pin (the traveler) and carry it over the json lane.
    const t = traveler.mint({
        from: 'vant', verb: 'open',
        slots: { title: 'Triage gamestruct SPEC + adapters', repo: 'dhaupin/gamestruct', ask: 'staleness' }
    });
    const art = carriers.encode(t, 'json');
    fs.writeFileSync(${JSON.stringify(CARRIER_OUT)}, JSON.stringify(art, null, 2));
    console.log('HOST_TRAVELER_MINTED:' + t.id.slice(0, 16) + ':' + t.seq);

    // Wait for the joiner's remote ballot AND the returned carrier.
    let votes = 0, back = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 15000) {
        const l = consensus.get(${JSON.stringify(TOPIC)});
        votes = l ? Object.keys(l.votes).length : 0;
        if (fs.existsSync(${JSON.stringify(CARRIER_BACK)})) {
            try { back = JSON.parse(fs.readFileSync(${JSON.stringify(CARRIER_BACK)}, 'utf8')); } catch (e) {}
        }
        if (votes >= 2 && back) break;
        await wait(200);
    }
    const tally = consensus.tally(${JSON.stringify(TOPIC)});
    const led = consensus.get(${JSON.stringify(TOPIC)});
    console.log('HOST_TALLY:' + JSON.stringify({ votes, status: tally.status, voters: led ? Object.keys(led.votes) : [] }));

    // The gapped leg comes back: decode, verify, read the two-station ledger.
    if (back) {
        const d2 = carriers.decode('json', back);
        const t2 = d2.traveler || d2;
        const ver = traveler.verify(t2);
        console.log('HOST_TRAVELER_BACK:' + JSON.stringify({
            id: t2.id.slice(0, 16), seq: t2.seq, verified: ver.ok,
            stations: t2.steps.map((s) => s.op + '@' + s.by),
            detail: (t2.steps[t2.steps.length - 1].detail || null)
        }));
    } else {
        console.log('HOST_TRAVELER_BACK:null');
    }
    setTimeout(() => process.exit(0), 400);
})().catch((e) => { console.log('HOST_FAIL:' + e.message); process.exit(1); });
`;

// ---------------- INSTALL B: cairn (joiner) ----------------
function joinerScript(secret) {
    return `
require('./lib/sandbox.js').defaultSandbox.setCapabilities({
    canRead: true, canWrite: true, canNetwork: true, canTrade: true
});
const genesis = require('./lib/genesis');
const agoraSync = require('./lib/agora-sync');
const traveler = require('./lib/traveler');
const carriers = require('./lib/carriers');
const brain = require('./lib/brain');
const fs = require('fs');
(async () => {
    console.log('JOIN_BRAIN:' + brain.getCurrentBrain());

    const r = await genesis.join({
        name: 'cairn', agentId: 'cairn-lead', port: ${PORT_J},
        host: 'vant', hostPort: ${PORT_H}, hostAgent: 'vant-lead',
        secret: ${JSON.stringify(secret)}, timeoutMs: 12000
    });
    console.log('JOIN_RESULT:' + JSON.stringify({ ok: r.ok, acked: r.acked, reason: r.reason || null, jvTeam: r.jv ? r.jv.team : null }));
    if (!r.ok) process.exit(1);

    await new Promise((res) => setTimeout(res, 400));

    // REMOTE ballot through the genesis-formed pair (the live-wire leg).
    const crewBus = require('./lib/crew-bus');
    const vote = await agoraSync.vote(crewBus.default, 'vant', ${JSON.stringify(TOPIC)}, 'ratify', { agentId: 'cairn-lead' });
    console.log('JOIN_VOTE:' + JSON.stringify(vote));

    // THE GAPPED LEG: pick up the host's carrier, verify, advance a station.
    let art = null;
    const t0 = Date.now();
    while (!art && Date.now() - t0 < 10000) {
        if (fs.existsSync(${JSON.stringify(CARRIER_OUT)})) {
            try { art = JSON.parse(fs.readFileSync(${JSON.stringify(CARRIER_OUT)}, 'utf8')); } catch (e) {}
        }
        if (!art) await new Promise((res) => setTimeout(res, 150));
    }
    if (!art) { console.log('JOIN_FAIL:no carrier arrived'); process.exit(1); }
    const d = carriers.decode('json', art);
    const t = d.traveler || d;
    const vIn = traveler.verify(t);
    console.log('JOIN_TRAVELER_IN:' + JSON.stringify({ id: t.id.slice(0, 16), verified: vIn.ok, from: t.from, seq: t.seq }));

    // Advance: cairn's triage verdict lands as a station on the SAME packet.
    const t2 = traveler.advance(t, {
        op: 'triage', by: 'cairn',
        detail: { verdict: 'fresh', spec: 'v0.1.0 unchanged', adapters: 'world+brain ship', note: 'A11yService tree = door seam' }
    });
    const art2 = carriers.encode(t2, 'json');
    fs.writeFileSync(${JSON.stringify(CARRIER_BACK)}, JSON.stringify(art2, null, 2));
    console.log('JOIN_TRAVELER_OUT:' + JSON.stringify({ id: t2.id.slice(0, 16), seq: t2.seq, stations: t2.steps.map((s) => s.op + '@' + s.by) }));
    setTimeout(() => process.exit(0), 300);
})().catch((e) => { console.log('JOIN_FAIL:' + e.message); process.exit(1); });
`;
}

function run(cwd, script, onLine) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['-e', script], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
        let out = '', errout = '';
        child.stdout.on('data', (d) => {
            out += d.toString();
            if (onLine) for (const line of d.toString().split('\n')) if (line.trim()) onLine(line.trim());
        });
        child.stderr.on('data', (d) => { errout += d.toString(); });
        child.on('close', (code) => resolve({ code, out, errout }));
        child.on('error', reject);
        child.stdin.end();
    });
}

async function main() {
    if (!fs.existsSync(path.join(PEER_ROOT, 'lib', 'genesis.js'))) {
        console.log('   ✗ peer install not found at ' + PEER_ROOT + ' (set VANT_PEER_ROOT)');
        process.exit(2);
    }
    try { fs.unlinkSync(CARRIER_OUT); } catch (e) {}
    try { fs.unlinkSync(CARRIER_BACK); } catch (e) {}

    const obs = { hostBrain: null, joinBrain: null, secret: null, jv: null, hostVoted: false,
        hostTally: null, joinResult: null, joinVote: null, hostTraveler: null, joinTravelerIn: null,
        joinTravelerOut: null, hostTravelerBack: null, hostFail: null, joinFail: null };

    let joinerPromise = null;
    const hostPromise = run(ROOT, HOST_SCRIPT, (line) => {
        if (line.startsWith('HOST_BRAIN:')) obs.hostBrain = line.slice(11);
        if (line.startsWith('HOST_SECRET:') && !joinerPromise) {
            obs.secret = line.slice(12);
            // Out-of-band handoff: the pair secret goes to the peer install
            // via the HARNESS (the wire never carries the key that signs it).
            joinerPromise = run(PEER_ROOT, joinerScript(obs.secret), (l) => {
                if (l.startsWith('JOIN_BRAIN:')) obs.joinBrain = l.slice(11);
                if (l.startsWith('JOIN_RESULT:')) { try { obs.joinResult = JSON.parse(l.slice(12)); } catch (e) {} }
                if (l.startsWith('JOIN_VOTE:')) { try { obs.joinVote = JSON.parse(l.slice(10)); } catch (e) {} }
                if (l.startsWith('JOIN_TRAVELER_IN:')) { try { obs.joinTravelerIn = JSON.parse(l.slice(17)); } catch (e) {} }
                if (l.startsWith('JOIN_TRAVELER_OUT:')) { try { obs.joinTravelerOut = JSON.parse(l.slice(18)); } catch (e) {} }
                if (l.startsWith('JOIN_FAIL:')) obs.joinFail = l;
            });
        }
        if (line.startsWith('HOST_JV:')) obs.jv = line.slice(8);
        if (line === 'HOST_VOTED') obs.hostVoted = true;
        if (line.startsWith('HOST_TALLY:')) { try { obs.hostTally = JSON.parse(line.slice(11)); } catch (e) {} }
        if (line.startsWith('HOST_TRAVELER_MINTED:')) obs.hostTraveler = line.slice(21);
        if (line.startsWith('HOST_TRAVELER_BACK:')) { try { obs.hostTravelerBack = JSON.parse(line.slice(19)); } catch (e) {} }
        if (line.startsWith('HOST_FAIL:')) obs.hostFail = line;
    });
    const hostRes = await hostPromise;
    const joinRes = joinerPromise ? await joinerPromise : null;

    console.log('\n--- PHASES ---\n');

    phase('0. two installs boot INDEPENDENTLY (two brains, two repos)',
        obs.hostBrain === 'vant' && obs.joinBrain === 'cairn',
        'A=' + obs.hostBrain + ' B=' + obs.joinBrain);

    phase('1. genesis join ceremony ACROSS the install boundary (secret out-of-band)',
        obs.joinResult && obs.joinResult.ok && obs.joinResult.acked === true,
        'acked=' + (obs.joinResult ? obs.joinResult.acked : 'n/a') + ' jv=' + (obs.joinResult ? obs.joinResult.jvTeam : 'n/a'));

    phase('2. joint ledger: vant ballot (local) + cairn ballot (REMOTE over the wire)',
        obs.hostTally && obs.hostTally.votes >= 2 && obs.hostTally.status === 'passed',
        JSON.stringify(obs.hostTally));

    phase('3. GAPPED leg: vant mints the triage pin, cairn picks it up off the carrier',
        !!(obs.hostTraveler && obs.joinTravelerIn && obs.joinTravelerIn.verified),
        'in=' + JSON.stringify(obs.joinTravelerIn));

    phase('4. cairn advances a station (its triage verdict) on the SAME packet',
        !!(obs.joinTravelerOut && obs.joinTravelerOut.seq === 2),
        'out=' + JSON.stringify(obs.joinTravelerOut));

    phase('5. the packet returns; vant verifies continuity across two stations',
        !!(obs.hostTravelerBack && obs.hostTravelerBack.verified && obs.hostTravelerBack.seq === 2
            && obs.hostTravelerBack.stations && obs.hostTravelerBack.stations.length === 2),
        JSON.stringify(obs.hostTravelerBack));

    if (obs.hostFail) gap('host: ' + obs.hostFail);
    if (obs.joinFail) gap('joiner: ' + obs.joinFail);
    if (hostRes && hostRes.errout && hostRes.errout.trim()) gap('host stderr: ' + hostRes.errout.trim().split('\n')[0]);
    if (joinRes && joinRes.errout && joinRes.errout.trim()) gap('joiner stderr: ' + joinRes.errout.trim().split('\n')[0]);

    console.log('\n=== CROSS-INSTALL REAL RUN: ' + results.passed + '/' + (results.passed + results.failed) +
        ' phases passed, ' + results.gaps.length + ' gap(s) recorded ===\n');
    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('HARNESS_FAIL:' + e.message); process.exit(1); });
