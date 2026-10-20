#!/usr/bin/env node
/**
 * THE GUARD-HONESTY PINS (crashtest #215 + #214) — Server._handleRequest.
 *
 * The security chain THROWS its refusals; the dispatcher maps each guard
 * family to its honest HTTP class. A refusal and a server fault must
 * never be observably identical:
 *   flood / wall            -> 429 + a PRECISE Retry-After
 *   escrow budget exhausted -> 429 (temporal) with Retry-After
 *   bent/hostile body       -> 400 (SyntaxError family, real reason)
 *   stored credentials      -> 401 (distinct, never 500)
 *   hostile JSON-RPC shapes -> 400 (vaf/validation class, code rides)
 * and EVERY POST answer carries Cache-Control: no-store (#214).
 *
 * Run: node test/crashtest-server.js
 * Exit: 0 = every wall answered honestly. 1 = a guard died as a 500.
 */

'use strict';

const { Server } = require('../lib/server');

const pass = [];
const fail = [];
function ok(name, cond, info) {
    (cond ? pass : fail).push({ name, info: info || (cond ? '' : 'assertion failed') });
    console.log('  ' + (cond ? '✓' : '✗') + ' ' + name + (cond ? '' : '  ← ' + (info || '')));
}

/** A fake request (an EventEmitter with url/method) + a recording res. */
const EventEmitter = require('events');
function fakePair(reqOpts) {
    const req = new EventEmitter();
    req.url = reqOpts.url || '/call';
    req.method = reqOpts.method || 'POST';
    req.headers = reqOpts.headers || {};
    req.socket = { remoteAddress: '127.0.0.1' };
    req.setTimeout = function (_ms, _fn) { /* pins never run the clock */ };
    const res = {
        headers: {},
        status: null,
        body: '',
        headersSent: false,
        setHeader(k, v) { this.headers[k] = v; },
        writeHead(status, headers) { this.status = status; this.headersSent = true; Object.assign(this.headers, headers || {}); },
        end(data) { this.body = String(data); }
    };
    return { req, res };
}

/** Drive _handleRequest to its 'end'-of-body handler and await the outcome. */
function drive(server, pair, bodyChunks) {
    const p = server._handleRequest(pair.req, pair.res);
    if (bodyChunks !== undefined) pair.req.emit('data', Buffer.from(bodyChunks));
    pair.req.emit('end');
    if (p && typeof p.then === 'function') return p.then(() => pair.res);
    return pair.res;
}

async function main() {
    const server = new Server({ port: 0, requestTimeout: 60000 });

    // (ordering law) the FLOOD pin runs LAST — exhausting the global
    // window would 429 every later probe (the wall is global, by design).

    // ---- 1. THE ESCROW WALL: budget exhausted answers 429, not 500 ----
    const canSpend = server._escrow.canSpend.bind(server._escrow);
    server._escrow.canSpend = () => false; // the budget ran dry (crashtest storage-fill)
    const escrowRes = await drive(server, fakePair({ url: '/call', method: 'POST' }), '{"tool":"memory_list","args":{}}');
    server._escrow.canSpend = canSpend;
    ok('2. an exhausted budget answers 429 with a Retry-After (temporal, replenishing — never a 500)',
        escrowRes.status === 429 && typeof escrowRes.headers['Retry-After'] === 'string',
        escrowRes.status + ' ' + JSON.stringify(escrowRes.headers) + ' ' + escrowRes.body.slice(0, 90));

    // ---- 3. HOSTILE BODIES: bent JSON answers 400 with the reason ----
    const bentRes = await drive(server, fakePair({ url: '/call', method: 'POST' }), '{"id":');
    ok('3. a bent body answers 400 (a SyntaxError family miss is the CALLER\'s fault, not the server\'s)',
        bentRes.status === 400, bentRes.status + ' ' + bentRes.body.slice(0, 90));
    const hostileRes = await drive(server, fakePair({ url: '/call', method: 'POST' }), '{"id":2147483648,"jsonrpc":"2.0","method":"tools/call"}');
    ok('3b. the crashtest first-offender shape {"id":2147483648} answers 4xx honest (never a 500)',
        hostileRes.status >= 400 && hostileRes.status < 500,
        hostileRes.status + ' ' + hostileRes.body.slice(0, 110));
    // (crashtest pass-2, the storage-fill class) a 64 KiB body passes the
    // 1 MiB transport limit but trips vaf's MAX_PATH_LENGTH scan on the RAW
    // body — SECURITY_PATH_TRAVERSAL was the one guard family the catch map
    // missed (crashtest volume/storage-fill broke kvwrite 30/30× as 500s).
    const fillBody = JSON.stringify({ tool: 'memory_store', args: { key: 'fill0', content: 'A'.repeat(64 * 1024) } });
    const fillRes = await drive(server, fakePair({ url: '/call', method: 'POST' }), fillBody);
    ok('3c. a fill-sized body (64KiB, under the transport limit) answers 400 honest (the storage-fill class never 500s)',
        fillRes.status === 400 && fillRes.body.includes('Path blocked'),
        fillRes.status + ' ' + fillRes.body.slice(0, 110));

    // ---- 4. CREDENTIAL STUFFING: varied keys answer 401, distinctly ----
    const authServer = new Server({ port: 0, authRequired: true, requestTimeout: 60000 });
    const stuffed1 = await drive(authServer, fakePair({ url: '/call', method: 'POST', headers: {} }), '{"tool":"relay_status"}');
    const stuffed2 = await drive(authServer, fakePair({ url: '/call', method: 'POST', headers: { 'x-api-key': 'vguess_stuff-0123456789' } }), '{"tool":"relay_status"}');
    ok('4. credential stuffing answers 401 distinct (missing key AND wrong key — never a 500)',
        stuffed1.status === 401 && stuffed2.status === 401,
        stuffed1.status + ' / ' + stuffed2.status);

    // ---- 5. THE WRITE HONESTY HEADER (#214): every POST answer is no-store ----
    // (pinned on the flood probe below — the only post that survives the
    // refusal path AND rides the no-store header)

    // ---- 6. non-POST surfaces keep their honest shape ----
    const GETres = await drive(server, fakePair({ url: '/health', method: 'GET' }), undefined);
    ok('6. non-POST surfaces keep their honest shape (no Cache-Control need, GET /health still 200)',
        GETres.status === 200 && GETres.headers['Cache-Control'] === undefined,
        GETres.status);

    // ---- 7. THE FLOOD WALL (LAST — the wall is global): 429 + Retry-After ----
    let flooded = false;
    let i = 0;
    while (i < 300) {
        const allowed = await server._qos._rateLimiter.check('pin-flood', 'read');
        if (!allowed) { flooded = true; break; }
        i++;
    }
    const floodedRes = await drive(server, fakePair({ url: '/call', method: 'POST' }), '{"tool":"relay_status","args":{}}');
    ok('7. a flooded wall answers 429 (the limiter outcome is NOT a server fault)',
        flooded === true && floodedRes.status === 429,
        'flooded: ' + flooded + ' status: ' + floodedRes.status);
    ok('7b. the 429 carries a PRECISE Retry-After (the limiter knows the TTL it refused for)',
        /^[1-9][0-9]*$/.test(floodedRes.headers['Retry-After'] || ''),
        JSON.stringify(floodedRes.headers));
    ok('7c. even a REFUSED POST answers no-store (#214 covers refusals too — no state to store, either)',
        floodedRes.headers['Cache-Control'] === 'no-store' && floodedRes.headers['Pragma'] === 'no-cache',
        JSON.stringify({ c: floodedRes.headers['Cache-Control'], p: floodedRes.headers['Pragma'] }));
}

main()
    .then(() => {
        console.log('\n--- RESULTS ---');
        console.log('  Passed:  ' + pass.length);
        console.log('  Failed:  ' + fail.length);
        process.exit(fail.length ? 1 : 0);
    })
    .catch((e) => {
        console.error('SUITE ERROR: ' + e.message);
        console.error(e.stack);
        process.exit(1);
    });
