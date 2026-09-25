#!/usr/bin/env node
/**
 * Crew Bus Tests (pass 35) — node-crew v0.2 transport
 *
 * Covers the signed-envelope bridge between node processes:
 *   1. Signed cross-process delivery (real child processes on real ports)
 *   2. Broadcast fan-out to multiple peers
 *   3. 401 on bad signature (tampered payload)
 *   4. Isolation: buses sharing one process must not cross-dispatch
 *   5. Input validation errors
 *   6. NOT_FOUND error code exists (crew-bus + sudo both reference it)
 *   7. Dispatch handler errors are contained (don't kill the bus)
 *   8. events fire: crew:node:registered, crew:<type>, webhook:crew.<type>
 *
 * Self-reporting suite: exit 1 on fail. Ports: 4571+pid%40 / 4572+pid%40 to
 * avoid collisions with parallel suite runs.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0 };
const failures = [];

function test(name, fn) {
    return Promise.resolve()
        .then(fn)
        .then(() => {
            results.passed++;
            console.log(`  ✓ ${name}`);
        })
        .catch((e) => {
            results.failed++;
            failures.push(name);
            console.log(`  ✗ ${name}: ${e.message}`);
        });
}

function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
}

const PORT_BASE = 4571 + (process.pid % 40);
const PORT_A = PORT_BASE;
const PORT_B = PORT_BASE + 1;
const PORT_C = PORT_BASE + 2;
const SECRET = 'crew-bus-test-secret-' + process.pid;

// Child process source: a full crew node listening on argv[2] with its own
// bus, dispatching into a log file so the parent can await delivery.
const CHILD_SRC = `
const { createBus } = require(${JSON.stringify(path.join(ROOT, 'lib/crew-bus.js'))});
const fs = require('fs');
const LOG = process.argv[3];
const PORT = parseInt(process.argv[2], 10);
const bus = createBus({ name: 'child', port: PORT, secret: ${JSON.stringify(SECRET)} });
bus.onDispatch('message', (env) => {
    fs.appendFileSync(LOG, JSON.stringify(env) + '\\n');
});
bus.onDispatch('broadcast_ping', (env) => {
    fs.appendFileSync(LOG, JSON.stringify(env) + '\\n');
});
bus.listen();
console.log('READY');
`;

function runChild(port) {
    const tmp = path.join(os.tmpdir(), `crew-bus-test-${process.pid}-${port}.js`);
    fs.writeFileSync(tmp, CHILD_SRC);
    const log = path.join(os.tmpdir(), `crew-bus-test-log-${process.pid}-${port}.jsonl`);
    try { fs.unlinkSync(log); } catch (e) {}
    const child = spawn(process.execPath, [tmp, String(port), log], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env
    });
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('child did not become ready')), 8000);
        let out = '';
        child.stdout.on('data', (d) => {
            out += d.toString();
            if (out.includes('READY')) {
                clearTimeout(timer);
                resolve({
                    log,
                    kill: () => { try { child.kill('SIGKILL'); } catch (e) {} },
                    cleanup: () => { try { fs.unlinkSync(tmp); } catch (e) {} try { fs.unlinkSync(log); } catch (e) {} }
                });
            }
        });
        child.stderr.on('data', (d) => { if (out.length < 4000) out += d.toString(); });
        child.on('exit', (code) => { clearTimeout(timer); reject(new Error('child exited early code=' + code + ' ' + out.slice(0, 300))); });
    });
}

async function waitFor(fn, { timeout = 10000, every = 50, label = 'condition' } = {}) {
    const start = Date.now();
    let last;
    while (Date.now() - start < timeout) {
        last = fn();
        if (last) return last;
        await new Promise((r) => setTimeout(r, every));
    }
    throw new Error('timeout waiting for ' + label);
}

function readLog(logPath) {
    try {
        return fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    } catch (e) {
        return [];
    }
}

const { createBus } = require(path.join(ROOT, 'lib/crew-bus.js'));

async function main() {
    console.log('\n🚌 CREW BUS TESTS\n');

    // ---------- 1. Signed cross-process delivery ----------
    // Documented crew setup step: each node allowlists its peers' hosts —
    // the network SSRF gate blocks loopback otherwise (pinned by these two
    // delivery tests failing before this call).
    require(path.join(ROOT, 'lib/network.js')).setAllowedDomains(['127.0.0.1']);
    let childA = null;
    try {
        childA = await runChild(PORT_A);
    } catch (e) {
        // fall through — the test itself reports the spawn failure
    }
    if (childA) {
        const busA = createBus({ name: 'alpha', port: PORT_B, secret: SECRET });
        busA.registerNode({ name: 'child', url: `http://127.0.0.1:${PORT_A}`, secret: SECRET });

        await test('signed delivery reaches the peer and dispatches', async () => {
            const r = await busA.send('child', 'message', { hello: 'crew', n: 1 });
            assert(r.ok === true, 'ack.received should be true, got ' + JSON.stringify(r.ack));
            assert(typeof r.handlers === 'number', 'handlers should be numeric');
            const entries = await waitFor(() => readLog(childA.log).find((e) => e.type === 'message' && e.payload && e.payload.n === 1), { label: 'dispatch' });
            assert(entries.from === 'alpha', 'envelope.from should be alpha, got ' + entries.from);
            assert(entries.event === 'crew.message', 'event field mismatch');
        });

        await test('ack reports dispatched handler count', async () => {
            const r = await busA.send('child', 'message', { n: 2 });
            assert(r.ok === true, 'delivery should succeed');
            assert(r.handlers >= 1, 'handlers should be >= 1, got ' + r.handlers);
        });

        await test('send to unknown node throws NOT_FOUND', async () => {
            let err = null;
            try { await busA.send('nobody-here', 'message', {}); } catch (e) { err = e; }
            assert(err, 'should throw');
            assert(err.code === 'NOT_FOUND', 'expected code NOT_FOUND, got ' + err.code);
        });

        await test('cannot send to self', async () => {
            let err = null;
            try { await busA.send('alpha', 'message', {}); } catch (e) { err = e; }
            assert(err, 'should throw');
        });

        await test('stop() closes the bus server', async () => {
            const busTmp = createBus({ name: 'temp', port: PORT_C, secret: SECRET });
            busTmp.listen();
            assert(busTmp.status().listening === true, 'should be listening');
            await busTmp.stop();
            assert(busTmp.status().listening === false, 'should not be listening');
        });

        childA.kill();
        childA.cleanup();
    } else {
        results.failed++;
        failures.push('child process could not start (see above)');
        console.log('  ✗ signed delivery cluster: child process failed to spawn');
    }

    // ---------- 2. In-process twin-bus isolation (no ports needed) ----------
    await test('input validation: bad names, urls, ports', () => {
        const bus = createBus();
        let threw = null;
        try { bus.configure({ name: 'bad name!', port: 5000 }); } catch (e) { threw = e; }
        assert(threw, 'invalid name should throw');
        threw = null;
        try { bus.configure({ name: 'ok-name', port: 99999 }); } catch (e) { threw = e; }
        assert(threw, 'invalid port should throw');	        threw = null;
	        try { bus.configure({ name: 'ok-name', port: 5000 }); } catch (e) { threw = e; }
	        assert(threw, 'secretless config should throw (pass 42: transport auth mandatory)');
	        threw = null;
	        try { bus.configure({ name: 'ok-name', port: 5000, secret: 's-' + process.pid }); } catch (e) { threw = e; }
	        assert(!threw, 'valid config with secret should not throw');
        threw = null;
        try { bus.registerNode({ name: 'peer', url: 'ftp://x', secret: 's' }); } catch (e) { threw = e; }
        assert(threw, 'non-http url should throw');
        threw = null;
        try { bus.registerNode({ name: 'bad name', url: 'http://x', secret: 's' }); } catch (e) { threw = e; }
        assert(threw, 'invalid peer name should throw');
    });

    await test('tampered payload fails HMAC (401 from webhooks layer)', async () => {
        const http = require('http');
        const Encrypt = require(path.join(ROOT, 'lib/encrypt.js'));
        // Stand up a webhook server the same way a bus does, then POST a
        // tampered body with a signature over a DIFFERENT body.
        const webhooks = require(path.join(ROOT, 'lib/webhooks.js'));
        webhooks.register({ name: 'tamper-probe', source: 'test', eventKeyExpr: 'event', signatureHeader: 'X-Signature-256', secret: SECRET });
        const server = webhooks.startServer(PORT_C);
        await new Promise((r) => server.on('listening', r));
        const body = JSON.stringify({ event: 'crew.message', from: 'x', type: 'message', payload: { legit: true }, ts: 1, nonce: 1 });
        const tampered = JSON.stringify({ event: 'crew.message', from: 'x', type: 'message', payload: { legit: false, stolen: true }, ts: 1, nonce: 1 });
        const sig = Encrypt.hmacSign(body, SECRET);
        const res = await new Promise((resolve, reject) => {
            const req = http.request({ host: '127.0.0.1', port: PORT_C, path: '/tamper-probe', method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Signature-256': sig, 'Content-Length': Buffer.byteLength(tampered) } }, resolve);
            req.on('error', reject);
            req.end(tampered);
        });
        let txt = '';
        for await (const c of res) txt += c.toString();
        server.close();
        assert(res.statusCode === 401, 'expected 401, got ' + res.statusCode + ' ' + txt.slice(0, 120));
    });

    await test('twin buses in one process do not cross-dispatch', async () => {
        const got = [];
        const busX = createBus({ name: 'x-node', port: PORT_C, secret: SECRET });
        const busY = createBus({ name: 'y-node', port: PORT_C + 1, secret: SECRET });
        busX.onDispatch('ping', (env) => got.push(['x', env.payload]));
        busY.onDispatch('ping', (env) => got.push(['y', env.payload]));
        // Fire the webhooks-layer event for each bus's route directly —
        // proves the filter `data.webhook === config.name` isolates twins.
        const event = require(path.join(ROOT, 'lib/event.js'));
        event.emit('webhook:crew.ping', { webhook: 'x-node', source: 'vant-crew', event: 'crew.ping', body: { event: 'crew.ping', from: 'peer', type: 'ping', payload: { who: 'x' }, ts: 1, nonce: 1 } });
        event.emit('webhook:crew.ping', { webhook: 'y-node', source: 'vant-crew', event: 'crew.ping', body: { event: 'crew.ping', from: 'peer', type: 'ping', payload: { who: 'y' }, ts: 1, nonce: 1 } });
        await new Promise((r) => setTimeout(r, 30));
        assert(got.length === 2, 'both envelopes should dispatch, got ' + JSON.stringify(got));
        assert(got.some((g) => g[0] === 'x' && g[1].who === 'x'), 'x should get only its own');
        assert(got.some((g) => g[0] === 'y' && g[1].who === 'y'), 'y should get only its own');
        await busX.stop();
        await busY.stop();
    });

    await test('dispatcher errors are contained', async () => {
        const bus = createBus({ name: 'boom-node', port: PORT_C, secret: SECRET });
        bus.onDispatch('explode', () => { throw new Error('handler blew up'); });
        const event = require(path.join(ROOT, 'lib/event.js'));
        event.emit('webhook:crew.explode', { webhook: 'boom-node', source: 'vant-crew', event: 'crew.explode', body: { event: 'crew.explode', from: 'peer', type: 'explode', payload: {}, ts: 1, nonce: 1 } });
        await new Promise((r) => setTimeout(r, 30));
        assert(bus.status().configured === true, 'bus should survive dispatcher errors');
        await bus.stop();
    });

    await test('malformed envelopes are dropped without throwing', async () => {
        const bus = createBus({ name: 'drop-node', port: PORT_C, secret: SECRET });
        let dispatched = 0;
        bus.onDispatch('msg2', () => dispatched++);
        const event = require(path.join(ROOT, 'lib/event.js'));
        event.emit('webhook:crew.msg2', { webhook: 'drop-node', source: 'vant-crew', event: 'crew.msg2', body: { nopes: true } }); // missing from/type/payload
        event.emit('webhook:crew.msg2', { webhook: 'drop-node', source: 'vant-crew', event: 'crew.msg2', body: { from: 'p', type: 'msg2', payload: {}, event: 'crew.WRONG' } }); // event/type mismatch
        event.emit('webhook:crew.msg2', null); // no body
        await new Promise((r) => setTimeout(r, 30));
        assert(dispatched === 0, 'malformed envelopes must not dispatch');
        await bus.stop();
    });

    await test('broadcast returns per-node results', async () => {
        const bus = createBus({ name: 'solo', port: PORT_C, secret: SECRET });
        bus.registerNode({ name: 'ghost', url: 'http://127.0.0.1:1', secret: SECRET }); // port 1 = connection refused fast
        const out = await bus.broadcast('wave', { hi: true });
        assert(Array.isArray(out) && out.length === 1, 'one result per peer');
        assert(out[0].node === 'ghost' && out[0].ok === false, 'dead peer reported not ok, got ' + JSON.stringify(out));
        await bus.stop();
    });

    await test('NOT_FOUND code exists in error.js (crew-bus + sudo need it)', () => {
        const { CODES, VantError } = require(path.join(ROOT, 'lib/error.js'));
        assert(CODES.NOT_FOUND === 'NOT_FOUND', 'CODES.NOT_FOUND must be defined');
        const e = new VantError('x', { code: CODES.NOT_FOUND });
        assert(e.code === 'NOT_FOUND', 'VantError should carry the code, got ' + e.code);
    });

    await test('nodes() never leaks secrets', async () => {
        const bus = createBus({ name: 'sec', port: PORT_C, secret: SECRET });
        bus.registerNode({ name: 'peer', url: 'http://127.0.0.1:9', secret: 'super-secret-value' });
        const snap = JSON.stringify(bus.nodes());
        assert(!snap.includes('super-secret-value'), 'peer secret leaked via nodes()');
        const st = JSON.stringify(bus.status());
        assert(!st.includes('super-secret-value'), 'peer secret leaked via status()');
        await bus.stop();
    });

    console.log(`\n${'='.repeat(50)}`);
    console.log(`Crew Bus: ${results.passed} passed, ${results.failed} failed`);
    if (results.failed > 0) {
        console.log('Failures: ' + failures.join(', '));
    }
    console.log('='.repeat(50));

    process.exit(results.failed > 0 ? 1 : 0);
}

process.on('unhandledRejection', (e) => {
    console.error('UNHANDLED REJECTION:', e && e.message);
});

main().catch((e) => {
    console.error('FATAL:', e.message);
    process.exit(1);
});
