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
const PROBE_CHILD = `
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
    process.stdout.write(JSON.stringify(out));
})().catch((e) => { process.stdout.write(JSON.stringify({ error: e.name + ': ' + e.message })); });
`;

// Crew probe: drive lib/agents.spawn against the sandbox registry
// (re PACK SURVEY). Registry-level only - spawn creates agent records, no
// OS processes. Facts reported neutral: resolved cap, attempts, which typed
// errors fired, final roster.
const CREW_CHILD = `
(async () => {
    const agents = require('./lib/agents.js');
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
    } catch (e5) { out.rateError = out.rateError || ('drain probe threw: ' + e5.name); }
    try {
        const roster = agents.list();
        out.rosterSize = roster.length;
        out.rosterNames = roster.map((a) => a.name);
    } catch (e6) { out.rosterSize = names.length; }
    process.stdout.write(JSON.stringify(out));
})().catch((e) => { process.stdout.write(JSON.stringify({ error: e.name + ': ' + e.message })); });
`;

// MCP probe: drive lib/mcp.execute directly (the exact dispatcher the
// /mcp/exec door rides). Calls arrive as a JSON array [{ tool, params }];
// each result is reported verbatim, plus an escape-file check for
// brain_write probes (the test watches for files landing OUTSIDE the
// brain tree). Never sockets.
const MCP_CHILD = `
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
    process.stdout.write(JSON.stringify({ results, escapedFile, escapedPath: escape }));
})().catch((e) => { process.stdout.write(JSON.stringify({ error: e.name + ': ' + e.message })); });
`;

// ---------------------------------------------------------------------------
// 4. the shim routes (the run root Rook proposed) - real vant libs.
// ---------------------------------------------------------------------------

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
            r = await brain.read(j.name, j.brain ? { brain: j.brain } : {});
        } catch (e) {
            return new Response(JSON.stringify({ error: e.name + ': ' + e.message }), { status: 500 });
        }
        return new Response(JSON.stringify({
            content: r && r.content != null ? String(r.content) : null,
            source: r ? r.source ?? null : null,
            path: r ? r.path ?? null : null,
        }), { status: 200 });
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
        return new Response(outText, { status: 200 });
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
        return new Response(JSON.stringify({
            dryTouch: beforeDry.join('') !== afterDry.join('') ? 1 : 0,
            secondTouch: before2.filter(f => !after2.includes(f)).length + after2.filter(f => !before2.includes(f)).length,
            secondApplied: (second && second.applied || []).length,
            secondDryPlanned: dryRunApplied,
        }), { status: 200 });
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
        return new Response(JSON.stringify(out), { status: 200 });
    });

    routes.registerRoute('trust-read', async () => new Response(JSON.stringify({ error: 'not armed: trust floor wiring pending validation on a run root' }), { status: 501 }));
    routes.registerRoute('stone-restore-tamper', async () => new Response(JSON.stringify({ error: 'not armed: stone fixture pending validation on a run root' }), { status: 501 }));
    routes.registerRoute('brain-graph-walk', async () => new Response(JSON.stringify({ error: 'not armed: graph walk pending validation on a run root' }), { status: 501 }));

    // Pack-survey gap-fills (2026-10-22): crew + mcp routes armed here are
    // REAL (fresh-module probe children in the sandbox, same shape as the
    // brain-state probe); rest + stones routes stay 501-honest.
    routes.registerRoute('crew-run', async () => {
        let outText;
        try {
            outText = execFileSync('node', ['-e', CREW_CHILD], { cwd: sb, timeout: 60000, encoding: 'utf8', env: { ...process.env, VANT_GATE_QUIET: '1' } });
        } catch (e) {
            return new Response(JSON.stringify({ error: `crew probe child failed: ${String(e.stderr || e.message).slice(0, 200)}` }), { status: 500 });
        }
        return new Response(outText, { status: 200 });
    });
    routes.registerRoute('mcp-exec', async (ctx) => {
        const j = await ctx.request.json().catch(() => ({}));
        let outText;
        try {
            outText = execFileSync('node', ['-e', MCP_CHILD, JSON.stringify(Array.isArray(j.calls) ? j.calls : [])], { cwd: sb, timeout: 60000, encoding: 'utf8', env: { ...process.env, VANT_GATE_QUIET: '1' } });
        } catch (e) {
            return new Response(JSON.stringify({ error: `mcp probe child failed: ${String(e.stderr || e.message).slice(0, 200)}` }), { status: 500 });
        }
        return new Response(outText, { status: 200 });
    });
    routes.registerRoute('rest-request', async () => new Response(JSON.stringify({ error: 'not armed: lib/server stack wiring pending validation on a run root' }), { status: 501 }));
    routes.registerRoute('stone-scope', async () => new Response(JSON.stringify({ error: 'not armed: seal/decode fixture pending validation on a run root' }), { status: 501 }));
    routes.registerRoute('stone-tamper', async () => new Response(JSON.stringify({ error: 'not armed: seal/decode fixture pending validation on a run root' }), { status: 501 }));
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
        // deferred oracle rows - honest skip either way (501 routes)
        'succession-trust-inheritance': 'skip',
        'boot-stone-integrity': 'skip',
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
    'vant-rest': {
        'fuzz-floor-never-500': 'skip',
        'cors-enable-parity': 'skip',
        'session-cookie-discipline': 'skip',
    },
    'vant-stones': {
        'stone-scope-honesty': 'skip',
        'state-pointer-lineage': 'skip',
        'restore-torn-refusal': 'skip',
    },
};

function checkVerdictRows(packName, verdicts) {
    const want = EXPECTED[packName] || {};
    for (const attack of Object.keys(want)) {
        const row = verdicts[attack];
        if (!row) { check(`${packName}/${attack}`, false, 'attack did not produce a verdict record'); continue; }
        const ok = want[attack] === 'skip'
            ? row.skipped === true && row.verdict === 'REFUSED'
            : row.verdict === want[attack];
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

    // --- run vant-brain against the real sandbox routes
    const sandbox = makeSandbox();
    try {
        const harness = buildRoutes(sandbox);
        for (const p of packs) {
            if (!(p.name in EXPECTED)) continue; // (vant-census is config-armed in run roots, not routes)
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
        // no fixture residue
        try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch { /* throwaway */ }
    }

    console.log(`\\n${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped`);
    process.exit(results.failed > 0 ? 1 : 0);
})().catch((e) => {
    console.error(`suite fault: ${e.name}: ${e.message}`);
    process.exit(1);
});
