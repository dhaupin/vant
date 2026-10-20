#!/usr/bin/env node
/**
 * VANT KEYLESS-RIDE PILOT — the r/2 SEALED lane on REAL pod processes
 * (the corridor the pass-272/275 rungs exist to close, proven live).
 *
 * The rider below holds ONLY the pairing channel key — never a relay
 * gate. Every wire lane it rides is credential SEALS (HMAC-SHA256 over
 * the ct bytes, carried INSIDE the payload, NO X-Signature-256 header):
 *
 *   1. THE DIRECT CRUISE: the rider seals a REAL door call (ctx-bound,
 *      rung-2) and POSTs it straight at pod A's webhook route. A's
 *      sealMode route verifies the channel-key seal against its verify
 *      set (gate + channel — a gate the rider never held), the ride core
 *      opens the envelope, and the answer comes back re-sealed.
 *   2. THE KEYLESS CHAIN: the rider composes a SEALED hop for the
 *      upstream pod B (ct = B-ctx-bound ride, seal = channel-key HMAC)
 *      and posts it to pod A. A verifies the hop's seal, forwards
 *      { ct, seal } (the hop-LAST-MILE shape — a blind middlebox carries
 *      the credential instead of inventing one), B's bare-ride lane
 *      hoists it through ONE seal law, B's ride core rides B's own MCP
 *      door, and B's ack rides the chain back. The rider opens the
 *      answer with the channel key it paired with.
 *   3. THE RED TEAM: bare { ct } with no seal → 401 (pass 42 untouched);
 *      wrong-key seal → 401; stale seal ts → 401; identical seal replay
 *      → 409; fresh-top-level bytes around the same seal → still 409.
 *
 * Run:  node scripts/pilot-keyless-ride.js   (idempotent; resets ONLY the
 *       two pilot pods' own brains — pilot-relay-a / pilot-relay-b)
 * Exit: 0 = every wall held on real sockets. 1 = a wall failed.
 */

'use strict';

process.env.VANT_BRAIN = 'pilot-relay-b';   // the harness's own brain; pods scope by env

const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const path = require('path');
const fsMod = require('fs');
const crypto = require('crypto');

const BRAIN_A = 'pilot-relay-a';
const BRAIN_B = 'pilot-relay-b';
const CHANNEL = 'pilot-keyless-channel-key-w6no4g2u7m';  // the PAIRING key (rider + both pods)
const GATE_A = 'pilot-keyless-gate-A-9c2f7e5b1a';        // pod A's relay gate — the RIDER NEVER SEES IT
const GATE_B = 'pilot-keyless-gate-B-4d8e6c30f7';

for (const b of [BRAIN_A, BRAIN_B]) {
    fsMod.rmSync(path.join('models', 'private', b), { recursive: true, force: true });
}

console.log('\n🔐 VANT KEYLESS-RIDE PILOT — sealed lane on real pods; the rider holds only the pairing channel key\n');

const pass = [];
const fail = [];
function ok(name, cond, info) {
    (cond ? pass : fail).push({ name, info: info || (cond ? '' : 'assertion failed') });
    console.log('  ' + (cond ? '✓' : '✗') + ' ' + name + (cond ? '' : '  ← ' + (info || '')));
}

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

function post(port, raw, headers) {
    return new Promise((resolve) => {
        const req = http.request({
            host: '127.0.0.1', port, path: '/relay', method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(raw) }, headers || {})
        }, (res) => {
            let buf = '';
            res.on('data', (c) => { buf += c; });
            res.on('end', () => resolve({ status: res.statusCode, json: jsonParse(buf) }));
        });
        req.on('error', () => resolve({ status: 0, json: null }));
        req.end(raw);
    });
}

// ---- THE RIDER (channel key only, by construction) --------------------
// Node-side stand-in for the paired sovereign browser: it composes the
// SAME shapes the dashboard's seal.ts + cruisePodWebhook build (Encrypt
// canon seal, channel-key HMAC, seal-in-payload, no header).

const Encrypt = (() => {
    try { return require('../lib/encrypt').default; } catch (e) {
        console.error('pilot bootstrap failed: ' + e.message); process.exit(1);
    }
})();

/** The seal (rider half): HMAC-SHA256 hex over the ct string EXACTLY. */
const sealSig = (ct) => Encrypt.hmacSign(ct, CHANNEL);

/** An e2e envelope over the ride record (Encrypt canon). The inner
 *  bearer is the DOOR authority (the same law the paired corridor rides):
 *  it travels INSIDE the envelope and never exists in the clear. */
function shapeRide(nonce, ctxOrigin, ctxPath, tool, args, bearer) {
    return Encrypt.encrypt(JSON.stringify({
        nonce,
        ctx: { origin: ctxOrigin, path: ctxPath, nonce },
        bearer: bearer || null,
        body: { tool, args: args || {} }
    }), CHANNEL);
}

/** The rider's sealed crew envelope: payload { ct, seal } — NO header. */
function riderEnvelope(event, payload) {
    return JSON.stringify({
        event,
        from: 'keyless-rider',
        ts: Date.now(),
        nonce: crypto.randomBytes(16).toString('hex'),
        payload,
        v: { major: 2 }
    });
}

async function openAnswer(ct, expectNonce) {
    const opened = JSON.parse(Encrypt.decrypt(ct, CHANNEL));
    if (opened.nonce !== expectNonce) throw new Error('answer nonce mismatch: ' + opened.nonce + ' vs ' + expectNonce);
    const door = JSON.parse(String(opened.answer));
    return door;
}

// ==================== pod boot ====================

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

function bootFullPod(brain, ports) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['-e', BOOT_SNIPPET], {
            cwd: path.join(__dirname, '..'),
            env: Object.assign({}, process.env, {
                VANT_BRAIN: brain,
                VANT_MCP_PORT: String(ports.mcp),
                VANT_SERVER_PORT: String(ports.rest),
                VANT_WEBHOOK_PORT: String(ports.webhook),
                VANT_MCP_REQUIRE_KEY: 'true',
                VANT_MCP_API_KEY: 'pilot-keyless-mcp-key-' + brain,
                VANT_RELAY_GATE: (ports.gate = ports.gate), // settled by the caller below
                VANT_RELAY_CHANNEL: CHANNEL
            }),
            stdio: ['ignore', 'pipe', 'pipe']
        });
        child.stdout.on('data', () => { /* drained */ });
        child.stderr.on('data', () => { /* drained; failures surface through polls */ });
        const dead = setTimeout(() => { child.kill(); reject(new Error('pod ' + brain + ' never came up')); }, 30000);
        const poll = async () => {
            const mcp = await getBody(ports.mcp, '/health');
            const hook = await getBody(ports.webhook, '/health');
            if (mcp.status === 200 && hook.status === 200) { clearTimeout(dead); resolve(child); return; }
            if (child.exitCode !== null) { clearTimeout(dead); reject(new Error('pod ' + brain + ' exited during boot (code ' + child.exitCode + ')')); return; }
            setTimeout(poll, 300);
        };
        setTimeout(poll, 500);
    });
}

async function main() {
    // ports (A: mcp/rest/webhook, B: mcp/rest/webhook)
    const A = { mcp: await reservePort(), rest: await reservePort(), webhook: await reservePort() };
    const B = { mcp: await reservePort(), rest: await reservePort(), webhook: await reservePort() };

    const childA = await bootFullPod(BRAIN_A, { ...A, gate: GATE_A });
    let childB = null;
    try {
        childB = await bootFullPod(BRAIN_B, { ...B, gate: GATE_B });
        ok('0. two full pods up (MCP door + REST + webhook relay face, channel-key verify set armed)', true);
        const webhookA = A.webhook;
        const webhookB = B.webhook;

        // ---- 1. THE DIRECT CRUISE (rider → A, sealed ride, no header) ----
        const doorKeyA = 'pilot-keyless-mcp-key-' + BRAIN_A;
        const doorKeyB = 'pilot-keyless-mcp-key-' + BRAIN_B;
        const directNonce = 'keyless-direct-' + Date.now().toString(36);
        const directCt = shapeRide(directNonce, 'http://127.0.0.1:' + webhookA, '/relay', 'relay_status', {}, doorKeyA);
        const directRaw = riderEnvelope('relay.ride', { ct: directCt, seal: { sig: sealSig(directCt), ts: Date.now() } });
        const directAns = await post(webhookA, directRaw, {});
        let directDoor = null;
        let directWhy = '';
        try { directDoor = await openAnswer(directAns.json.reply.ct, directNonce); } catch (e) { directDoor = { error: e.message }; directWhy = e.message; }
        ok('1. KEYLESS direct cruise: the rider seals a real door call with ONLY the channel key, no header — the pod answers re-sealed (relay_status result)',
            directAns.status === 200 && directAns.json.reply && directAns.json.reply.ok === true
            && directDoor && !directDoor.error
            && directDoor.result && directDoor.result.contract === 'r/2',
            JSON.stringify(directAns.json || null).slice(0, 120) + ' | open: ' + directWhy + (directDoor ? ' | door: ' + JSON.stringify(directDoor).slice(0, 160) : ''));

        // ---- 2. THE KEYLESS CHAIN (rider → A hop → B last mile) ----
        const chainNonce = 'keyless-chain-' + Date.now().toString(36);
        const bOrigin = 'http://127.0.0.1:' + webhookB;
        const chainCt = shapeRide(chainNonce, bOrigin, '/relay', 'relay_status', {}, doorKeyB);
        const chainSeal = { sig: sealSig(chainCt), ts: Date.now() };
        const hopRaw = riderEnvelope('relay.hop', { origin: bOrigin, path: '/relay', ct: chainCt, seal: chainSeal });
        const chainAns = await post(webhookA, hopRaw, {});
        let chainDoor = null;
        let chainWhy = '';
        try {
            const bAck = jsonParse(chainAns.json.reply.raw);
            if (!bAck || !bAck.reply || !bAck.reply.ok) { chainWhy = 'B refused: ' + JSON.stringify(bAck && bAck.reply).slice(0, 120); }
            else { chainDoor = await openAnswer(bAck.reply.ct, chainNonce); }
        } catch (e) { chainWhy = e.message; }
        ok('2. KEYLESS chain: rider → A (channel-key seal) → blind forward { ct, seal } → B bare-ride → B\'s real MCP door → answer back, opened with the pairing key',
            chainAns.status === 200 && chainAns.json.reply && chainAns.json.reply.ok === true
            && chainDoor && !chainDoor.error
            && chainDoor.result && chainDoor.result.contract === 'r/2',
            (chainAns.json ? JSON.stringify(chainAns.json.reply).slice(0, 140) : 'no ack') + ' | ' + chainWhy + (chainDoor ? ' | door: ' + JSON.stringify(chainDoor).slice(0, 160) : ''));

        // ---- 3. THE RED TEAM ----
        // 3a. bare { ct } with NO seal → 401 (pass 42 untouched)
        const bareNoSeal = await post(webhookA, JSON.stringify({ ct: chainCt }), {});
        ok('3a. bare { ct } with no seal refuses 401 (the last mile grants nothing)', bareNoSeal.status === 401, bareNoSeal.status);
        // 3b. wrong-key seal → 401
        const wrongRaw = riderEnvelope('relay.ride', { ct: directCt, seal: { sig: Encrypt.hmacSign(directCt, GATE_A + '-warped'), ts: Date.now() } });
        const wrongAns = await post(webhookA, wrongRaw, {});
        ok('3b. a wrong-key seal refuses 401 (the verify set never salvages)', wrongAns.status === 401, wrongAns.status);
        // 3c. stale seal ts → 401
        const staleRaw2 = JSON.stringify({ event: 'relay.ride', from: 'keyless-rider', ts: Date.now(), nonce: crypto.randomBytes(16).toString('hex'),
            payload: { ct: shapeRide('keyless-stale-' + Date.now().toString(36), bOrigin, '/relay', 'relay_status', {}, null), seal: { sig: 'aa'.repeat(32), ts: Date.now() - 6 * 60 * 1000 } }, v: { major: 2 } });
        const staleAns = await post(webhookA, staleRaw2, {});
        ok('3c. a stale seal ts refuses 401 (the freshness half of the pass-42 window)', staleAns.status === 401, staleAns.status);
        // 3d. the SAME valid seal replayed on FRESH top-level bytes → 409
        // (a FRESH ct: pin 2 spent chainCt's seal in the dedupe pool, so
        // the replay pin needs un-drifted bytes of its own)
        const replayNonce = 'keyless-replay-' + Date.now().toString(36);
        const replayCt = shapeRide(replayNonce, 'http://127.0.0.1:' + webhookA, '/relay', 'relay_status', {}, doorKeyA);
        const replaySeal = { sig: sealSig(replayCt), ts: Date.now() };
        const replayEnv = () => JSON.stringify({ event: 'relay.ride', from: 'keyless-rider', ts: Date.now(),
            nonce: crypto.randomBytes(16).toString('hex'), payload: { ct: replayCt, seal: replaySeal }, v: { major: 2 } });
        const repFirst = await post(webhookA, replayEnv(), {});
        const repSecond = await post(webhookA, replayEnv(), {});
        ok('3d. an identical seal replayed on fresh bytes still refuses (the seal sig is the dedupe key) — first 200, then 409',
            repFirst.status === 200 && repSecond.status === 409, repFirst.status + ' then ' + repSecond.status);
    } finally {
        if (childA) childA.kill();
        if (childB) childB.kill();
    }
}

main()
    .then(() => {
        console.log('\n--- RESULTS ---');
        console.log('  Passed:  ' + pass.length);
        console.log('  Failed:  ' + fail.length);
        process.exit(fail.length ? 1 : 0);
    })
    .catch((e) => {
        console.error('PILOT ERROR: ' + e.message);
        console.error(e.stack);
        process.exit(1);
    });
