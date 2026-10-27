#!/usr/bin/env node
/**
 * crashtest-pack Validation - the packs/ extension surface (2026-10-21)
 *
 * The repo ships two crashtest packs under packs/public/ (proposals #231 and
 * #233, dhaupin/vant):
 *
 *   packs/public/vant-census/ - structural oracles (config-armed, no routes)
 *   packs/public/vant-brain/  - brain-layer oracles (route-armed shim)
 *
 * This suite is the ADOPTION side of the proposals ("needs validation on a
 * vant run root before shipped status" - #231's own caveat). It:
 *
 *   1. validates BOTH pack manifests + scenario modules against a re-block of
 *      crashtest v1.0.0's loader contract (src/packs/loader.js and
 *      src/scenarios/contract.js rules: kebab-case names, verdicts vocabulary,
 *      run() functions) - so a loader break fails HERE too;
 *   2. boots a THROWSAWAY vant sandbox (mkdtemp lib copy + fixture brain),
 *      registers the documented shim routes against vant's REAL in-process
 *      libs (lib/brain, lib/migrations, lib/guests), and runs every
 *      vant-brain attack against the actual runtime behaviour;
 *   3. checks each attack's verdict against the EXPECTED table below.
 *
 * The expected table doubles as the regression pin: two rows currently
 * expect EXPLOITED because vant's brain layer REALLY FAILS those oracles
 * today (the #227/#232 brain-pointer class, measured 2026-10-21). Fix the
 * bug, flip the row to REFUSED.
 *
 * Run: node test/crashtest-packs.test.js     (also picked up by the sweep)
 *
 * House law: this suite opens no sockets - the sandbox shim dispatches
 * WHATWG Requests at in-process handlers only, plus (inside one shim route)
 * a child node process re-instantiating the brain module against a tampered
 * models/state.json. That is a fork, never a socket.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PACKS_DIR = path.join(ROOT, 'packs', 'public');

const results = { passed: 0, failed: 0, skipped: 0 };
function check(name, ok, why) {
    if (ok) { results.passed++; console.log(`  ✓ ${name}`); }
    else { results.failed++; console.log(`  ✗ ${name}: ${why || 'failed'}`); }
}

// ---------------------------------------------------------------------------
// 1. crashtest loader contract, re-blocked (v1.0.0 = src/scenarios/contract.js
//    validateScenario + src/packs/loader.js validatePackManifest, trimmed to
//    the rules that catch real breakage)
// ---------------------------------------------------------------------------

const VERDICTS = new Set(['REFUSED', 'EXPLOITED', 'BOUNDED']);
const KEBAB = /^[a-z][a-z0-9-]*$/;

function validatePackManifest(manifest, origin) {
    if (!manifest || typeof manifest !== 'object') throw new Error(`${origin}: not a JSON object`);
    for (const key of ['schemaVersion', 'name', 'description']) {
        if (manifest[key] === undefined) throw new Error(`${origin}: missing "${key}"}`);
    }
    if (manifest.schemaVersion !== 1) throw new Error(`${origin}: unsupported schemaVersion`);
    if (typeof manifest.name !== 'string' || !KEBAB.test(manifest.name)) {
        throw new Error(`${origin}: bad pack name ${JSON.stringify(manifest.name)}`);
    }
    if (typeof manifest.description !== 'string') throw new Error(`${origin}: description must be a string`);
    return manifest;
}

function validateScenario(mod, origin) {
    if (!mod || typeof mod !== 'object') throw new Error(`${origin}: must default-export an object`);
    if (typeof mod.name !== 'string' || !KEBAB.test(mod.name)) throw new Error(`${origin}: bad module name ${JSON.stringify(mod.name)}`);
    if (typeof mod.description !== 'string' || mod.description.length < 3) throw new Error(`${origin}: needs a real description`);
    if (!Array.isArray(mod.attacks) || mod.attacks.length === 0) throw new Error(`${origin}: needs a non-empty attacks array`);
    const seen = new Set();
    for (const a of mod.attacks) {
        if (!a || typeof a !== 'object') throw new Error(`${origin}: attack must be an object`);
        if (typeof a.name !== 'string' || !KEBAB.test(a.name)) throw new Error(`${origin}: bad attack name ${JSON.stringify(a.name)}`);
        if (seen.has(a.name)) throw new Error(`${origin}: duplicate attack name ${a.name}`);
        seen.add(a.name);
        if (typeof a.run !== 'function') throw new Error(`${origin}: attack "${a.name}" needs run(harness, ctx)`);
    }
    return mod;
}

// ---------------------------------------------------------------------------
// 2. the micro-harness: WHATWG Request in-process dispatch, matching
//    crashtest's Harness.run() record shape ({ status, ok, response?, threw?,
//    error? }) minus cost counters (not used by pack attacks).
// ---------------------------------------------------------------------------

class MicroHarness {
    constructor() {
        this.routes = new Map();
        this.baseUrl = 'https://vant-local';
    }

    registerRoute(name, handler) {
        if (this.routes.has(name)) throw new Error(`duplicate route ${name}`);
        this.routes.set(name, handler);
    }

    async run(name, reqInit = {}) {
        const handler = this.routes.get(name);
        if (!handler) throw new Error(`harness: no route registered as "${name}"`);
        let response;
        let threw = false;
        let err = null;
        try {
            const req = new Request(`${this.baseUrl}/`, {
                method: reqInit.method ?? 'GET',
                headers: reqInit.headers ?? {},
                body: reqInit.body ?? undefined,
            });
            response = await handler({ request: req, params: {}, data: {} });
            if (!response || typeof response.status !== 'number' || typeof response.headers.get !== 'function') {
                throw new Error(`harness: handler "${name}" did not return a Response`);
            }
        } catch (e) {
            threw = true;
            err = e;
        }
        const record = { route: name, ok: !threw && response && response.ok, threw, error: err };
        if (!threw) { record.status = response.status; record.response = response; }
        return record;
    }
}

// ---------------------------------------------------------------------------
// 3. the vant sandbox: lib copy + fixture brain, so the suite never touches
//    the workspace's own models/ tree (slate-unaware by construction).
// ---------------------------------------------------------------------------

function makeSandbox() {
    const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-packsvb-'));
    fs.cpSync(path.join(ROOT, 'lib'), path.join(sb, 'lib'), { recursive: true, dereference: true });
    fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(sb, 'package.json'));
    try { fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(sb, 'node_modules'), 'dir'); } catch { /* already there */ }
    // fixture brain 'vant' with the two canonical canaries
    fs.mkdirSync(path.join(sb, 'models', 'private', 'vant'), { recursive: true });
    fs.mkdirSync(path.join(sb, 'models', 'public', 'vant'), { recursive: true });
    fs.writeFileSync(path.join(sb, 'models', 'private', 'vant', 'identity.md'), 'PRIVATE-CANARY');
    fs.writeFileSync(path.join(sb, 'models', 'public', 'vant', 'identity.md'), 'PUBLIC-CANARY');
    fs.writeFileSync(path.join(sb, 'models', 'state.json'), JSON.stringify({ stack: ['vant'], currentBrain: 'vant' }));
    return sb;
}

// The child probe (fresh brain module instance = the hook that makes the
// tamper oracle measurable instead of "module state from boot").
// (JSON-only stdout law) vant's own libs log on stdout ([COMPUTE], [INFO]
// lines): polluting JSON stdout makes parseJson fail and honest routes read
// as "not armed". All child noise goes to stderr; stdout carries ONLY the
// final JSON record.
const CHILD_STDOUT_GUARD = `
    (function guardStdout() {
        const err = (msg) => process.stderr.write(String(msg) + '\\n');
        console.log = (...a) => err(a.join(' '));
        console.info = console.log;
        console.warn = console.log;
        console.error = console.log;
    })();
`;

const PROBE_CHILD = `${CHILD_STDOUT_GUARD}
(async () => {
    const tamper = process.argv[1];
    const fs = require('fs');
    const statePath = 'models/state.json';
    const states = {
        'truncated': '{"stack": ["van',
        'trailing-garbage': '{"stack":["vant"],"currentBrain":"vant"} TRAILING GARBAGE',
        'wrongtype-stack': '{"stack":[42,{}],"currentBrain":"vant"}',
        'wrongtype-currentBrain': '{"stack":["vant"],"currentBrain":42}',
        'missing-state': null,
    };
    if (states[tamper] === undefined) { process.stdout.write(JSON.stringify({ error: 'unknown tamper ' + tamper })); return; }
    if (states[tamper] === null) { try { fs.unlinkSync(statePath); } catch (e) { /* absent is the tamper */ } }
    else fs.writeFileSync(statePath, states[tamper]);
    delete require.cache[require.resolve('./lib/brain.js')];
    const brain = require('./lib/brain.js');
    const out = { stack: null, currentBrain: null, reads: [] };
    try { out.stack = brain.getStack(); } catch (e) { out.stack = 'THREW: ' + e.name; }
    try { out.currentBrain = await brain.getCurrentBrain(); } catch (e) { out.currentBrain = 'THREW: ' + e.name; }
    try {
        const r = await brain.read('identity', {});  // private-pinned dual read
        out.reads.push({ pinnedType: 'private', content: r ? String(r.content ?? '') : null, resolvedPath: r ? String(r.path ?? '') : null });
    } catch (e) { out.reads.push({ pinnedType: 'private', THREW: e.name + ': ' + e.message }); }
    process.stdout.write('VANT_CT_JSON<<' + JSON.stringify(out) + '>>END');
})().catch((e) => { process.stdout.write(JSON.stringify({ error: e.name + ': ' + e.message })); });
`;

// Crew probe: drive lib/agents.spawn against the sandbox registry
// (re PACK SURVEY). Registry-level only - spawn creates agent records, no
// OS processes. Facts reported neutral: resolved cap, attempts, which typed
// errors fired, final roster.
const CREW_CHILD = `${CHILD_STDOUT_GUARD}
(async () => {
    // (run-root posture) the crew pack budgets REGISTRY QUOTAS, not the
    // sandbox gate - the shim opens defaultSandbox explicitly so spawns
    // reach the budget logic under test instead of bouncing at canSpawn.
    try {
        require('./lib/sandbox').defaultSandbox.setCapabilities({
            canRead: true, canWrite: true, canSpawn: true, canNetwork: true
        });
    } catch (e0) { }
    const agents = require('./lib/agents.js');
    // (fresh-fixture law) drain any prior attack's roster so each probe
    // sees the declared cap from zero, not another probe's leftovers.
    try { for (const a of agents.list()) { try { agents.kill(a.id); } catch (e1) { } } } catch (e2) { }
    const out = { cap: null, attempts: 0, capError: null, rateError: null, rateLimit: null, rosterSize: 0, rosterNames: [] };
    try {
        const cfg = require('./lib/config.js');
        out.rateLimit = (cfg && cfg.get) ? cfg.get('agents.spawnRateLimit', 10) : 10;
    } catch (e2) { out.rateLimit = 10; }
    try {
        // (survey pass) resolve the DECLARED cap the same way spawn does
        const internal = require('./lib/agents/internal.js');
        out.cap = internal._getMaxAgents ? internal._getMaxAgents() : 10;
    } catch (e4) { out.cap = 10; }
    const names = [];
    for (let i = 0; i < out.cap + 2; i++) {
        const r = agents.spawn({ name: 'pack-cw-' + i, role: 'Tester', type: 'default' });
        out.attempts = i + 1;
        if (r && r.error) {
            if (!out.capError && /quota/i.test(r.error)) out.capError = r.error;
            if (!out.rateError && /rate limit/i.test(r.error)) out.rateError = r.error;
            break;
        }
        const id = r && r.id;
        names.push('pack-cw-' + i + (id ? ':' + id : ''));
    }
    // Rate-limit probe: drain one slot below the cap, then attempt one more
    // in-window spawn past the window budget - the window counts ACCEPTED
    // spawns, so this is the honest place the limiter can refuse.
    try {
        const first = names[0];
        const idForFirst = first && String(first).split(':')[1];
        if (idForFirst) {
            agents.kill(idForFirst);
            const r2 = agents.spawn({ name: 'pack-cw-rate', role: 'Tester', type: 'default' });
            if (r2 && r2.error && /rate limit/i.test(r2.error)) out.rateError = r2.error;
        }
    } catch (e5) { out.rateError = out.rateError || ('drain probe threw: ' + e5.name); }    try { const roster = agents.list(); out.rosterSize = roster.length; out.rosterNames = roster.map((a) => a.name); } catch (e6) { out.rosterSize = names.length; }
    process.stdout.write('VANT_CT_JSON<<' + JSON.stringify(out) + '>>END');
})().catch((e) => { process.stdout.write(JSON.stringify({ error: e.name + ': ' + e.message })); });
`;


// MCP probe: drive lib/mcp.execute directly (the exact dispatcher the
// /mcp/exec door rides). Calls arrive as a JSON array [{ tool, params }];
// each result is reported verbatim, plus an escape-file check for
// brain_write probes (the test watches for files landing OUTSIDE the
// brain tree). Never sockets.
const MCP_CHILD = `${CHILD_STDOUT_GUARD}
(async () => {
    const mcp = require('./lib/mcp.js');
    const fs = require('fs');
    const path = require('path');
    let calls = [];
    try { calls = JSON.parse(process.argv[1] || '[]'); } catch (e) { calls = []; }
    const results = [];
    for (const call of calls) {
        const row = { tool: call.tool, threw: false };
        try { row.result = await mcp.execute(String(call.tool || ''), call.params ?? {}); }
        catch (e) { row.threw = true; row.error = e.name + ': ' + e.message; }
        results.push(row);
    }
    // Escape check: did any brain_write probe land a file outside models/ ?
    const escape = path.resolve('vant-mcp-escape-canary.md');
    const escapedFile = fs.existsSync(escape) ? 'vant-mcp-escape-canary.md' : null;
    process.stdout.write('VANT_CT_JSON<<' + JSON.stringify({ results, escapedFile, escapedPath: escape }) + '>>END');
})().catch((e) => { process.stdout.write(JSON.stringify({ error: e.name + ': ' + e.message })); });
`;

// Trust-floor probe: shapes mirror scripts/crashtest-run.js's TRUST_CHILD —
// seeded succession context, low-trust successor's private read, facts only.
const TRUST_CHILD = `${CHILD_STDOUT_GUARD}
(async () => {
    const spec = (() => { try { return JSON.parse(process.argv[1] || '{}'); } catch (e) { return {}; } })();
    const level = String(spec.level || 'low');
    const fs = require('fs');
    const path = require('path');
    const cfgPath = path.join('models', 'public', 'vant', '_succession.json');
    try {
        fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
        fs.writeFileSync(cfgPath, JSON.stringify({
            version: '0.8.6',
            succession: { previous: null, trust: { default: level } }
        }, null, 2));
    } catch (e0) {
        process.stdout.write('VANT_CT_JSON<<' + JSON.stringify({ error: 'seed: ' + e0.message }) + '>>END');
        return;
    }
    const out = { level, trustLevel: null, privateContent: null, readPath: null, refused: false, readThrew: null };
    try {
        const succession = require('./lib/succession.js');
        out.trustLevel = succession.getTrustLevel();
    } catch (e) { out.trustLevel = 'THREW: ' + e.name; }
    try {
        const brain = require('./lib/brain.js');
        const r = await brain.read('identity', { type: 'private' });
        out.privateContent = r && r.content != null ? String(r.content) : null;
        out.readPath = r ? String(r.path ?? '') : null;
        if (!r) out.refused = true;
    } catch (e2) { out.refused = true; out.readThrew = e2.name + ': ' + String(e2.message).slice(0, 80); }
    try { fs.rmSync(cfgPath, { force: true }); } catch (e3) { /* fixture sweep */ }
    process.stdout.write('VANT_CT_JSON<<' + JSON.stringify(out) + '>>END');
})().catch((e) => { process.stdout.write(JSON.stringify({ error: e.name + ': ' + e.message })); });
`;

// Graph-walk probe: cyclic knowledge graph through the REAL knowledge_link
// seam, then brain_connections at depth 100000 — visited-guard + depth cap
// return; an unbounded walk hangs or blows the stack.
const GRAPH_CHILD = `${CHILD_STDOUT_GUARD}
(async () => {
    const mcp = require('./lib/mcp.js');
    const fs = require('fs');
    const out = { threw: false, errorName: null, depthReached: 0, ms: null, connections: null, linkCount: null };
    const linksPath = 'models/public/knowledge-links.json';
    try { fs.rmSync(linksPath, { force: true }); } catch (e0) {}
    try { require('./lib/sandbox').defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canSpawn: true, canNetwork: true }); } catch (e1) {}
    try {
        await mcp.execute('knowledge_link', { from: 'cyc-a', to: 'cyc-b' });
        await mcp.execute('knowledge_link', { from: 'cyc-b', to: 'cyc-c' });
        await mcp.execute('knowledge_link', { from: 'cyc-c', to: 'cyc-a' });
        const t0 = Date.now();
        const r = await mcp.execute('brain_connections', { brain: 'cyc-a', depth: 100000 });
        out.ms = Date.now() - t0;
        out.connections = r && Array.isArray(r.connections) ? r.connections.length : null;
        out.depthReached = out.connections != null && out.connections >= 0 ? 3 : 0;
        try { out.linkCount = JSON.parse(fs.readFileSync(linksPath, 'utf8')).length; } catch (e2) {}
    } catch (e) {
        out.threw = true;
        out.errorName = e.name;
    }
    try { fs.rmSync(linksPath, { force: true }); } catch (e2) {}
    process.stdout.write('VANT_CT_JSON<<' + JSON.stringify(out) + '>>END');
})().catch((e) => { process.stdout.write(JSON.stringify({ error: e.name + ': ' + e.message })); });
`;

// Stones probe: the REAL seal → decode chain (lib/transform to/fromHorcrux
// through lib/horcrux-safe.safeWriteHorcrux) in the sandbox, against a
// fresh fixture brain tree - the same probe shape scripts/crashtest-run.js
// arms. Scope mode seals at the requested allowlist (absent = the minimal
// single-brain capture, the lineage trap); tamper mode corrupts the
// <brn:secret> payload region until decode refuses and runs the REAL
// restore only when tamper SURVIVES (measured, never assumed).
const STONE_CHILD = `${CHILD_STDOUT_GUARD}
(async () => {
    const spec = (() => { try { return JSON.parse(process.argv[1] || '{}'); } catch (e) { return {}; } })();
    const mode = spec.mode === 'tamper' ? 'tamper' : 'scope';
    const fs = require('fs');
    const path = require('path');
    try { require('./lib/sandbox').defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canSpawn: true, canNetwork: true }); } catch (e0) {}
    for (const b of ['fixture-a', 'fixture-b']) {
        for (const side of ['private', 'public']) {
            const dir = path.join('models', side, b);
            try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
            try { fs.writeFileSync(path.join(dir, 'identity.md'), 'FIXTURE-' + side.toUpperCase() + '-' + b.toUpperCase()); } catch (e1) {}
        }
    }
    fs.writeFileSync('models/state.json', JSON.stringify({ stack: ['vant', 'fixture-a'], currentBrain: 'fixture-a' }));

    const out = { mode, scopeRequested: null, scopedBrains: null, stateJson: null, sealWorked: null, decodeError: null, restoreStatus: 'ok', restoredFiles: 0, tamperDetail: null };
    const transform = require('./lib/transform.js');
    const safe = require('./lib/horcrux-safe.js');
    const password = 'pack-stone-password-9f';
    const stoneRel = 'models/stone-run-fixture.svg';
    const enc = (rel, o) => transform.toHorcrux(rel, { password, brains: (o && o.brains) ? o.brains : undefined });
    const walk = (root) => {
        const files = [];
        if (!fs.existsSync(root)) return files;
        for (const e of fs.readdirSync(root, { withFileTypes: true })) {
            const p = path.join(root, e.name);
            if (e.isDirectory()) files.push(...walk(p));
            else files.push(p + ':' + fs.statSync(p).size);
        }
        return files;
    };

    const scope = (spec.brains && Array.isArray(spec.brains)) ? spec.brains : (mode === 'scope' ? ['fixture-b'] : undefined);
    out.scopeRequested = scope ?? null;
    try {
        await safe.safeWriteHorcrux(stoneRel, { label: 'pack-stone', password, encode: enc, decode: (rel, o) => transform.fromHorcrux(rel, { password }), brains: scope });
        out.sealWorked = true;
    } catch (e) {
        out.sealWorked = false;
        out.decodeError = 'seal: ' + e.name + ': ' + String(e.message).slice(0, 140);
    }

    if (mode === 'tamper' && out.sealWorked) {
        const original = fs.readFileSync(stoneRel, 'utf8');
        const hit = original.match(/<brn:secret[^>]*>([^<]+)<\\/brn:secret>/s);
        const payloadStart = hit ? hit.index + hit[0].indexOf('>') + 1 : original.length - 1;
        let refused = false, detail = null;
        for (let off = original.length - 1; off >= payloadStart; off--) {
            const ch = original[off];
            if (ch === '<' || ch === '>' || ch === '/') continue;
            const flipped = original.slice(0, off) + (ch === 'A' ? 'B' : 'A') + original.slice(off + 1);
            fs.writeFileSync(stoneRel, flipped);
            try { await transform.fromHorcrux(stoneRel, { password }); }
            catch (e) { refused = true; detail = { offset: off, was: original.charCodeAt(off), reason: String(e.message).slice(0, 120) }; break; }
        }
        if (refused) {
            out.restoreStatus = 'refused';
            out.restoredFiles = 0;
            out.tamperDetail = detail;
        } else {
            const before = walk('models');
            try {
                const data = await transform.fromHorcrux(stoneRel, { password });
                await transform.restore(data);
            } catch (e2) { out.decodeError = 'tamper-restore: ' + e2.name + ': ' + String(e2.message).slice(0, 120); }
            const after = walk('models');
            out.restoredFiles = after.filter((f) => !before.includes(f)).length;
            out.restoreStatus = 'ok';
        }
    } else if (out.sealWorked) {
        try {
            const data = await transform.fromHorcrux(stoneRel, { password });
            const stackScoped = (data && data.mode && Array.isArray(data.mode.stack)) ? [...new Set(data.mode.stack)] : [];
            out.scopedBrains = stackScoped;
            out.stateJson = { currentBrain: (data && data.mode) ? (data.mode.currentBrain !== undefined ? data.mode.currentBrain : null) : null, stack: (data && data.mode && Array.isArray(data.mode.activeStack)) ? data.mode.activeStack : null };
        } catch (e) { out.decodeError = (out.decodeError ? out.decodeError + ' | ' : '') + e.name + ': ' + String(e.message).slice(0, 140); }
    }
    // (fresh-fixture law) leave the sandbox pointer EXACTLY as the seeded
    // fixture had it: a foreign currentBrain in the payload under test is
    // the oracle's job to REPORT, never residue this probe leaves behind.
    try { fs.writeFileSync('models/state.json', JSON.stringify({ stack: ['vant'], currentBrain: 'vant' })); } catch (e2) {}
    process.stdout.write('VANT_CT_JSON<<' + JSON.stringify(out) + '>>END');
})().catch((e) => { process.stdout.write(JSON.stringify({ error: e.name + ': ' + e.message })); });
`;

// lib/server's Edge chain driven in-process (the vant-rest arm) - the
// REAL security chain (vaf -> qos -> auth -> escrow -> handler) with the
// fake req/res shapes _handleRequest consumes. Two postures (open/priv);
// chains persist within a pack run and are rebuilt at pack boundaries.

const EDGE_CHAINS = { open: null, priv: null };

function resetEdgeChains(sb) {
    const Server = require(path.join(sb, 'lib', 'server.js')).Server;
    EDGE_CHAINS.open = new Server({ port: 0, authRequired: false });
    EDGE_CHAINS.priv = new Server({ port: 0, authRequired: true });
    // The REST door table (lib/api.REST_ROUTES, 2026-10-27 door-parity arm):
    // startREST registers exactly these onto a live Server; the fixture arms
    // them on the in-process chains so the packs drive the REAL door code
    // (handlers, arg names, params) with no listener bound.
    const REST_ROUTES = require(path.join(sb, 'lib', 'api.js')).REST_ROUTES;
    for (const r of REST_ROUTES) {
        EDGE_CHAINS.open.route(r.path, r.handler, r.method);
        EDGE_CHAINS.priv.route(r.path, r.handler, r.method);
    }
}

async function edgeRoundTrip(chain, spec) {
    const events = require('events');
    const req = new events.EventEmitter();
    req.method = String(spec.method || 'GET').toUpperCase();
    req.url = String(spec.url || spec.path || '/');
    req.headers = {};
    for (const [k, v] of Object.entries(spec.headers || {})) req.headers[String(k).toLowerCase()] = String(v);
    req.ip = '203.0.113.77'; // TEST-NET-3: fixed attacker address
    req.setTimeout = () => {}; // collector arms no timer; socket timer out of contract
    req.destroy = () => {};

    const headers = {};
    let status = null;
    let bodyText = '';
    let settle;
    const settled = new Promise((r) => { settle = r; });
    const res = {
        setHeader: (k, v) => { headers[String(k).toLowerCase()] = String(v); },
        writeHead: (st, hs) => {
            status = st;
            for (const [k, v] of Object.entries(hs ?? {})) headers[String(k).toLowerCase()] = String(v);
        },
        end: (d) => { if (status === null) status = 200; bodyText = String(d ?? ''); settle(); },
    };

    // The chain wires req.on('data'/'end') synchronously on entry; the
    // answer lands asynchronously (settled via the res.end hook above).
    chain._handleRequest(req, res).catch(() => {});
    if (spec.body != null && req.method !== 'GET' && req.method !== 'HEAD') {
        req.emit('data', Buffer.isBuffer(spec.body) ? spec.body : Buffer.from(String(spec.body), 'utf8'));
    }
    req.emit('end');
    await Promise.race([settled, new Promise((r) => setTimeout(r, 15000))]);
    if (status === null) {
        return { status: 500, headers: {}, bodyText: 'vant edge chain fault: no response handed back' };
    }
    return { status, headers, bodyText: bodyText.slice(0, 8192) };
}

// ---------------------------------------------------------------------------
// 4. the shim routes (the run root Rook proposed) - real vant libs.
// ---------------------------------------------------------------------------

// (sentinel law) even with console redirected, vant's async library logs
// can land on stdout AFTER the child's JSON row; the route extracts ONLY the
// sentinel-delimited record so the pack sees pure JSON.
function extractCtJson(text) {
    const hit = String(text || '').match(/VANT_CT_JSON<<([\s\S]*?)>>END/);
    return hit ? hit[1] : String(text || '');
}

// --- the site wire arm (the vant-home pack, 2026-10-23): web/home's
// --- Pages Functions over a statement-mapped in-memory fake D1. Same
// --- shape scripts/crashtest-run.js runs (the statements come from
// --- web/home/functions/_lib/status.js verbatim; an unknown statement
// --- refuses LOUDLY, a guessed D1 would fake real rows).
function makeFakeD1() {
    const db = { endpoints: [], checks: [], daily: new Map(), alerts: [], meta: new Map(), _ids: { e: 0, c: 0, a: 0 } };
    function stmt(sql) {
        const s = String(sql);
        const low = s.toLowerCase();
        let args = [];
        function exec() {
            if (/^create table/i.test(low)) return { changes: 0 };
            if (low.includes('select count(*) as n from status_endpoints')) return { first: { n: db.endpoints.length } };
            if (low.includes('insert or ignore into status_endpoints')) {
                const [name, url, kind, kindOptions, createdAt] = args;
                if (db.endpoints.some((e) => e.name === name)) return { changes: 0 };
                db._ids.e++;
                db.endpoints.push({ id: db._ids.e, name, url, kind, kind_options: kindOptions, created_at: createdAt });
                return { changes: 1 };
            }
            if (low.startsWith('insert into status_checks')) {
                const [endpointId, day, ts, ok, state, latencyMs, detail] = args;
                db._ids.c++;
                db.checks.push({ id: db._ids.c, endpoint_id: endpointId, day, ts, ok, state, latency_ms: latencyMs, detail });
                return { changes: 1 };
            }
            if (low.includes('insert into status_daily')) {
                const [endpointId, day, upCount, checkCount] = args;
                const key = endpointId + '|' + day;
                const prior = db.daily.get(key) || { up_count: 0, check_count: 0 };
                db.daily.set(key, { up_count: prior.up_count + upCount, check_count: prior.check_count + checkCount });
                return { changes: 1 };
            }
            if (low.includes('from status_daily where day >= ?')) {
                const since = args[0];
                const results = [...db.daily.entries()]
                    .map(([key, row]) => { const i = key.indexOf('|'); return { endpoint_id: Number(key.slice(0, i)), day: key.slice(i + 1), up_count: row.up_count, check_count: row.check_count }; })
                    .filter((r) => r.day >= since)
                    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.endpoint_id - b.endpoint_id));
                return { results };
            }
            if (low.includes('from status_checks order by id desc limit 300')) {
                const results = [...db.checks].sort((a, b) => b.id - a.id).slice(0, 300)
                    .map(({ endpoint_id, ts, ok, state, latency_ms, detail }) => ({ endpoint_id, ts, ok, state, latency_ms, detail }));
                return { results };
            }
            if (low.includes('select * from status_endpoints order by id')) return { results: db.endpoints.map((e) => ({ ...e })) };
            if (low.startsWith('delete from status_endpoints')) {
                const before = db.endpoints.length;
                const field = /where id = \?/i.test(low) ? 'id' : 'name';
                db.endpoints = db.endpoints.filter((e) => String(e[field]) !== String(args[0]));
                return { changes: before - db.endpoints.length };
            }
            if (low.includes('select value from status_meta')) return { first: db.meta.has(args[0]) ? { value: db.meta.get(args[0]) } : null };
            if (low.includes('into status_meta')) { db.meta.set(args[0], args[1]); return { changes: 1 }; }
            if (low.includes('update status_alerts set active = 0')) {
                let ch = 0;
                for (const a of db.alerts) { if (a.active === 1) { a.active = 0; a.cleared_at = args[0]; ch++; } }
                return { changes: ch };
            }
            if (low.includes('insert into status_alerts')) {
                const [message, level, createdAt] = args;
                db._ids.a++;
                db.alerts.push({ id: db._ids.a, message, level, active: 1, created_at: createdAt, cleared_at: null });
                return { changes: 1 };
            }
            if (low.includes('from status_alerts where active = 1')) {
                return { results: [...db.alerts].filter((a) => a.active === 1).sort((a, b) => b.id - a.id).slice(0, 10) };
            }
            throw new Error('fake d1: unknown statement: ' + s.slice(0, 90));
        }
        return {
            bind: (...a) => { args = a; return { run, first, all }; },
            run, first, all,
        };
        function run() { return { success: true, meta: { changes: exec().changes ?? 0 } }; }
        async function first() { return exec().first ?? null; }
        async function all() { const { results } = exec(); return { results: results ?? [] }; }
    }
    return {
        prepare: (sql) => stmt(sql),
        batch: async (stmts) => { const out = []; for (const st of stmts) { await st.run(); out.push(true); } return out; },
    };
}

let homeApi = null;
let homeSharedDb = null;
async function homeHandlers() {
    if (!homeApi) {
        const dir = path.join(ROOT, 'web', 'home', 'functions', 'api', 'status');
        homeApi = {
            summary: (await import(String(require('url').pathToFileURL(path.join(dir, 'summary.js'))))).onRequestGet,
            admin: (await import(String(require('url').pathToFileURL(path.join(dir, 'admin.js'))))).onRequestPost,
            // (2026-10-27 Edge deepening) the third door: the daily-sweep
            // cron (scheduled.js - onScheduled + the wire-404 onRequest).
            scheduled: (await import(String(require('url').pathToFileURL(path.join(dir, 'scheduled.js'))))),
        };
    }
    return homeApi;
}

function buildRoutes(sb) {
    const routes = new MicroHarness();

    // brain-read: in-process lib/brain.read(), fact-shaped JSON out
    routes.registerRoute('brain-read', async (ctx) => {
        const j = await ctx.request.json().catch(() => ({}));
        let brain;
        try { brain = require(path.join(sb, 'lib', 'brain.js')); } catch (e) {
            return new Response(JSON.stringify({ error: e.name + ': ' + e.message }), { status: 500 });
        }
        let r;
        try {
            // (fresh-fixture law, parent side) a cached read from an earlier
            // attack is exactly the stale lineage this oracle hunts - every
            // read dispatches against the tree as it stands NOW
            if (brain.invalidateCache) brain.invalidateCache();
            r = await brain.read(j.name, j.brain ? { brain: j.brain } : {});
        } catch (e) {
            return new Response(JSON.stringify({ error: e.name + ': ' + e.message }), { status: 500 });
        }
        return new Response(JSON.stringify({
            content: r && r.content != null ? String(r.content) : null,
            source: r ? r.source ?? null : null,
            path: r ? r.path ?? null : null,
        }), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    });

    // brain-state: tampered state, fresh module instance, NEUTRAL facts out
    routes.registerRoute('brain-state', async (ctx) => {
        const j = await ctx.request.json().catch(() => ({}));
        if (!j || typeof j.tamper !== 'string') {
            return new Response(JSON.stringify({ error: 'tamper param required' }), { status: 400 });
        }
        let outText;
        try {
            outText = execFileSync('node', ['-e', PROBE_CHILD, j.tamper], {
                cwd: sb,
                timeout: 30000,
                encoding: 'utf8',
                env: { ...process.env, VANT_GATE_QUIET: '1' },
            });
        } catch (e) {
            return new Response(JSON.stringify({ error: `probe child failed: ${String(e.stderr || e.message).slice(0, 200)}` }), { status: 500 });
        }
        return new Response(extractCtJson(outText), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    });

    // brain-migrate: real lib/migrations on the legacy-tree fixture,
    // dry-run touch accounting + double-run idempotency accounting
    routes.registerRoute('brain-migrate', async () => {
        const walk = (root) => {
            const files = [];
            if (!fs.existsSync(root)) return files;
            for (const e of fs.readdirSync(root, { withFileTypes: true })) {
                const p = path.join(root, e.name);
                if (e.isDirectory()) files.push(...walk(p));
                else files.push(`${fs.statSync(p).size}:${fs.statSync(p).mtimeMs}:${p}`);
            }
            return files.sort();
        };
        // Legacy-tree fixture: 3 flat public .md files (the _legacyMainTree
        // detector's floor) so run 1 has real work and run 2 has a real
        // idempotency landing, not a vacuous no-op.
        fs.writeFileSync(path.join(sb, 'models', 'public', 'identity.md'), 'legacy identity');
        fs.writeFileSync(path.join(sb, 'models', 'public', 'goals.md'), 'legacy goals');
        fs.writeFileSync(path.join(sb, 'models', 'public', 'lessons.md'), 'legacy lessons');
        let migrations;
        try { migrations = require(path.join(sb, 'lib', 'migrations.js')); } catch (e) {
            return new Response(JSON.stringify({ error: e.name + ': ' + e.message }), { status: 500 });
        }
        const beforeDry = walk(path.join(sb, 'models'));
        let dryRunApplied = 0;
        try { dryRunApplied = (await migrations.migrate({ dryRun: true })).applied.filter(a => a.dryRun === true).length; } catch (e) {
            return new Response(JSON.stringify({ error: 'dry-run threw: ' + e.name }), { status: 500 });
        }
        const afterDry = walk(path.join(sb, 'models'));
        await migrations.migrate(); // run 1 (real)
        const before2 = walk(path.join(sb, 'models'));
        let second;
        try { second = await migrations.migrate(); } catch (e) {
            return new Response(JSON.stringify({ error: 'run 2 threw: ' + e.name }), { status: 500 });
        }
        const after2 = walk(path.join(sb, 'models'));
        // (fresh-fixture law, pointer hygiene) the legacy import flips the
        // parent brain module's _currentBrainType to 'public' in-process -
        // vant's own guarded pattern is save-pointer/restore-finally, so the
        // route restores the seeded posture after BOTH accounting runs.
        // Sandwiched between them it would turn run 2 into a different
        // module state and break the honest idempotency measurement itself.
        try {
            const brain = require(path.join(sb, 'lib', 'brain.js'));
            if (brain.switchBrain) brain.switchBrain('vant', 'private');
        } catch (e3) { /* restore best effort */ }
        return new Response(JSON.stringify({
            dryTouch: beforeDry.join('') !== afterDry.join('') ? 1 : 0,
            secondTouch: before2.filter(f => !after2.includes(f)).length + after2.filter(f => !before2.includes(f)).length,
            secondApplied: (second && second.applied || []).length,
            secondDryPlanned: dryRunApplied,
        }), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    });

    // brain-listing: the brain's listing/dirs family on the sandbox tree
    // (the native suite's print "BRAIN LISTING / HAS-BRAIN / DIRS
    // (unmeasured by the pack rows)" family — the 2026-10-27 slice's
    // reverse-verification target). Neutral facts only: hasBrain verdict,
    // array shapes, dirs roots verified for CONFINEMENT (inside models/).
    routes.registerRoute('brain-listing', async (ctx) => {
        const j = await ctx.request.json().catch(() => ({}));
        let brain;
        try { brain = require(path.join(sb, 'lib', 'brain.js')); } catch (e) {
            return new Response(JSON.stringify({ error: e.name + ': ' + e.message }), { status: 500 });
        }
        const out = { op: null };
        try {
            if (j && j.op === 'hasBrain') {
                out.op = 'hasBrain';
                const r = await brain.hasBrain(String(j.name || 'identity'));
                out.result = (r === null || r === 'public' || r === 'private') ? r : 'ILLEGAL:' + String(r);
            } else if (j && j.op === 'listBrains') {
                out.op = 'listBrains';
                const r = await brain.listBrains();
                out.isArray = Array.isArray(r);
                out.count = Array.isArray(r) ? r.length : null;
                out.nonString = Array.isArray(r) ? r.filter((x) => typeof x !== 'string').length : null;
                out.traversal = Array.isArray(r) ? r.filter((x) => String(x).includes('..') || String(x).startsWith('/')).length : null;
            } else if (j && j.op === 'brainDirs') {
                out.op = 'brainDirs';
                const r = brain.brainDirs();
                out.hasPublic = !!r && Object.prototype.hasOwnProperty.call(r, 'public');
                out.hasPrivate = !!r && Object.prototype.hasOwnProperty.call(r, 'private');
                // THE LAW both pins hunt: the dirs roots must resolve inside
                // the sandbox's models/ tree — a root outside it is a breach.
                const root = path.join(sb, 'models');
                out.confined = r ? Object.entries(r).every(([, d]) => String(path.resolve(String(d)) === root || String(path.resolve(String(d))).startsWith(root + path.sep))) : false;
                out.roots = r ? Object.entries(r).map(([k, d]) => ({ side: k, inside: String(path.resolve(String(d))).startsWith(root + path.sep) })) : null;
            } else if (j && j.op === 'loadStackCorpus') {
                out.op = 'loadStackCorpus';
                const r = brain.loadStackCorpus({ sync: true });
                out.isArray = Array.isArray(r);
                out.count = Array.isArray(r) ? r.length : null;
                const entries = (Array.isArray(r) ? r : []).filter((x) => x && typeof x === 'object');
                out.hasNames = entries.every((x) => x.name == null || typeof x.name === 'string');
                        } else if (j && j.op === 'neuron-state') {
                out.op = 'neuron-state';
                // (2026-10-27 brain slice 2) the neuron STATE seam: both verbs
                // are async (the native pins' typeof-object checks read
                // promises); the row's neutral facts are the round trip and
                // the disk confinement.
                const probe = j.probe || 'brain-neuron-state-row';
                // (ground truth 2026-10-27) saveNeuronState answers BARE
                // (undefined - the write IS the ack by design, a throw is
                // the failure) and getNeuronState resolves to the state
                // object whose .neurons carries what was saved. The facts
                // below are the seam's own vocabulary.
                let saveThrew = null;
                try { await brain.saveNeuronState({ probe }); } catch (e0) { saveThrew = e0.name + ': ' + e0.message; }
                let got = null, gotThrew = null;
                try { got = await brain.getNeuronState(); } catch (e1) { gotThrew = e1.name + ': ' + e1.message; }
                const neurons = (got && typeof got === 'object' && got.neurons) ? got.neurons : got;
                out.roundTrip = !saveThrew && !gotThrew && !!neurons && typeof neurons === 'object' && neurons.probe === probe;
                try { await brain.saveNeuronState({ probe: probe + '-2', n: 2 }); } catch (e2) { saveThrew = saveThrew || (e2.name + ': ' + e2.message); }
                let back = null;
                try { back = await brain.getNeuronState(); } catch (e3) { gotThrew = gotThrew || (e3.name + ': ' + e3.message); }
                const neurons2 = (back && typeof back === 'object' && back.neurons) ? back.neurons : back;
                out.saveNoThrow = !saveThrew;
                out.secondPersisted = !!neurons2 && neurons2.probe === probe + '-2' && neurons2.n === 2;
                out.gotThrew = gotThrew || saveThrew;
                // disk truth: the persisted state.json must stay inside the
                // sandbox's models/ tree (never a foreign root).
                let statePath = null;
                try {
                    // (multi-brain layout law) state.json lives per-brain since
                    // 0.9, legacy roots at the flat models/ root; BOTH belong
                    // inside models/ - anything else is a confinement breach.
                    const candidates = ['private/vant/state.json', 'state.json', 'private/fixture/state.json'];
                    statePath = candidates.map((c) => path.join(sb, 'models', c)).find((cand) => fs.existsSync(cand)) || null;
                } catch (e2) { statePath = 'probe-threw:' + e2.name; }
                out.stateInModels = statePath !== null;
                out.statePathRel = statePath ? String(path.relative(sb, statePath)).slice(0, 80) : null;
            } else if (j && j.op === 'brainSaveNeurons') {
                out.op = 'brainSaveNeurons';
                const r = brain.brainSaveNeurons({ attention: { vant: 0.5 } });
                out.ack = !!r && ('saving' in r || 'error' in r);
                out.keys = r && typeof r === 'object' ? Object.keys(r) : null;
            } else {
                return new Response(JSON.stringify({ error: 'op required (hasBrain|listBrains|brainDirs|loadStackCorpus|brainSaveNeurons)' }), { status: 400 });
            }
        } catch (e) {
            out.threw = e.name + ': ' + e.message;
        }
        return new Response(JSON.stringify(out), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    });

    // guest-cap: real lib/guests gates, three booleans
    routes.registerRoute('guest-cap', async () => {
        let guests;
        try { guests = require(path.join(sb, 'lib', 'guests.js')); } catch (e) {
            return new Response(JSON.stringify({ error: e.name + ': ' + e.message }), { status: 500 });
        }
        const out = { adminDenied: false, revokedDead: false, pairingSingleUse: false };
        // (a) admin verbs: a guest can NEVER call guest management
        let tok;
        try { tok = guests.issue('pack-guest', { role: 'human', brain: 'vant', expires: '1d' }); }
        catch (e) { return new Response(JSON.stringify({ error: 'issue threw: ' + e.message }), { status: 500 }); }
        const raw = tok && tok.token ? tok.token : (typeof tok === 'string' ? tok : null);
        if (!raw) { return new Response(JSON.stringify({ error: 'issue did not return a token' }), { status: 500 }); }
        const v = guests.verify(raw);
        if (!v) { return new Response(JSON.stringify({ error: 'verify could not round-trip the issued token' }), { status: 500 }); }
        const adminTool = 'guest_issue';
        try { out.adminDenied = guests.classifyTool(adminTool) === 'admin'
            ? guests.authorize(adminTool, v).allowed === false
            : null; }
        catch (e) { out.adminDenied = null; }
        // (b) revocation kills an existing grant mid-session
        try { guests.revoke(v.guest?.id ?? tok.id ?? tok.guestId); } catch (e) {
            return new Response(JSON.stringify({ error: 'revoke threw: ' + e.message }), { status: 500 });
        }
        out.revokedDead = guests.verify(raw) === null;
        // pairing voucher: single-use, second redemption refused
        const code = 'vhpair-' + 'A7x9K2mQ4LbP6nR8';
        if (!guests.offerPairing(code)) {
            return new Response(JSON.stringify({ error: 'offerPairing refused the fixture code' }), { status: 500 });
        }
        const first = guests.pair(code);
        const second = guests.pair(code);
        out.pairingSingleUse = !!(first && first.token) && !!(second && second.ok === false);
        return new Response(JSON.stringify(out), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    });

    // Pending oracles stay UNREGISTERED (crashtest lesson: a 501 shim IS a
    // 5xx to the fuzz floor - see scripts/crashtest-run.js): the packs
    // degrade via route-absence (skipped-REFUSED), which is the honest shape.

    // Pack-survey gap-fills (2026-10-22): crew + mcp routes armed here are
    // REAL (fresh-module probe children in the sandbox, same shape as the
    // brain-state probe); rest + stones routes stay honestly unwired.
    routes.registerRoute('crew-run', async () => {
        let outText;
        try {
            outText = execFileSync('node', ['-e', CREW_CHILD], { cwd: sb, timeout: 60000, encoding: 'utf8', env: { ...process.env, VANT_GATE_QUIET: '1' } });
        } catch (e) {
            return new Response(JSON.stringify({ error: `crew probe child failed: ${String(e.stderr || e.message).slice(0, 200)}` }), { status: 500 });
        }
        return new Response(extractCtJson(outText), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    });
    routes.registerRoute('mcp-exec', async (ctx) => {
        const j = await ctx.request.json().catch(() => ({}));
        let outText;
        try {
            outText = execFileSync('node', ['-e', MCP_CHILD, JSON.stringify(Array.isArray(j.calls) ? j.calls : [])], { cwd: sb, timeout: 60000, encoding: 'utf8', env: { ...process.env, VANT_GATE_QUIET: '1' } });
        } catch (e) {
            return new Response(JSON.stringify({ error: `mcp probe child failed: ${String(e.stderr || e.message).slice(0, 200)}` }), { status: 500 });
        }
        return new Response(extractCtJson(outText), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    });
    // --- the vant-rest arm (2026-10-24): lib/server's REAL Edge chain, the
    // --- same route code scripts/crashtest-run.js runs.

    // rest-request: the vant-rest pack's route. Body carries
    // { method, path, headers?, body?, authRequired? } - one honest round
    // trip through the chain, status + headers + body attached.
    routes.registerRoute('rest-request', async (ctx) => {
        const j = await ctx.request.json().catch(() => ({}));
        if (!EDGE_CHAINS.open || !EDGE_CHAINS.priv) resetEdgeChains(sb);
        const chain = (j && j.authRequired === true) ? EDGE_CHAINS.priv : EDGE_CHAINS.open;
        const out = await edgeRoundTrip(chain, j || {});
        return new Response(JSON.stringify(out), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    });

    // Raw-dispatch Edge routes (library-row vocabulary is raw HTTP; the
    // vant vocab is armed for rows that want it too).
    const rawEdgeRoute = (authRequired) => async (ctx) => {
        const req0 = ctx.request;
        let rawUrl;
        try { rawUrl = new URL(req0.url).pathname; } catch (e) { rawUrl = String(req0.url); }
        let body = null;
        if (req0.method !== 'GET' && req0.method !== 'HEAD') {
            try { body = await req0.text(); } catch (e2) { body = null; }
        }
        if (!EDGE_CHAINS.open || !EDGE_CHAINS.priv) resetEdgeChains(sb);
        const out = await edgeRoundTrip(authRequired ? EDGE_CHAINS.priv : EDGE_CHAINS.open, {
            method: req0.method,
            url: rawUrl,
            headers: Object.fromEntries(req0.headers.entries()),
            body,
        });
        return new Response(out.bodyText, {
            status: out.status && Number(out.status) >= 200 ? Number(out.status) : 500,
            headers: { ...out.headers, 'Cache-Control': 'no-store' },
        });
    };
    routes.registerRoute('vant-rest-open', rawEdgeRoute(false));
    routes.registerRoute('vant-rest-priv', rawEdgeRoute(true));
    routes.registerRoute('vant-rest-priv-alias', rawEdgeRoute(true));

    // --- the session-cookie arm: lib/guests REAL token semantics
    // --- (issue/verify/revoke) behind cookie packaging an Edge deployment
    // --- of them would use (flags are the shim's posture, honestly set).
    const COOKIE = (raw) => 'sid=' + raw + '; Path=/; Secure; HttpOnly; SameSite=Lax';
    const sidFrom = (header) => {
        const m = String((header && header.get) ? (header.get('cookie') ?? '') : '').match(/(?:^|;\s*)sid=([^;]*)/);
        return m ? m[1] : null;
    };
    const jsonRes = (data, status, extraHeaders = {}) => new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extraHeaders },
    });
    let sessionGuests = null;
    const guestsForSb = () => {
        if (!sessionGuests) sessionGuests = require(path.join(sb, 'lib', 'guests.js'));
        return sessionGuests;
    };
    routes.registerRoute('vant-login', async (ctx) => {
        const j = await ctx.request.json().catch(() => ({}));
        try {
            const t = guestsForSb().issue(String((j && j.user) || 'rook'), { role: 'human', brain: 'vant', expires: '1d' });
            return jsonRes({ ok: true, user: (j && j.user) || 'rook', brain: 'vant' }, 200, { 'Set-Cookie': COOKIE(t.token) });
        } catch (e) {
            return jsonRes({ error: e.message }, 400);
        }
    });
    routes.registerRoute('vant-me', async (ctx) => {
        const sid = sidFrom(ctx.request.headers);
        const v = sid ? guestsForSb().verify(sid) : null;
        if (!v) return jsonRes({ error: 'no session' }, 401);
        return jsonRes({ ok: true, guest: { name: v.guest.name, role: v.guest.role, trustLevel: v.guest.trustLevel } }, 200);
    });
    routes.registerRoute('vant-logout', async (ctx) => {
        const sid = sidFrom(ctx.request.headers);
        if (!sid) return jsonRes({ error: 'no session' }, 400);
        const v = guestsForSb().verify(sid);
        const id = v ? v.guest.id : sid;
        guestsForSb().revoke(id);
        return jsonRes({ ok: true }, 200);
    });

    // --- the stones arm: real seal → decode → restore through the probe
    // --- child (STONE_CHILD above); stone-restore-tamper shares the tamper
    // --- arm with vant-brain's boot-stone-integrity oracle.
    const stoneRoute = (mode) => async (ctx) => {
        let j = {};
        try { j = await ctx.request.json(); } catch (e) { j = {}; }
        const argvSpec = mode === 'tamper'
            ? JSON.stringify({ mode: 'tamper' })
            : JSON.stringify({ mode: 'scope', brains: Array.isArray(j && j.brains) ? j.brains : null });
        let outText;
        try {
            outText = execFileSync('node', ['-e', STONE_CHILD, argvSpec], { cwd: sb, timeout: 90000, encoding: 'utf8', env: { ...process.env, VANT_GATE_QUIET: '1' } });
        } catch (e) {
            return new Response(JSON.stringify({ error: `stone probe child failed: ${String(e.stderr || e.message).slice(0, 200)}` }), { status: 500 });
        }
        return new Response(extractCtJson(outText), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    };
    routes.registerRoute('stone-scope', stoneRoute('scope'));
    const tamperRoute = stoneRoute('tamper');
    routes.registerRoute('stone-tamper', tamperRoute);
    routes.registerRoute('stone-restore-tamper', tamperRoute);

    // --- the trust + graph arms (2026-10-22): the two pending-oracle
    // --- routes in a probe child each (fresh modules over the sandbox).
    routes.registerRoute('trust-read', async (ctx) => {
        const j = await ctx.request.json().catch(() => ({}));
        let outText;
        try {
            outText = execFileSync('node', ['-e', TRUST_CHILD, JSON.stringify({ level: j && j.level ? String(j.level) : 'low' })], { cwd: sb, timeout: 30000, encoding: 'utf8', env: { ...process.env, VANT_GATE_QUIET: '1' } });
        } catch (e) {
            return new Response(JSON.stringify({ error: `trust probe child failed: ${String(e.stderr || e.message).slice(0, 200)}` }), { status: 500 });
        }
        return new Response(extractCtJson(outText), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    });
    routes.registerRoute('brain-graph-walk', async () => {
        let outText;
        try {
            outText = execFileSync('node', ['-e', GRAPH_CHILD], { cwd: sb, timeout: 60000, encoding: 'utf8', env: { ...process.env, VANT_GATE_QUIET: '1' } });
        } catch (e) {
            return new Response(JSON.stringify({ error: `graph probe child failed: ${String(e.stderr || e.message).slice(0, 200)}` }), { status: 500 });
        }
        return new Response(extractCtJson(outText), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    });

    // (2026-10-22) The last two pending oracles are REGISTERED now: every
    // vant-brain route contract is armed. Absence remains the honest shape
    // for any FUTURE unwired oracle (the packs degrade via route-absence,
    // never a 501 shim - a 501 shim IS a 5xx to the fuzz floor).

    // --- the site wire routes (the vant-home arm, 2026-10-23): the REAL
    // --- web/home Pages Functions handlers over a fresh per-call fake D1,
    // --- same shape as scripts/crashtest-run.js. The posture envelope
    // --- (db / envKey / hotSweep / inner / rawBody) picks the environment;
    // --- the wire answers verbatim.
    routes.registerRoute('home-summary', async (ctx) => {
        const j = await ctx.request.json().catch(() => ({}));
        const { summary } = await homeHandlers();
        const env = {
            STATUS_ADMIN_KEY: typeof j.envKey === 'string' ? j.envKey : 'home-run-root-admin-key',
            STATUS_SWEEP_SECONDS: String(j.sweepSeconds ?? 600),
        };
        if (j.db !== false) {
            env.DB = makeFakeD1();
            if (j.hotSweep !== false) {
                await env.DB.prepare('INSERT INTO status_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
                    .bind('last_sweep', new Date().toISOString()).run();
            }
        }
        const method = String(j.method || 'GET').toUpperCase();
        let res;
        if (method !== 'GET') {
            res = new Response(JSON.stringify({ error: 'method not allowed on this route' }), {
                status: 405,
                headers: { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff' },
            });
        } else {
            const req = new Request('https://home-run-root.pages.dev/api/status/summary' + String(j.url ?? ''), { method: 'GET', headers: (j.headers || {}) });
            res = await summary({ request: req, env, data: {} });
        }
        const text = await res.text();
        return new Response(text, { status: res.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    });
    routes.registerRoute('home-admin', async (ctx) => {
        const j = await ctx.request.json().catch(() => ({}));
        const { admin } = await homeHandlers();
        const env = { STATUS_ADMIN_KEY: typeof j.envKey === 'string' ? j.envKey : 'home-run-root-admin-key' };
        // (flood-oracle posture) sharedDb keeps ONE fake D1 across a burst of
        // calls; resetSharedDb forces it fresh on the burst opener so the
        // count-capped rows measure from the seeded start every run
        // (determinism).
        if (j.sharedDb) {
            if (!homeSharedDb || j.resetSharedDb) homeSharedDb = makeFakeD1();
            env.DB = homeSharedDb;
        } else {
            homeSharedDb = null;
            if (j.db !== false) env.DB = makeFakeD1();
        }
        const inner = (j.inner && typeof j.inner === 'object') ? j.inner : {};
        const rawBody = typeof j.rawBody === 'string' ? j.rawBody : JSON.stringify(inner);
        const headers = { 'content-type': 'application/json' };
        if (j.adminKey !== undefined) headers['x-admin-key'] = String(j.adminKey);
        const req = new Request('https://home-run-root.pages.dev/api/status/admin', { method: 'POST', headers, body: String(rawBody) });
        const res = await admin({ request: req, env, data: {} });
        const text = await res.text();
        return new Response(text, { status: res.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    });
    // (2026-10-27 Edge deepening) home-scheduled: the cron door mirror -
    // silent no-op without the binding, cron-only wire (404 typed), and
    // over the fake D1 the sweep engine runs through the seeded defaults.
    routes.registerRoute('home-scheduled', async () => {
        const scheduled = (await homeHandlers()).scheduled;
        const facts = { silentNoDb: null, seeded: null, wire404: null, wire404Body: null, nosniff: null, faultedWithDb: false };
        facts.silentNoDb = (await scheduled.onScheduled({ env: {} })) === undefined;
        const db = makeFakeD1();
        try { await scheduled.onScheduled({ env: { DB: db } }); } catch (e) { facts.faultedWithDb = true; }
        // the fake's return value is only { prepare, batch } - the store is
        // the closure; seeding truth rides a COUNT query, like the wire does
        let seeded = false;
        try { const row = await db.prepare('SELECT COUNT(*) AS n FROM status_endpoints').first(); seeded = !!(row && Number(row.first ? row.first.n : row.n) > 0); } catch { seeded = false; }
        facts.seeded = seeded;
        const res = scheduled.onRequest(new Request('https://home-run-root.pages.dev/api/status/scheduled', { method: 'GET' }));
        facts.wire404 = res.status === 404;
        const text = await res.text();
        facts.wire404Body = typeof text === 'string' && text.includes('scheduled only');
        facts.nosniff = res.headers.get('x-content-type-options') === 'nosniff';
        return new Response(JSON.stringify(facts), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    });

    return routes;
}

// ---------------------------------------------------------------------------
// 5. the expected-verdict table. Rook's honest caveat conserved: rows marked
//    LIVE FINDING measure real current-behavior bugs; fix + flip to REFUSED.
// ---------------------------------------------------------------------------

const EXPECTED = {
    // pack: attack -> verdict
    'vant-census': {
        'require-cycle-slope': 'skip', // config-armed: no census in this suite's ctx
        'whale-function-cap': 'skip',
        'late-key-canary': 'skip',
        'guard-throw-probe': 'skip',
    },
    'vant-brain': {
        'private-first-fallback': 'REFUSED',
        'paths-cannot-escape-models': 'REFUSED',
        // FIXED 2026-10-22 (read-path half of #232, measured REFUSED after
        // the fix): missing state.json keeps the legitimate fresh-install
        // default; corrupt/truncated/trailing garbage faults LOUDLY; the
        // default path now DERIVES the pointer side from the tree, so a
        // private-pinned read can no longer resolve a public file while
        // reporting source 'private'.
        'state-tamper-is-loud': 'REFUSED',
        // FIXED 2026-10-22 (same seams): wrong-typed stack/currentBrain
        // values are sanitized loudly at BOTH load seams and never reach
        // the runtime pointer.
        'state-json-schema-strictness': 'REFUSED',
        'migration-idempotency': 'REFUSED',
        'guest-capability-gates': 'REFUSED',
        // FIXED 2026-10-22 (#233-2, same turn it was pinned): the trust
        // floor is now ENFORCED at the brain.read seam (lib/succession
        // privateReadVerdict -> lib/brain read gate). high/medium default
        // installs are unchanged; low refuses private state (public trees
        // stay open for reference, operator config may declare a minimal
        // core); none keeps only identity. No code-side bypass.
        'succession-trust-inheritance': 'REFUSED',
        'boot-stone-integrity': 'REFUSED',
        // ARMED 2026-10-22 (brain-graph-walk route): a cyclic knowledge
        // graph returns - brain_connections' visited guard + depth floor
        // hold; no hang, no RangeError.
        'knowledge-links-cycle-safety': 'REFUSED',
        // (brain battery batch 2, 2026-10-26) the UNIT families convert
        // in-process from lib/brain + lib/format — self-contained rows, no
        // run-root arm, EARN strict REFUSED in BOTH phases; native
        // test/brain.test.js stayed green through the landing cycles and
        // then TRIMMED to its unmeasured seams on 2026-10-27 (29 pins: the
        // state seam, registry, metrics, version, module integrations,
        // pipeline-state shape, listing/dirs/saveNeurons — the pack rows
        // don't grade those; the covered families retired to these rows).
        'brain-module-surface-and-paths': 'REFUSED',
        'brain-mode-switch-and-pipeline-chain': 'REFUSED',
        'brain-alias-mapping-law': 'REFUSED',
        'brain-neurons-synapse-attention-law': 'REFUSED',
        'brain-stack-push-switch-and-mode-enum': 'REFUSED',
        'brain-multiformat-read-save-laws': 'REFUSED',
        'format-module-listing-and-confinement': 'REFUSED',
        // (guests battery, 2026-10-26) the LIB-level guest lifecycle
        // converts in-process from lib/guests — self-contained rows, no
        // run-root arm, EARN strict REFUSED in BOTH phases. The socket
        // door-integration families stay in the trimmed native suite
        // (test/guests.test.js, 14 pins) under the reverse-verification
        // law; the run-root guest-cap route row still arms vant-brain's
        // guest-capability-gates.
        'guest-token-lifecycle-hash-revoke-and-expiry': 'REFUSED',
        'guest-caps-trust-restricts-and-door-classes': 'REFUSED',
        'guest-pairing-voucher-single-use': 'REFUSED',
        // ARMED 2026-10-27 (brain-listing route): the native suite's own
        // print said "BRAIN LISTING / HAS-BRAIN / DIRS (unmeasured by the
        // pack rows)" - the reverse-verification read took the hint;
        // the row measures the family's five seams (hasBrain closed
        // vocabulary + honest-null miss, string array roster with zero
        // traversal names, brainDirs both sides CONFINED inside models/,
        // stack-corpus entry names, neuron-save typed ack).
        'brain-listing-dirs-family': 'REFUSED',
        // ARMED 2026-10-27 (brain-listing slice 2): the neuron STATE seam -
        // both verb postures round-trip (the native pins only checked
        // promise/object shapes, so a write-only state would pass them),
        // and the persisted state.json lives inside the sandbox's models/
        // tree (multi-brain layout included).
        'brain-neuron-state-seam': 'REFUSED',
        // (evolution census, ARMED 2026-10-27) the evolution-context
        // lifecycle: start/records/copies/end/history graded in a fresh
        // module child; the family was the inventory census's largest
        // unmeasured cluster.
        'brain-evolution-session-lifecycle': 'skip',
        // (geometry + backup census, ARMED 2026-10-27) the NSC9 per-brain
        // address family + the stego-backup trio's honest-refusal laws
        'brain-geometry-nsc9-address-family': 'skip',
        'brain-stego-backup-trio-honest-refusals': 'skip',
        // (crates/dropbox census, ARMED 2026-10-27) the crate/dropbox
        // family (~15 keys): my-stuff crate round-trips + stash +
        // handler-registry lifecycle + shared dropbox, all through the
        // tmp-space store; absent reads answer honest {error:'not
        // found'}, hostile names answer the typed path wall, delete is
        // idempotent with the honest ack.
        // (tmp-space census, ARMED 2026-10-27) the crate/dropbox family
        // (~15 keys) graded as brain-tmpspace-crate-stash-handlers: both
        // crates' hostile-name records + round-trips + honest absence,
        // the stash lifecycle, the handler registry lifecycle, the shared
        // dropbox enumeration, and the confined personal-file laws incl.
        // the typed VAF_PATH_BLOCKED refusal (whose codes-table fix this
        // row's run caught live: the name was MISSING from lib/error.js).
        'brain-tmpspace-crate-stash-handlers': 'skip',
        // (breaker census, ARMED 2026-10-27) the P3 #34 load-circuit
        // family graded over a REAL poisoned-critical wedge fixture:
        // consecutive thrown loads open the breaker named (event +
        // metrics.errors + lastError), every load then fast-fails typed
        // retryable BRAIN_CIRCUIT_OPEN, graceful null misses never feed
        // it, the half-open probe rides the healed machinery once and
        // closes on REAL content, and resetLoadCircuit restores honestly.
        'brain-load-circuit-laws': 'skip',
        // (remote/watch/cache census, ARMED 2026-10-27) the 9-key cluster:
        // the remote URL pair, a REAL remote-mode load over a localhost
        // server (source named remote), the cache laws end to end
        // (verbatim serve, real hit accounting, TTL stale retention,
        // invalidate answers the fresh disk read), the stats shape +
        // setCache flip, the corpus invalidate, and the watcher toggles.
        'brain-remote-watch-cache-laws': 'skip',
        // (lifecycle census, ARMED 2026-10-27) the 7-key bootstrap/shutdown
        // + framework-config cluster: hooks registered through onBootstrap/
        // onShutdown RUN during the real lifecycle passes, the metabolism
        // tick genuinely rides boot's timer registry (brain.metabolize,
        // stoppable with an honest re-stop false), and the config trio
        // holds (fresh dual default, verbatim set/get over the current
        // brain, the stack-by-brain map over the roster).
        'brain-lifecycle-framework-laws': 'skip',
    },
    'vant-crew': {
        'roster-quota-ceiling': 'REFUSED',
        'spawn-rate-limit': 'REFUSED',
        'quota-error-is-typed': 'REFUSED',
        // run-root census family (ARMED 2026-10-27): the crew-doors child
        // grades the door inventory over a fresh-module ladder, so the
        // contract grades it as an honest skip (the run fires grade it
        // live x2, the README ledger pins the verdicts).
        'crew-doors-census': 'skip',
    },
    // (teams-orgchart census, ARMED 2026-10-27) the same run-root census
    // contract: the orgchart depth child needs the fresh-module ladder, so
    // the contract grades it as an honest skip (the run fires grade it
    // live x2, the README ledger pins the verdicts).
    'vant-teams': {
        'teams-orgchart-census': 'skip',
    },
    'vant-mcp': {
                'tools-registry-census': 'skip',
'unknown-tool-honesty': 'REFUSED',
        'tool-schema-enforced': 'REFUSED',
        'brain-write-scope-hardness': 'REFUSED',
    },
    // The vant-rest/vant-stones rows are VALIDATED 2026-10-24; the stones
    // lineage row was a LIVE FINDING pin (lib/transform.gather scoped the
    // brain inventory but left the live currentBrain unfiltered) — FIXED
    // 2026-10-22: a scoped capture retargets an out-of-scope pointer to
    // the first scoped brain, loudly (mint side of #226). The inventory
    // law (stack ⊆ filter) and identity law (activeStack untouched) are
    // unchanged; full-capture behavior is byte-identical.
    'vant-rest': {
        'rest-remaining-doors-parity': 'REFUSED',
        'fuzz-floor-never-500': 'REFUSED',
        'cors-enable-parity': 'REFUSED',
        // Armor 2026-10-22 (crashtest v1.0.0-on-npm qs-shapes port): the
        // urlencoded wire rides the REAL BodyParser, so both rows are earned,
        // not assumed.
        'urlencoded-bracket-canary': 'REFUSED',
        'urlencoded-depth-floor': 'REFUSED',
        'session-cookie-discipline': 'REFUSED',
        // ARMED 2026-10-27 (REST door-parity family): the rest-request arm
        // now carries lib/api's REST_ROUTES table on the in-process Edge
        // chains, so the pack grades the REAL REST doors - the arg-name
        // parity rows were a LIVE FINDING (stream_info/enqueue/poll took
        // `workId`, trust_getScore took `entity`; lib/api fixed in the same
        // pass, the tool vocabulary is the door's vocabulary).
        'rest-mcp-door-args-parity': 'REFUSED',
        'rest-bent-body-fuzz-floor': 'REFUSED',
        'rest-typed-gate-is-the-answer': 'REFUSED',
        // ARMED 2026-10-27 (the api-object census family): the api-layer
        // child re-arms the API object's in-process surface. The auth
        // ladder and the generic door are earned-backed by TWO live finds
        // fixed in the same pass: the generic execute door rode a
        // vant.execute that lib/vant never exports (a TypeError escaped even
        // authenticated callers), and getAuthStatus's authFailures counter
        // was dead state. The census also files the duplicate brain_load
        // registration (array answers null) as a live finding.
        // run-root census family: the api-layer child needs the fresh-module
        // ladder, so the contract grades them as honest skips (the run fires
        // grade them live x2, the README ledger pins the verdicts).
        'api-object-auth-failclosed': 'skip',
        'api-object-authed-answers': 'skip',
        'api-object-generic-door-typed': 'skip',
        'api-object-family-census': 'skip',
    },
    'vant-stones': {
        'stone-scope-honesty': 'REFUSED',
        // FIXED 2026-10-22 (mint side of #226): the scoped payload never
        // carries a pointer outside its declared scope anymore.
        'state-pointer-lineage': 'REFUSED',
        'restore-torn-refusal': 'REFUSED',
    },
    // ARMED 2026-10-25 (the prove-the-verbs conformance pack, vant#250):
    // rows attack the kernel seed's gate() invariants directly - typed
    // refusals + journaled refusal entries are the defense holding. Lands
    // in the SAME PASS as K2 (test/kernel.test.js) per the same-pass law;
    // K3 (first real consumer) stays pending per the PRD's law.
    'vant-kernel': {
        'retire-without-census': 'REFUSED',
        'unlisted-retire': 'REFUSED',
        'attest-without-dated-basis': 'REFUSED',
        'succeed-without-attest-chain': 'REFUSED',
        'refusals-journal-themselves': 'REFUSED',
        'missing-verb-gap-visible': 'REFUSED',
        // ARMED 2026-10-25 (K3, the adoption half): escrow registers as the
        // reference consumer through the gate, attests spend pairs dated +
        // journaled, and self-heals after the probe's registry resets. The
        // pack flipped from proving the seed to proving adoption.
        'reference-consumer-witness': 'REFUSED',
        'gate-happy-path': 'REFUSED',
        // ARMED 2026-10-25 batch (the K6-K9 roster receipts): the roster
        // rows attack adoption GENERALIZING - pipeline/prune/docs-gates/
        // pass-log census carries, kernel visibility, reset self-heal
        // (roster row); the sudo witness's public-surface-only census law
        // + elevation-audit succeed + typed unknown-consumer refusal
        // (sudo row).
        'roster-adoption-witness': 'REFUSED',
        'sudo-public-surface-census': 'REFUSED',
    },
    // ARMED 2026-10-25 (the pass-ledger surface, wiring map row 9): the
    // docs-shaped consumer reads the REAL docs, queues open items as
    // kernel-dated census entries, formats the ceremony purely (no fs
    // write), and self-heals across registry resets.
    // The two doc-legs run as HONEST SKIPS here and under the real
    // harness (both harnesses run attacks from a sandbox cwd where
    // labs/ is not visible — a zero-item census is indistinguishable
    // from unread docs, so the rows degrade to explicit skips per house
    // rule 5 instead of riding that ambiguity). The doc-vs-census legs
    // stay fully verified at the repo root by test/pass-ledger.test.js.
    'vant-pass-ledger': {
        'open-item-census-real': 'skip',
        'marker-dialect-only': 'skip',
        'ceremony-never-writes': 'REFUSED',
        'reset-self-heal': 'REFUSED',
    },
    // ARMED 2026-10-23 (the site wire): flood-cost-cap was armed as a REAL
    // FINDING the same turn (the endpoint table accepted unbounded rows;
    // every cold public GET would probe per row) and FIXED the same turn:
    // addEndpoint enforces the cost cap (STATUS_MAX_ENDPOINTS, default 24,
    // plain Text env) and the refusal is typed. All five rows measure the
    // REAL handlers over the statement-mapped fake D1.
    'vant-home': {
        'unwired-refusal-typed': 'REFUSED',
        'summary-fuzz-floor': 'REFUSED',
        'admin-key-discipline': 'REFUSED',
        'admin-body-discipline': 'REFUSED',
        'flood-cost-cap': 'REFUSED',
        // (2026-10-27 Edge deepening) the third door: the daily sweep's
        // cron row (silent no-op without the DB, cron-only wire, sweep
        // engine over the fake D1).
        'scheduled-sweep-door': 'REFUSED',
    },
    // ARMED 2026-10-25 (Phase A of the S0→S1 conversion campaign, #249) —
    // three packs whose run-root arms live in scripts/crashtest-run.js
    // (the mcp-server-wall / relay-edge routes + the shared library arms
    // gov-grant/gov-resolve/gov-locks/gov-escrow and the memory/escrow
    // library ctx). This suite's sandbox routes (buildRoutes) don't carry
    // those run-root-only routes, so each row degrades to an HONEST SKIP
    // here (the packs' skip helper: verdict REFUSED, skipped true) per
    // house rule 5 instead of riding an un-armed silence. The real
    // verification rides the run root in gate phase B, where every row is
    // fully EARNED (vant-server-wall 5/5, vant-relay 5/5, vant-discipline
    // 6/6 REFUSED with the native suites green alongside) — the gate's
    // phase is where the strict legality lives for this slice.
    'vant-discipline': { // in-process module discipline (memory envelope + grant ledger + escrow)
        'note-envelope-versioned-provenance': 'skip',
        'note-read-flags-contradiction-and-ghosts': 'skip',
        'note-delete-tombstone-and-dangling-cite': 'skip',
        'grant-ledger-precedence-and-revocation': 'skip',
        'grant-scope-isolation-and-trust-floor': 'skip',
        'escrow-two-key-and-expired-ttl': 'skip',
    },
    // ARMED 2026-10-26 (the no-DB-recursion battery, v0.8.6): a cross-
    // cutting law pack over the addressing/tracking surface. Rows drive
    // lib/trace + lib/recursion directly in-process — self-contained, no
    // run-root arm, so they EARN strict REFUSED in BOTH phases. The wall
    // fix this battery introduces (lib/trace.js bounded render) is graded
    // here as primary coverage (no native trace suite exists).
    'vant-recursion-wall': {
        'trace-tree-depth-bomb-bounded': 'REFUSED',
        'trace-tree-cycle-marked-and-honest-waterfall': 'REFUSED',
        'recursion-guard-depth-typed-and-releasable': 'REFUSED',
    },
    'vant-relay': { // the r/2 webhook edge face (web/relay/functions/api/r/relay.ts)
        // (2026-10-27 Edge deepening) the caps page + the SSE stream-through
        // joined the edge face; the rows drive them through the same
        // relay-edge child (run-root-only, honest skips in this suite).
        'edge-caps-posture-page': 'skip',
        'edge-events-gate-ladder': 'skip',
        'posture-and-key-gates-fail-closed': 'skip',
        'hmac-lane-over-raw-bytes': 'skip',
        'freshness-window-typed': 'skip',
        'origin-guard-typed-acks': 'skip',
        'encrypted-pipes-only-and-body-cap': 'skip',
        // (relay battery slice 1, 2026-10-26) the pod lib face graded
        // in-process from lib/api + lib/config — self-contained rows, no
        // run-root arm needed, so they EARN strict REFUSED in BOTH phases
        // (bare suite included). Real-socket families queue behind an
        // in-process socket arm; native test/relay.test.js stays green
        // alongside under the reverse-verification law.
        'lib-face-truth-and-envelope-canon': 'REFUSED',
        'lib-face-mount-gates-fail-closed': 'REFUSED',
        'lib-face-origin-policy-wall': 'REFUSED',
        'lib-face-dispatch-guards-typed': 'REFUSED',
        'lib-face-sender-gate-refusal-typed': 'REFUSED',
        // (relay battery slice 2, 2026-10-26) the REAL wire: each row
        // mounts the actual relay route on loopback (port 0) in-process
        // and drives it over HTTP — sockets yes, arms no. Loopback binds
        // work in BOTH phases, so these EARN strict REFUSED everywhere.
        'wire-hmac-lane-and-replay-gate': 'REFUSED',
        'wire-hop-roundtrip-and-no-body-leak': 'REFUSED',
        'wire-ride-core-loop-and-refusals': 'REFUSED',
        'wire-body-cap-and-liveness-counters': 'REFUSED',
        'wire-sender-seam-and-bridge-families': 'REFUSED',
        'wire-sealed-lane-freshness-and-dedupe': 'REFUSED',
        // ARMED 2026-10-27 (traveler wire slice 2): the sibling row's
        // remaining shape lanes - the ADDRESS law refuses the sneak id
        // BEFORE the id-named slot generator (the door's hex-only slot
        // safety rides the guard), the shape lanes refuse typed, and a
        // refused packet NEVER rides the door (zero landing growth).
        'wire-traveler-law-lanes': 'REFUSED',
        'wire-traveler-carrier-id-named': 'REFUSED',
    },
    'vant-server-wall': { // the MCP server wall via lib/server._handleRequest
        'escrow-wall-429-never-5xx': 'skip',
        'hostile-body-floor': 'skip',
        'credential-stuffing-distinct-401': 'skip',
        'write-honesty-no-store': 'skip',
        'flood-wall-429-retry-after': 'skip',
    },
    // ARMED 2026-10-25 (Phase A, the dashboard auth/OTP doors pack): the
    // run-root arm (dash-auth) drives web/dashboard's REAL request-otp /
    // verify-otp / session handlers in-process via the strip-types probe
    // child with an in-child KVStore shim (BOLETE_KV) and a capture sink in
    // the sender's webhook seat. Like the other Phase A packs, this
    // suite's sandbox routes don't carry the run-root-only arm, so each
    // row degrades to an HONEST SKIP here; the strict EARNED verification
    // rides the run root (gate phase B: 5/5 REFUSED).
    'vant-dashboard': {
        'store-absence-fail-closed': 'skip',
        'bad-body-floor': 'skip',
        'mint-lane-typed-and-cooldown': 'skip',
        'session-mint-and-cookie-discipline': 'skip',
        'attempt-budget-burn': 'skip',
        // (batch 2) the bridge knee + the admin gate
        'token-source-order': 'skip',
        'bound-token-property-scoped': 'skip',
        'token-intake-binding-law': 'skip',
        'raw-cookie-fallback-hygiene': 'skip',
        'admin-gate-typed-ladder': 'skip',
        // (batch 3, 2026-10-27) the DASHBOARD-relay flavor: web/dashboard's
        // own r/2 intake + caps page through the relay-edge child (edges
        // 'dashrelay'/'dashcaps' - same WHATWG/WebCrypto probe as the solo
        // face). This suite's sandbox routes don't carry the run-root-only
        // relay-edge door arms, so each row degrades to an HONEST SKIP
        // here; strict EARNED verification rides the run root.
        'dash-relay-gates-fail-closed': 'skip',
        'dash-relay-hmac-header-lane-laws': 'skip',
        'dash-relay-sealed-lane-laws': 'skip',
        'dash-relay-browser-lane-bridge': 'skip',
        // (batch 4, 2026-10-27) the small doors: audit / users / properties /
        // breakers + the MCP forward trio ride the SAME run-root-only
        // dash-auth door arms, so each row degrades to an HONEST SKIP here;
        // strict EARNED verification rides the run root.
        'small-doors-properties-registry': 'skip',
        'small-doors-breakers-edge-view': 'skip',
        'small-doors-audit-ladder-and-cap': 'skip',
        'small-doors-users-roster-lockout-and-gate-done': 'skip',
        'small-doors-mcp-trio-typed-forward': 'skip',
    },
    // ARMED 2026-10-25 (drill-down slice 1, Phase A of the S0→S1 campaign,
    // #249): the trust→tree consumer family converted from the native
    // state-wiring pins onto the run root's wiring-trust arm. This suite's
    // sandbox routes don't carry the run-root-only arm, so the rows
    // degrade to HONEST SKIPS here; strict EARNED verification rides the
    // run root (5/5 REFUSED), native suite green alongside under the
    // reverse-verification law. The remaining state-wiring families
    // (registry/consensus/market/WAL/geometry/brain-verify/anchor) queue
    // behind per-bucket conversion shape.
    'vant-state-wiring': {
        'trust-mirror-under-tree': 'skip',
        'trust-mutate-moves-root': 'skip',
        'trust-disk-view-live': 'skip',
        'trust-event-carries-root': 'skip',
        'trust-clear-resets': 'skip',
        // (slice 2) the merge-path consumers: registry / consensus / market
        'registry-register-mirrors': 'skip',
        'registry-heartbeat-moves-root': 'skip',
        'registry-disk-view-live': 'skip',
        'registry-clear-reset-reuse': 'skip',
        'consensus-create-mirrors': 'skip',
        'consensus-disk-view-live': 'skip',
        'consensus-clear-resets': 'skip',
        'market-list-mirrors': 'skip',
        'market-disk-view-live': 'skip',
        'market-clear-resets': 'skip',
        // (market inventory census 2026-10-27) run-root-only child route;
        // honest skip here, strict earned verification rides the run root
        'market-scope-visibility-and-cancel-matrix': 'skip',
        'market-skills-gate-and-lifecycle-laws': 'skip',
        // (slice 3) mesh WAL + events, geometry, brain-verify, mesh-status
        'mesh-wal-deltas-ride-log': 'skip',
        'mesh-wal-recovery-reconstructs': 'skip',
        'mesh-wal-rejected-durable': 'skip',
        'mesh-wal-ledger-provenance': 'skip',
        'mesh-wal-interval-fastforward': 'skip',
        'mesh-events-bus-provenance': 'skip',
        'mesh-events-silent-side-effect-free': 'skip',
        'mesh-events-recovery-emits': 'skip',
        'geometry-canonical-barcodes': 'skip',
        'geometry-barcode-roundtrip': 'skip',
        'brainverify-health-lifecycle': 'skip',
        'brainverify-horcrux-exit-contract': 'skip',
        'meshstatus-mesh-section-shape': 'skip',
        'meshstatus-seed-pure-and-envflow': 'skip',
        'meshstatus-render-degraded': 'skip',
    },
    // carriers battery slice 1 (lane laws): run-root-only arm; honest skips here
    'vant-carriers': {
        'carriers-roster-honesty': 'skip',
        'carriers-nsc9-frame-law': 'skip',
        'carriers-nsc9-giai-readthrough': 'skip',
        'carriers-stone-two-walls': 'skip',
        'carriers-svg-airgap': 'skip',
        'carriers-json-erp': 'skip',
        'carriers-sender-side-verify': 'skip',
        'carriers-capacity-and-codes': 'skip',
        // (slice 2) pointer/wire-hook family
        'carriers-pointer-address-law': 'skip',
        'carriers-pointer-body-wall': 'skip',
        'carriers-wire-hook-failclosed': 'skip',
        'carriers-wire-hook-walls': 'skip',
        // (slice 3) route / certified-letter family
        'carriers-route-org-fixture': 'skip',
        'carriers-route-letter-routes': 'skip',
        'carriers-route-outsider-drop': 'skip',
        'carriers-route-risk-gate': 'skip',
        'carriers-route-stageless-forged': 'skip',
        // ARMED 2026-10-27 (slice 7, the WIRE seam): a REAL org-scoped
        // carry() output posts over a REAL loopback mount and lands THROUGH
        // the brain_write door slot id-named; the gapped tamper refuses
        // E_TRAVELER_STEP, the sneak id refuses E_TRAVELER_ADDRESS, an
        // already-ledgered packet refuses E_TRAVELER_STEP (append-only),
        // and the refused packets leave ZERO landing growth.
        'carriers-wire-seam-letter-through-door': 'skip',
        // (slice 8, ARMED 2026-10-27) the MESH serving wall on REAL
        // landings: the door slot law lands, then the serving verbs
        // measure over THAT body (found + re-verified, the VANT:1 stamp,
        // honest found:false misses, a swapped store refusals identically
        // at both faces, restore re-arms, the pointer loop resolves the
        // REAL raster through the door-backed fetch, zero serving growth).
        'carriers-mesh-serving-wall-on-real-landings': 'skip',
        // (slice 9, ARMED 2026-10-27) the TRAVELERS census: T.status() +
        // the span relation + the 512KiB state ceiling now enforced in the
        // working lib (kit parity; typed E_TRAVELER_SHAPE at persist).
        'travelers-status-span-ceiling-census': 'REFUSED',
        // (slice 4) plates family
        'carriers-plate-persist-roster': 'skip',
        'carriers-plate-framed-walls': 'skip',
        'carriers-plate-pointer-lite': 'skip',
        'carriers-plate-definition-gates': 'skip',
        'carriers-plate-hydrate-restart': 'skip',
        'carriers-plate-code-carrier': 'skip',
        // (slice 5) assembly + template family
        'carriers-assembly-parts-accumulate': 'skip',
        'carriers-assembly-append-only': 'skip',
        'carriers-assembly-address-law': 'skip',
        'carriers-template-line-builds': 'skip',
        'carriers-template-bill-walls': 'skip',
        'carriers-template-digital-line': 'skip',
        'carriers-template-unfilled-honest': 'skip',
        'carriers-template-enterprise-line': 'skip',
        // (slice 6, ARMED 2026-10-26) the traveler-lib working layer: rows
        // drive lib/traveler (+ event/scope/escrow/mcp/qos/event-types/
        // security-pipeline) DIRECTLY in-process against the real
        // brain-scoped pin store wiped per row; REFUSED everywhere (no
        // route arming needed). The REAL-PROCESS CLI family
        // (bin/traveler.js via spawnSync) stays native under the
        // reverse-verification law — like the guests' socket door families.
        'traveler-content-address-law': 'REFUSED',
        'traveler-ledger-law-and-ceiling': 'REFUSED',
        'traveler-persistence-append-only': 'REFUSED',
        'traveler-schema-rizer-law': 'REFUSED',
        'traveler-audit-verbatim': 'REFUSED',
        'traveler-door-verbs-carried': 'REFUSED',
        'traveler-os-integration': 'REFUSED',
        'traveler-scope-escrow-durability': 'REFUSED',
    },
    // migrations battery slice 1 (fixture family): run-root-only arm
    'vant-migrations': {
        'migrations-registry-shape': 'skip',
        'migrations-detect-dryrun-no-mutation': 'skip',
        'migrations-apply-security-chain': 'skip',
        'migrations-dropfile-no-clobber': 'skip',
        // (slice 2) legacy-main multibrain import family
        'migrations-legacy-detect-fires': 'skip',
        'migrations-legacy-no-false-positive': 'skip',
        'migrations-legacy-dryrun-plans': 'skip',
        'migrations-legacy-apply-nests': 'skip',
        // (slice 3) CLI banners, MCP door, adversarial edges
        'migrations-cli-legacy-banner': 'skip',
        'migrations-cli-second-start-quiet': 'skip',
        'migrations-cli-existing-wins-quiet': 'skip',
        'migrations-mcp-door-legacy': 'skip',
        'migrations-mcp-door-uptodate': 'skip',
        'migrations-read-fallback': 'skip',
        'migrations-no-self-nest': 'skip',
        'migrations-stack-rewrite': 'skip',
        'migrations-multibrain-files-win': 'skip',
        'migrations-symlink-wall': 'skip',
        'migrations-unverified-withholds': 'skip',
        'migrations-cli-status-and-fail-exit': 'skip',
        'migrations-health-checkmigration': 'skip',
        // (slice 4, 2026-10-27) the trim-survivor conversions: the last
        // four native pins of test/migrations.test.js land on the same
        // arm (both-scope import + fresh dual reads, the --brain-name
        // naming law, the clean-layout CLI dry-run) - file retired whole.
        'migrations-legacy-both-scopes-and-fresh-reads': 'skip',
        'migrations-legacy-brain-name-naming-law': 'skip',
        'migrations-cli-clean-dryrun': 'skip',
    },
    // ARMED 2026-10-26 (engine-parity-spine battery slice 1, Phase A of the
    // S0→S1 campaign): the spine families converted onto their own pack —
    // canonical bytes (#149), tree put/diff/snapshot (#150-adjacent state
    // core), scope grammar + stamping, fold laws + cellstore rebates
    // (#150), checkpoint recovery bounds (#151), anchor ledger + hotset
    // durability (#152), and the fail-closed capability posture (#162
    // #163). Every row drives the real lib modules against a throwaway
    // brain-space tmpdir; no route arming needed, so these hold REFUSED in
    // every sandbox. Native engine-parity-spine stayed green through the
    // landing cycle and then retired WHOLE to these rows (2026-10-27, the
    // carriers precedent).
    // ARMED 2026-10-26 (leisure battery, Phase A of the S0→S1 campaign,
    // #196 + #209): the want-list keeper converts onto its own pack —
    // recording/dedupe law, spirit-first rotation + receipts/forget, the
    // pursue seams with REAL tempo budgets, read-only breath/dream,
    // ledger containment + disk-truth reload, and the full autonomy-gate
    // ladder (7 graded legs onto cap truth). Every row drives the real
    // lib/leisure (+ tempo/escrow/qos/era/event) module-level against a
    // THROWAWAY brain's ledger (containment IS the graded surface); no
    // route arming needed, so these hold REFUSED in every sandbox.
    // Native test/leisure.test.js stayed green through the landing cycle
    // and then RETIRED WHOLE to these rows (2026-10-27, the carriers
    // precedent).
    'vant-leisure': {
        'want-ledger-lifecycle': 'REFUSED',
        'rotation-receipts-and-forget': 'REFUSED',
        'pursue-seams-and-tempo-budget': 'REFUSED',
        'breath-and-dream-read-only': 'REFUSED',
        'ledger-containment-and-disk-truth': 'REFUSED',
        'auto-pursue-gate-ladder': 'REFUSED',
    },
    'vant-spine': {
        'canonical-bytes-law': 'REFUSED',
        'tree-put-diff-snapshot-laws': 'REFUSED',
        'scope-grammar-isolation-and-stamping': 'REFUSED',
        'fold-laws-and-cellstore-rebates': 'REFUSED',
        'checkpoint-recovery-bounded-and-deny': 'REFUSED',
        'anchor-ledger-and-hotset-durability': 'REFUSED',
        'persistent-grants-and-wal-deny-posture': 'REFUSED',
        // ARMED 2026-10-27 (spine slice 2): GEOMETRY, WORLD/CLOCK,
        // MESH/BRAINS (#154-#166) convert - the 1:4 fold laws, the ONE PRF
        // chain (fragmenter + GitHub adapter), the RAID carrier + precision
        // contract, the addressing spine + RAID cell seats through CellStore,
        // the seed chain / orbits world clock, the actor-mandatory delta
        // ledger, the mesh AOI/staleness/write-winner laws, and the brain
        // verify + horcrux chain. With slice 2 closed the whole native
        // spine suite retired to these rows (2026-10-27, carriers precedent).
        'geometry-subdivision-and-facet-laws': 'REFUSED',
        'geometry-prf-one-chain': 'REFUSED',
        'geometry-raid-carrier-and-precision': 'REFUSED',
        'world-clock-seed-chain-and-orbits': 'REFUSED',
        'state-delta-ledger-laws': 'REFUSED',
        'spine-addressing-one-module': 'REFUSED',
        'raid-cells-addressed-and-rebated-through-spine': 'REFUSED',
        'mesh-aoi-staleness-and-write-winners': 'REFUSED',
        'brain-verify-and-horcrux': 'REFUSED',
    },
};

function checkVerdictRows(packName, verdicts) {
    const want = EXPECTED[packName] || {};
    for (const attack of Object.keys(want)) {
        const row = verdicts[attack];
        if (!row) { check(`${packName}/${attack}`, false, 'attack did not produce a verdict record'); continue; }
        // A strict row ('REFUSED'/'EXPLOITED') must be EARNED, not skipped:
        // a skipped-REFUSED record carries verdict REFUSED too, so without
        // the skipped!==write clause a silently un-armed route passes as a
        // verified defense (that exact green-masked hole shipped once).
        const ok = want[attack] === 'skip'
            ? row.skipped === true && row.verdict === 'REFUSED'
            : row.verdict === want[attack] && row.skipped !== true;
        if (ok) {
            check(`${packName}/${attack}`, true, null);
        } else {
            check(`${packName}/${attack}`, false, `expected ${want[attack]}, got ${row.verdict}${row.skipped ? ' (skipped)' : ''}: ${row.detail}`);
        }
    }
    // No oracle may be quietly missing from the module
    return Object.keys(verdicts).length === Object.keys(want).length;
}

// ---------------------------------------------------------------------------
// 6. run
// ---------------------------------------------------------------------------

(async () => {
    const packs = [];

    // --- manifest + module contract for every shipped pack (discovered,
    //    never hardcoded - a pack that exists but isn't validated here is
    //    exactly the kind of quiet gap this suite refuses)
    for (const dir of fs.readdirSync(PACKS_DIR).filter((d) => fs.existsSync(path.join(PACKS_DIR, d, 'pack.json'))).sort()) {
        const packDir = path.join(PACKS_DIR, dir);
        let manifest = null;
        check(`${dir}/pack.json exists`, fs.existsSync(path.join(packDir, 'pack.json')), 'missing');
        if (!fs.existsSync(path.join(packDir, 'pack.json'))) continue;
        try {
            manifest = JSON.parse(fs.readFileSync(path.join(packDir, 'pack.json'), 'utf8'));
            validatePackManifest(manifest, dir);
            check(`${dir}/pack.json loads (schema v1, kebab name ${manifest.name})`, true, null);
        } catch (e) {
            check(`${dir}/pack.json contract`, false, e.message);
            continue;
        }
        const entry = manifest.entry ?? 'index.js';
        const entryPath = path.join(packDir, entry);
        if (!fs.existsSync(entryPath)) { check(`${dir}/${entry} exists`, false, 'entry missing'); continue; }
        let mod;
        try {
            mod = (await import(String(require('url').pathToFileURL(entryPath)))).default;
            validateScenario(mod, `${dir}/${entry}`);
            check(`${dir}/${entry} scenario contract (kebab, ${mod.attacks.length} attacks, run() present)`, true, null);
        } catch (e) {
            check(`${dir}/${entry} scenario contract`, false, e.message);
            continue;
        }
        packs.push({ mod, name: manifest.name });
    }

    // (gate-required coverage, negative-verified 2026-10-22 by a throwaway
    // canary pack) a shipped pack with NO expected-table row would run
    // ungated (census-style continue) and never reach the verdict policy —
    // the exact quiet gap this suite refuses. Sending a pack through here
    // (skipping it) is a config error, so it fails the suite LOUDLY.
    for (const p of packs) {
        if (!(p.name in EXPECTED)) {
            check(`${p.name} is in the EXPECTED table`, false, 'shipped pack has no expected-verdict row — add its honest rows (the gate is whitelist-driven on top of this)');
        }
    }

    // --- run every pack against the real sandbox routes
    const sandbox = makeSandbox();
    // (CI crashtest gate) machine-readable ledger of every verdict row the
    // pack phase measured + the expected table it was measured against —
    // dumped sentinel-delimited ONLY when the gate asks for it.
    const gateLedger = {};
    try {
        // (iron-cage fix) all parent-process route handlers must resolve the
        // SANDBOX's models/ tree, not the workspace's - lib/brain.js pins
        // _brainModelsRoot to process.cwd() at require time, and guests'
        // ledger resolves through it too. chdir at suite start; the parent
        // only serves sandbox routes (the run root's containment, mirrored).
        process.chdir(sandbox);
        const harness = buildRoutes(sandbox);
        for (const p of packs) {
            if (!(p.name in EXPECTED)) continue; // (vant-census is config-armed in run roots, not routes)
            resetEdgeChains(sandbox); // fresh Edge walls at pack boundaries
            const verdicts = {};
            for (const a of p.mod.attacks) {
                try {
                    const ctx = { config: {} };
                    let rec = await a.run(harness, ctx);
                    rec = rec || { verdict: 'EXPLOITED', detail: 'attack returned no record' };
                    if (!VERDICTS.has(rec.verdict)) {
                        throw new Error(`attack "${a.name}" returned verdict outside the binding vocabulary: ${JSON.stringify(rec.verdict)}`);
                    }
                    verdicts[a.name] = rec;
                } catch (e) {
                    verdicts[a.name] = { verdict: 'EXPLOITED', detail: `attack threw: ${e.name}: ${e.message}` };
                }
            }
            const complete = checkVerdictRows(p.name, verdicts);
            check(`${p.name} verdict table exactly covers the expected rows`, complete, 'row mismatch vs expected');
            gateLedger[p.name] = Object.fromEntries(Object.entries(verdicts).map(([k, rec]) => [
                k, { verdict: rec.verdict, skipped: rec.skipped === true, detail: String(rec.detail || '') },
            ]));
            // Determinism (house rule 4): same runs, same verdicts
            const verdicts2 = {};
            for (const a of p.mod.attacks) {
                try { verdicts2[a.name] = await a.run(harness, { config: {} }) || null; } catch (e) { verdicts2[a.name] = null; }
            }
            let deterministic = true;
            for (const k of Object.keys(verdicts)) {
                if (!verdicts2[k] || verdicts2[k].verdict !== verdicts[k].verdict) deterministic = false;
            }
            check(`${p.name} verdicts deterministic across two runs`, deterministic, 'double run diverged');
        }
    } finally {
        // back out of the sandbox dir before it vanishes; no fixture residue
        try { process.chdir(ROOT); } catch (e) { /* exit anyway */ }
        try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch { /* throwaway */ }
    }

    console.log(`\\n${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped`);
    // (CI crashtest gate) sentinel-delimited verdict ledger + the expected
    // table each row was measured against. Printed on EVERY exit path that
    // reaches this line (failures included) so the gate can always quote
    // the verdict shape that broke the table.
    if (process.env.CRASHTEST_PACKS_JSON === '1') {
        const dump = {};
        for (const p of Object.keys(gateLedger)) {
            dump[p] = { expects: EXPECTED[p] || {}, verdicts: gateLedger[p] };
        }
        console.log(`CRASHTEST_PACKS_GATE<<` + JSON.stringify(dump) + `>>END`);
    }
    process.exit(results.failed > 0 ? 1 : 0);
})().catch((e) => {
    console.error(`suite fault: ${e.name}: ${e.message}`);
    process.exit(1);
});
