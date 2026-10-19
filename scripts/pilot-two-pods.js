#!/usr/bin/env node
/**
 * Vant P2 TWO-POD PILOT — the raster alone crosses the boundary.
 *
 * WHAT THIS IS: the P2 demo of the certified letter on REAL pods (the P1
 * pilot rode one process; P2 puts TWO separate vant pod processes on the
 * wire, each with its own brain, its own requireKey'd MCP door, and its
 * own ephemeral loopback port). NOTHING is mocked, NO store is shared,
 * and the controller NEVER touches a pod's brain files — every line-side
 * act rides pod A's keyed door:
 *
 *   1. THE LINE (Act I, through the door): pod A's own door mints the
 *      letter (traveler_open — the pod files it in ITS brain, the real
 *      append-only persist), routes the certified-letter carry()
 *      (traveler_carry — every stage CHECKS/RISKS/AUDITS/ASSIMILATES,
 *      the built letter lands append-only), and answers its ADDRESS to
 *      the controller (traveler_fetch — the body is served only after
 *      the wall re-verifies at the SERVING node).
 *   2. THE DOORS (Act II): two real `vant mcp` child processes boot on
 *      ephemeral loopback ports with mcp.requireKey armed and a per-pod
 *      API key. Both doors refuse the keyless and the cross-keyed; pod
 *      B's door honestly answers found:false for the letter's address —
 *      the packet exists only where it was filed.
 *   3. THE BOUNDARY (Act III): pod B's scan station holds only the
 *      POINTER QR raster (the extended vant frame VANT:1:<64-hex>) — the
 *      raster ALONE crosses, no body, no ledger, no store. The
 *      scan-ahead miss is an honest unresolved record; the station then
 *      wires the wire hook (carriers.setPointerFetch) to the traveler_fetch
 *      door it can reach — wrong key → fail-closed unresolved; right key →
 *      the packet crosses the wire and the FULL packet wall re-applies at
 *      the resolving node before anything is handed back. The walk
 *      certifies the resolved letter.
 *   4. THE RED TEAM (Act III-b): attacker-controlled wire answers (a
 *      swapped packet, a same-id forged body) refuse typed E_CARRIER_TAMPER
 *      at the resolving node; a damaged raster refuses on the seal wall.
 *
 * Run:  node scripts/pilot-two-pods.js   (resets ONLY its two own pilot
 *       brains — pilot-pods-a / pilot-pods-b — never yours)
 * Exit: 0 = every wall held both sides of the boundary. 1 = a wall failed —
 * a REAL bug in the carrier/traveler/door laws, never a "test flake".
 */

'use strict';

process.env.VANT_BRAIN = 'pilot-pods-b';   // the scan station's OWN store is pod B's brain; pod A's files are written by pod A's processes alone

const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const path = require('path');
const crypto = require('crypto');

const BRAIN_A = 'pilot-pods-a';
const BRAIN_B = 'pilot-pods-b';

const carriers = require('../lib/carriers');
const traveler = require('../lib/traveler');   // the RED TEAM mints its own decoy packets — the attacker owns tools too

const pass = [];
const fail = [];
function ok(name, cond, info) {
    (cond ? pass : fail).push({ name, info: info || (cond ? '' : 'assertion failed') });
    console.log('  ' + (cond ? '✓' : '✗') + ' ' + name + (cond ? '' : '  ← ' + (info || '')));
}
function attempt(fn) { try { return { ran: true, out: fn() }; } catch (e) { return { ran: false, err: e }; } }

// Reset ONLY the two pilot pod brains (never models/private/vant, nothing else).
const fsMod = require('fs');
for (const b of [BRAIN_A, BRAIN_B]) {
    fsMod.rmSync(path.join('models', 'private', b), { recursive: true, force: true });
}

console.log('\n🛰  VANT P2 TWO-POD PILOT — real pod processes, requireKey doors, the raster alone crosses the boundary\n');

// ==================== helpers ====================

function doorCall(port, key, tool, args) {
    return new Promise((resolve) => {
        const body = JSON.stringify({ tool, args: args || {} });
        const req = http.request({
            host: '127.0.0.1', port,
            path: '/mcp/exec', method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
                (key !== null ? { 'x-api-key': key } : {}))
        }, (res) => {
            let buf = '';
            res.on('data', (c) => { buf += c; });
            res.on('end', () => resolve({ status: res.statusCode, body: buf }));
        });
        req.on('error', () => resolve({ status: 0, body: '' }));
        req.end(body);
    });
}

/** The keyed call a pod client makes: the 200 body unwraps to the tool
 *  answer (the door wraps one layer deep as `{ result }`); any refusal —
 *  non-200, parse failure, an error body — is null. The caller never
 *  fabricates a resolution out of an HTTP failure: the wire answer is
 *  taken as it arrived, or not at all. */
async function keyedCall(port, key, tool, args) {
    const r = await doorCall(port, key, tool, args);
    if (r.status === 200) {
        const b = jsonParse(r.body);
        const unwrapped = (b && b.result && typeof b.result === 'object' && !b.error) ? b.result : b;
        if (unwrapped && !unwrapped.error) return unwrapped;
    }
    return null;
}

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

/** An ephemeral loopback port that answers free RIGHT NOW (reserved-then-
 *  released; the tiny bind race is checked by the readiness poll below). */
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

/** Boot one real pod process: `node bin/mcp.js -S -p <port>` with the
 *  requireKey posture armed by env. Resolves only on /health 200 (a bind
 *  failure is a REAL failure, never a silent 3457 crosstalk). */
function bootPod(brain, key, port) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [path.join(__dirname, '..', 'bin', 'mcp.js'), '-S', '-p', String(port)], {
            cwd: path.join(__dirname, '..'),
            env: Object.assign({}, process.env, {
                VANT_BRAIN: brain,
                VANT_MCP_REQUIRE_KEY: 'true',
                VANT_MCP_API_KEY: key
            }),
            stdio: ['ignore', 'pipe', 'pipe']
        });
        child.stdout.on('data', () => { /* keep draining so the pipe never backpressures */ });
        child.stderr.on('data', () => { /* drained too; failures surface through /health */ });
        const dead = setTimeout(() => { child.kill(); reject(new Error('pod ' + brain + ' never came up on ' + port)); }, 20000);
        const poll = async () => {
            const h = await getBody(port, '/health');
            if (h.status === 200) { clearTimeout(dead); resolve({ child, port }); return; }
            if (child.exitCode !== null) { clearTimeout(dead); reject(new Error('pod ' + brain + ' exited during boot (code ' + child.exitCode + ')')); return; }
            setTimeout(poll, 250);
        };
        setTimeout(poll, 300);
    });
}

const pods = [];
function cleanup() {
    for (const p of pods) { try { p.child.kill(); } catch (e) { /* already gone */ } }
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });

(async () => {
    // ==================== ACT II: two real pods, requireKey posture ====================
    console.log('  ACT II — two real pod processes on ephemeral loopback doors (requireKey armed)\n');

    const keyA = crypto.randomBytes(24).toString('hex');
    const keyB = crypto.randomBytes(24).toString('hex');
    const [portA, portB] = await Promise.all([reservePort(), reservePort()]);

    try {
        pods.push(...await Promise.all([bootPod(BRAIN_A, keyA, portA), bootPod(BRAIN_B, keyB, portB)]));
    } catch (e) {
        console.error('\n❌ POD BOOT FAILED — ' + e.message);
        console.error('   the demo cannot run without its own doors; this is a REAL failure, not a skip.');
        process.exit(1);
    }
    const podA = pods[0], podB = pods[1];
    console.log('   pod A: brain ' + BRAIN_A + ' · door 127.0.0.1:' + podA.port + ' (keyed)');
    console.log('   pod B: brain ' + BRAIN_B + ' · door 127.0.0.1:' + podB.port + ' (keyed)');

    ok('D1. both pod doors answer /health (real child processes, real ephemeral loopback binds, isolated brains)',
        (await getBody(podA.port, '/health')).status === 200 && (await getBody(podB.port, '/health')).status === 200);

    const toolsA = jsonParse((await getBody(podA.port, '/mcp/tools')).body);
    const namesA = (toolsA && Array.isArray(toolsA.tools)) ? toolsA.tools.map((t) => t.name) : [];
    ok('D2. traveler_fetch is ON pod A\'s door (the packet door the pointer resolve rides)',
        namesA.includes('traveler_fetch'));

    const noKeyA = await doorCall(podA.port, null, 'carriers_list');
    const noKeyB = await doorCall(podB.port, null, 'carriers_list');
    ok('D3. keyLESS POSTs refuse 401 on BOTH pods (the requireKey posture is armed)',
        noKeyA.status === 401 && noKeyB.status === 401,
        'statuses ' + noKeyA.status + '/' + noKeyB.status);

    const cross = await doorCall(podA.port, keyB, 'carriers_list');
    ok('D4. pod B\'s key does NOT open pod A\'s door (keys are per-pod, not global)',
        cross.status === 401, 'status ' + cross.status);

    // ==================== ACT I: the line, THROUGH pod A's door ====================
    console.log('\n  ACT I — pod A\'s own door mints, routes, and files the certified letter\n');

    const opened = await keyedCall(podA.port, keyA, 'traveler_open', { title: 'wheel-77', slots: { lot: 'L-P2-001' } });
    ok('D5. pod A\'s door MINTS the letter (traveler_open — the pod files its own ledger)',
        opened && opened.opened === true && typeof opened.id === 'string' && opened.id.length === 64,
        JSON.stringify(opened || {}).slice(0, 120));
    if (!opened || !opened.id) { cleanup(); process.exit(1); }

    const carried = await keyedCall(podA.port, keyA, 'traveler_carry', {
        id: opened.id,
        stations: [
            { by: 'pod-a-mold', op: 'mold', part: { name: 'rim', alloy: 'al-6061' } },
            { by: 'pod-a-cure', op: 'cure', part: { name: 'hub', bearing: 'sealed' } },
            { by: 'pod-a-ship', op: 'ship', carrier: 'nsc9' }
        ],
        template: [
            { op: 'mold', part: 'rim' },
            { op: 'cure', part: 'hub' },
            { op: 'ship' }
        ]
    });
    ok('D6. pod A\'s door ROUTES the letter through its stations (certified carry, parts assimilate, the built letter lands)',
        carried && carried.ok === true && carried.built === true && carried.landed === 3 &&
        carried.letter && carried.letter.assembly && carried.letter.assembly.rim && carried.letter.assembly.hub,
        JSON.stringify(carried || {}).slice(0, 160));
    if (!carried || !carried.ok) { cleanup(); process.exit(1); }

    const letterId = carried.letter.id;

    // THE WALL AT THE SERVING NODE: pod A's door answers BY ADDRESS and
    // re-verifies before any byte crosses.
    const servedBody = await keyedCall(podA.port, keyA, 'traveler_fetch', { id: letterId });
    ok('D7. pod A\'s door serves the built letter BY ADDRESS (found, address answers, wall re-verified serving-side)',
        servedBody && servedBody.found === true && servedBody.traveler && servedBody.traveler.id === letterId && servedBody.traveler.seq === carried.letter.seq,
        JSON.stringify(servedBody || {}).slice(0, 120));

    const missB = await keyedCall(podB.port, keyB, 'traveler_fetch', { id: letterId });
    ok('D8. pod B\'s door honestly answers found:false for the SAME address (ISOLATED stores, not a shared database)',
        missB && missB.found === false && !missB.traveler,
        JSON.stringify(missB || {}).slice(0, 120));

    // ==================== ACT III: the boundary (the raster alone crosses) ====================
    console.log('\n  ACT III — pod B\'s scan station pulls the pointer raster OVER THE WIRE; the packet fetches behind it\n');

    // THE ARTIFACT, OVER THE WIRE NOW (pass 268): pod B's station does not
    // encode anything locally — it PULLS the pointer mark from pod A's
    // keyed door (traveler_stamp: the same serving wall as traveler_fetch)
    // and takes possession of the received BYTES. Only this raster crosses
    // the boundary: no body of its own, no ledger, no store.
    const stampAnswer = await keyedCall(podA.port, keyA, 'traveler_stamp', { id: letterId });
    const stationPng = (stampAnswer && stampAnswer.found === true)
        ? { kind: stampAnswer.kind, frame: stampAnswer.frame, png: Buffer.from(stampAnswer.png, 'base64') }   // THE bytes that crossed
        : null;
    ok('D9. the pointer mark crosses the WIRE (traveler_stamp under the same serving wall; the station owns the received bytes only)',
        stationPng && stationPng.kind === 'pointer' && /^VANT:1:[0-9a-f]{64}$/.test(stationPng.frame) && stationPng.frame.slice(7) === letterId &&
        Buffer.isBuffer(stationPng.png) && stationPng.png.length > 0 && stationPng.png.slice(0, 8).toString('hex') === '89504e470d0a1a0a',
        JSON.stringify(stampAnswer || {}).slice(0, 120));

    // The pure-pointer read first (the forwarding-node posture: the mark
    // alone tells the station WHAT the packet's address is).
    const purePtr = carriers.decode('qr', stationPng.png, { pointerOnly: true });
    ok('D10. the pure-pointer read decodes the RECEIVED raster and gives the mark\'s address WITHOUT any fetch (scan → pointer → fetch order)',
        purePtr.resolved === false && purePtr.id === letterId && purePtr.frame === stationPng.frame);

    // THE SCAN-AHEAD MISS at the station's OWN store (pod B's brain): an
    // honest unresolved record — the packet is not HERE yet, and this pod
    // never wrote anywhere.
    const handMiss = carriers.decode('qr', stationPng.png);
    ok('D11. the scan-ahead resolve is an honest no-body record at the station (not an error; the artifact crossed, the body has not)',
        handMiss.resolved === false && handMiss.reason === 'no-body' && handMiss.id === letterId);

    // THE WIRE, WRONG KEY FIRST: a hostile/misconfigured station fetches
    // with pod B's key against pod A's door — the keyed call fails — the
    // resolve layer records the miss, and the pointer stays honestly
    // unresolved (fail-closed, never fabricated).
    const wireWrongKey = await keyedCall(podA.port, keyB, 'traveler_fetch', { id: letterId });
    carriers.setPointerFetch(() => wireWrongKey);
    const refused = carriers.decode('qr', stationPng.png);
    carriers.setPointerFetch(null);
    ok('D12. the WRONG-KEY wire is fail-closed at the resolving node (unresolved, never fabricated)',
        wireWrongKey === null && refused.resolved === false && refused.reason === 'unreachable');

    // THE REAL FETCH: the station's fetch layer rides pod A's keyed door;
    // whatever it brings home re-enters the FULL packet wall inside decode.
    const wireGood = await keyedCall(podA.port, keyA, 'traveler_fetch', { id: letterId });
    carriers.setPointerFetch(() => wireGood);
    const crossed = carriers.decode('qr', stationPng.png);
    carriers.setPointerFetch(null);
    ok('D13. the packet CROSSES the wire on the keyed door and the wall re-applies at the resolving node',
        wireGood && wireGood.found === true && crossed.resolved === true && crossed.fetched === true &&
        crossed.traveler && crossed.traveler.id === letterId && crossed.traveler.seq === carried.letter.seq,
        JSON.stringify(crossed || {}).slice(0, 120));

    const walk = crossed.traveler ? attempt(() => carriers.replay([crossed.traveler])) : { ran: false, out: null };
    ok('D14. the auditor walk certifies the RESOLVED letter across the boundary (no gaps, no rewrites)',
        walk.ran && walk.out && walk.out.ok === true && walk.out.gaps.length === 0 && walk.out.rewrites.length === 0);

    // ==================== ACT III-b: the boundary red team ====================
    console.log('\n  RED TEAM (the wire is the attacker\'s; every hostile answer must still refuse)\n');

    // Attack 1 — THE SWAPPED WIRE: an attacker in the middle answers the
    // fetch with a DIFFERENT packet. The address law rides the wire: the
    // delivered body must BE the mark, and it is not.
    const swapped = traveler.mint({ from: 'attacker', slots: { title: 'not-the-mark' } });
    carriers.setPointerFetch(() => ({ found: true, traveler: swapped }));
    const t1 = attempt(() => carriers.decode('qr', stationPng.png));
    carriers.setPointerFetch(null);
    ok('A1. a SWAPPED wire answer refuses typed E_CARRIER_TAMPER (the address law rides the wire)',
        !t1.ran && t1.err.code === 'E_CARRIER_TAMPER', t1.ran ? 'NOT refused!' : t1.err.message.slice(0, 80));

    // Attack 2 — THE FORGED WIRE: same id, edited content (the attacker
    // rewrites the slots but keeps the mark's address). The content address
    // no longer derives — the packet wall catches it at the resolving node.
    const forged = JSON.parse(JSON.stringify(wireGood.traveler));
    forged.slots.title = 'counterfeit-wheel-77';
    carriers.setPointerFetch(() => ({ found: true, traveler: forged }));
    const t2 = attempt(() => carriers.decode('qr', stationPng.png));
    carriers.setPointerFetch(null);
    ok('A2. a FORGED wire body (same id, edited content) refuses typed E_CARRIER_TAMPER at the wall',
        !t2.ran && t2.err.code === 'E_CARRIER_TAMPER', t2.ran ? 'NOT refused!' : t2.err.message.slice(0, 80));

    // Attack 3 — THE TAMPERED ARTIFACT IN TRANSIT: a byte flips in the
    // artifact BETWEEN the keyed fetch and the scan (a hostile splice on
    // the wire the station just pulled). The seal wall of the qr lane
    // refuses before any byte of meaning survives.
    // The flip targets the IDAT DATA ITSELF (the compressed zlib stream),
    // not a chunk CRC the parser never checks: the honest receiver may
    // ignore metadata checksums, but it may not resurrect the pixels.
    // LAYOUT: 8-byte sig + the 25-byte IHDR chunk (len+type+13+crc) → the
    // IDAT chunk opens at 33 (len@33, type@37, data@41).
    const damaged = Buffer.from(stationPng.png);
    const lenIdat = damaged.readUInt32BE(33);            // first chunk after IHDR: its length field
    if (damaged.length < 41 + lenIdat + 4 || lenIdat === 0) {   // layout sanity: data + CRC must fit
        console.error('❌ PILOT ASSERT — unexpected PNG chunk layout; refusing to fake the damage pin.');
        cleanup(); process.exit(1);
    }
    damaged[41 + Math.floor(lenIdat / 2)] ^= 0x5a;
    const t3 = attempt(() => carriers.decode('qr', damaged));
    ok('A3. a tampered artifact in transit refuses typed (received bytes, the seal wall never repairs)',
        !t3.ran && t3.err.code === 'E_CARRIER_TAMPER', t3.ran ? 'NOT refused!' : t3.err.message.slice(0, 80));

    // Attack 4 — THE FOREIGN-MARK ARTIFACT: the wire delivers a REAL,
    // clean QR — of something else (a url, a poster code). The lane must
    // route BY GRAMMAR: a mark that speaks neither stone (VSTN:) nor the
    // extended vant frame refuses typed, never guessed at.
    const qrcodeGen = require('qrcode-generator');
    const zlibMod = require('zlib');
    const qrF = qrcodeGen(0, 'L');
    qrF.addData('https://poster.example/not-a-vant-lane', 'Byte');
    qrF.make();
    const nF = qrF.getModuleCount();
    const scaleF = 4, marginF = 4;
    const sizeF = (nF + marginF * 2) * scaleF;
    const pxF = Buffer.alloc(sizeF * sizeF, 255);
    for (let r = 0; r < nF; r++) for (let c = 0; c < nF; c++) {
        if (!qrF.isDark(r, c)) continue;
        for (let dy = 0; dy < scaleF; dy++) pxF.fill(0, ((r + marginF) * scaleF + dy) * sizeF + (c + marginF) * scaleF, ((r + marginF) * scaleF + dy) * sizeF + (c + marginF) * scaleF + scaleF);
    }
    const rawF = Buffer.alloc(sizeF * (sizeF + 1));
    for (let y = 0; y < sizeF; y++) pxF.copy(rawF, y * (sizeF + 1) + 1, y * sizeF, (y + 1) * sizeF);
    const deflateF = zlibMod.deflateSync(rawF);
    const ihdrF = Buffer.alloc(13);
    ihdrF.writeUInt32BE(sizeF, 0); ihdrF.writeUInt32BE(sizeF, 4); ihdrF[8] = 8; ihdrF[9] = 0;
    const lenOf = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
    const foreignPng = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
        Buffer.concat([lenOf(13), Buffer.from('IHDR'), ihdrF, Buffer.from('CRC!')]),
        Buffer.concat([lenOf(deflateF.length), Buffer.from('IDAT'), deflateF, Buffer.from('CRC!')]),
        Buffer.concat([Buffer.from([0, 0, 0, 0]), Buffer.from('IEND'), Buffer.from('CRC!')])
    ]);
    const t4 = attempt(() => carriers.decode('qr', foreignPng));
    ok('A4. a foreign-mark artifact (a clean QR of something else) refuses typed E_CARRIER_SHAPE (grammar routing, no guesses)',
        !t4.ran && t4.err.code === 'E_CARRIER_SHAPE' && /neither lane grammar/.test(t4.err.message),
        t4.ran ? 'NOT refused!' : t4.err.message.slice(0, 80));

    // ==================== VERDICT ====================
    console.log('\n--- RESULTS ---');
    console.log('  Passed:  ' + pass.length);
    console.log('  Failed:  ' + fail.length);
    if (fail.length > 0) {
        console.log('\n  FAILED PINS:');
        for (const f of fail) console.log('    ✗ ' + f.name + (f.info ? '  ← ' + f.info : ''));
    }
    console.log(
        '\n  Two real pods rode one certified letter across a requireKey boundary:' +
        '\n  the letter was minted, routed, and filed on pod A through its own' +
        '\n  keyed door; the raster alone crossed to pod B\'s station; the packet' +
        '\n  came home only through the keyed door; and every hostile wire answer' +
        '\n  refused typed. A wall breach is a REAL bug, never a flake.\n');
    process.exit(fail.length > 0 ? 1 : 0);
})().catch((e) => {
    console.error('\n❌ PILOT CRASHED — ' + (e && e.message));
    if (process.env.DEBUG) console.error(e && e.stack);
    cleanup();
    process.exit(1);
});
