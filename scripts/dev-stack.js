#!/usr/bin/env node
/**
 * dev-stack.js — the Freebuff preview test stack (PRD lab arm ONLY).
 *
 * NOT a deploy artifact and NOT a production command. This one script
 * boots the PRD "Path B" shape in a workspace:
 *
 *   browser → dashboard edge (wrangler pages dev runs web/dashboard/functions/)
 *           → test vant pod (throwaway brain `devstage`, MCP door on a
 *             sandbox-local port — VANT_PROPERTY_LOCAL_ORIGIN)
 *
 * Why one script: the managed preview runs exactly ONE process tree on ONE
 * port (Freebuff injects PORT). The pod is sandbox-local by design — only
 * the dashboard edge is web-exposed — which is exactly the production
 * topology of a Pages install (public edge, private pod).
 *
 * Modes:
 *   node scripts/dev-stack.js            run the stack (preview command)
 *   node scripts/dev-stack.js --probe    self-test: boot pod, probe the door
 *                                        face (/health, /mcp/tools, /mcp/exec),
 *                                        answer JSON, shut down, exit 0/1
 *
 * Gotchas this script encodes (all verified against the code):
 *   - The dashboard bridge strips /api and forwards to the pod door, which
 *     serves GET /mcp/tools, POST /mcp/exec, GET /mcp/events, GET /health.
 *   - `vant headless` boots the real pod (issue #187): MCP door + REST
 *     health listener; VANT_MCP_PORT / VANT_SERVER_PORT steer the ports.
 *   - The guest ledger follows the STATE-STACK brain (brain.getCurrentBrain
 *     → models/state.json stack), NOT VANT_BRAIN — so true isolation means
 *     the pod RUNS FROM A SCRATCH CWD with its own state.json (stack:
 *     devstage). No token or runtime write ever lands in the operator brain.
 *   - Edge vars arrive via wrangler -b bindings at REQUEST time (the edge
 *     reads context.env; no code strings — prd-web.md 3.7).
 *   - The token is printed TO STDOUT for the operator (logs) and never
 *     written into repo files; the roster keeps only its SHA-256.
 */
'use strict';

const { spawn, spawnSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BRAIN = 'devstage';                 // throwaway test brain (scratch cwd, below)
const DEV_CWD = path.join(ROOT, '.agent_tmp', 'devpod');
/* ---- PORTS (final layout, verified in-repo) ----
 * The edge binds the INJECTED PORT (Freebuff sets PORT; docs rule: 0.0.0.0).
 * The pod moves OFF 127.0.0.1 entirely: doors bind the 127.0.0.2 alias.
 * Why: verified across every managed restart, the preview runner probes the
 * injected PORT listener for readiness but PUBLISHES the first DIFFERENT
 * listener it finds in the tree — which was always the pod's MCP door — and
 * that door's DNS-rebinding guard then 403ed every public visitor. A
 * 127.0.0.2 bind is still full loopback (the edge can fetch it; local
 * curls work; the e2b per-port proxy routes 127.0.0.1 only), so the pod
 * stays invisible to the runner's discovery AND unreachable from the web
 * no matter which port the runner publishes. */
const EDGE_PORT = Number(process.env.PORT || process.env.VANT_DEV_EDGE_PORT || 8788);
const EDGE_BIND = process.env.VANT_DEV_EDGE_BIND || '0.0.0.0';
const POD_HOST = process.env.VANT_DEV_POD_HOST || '127.0.0.2';
const POD_PORT = Number(process.env.VANT_DEV_POD_PORT || 5467);
const REST_PORT = (() => {
    let p = Number(process.env.VANT_DEV_REST_PORT || 5466);
    if (p === POD_PORT) p = p - 1;
    return p;
})();
const PROPERTY = 'local';                 // DEPLOY.md §12 canonical local property id
const ORIGIN = `http://${POD_HOST}:${POD_PORT}`;

const wantProbe = process.argv.includes('--probe');

// Fresh per-boot relay gate secret for the preview (crypto.randomBytes,
// 32-byte hex — the same shape pod-side secrets use). Only steering env
// (VANT_DEV_RELAY_GATE) pins a stable value across boots; otherwise every
// boot mints a fresh secret. Never committed, never a constant.
const nodeCrypto = require('crypto');
const RELAY_GATE_KEY = process.env.VANT_DEV_RELAY_GATE || nodeCrypto.randomBytes(32).toString('hex');

function log(...a) { console.log('[dev-stack]', ...a); }


/** Scratch install: its own cwd so the state-stack brain resolves to
 *  devstage every process (door, CLI, boots) — the real repo state.json
 *  stack (the operator's brains) is NEVER touched. */
function ensureScratchCwd() {
    fs.mkdirSync(path.join(DEV_CWD, 'models', 'private'), { recursive: true });
    const stateFile = path.join(DEV_CWD, 'models', 'state.json');
    if (!fs.existsSync(stateFile)) {
        fs.writeFileSync(stateFile, JSON.stringify({ stack: [BRAIN] }, null, 2) + '\n');
    }
    return DEV_CWD;
}

function podEnv() {
    return Object.assign({}, process.env, {
        VANT_MCP_PORT: String(POD_PORT),
        VANT_MCP_BIND: POD_HOST,
        VANT_SERVER_PORT: String(REST_PORT),
        VANT_SERVER_BIND: POD_HOST,
    });
}

/** Fresh single-use-for-this-boot guest token (fresh roster, human role). */
function freshToken() {
    ensureScratchCwd();
    const ledger = path.join(DEV_CWD, 'models', 'private', BRAIN, '.guests.json');
    try { fs.unlinkSync(ledger); } catch (e) { /* no roster yet: fine */ }
    const r = spawnSync(process.execPath,
        [path.join(ROOT, 'bin', 'vant.js'), 'guest', 'issue',
         '--name', 'devstack-human', '--role', 'human'],
        { cwd: DEV_CWD, encoding: 'utf8', timeout: 60000, env: podEnv() });
    const out = (r.stdout || '') + (r.stderr || '');
    const m = out.match(/vguest_[0-9a-f]+_[0-9a-f]+/);
    if (!m) throw new Error('guest issue failed: ' + out.slice(-300));
    return m[0];
}

function get(url, opts) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, Object.assign({ timeout: 4000 }, opts || {}), res => {
            let body = '';
            res.on('data', c => { body += c; });
            res.on('end', () => resolve({ status: res.statusCode, body }));
        });
        req.on('timeout', () => { req.destroy(new Error('timeout')); });
        req.on('error', reject);
    });
}

function post(url, payload, headers) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(payload);
        const req = http.request(url, {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }, headers || {}),
            timeout: 15000,
        }, res => {
            let body = '';
            res.on('data', c => { body += c; });
            res.on('end', () => resolve({ status: res.statusCode, body }));
        });
        req.on('timeout', () => { req.destroy(new Error('timeout')); });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

let pod = null;

/* Why not spawn vant.js directly: on a managed restart the preview runner
 * kills the process tree with a hard kill — the pod under `vant headless`
 * then SURVIVES orphaned, keeps its port, and the preview runner adopts
 * that surviving port as the public preview port (every restart showed the
 * pod's port as previewPort after the edge died cleanly). When the pod is
 * the adopted public port, its DNS-rebinding guard 403s every visitor —
 * the report that started this fix. A wrapper watches the WAITING side:
 * if it is orphaned (ppid -> 1) it kills the pod and exits, so the port is
 * always freed first. */
const POD_WRAPPER = [
    'const { spawn } = require("child_process");',
    'const vant = process.argv[1], wantCwd = process.argv[2];',
    'const child = spawn(process.execPath, [vant, "headless"], {',
    '  cwd: wantCwd, env: process.env, stdio: ["ignore", "inherit", "inherit"],',
    '});',
    'const rel = () => { try { child.kill("SIGTERM"); } catch (e) {} setTimeout(() => process.exit(0), 1500); };',
    'process.on("SIGTERM", rel); process.on("SIGINT", rel);',
    'setInterval(() => { if (process.ppid === 1) rel(); }, 400);',
    'child.on("exit", (c) => process.exit(c === null ? 0 : c));',
].join("\n");

function bootPod(token) {
    ensureScratchCwd();
    pod = spawn(process.execPath, ['-e', POD_WRAPPER,
        path.join(ROOT, 'bin', 'vant.js'), DEV_CWD,], {

        cwd: ROOT,
        env: podEnv(),
        stdio: ['ignore', 'inherit', 'inherit'],
    });
    pod.on('error', e => { log('pod failed to spawn:', e.message); process.exit(1); });
    log(`test pod booting (scratch cwd .agent_tmp/devpod, brain "${BRAIN}", MCP door ${POD_PORT}, REST ${REST_PORT}, sandbox-local, orphan-guarded)`);
    return token;
}

async function waitReady(ms) {
    const deadline = Date.now() + (ms || 30000);
    while (Date.now() < deadline) {
        if (pod && pod.exitCode !== null) throw new Error('pod exited early with code ' + pod.exitCode);
        try {
            const r = await get(`http://${POD_HOST}:${POD_PORT}/health`);
            if (r.status === 200) return true;
        } catch (e) { /* not up yet */ }
        await new Promise(res => setTimeout(res, 700));
    }
    throw new Error('pod did not become ready');
}

/** The managed preview auto-detects its public port from the FIRST listener
 *  it sees. The pod was winning that race (it binds in seconds, wrangler
 *  compiles first), so the platform advertised the POD port — and the pod
 *  door's DNS-rebinding guard 403'd every public visitor. The edge is the
 *  public face by design; bind it FIRST and let the pod follow. */
async function waitEdgeReady(ms) {
    const deadline = Date.now() + (ms || 45000);
    while (Date.now() < deadline) {
        try {
            await get(`http://127.0.0.1:${EDGE_PORT}/`);
            return true; // any HTTP answer = the listener is up
        } catch (e) { /* compiling / not bound yet */ }
        await new Promise(res => setTimeout(res, 500));
    }
    throw new Error('dashboard edge did not become ready on ' + EDGE_PORT);
}

function killPod() {
    if (pod && pod.exitCode === null) {
        try { pod.kill('SIGTERM'); } catch (e) { /* best effort */ }
    }
    pod = null;
}

/* ---------------- probe (self-test) ---------------- */

async function probe() {
    const verdict = { pod_ready: false, tools: null, exec: null, token_ok: null };
    let token = null;
    try { token = freshToken(); } catch (e) { verdict.token_ok = 'issue failed: ' + e.message; }
    bootPod(token);
    try {
        await waitReady();
        verdict.pod_ready = true;
        if (token) {
            const bearer = { Authorization: 'Bearer ' + token };
            const tools = await get(`http://${POD_HOST}:${POD_PORT}/mcp/tools`, { headers: bearer });
            verdict.tools = { status: tools.status, count: (tools.body.match(/"name"/g) || []).length };
            const exec = await post(`http://${POD_HOST}:${POD_PORT}/mcp/exec`,
                { tool: 'brain_read', args: { name: 'identity' } }, bearer);
            verdict.exec = { status: exec.status, head: exec.body.slice(0, 160) };
            // token truth: the same call WITHOUT the token answers per the
            // door posture (requireKey off = local companion posture, an
            // open door; on = typed 401 for a bare unauthenticated call)
            const bare = await post(`http://${POD_HOST}:${POD_PORT}/mcp/exec`, { tool: 'brain_read', args: { name: 'identity' } }, {});
            verdict.token_ok = { bare_exec_status: bare.status };
        }
    } catch (e) {
        verdict.error = e.message;
    } finally {
        killPod();
    }
    console.log(JSON.stringify(verdict, null, 2));
    process.exit(verdict.pod_ready && verdict.tools && verdict.tools.status === 200 ? 0 : 1);
}

/* ---------------- run (preview) ---------------- */

let wrangler = null;

function bootWrangler() {
    const args = [
        '--yes', 'wrangler@4', 'pages', 'dev',
        'dist',
        '--cwd', path.join(ROOT, 'web', 'dashboard'),
        '--ip', EDGE_BIND, '--port', String(EDGE_PORT),
        '--compatibility-date', new Date().toISOString().slice(0, 10),
        '-k', 'BOLETE_KV',
        '-b', `VANT_PROPERTY_${PROPERTY.toUpperCase()}_ORIGIN=${ORIGIN}`,
        '-b', `VANT_PROPERTY_${PROPERTY.toUpperCase()}_NAME=Devstage pod (test)`,
        // test-scope posture opt-in: rides the same EDGE_ENV_KEYS.enabled
        // contract the kit vendors. In production this stays OFF until the
        // operator opts in via Pages settings — this is preview-only.
        // The gate secret is FRESH PER BOOT (crypto.randomBytes hex, the
        // repo's own token-alphabet posture): no placeholder string ever
        // sits in code; an external relay sender would take it from the
        // boot logs like any operator takes their Pages env value.
        '-b', 'VANT_RELAY_ENABLED=1',
        '-b', `VANT_RELAY_GATE_KEY=${RELAY_GATE_KEY}`,
    ];
    wrangler = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, {
        cwd: path.join(ROOT, 'web', 'dashboard'),
        stdio: ['ignore', 'inherit', 'inherit'],
        env: process.env,
    });
    wrangler.on('error', e => {
        log('wrangler failed to launch:', e.message);
        log('(needs network on first run to fetch wrangler; retry)');
        process.exit(1);
    });
    log(`dashboard edge starting on ${EDGE_BIND}:${EDGE_PORT} (property "${PROPERTY}" → ${ORIGIN})`);
}

function shutdown() {
    for (const [label, child] of [['wrangler', wrangler], ['pod', pod]]) {
        if (child && child.exitCode === null) {
            try { child.kill('SIGTERM'); } catch (e) { /* best effort */ }
        }
    }
}

let shuttingDown = false;
function onSignal() {
    if (shuttingDown) process.exit(0);
    shuttingDown = true;
    log('stack shutting down...');
    shutdown();
    setTimeout(() => process.exit(0), 1500);
}
process.on('SIGINT', onSignal);
process.on('SIGTERM', onSignal);
process.on('exit', shutdown);

async function run() {
    bootWrangler();
    await waitEdgeReady(60000);
    // The managed preview publishes the port of the FIRST `http://localhost:<port>`
    // URL printed in the preview output (verified across six restarts: it always
    // adopted the pod banner's "API: http://localhost:<podMCP>/tools" line, the
    // only localhost URL wrangler's own "Ready on 0.0.0.0:" banner lacks). Print
    // the edge's localhost URL FIRST so the public link is the dashboard edge,
    // not the pod door (whose rebinding guard 403s public visitors).
    console.log('[dev-stack] preview: http://localhost:' + EDGE_PORT + '/ (dashboard edge — public)');
    const token = freshToken();
    bootPod(token);
    await waitReady(45000);
    log('pod ready — pairing the dashboard:');
    log('');
    console.log('┌──────────────────────────────────────────────────');
    console.log('│ GUEST TOKEN (human role, test brain, shown once):');
    console.log('│   ' + token);
    console.log('│   → the dashboard AuthGate ("paste your guest token")');
    console.log('└──────────────────────────────────────────────────');
    log('');
    // The managed preview owns readiness from here; wrangler streams its
    // own logs. Stay alive until the preview (or an operator) stops us.
}

(async () => {
    if (wantProbe) await probe();
    else await run();
})().catch(e => {
    console.error('[dev-stack] fatal:', e.message);
    killPod();
    process.exit(1);
});
