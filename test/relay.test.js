#!/usr/bin/env node
/**
 * Relay face pins — REBUILT FRESH for r/2 (pass 236, owner ruling: no
 * lib/relay module; the face composes the webhook door transport + the api
 * face. prd-relay.md §2).
 *
 *  1. face truth: contract r/2, webhook-native route/events, no rogue module
 *     (lib/relay.js stays deleted — no-legacy guard enforces it)
 *  2. mount: OFF = nothing binds; ON without gate = fail-closed; ON + gate
 *     = the webhook route + server come up (real listen, port 0)
 *  3. the gate IS the route secret: unsigned -> 401, wrong signature -> 401
 *  4. transport replay gate: identical signed bytes -> 409 (webhooks owns it)
 *  5. TRANSPORT IS THE ALIVE PIN: the FULL hop loop over real sockets —
 *     client signs -> POST /relay -> HMAC verify -> dispatch -> lib/network
 *     forward to a REAL upstream -> answer rides the SAME ack back
 *  6. hop posture: http origin refused in public posture (typed, via
 *     ack.reply); the lab escape opens loopback for the live round trip
 *  7. hop frame shape: non-envelope ct -> typed E_RELAY_NEEDS_ENVELOPE
 *  8. NO BODY LEAK: the upstream sees ONLY { ct } (the face never holds the
 *     channel key; the gate/secret never rides inside the hop)
 *  9. the ride loop over real sockets: envelope arrives -> opens with the
 *     channel key -> nonce checked -> dispatches with the bearer INSIDE the
 *     envelope -> the door answer re-envelopes into ack.reply
 * 10. ride refusals, typed through the pipe: wrong channel key ->
 *     E_RIDE_DECODE; same inner nonce re-ride -> E_RIDE_REPLAY; transport
 *     replay (identical signed bytes) -> 409 before the ride even opens
 * 11. ride posture OFF: enabled rides refuse E_RIDE_OFFLINE (dispatch-level)
 * 12. body cap: a >1 MiB POST -> 413 (the doors' shared cap posture)
 * 13. liveness counters: face stats move with the served/refused traffic
 *
 * Run: node test/relay.test.js
 */

const crypto = require('crypto');
const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const config = require(path.join(ROOT, 'lib', 'config'));
const api = require(path.join(ROOT, 'lib', 'api'));
const relay = api.relay;
const Encrypt = require(path.join(ROOT, 'lib', 'encrypt')).default;

let passNum = 0, failNum = 0;
function ok(name, cond, extra) {
    if (cond) { passNum++; console.log('\u2713 ' + name); }
    else { failNum++; console.log('\u2717 ' + name + (extra ? ' :: ' + extra : '')); }
}

const CHANNEL_KEY = 'test-channel-key-0123456789abcdef';
const GATE = crypto.randomBytes(32).toString('hex');

// ---- helpers ----
async function postRelay(port, rawBody, headers) {
    return await new Promise((resolve) => {
        const req = http.request({
            host: '127.0.0.1', port, path: '/relay', method: 'POST',
            headers: Object.assign({ 'content-type': 'application/json',
                'content-length': Buffer.byteLength(rawBody) }, headers || {})
        }, (res) => {
            let data = '';
            res.setEncoding('utf8');
            res.on('data', (c) => { data += c; });
            res.on('end', () => { let j = null; try { j = JSON.parse(data); } catch (e) { /* non-JSON */ } resolve({ status: res.statusCode, json: j, raw: data }); });
        });
        req.on('error', () => resolve({ status: 0, json: null, raw: '' }));
        req.end(rawBody);
    });
}
function signedBody(payloadObj, gate) {
    const envelope = {
        event: payloadObj.event,
        from: 'relay-suite',
        ts: Date.now(),
        nonce: crypto.randomBytes(16).toString('hex'),
        payload: payloadObj.payload,
        v: { major: 2 }
    };
    const raw = JSON.stringify(envelope);
    return { raw, sig: Encrypt.hmacSign(raw, gate) };
}
// a REAL upstream (lib/relay here is a concept, not a module - the upstream
// below is a plain http server that answers a tiny JSON body)
let upstreamServer = null, upstreamPort = 0;
const upstreamSeen = [];

// ---- run ----
async function run() {
    // fixture upstream
    await new Promise((resolve) => {
        upstreamServer = http.createServer((req, res) => {
            let body = '';
            req.on('data', (c) => { body += c; });
            req.on('end', () => {
                upstreamSeen.push({ url: req.url, body: String(body), auth: req.headers.authorization || null, gate: req.headers['x-relay-gate'] || undefined });
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: 'pong-pipe' }));
            });
        });
        upstreamServer.listen(0, '127.0.0.1', () => {
            upstreamPort = upstreamServer.address().port; resolve();
        });
    });

    // ---- 1. face truth ----
    const st0 = relay.status();
    ok('1a. face truth: contract r/2, webhook-native route + events',
        st0.contract === 'r/2' && st0.route === 'POST /relay'
        && st0.events.join() === 'relay.hop,relay.ride'
        && st0.flavor === 'headless-pod-relay',
        JSON.stringify(st0).slice(0, 160));

    // ---- 2. mount posture ----
    config.set('relay.enabled', false);
    const off = relay.mount();
    ok('2a. OFF is first-class: mount() binds nothing',
        off.enabled === false && off.mounted === false,
        JSON.stringify(off).slice(0, 120));
    config.set('relay.enabled', true);
    config.set('relay.gateKey', null);
    const nkMount = relay.mount();
    ok('2b. enabled WITHOUT a gate secret binds NOTHING (fail-closed)',
        nkMount.enabled === true && nkMount.mounted === false,
        JSON.stringify(nkMount).slice(0, 120));
    config.set('relay.gateKey', GATE);
    const m = relay.mount({ port: 0 });
    const relaySrv = relay._getMountedState() && relay._getMountedState().server;
    let relayPort = 0;
    try {
        // mount() returns before the transport's listen callback fires -
        // await the listening event before reading the real port
        await new Promise((res) => {
            if (relaySrv.listening) return res();
            relaySrv.on('listening', res);
        });
        relayPort = relaySrv.address().port;
    } catch (e) { relayPort = 0; }
    ok('2c. ON + gate: the route and server LIVE (real listen)',
        m.mounted === true && relayPort > 0,
        JSON.stringify(m).slice(0, 140));

    // ---- 3. the gate IS the route secret (webhook HMAC) ----
    const good = signedBody({ event: 'relay.hop', payload: { origin: 'https://pod.example.com', path: '/x', ct: '00'.repeat(48) } }, GATE);
    const unsigned = await postRelay(relayPort, good.raw, {});
    ok('3a. unsigned posts answer 401 (no standing anonymous path)',
        unsigned.status === 401, unsigned.status + ' ' + String(unsigned.raw).slice(0, 80));
    const wrongSig = await postRelay(relayPort, good.raw, { 'x-signature-256': '0'.repeat(64) });
    ok('3b. a wrong signature answers 401 (timing-safe verify)',
        wrongSig.status === 401, wrongSig.status);
    const goodSig = await postRelay(relayPort, good.raw, { 'x-signature-256': good.sig });
    ok('3c. a correctly signed envelope passes the gate (200 ack)',
        goodSig.status === 200 && goodSig.json && goodSig.json.received === true,
        JSON.stringify(goodSig.json).slice(0, 140));

    // ---- 4. transport replay gate (webhooks owns it; the face rides) ----
    const replay = await postRelay(relayPort, good.raw, { 'x-signature-256': good.sig });
    ok('4. identical signed bytes replay -> 409 at the transport',
        replay.status === 409, replay.status);

    // ---- 5-6. the hop ROUND TRIP over real sockets ----
    config.set('relay.allowPrivateOrigins', false);
    const httpHop = signedBody({ event: 'relay.hop', payload: {
        origin: 'http://127.0.0.1:' + upstreamPort, path: '/api/mcp/exec',
        ct: '00'.repeat(48) } }, GATE);
    const httpAns = await postRelay(relayPort, httpHop.raw, { 'x-signature-256': httpHop.sig });
    ok('6a. http origin refuses in public posture (typed via ack.reply)',
        httpAns.status === 200 && httpAns.json.reply && httpAns.json.reply.ok === false
        && httpAns.json.reply.code === 'E_RELAY_BAD_ORIGIN',
        JSON.stringify(httpAns.json || null));

    config.set('relay.allowPrivateOrigins', true);
    const ct = relay.envelope('hello-pipe', CHANNEL_KEY);
    const hop = signedBody({ event: 'relay.hop', payload: {
        origin: 'http://127.0.0.1:' + upstreamPort, path: '/api/mcp/exec', ct } }, GATE);
    const hopAns = await postRelay(relayPort, hop.raw, { 'x-signature-256': hop.sig });
    ok('5a. FULL hop loop over real sockets: signed POST -> forward -> answer rides back',
        hopAns.status === 200 && hopAns.json.reply && hopAns.json.reply.ok === true
        && hopAns.json.reply.raw.includes('pong-pipe'),
        JSON.stringify(hopAns.json || null).slice(0, 160));
    ok('8a. NO BODY LEAK: the upstream saw ONLY { ct } (ciphertext, no plaintext)',
        upstreamSeen.length === 1 && upstreamSeen[0].body.includes('"ct')
        && !upstreamSeen[0].body.includes('hello-pipe'),
        JSON.stringify(upstreamSeen[0]).slice(0, 160));
    ok('8b. the gate secret NEVER rides upstream (spent at verification)',
        upstreamSeen.length === 1 && !upstreamSeen[0].body.includes(GATE)
        && upstreamSeen[0].gate === undefined,
        String(upstreamSeen[0].gate));
    ok('8c. envelope shape verified live (encrypt.js canon, 4 parts)',
        /:/.test(ct) && ct.split(':').length === 4);

    // ---- 7. hop frame posture (the escape is ON here for sockets; shape
    // pins run through the dispatch face directly - public-posture truth
    // needs no server) ----
    const noCt = await (async () => {
        const ds = { dispatched: 0 };
        await relay._dispatchHop({ body: { event: 'relay.hop', payload: {
            origin: 'http://127.0.0.1:' + upstreamPort, path: '/x', ct: 'plaintext-not-an-envelope' } }, _dispatchState: ds });
        return ds.reply;
    })();
    ok('7a. plaintext "ct" -> typed E_RELAY_NEEDS_ENVELOPE (no downgrade)',
        noCt && noCt.ok === false && noCt.code === 'E_RELAY_NEEDS_ENVELOPE',
        JSON.stringify(noCt) || null);

    // ---- 9-10. the RIDE loop over real sockets ----
    config.set('relay.channelKey', CHANNEL_KEY);
    const doorSeen = [];
    relay.setDoorTransport(async ({ bearer, body }) => {
        doorSeen.push({ bearer, body });
        return { ok: true, status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: { echo: 'ride-pong', gotAuth: bearer || null } }) };
    });
    const RIDE_NONCE = 'ride-nonce-00000000-0001';
    // (pass 272, §5 rung 2) the seal binds its context: { origin, path, nonce:nonce }
    const innerRide = (n, withCtx = true) => JSON.stringify({
        nonce: n,
        ...(withCtx ? { ctx: { origin: 'pod-webhook-intake', path: '/relay', nonce: n } } : {}),
        bearer: 'vguest_rideipin-test-0123456789abcdef',
        body: { tool: 'echo_test', args: { q: 'ping-through-the-pipe' } }
    });
    const makeRide = () => {
        return signedBody({ event: 'relay.ride', payload: { ct: relay.envelope(innerRide(RIDE_NONCE), CHANNEL_KEY) } }, GATE);
    };
    const ride1 = makeRide();
    const rideAns = await postRelay(relayPort, ride1.raw, { 'x-signature-256': ride1.sig });
    ok('9a. FULL ride loop over real sockets: envelope -> open -> nonce -> door -> re-envelope',
        rideAns.status === 200 && rideAns.json.reply && rideAns.json.reply.ok === true
        && rideAns.json.reply.rode === true && typeof rideAns.json.reply.ct === 'string',
        JSON.stringify(rideAns.json || null).slice(0, 200));
    let rideOpen = null;
    try { rideOpen = JSON.parse(relay.openEnvelope(rideAns.json.reply.ct, CHANNEL_KEY)); }
    catch (e) { rideOpen = { error: e.message }; }
    // (pass 272) the answer is a nonce-bound record now: { nonce, answer }
    const rideDoorBody = rideOpen && typeof rideOpen === 'object' && rideOpen.nonce === RIDE_NONCE
        ? (typeof rideOpen.answer === 'string' ? JSON.parse(rideOpen.answer) : rideOpen.answer)
        : null;
    ok('9b. the opener opens the ride reply (nonce-bound record; the JSON-RPC rides inside answer)',
        rideOpen && !rideOpen.error && rideOpen.nonce === RIDE_NONCE
        && rideDoorBody && rideDoorBody.jsonrpc === '2.0' && rideDoorBody.result && rideDoorBody.result.echo === 'ride-pong',
        JSON.stringify(rideOpen).slice(0, 160));
    ok('9c. the bearer TELEPORTED inside the envelope (pod-realm credential tunnel)',
        doorSeen.length === 1 && doorSeen[0].body instanceof Object
        && doorSeen[0].bearer === 'vguest_rideipin-test-0123456789abcdef',
        JSON.stringify(doorSeen).slice(0, 140));
    ok('10a. the door sees a tool call, never the gate secret',
        doorSeen.length === 1 && !JSON.stringify(doorSeen[0].body).includes(GATE),
        JSON.stringify(doorSeen[0]).slice(0, 120));

    // 10b. SAME signed bytes -> transport replay 409 (before even opening)
    const rideReplayTransport = await postRelay(relayPort, ride1.raw, { 'x-signature-256': ride1.sig });
    ok('10b. identical ride bytes replay -> 409 at the transport',
        rideReplayTransport.status === 409, rideReplayTransport.status);
    // 10c. FRESH signed envelope, SAME inner nonce -> typed E_RIDE_REPLAY
    const ride2 = makeRide(); // new transport bytes; same inner nonce on purpose
    const rideAns2 = await postRelay(relayPort, ride2.raw, { 'x-signature-256': ride2.sig });
    ok('10c. same inner nonce on fresh bytes -> typed E_RIDE_REPLAY (rung 2)',
        rideAns2.status === 200 && rideAns2.json.reply
        && rideAns2.json.reply.ok === false && rideAns2.json.reply.code === 'E_RIDE_REPLAY',
        JSON.stringify(rideAns2.json || null).slice(0, 160));

    // 10c-2 (pass 272, rung 2): a ctx-less (or nonce-mismatched) seal is a
    // DOWNGRADE — refused typed even with a fresh nonce.
    const ctxless = signedBody({ event: 'relay.ride', payload: {
        ct: relay.envelope(innerRide('ride-nonce-00000000-0003', false), CHANNEL_KEY) } }, GATE);
    const ctxlessAns = await postRelay(relayPort, ctxless.raw, { 'x-signature-256': ctxless.sig });
    // the splice: a FRESH nonce whose ctx names a DIFFERENT one (the
    // mismatch shape, the saving of the request-nonce binding law)
    const spliceCt = relay.envelope(innerRide('ride-nonce-00000000-0005').replace('"path":"/relay","nonce":"ride-nonce-00000000-0005"', '"path":"/relay","nonce":"ride-nonce-00000000-000X"'), CHANNEL_KEY);
    const spliced = signedBody({ event: 'relay.ride', payload: { ct: spliceCt } }, GATE);
    const splicedAns = await postRelay(relayPort, spliced.raw, { 'x-signature-256': spliced.sig });
    ok('10c-2. rung 2: a ctx-less seal AND a ctx-nonce mismatch both refuse typed E_RIDE_DECODE (the downgrade never salvages)',
        ctxlessAns.status === 200 && ctxlessAns.json.reply && ctxlessAns.json.reply.ok === false && ctxlessAns.json.reply.code === 'E_RIDE_DECODE'
        && splicedAns.status === 200 && splicedAns.json.reply && splicedAns.json.reply.ok === false && splicedAns.json.reply.code === 'E_RIDE_DECODE',
        JSON.stringify({ ctxless: ctxlessAns.json, spliced: splicedAns.json }).slice(0, 260));

    // 10d. WRONG channel key -> E_RIDE_DECODE through the pipe
    const ride3 = signedBody({ event: 'relay.ride', payload: {
        ct: relay.envelope(JSON.stringify({ nonce: 'ride-nonce-00000000-0002',
            body: { tool: 'echo_test' } }), CHANNEL_KEY) } }, GATE);
    const savedKey = config.get('relay.channelKey');
    config.set('relay.channelKey', 'a-completely-different-channel-key');
    const decodeAns = await postRelay(relayPort, ride3.raw, { 'x-signature-256': ride3.sig });
    config.set('relay.channelKey', savedKey);
    ok('10d. wrong/stale channel key -> typed E_RIDE_DECODE (fail-closed)',
        decodeAns.status === 200 && decodeAns.json.reply && decodeAns.json.reply.ok === false
        && decodeAns.json.reply.code === 'E_RIDE_DECODE',
        JSON.stringify(decodeAns.json || null).slice(0, 160));

    // ---- 11. ride posture OFF at dispatch (direct, no server needed) ----
    const savedEnabled = config.get('relay.enabled');
    config.set('relay.enabled', false);
    const dsOff = { dispatched: 0 };
    await relay._dispatchRide({ body: { event: 'relay.ride', payload: { ct: '00'.repeat(48) } }, _dispatchState: dsOff });
    config.set('relay.enabled', savedEnabled);
    ok('11. rides refuse OFFLINE when the posture/channel is absent (typed)',
        dsOff.reply && dsOff.reply.ok === false && dsOff.reply.code === 'E_RIDE_OFFLINE',
        JSON.stringify(dsOff.reply));

    // ---- 12. body cap (the doors' shared posture) ----
    const bigBody = signedBody({ event: 'relay.hop',
        payload: { origin: 'https://pod.example.com', path: '/x', ct: '0'.repeat((1024 * 1024) + 64) } }, GATE);
    const capAns = await postRelay(relayPort, bigBody.raw, { 'x-signature-256': bigBody.sig });
    ok('12. a >1 MiB POST answers 413 (shared door-cap posture)',
        capAns.status === 413, capAns.status);

    // ---- 13. liveness counters moved with traffic ----
    const stEnd = relay.status();
    ok('13. liveness counters honored the served + refused traffic',
        stEnd.stats.hopsServed >= 1 && stEnd.stats.gateRefused >= 2
        && stEnd.stats.ridesServed >= 1 && stEnd.stats.ridesReplayed >= 1
        && stEnd.stats.rideDecodeRefused >= 1,
        JSON.stringify(stEnd.stats));

    // ---- client seam: relaySend (the sender side of the r/2 wire) ----
    let noKeyErr = null;
    try { await relay.send('http://127.0.0.1:' + relayPort, 'short', { ct: 'x' }); }
    catch (e) { noKeyErr = ('' + e.message).slice(0, 30); }
    ok('14a. relaySend refuses without a proper gate secret (typed)',
        noKeyErr && noKeyErr.startsWith('E_RELAY_GATE_REQUIRED'), String(noKeyErr));
    const sent = await relay.send('http://127.0.0.1:' + relayPort, GATE,
        { origin: 'http://127.0.0.1:' + upstreamPort, path: '/api/mcp/exec', ct: relay.envelope('client-seam-works', CHANNEL_KEY) },
        { event: 'relay.hop', insecure: true });
    ok('14b. the SENDER seam works end-to-end over real sockets (relays the whole r/2 client)',
        sent.ok === true && sent.reply && sent.reply.ok === true
        && sent.reply.raw.includes('pong-pipe'),
        JSON.stringify(sent).slice(0, 160));

    // ---- 15. the interface-handler bridge (pass 237, §3.3): typed
    // families translate ONTO the door - the face handles auth/door
    // plumbing so webapps never roll their own logic.
    const doorBridge = [];
    relay.setDoorTransport(async ({ bearer, body }) => {
        doorBridge.push({ bearer, body });
        const T = body && body.tool;
        if (T === 'brain_write') return { ok: true, status: 200, body: JSON.stringify({ saved: true, name: body.args.name }) };
        if (T === 'context_heartbeat') return { ok: true, status: 200, body: JSON.stringify({ running: true }) };
        if (T === 'brain_current') return { ok: true, status: 200, body: JSON.stringify({ current: 'vant' }) };
        return { ok: true, status: 200, body: JSON.stringify({ echoed: T }) };
    });
    // signature covers the ENTIRE raw string - compose ONCE and sign the
    // exact bytes sent (bridgeEnvelope exists because recomposing a
    // Date.now() payload would sign different bytes than the post)
    const bridgeEnvelope = (event, payload) => {
        const env = { event, from: 'bridge-suite', ts: Date.now(),
            nonce: crypto.randomBytes(16).toString('hex'), payload, v: { major: 2 } };
        return { raw: JSON.stringify(env), sig: Encrypt.hmacSign(JSON.stringify(env), GATE) };
    };
    const b1 = bridgeEnvelope('relay.sync', { name: 'relay-notes', content: 'ingested through the bridge' });
    const b1Ans = await postRelay(relayPort, b1.raw, { 'x-signature-256': b1.sig });
    ok('15a. relay.sync ingests THROUGH the door (translated brain_write, ack carries the answer)',
        b1Ans.status === 200 && b1Ans.json.reply && b1Ans.json.reply.ok === true
        && b1Ans.json.reply.answer && b1Ans.json.reply.answer.saved === true
        && doorBridge.some((d) => d.body.tool === 'brain_write'),
        JSON.stringify(b1Ans.json).slice(0, 160));
    const b2 = bridgeEnvelope('relay.lost', {});
    const b2Ans = await postRelay(relayPort, b2.raw, { 'x-signature-256': b2.sig });
    ok('15b. relay.lost answers WHERE one stands (door posture truth, two translated calls)',
        b2Ans.status === 200 && b2Ans.json.reply && b2Ans.json.reply.ok === true
        && b2Ans.json.reply.answer && b2Ans.json.reply.answer.current === 'vant'
        && doorBridge.filter((d) => d.body.tool === 'context_heartbeat' || d.body.tool === 'brain_current').length >= 2,
        JSON.stringify(b2Ans.json).slice(0, 160));
    const b3 = bridgeEnvelope('relay.call', { tool: 'brain_list', args: {} });
    const b3Ans = await postRelay(relayPort, b3.raw, { 'x-signature-256': b3.sig });
    ok('15c. relay.call = the api bridge catch-all (any door tool, auth handled here)',
        b3Ans.status === 200 && b3Ans.json.reply && b3Ans.json.reply.ok === true
        && b3Ans.json.reply.answer && b3Ans.json.reply.answer.echoed === 'brain_list',
        JSON.stringify(b3Ans.json).slice(0, 160));
    const bh = bridgeEnvelope('relay.call', { tool: 'brain_list' });
    bh.raw = JSON.stringify({ event: 'relay.call', from: 'bridge-suite', ts: Date.now(),
        nonce: crypto.randomBytes(16).toString('hex'), payload: { wrong: true }, v: { major: 2 } });
    const bhAns = await postRelay(relayPort, bh.raw, { 'x-signature-256': Encrypt.hmacSign(bh.raw, GATE) });
    ok('15d. a bent bridge payload -> typed E_RIDE_DECODE (no planning, honest refusal)',
        bhAns.status === 200 && bhAns.json.reply && bhAns.json.reply.ok === false
        && bhAns.json.reply.code === 'E_RIDE_DECODE',
        JSON.stringify(bhAns.json).slice(0, 160));
    const bu2 = bridgeEnvelope('relay.nothing', { x: 1 });
    const bu2Ans = await postRelay(relayPort, bu2.raw, { 'x-signature-256': bu2.sig });
    ok('15e. an unknown family -> typed E_RELAY_UNKNOWN_EVENT (the schema answers, not silence)',
        bu2Ans.status === 200 && bu2Ans.json.reply && bu2Ans.json.reply.ok === false
        && bu2Ans.json.reply.code === 'E_RELAY_UNKNOWN_EVENT',
        JSON.stringify(bu2Ans.json).slice(0, 160));

    // ---- 16. THE ORIGIN POLICY (pass 270): the resolver, all postures ----
    const policy = require(__dirname + '/../lib/api')._relayOriginPolicy;
    const policyP = (origin, cfg) => policy(origin, { allowPrivate: false, intranet: false, ...cfg });
    const r = policyP('https://pod.example.com', {});
    ok('16a. PUBLIC posture: https anywhere rides the standing SSRF wall',
        r.ok === true && r.policy === 'refuse');
    const pubHttp = policyP('http://example.com', {});
    ok('16b. PUBLIC posture: plain http origin refuses TYPED (the standing law)',
        pubHttp.ok === false && pubHttp.code === 'E_RELAY_BAD_ORIGIN');
    const intr = policyP('http://127.0.0.1:7717', { intranet: true });
    const lan10 = policyP('http://10.40.2.7:7717', { intranet: true });
    ok('16c. INTRANET posture: loopback + RFC1918 plain http admitted (privateLan policy, SSRF wall STAYS scoped)',
        intr.ok === true && intr.policy === 'privateLan' && lan10.ok === true && lan10.policy === 'privateLan');
    const meta = policyP('http://169.254.169.254/latest', { intranet: true });
    const mcst = policyP('http://224.0.0.1/', { intranet: true });
    ok('16d. INTRANET posture NEVER admits cloud metadata / multicast (the wall that survives every posture)',
        meta.ok === false && meta.code === 'E_RELAY_BAD_ORIGIN' && mcst.ok === false);
    const intrPub = policyP('http://example.com', { intranet: true });
    ok('16e. INTRANET posture: a public plain-http origin still refuses typed (LAN-scope admission only)',
        intrPub.ok === false && intrPub.code === 'E_RELAY_BAD_ORIGIN');
    const lab = policyP('http://example.com', { allowPrivate: true });
    ok('16f. the LAB escape is unchanged and widens last (http anywhere, skipDomainCheck)',
        lab.ok === true && lab.policy === 'off');
    const garbage = policyP('not-an-origin', {});
    ok('16g. an unparseable origin refuses typed through the SAME language (E_RELAY_BAD_ORIGIN)',
        garbage.ok === false && garbage.code === 'E_RELAY_BAD_ORIGIN');

    // ---- 17. THE DOOR-FACE RIDE CORRIDOR (pass 271 e2e rung): the same
    // ride core answers the relay_ride DOOR verb — one law, both faces.
    await (async () => {
        const mcp = require(path.join(ROOT, 'lib', 'mcp'));
        const preEnabled = config.get('relay.enabled');
        const preKey = config.get('relay.channelKey');
        const inner = (n) => JSON.stringify({ nonce: n, ctx: { origin: 'door-verb-intake', path: '/mcp/relay_ride', nonce: n }, bearer: null, body: { tool: 'bridge_echo', args: { q: 'door-face' } } });
        const fakeDoor = async ({ bearer, body }) => {
            return { ok: true, status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: { echoed: body.tool, rode: 'door-faked' } }) };
        };
        let sawDoor = null;
        try {
            // 17a: UNBOUND posture — typed E_RIDE_OFFLINE, never a fake ride.
            config.set('relay.enabled', 'false');
            const offCt = Encrypt.encrypt(inner('door-unbound-0000000001'), CHANNEL_KEY);
            const off = await mcp.execute('relay_ride', { ct: offCt });
            ok('17a. relay_ride at the DOOR: an unbound pod answers typed E_RIDE_OFFLINE (honest, never a fake ride)',
                off && off.ok === false && off.code === 'E_RIDE_OFFLINE');

            // 17b: the happy corridor rides the REAL core (decode → nonce →
            // inner door call → re-seal) and opens back to the same letter.
            config.set('relay.enabled', 'true');
            config.set('relay.channelKey', CHANNEL_KEY);
            relay.setDoorTransport(async ({ bearer, body }) => {
                sawDoor = { bearer, body };
                return { ok: true, status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: { echoed: body.tool } }) };
            });
            const goodNonce = 'door-ride-17b-0000000001';
            const goodCt = Encrypt.encrypt(inner(goodNonce), CHANNEL_KEY);
            const good = await mcp.execute('relay_ride', { ct: goodCt });
            let opened = null;
            try { opened = JSON.parse(Encrypt.decrypt(good.ct, CHANNEL_KEY)); } catch (e) {}
            ok('17b. the DOOR face rides the real core: sealed in → inner door call → answer re-sealed + nonce-bound',
                good && good.ok === true && good.rode === true && typeof good.ct === 'string'
                && opened && opened.nonce === goodNonce
                && JSON.parse(opened.answer).result.echoed === 'bridge_echo'
                && sawDoor && sawDoor.body.tool === 'bridge_echo',
                JSON.stringify(good || null).slice(0, 160));

            // 17c: inner-nonce replay at the DOOR refuses (rung 2-lite).
            const rp = await mcp.execute('relay_ride', { ct: goodCt });
            ok('17c. the DOOR face refuses the inner-nonce replay (E_RIDE_REPLAY, the binding holds at every face)',
                rp && rp.ok === false && rp.code === 'E_RIDE_REPLAY');

            // 17e: ONE LAW — the door spend strikes the SHARED nonce store:
            // the same ct through the WEBHOOK face now replays too.
            if (relayPort) {
                const rideEnv = { event: 'relay.ride', from: 'one-law-probe', ts: Date.now(),
                    nonce: crypto.randomBytes(16).toString('hex'), payload: { ct: goodCt }, v: { major: 2 } };
                const raw = JSON.stringify(rideEnv);
                const wh = await postRelay(relayPort, raw, { 'x-signature-256': Encrypt.hmacSign(raw, GATE) });
                ok('17e. ONE RIDE LAW, TWO FACES: a door-spent nonce replays at the webhook face too (the shared core strike-through)',
                    wh.status === 200 && wh.json && wh.json.reply && wh.json.reply.ok === false
                    && wh.json.reply.code === 'E_RIDE_REPLAY',
                    JSON.stringify(wh.json || null).slice(0, 160));
            }

            // 17d: a wrong-key seal decodes to nothing (fail-closed, E_RIDE_DECODE).
            const badCt = Encrypt.encrypt(inner('door-ride-17d-0000000001'), 'the-dWrong-key-0123456789abcdef');
            const bad = await mcp.execute('relay_ride', { ct: badCt });
            ok('17d. a wrong-key seal decodes to NOTHING at the door (typed E_RIDE_DECODE, fail-closed)',
                bad && bad.ok === false && bad.code === 'E_RIDE_DECODE');
        } finally {
            config.set('relay.enabled', preEnabled);
            config.set('relay.channelKey', preKey);
            relay.setDoorTransport(null); // back to the loopback door seam
        }
    })();
}

run()
    .then(async () => {
        try { await relay.unmount(); } catch (e) { /* already down */ }
        try { upstreamServer.close(); } catch (e) { }
        console.log('\n--- RESULTS ---');
        console.log('  Passed:  ' + passNum);
        console.log('  Failed:  ' + failNum);
        process.exit(failNum ? 1 : 0);
    })
    .catch(async (e) => {
        try { await relay.unmount(); } catch (e2) { }
        try { upstreamServer.close(); } catch (e3) { }
        console.error('SUITE ERROR: ' + e.message);
        console.error(e.stack);
        process.exit(1);
    });
