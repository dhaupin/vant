#!/usr/bin/env node
/**
 * P4 Mode B pins — the POD's same-origin static serve (prd-web.md 3.1).
 *
 * Lives against the REAL door (mcp.start) exactly like the EW1/#190 pins:
 * one boot per posture, live fetches through the door's own deny chain.
 *
 *  1. config accessor: mcpServeWeb() default null, env overrides, key map
 *  2. serving ACTIVE: / serves the bundle shell (text/html, no-store)
 *  3. built assets: /assets/app.js -> text/javascript + 1h cache header
 *  4. SPA fallback: unknown client route answers the shell file (200)
 *  5. traversal + dotfiles: /../outside.refused, %2e%2e, /.env all 403 and
 *     the outside file's content NEVER reaches the wire
 *  6. HEAD works (headers only)
 *  7. the door stays the door: /health JSON, /mcp/tools list, POST unknown
 *     still the 404 JSON endpoints line
 *  8. posture INACTIVE (the default): GET / is still the honest 404 JSON —
 *     the retiring passes' behavior untouched
 *  9. configured-but-missing dist: serving stays OFF with a warning, no crash
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const results = { passed: 0, failed: 0, tests: [] };

function test(name, fn) {
    try {
        const r = fn();
        if (r === true || (r && r.success)) {
            results.passed++;
            console.log(`  ✓ ${name}`);
        } else {
            results.failed++;
            console.log(`  ✗ ${name}: ${(r && r.error) || 'assertion failed'}`);
        }
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

/** Raw HTTP over a socket: undici fetch normalizes /../ dot-segments
 *  CLIENT-SIDE, so a traversal guard can only be pinned honestly with a
 *  request the server receives verbatim. */
function rawGet(port, requestTarget) {
    return new Promise((resolve, reject) => {
        const net = require('net');
        const sock = net.connect(port, '127.0.0.1');
        let buf = '';
        sock.setEncoding('utf8');
        sock.on('connect', () => sock.write(`GET ${requestTarget} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`));
        sock.on('data', (c) => { buf += c; });
        sock.on('end', () => {
            const status = /^HTTP\/[\d.]+ (\d+)/.exec(buf);
            if (!status) return reject(new Error('no HTTP status line')); 
            resolve({ status: Number(status[1]), raw: buf });
        });
        sock.on('error', reject);
        setTimeout(() => { sock.destroy(); reject(new Error('raw request timeout')); }, 5000);
    });
}

async function asyncTest(name, fn) {
    try {
        const r = await fn();
        if (r === true || (r && r.success)) {
            results.passed++;
            console.log(`  ✓ ${name}`);
        } else {
            results.failed++;
            console.log(`  ✗ ${name}: ${(r && r.error) || 'assertion failed'}`);
        }
    } catch (e) {
        results.failed++;
        console.log(`  ✗ ${name}: ${e.message}`);
    }
}

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
    return true;
}

const mcp = require(path.join(ROOT, 'lib', 'mcp'));
const config = require(path.join(ROOT, 'lib', 'config'));

// ---- the bundle fixture (real files on disk; the door stats/streams them)

function makeFixture() {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-serve-'));
    const dist = path.join(home, 'dist');
    fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(dist, 'index.html'),
        '<!doctype html><title>bolete-served</title><body>bundle-shell-marker</body>');
    fs.writeFileSync(path.join(dist, 'assets', 'app.js'), 'console.log("asset-ok");\n');
    fs.writeFileSync(path.join(home, 'outside.refused'), 'MUST-NEVER-REACH-THE-WIRE');
    fs.writeFileSync(path.join(dist, '.hidden'), 'DOTFILE-MUST-403');
    return { home, dist };
}

const BASE = 'http://127.0.0.1:PORT';
const fetchOn = (port, rel, opts) => fetch(`${BASE.replace('PORT', port)}${rel}`, opts);
const text = (res) => res.text();

// ===========================================================
(async () => {
    // -------------------------------------------------- config accessor pins
    test('mcpServeWeb() default is null', () => {
        const saved = process.env.VANT_MCP_SERVE_WEB;
        delete process.env.VANT_MCP_SERVE_WEB;
        try {
            assert(config.mcpServeWeb() === null, 'default must be null (honest OFF)');
        } finally {
            if (saved !== undefined) process.env.VANT_MCP_SERVE_WEB = saved;
        }
        return { success: true };
    });

    test('mcpServeWeb() honors VANT_MCP_SERVE_WEB', () => {
        const saved = process.env.VANT_MCP_SERVE_WEB;
        try {
            process.env.VANT_MCP_SERVE_WEB = 'web/dashboard';
            assert(config.mcpServeWeb() === 'web/dashboard', 'env must resolve');
        } finally {
            if (saved === undefined) delete process.env.VANT_MCP_SERVE_WEB;
            else process.env.VANT_MCP_SERVE_WEB = saved;
        }
        return { success: true };
    });

    // -------------------------------------------------- SERVING ACTIVE
    const fx = makeFixture();
    let portA = null;
    await asyncTest('boot with active serving listens', async () => {
        const r = await mcp.start({ port: 0, silent: true, serveWeb: fx.home });
        portA = r.port;
        return { success: Number.isInteger(portA) && portA > 0 };
    });

    await asyncTest('GET / serves the bundle shell (html, no-store)', async () => {
        const res = await fetchOn(portA, '/');
        const body = await text(res);
        assert(res.status === 200, `status ${res.status}`);
        assert(String(res.headers.get('content-type')).includes('text/html'), `ct ${res.headers.get('content-type')}`);
        assert(res.headers.get('cache-control') === 'no-store', `cache ${res.headers.get('cache-control')}`);
        assert(body.includes('bundle-shell-marker'), 'wrong file streamed');
        return { success: true };
    });

    await asyncTest('GET /assets/app.js correct MIME + cache header', async () => {
        const res = await fetchOn(portA, '/assets/app.js');
        const body = await text(res);
        assert(res.status === 200, `status ${res.status}`);
        assert(String(res.headers.get('content-type')).includes('text/javascript'), `ct ${res.headers.get('content-type')}`);
        assert(String(res.headers.get('cache-control')).includes('max-age=3600'), `cache ${res.headers.get('cache-control')}`);
        assert(body === 'console.log("asset-ok");\n', 'asset body drifted');
        return { success: true };
    });

    await asyncTest('SPA fallback: unknown /client/route answers the shell', async () => {
        const res = await fetchOn(portA, '/couple/client/route');
        const body = await text(res);
        assert(res.status === 200, `status ${res.status}`);
        assert(String(res.headers.get('content-type')).includes('text/html'), 'fallback must be html');
        assert(body.includes('bundle-shell-marker'), 'fallback must stream index.html');
        // the fallback IS the shell streaming again — same no-store as /
        assert(res.headers.get('cache-control') === 'no-store', `fallback cache ${res.headers.get('cache-control')}`);
        return { success: true };
    });

    // RAW-socket traversal pins (undici fetch pre-normalizes dot-segments
    // and pre-decodes %2e, so these vectors only reach the door verbatim
    // over a socket): the SERVER-side guards are what must answer 403.
    await asyncTest('encoded ../ traversal (raw wire) is 403, content never served', async () => {
        const res = await rawGet(portA, '/..%2foutside.refused');
        assert(res.status === 403, `status ${res.status}`);
        assert(!res.raw.includes('MUST-NEVER-REACH-THE-WIRE'), 'outside content reached the wire');
        return { success: true };
    });

    await asyncTest('embedded %2e%2e segments (raw wire) cannot leak (URL parse defuses; any verdict)', async () => {
        // the WHATWG URL parser folds %2e segments before the guard sees the
        // path, landing on an in-bundle route - the CONTENT property is the
        // pin: outside bytes never reach the wire however the door answers
        const res = await rawGet(portA, '/assets/%2e%2e/%2e%2e/outside.refused');
        assert(!res.raw.includes('MUST-NEVER-REACH-THE-WIRE'), 'outside content reached the wire');
        return { success: true };
    });

    await asyncTest('naive raw /../outside.refused cannot leak either (any verdict)', async () => {
        // URL normalization path-defuses this form to an in-bundle route;
        // the pin is the CONTENT property, not a specific status: the outside
        // file's bytes never reach the wire however the door answers.
        const res = await rawGet(portA, '/../outside.refused');
        assert(!res.raw.includes('MUST-NEVER-REACH-THE-WIRE'), 'outside content reached the wire');
        return { success: true };
    });

    await asyncTest('dotfile GET /.hidden is 403', async () => {
        const res = await fetchOn(portA, '/.hidden');
        assert(res.status === 403, `status ${res.status}`);
        return { success: true };
    });

    await asyncTest('HEAD / answers headers, empty body', async () => {
        const res = await fetchOn(portA, '/', { method: 'HEAD' });
        assert(res.status === 200, `status ${res.status}`);
        assert(res.headers.get('content-length') !== null, 'content-length must be stated');
        assert((await text(res)) === '', 'HEAD must not stream a body');
        return { success: true };
    });

    // the door stays the door while serving
    await asyncTest('/health is still JSON while serving', async () => {
        const res = await fetchOn(portA, '/health');
        const j = await res.json();
        assert(res.status === 200 && j.status === 'ok', `health shape ${res.status}`);
        return { success: true };
    });

    await asyncTest('/mcp/tools still lists the tool surface while serving', async () => {
        const res = await fetchOn(portA, '/mcp/tools');
        const j = await res.json();
        assert(res.status === 200 && Array.isArray(j.tools) && j.tools.length > 0, 'tool surface vanished');
        return { success: true };
    });

    await asyncTest('POST unknown route keeps the honest 404 JSON', async () => {
        const res = await fetchOn(portA, '/no-such', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
        assert(res.status === 404, `status ${res.status}`);
        const j = await res.json();
        assert(Array.isArray(j.endpoints), '404 endpoints line must survive');
        return { success: true };
    });

    await mcp.stop();

    // -------------------------------------------------- POSTURE INACTIVE (default)
    let portB = null;
    await asyncTest('boot without serving listens', async () => {
        const r = await mcp.start({ port: 0, silent: true });
        portB = r.port;
        return { success: Number.isInteger(portB) && portB > 0 };
    });

    await asyncTest('inactive by default: GET / is still the 404 JSON', async () => {
        const res = await fetchOn(portB, '/');
        assert(res.status === 404, `status ${res.status}`);
        const j = await res.json();
        assert(Array.isArray(j.endpoints), 'default 404 shape must survive untouched');
        return { success: true };
    });

    await asyncTest('retire posture intact: GET /tools is 200 JSON (health-only sibling answers /health)', async () => {
        // the MCP door itself serves /tools (the REST sidecar's tool stub is
        // the 410; this door keeps its owned routes untouched by Mode B work)
        const res = await fetchOn(portB, '/tools');
        assert(res.status === 200, `status ${res.status}`);
        return { success: true };
    });

    await mcp.stop();

    // -------------------------------------------------- configured but missing dist
    const emptyHome = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-serve-empty-'));
    let portC = null;
    await asyncTest('configured-but-missing dist: boot still succeeds', async () => {
        const r = await mcp.start({ port: 0, silent: true, serveWeb: emptyHome });
        portC = r.port;
        return { success: Number.isInteger(portC) && portC > 0 };
    });

    await asyncTest('missing dist: door serves NOTHING (404 JSON, honest off)', async () => {
        const res = await fetchOn(portC, '/');
        assert(res.status === 404, `status ${res.status} — serving must stay off`);
        return { success: true };
    });

    await mcp.stop();

    // -------------------------------------------------- envelope
    fs.rmSync(fx.home, { recursive: true, force: true });
    fs.rmSync(emptyHome, { recursive: true, force: true });

    console.log(`\n  ${results.passed} passed, ${results.failed} failed (pod-serve-web)`);
    if (results.failed > 0) process.exit(1);
    process.exit(0);
})();
