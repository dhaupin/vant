#!/usr/bin/env node
/**
 * Vant P3 RELAY-LANE PILOT — the r/2 webhook corridor on REAL pods.
 *
 * WHERE P2 LEFT OFF: the two-pod pilot rode the corridor on direct keyed
 * door calls (pod-to-pod fetch/stamp). This pass boots the FULL lane the
 * mesh actually speaks: TWO full vant pod processes (startFull: MCP door +
 * REST + the r/2 relay face mounted at POST /relay) each with its own
 * HMAC relay gate, a shared pair channelKey — and (pass 270) the posture
 * the pilot arms is the INTRANET LAN-scope one, NOT the full lab escape:
 * a compromised pod can never widen this lane into a LAN prober.
 * The r/2 contract at work on the wire:
 *
 *   1. THE RIDE CORRIDOR (relay.ride — a pod as the sealed ENDPOINT):
 *      a paired client seals a REAL door call inside an AES-256-GCM
 *      envelope (the pair channelKey), HMAC-signs the outer envelope with
 *      the pod's relay gate, and POSTs to the pod's own webhook port. The
 *      pod opens the envelope, checks the anti-replay nonce, dispatches
 *      the inner call through its REAL MCP door, and re-seals the answer
 *      for the return trip. The plaintext never exists between the pair.
 *   2. THE HOP CORRIDOR (relay.hop — a pod as the FORWARDER): a signed hop
 *      carries a sealed envelope to a declared upstream intake (here: a
 *      real device at the corridor's far end). The relay verifies, then
 *      forwards ONLY the ciphertext — the device's intake sees { ct } and
 *      nothing else; no gate, no channel key, no plaintext ever touches
 *      the forwarder's outbound leg.
 *   3. THE RED TEAM: transport replay (identical signed bytes), inner
 *      nonce replay on fresh bytes, wrong channel key, wrong relay gate,
 *      unsigned intake, plaintext hop (no downgrade), dead origin — every
 *      one refuses typed, nothing contested the walls.
 *
 * Run:  node scripts/pilot-two-relays.js   (idempotent; resets ONLY the two
 *       pilot pods' own brains — pilot-relay-a / pilot-relay-b)
 * Exit: 0 = every wall held on the wire. 1 = a wall failed — a REAL bug in
 * the relay/carrier/door laws, never a "test flake".
 */

'use strict';

process.env.VANT_BRAIN = 'pilot-relay-b';   // the harness's own brain; the pods scope themselves by env

const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const path = require('path');
const crypto = require('crypto');

const BRAIN_A = 'pilot-relay-a';
const BRAIN_B = 'pilot-relay-b';

const api = require('../lib/api');
const relay = api.relay;
const EncryptMod = require('../lib/encrypt').default;

const pass = [];
const fail = [];
function ok(name, cond, info) {
    (cond ? pass : fail).push({ name, info: info || (cond ? '' : 'assertion failed') });
    console.log('  ' + (cond ? '✓' : '✗') + ' ' + name + (cond ? '' : '  ← ' + (info || '')));
}
function attempt(fn) { try { return { ran: true, out: fn() }; } catch (e) { return { ran: false, err: e }; } }
void attempt;   // kept for parity with the other pilots; every pin here holds async

const fsMod = require('fs');
for (const b of [BRAIN_A, BRAIN_B]) {
    fsMod.rmSync(path.join('models', 'private', b), { recursive: true, force: true });
}

console.log('\n📻 VANT P3 RELAY-LANE PILOT — real full pods, r/2 HMAC webhook corridor, e2e envelopes\n');

// ==================== helpers ====================

function jsonParse(s) { try { return JSON.parse(s); } catch (e) { return null; } }

function getBody(port, route) {
    return new Promise((resolve) => {
        const req = http.get({ host: '127.0.0.1', port, path: route }, (res) => {
            let buf = '';
            res.on('data', (c) => { buf += c; });
            res.on('end', () => resolve({ status: res.statusCode, body: buf }));
        });
        req.on('error', () => resolve({ status: 0, body: '' }));
    });
}

/** An ephemeral loopback port free RIGHT NOW (the bind race is caught by
 *  the readiness polls). */
function reservePort() {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.listen(0, '127.0.0.1', () => {
            const p = srv.address().port;
            srv.close(() => resolve(p));
        });
        srv.on('error', reject);
    });
}

/** The r/2 sender side, composed exactly like the lib's own seam: outer
 *  envelope (event/from/ts/nonce/payload/v), raw bytes HMAC-signed with
 *  the relay gate, POSTed to /relay. Also postRaw(): re-post EXACT raw
 *  bytes + signature (the transport-replay red team needs byte identity,
 *  which a fresh envelope would never have). */
const SIG_HEADER = 'X-Signature-256';
function postRaw(port, raw, sig) {
    return new Promise((resolve) => {
        const req = http.request({
            host: '127.0.0.1', port,
            path: '/relay', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(raw), [SIG_HEADER]: sig }
        }, (res) => {
            let buf = '';
            res.on('data', (c) => { buf += c; });
            res.on('end', () => resolve({ status: res.statusCode, json: jsonParse(buf) }));
        });
        req.on('error', () => resolve({ status: 0, json: null }));
        req.end(raw);
    });
}
function corridorSend(port, gate, envelopePayload, event) {
    const envelope = {
        event: event || 'relay.ride',
        from: 'corridor-harness',
        ts: Date.now(),
        nonce: crypto.randomBytes(16).toString('hex'),
        payload: envelopePayload,
        v: { major: relay.WIRE_MAJOR }
    };
    const raw = JSON.stringify(envelope);
    const sig = EncryptMod.hmacSign(raw, gate);
    return postRaw(port, raw, sig).then((ans) => Object.assign(ans, { raw, sig }));
}

/** An envelope-sealed ride body: { nonce, bearer, body { tool, args } }. */
function sealedRide(channelKey, opts) {
    const inner = JSON.stringify({
        nonce: opts.nonce,
        bearer: opts.bearer,
        body: { tool: opts.tool, args: opts.args || {} }
    });
    return relay.envelope(inner, channelKey);
}

/** The device intake at the corridor's far end: a REAL socket that only
 *  understands envelopes — and RETURNS A SEALED RECEIPT. It records every
 *  byte it saw for the no-leak red team. */
function startDevice(channelKey) {
    const seen = [];
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
            seen.push(body);
            try {
                const parsed = JSON.parse(body);
                const opened = JSON.parse(relay.openEnvelope(parsed && parsed.ct, channelKey));
                const receipt = { atDevice: true, saw: opened.something, echo: opened.mark };
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(relay.envelope(JSON.stringify(receipt), channelKey)));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ refused: true, why: e.message }));
            }
        });
    });
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, seen }));
    });
}

/** Boot one FULL vant pod process. The in-child entry arms the relay
 *  posture through the REAL in-process flag lane (exactly the posture
 *  `vant config set` arms) and then boots the full runtime
 *  (startFull: MCP door + REST + the r/2 relay face mounted at /relay). */
const BOOT_SNIPPET = `
const cfg = require('./lib/config');
cfg.set('relay.enabled', true);
cfg.set('relay.gateKey', process.env.VANT_RELAY_GATE);
cfg.set('relay.channelKey', process.env.VANT_RELAY_CHANNEL);
cfg.set('relay.intranetOrigins', true);
require('./lib/vant').startFull({ mode: 'all' })
    .then(function () { console.log('[POD] spine up'); })
    .catch(function (e) { console.error('[POD] boot failed: ' + e.message); process.exit(1); });
`;

function bootFullPod(brain, opts) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['-e', BOOT_SNIPPET], {
            cwd: path.join(__dirname, '..'),
            env: Object.assign({}, process.env, {
                VANT_BRAIN: brain,
                VANT_MCP_PORT: String(opts.mcp),
                VANT_SERVER_PORT: String(opts.rest),
                VANT_WEBHOOK_PORT: String(opts.webhook),
                VANT_MCP_REQUIRE_KEY: 'true',
                VANT_MCP_API_KEY: opts.mcpKey,
                VANT_RELAY_GATE: opts.gate,
                VANT_RELAY_CHANNEL: opts.channel
            }),
            stdio: ['ignore', 'pipe', 'pipe']
        });
        child.stdout.on('data', () => { /* keep draining so the pipe never backpressures */ });
        child.stderr.on('data', () => { /* drained too; failures surface through the polls */ });
        const dead = setTimeout(() => { child.kill(); reject(new Error('pod ' + brain + ' never came up')); }, 30000);
        const poll = async () => {
            const mcp = await getBody(opts.mcp, '/health');
            const hook = await getBody(opts.webhook, '/health');
            if (mcp.status === 200 && hook.status === 200) { clearTimeout(dead); resolve({ child, opts }); return; }
            if (child.exitCode !== null) { clearTimeout(dead); reject(new Error('pod ' + brain + ' exited during boot (code ' + child.exitCode + ')')); return; }
            setTimeout(poll, 300);
        };
        setTimeout(poll, 500);
    });
}

/** The door call the paired client can also make DIRECTLY (the corridor's
 *  unencrypted baseline for the same move) — it rides pod A's keyed MCP
 *  door, not the lane. */
function keyedCall(port, key, tool, args) {
    return new Promise((resolve) => {
        const body = JSON.stringify({ tool, args: args || {} });
        const req = http.request({
            host: '127.0.0.1', port,
            path: '/mcp/exec', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'x-api-key': key }
        }, (res) => {
            let buf = '';
            res.on('data', (c) => { buf += c; });
            res.on('end', () => resolve({ status: res.statusCode, json: jsonParse(buf) }));
        });
        req.on('error', () => resolve({ status: 0, json: null }));
        req.end(body);
    });
}

const pods = [];
const deviceRef = { server: null };
function cleanup() {
    for (const p of pods) { try { p.child.kill(); } catch (e) { /* already gone */ } }
    try { if (deviceRef.server) deviceRef.server.close(); } catch (e) { /* closed */ }
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });

(async () => {
    // ==================== ACT I: two full pods, the lane armed ====================
    console.log('  ACT I — two full vant pods boot (MCP + REST + the r/2 relay face), HMAC gates armed\n');

    const gate = (label) => 'relaygate-' + label + '-' + crypto.randomBytes(16).toString('hex');
    const channel = 'corridor-channel-' + crypto.randomBytes(16).toString('hex');   // the PAIR key both pod doors trust for this corridor

    const [mcpA, restA, hookA, mcpB, restB, hookB, _devPort] = await Promise.all([
        reservePort(), reservePort(), reservePort(),
        reservePort(), reservePort(), reservePort(),
        reservePort()
    ]);
    const podOptsA = { mcp: mcpA, rest: restA, webhook: hookA, mcpKey: crypto.randomBytes(20).toString('hex'), gate: gate('a'), channel: channel };
    const podOptsB = { mcp: mcpB, rest: restB, webhook: hookB, mcpKey: crypto.randomBytes(20).toString('hex'), gate: gate('b'), channel: channel };

    try {
        pods.push(...await Promise.all([bootFullPod(BRAIN_A, podOptsA), bootFullPod(BRAIN_B, podOptsB)]));
    } catch (e) {
        console.error('\n❌ POD BOOT FAILED — ' + e.message);
        console.error('   the corridor cannot run without its own real pods; this is a REAL failure, not a skip.');
        process.exit(1);
    }
    const podA = pods[0], podB = pods[1];
    console.log('   pod A: brain ' + BRAIN_A + ' · MCP ' + podA.opts.mcp + ' · REST ' + podA.opts.rest + ' · relay ' + podA.opts.webhook + ' (HMAC gate)');
    console.log('   pod B: brain ' + BRAIN_B + ' · MCP ' + podB.opts.mcp + ' · REST ' + podB.opts.rest + ' · relay ' + podB.opts.webhook + ' (HMAC gate)');

    const healthA = await getBody(podA.opts.mcp, '/health');
    const healthB = await getBody(podB.opts.mcp, '/health');
    const hookAUp = await getBody(podA.opts.webhook, '/health');
    const hookBUp = await getBody(podB.opts.webhook, '/health');
    ok('L1. both FULL pods are up: MCP door, REST face, and the relay webhook listener',
        healthA.status === 200 && healthB.status === 200 && hookAUp.status === 200 && hookBUp.status === 200,
        'mcp ' + healthA.status + '/' + healthB.status + ' hook ' + hookAUp.status + '/' + hookBUp.status);

    // THE LANE IS THE GATE: the route answers, but an UNSIGNED intake must
    // refuse (the HMAC gate is the only way through POST /relay).
    const unsignedLane = await new Promise((resolve) => {
        const req = http.request({ host: '127.0.0.1', port: podA.opts.webhook, path: '/relay', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': 2 } }, (res) => {
            let b = ''; res.on('data', (c) => { void (b += c); }); res.on('end', () => resolve(res.statusCode));  // void body
        });
        req.on('error', () => resolve(0));
        req.end('{}');
    });
    ok('L2. the relay corridor lane answers its route but REFUSES unsigned intake (HMAC-only, the gate is the wire law)',
        unsignedLane !== 200, 'unsigned POST status ' + unsignedLane);

    // ==================== ACT II: the line rides pod A's door ====================
    console.log('\n  ACT II — pod A has the letter; the paired client drives it through the sealed ride corridor\n');

    const keyA = podA.opts.mcpKey;
    const openA = await keyedCall(podA.opts.mcp, keyA, 'traveler_open', { title: 'wheel-88', slots: { lot: 'L-P3-001' } });
    ok('F1. pod A\'s own door mints the corridor letter (the lane-ups are real, so the runtime is live)',
        openA && openA.status === 200 && openA.json && !openA.json.error && openA.json.result && openA.json.result.opened === true,
        JSON.stringify(openA.json || {}).slice(0, 120));
    if (!openA || !openA.json || !openA.json.result) { process.exit(1); }
    const letterId = openA.json.result.id;

    const weighIn = await keyedCall(podA.opts.mcp, keyA, 'traveler_carry', {
        id: letterId,
        stations: [
            { by: 'pod-a-mold', op: 'mold', part: { name: 'rim', alloy: 'al-6061' } },
            { by: 'pod-a-ship', op: 'ship', carrier: 'nsc9' }
        ],
        template: [
            { op: 'mold', part: 'rim' },
            { op: 'ship' }
        ]
    });
    ok('F2. pod A\'s door routes the letter (the carry passes, the built letter is at pod A)',
        weighIn && weighIn.status === 200 && weighIn.json && weighIn.json.result && weighIn.json.result.ok === true &&
        weighIn.json.result.letter && weighIn.json.result.letter.assembly && weighIn.json.result.letter.assembly.rim,
        JSON.stringify((weighIn && weighIn.json) || {}).slice(0, 160));

    // THE RIDE: a paired client seals a REAL door call (the corridor's
    // status read) in the e2e envelope and drives it through the lane.
    const nonce1 = 'ride-pilot-000000000001';
    const ride1Ct = sealedRide(channel, { nonce: nonce1, bearer: keyA, tool: 'traveler_status', args: { id: letterId } });
    const ride1 = await corridorSend(podA.opts.webhook, podA.opts.gate, { ct: ride1Ct }, 'relay.ride');
    const ride1Reply = ride1.json && ride1.json.reply;
    ok('R1. the RIDE corridor over real sockets: signed envelope -> the pod opens it -> its REAL door answers -> re-sealed',
        ride1.status === 200 && ride1Reply && ride1Reply.ok === true && ride1Reply.rode === true && typeof ride1Reply.ct === 'string',
        JSON.stringify(ride1.json || null).slice(0, 160));
    let ride1Open = null;
    try { ride1Open = jsonParse(relay.openEnvelope(ride1Reply.ct, channel)); }
    catch (e) { ride1Open = { error: e.message }; }
    // the door answer rides inside its own { result } wrapper — open one more
    const r1t = (ride1Open && ride1Open.result && typeof ride1Open.result === 'object') ? ride1Open.result : ride1Open;
    ok('R2. the paired client OPENS the ride reply with its own channel key: a real traveler answer rode back',
        r1t && r1t.seen === true && r1t.id === letterId && Array.isArray(r1t.stations),
        JSON.stringify(r1t || ride1Open || {}).slice(0, 160));
    ok('R3. the door NEVER saw the lane secrets (gate absent both directions)',
        ride1Reply && !JSON.stringify(ride1.json).includes(podA.opts.gate) && !JSON.stringify(ride1.json).includes(channel),
        'lane secrets must not cross the envelope');

    // R4. transport replay: EXACT same signed bytes (raw + signature) -> the
    // transport answers with its 409 gate before the face even opens them.
    const replayBytes = await postRaw(podA.opts.webhook, ride1.raw, ride1.sig);
    ok('R4. transport replay: identical signed bytes answer 409 at the lane',
        replayBytes.status === 409, 'status ' + replayBytes.status);

    // 10c. FRESH signed bytes, SAME inner nonce -> typed E_RIDE_REPLAY
    const ride2Ct = sealedRide(channel, { nonce: nonce1, bearer: keyA, tool: 'traveler_status', args: { id: letterId } });
    const ride2 = await corridorSend(podA.opts.webhook, podA.opts.gate, { ct: ride2Ct }, 'relay.ride');
    ok('R5. inner nonce REPLAY on fresh bytes -> typed E_RIDE_REPLAY (the rung-2 guard)',
        ride2.status === 200 && ride2.json && ride2.json.reply && ride2.json.reply.ok === false
        && ride2.json.reply.code === 'E_RIDE_REPLAY', JSON.stringify((ride2.json && ride2.json.reply) || {}).slice(0, 120));

    // 10d. WRONG channel key -> typed E_RIDE_DECODE
    const wrongChannel = 'a-fully-different-channel-key';
    const ride3Ct = sealedRide(wrongChannel, { nonce: 'ride-pilot-000000000003', bearer: keyA, tool: 'traveler_status', args: { id: letterId } });
    const ride3 = await corridorSend(podA.opts.webhook, podA.opts.gate, { ct: ride3Ct }, 'relay.ride');
    ok('R6. wrong/stale channel key -> typed E_RIDE_DECODE (fail-closed, no ferry for the outsider)',
        ride3.status === 200 && ride3.json && ride3.json.reply && ride3.json.reply.ok === false
        && ride3.json.reply.code === 'E_RIDE_DECODE', JSON.stringify((ride3.json && ride3.json.reply) || {}).slice(0, 120));

    // 10e. WRONG RELAY GATE -> the HMAC gate refuses at the intake
    const bogusGate = podA.opts.gate.slice(0, -1) + (podA.opts.gate.slice(-1) === '0' ? '1' : '0');
    const ride4Ct = sealedRide(channel, { nonce: 'ride-pilot-000000000004', bearer: keyA, tool: 'traveler_status', args: { id: letterId } });
    const ride4 = await corridorSend(podA.opts.webhook, bogusGate, { ct: ride4Ct }, 'relay.ride');
    ok('R7. wrong relay gate -> the HMAC gate refuses the intake (no blind relay)',
        ride4.status !== 200 || (ride4.json && ride4.json.reply && ride4.json.reply.ok === false),
        'status ' + ride4.status);

    // ==================== ACT III: the hop corridor (pod A forwards ciphertext only) ====================
    console.log('\n  ACT III — pod A hop-forwards a sealed envelope to the device; the device sees only the ciphertext\n');

    const device = await startDevice(channel);
    deviceRef.server = device.server;

    const innerHop = JSON.stringify({ mark: 'hop-corridor-p3', something: 'sealed-through-pod-a', tag: true });
    const hopCt = relay.envelope(innerHop, channel);
    const hop1 = await corridorSend(podA.opts.webhook, podA.opts.gate, { origin: 'http://127.0.0.1:' + device.port, path: '/', ct: hopCt }, 'relay.hop');
    ok('H1. the HOP corridor over real sockets: signed hop -> pod A forwards ONLY the ciphertext -> the device answers',
        hop1.status === 200 && hop1.json && hop1.json.reply && hop1.json.reply.ok === true && typeof hop1.json.reply.raw === 'string',
        JSON.stringify(hop1.json || null).slice(0, 160));
    let deviceOpen = null;
    try {
        // the device answers a JSON STRING containing the envelope literal —
        // parse the wire, then open (the receipt never rides as plaintext)
        deviceOpen = jsonParse(relay.openEnvelope(jsonParse(hop1.json.reply.raw), channel));
    }
    catch (e) { deviceOpen = { error: e.message }; }
    ok('H2. the device\'s SEALED RECEIPT opens with the pair channel key (e2e both ways)',
        deviceOpen && deviceOpen.atDevice === true && deviceOpen.echo === 'hop-corridor-p3',
        JSON.stringify(deviceOpen || {}).slice(0, 140));
    ok('H3. NO BODY LEAK at the hop: the device intake saw ONLY { ct } (no plaintext, no gate, no channel key)',
        device.seen.length === 1 && jsonParse(device.seen[0]) && jsonParse(device.seen[0]).ct
        && !device.seen[0].includes('hop-corridor-p3')
        && !device.seen[0].includes(podA.opts.gate) && !device.seen[0].includes(channel)
        && !device.seen[0].includes('sealed-through-pod-a'),
        String(device.seen[0]).slice(0, 120));

    // Hop red team: a claim WITHOUT an envelope never rides.
    const hop2 = await corridorSend(podA.opts.webhook, podA.opts.gate, {
        origin: 'http://127.0.0.1:' + device.port, path: '/', ct: 'plainrefuse'
    }, 'relay.hop');
    ok('H4. a plaintext hop body refuses typed E_RELAY_NEEDS_ENVELOPE (no downgrade to plaintext hops)',
        hop2.status === 200 && hop2.json && hop2.json.reply && hop2.json.reply.ok === false
        && hop2.json.reply.code === 'E_RELAY_NEEDS_ENVELOPE',
        JSON.stringify((hop2.json && hop2.json.reply) || {}).slice(0, 120));

    const deadPort = await reservePort();
    const hop3 = await corridorSend(podA.opts.webhook, podA.opts.gate, {
        origin: 'http://127.0.0.1:' + deadPort, path: '/', ct: hopCt
    }, 'relay.hop');
    ok('H5. a DEAD origin (nobody bound) -> typed E_RELAY_UPST honest refusal (a dropped hop is a record, not silence)',
        hop3.status === 200 && hop3.json && hop3.json.reply && hop3.json.reply.ok === false
        && hop3.json.reply.code === 'E_RELAY_UPST',
        JSON.stringify((hop3.json && hop3.json.reply) || {}).slice(0, 140));

    // (pass 270) THE POSTURE PIN: the lane above runs with the INTRANET
    // LAN-scope posture (no lab escape armed). A public plain-http origin
    // must still refuse typed — the lane proofs LAN neighbors WITHOUT
    // becoming a general http prober.
    const hop4 = await corridorSend(podA.opts.webhook, podA.opts.gate, {
        origin: 'http://example.com', path: '/', ct: hopCt
    }, 'relay.hop');
    ok('H6. INTRANET posture holds WITHOUT the SSRF escape: a PUBLIC http origin refuses typed E_RELAY_BAD_ORIGIN (LAN neighbors yes, the open wire no)',
        hop4.status === 200 && hop4.json && hop4.json.reply && hop4.json.reply.ok === false
        && hop4.json.reply.code === 'E_RELAY_BAD_ORIGIN',
        JSON.stringify((hop4.json && hop4.json.reply) || {}).slice(0, 140));

    // ==================== VERDICT ====================
    console.log('\n--- RESULTS ---');
    console.log('  Passed:  ' + pass.length);
    console.log('  Failed:  ' + fail.length);
    if (fail.length > 0) {
        console.log('\n  FAILED PINS:');
        for (const f of fail) console.log('    ✗ ' + f.name + (f.info ? '  ← ' + f.info : ''));
    } else {
        console.log('\n  Two real full pods rode one r/2 webhook corridor: the paired client drove a' +
            '\n  REAL door call through the sealed ride, the corridor hopped ciphertext to a device' +
            '\n  intake without a single unsealed byte, and every hostile wire answer refused typed.' +
            '\n  A wall breach is a REAL bug, never a flake.\n');
    }
    process.exit(fail.length > 0 ? 1 : 0);
})().catch((e) => {
    console.error('\n❌ PILOT CRASHED — ' + (e && e.message));
    if (process.env.DEBUG) console.error(e && e.stack);
    cleanup();
    process.exit(1);
});
