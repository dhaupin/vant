#!/usr/bin/env node
/**
 * Headless retire/rewire pins (issue #187, the trifecta audit executed).
 *
 * 1. detectMode: "headless" is NO LONGER the ambient import fallback - an
 *    imported module claims no serving origin; explicit VANT_MODE (incl.
 *    'headless') and real doors still resolve.
 * 2. The REST sidecar is health-only: GET /tools and GET /brain answer
 *    410 Gone with honest pointers (the MCP door is the API); /health
 *    stays 200.
 * 3. The pod door: `vant headless` boots the combined runtime (MCP door as
 *    THE API on 3457-class port + REST health sidecar), registers the
 *    node, prints the one auth posture, and hands out a pairing code.
 *    MCP door /tools alias stays 200 (it IS the tool surface).
 */

const assert = require('assert');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');

let passed = 0, failed = 0;
function ok(name, cond, extra) {
    if (cond) { passed++; console.log('  ✓ ' + name); }
    else { failed++; console.log('  ✗ FAIL: ' + name + (extra ? ' — ' + String(extra).slice(0, 160) : '')); }
}

const ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------- helpers

function getFreePort() {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.listen(0, '127.0.0.1', () => {
            const port = srv.address().port;
            srv.close(() => resolve(port));
        });
        srv.on('error', reject);
    });
}

function httpGet(port, p, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, path: p, method: 'GET' }, (res) => {
            let data = '';
            res.on('data', c => { data += c; });
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.setTimeout(timeoutMs, () => req.destroy(new Error('http timeout')));
        req.end();
    });
}

function withEnv(map, fn) {
    const prev = {};
    for (const [k, v] of Object.entries(map)) { prev[k] = process.env[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    try { return fn(); }
    finally { for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}

console.log('\n🚪 HEADLESS RETIRE PINS (#187 — the pod, not "REST without MCP")\n');

// ---- 1. detectMode: no ambient headless fallback -------------------------

const api = require(path.join(ROOT, 'lib', 'api'));

ok('detectMode: plain import claims NO mode (null, not an ambient "headless")',
    api.detectMode() === null || api.detectMode() === 'cli' || api.detectMode() === 'mcp', String(api.detectMode()) + ' ∈ cli/mcp accepted; null for a clean import is the contract');

withEnv({ VANT_MODE: undefined, VANT_MCP_PORT: undefined }, () => {
    process.env.VANT_MODE = 'headless';
    ok('detectMode: explicit VANT_MODE=headless still honored', api.detectMode() === 'headless');
    ok('detectMode: explicit VANT_MODE=mcp still honored', (process.env.VANT_MODE = 'mcp', api.detectMode() === 'mcp'));
});
withEnv({ VANT_MODE: undefined, VANT_MCP_PORT: '3999' }, () => {
    ok('detectMode: the MCP door env resolves mcp', api.detectMode() === 'mcp');
});

// ---- 2. REST sidecar: health-only (/tools + /brain 410 Gone) -------------

(async () => {
    const scratch = await getFreePort();
    let server = null;
    try {
        const { Server } = require(path.join(ROOT, 'lib', 'server'));
        server = new Server({ port: scratch, allowInsecure: true });
        await server.listen();
    } catch (e) {
        ok('REST sidecar boots for the retire pin', false, 'Server.listen failed: ' + e.message);
        return report();
    }

    await (async () => {
        const tools = await httpGet(scratch, '/tools');
        ok('GET /tools → 410 Gone (dashboard-owned parallel surface retired)', tools.status === 410, 'status ' + tools.status);
        ok('GET /tools body points at the MCP door', /MCP door/i.test(tools.body), tools.body.slice(0, 100));

        const brain = await httpGet(scratch, '/brain');
        ok('GET /brain stub → 410 Gone (pre-registry stub retired)', brain.status === 410, 'status ' + brain.status);

        const health = await httpGet(scratch, '/health');
        ok('GET /health stays 200', health.status === 200 && /ok/.test(health.body));
    })();

    if (server && server.stop) { try { await server.stop(); } catch (e) { /* best effort */ } }

    // ---- 3. the pod door (`vant headless` child process) ------------------

    const mcpPort = await getFreePort();
    const apiPort = await getFreePort();
    await (async () => {
        const child = spawn('node', [path.join(ROOT, 'bin', 'vant.js'), 'headless',
            '--port', String(mcpPort), '--api-port', String(apiPort)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '', up = false, doorOk = false, healthOk = false, sidecarRetired = false, posture = false, pairing = false;

        child.stdout.on('data', d => { out += String(d); if (/Headless pod up/.test(String(d))) up = true; if (/auth posture/.test(String(d))) posture = true; if (/pairing code/.test(String(d))) pairing = true; });
        child.stderr.on('data', d => { out += String(d); });

        const deadline = Date.now() + 45000;
        while (Date.now() < deadline && !(up && healthOk && doorOk && sidecarRetired)) {
            if (up && !doorOk) {
                try { const t = await httpGet(mcpPort, '/tools'); if (t.status === 200 && /tools/.test(t.body)) doorOk = true; } catch (e) { /* not up yet */ }
            }
            if (up && !healthOk) {
                try { const h = await httpGet(apiPort, '/health'); if (h.status === 200) healthOk = true; } catch (e) { /* not up yet */ }
            }
            if (up && !sidecarRetired) {
                try { const t = await httpGet(apiPort, '/tools'); if (t.status === 410) sidecarRetired = true; } catch (e) { /* not up yet */ }
            }
            await new Promise(r => setTimeout(r, 400));
        }

        ok('pod door: `vant headless` boots and reports "Headless pod up"', up, out.slice(-200));
        ok('pod door: MCP door serves the tool surface (200 /tools)', doorOk);
        ok('pod door: REST sidecar is health-only (200 /health)', healthOk);
        ok('pod door: REST /tools retired in the pod too (410)', sidecarRetired);
        ok('pod door: the ONE auth posture prints', posture, out.slice(-200));
        ok('pod door: a pairing code is handed out', pairing, out.slice(-200));

        child.on('exit', () => {});
        try { child.kill('SIGTERM'); } catch (e) { /* already gone */ }
        const exitDone = new Promise(r => child.on('exit', r));
        await Promise.race([exitDone, new Promise(r => setTimeout(r, 4000))]);
        try { child.kill('SIGKILL'); } catch (e) { /* gone */ }

        // best-effort: unregister the discovery row this pod created
        try {
            const nodes = require(path.join(ROOT, 'lib', 'node-registry'));
            if (nodes && typeof nodes.unregister === 'function') {
                const last = await Promise.resolve(nodes.list?.() || []);
                for (const n of last) { if (n && n.role === 'headless' && n.id) { try { await nodes.unregister(n.id); } catch (e) { /* best effort */ } } }
            }
        } catch (e) { /* best effort */ }
    })();

    report();
})();

function report() {
    console.log('\n=== headless-retire pins: ' + passed + ' passed, ' + failed + ' failed ===\n');
    process.exit(failed > 0 ? 1 : 0);
}
