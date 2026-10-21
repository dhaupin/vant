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
}

async function edgeRoundTrip(chain, spec) {
    const events = require('events');
    const req = new events.EventEmitter();
    req.method = String(spec.method || 'GET').toUpperCase();
    req.url = String(spec.url || '/');
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

    // Pending oracles stay UNREGISTERED (now only trust-read and
    // brain-graph-walk): the packs degrade via route-absence
    // (skipped-REFUSED) - a 501 shim IS a 5xx to the fuzz floor. Absence
    // is the honest shape.
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
        // LIVE FINDING (measured on axolotl, #232 class): corrupt/absent
        // state.json silently defaults AND the private-pinned identity read
        // resolves the PUBLIC file while reporting source 'private'.
        // (fixed 2026-10-22 for the CLI/pointer half via commit fb3eadf;
        // the read-path silent fallback row stays a finding until its own
        // fix lands - the pin keeps biting.)
        'state-tamper-is-loud': 'EXPLOITED',
        // LIVE FINDING (measured on axolotl, #233 expansion 1): wrong-typed
        // stack/self-pointer values survive into the runtime brain pointer.
        'state-json-schema-strictness': 'EXPLOITED',
        'migration-idempotency': 'REFUSED',
        'guest-capability-gates': 'REFUSED',
        // deferred oracle rows - honest skip either way (501 routes);
        // boot-stone-integrity armed 2026-10-24 via stone-restore-tamper
        'succession-trust-inheritance': 'skip',
        'boot-stone-integrity': 'REFUSED',
        'knowledge-links-cycle-safety': 'skip',
    },
    'vant-crew': {
        'roster-quota-ceiling': 'REFUSED',
        'spawn-rate-limit': 'REFUSED',
        'quota-error-is-typed': 'REFUSED',
    },
    'vant-mcp': {
        'unknown-tool-honesty': 'REFUSED',
        'tool-schema-enforced': 'REFUSED',
        'brain-write-scope-hardness': 'REFUSED',
    },
    // Survey candidates still pending run-root wiring (501 routes): the
    // attacks are written, the verdict rows are honest skips until armed.
    // So are the vant-rest/vant-stones rows - VALIDATED 2026-10-24 (the
    // routes below arm them here too). The vad-stones lineage row is a
    // LIVE FINDING pin: lib/transform.gather scopes the brain inventory
    // but leaves the live currentBrain/activeStack unfiltered, so a
    // single-brain stone carries a pointer outside its scope (#226
    // mint-side silence, measured from the sealed payload). Fix => flip.
    'vant-rest': {
        'fuzz-floor-never-500': 'REFUSED',
        'cors-enable-parity': 'REFUSED',
        'session-cookie-discipline': 'REFUSED',
    },
    'vant-stones': {
        'stone-scope-honesty': 'REFUSED',
        'state-pointer-lineage': 'EXPLOITED',
        'restore-torn-refusal': 'REFUSED',
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

    // --- run every pack against the real sandbox routes
    const sandbox = makeSandbox();
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
    process.exit(results.failed > 0 ? 1 : 0);
})().catch((e) => {
    console.error(`suite fault: ${e.name}: ${e.message}`);
    process.exit(1);
});
