#!/usr/bin/env node
/**
 * crashtest-run.js - run THIS REPO'S attack packs against VANT ITSELF.
 *
 * A real crashtest run root, zero install steps:
 *
 *   - packs load through crashtest v1.1.0's REAL pack loader + Harness
 *     (not the micro-harness in test/crashtest-packs.test.js);
 *   - the target is vant's own lib graph, exercised in a throwaway sandbox
 *     (same fixture shape as the contract suite - the workspace never
 *     touches its own models/ tree);
 *   - every attack verdict prints to the HONEST LEDGER: verdict, detail,
 *     and explicit skips for routes the run root does not arm.
 *
 * The one law holds all the way down: routes are in-process handler calls;
 * the four probe-child surfaces (brain-state tamper probes, crew registry
 * probes, mcp dispatcher probes, stones seal/decode probes) are forked node
 * processes against the copied sandbox lib - forks, never sockets.
 *
 * Usage:
 *   node scripts/crashtest-run.js                 # auto-find the crashtest clone
 *   CRASHTEST_DIR=/path/to/crashtest node scripts/crashtest-run.js
 *   node scripts/crashtest-run.js --pack=vant-brain   # run one pack
 *
 * Exit 0 always unless the run itself faults; EXPLOITED findings are
 * honest results (the pinned ones are the documented leaders in
 * packs/README.md), so CI policy stays a caller decision.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');

// (CI policy) the KNOWN-FINDING whitelist: honest EXPLOITED verdicts that
// are documented, pinned findings — not regressions. Under
// CRASHTEST_RUN_POLICY=strict the run exits 4 for any pack finding outside
// this set (library findings keep their exit 3); without the env var the
// default behavior is byte-identical to before (findings exit 0 always).
const KNOWN_FINDINGS = new Set([
    // Whitelist is EMPTY as of the 2026-10-22 read-side trust gate: every
    // oracle measures REFUSED (or an honest bounded skip). If a new genuine
    // finding gets measured and pinned, its line belongs here and in
    // test/ci-crashtest-gate.js ALLOWED_FINDINGS — both in the same commit,
    // and deleted together when its fix lands.
]);

// --- locate crashtest. npm is the consumption path now (crashtest@1.1.0
// --- is the devDependency - the v1.0.x→v1.1.0 adoption step of the
// --- S0→S1 campaign, #249: the two-pod broker, expectation tables,
// --- lint-determinism preflight, and the memory/governance module
// --- families are all in this line); the clone stays the
// --- HEAD-testing fallback.

function findCrashtestDir() {
    if (process.env.CRASHTEST_DIR && fs.existsSync(path.join(process.env.CRASHTEST_DIR, 'src', 'packs', 'loader.js'))) {
        return process.env.CRASHTEST_DIR;
    }
    for (const candidate of [
        path.dirname(require.resolve('crashtest/package.json')),
        path.resolve(ROOT, '..', 'crashtest'),
        path.resolve(ROOT, '.agent_tmp', 'crashtest'),   // the working clone this workspace keeps
        path.resolve(os.homedir(), 'crashtest'),
    ]) {
        if (fs.existsSync(path.join(candidate, 'src', 'packs', 'loader.js'))) return candidate;
    }
    console.error('crashtest not found: install it (bun/npm add -d crashtest), clone github.com/dhaupin/crashtest next to this repo, or set CRASHTEST_DIR=/path/to/crashtest');
    process.exit(1);
}

main().catch((e) => { console.error(`run-root fault: ${e.name}: ${e.message}`); process.exit(1); });

async function main() {
    const CT_DIR = findCrashtestDir();
    const harnessMod = await import(pathToFileURL(path.join(CT_DIR, 'src', 'harness', 'harness.js')).href);
    const packsMod = await import(pathToFileURL(path.join(CT_DIR, 'src', 'packs', 'loader.js')).href);
    const contractMod = await import(pathToFileURL(path.join(CT_DIR, 'src', 'scenarios', 'contract.js')).href);

    const sb = makeSandbox();
    // (iron-cage fix) ALL parent-process route handlers must resolve the
    // SANDBOX's models/ tree, not the workspace's - lib/brain.js pins
    // _brainModelsRoot to process.cwd() at require time, and requiring the
    // sandbox copy from the repo-root cwd silently pointed every read at
    // the WORKSPACE's own brain files (the fixture canaries never armed).
    // chdir at sandbox creation; the parent only serves sandbox routes.
    process.chdir(sb);
    try {
        const seen = new Map();
        // (owner ask, 2026-10-23) CRASHTEST_SWEEP_DEFAULTS=1 re-measures the
        // npm wide-sweep packs (qs-shapes / vite-dev-shapes /
        // next-middleware-shapes / cve-feed / wp lanes) against the FULL
        // armed run root - cve-feed's banner halfrides declared routes, so
        // arming IS declaring. Opt-in so the standing CI ledger keeps its
        // sampled shape; the probe-coverage table in packs/README.md cites
        // the env var.
        const loadDirs = [path.join(ROOT, 'packs')];
        // the loader scans public/ + local/ UNDER each root, so the crate's
        // default packs ride ITS packs root
        if (process.env.CRASHTEST_SWEEP_DEFAULTS === '1') loadDirs.push(path.join(CT_DIR, 'packs'));
        const loaded = await packsMod.loadPacks(loadDirs, seen);
        const onlyPack = (process.argv.find((a) => a.startsWith('--pack=')) || '').replace('--pack=', '') || null;
        const packs = onlyPack ? loaded.filter((p) => p.manifest.name === onlyPack) : loaded;
        if (!packs.length) {
            console.error(onlyPack ? `pack "${onlyPack}" not found in ${path.join(ROOT, 'packs')}` : 'no packs found');
            process.exit(1);
        }
        const harness = buildRoutes(sb, harnessMod.Harness);
        const ctx = { config: {} };

        console.log(`=== crashtest run-root: ${packs.length} pack(s) against vant (harness: ${CT_DIR}) ===`);            const summaries = [];
            const exploitedAttackIds = [];
        for (const p of packs) {
            contractMod.validateScenario(p.module, `${p.origin}/${p.manifest.entry}`);
            const planLabel = `pack:${p.origin}`;
            console.log(`\n--- ${planLabel} :: ${p.manifest.name} v${p.manifest.version} (${p.module.attacks.length} attacks)`);
            const verdicts = { REFUSED: 0, EXPLOITED: 0, BOUNDED: 0, SKIPPED: 0 };
            const exploitedDetails = [];
            for (const a of p.module.attacks) {
                let rec;
                try {
                    rec = await a.run(harness, ctx);
                } catch (e) {
                    rec = { verdict: 'EXPLOITED', detail: `attack threw: ${e.name}: ${e.message}` };
                }
                rec = rec || { verdict: 'EXPLOITED', detail: 'attack returned no record' };
                const skipped = rec.skipped === true;
                if (skipped) verdicts.SKIPPED++;
                else if (verdicts[rec.verdict] != null) verdicts[rec.verdict]++;
                const isFinding = rec.verdict === 'EXPLOITED' && !skipped;
                console.log(`  ${skipped ? '·' : isFinding ? '✗' : '✓'} ${p.manifest.name}/${a.name}: ${String(rec.detail).slice(0, 130)}${isFinding ? '  <- FINDING' : skipped ? ' (skipped)' : ''}`);
                if (isFinding) {
                    exploitedDetails.push(`${a.name}: ${rec.detail}`);
                    exploitedAttackIds.push(`${p.manifest.name}/${a.name}`);
                }
            }
            summaries.push({ pack: p.manifest.name, verdicts, exploited: exploitedDetails });
        }

        console.log('\n=== ledger ===');
        let totalExploited = 0;
        for (const s of summaries) {
            console.log(`${s.pack}: REFUSED ${s.verdicts.REFUSED}, EXPLOITED ${s.verdicts.EXPLOITED}, BOUNDED ${s.verdicts.BOUNDED}, skipped ${s.verdicts.SKIPPED}`);
            totalExploited += s.verdicts.EXPLOITED;
            for (const det of s.exploited) console.log(`  finding: ${det}`);
        }
        console.log(totalExploited > 0
            ? `\n${totalExploited} EXPLOITED finding(s) — honest findings above; the pinned rows and their status live in packs/README.md's tables.`
            : '\nZero findings: every armed oracle held.');

        // --- library-row phase: crashtest's OWN scenario library rows
        // --- (input/guards/taxonomy/volume/...) against the row-agnostic
        // --- armed shim routes — "other examples/attacks from crashtest
        // --- against vant", riding the same harness and one law.
        const libDir = path.join(CT_DIR, 'src', 'scenarios', 'library');
        if (fs.existsSync(libDir)) {
        const armedRoutes = ['brain-read', 'brain-state', 'brain-migrate', 'guest-cap', 'crew-run', 'mcp-exec',
        'vant-rest-open', 'vant-rest-priv', 'vant-rest-priv-alias', 'vant-login', 'vant-me', 'vant-logout',
        'stone-scope', 'stone-tamper', 'stone-restore-tamper', 'rest-request', 'trust-read', 'brain-graph-walk',
        'home-summary', 'home-admin', 'memory-note-write', 'memory-note-read', 'memory-note-delete',
        'gov-grant', 'gov-resolve', 'gov-locks', 'gov-escrow', 'mcp-server-wall', 'relay-edge'];
        // Per-module route vocabulary: rows whose ctx names are not `route`
        // get the vant-armed route that speaks their contract (privileged
        // authz gate, cookie session verbs, deep/regex Edge probes). The
        // D1/KV-shaped rows (race, state, upload) pin their ctx routes and
        // arm EXACTLY when the run root can state a D1/KV binding - here
        // that is the harness fixture env (LIBRARY_ENV_SPEC, ctx.env.DB /
        // ctx.env.UPLOADS); a run root with real bindings would name them
        // in the spec instead. No binding -> same flags arm nothing and the
        // rows degrade to honest skipped-REFUSED.
        const LIBRARY_ROUTE_CTX = {
            authz: { privilegedRoute: 'vant-rest-priv', aliasRoute: 'vant-rest-priv-alias' },
            session: { loginRoute: 'vant-login', meRoute: 'vant-me', logoutRoute: 'vant-logout' },
            recursion: { deepRoute: 'vant-rest-open', regexRoute: 'vant-rest-open' },
            race: { submitRoute: 'charge', embedRoute: 'profile' },
            state: { route: 'device', mustDenyIds: ['rook-device-77', 'rook-device-88'] },
            upload: { route: 'upload' },
            // (B0 arms, #249) vant's REAL note store + grant ledger + locks.
            // deleteRoute is now DECLARED: lib/memory.forget() gives the
            // K/V a per-note delete with tombstone residue (B0 fix pass).
            // staleToken stays undeclared (vant's fence tokens are
            // pid-borne) — the fencing row honest-skips naming the knob.
            memory: { writeRoute: 'memory-note-write', readRoute: 'memory-note-read', deleteRoute: 'memory-note-delete', readStyle: 'body' },
            // (B0 arms, #249) ttlMode is vant's DOCUMENTED lock past-TTL
            // behavior: a hold keeps the resource until the lock's mtime
            // breaches the staleness window (staleMs) — "held" inside it,
            // takeoverable after. At the row's ttl:0 arm the fresh writer
            // happens within the window, so the truthful declaration is
            // 'held', not 'free' (the old declaration graded vant against
            // a semantics nobody documented). escrowRoute rides vant's real
            // escrow door: releases for the 'escrow-release:*' family are
            // two-key gated (the crate's distinct-approver law), ttl rides
            // per-approval windows.
            governance: { grantsRoute: 'gov-grant', resolveRoute: 'gov-resolve', locksRoute: 'gov-locks', escrowRoute: 'gov-escrow', ttlMode: 'held' },
        };
            const entries = fs.readdirSync(libDir).filter((f) => f.endsWith('.js')).sort();
            console.log(`\n=== crashtest scenario library rows against the armed routes (${armedRoutes.length} routes; D1/KV bindings armed: ${harness.env && harness.env.DB && harness.env.UPLOADS ? 'DB+UPLOADS' : 'none'}) ===`);
            let libRefused = 0, libExploited = 0, libSkipped = 0;
            const libFindings = [];
            let modIndex = 0;
            for (const file of entries) {
                let mod;
                try { mod = (await import(pathToFileURL(path.join(libDir, file)).href)).default; }
                catch (e) { console.log(`  · ${file}: library module failed to import (${e.name}) - skipped`); continue; }
                try { contractMod.validateScenario(mod, `library/${file}`); }
                catch (e) { console.log(`  · ${file}: contract invalid (${e.message}) - skipped`); continue; }
                let attackIdx = 0;
                for (const a of mod.attacks) {
                    let rec;
                    try {
                        // deterministic route rotation: every library row gets
                        // coverage across the armed shim routes
                        const route = armedRoutes[(modIndex + attackIdx) % armedRoutes.length];
                        // (fresh-fixture law) one clean Edge wall per attack:
                        // QoS/escrow counters rebuilt between rows, intact
                        // within one
                        resetEdgeChains(sb);
                        rec = await a.run(harness, { config: {}, route, ...(LIBRARY_ROUTE_CTX[mod.name] || {}) });
                    } catch (e) { rec = { verdict: 'EXPLOITED', detail: `library attack threw: ${e.name}: ${e.message}` }; }
                    attackIdx++;
                    rec = rec || { verdict: 'EXPLOITED', detail: 'no record' };
                    const skipped = rec.skipped === true;
                    if (skipped) { libSkipped++; continue; }
                    const isFinding = rec.verdict === 'EXPLOITED';
                    if (isFinding) { libExploited++; libFindings.push(`${mod.name}/${a.name}: ${rec.detail}`); }
                    else libRefused++;
                    console.log(`  ${isFinding ? '✗' : '✓'} ${mod.name}/${a.name}: ${String(rec.detail).slice(0, 120)}${isFinding ? '  <- FINDING' : ''}`);
                }
                modIndex++;
            }
            console.log(`library rows: REFUSED ${libRefused}, EXPLOITED ${libExploited}, skipped ${libSkipped}`);
            for (const f of libFindings) console.log(`  finding: ${f}`);
            if (libExploited > 0) process.exitCode = 3; // library findings = real defects worth surfacing apart from pack findings
        }

        // --- (CI policy) strict mode: the whitelist above is the only
        // --- carve-out; any OTHER pack finding fails the gate. Kept after
        // --- the library phase so an unknown finding (4) outranks a
        // --- library finding (3) in the exit-code ordering.
        if (process.env.CRASHTEST_RUN_POLICY === 'strict') {
            const unknown = exploitedAttackIds.filter((id) => !KNOWN_FINDINGS.has(id));
            if (unknown.length) {
                console.error(`\nstrict policy: ${unknown.length} finding(s) outside the known-finding whitelist:`);
                for (const id of unknown) console.error(`  unknown finding: ${id} — gate FAILS (pin it or fix it)`);
                process.exitCode = 4;
            }
        }
    } finally {
        // no fixture residue
        try { fs.rmSync(sb, { recursive: true, force: true }); } catch { /* throwaway */ }
    }
}

// --- the vant sandbox (throwaway; lib copy + fixture brain + package.json)

function makeSandbox() {
    const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-ct-run-'));
    fs.cpSync(path.join(ROOT, 'lib'), path.join(sb, 'lib'), { recursive: true, dereference: true });
    fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(sb, 'package.json'));
    try { fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(sb, 'node_modules'), 'dir'); } catch { /* there */ }
    fs.mkdirSync(path.join(sb, 'models', 'private', 'vant'), { recursive: true });
    fs.mkdirSync(path.join(sb, 'models', 'public', 'vant'), { recursive: true });
    fs.writeFileSync(path.join(sb, 'models', 'private', 'vant', 'identity.md'), 'PRIVATE-CANARY');
    fs.writeFileSync(path.join(sb, 'models', 'public', 'vant', 'identity.md'), 'PUBLIC-CANARY');
    fs.writeFileSync(path.join(sb, 'models', 'state.json'), JSON.stringify({ stack: ['vant'], currentBrain: 'vant' }));
    return sb;
}

// --- shim routes (the same run-root contract the packs document; the
// --- brain-state/crew/mcp routes drive fresh-module probe children).

// (JSON-only stdout law) vant's own libs log on stdout ([COMPUTE], [INFO]
// lines); polluting JSON stdout made the run root's parseJson fail and
// honest routes read as "not armed". All noise goes to stderr.
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
    if (states[tamper] === null) { try { fs.unlinkSync(statePath); } catch (e) {} }
    else fs.writeFileSync(statePath, states[tamper]);
    delete require.cache[require.resolve('./lib/brain.js')];
    const brain = require('./lib/brain.js');
    const out = { stack: null, currentBrain: null, reads: [] };
    try { out.stack = brain.getStack(); } catch (e) { out.stack = 'THREW: ' + e.name; }
    try { out.currentBrain = await brain.getCurrentBrain(); } catch (e) { out.currentBrain = 'THREW: ' + e.name; }
    try {
        const r = await brain.read('identity', {});
        out.reads.push({ pinnedType: 'private', content: r ? String(r.content ?? '') : null, resolvedPath: r ? String(r.path ?? '') : null });
    } catch (e) { out.reads.push({ pinnedType: 'private', THREW: e.name + ': ' + e.message }); }
    process.stdout.write('VANT_CT_JSON<<' + JSON.stringify(out) + '>>END');
})().catch((e) => { process.stdout.write(JSON.stringify({ error: e.name + ': ' + e.message })); });
`;

const CREW_CHILD = `${CHILD_STDOUT_GUARD}
(async () => {
    // (run-root posture) the crew pack budgets REGISTRY QUOTAS, not the
    // sandbox gate - the shim opens defaultSandbox explicitly (same posture
    // vant's own snapshot-guard suite uses) so spawns reach the budget
    // logic under test instead of bouncing at canSpawn.
    try {
        require('./lib/sandbox').defaultSandbox.setCapabilities({
            canRead: true, canWrite: true, canSpawn: true, canNetwork: true
        });
    } catch (e0) { }
    const agents = require('./lib/agents.js');
    // (fresh-fixture law) attacks run against the SAME sandbox in one
    // process - drain the prior attack's roster so every run sees the
    // declared cap from zero, not another probe's leftovers.
    try { for (const a of agents.list()) { try { agents.kill(a.id); } catch (e1) { } } } catch (e2) { }
    const out = { attempts: 0, capError: null, rateError: null, rateLimit: 10, rosterSize: 0, rosterNames: [] };
    try { const cfg = require('./lib/config.js'); out.rateLimit = (cfg && cfg.get) ? cfg.get('agents.spawnRateLimit', 10) : 10; } catch (e2) {}
    try { const internal = require('./lib/agents/internal.js'); out.cap = internal._getMaxAgents ? internal._getMaxAgents() : 10; } catch (e4) { out.cap = 10; }
    const names = [];
    for (let i = 0; i < out.cap + 2; i++) {
        const r = agents.spawn({ name: 'pack-cw-' + i, role: 'Tester', type: 'default' });
        out.attempts = i + 1;
        if (r && r.error) {
            if (!out.capError && /quota/i.test(r.error)) out.capError = r.error;
            if (!out.rateError && /rate limit/i.test(r.error)) out.rateError = r.error;
            break;
        }
        names.push('pack-cw-' + i + (r && r.id ? ':' + r.id : ''));
    }
    try {
        const first = names[0];
        const idForFirst = first && String(first).split(':')[1];
        if (idForFirst) {
            agents.kill(idForFirst);
            const r2 = agents.spawn({ name: 'pack-cw-rate', role: 'Tester', type: 'default' });
            if (r2 && r2.error && /rate limit/i.test(r2.error)) out.rateError = r2.error;
        }
    } catch (e5) { out.rateError = out.rateError || ('drain probe threw: ' + e5.name); }
    try { const roster = agents.list(); out.rosterSize = roster.length; out.rosterNames = roster.map((a) => a.name); } catch (e6) { out.rosterSize = names.length; }
    process.stdout.write('VANT_CT_JSON<<' + JSON.stringify(out) + '>>END');
})().catch((e) => { process.stdout.write(JSON.stringify({ error: e.name + ': ' + e.message })); });
`;

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
    const escape = path.resolve('vant-mcp-escape-canary.md');
    const escapedFile = fs.existsSync(escape) ? 'vant-mcp-escape-canary.md' : null;
    process.stdout.write('VANT_CT_JSON<<' + JSON.stringify({ results, escapedFile, escapedPath: escape }) + '>>END');
})().catch((e) => { process.stdout.write(JSON.stringify({ error: e.name + ': ' + e.message })); });
`;

// (Phase A wire-surface slice, #249) The r/2 EDGE FACE probe: drives
// web/relay/functions/api/r/relay.ts's REAL onRequestPost in-process
// (WHATWG Request/Response, WebCrypto HMAC - no sockets, no deploy). The
// handler is TypeScript, so this child runs under Node's
// --experimental-strip-types and speaks the row's SHAPE table:
// { shapes: [{ name, env, request: { url, method, headers, body } }] }
// -> { results: [{ name, status, bodyText }] }. The patient is vant's
// actual edge posture gate/key gate/HMAC lane/freshness window/origin
// guard - the same needles the native relay lanes pin.
const RELAY_CHILD = `
(async () => {
    // (NOTE argv[2]/stdin) this child is a FILE invocation — node child.mjs
    // <spec> — so the spec rides argv[2]; but a 1 MiB shape body crosses
    // Linux's 128 KiB single-argv limit (E2BIG), so the DOWNSIDE-safe spec
    // is read from STDIN when the argv is absent (execFileSync input option).
    const spec = await (async () => {
        let raw = process.argv[2] || '';
        if (!raw && !process.stdin.isTTY) {
            raw = await new Promise((resolve) => {
                let s = '';
                process.stdin.setEncoding('utf8');
                process.stdin.on('data', (d) => { s += d; });
                process.stdin.on('end', () => resolve(s));
            });
        }
        try { return JSON.parse(raw || '{}'); } catch (e) { return {}; }
    })();
    const shapes = Array.isArray(spec.shapes) ? spec.shapes : [];
    const results = [];
    let mod = null;
    try {
        // the handler path rides the SPEC argv: heredoc children stay
        // interpolation-free (this child is plain JS written verbatim)
        const handlerPath = String(spec.handlerPath || '').slice(0, 400);
        if (!handlerPath) throw new Error('relay spec missing handlerPath');
        mod = await import('file:///' + handlerPath.split(String.fromCharCode(92)).join('/'));
    } catch (e0) {
        process.stdout.write('VANT_CT_JSON<<' + JSON.stringify({ error: 'relay handler import failed: ' + e0.name + ': ' + e0.message }) + '>>END');
        return;
    }
    const h = mod.onRequestPost;
    for (const shape of shapes) {
        const row = { name: String(shape.name || '').slice(0, 60), status: null, bodyText: '' };
        try {
            const url = String(shape.request.url || 'https://relay-edge.local/api/r/relay');
            const init = {
                method: String(shape.request.method || 'POST'),
                headers: shape.request.headers || {},
            };
            if (shape.request.body != null) init.body = String(shape.request.body);
            const context = {
                request: new Request(url, init),
                env: shape.env || {},
                params: {},
                data: {},
                next: async () => new Response('no next route', { status: 404 }),
                waitUntil: () => {},
            };
            const res = await h(context);
            row.status = res.status;
            row.bodyText = String(await res.text()).slice(0, 500);
        } catch (e1) {
            row.status = 'THREW';
            row.bodyText = String(e1.name + ': ' + e1.message).slice(0, 200);
        }
        results.push(row);
    }
    process.stdout.write('VANT_CT_JSON<<' + JSON.stringify({ results }) + '>>END');
})().catch((e) => { process.stdout.write(JSON.stringify({ error: e.name + ': ' + e.message })); });
`;

// (Phase A wire-surface slice, #249) The dashboard AUTH-door probe:
// drives web/dashboard/functions/api/auth/{request,verify}-otp.ts +
// session.ts's REAL handlers in-process (WHATWG Request/Response,
// WebCrypto — strip types like the relay child). Two shim seats ride
// every shape's env:
//   Bolete_KV  – an in-child KVStore shim (Map rows + the record-level
//                expiry fields the accounts layer reads; put()'s ttl is
//                remembered so the get() leg stays time-honest)
//   sink       – a capture fetch standing in the CONFIGURED sender's
//                webhook seat: it answers ok and records the code it
//                saw. The pack's marker law: a body code of "__CODE__"
//                gets that captured code substituted in the SAME ride,
//                and useMintedCookie forwards the ride's last
//                Set-Cookie as Cookie.
const DASH_CHILD = `
(async () => {
    let raw = process.argv[2] || '';
    if (!raw && !process.stdin.isTTY) {
        raw = await new Promise((resolve) => {
            let s = '';
            process.stdin.setEncoding('utf8');
            process.stdin.on('data', (d) => { s += d; });
            process.stdin.on('end', () => resolve(s));
        });
    }
    let spec = {};
    try { spec = JSON.parse(raw || '{}'); } catch (e) { spec = {}; }
    const shapes = Array.isArray(spec.shapes) ? spec.shapes : [];
    const dir = String(spec.handlerDir || '').slice(0, 400);
    const results = [];
    let handlers = null;
    let libBridge = null;
    let libGuard = null;
    try {
        const urls = ['request-otp', 'verify-otp', 'session'].map((n) =>
            'file:///' + (dir + '/' + n + '.ts').split(String.fromCharCode(92)).join('/'));
        // (batch 2) the bridge knee + the admin gate live in functions/lib/
        const libDir = dir.replace('/api/auth', '').replace(/\\+$/, '');
        const url = (base, seg) => 'file:///' + (base + '/' + seg).split(String.fromCharCode(92)).join('/');
        const mReq = await import(urls[0]);
        const mVer = await import(urls[1]);
        const mSes = await import(urls[2]);
        libBridge = await import(url(libDir, 'lib/bridge.ts'));
        libGuard = await import(url(libDir, 'lib/auth_guard.ts'));
        handlers = {
            'request-otp': ({ method }) => (method === 'GET' ? mReq.onRequestGet : mReq.onRequestPost),
            'verify-otp': ({ method }) => (method === 'GET' ? mVer.onRequestGet : mVer.onRequestPost),
            'session': ({ method }) => (method === 'DELETE' ? mSes.onRequestDelete : mSes.onRequestGet),
        };
    } catch (e0) {
        process.stdout.write('VANT_CT_JSON<<' + JSON.stringify({ error: 'dashboard handler import failed: ' + e0.name + ': ' + e0.message }) + '>>END');
        return;
    }
    function makeStore() {
        const rows = new Map();
        return {
            async get(k) {
                const r = rows.get(k);
                if (!r) return null;
                if (r.expiresAt != null && Date.now() > r.expiresAt) { rows.delete(k); return null; }
                return r.value;
            },
            async put(k, v, o) {
                const ttl = o && o.expirationTtl != null ? Number(o.expirationTtl) : null;
                rows.set(String(k), { value: String(v), expiresAt: ttl != null && Number.isFinite(ttl) ? Date.now() + ttl * 1000 : null });
            },
            async delete(k) { rows.delete(String(k)); },
            async list(prefix) {
                const out = [];
                for (const k of rows.keys()) if (String(k).startsWith(String(prefix))) out.push({ name: k });
                return out;
            },
        };
    }
    let captured = null;   // the code the sink saw in THIS ride
    let mintedCookie = ''; // the ride's last session Set-Cookie ("name=value")
    const seatCookies = {}; // named per verify shape ("ok-admin" etc) so a later gate shape can ride ONE minted session by name
    const rideStore = makeStore(); // ONE store per ride: the walk shapes (mint -> verify -> session) mutate the SAME rows, like one browser session against the deployment. Attacks spawn fresh children, so rides stay isolated.
    for (const shape of shapes) {
        const row = { name: String(shape.name || '').slice(0, 60), status: null, bodyText: 'none', headers: {}, capture: null };
        try {
            const env = Object.assign({}, shape.env || {});
            if (env.bolete !== false) env.BOLETE_KV = rideStore;
            if (env.bolete === false) delete env.bolete;
            const wantSink = env.sink === true;
            if (wantSink) env.EMAIL_WEBHOOK_URL = 'https://dash-sink.local/otp';
            else delete env.EMAIL_WEBHOOK_URL;
            delete env.sink;
            const meta = shape.request || {};
            const endpoint = String(meta.endpoint || 'request-otp');
            const method = String(meta.method || 'POST').toUpperCase();
            const headers = Object.assign({}, meta.headers || {});
            // cookie riding (batch 1 + batch 2): useMintedCookie = the ride's
            // LAST minted session; useCookie: '<shape name>' = a NAMED mint
            // (e.g. ok-admin vs ok-viewer) - existing cookie strings COMBINE
            // (a raw-cookie lane rides beside the minted one).
            const rideCookie = String(meta.useMintedCookie || '') === 'true'
                ? mintedCookie
                : (meta.useCookie && seatCookies[String(meta.useCookie)] ? seatCookies[String(meta.useCookie)] : null);
            if (rideCookie) {
                headers['cookie'] = headers['cookie'] ? headers['cookie'] + '; ' + rideCookie : rideCookie;
            }
            // (batch 2 arms) the bridge knee + the admin gate are LIBRARY
            // functions, not Pages handlers: they run with an explicit
            // ctx/request the pack composes, and serialize neutral facts
            // (present/hash prefix, never the token itself).
            if (endpoint === 'bridge-pod-token' || endpoint === 'bridge-establish' || endpoint === 'auth-gate') {
                const buildCtx = (req) => ({ request: req, env, params: {}, data: {}, next: async () => new Response('no next route', { status: 404 }), waitUntil: () => {} });
                if (endpoint === 'bridge-pod-token') {
                    if (typeof libBridge.podTokenFor !== 'function') { row.status = 'THREW'; row.bodyText = 'podTokenFor missing'; results.push(row); continue; }
                    const req = new Request('https://dash-run-root.pages.dev/bridge/' + String(meta.path || ''), { method: 'GET', headers });
                    const token = await libBridge.podTokenFor(buildCtx(req), req, String(meta.property || 'pod-alpha'));
                    const digest = token == null ? null : await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(token)));
                    row.status = 'OK';
                    row.bodyText = JSON.stringify({
                        present: token != null,
                        isVguest: token != null ? String(token).startsWith('vguest_') : false,
                        hash: digest ? Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('') : null,
                    });
                    results.push(row);
                    continue;
                }
                if (endpoint === 'bridge-establish') {
                    if (typeof libBridge.establishSession !== 'function') { row.status = 'THREW'; row.bodyText = 'establishSession missing'; results.push(row); continue; }
                    const init = { method: 'POST', headers };
                    if (typeof meta.body === 'string') init.body = meta.body;
                    const req = new Request('https://dash-run-root.pages.dev/api/establish', init);
                    const res = await libBridge.establishSession(req, env, String(meta.property || 'pod-alpha'));
                    row.status = res.status;
                    const setc = res.headers.get('set-cookie');
                    if (setc) {
                        row.headers['set-cookie'] = String(setc).slice(0, 600);
                        if (String(setc).indexOf('bdash_session=') !== -1 && String(setc).indexOf('Max-Age=0') === -1) mintedCookie = String(setc).split(';')[0];
                    }
                    row.bodyText = String(await res.text()).slice(0, 400);
                    results.push(row);
                    continue;
                }
                // auth-gate
                if (typeof libGuard.ensureAdmin !== 'function') { row.status = 'THREW'; row.bodyText = 'ensureAdmin missing'; results.push(row); continue; }
                const req = new Request('https://dash-run-root.pages.dev/api/users/list', { method: 'GET', headers });
                const gate = await libGuard.ensureAdmin(buildCtx(req));
                if (!gate.ok) {
                    row.status = gate.response.status;
                    row.bodyText = String(await gate.response.text()).slice(0, 300);
                } else {
                    row.status = 'OK';
                    row.bodyText = JSON.stringify({ ok: true, role: gate.role, emailHash: String(gate.emailHash).slice(0, 6) });
                }
                results.push(row);
                continue;
            }
            const handler = handlers[endpoint] && handlers[endpoint]({ method });
            if (!handler) { row.status = 'THREW'; row.bodyText = 'unknown endpoint: ' + endpoint; results.push(row); continue; }
            let body = meta.body;
            if (typeof body === 'string' && body.indexOf('__CODE__') !== -1 && captured != null) {
                body = body.split('__CODE__').join(String(captured));
            }
            const init = { method, headers };
            if (typeof body === 'string') init.body = body;
            const url = 'https://dash-run-root.pages.dev/api/auth/' + endpoint;
            const h = handler;
            const realFetch = globalThis.fetch;
            if (wantSink) {
                globalThis.fetch = async (u, i) => {
                    try {
                        const txt = String((i && i.body) || '');
                        const m = txt.match(/\\b\\d{6}\\b/);
                        if (m) captured = m[0];
                    } catch (e2) {}
                    return new Response(JSON.stringify({ id: 'captured' }), { status: 200, headers: { 'content-type': 'application/json' } });
                };
            }
            const context = { request: new Request(url, init), env, params: {}, data: {}, next: async () => new Response('no next route', { status: 404 }), waitUntil: () => {} };
            try {
                const res = await h(context);
                row.status = res.status;
                const setc = res.headers.get('set-cookie');
                if (setc) {
                    row.headers['set-cookie'] = String(setc).slice(0, 600);
                    if (String(setc).indexOf('bdash_session=') !== -1 && String(setc).indexOf('Max-Age=0') === -1) {
                        mintedCookie = String(setc).split(';')[0];
                        seatCookies[shape.name] = mintedCookie;
                    }
                }
                row.bodyText = String(await res.text()).slice(0, 800);
            } finally {
                globalThis.fetch = realFetch;
            }
            if (wantSink) row.capture = captured ? { code: captured } : null;
        } catch (e1) {
            row.status = 'THREW';
            row.bodyText = String(e1.name + ': ' + e1.message).slice(0, 200);
        }
        results.push(row);
    }
    process.stdout.write('VANT_CT_JSON<<' + JSON.stringify({ results }) + '>>END');
})().catch((e) => { process.stdout.write(JSON.stringify({ error: e.name + ': ' + e.message })); });
`;

// Trust-floor probe: the succession-trust-inheritance oracle. Seeds the
// succession config into the current brain's public tree (what a successor
// install wakes with), then measures what the LOW-trust successor's
// private-pinned read actually resolves — lib/succession owns the trust
// vocabulary; this child only reports the neutral facts ({ trustLevel,
// privateContent, refused }). Fixture swept on exit (fresh-fixture law).
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

// Graph-walk probe: the knowledge-links-cycle-safety oracle. Builds a
// three-node cycle PLUS a self-link through the REAL mcp knowledge_link
// seam, then walks brain_connections at depth 100000 — a walk without a
// visited guard hangs or blows the stack; a capped one returns. Links file
// swept on exit (fresh-fixture law).
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
// through lib/horcrux-safe.safeWriteHorcrux) in the sandbox, against a fresh
// fixture brain tree. Scope mode seals a stone at the requested allowlist
// (absent = the minimal single-brain capture, the lineage trap: scope ONE
// brain while the runtime pointer sits OUTSIDE it) and decodes the payload
// back; tamper mode corrupts the brn:secret payload region byte-by-byte
// until decode refuses, and only runs the REAL restore when tamper SURVIVES
// (the pack's EXPLOITED arm - measured, never assumed).
const STONE_CHILD = `${CHILD_STDOUT_GUARD}
(async () => {
    const spec = (() => { try { return JSON.parse(process.argv[1] || '{}'); } catch (e) { return {}; } })();
    const mode = spec.mode === 'tamper' ? 'tamper' : 'scope';
    const fs = require('fs');
    const path = require('path');
    // (run-root posture) the seal/decode path drives the sandbox gate the
    // same way vant's own snapshot CLI does inside a running install.
    try { require('./lib/sandbox').defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canSpawn: true, canNetwork: true }); } catch (e0) {}
    // (fresh-fixture law) the fixture brains exist so the scope filter has
    // REAL material to scope against - a filter over an empty tree proves
    // nothing - and the runtime pointer is retargeted deterministically.
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

    // scope request: pack call 1 sends its allowlist; call 2 ('{}') asks for
    // the minimal single-brain capture - the state-pointer-lineage trap.
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
        // corrupt the brn:secret payload region deterministically until the
        // decode refuses; each probe is restored to a one-byte change from
        // the sealed original (we break at the FIRST refusal - the file stays
        // at that one-byte tamper, and the restore below is the real one).
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
            // the tamper never broke decode integrity: run the REAL restore
            // and count honestly what it wrote (the EXPLOITED arm)
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
        // scope/lineage: decode the payload back, report the neutral facts
        // (scoped brain inventory + the state pointer it would wake on)
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

// --- lib/server's Edge chain, driven in-process (the vant-rest arm):
// --- the REAL security chain (vaf -> qos -> auth -> escrow -> handler)
// --- with the fake req/res shapes _handleRequest consumes. Two postures
// --- (open = default install, priv = authRequired arm); chains persist
// --- within an attack run so rate-limit walls are observable across
// --- bursts, and are rebuilt between attacks by resetEdgeChains - the
// --- fresh-fixture law, one clean wall per attack.

const EDGE_CHAINS = { open: null, priv: null };

// --- the site wire (the vant-home arm): web/home's Pages Functions,
// --- driven in-process over a statement-mapped in-memory fake D1. The SQL
// --- statements come from web/home/functions/_lib/status.js verbatim, so
// --- the dispatch matches them exactly; an unknown statement REFUSES
// --- LOUDLY (a silently-guessed D1 would make honest rows read as armed).
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
            if (low.includes('into status_meta')) {
                const [key, value] = args;
                db.meta.set(key, value);
                return { changes: db.meta.has(key) ? 1 : 1 };
            }
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
            summary: (await import(pathToFileURL(path.join(dir, 'summary.js')).href)).onRequestGet,
            admin: (await import(pathToFileURL(path.join(dir, 'admin.js')).href)).onRequestPost,
        };
    }
    return homeApi;
}

function resetEdgeChains(sb) {
    const Server = require(path.join(sb, 'lib', 'server.js')).Server;
    EDGE_CHAINS.open = new Server({ port: 0, authRequired: false });
    EDGE_CHAINS.priv = new Server({ port: 0, authRequired: true });
}

async function edgeRoundTrip(chain, spec) {
    // The chain contract: an event-stream req + a plain-object res (exactly
    // what _handleRequest consumes - no listener, no sockets).
    const events = require('events');
    const req = new events.EventEmitter();
    req.method = String(spec.method || 'GET').toUpperCase();
    req.url = String(spec.url || '/');
    req.headers = {};
    for (const [k, v] of Object.entries(spec.headers || {})) req.headers[String(k).toLowerCase()] = String(v);
    req.ip = '203.0.113.77'; // TEST-NET-3: the run root's fixed attacker address
    req.setTimeout = () => {}; // the collector arms no timer; the socket timer is out of contract here
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

    // The chain wires req.on('data'/'end') synchronously on entry, so the
    // body events fire AFTER the call; the answer lands asynchronously
    // (settled via the res.end hook above).
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

// (sentinel law) even with console redirected, vant's async library logs
// can land on stdout AFTER the child's JSON row; the route extracts ONLY the
// sentinel-delimited record so the pack sees pure JSON.
function extractCtJson(text) {
    const hit = String(text || '').match(/VANT_CT_JSON<<([\s\S]*?)>>END/);
    return hit ? hit[1] : String(text || '');
}

// --- library-row fixture bindings (2026-10-23): the D1/KV-shaped library
// --- rows (race / state / upload) arm EXACTLY when a D1/KV binding is
// --- available to the run root. Here that availability is crashtest's OWN
// --- fake backend (the harness builds FakeD1/FakeKV instances from env
// --- specs) - the supported in-process substitute for a real binding, zero
// --- sockets, deterministic. A runtime that provides real bindings would
// --- point these spec keys at them; the rows read env.<name> verbatim.

const LIBRARY_DEVICE_SEED = [
    { id: 1, key: 'rook-device-1', owner: 'rook' },
    { id: 2, key: 'rook-device-2', owner: 'rook' },
    { id: 3, key: 'rook-device-3', owner: 'rook' },
    { id: 4, key: 'rook-device-4', owner: 'rook' },
    { id: 5, key: 'rook-device-5', owner: 'rook' },
    { id: 6, key: 'rook-device-6', owner: 'rook' },
    { id: 7, key: 'rook-device-7', owner: 'rook' },
    { id: 8, key: 'rook-device-8', owner: 'rook' },
];
const LIBRARY_ENV_SPEC = {
    d1: {
        DB: {
            tables: {
                charges: { rows: [] },      // race/double-submit oracle ledger (cid, user, cents)
                settings: { rows: [] },     // race/lost-update oracle per-field ledger (user, field, value)
                blobs: { rows: [] },        // race/lost-update oracle whole-record ledger (user, json)
                devices: {                  // state/enumeration + row-aliasing ledger (id, key, owner)
                    rows: LIBRARY_DEVICE_SEED,
                    uniques: { key: ['key'] },  // a keyspace constraint: second-owner claims cannot land in-place
                },
            },
        },
    },
    kv: { UPLOADS: {} },                    // upload row store: env.UPLOADS, same shape web wire uses
};

function buildRoutes(sb, Harness) {
    const harness = new Harness({ baseUrl: 'https://vant-run-root', env: LIBRARY_ENV_SPEC });

    harness.registerRoute('brain-read', async (ctx) => {
        const j = await ctx.request.json().catch(() => ({}));
        let brain, r;
        try {
            brain = require(path.join(sb, 'lib', 'brain.js'));
            // (fresh-fixture law, parent side) a cached read from an earlier
            // attack is exactly the stale lineage this oracle hunts - every
            // read dispatches against the tree as it stands NOW
            if (brain.invalidateCache) brain.invalidateCache();
            r = await brain.read(j.name, j.brain ? { brain: j.brain } : {});
        } catch (e) {
            return new Response(JSON.stringify({ error: e.name + ': ' + e.message }), { status: 500 });
        }
        const answer = JSON.stringify({
            content: r && r.content != null ? String(r.content) : null,
            source: r ? r.source ?? null : null,
            path: r ? r.path ?? null : null,
        });
        console.error(`[run-root] brain-read answer: ${answer.slice(0, 200)}`);
        return new Response(answer, { status: 200 });
    });

    harness.registerRoute('brain-state', async (ctx) => {
        const j = await ctx.request.json().catch(() => ({}));
        if (!j || typeof j.tamper !== 'string') return new Response(JSON.stringify({ error: 'tamper param required' }), { status: 400 });
        let outText;
        try {
            outText = execFileSync('node', ['-e', PROBE_CHILD, j.tamper], { cwd: sb, timeout: 30000, encoding: 'utf8', env: { ...process.env, VANT_GATE_QUIET: '1' } });
        } catch (e) {
            return new Response(JSON.stringify({ error: `probe child failed: ${String(e.stderr || e.message).slice(0, 200)}` }), { status: 500 });
        }
        console.error(`[run-root] brain-state answer: ${String(outText).slice(0, 260)}`);
        return new Response(extractCtJson(outText), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    });

    harness.registerRoute('brain-migrate', async () => {
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
        fs.writeFileSync(path.join(sb, 'models', 'public', 'identity.md'), 'legacy identity');
        fs.writeFileSync(path.join(sb, 'models', 'public', 'goals.md'), 'legacy goals');
        fs.writeFileSync(path.join(sb, 'models', 'public', 'lessons.md'), 'legacy lessons');
        let migrations, dryApplied = 0, second, before2, after2;
        try { migrations = require(path.join(sb, 'lib', 'migrations.js')); } catch (e) {
            return new Response(JSON.stringify({ error: e.name + ': ' + e.message }), { status: 500 });
        }
        const beforeDry = walk(path.join(sb, 'models'));
        try { dryApplied = (await migrations.migrate({ dryRun: true })).applied.filter((a) => a.dryRun === true).length; } catch (e) {
            return new Response(JSON.stringify({ error: 'dry-run threw: ' + e.name }), { status: 500 });
        }
        const afterDry = walk(path.join(sb, 'models'));
        await migrations.migrate();
        before2 = walk(path.join(sb, 'models'));
        try { second = await migrations.migrate(); } catch (e) {
            return new Response(JSON.stringify({ error: 'run 2 threw: ' + e.name }), { status: 500 });
        }
        after2 = walk(path.join(sb, 'models'));
        // (fresh-fixture law, pointer hygiene) the legacy import flips the
        // parent brain module's _currentBrainType to 'public' in-process -
        // vant's own guarded pattern is save-pointer/restore-finally (lib/
        // brain.js searchStack), so the route restores the seeded posture
        // after BOTH accounting runs. Sandwiched between them it would turn
        // run 2 into a different module state, breaking the honest
        // idempotency measurement itself.
        try {
            const brain = require(path.join(sb, 'lib', 'brain.js'));
            if (brain.switchBrain) brain.switchBrain('vant', 'private');
        } catch (e3) { /* restore best effort */ }
        return new Response(JSON.stringify({
            dryTouch: beforeDry.join('') !== afterDry.join('') ? 1 : 0,
            secondTouch: before2.filter((f) => !after2.includes(f)).length + after2.filter((f) => !before2.includes(f)).length,
            secondApplied: (second && second.applied || []).length,
            secondDryPlanned: dryApplied,
        }), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    });

    harness.registerRoute('guest-cap', async () => {
        let guests, tok;
        try { guests = require(path.join(sb, 'lib', 'guests.js')); } catch (e) {
            return new Response(JSON.stringify({ error: e.name + ': ' + e.message }), { status: 500 });
        }
        const out = { adminDenied: false, revokedDead: false, pairingSingleUse: false };
        try { tok = guests.issue('pack-guest', { role: 'human', brain: 'vant', expires: '1d' }); } catch (e) {
            return new Response(JSON.stringify({ error: 'issue threw: ' + e.message }), { status: 500 });
        }
        const raw = tok && tok.token ? tok.token : (typeof tok === 'string' ? tok : null);
        if (!raw) return new Response(JSON.stringify({ error: 'issue did not return a token' }), { status: 500 });
        const v = guests.verify(raw);
        if (!v) return new Response(JSON.stringify({ error: 'verify could not round-trip the issued token' }), { status: 500 });
        try {
            out.adminDenied = guests.classifyTool('guest_issue') === 'admin' ? guests.authorize('guest_issue', v).allowed === false : null;
        } catch (e) { out.adminDenied = null; }
        try { guests.revoke(v.guest?.id ?? tok.id ?? tok.guestId); } catch (e) {
            return new Response(JSON.stringify({ error: 'revoke threw: ' + e.message }), { status: 500 });
        }
        out.revokedDead = guests.verify(raw) === null;
        const code = 'vhpair-' + 'A7x9K2mQ4LbP6nR8';
        if (!guests.offerPairing(code)) return new Response(JSON.stringify({ error: 'offerPairing refused the fixture code' }), { status: 500 });
        const first = guests.pair(code);
        const second = guests.pair(code);
        out.pairingSingleUse = !!(first && first.token) && !!(second && second.ok === false);
        return new Response(JSON.stringify(out), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    });

    harness.registerRoute('crew-run', async () => {
        let outText;
        try {
            outText = execFileSync('node', ['-e', CREW_CHILD], { cwd: sb, timeout: 60000, encoding: 'utf8', env: { ...process.env, VANT_GATE_QUIET: '1' } });
        } catch (e) {
            console.error(`[run-root] crew child failed: ${String(e.stderr || e.message).slice(0, 400)}`);
            return new Response(JSON.stringify({ error: `crew probe child failed: ${String(e.stderr || e.message).slice(0, 200)}` }), { status: 500 });
        }
        console.error(`[run-root] crew answer: ${String(outText).slice(0, 300)}`);
        return new Response(extractCtJson(outText), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    });

    harness.registerRoute('mcp-exec', async (ctx) => {
        const j = await ctx.request.json().catch(() => ({}));
        let outText;
        try {
            outText = execFileSync('node', ['-e', MCP_CHILD, JSON.stringify(Array.isArray(j.calls) ? j.calls : [])], { cwd: sb, timeout: 60000, encoding: 'utf8', env: { ...process.env, VANT_GATE_QUIET: '1' } });
        } catch (e) {
            console.error(`[run-root] mcp child failed: ${String(e.stderr || e.message).slice(0, 400)}`);
            return new Response(JSON.stringify({ error: `mcp probe child failed: ${String(e.stderr || e.message).slice(0, 200)}` }), { status: 500 });
        }
        console.error(`[run-root] mcp answer: ${String(outText).slice(0, 300)}`);
        return new Response(extractCtJson(outText), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    });

    // --- the trust + graph arms (2026-10-22): the two pending-oracle
    // --- routes in a probe child each (fresh modules over the sandbox).

    harness.registerRoute('trust-read', async (ctx) => {
        const j = await ctx.request.json().catch(() => ({}));
        let outText;
        try {
            outText = execFileSync('node', ['-e', TRUST_CHILD, JSON.stringify({ level: j && j.level ? String(j.level) : 'low' })], { cwd: sb, timeout: 30000, encoding: 'utf8', env: { ...process.env, VANT_GATE_QUIET: '1' } });
        } catch (e) {
            return new Response(JSON.stringify({ error: `trust probe child failed: ${String(e.stderr || e.message).slice(0, 200)}` }), { status: 500 });
        }
        return new Response(extractCtJson(outText), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    });

    harness.registerRoute('brain-graph-walk', async () => {
        let outText;
        try {
            outText = execFileSync('node', ['-e', GRAPH_CHILD], { cwd: sb, timeout: 60000, encoding: 'utf8', env: { ...process.env, VANT_GATE_QUIET: '1' } });
        } catch (e) {
            return new Response(JSON.stringify({ error: `graph probe child failed: ${String(e.stderr || e.message).slice(0, 200)}` }), { status: 500 });
        }
        return new Response(extractCtJson(outText), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    });

    // --- the vant-rest arm (2026-10-24): lib/server's REAL Edge chain.

    // rest-request: the vant-rest pack's route. Body carries
    // { method, path, headers?, body?, authRequired? } - one honest round
    // trip through the chain, status + headers + body attached.
    harness.registerRoute('rest-request', async (ctx) => {
        const j = await ctx.request.json().catch(() => ({}));
        if (!EDGE_CHAINS.open || !EDGE_CHAINS.priv) resetEdgeChains(sb);
        const chain = (j && j.authRequired === true) ? EDGE_CHAINS.priv : EDGE_CHAINS.open;
        const out = await edgeRoundTrip(chain, j || {});
        return new Response(JSON.stringify(out), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    });

    // Library-row arming: the crashtest library fires RAW requests
    // (method/body/headers straight at the route), so the Edge vocabulary
    // arms as raw-dispatch routes over the same two chain postures.
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
    harness.registerRoute('vant-rest-open', rawEdgeRoute(false));
    harness.registerRoute('vant-rest-priv', rawEdgeRoute(true));
    harness.registerRoute('vant-rest-priv-alias', rawEdgeRoute(true));

    // --- the session-cookie arm: lib/guests REAL token semantics
    // --- (issue/verify/revoke) behind the cookie packaging an Edge
    // --- deployment of them would use. The flags (Secure/HttpOnly/
    // --- SameSite=Lax) are the shim's deployment posture, honestly set;
    // --- what the session rows measure is the mint/rotate/replay/
    // --- revoke behavior of lib/guests itself.
    // the crashtest session rows extract the generic `sid` cookie class, so
    // the shim mints exactly that name (fixation/replay/revocation semantics
    // stay lib/guests beneath it)
    const COOKIE = (raw) => 'sid=' + raw + '; Path=/; Secure; HttpOnly; SameSite=Lax';
    const sidFrom = (req, header) => {
        const m = String(header.get ? (header.get('cookie') ?? '') : '').match(/(?:^|;\s*)sid=([^;]*)/);
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
    harness.registerRoute('vant-login', async (ctx) => {
        const j = await ctx.request.json().catch(() => ({}));
        try {
            const t = guestsForSb().issue(String((j && j.user) || 'rook'), { role: 'human', brain: 'vant', expires: '1d' });
            return jsonRes({ ok: true, user: (j && j.user) || 'rook', brain: 'vant' }, 200, { 'Set-Cookie': COOKIE(t.token) });
        } catch (e) {
            return jsonRes({ error: e.message }, 400);
        }
    });
    harness.registerRoute('vant-me', async (ctx) => {
        const sid = sidFrom(ctx.request, ctx.request.headers);
        const v = sid ? guestsForSb().verify(sid) : null;
        if (!v) return jsonRes({ error: 'no session' }, 401);
        return jsonRes({ ok: true, guest: { name: v.guest.name, role: v.guest.role, trustLevel: v.guest.trustLevel } }, 200);
    });
    harness.registerRoute('vant-logout', async (ctx) => {
        const sid = sidFrom(ctx.request, ctx.request.headers);
        if (!sid) return jsonRes({ error: 'no session' }, 400);
        // resolve the guest id first: a pre-revoked sid's verify is null and
        // the revoke must still be a positive no-op, not an error
        const v = guestsForSb().verify(sid);
        const id = v ? v.guest.id : sid;
        guestsForSb().revoke(id);
        return jsonRes({ ok: true }, 200);
    });

    // --- the stones arm: real seal → decode → restore through the probe
    // --- child (STN_STONE above) - scope/lineage on stone-scope, tamper on
    // --- stone-tamper, and stone-restore-tamper shares the tamper arm for
    // --- vant-brain's boot-stone-integrity oracle.
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
    harness.registerRoute('stone-scope', stoneRoute('scope'));
    const tamperRoute = stoneRoute('tamper');
    harness.registerRoute('stone-tamper', tamperRoute);
    harness.registerRoute('stone-restore-tamper', tamperRoute);

    // --- the site wire routes (the vant-home arm, 2026-10-23): the REAL
    // --- web/home Pages Functions over the fresh per-call fake D1. The
    // --- posture envelope lets the pack pick the environment it attacks
    // --- (db absent, env key short, sweep hot) - the wire answers through
    // --- the handlers verbatim.
    harness.registerRoute('home-summary', async (ctx) => {
        const j = await ctx.request.json().catch(() => ({}));
        const { summary } = await homeHandlers();
        const env = {
            STATUS_ADMIN_KEY: typeof j.envKey === 'string' ? j.envKey : 'home-run-root-admin-key',
            STATUS_SWEEP_SECONDS: String(j.sweepSeconds ?? 600),
        };
        if (j.db !== false) {
            env.DB = makeFakeD1();
            if (j.hotSweep !== false) {
                // force the sweep window HOT: no wall clock is reachable from
                // the wire, so the row stays deterministic
                await env.DB.prepare('INSERT INTO status_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
                    .bind('last_sweep', new Date().toISOString()).run();
            }
        }
        const method = String(j.method || 'GET').toUpperCase();
        let res;
        if (method !== 'GET') {
            // the platform contract: summary.js exports GET only
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
    harness.registerRoute('home-admin', async (ctx) => {
        const j = await ctx.request.json().catch(() => ({}));
        const { admin } = await homeHandlers();
        const env = { STATUS_ADMIN_KEY: typeof j.envKey === 'string' ? j.envKey : 'home-run-root-admin-key' };
        // (flood-oracle posture) sharedDb keeps ONE fake D1 across a burst
        // of calls; resetSharedDb forces it fresh on the burst opener.
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

    // (2026-10-22) The last two pending oracles are REGISTERED now: every
    // vant-brain route contract is armed (trust-read + brain-graph-walk).
    // Absence remains the honest shape for any FUTURE unwired oracle: the
    // packs degrade via route-absence, never a 501 shim (a 501 shim IS a
    // 5xx to the fuzz floor).

    // --- library-row fixture routes (2026-10-23): charge / profile /
    // --- device / upload arm the D1/KV-shaped library rows against the
    // --- fake backend above (ctx.env.DB / ctx.env.UPLOADS ride the SAME
    // --- harness env object the rows read back). The same honesty law as
    // --- the vant-code routes: the fixtures are a REAL defender-shaped
    // --- app over the stated bindings, so a verdict-flipping behavior is
    // --- a real defect and the row names it - they are not answer sheets.
    // --- Determinism law: no wall clock in any stored value.

    // charge: idempotency-keyed payment surface the race row bursts. SAME
    // key under Promise.all lands exactly ONE insert; the framing promise
    // wins the grant and the joiners answer a shaped 409 (the harness's
    // honest wall shape). Settled replays stay 409 too - the ledger row is
    // what "exactly one" means, not the ack shape.
    const chargeInflight = new Map();
    harness.registerRoute('charge', async (ctx) => {
        let j = null;
        try { j = await ctx.request.json(); } catch { j = null; }
        if (!j || typeof j.idem !== 'string' || !j.idem) return jsonRes({ error: 'idem key required' }, 400);
        const db = ctx.env && ctx.env.DB;
        if (!db || !db.prepare) return jsonRes({ error: 'no DB binding on this target' }, 503);
        const key = j.idem;
        if (chargeInflight.has(key)) {
            await chargeInflight.get(key).catch(() => {});   // joiners ride the same flight, then 409
            return jsonRes({ error: 'duplicate idem key', idem: key }, 409);
        }
        const flight = (async () => {
            const dupe = await db.prepare('SELECT id FROM charges WHERE cid = ?').bind(key).first('id');
            if (dupe != null) return false;                  // settled replay: the row already holds it
            await db.prepare('INSERT INTO charges (cid, user, cents) VALUES (?, ?, ?)')
                .bind(key, String(j.user ?? 'guest'), Number(j.cents ?? 0)).run();
            return true;
        })();
        chargeInflight.set(key, flight);
        try { await flight; } catch (e) {
            chargeInflight.delete(key);
            return jsonRes({ error: String(e && e.message || e) }, 503);
        }
        chargeInflight.delete(key);
        return jsonRes({ ok: true, idem: key }, 200);
    });

    // profile: per-field settings surface (per-field rows, no whole-record
    // read-modify-write) - concurrent writers can never stomp a field they
    // never saw, which is exactly what the race oracle reads back.
    harness.registerRoute('profile', async (ctx) => {
        let j = null;
        try { j = await ctx.request.json(); } catch { j = null; }
        if (!j || typeof j.user !== 'string' || !j.user) return jsonRes({ error: 'user required' }, 400);
        const db = ctx.env && ctx.env.DB;
        if (!db || !db.prepare) return jsonRes({ error: 'no DB binding on this target' }, 503);
        for (const [field, value] of Object.entries(j)) {
            if (field === 'user') continue;
            if (field === '__proto__' || field === 'constructor' || field === 'prototype') {
                return jsonRes({ error: 'unsupported field name' }, 400);
            }
            await db.prepare('INSERT INTO settings (user, field, value) VALUES (?, ?, ?)')
                .bind(j.user, field, String(value)).run();
        }
        return jsonRes({ ok: true }, 200);
    });

    // device: fused fixture route for the state module's two attacks. The
    // module's ctx routes surface per MODULE, not per attack, so one route
    // carries both semantics: a body with an `owner` is the enrollment
    // write (row-aliasing class - a second owner claim on a taken key
    // answers the shaped 409 the keyspace constraint built), a body with
    // only a `key` is the lookup read (enumeration class - foreign ids
    // answer 404, own ids answer 200).
    harness.registerRoute('device', async (ctx) => {
        let j = null;
        try { j = await ctx.request.json(); } catch { j = null; }
        const db = ctx.env && ctx.env.DB;
        if (!db || !db.prepare) return jsonRes({ error: 'no DB binding on this target' }, 503);
        if (j && j.owner !== undefined) {
            if (typeof j.key !== 'string' || !j.key) return jsonRes({ error: 'device key required' }, 400);
            try {
                await db.prepare('INSERT INTO devices (key, owner) VALUES (?, ?)').bind(j.key, String(j.owner)).run();
                return jsonRes({ ok: true, key: j.key, owner: String(j.owner) }, 200);
            } catch (e) {
                if (e && e.code === 'UNIQUE') return jsonRes({ error: 'device key already claimed', key: j.key }, 409);
                throw e;
            }
        }
        let wanted = null;
        try { wanted = new URL(ctx.request.url).searchParams.get('key'); } catch { wanted = null; }
        if (!wanted) wanted = j && j.key;
        if (!wanted || typeof wanted !== 'string') return jsonRes({ error: 'device key required' }, 400);
        const row = await db.prepare('SELECT id, key, owner FROM devices WHERE key = ?').bind(wanted).first();
        if (!row) return jsonRes({ error: 'no such device for this identity', key: wanted }, 404);
        return jsonRes({ ok: true, device: { key: row.key, owner: row.owner } }, 200);
    });

    // upload: multipart surface with the discipline the upload rows grade
    // - filenames that carry separators, dot-segments, or control-ish
    // bytes are refused (never stored under a derived escape), and
    // scriptable content types (svg+script, text/html) are refused on the
    // wire. Clean basenames under an honest type store verbatim.
    const UPLOAD_TYPE_ALLOW = /^(text\/plain|application\/json|application\/octet-stream|image\/(png|jpg|jpeg|gif|webp))$/i;
    harness.registerRoute('upload', async (ctx) => {
        let form = null;
        try { form = await ctx.request.formData(); } catch { form = null; }
        if (!form) return jsonRes({ error: 'multipart body required' }, 400);
        const file = form.get('file');
        if (!file || typeof file === 'string') return jsonRes({ error: 'file field required' }, 400);
        const rawName = String(file.name || '');
        if (/\/|\\/.test(rawName) || /\.\./.test(rawName) || rawName.startsWith('.')) {
            return jsonRes({ error: 'unacceptable filename', name: rawName }, 409);
        }
        // one-dot extension discipline: multi-dot names are the classic
        // double-extension shape (a name riding two grammars at once) -
        // refused rather than stored under an attacker-favored spelling
        if (!/^\w[\w-]*\.(?:txt|json|png|jpg|jpeg|gif|webp)$/i.test(rawName)) {
            return jsonRes({ error: 'unacceptable filename', name: rawName }, 409);
        }
        const type = String(file.type || '').toLowerCase();
        if (!UPLOAD_TYPE_ALLOW.test(type)) return jsonRes({ error: 'unacceptable content type', type }, 409);
        const store = ctx.env && ctx.env.UPLOADS;
        if (!store || !store.put) return jsonRes({ error: 'no KV binding on this target' }, 503);
        await store.put(rawName, `crashtest-upload-canary:${rawName}`);
        return jsonRes({ ok: true, key: rawName }, 200);
    });

    // --- B0 module-family arms (S0→S1 campaign, #249): the crate's memory
    // --- + governance library families attack vant's REAL note store,
    // --- grant ledger, decision engine, and lock fence over these routes.
    // --- Same posture as the session routes: the patient is vant's own
    // --- lib in the sandbox (require('./lib/...') post-chdir), typed
    // --- refusals, no wall clock stored. A semantics vant lacks is NOT
    // --- faked: it is left undeclared so the rows honest-skip naming
    // --- exactly the knob (memory: deleteRoute/staleToken; governance:
    // --- staleToken). Verdicts are vant's truth, never answer sheets.
    const sandboxLib = (mod) => require(path.join(sb, 'lib', mod));
    const memory = sandboxLib('memory');
    const rules = sandboxLib('rules');
    const lockSys = sandboxLib('lock');
    const B0_LOCKS = new Set(); // resource -> live fence, per-run state
    // (B0 declared vocabulary) vant's trust-floor map for the governance
    // ask scopes the rows exercise. This is the arm's DOCUMENTED scale —
    // vant's succession trust vocabulary expressed numerically (deep
    // private estate asks need trust 3; the crates read it or leave it,
    // rows just resolve and vant's engine enforces the law) — not a
    // moduleCtx knob the family promises to read.
    const B0_TRUST_FLOORS = { 'deep-private': 3 };

    // memory-note-write: POST { id, body, summary?, refs?, scope?, writers? }
    // -> lib/memory.state() — the durable K/V note store (TTL'd, workspace
    // scoped, brain-persisted). Revision/writers are VANT'S actual answer:
    // the state store carries no revision field, so write-conflict rows
    // grade vant's real overwrite discipline (drift rows that need an
    // absent field fail acceptance and name it). 4xx = malformed note.
    harness.registerRoute('memory-note-write', async (ctx) => {
        let j = null;
        try { j = await ctx.request.json(); } catch { j = null; }
        if (!j || typeof j.id !== 'string' || !j.id) return jsonRes({ error: 'note id required' }, 400);
        if (j.body === undefined || j.body === null || (typeof j.body !== 'string' && typeof j.body !== 'object')) {
            return jsonRes({ error: 'note body required' }, 400);
        }
        const note = {};
        note.body = j.body;
        if (j.summary !== undefined) note.summary = j.summary;
        if (j.refs !== undefined) note.refs = j.refs;
        if (j.scope !== undefined) note.scope = j.scope;
        if (j.writers !== undefined) note.writers = j.writers;
        try {
            const r = await memory.state(`note:${j.id}`, note, { fresh: true });
            return jsonRes({ ok: true, id: j.id, storeKey: r.storeKey }, 200);
        } catch (e) {
            return jsonRes({ error: String(e && e.message || e).slice(0, 140) }, 403); // the chain refused the write
        }
    });

    // memory-note-read: POST { id } (readStyle 'body') -> recall(fresh:
    // true, envelope) — the fresh path bypasses BOTH caches so two writers
    // in one run see each other's last landing (the drift rows depend on
    // it), and the envelope asks vant's read layer for the stored
    // provenance + flags (revision/writers/conflict, summary/body
    // contradiction, unresolved refs in the same state namespace). The
    // 404 body deliberately does NOT echo the queried id: an error payload
    // carrying the id would hand the row's note-matcher a ghost object
    // and misclassify a genuine miss as "silently blended".
    harness.registerRoute('memory-note-read', async (ctx) => {
        let j = null;
        try { j = await ctx.request.json(); } catch { j = null; }
        if (!j || typeof j.id !== 'string' || !j.id) return jsonRes({ error: 'note id required' }, 400);
        try {
            const env = await memory.recall(`note:${j.id}`, { fresh: true, envelope: true, refNamespace: 'note:' });
            if (env === undefined) return jsonRes({ error: 'no such note' }, 404);
            return jsonRes({ id: j.id, ...env }, 200);
        } catch (e) {
            return jsonRes({ error: String(e && e.message || e).slice(0, 140) }, 403);
        }
    });

    // gov-grant (the ledger IS vant's grant surface): POST { principal,
    // capability, scope?, permit, precedence?, trust?, role?, revoke? }
    // -> rules.grantLedger / rules.revokeGrants. Revocations are never a
    // delete (the old arm resumed default-allow on revoke — the exact
    // drift the rows graded): a revoke writes a tombstone deny ABOVE the
    // revokee's precedence, so deny carries until a higher grant wins.
    harness.registerRoute('gov-grant', async (ctx) => {
        let j = null;
        try { j = await ctx.request.json(); } catch { j = null; }
        if (!j || typeof j.principal !== 'string' || !j.principal) return jsonRes({ error: 'principal required' }, 400);
        if (typeof j.capability !== 'string' || !j.capability) return jsonRes({ error: 'capability required' }, 400);
        if (j.permit !== 'allow' && j.permit !== 'deny' && j.revoke !== true) return jsonRes({ error: 'permit must be allow or deny (or revoke)' }, 400);
        try {
            let r;
            if (j.revoke === true) {
                r = rules.revokeGrants({ principal: String(j.principal), capability: String(j.capability) });
                return jsonRes({ ok: true, tombstone: r.id, precedence: r.precedence }, 200);
            }
            r = rules.grantLedger({
                principal: String(j.principal),
                capability: String(j.capability),
                scope: j.scope != null ? String(j.scope).slice(0, 120) : null,
                permit: j.permit,
                precedence: Number(j.precedence) || 0,
                trust: j.trust != null ? Number(j.trust) : null,
                role: j.role != null ? String(j.role).slice(0, 40) : null,
            });
            return jsonRes({ ok: true, grant: r.id, permit: r.permit, precedence: r.precedence }, 200);
        } catch (e) {
            return jsonRes({ error: String(e && e.message || e).slice(0, 140) }, 403);
        }
    });

    // gov-resolve: POST { principal, capability, scope? } -> rules.evaluate(
    // capability) — vant's real privilege-LEDGER decision engine
    // (precedence deny-wins, tombstone revocation, scope isolation,
    // trust floors). ALWAYS 200 (the decision IS the answer:
    // { permit, rule?, reason?, principal? }), 4xx only on a malformed ask.
    // The trust floor is DOCUMENTED vocabulary (moduleCtx.governance.
    // trustFloors): the arm reads the floor for the asked scope and hands
    // it to vant's engine — the floor map is exported so export modules
    // pack up without it, while vant's engine keeps the floor law.
    harness.registerRoute('gov-resolve', async (ctx) => {
        let j = null;
        try { j = await ctx.request.json(); } catch { j = null; }
        if (!j || typeof j.capability !== 'string' || !j.capability) return jsonRes({ error: 'capability required' }, 400);
        try {
            const ask = { principal: String(j.principal || ''), scope: j.scope != null && j.scope !== '' ? String(j.scope) : null };
            if (ask.scope && B0_TRUST_FLOORS[ask.scope] != null) ask.trustFloor = B0_TRUST_FLOORS[ask.scope];
            const verdict = rules.evaluate(j.capability, ask);
            return jsonRes({ permit: verdict.allowed ? 'allow' : 'deny', rule: verdict.rule || null, reason: verdict.reason || null }, 200);
        } catch (e) {
            return jsonRes({ error: String(e && e.message || e).slice(0, 140) }, 403);
        }
    });

    // gov-locks: POST { resource, op: 'acquire'|'release', token?, ttl? }
    // -> lib/lock.acquire / release over a run-local fence dir, waitMs 0
    // (the fence answer is honest-immediate: a held lock answers 409 THE
    // MOMENT it is held). The lock record carries at: Date.now() by
    // vant's own design (lib/lock stores it) — the crate's staleness
    // rows read the lock FILE, so no wall clock rides a RESPONSE.
    harness.registerRoute('gov-locks', async (ctx) => {
        let j = null;
        try { j = await ctx.request.json(); } catch { j = null; }
        if (!j || typeof j.resource !== 'string' || !j.resource) return jsonRes({ error: 'resource required' }, 400);
        if (j.resource.includes('/') || j.resource.includes('\\') || j.resource.includes('..') || j.resource.includes('\0')) {
            return jsonRes({ error: 'unacceptable resource name' }, 400);
        }
        // the module family's fence op is 'write' — the same acquire
        // semantics vant's lock fence carries (write through the fence =
        // hold the fence); 'release' releases.
        if (j.op !== 'acquire' && j.op !== 'write' && j.op !== 'release') return jsonRes({ error: 'op must be acquire|write or release' }, 400);
        if (j.op === 'write') j.op = 'acquire';
        const fencePath = require('path').join(process.cwd(), '.crashtest-locks', `${j.resource}.lock`);
        try {
            if (j.op === 'release') {
                const r = lockSys.release(fencePath);
                B0_LOCKS.delete(j.resource);
                return jsonRes({ ok: r.released !== false, released: !!r.released }, 200);
            }
            const r = lockSys.acquire(fencePath, { staleMs: Number(j.ttl) > 0 ? Number(j.ttl) : 30000, waitMs: 0 });
            if (r.ok) B0_LOCKS.add(j.resource);
            return r.ok
                ? jsonRes({ ok: true, acquired: true, resource: j.resource }, 200)
                : jsonRes({ ok: false, error: 'lock held', reason: r.reason || 'held' }, 409);
        } catch (e) {
            return jsonRes({ error: String(e && e.message || e).slice(0, 140) }, 403);
        }
    });

    // memory-note-delete: POST { id } -> lib/memory.forget() — vant's new
    // per-note delete (B0 fix pass): a tombstone entry IN PLACE (deleted
    // marker + prunedAt + removedBy, prior envelope provenance carried),
    // so "pruned" leaves traceable residue and reads of the tombstoned
    // ref treat it as gone (dangling citation surface).
    harness.registerRoute('memory-note-delete', async (ctx) => {
        let j = null;
        try { j = await ctx.request.json(); } catch { j = null; }
        if (!j || typeof j.id !== 'string' || !j.id) return jsonRes({ error: 'note id required' }, 400);
        try {
            await memory.forget(`note:${j.id}`, { fresh: true });
            return jsonRes({ ok: true, deleted: true, id: j.id }, 200);
        } catch (e) {
            return jsonRes({ error: String(e && e.message || e).slice(0, 140) }, 403);
        }
    });

    // mcp-server-wall: POST { url, method?, headers?, body?, pin? }
    // -> the REAL Node wire, lib/server.js _handleRequest, driven with the
    // same fake req/res pairs the native door-pin suite uses (no sockets,
    // no wall clock). (Phase A bucket 0, #249) The native suite
    // test/crashtest-server.js converts into pack rows graded against THIS
    // route; the suite itself stays green alongside until the run is one
    // full cycle green on both (the reverse-verification law).
    // `pin` is the row's arming need: 'escrow-dry' pins the budget spent
    // down for ONE probe only (restored after), like the native floor pin;
    // 'auth' fires the wall WITH authRequired on (credential stuffing); the
    // default is the plain wall. Every call runs on a FRESH wall instance
    // except the stuffing/flood lanes' dedicated ones, so one row's QoS
    // budget never starves another row's (fresh-fixture law).
    const serverWall = sandboxLib('server');
    const WALL_FLOORS = new Map(); // lane -> lazy Server instance
    function _wall(lane) {
        if (!WALL_FLOORS.has(lane)) {
            WALL_FLOORS.set(lane, new serverWall.Server(lane === 'auth'
                ? { port: 0, authRequired: true, requestTimeout: 60000 }
                : { port: 0, requestTimeout: 60000 }));
        }
        return WALL_FLOORS.get(lane);
    }
    function _fakeReq(opts) {
        const req = new (require('events').EventEmitter)();
        req.url = opts.url;
        req.method = opts.method || 'POST';
        req.headers = opts.headers || {};
        req.socket = { remoteAddress: '127.0.0.1' };
        req.setTimeout = function () { /* pack rows never run the clock */ };
        return req;
    }
    function _fakeRes() {
        return {
            headers: {}, status: null, body: '', headersSent: false,
            setHeader(k, v) { this.headers[k] = v; },
            writeHead(status, headers) { this.status = status; this.headersSent = true; Object.assign(this.headers, headers || {}); },
            end(data) { this.body = String(data); }
        };
    }
    harness.registerRoute('mcp-server-wall', async (ctx) => {
        let j = null;
        try { j = await ctx.request.json(); } catch { j = null; }
        if (!j || typeof j.url !== 'string' || !j.url) return jsonRes({ error: 'url required' }, 400);
        if (j.pin != null && !['escrow-dry', 'auth'].includes(String(j.pin))) return jsonRes({ error: 'unknown pin' }, 400);
        const lane = j.pin === 'auth' ? 'auth' : 'plain';
        const wall = _wall(lane);
        const req = _fakeReq({ url: String(j.url).slice(0, 200), method: j.method ? String(j.method).slice(0, 10) : 'POST', headers: j.headers && typeof j.headers === 'object' ? j.headers : {} });
        const res = _fakeRes();
        const bodyChunks = j.body != null ? String(j.body) : undefined;
        let canSpendRestore = null;
        try {
            if (j.pin === 'escrow-dry') {
                canSpendRestore = wall._escrow.canSpend.bind(wall._escrow);
                wall._escrow.canSpend = () => false; // the budget ran dry (native floor pin)
            }
            const p = wall._handleRequest(req, res);
            if (bodyChunks !== undefined) req.emit('data', Buffer.from(bodyChunks));
            req.emit('end');
            // (drive determinism) the wall's inner 'end' listener resolves on
            // its own promise chain — the OUTER _handleRequest promise can
            // settle before the router writes. Await actual completion, not
            // the outer promise: a bounded setImmediate spin is drive
            // mechanics, not verdict timing (no clock in the ANSWER).
            if (p && typeof p.then === 'function') await p;
            for (let spins = 0; spins < 500 && !res.headersSent; spins++) {
                await new Promise((resolve) => setImmediate(resolve));
            }
            if (canSpendRestore) wall._escrow.canSpend = canSpendRestore; // restored for the wall's other rows
            if (res.status || res.body) {
                return jsonRes({ status: res.status, headers: res.headers, bodyText: String(res.body).slice(0, 400) }, 200);
            }
            return jsonRes({ error: 'wall answered unsent (stream held open?)' }, 409);
        } catch (e) {
            if (canSpendRestore) wall._escrow.canSpend = canSpendRestore;
            return jsonRes({ error: 'wall drive threw: ' + String(e && e.message || e).slice(0, 120) }, 500);
        }
    });

    // relay-edge: POST { shapes: [{ name, env, request }] } -> the r/2 edge
    // face (web/relay/functions/api/r/relay.ts) driven in-process by the
    // RELAY_CHILD probe (Node --experimental-strip-types, WHATWG Request,
    // WebCrypto HMAC). Pack rows arm vant's real edge posture/gate/fresh/
    // origin lanes here; absence or a throw degrades to typed refusals.
    const RELAY_EDGE_CHILD_FILE = path.join(os.tmpdir(), 'vant-ct-relay-probe-' + process.pid + '.mjs');
    fs.writeFileSync(RELAY_EDGE_CHILD_FILE, RELAY_CHILD);
    const { execFileSync } = require('child_process');
    harness.registerRoute('relay-edge', async (ctx) => {
        if (process.env.CRASHTEST_B0_DEBUG) process.stderr.write('[b0-relay] route entered\n');
        let j = null;
        try { j = await ctx.request.json(); } catch { j = null; }
        const shapes = (j && Array.isArray(j.shapes) && j.shapes.length) ? j.shapes.slice(0, 40) : null;
        if (process.env.CRASHTEST_B0_DEBUG) process.stderr.write('[b0-relay] shapes=' + (shapes ? shapes.length : 'none') + ' j=' + (j ? 'obj' : 'null') + '\n');
        if (!shapes) return jsonRes({ error: 'shapes array required' }, 400);
        try {
            const out = execFileSync(process.execPath, ['--experimental-strip-types', RELAY_EDGE_CHILD_FILE], {
                input: JSON.stringify({ shapes, handlerPath: path.join(ROOT, 'web', 'relay', 'functions', 'api', 'r', 'relay.ts') }),
                encoding: 'utf8', timeout: 120000,
            });
            const m = out.match(/VANT_CT_JSON<<([\s\S]*?)>>END/);
            if (process.env.CRASHTEST_B0_DEBUG) process.stderr.write('[b0-relay] child out len=' + out.length + ' marker=' + !!m + '\n');
            if (!m) return jsonRes({ error: 'relay probe produced no marker', raw: String(out).slice(0, 200) }, 500);
            return jsonRes(JSON.parse(m[1]), 200);
        } catch (e) {
            if (process.env.CRASHTEST_B0_DEBUG) process.stderr.write('[b0-relay] execFileSync threw: ' + (e && e.stack || e) + '\n');
            const tail = (e && e.stdout ? String(e.stdout).slice(-400) : String(e && e.message || e).slice(0, 200));
            const m = tail.match(/VANT_CT_JSON<<([\s\S]*?)>>END/);
            return jsonRes(m ? JSON.parse(m[1]) : { error: 'relay probe failed: ' + tail.slice(0, 160) }, 500);
        }
    });

    // dash-auth: POST { shapes: [{ name, env, request }] } -> the REAL
    // dashboard auth doors (request-otp.ts / verify-otp.ts / session.ts)
    // driven in-process by the DASH_CHILD probe (strip types, WHATWG
    // Request/Response, WebCrypto). The env seats per shape: Bolete_KV
    // (in-child KVStore shim) + sink (the capture fetch in the sender's
    // webhook seat, plus the __CODE__/useMintedCookie marker law).
    const DASH_CHILD_FILE = path.join(os.tmpdir(), 'vant-ct-dash-probe-' + process.pid + '.mjs');
    const DASH_HOOKS_FILE = path.join(os.tmpdir(), 'vant-ct-dash-hooks-' + process.pid + '.mjs');
    const DASH_REGISTER_FILE = path.join(os.tmpdir(), 'vant-ct-dash-register-' + process.pid + '.mjs');
    // The dashboard lib graph imports EXTENSIONLESS (.ts sources) - fine
    // for Pages' bundler, unresolvable for plain Node ESM even under
    // strip-types. A minimal resolve hook appends ".ts" to extensionless
    // relative specifiers only (the vendored .cjs contracts already carry
    // their extensions and resolve normally).
    const DASH_HOOKS_SOURCE = [
        'export async function resolve(specifier, context, nextResolve) {',
        '    try { return await nextResolve(specifier, context); }',
        '    catch (e) {',
        '        if (specifier.startsWith(".") && /[.]ts$/.test(specifier) === false) {',
        '            return nextResolve(specifier + ".ts", context);',
        '        }',
        '        throw e;',
        '    }',
        '}',
    ].join('\n');
    const DASH_REGISTER_SOURCE = [
        "import { register } from 'node:module';",
        "register('./" + path.basename(DASH_HOOKS_FILE) + "', import.meta.url);",
    ].join('\n');
    const fs2 = require('fs');
    fs2.writeFileSync(DASH_CHILD_FILE, DASH_CHILD);
    fs2.writeFileSync(DASH_HOOKS_FILE, DASH_HOOKS_SOURCE);
    fs2.writeFileSync(DASH_REGISTER_FILE, DASH_REGISTER_SOURCE);
    if (process.env.CRASHTEST_B0_DEBUG) process.stderr.write('[b0-dash] arm files written\n');
    const { pathToFileURL } = require('url');
    harness.registerRoute('dash-auth', async (ctx) => {
        if (process.env.CRASHTEST_B0_DEBUG) process.stderr.write('[b0-dash] route entered\n');
        let j = null;
        try { j = await ctx.request.json(); } catch { j = null; }
        const shapes = (j && Array.isArray(j.shapes) && j.shapes.length) ? j.shapes.slice(0, 40) : null;
        if (!shapes) return jsonRes({ error: 'shapes array required' }, 400);
        try {
            const out = execFileSync(process.execPath, ['--experimental-strip-types', '--import', pathToFileURL(DASH_REGISTER_FILE).href, DASH_CHILD_FILE], {
                input: JSON.stringify({ shapes, handlerDir: path.join(ROOT, 'web', 'dashboard', 'functions', 'api', 'auth') }),
                encoding: 'utf8', timeout: 120000,
            });
            const m = out.match(/VANT_CT_JSON<<([\s\S]*?)>>END/);
            if (!m) return jsonRes({ error: 'dash probe produced no marker', raw: String(out).slice(0, 200) }, 500);
            return jsonRes(JSON.parse(m[1]), 200);
        } catch (e) {
            const tail = (e && e.stdout ? String(e.stdout).slice(-400) : String(e && e.message || e).slice(0, 200));
            const m = tail.match(/VANT_CT_JSON<<([\s\S]*?)>>END/);
            return jsonRes(m ? JSON.parse(m[1]) : { error: 'dash probe failed: ' + tail.slice(0, 160) }, 500);
        }
    });

    // gov-escrow: POST { escrow, approvals[], ttl? } -> lib/escrow — vant's
    // REAL approval door. The arm serves the 'escrow-release:*' family with
    // vant's B0 two-key posture (requireApprovals 2): each listed principal
    // signs the request's approval record (distinct keys dedupe — one
    // principal listing twice is still one key), and the release consumes
    // only when the distinct-key posture is satisfied and the approval is
    // inside its window. Per-request ttl rides vant's per-approval
    // record-level expiry (ttl 0 = born expired, fail-closed). A refused
    // release answers a typed 4xx naming the blocker; a satisfied release
    // answers 2xx.
    const escrow = sandboxLib('escrow');
    const B0_ESCROW = escrow.create({
        approvalRequired: ['escrow-release:*'],
        requireApprovals: 2
    });
    harness.registerRoute('gov-escrow', async (ctx) => {
        let j = null;
        try { j = await ctx.request.json(); } catch { j = null; }
        if (!j || typeof j.escrow !== 'string' || !j.escrow) return jsonRes({ error: 'escrow id required' }, 400);
        if (!Array.isArray(j.approvals)) return jsonRes({ error: 'approvals array required' }, 400);
        const op = 'escrow-release:' + String(j.escrow).slice(0, 60);
        try {
            const req = B0_ESCROW.requestApproval(op, 'governance row ' + String(j.escrow).slice(0, 60), {
                ttlMs: j.ttl != null ? Number(j.ttl) : undefined
            });
            if (req.approvalId) {
                for (const principal of j.approvals) {
                    if (principal != null && principal !== '') B0_ESCROW.approve(req.approvalId, String(principal).slice(0, 80));
                }
                const consumed = B0_ESCROW.consumeApproval(req.approvalId, op);
                if (consumed.approved) return jsonRes({ ok: true, released: true, escrow: String(j.escrow) }, 200);
                return jsonRes({ error: 'release refused', reason: consumed.reason || 'not_satisfied', escrow: String(j.escrow) }, 403);
            }
            return jsonRes({ error: 'escrow request refused', reason: req.reason || 'unknown', escrow: String(j.escrow) }, 403);
        } catch (e) {
            return jsonRes({ error: String(e && e.message || e).slice(0, 140) }, 403);
        }
    });

    // wiring-trust: POST { ops: [{ op, agent?, kind?, meta? }] } — the
    // SCOPED TRUST arm (Phase A drill-down slice 1, #249): drives the
    // sandbox's lib/trust.js + lib/state-store tree tier through the trust
    // consumer family's real seams (_treeRoot/_stateTree/treeFor/
    // state:saved events), op by op in-process; neutral facts only
    // (root hashes, presence, event payloads).
    harness.registerRoute('wiring-trust', async (ctx) => {
        const trust = sandboxLib('trust');
        const stateStore = sandboxLib('state-store');
        const bus = sandboxLib('event');
        let j = null;
        try { j = await ctx.request.json(); } catch { j = null; }
        const ops = (j && Array.isArray(j.ops) && j.ops.length) ? j.ops.slice(0, 40) : null;
        if (!ops) return jsonRes({ error: 'ops array required' }, 400);
        const out = [];
        let watched = null; // last state:saved fired while a watch op was armed
        const armedWatchers = []; // this call's listeners, off-ed on unwatch (no cross-call listener pile-up)
        for (const op of ops) {
            const o = op || {};
            try {
                if (o.op === 'clear') { trust.clearState(); out.push({ op: 'clear', ok: true }); continue; }
                if (o.op === 'record') {
                    trust.record(String(o.agent || 'wiring-agent'), String(o.kind || 'help'), Object.assign({}, o.meta || {}));
                    out.push({ op: 'record', ok: true, rootHash: trust._treeRoot() });
                    continue;
                }
                if (o.op === 'tree') {
                    const tree = trust._stateTree();
                    const mirrored = stateStore.fromTree('trust', tree);
                    const agent = String(o.agent || '');
                    out.push({
                        op: 'tree', ok: true,
                        rootHash: trust._treeRoot(),
                        pathsUnderTrust: tree.paths().filter((p) => p.startsWith('/trust/')).length > 0,
                        scorePresent: agent ? !!(mirrored.scores && agent in mirrored.scores) : false,
                        historyPresent: agent ? !!(mirrored.histories && Array.isArray(mirrored.histories[agent])) : false,
                    });
                    continue;
                }
                if (o.op === 'disk') {
                    const disk = stateStore.treeFor('state/trust.json');
                    out.push({ op: 'disk', ok: true, state: disk.state, diskRootHash: disk.rootHash, liveRootHash: trust._treeRoot() });
                    continue;
                }
                if (o.op === 'peek') {
                    // the RAW _treeRoot leg: no StateTree materialization -
                    // the exact null-or-hash contract the native pins grade
                    out.push({ op: 'peek', ok: true, rootHash: trust._treeRoot() });
                    continue;
                }
                if (o.op === 'watch') {
                    const fn = (d) => { if (d && d.moduleName === 'trust') watched = { rootHash: d.rootHash, liveRootHash: trust._treeRoot() }; };
                    bus.on('state:saved', fn);
                    armedWatchers.push(fn);
                    out.push({ op: 'watch', ok: true, armed: true });
                    continue;
                }
                if (o.op === 'unwatch') {
                    for (const fn of armedWatchers) { try { bus.off('state:saved', fn); } catch (eu) {} }
                    armedWatchers.length = 0;
                    out.push({ op: 'unwatch', ok: true });
                    continue;
                }
                if (o.op === 'report') {
                    out.push({ op: 'report', ok: true, event: watched });
                    watched = null;
                    continue;
                }
                out.push({ op: String(o.op), error: 'unknown op' });
            } catch (e) {
                out.push({ op: String((o && o.op) || '?'), error: String(e && e.message || e).slice(0, 140) });
            }
        }
        return jsonRes({ results: out }, 200);
    });

    // wiring-module: POST { module, ops: [{ op, ... }] } — the SCOPED STATE
    // arm's second car (drill-down slice 2, #249): a per-module verb table
    // (real lib consumers only: node-registry / consensus / market) driving
    // the merge-path tree tier in-process through the sandbox's real seams.
    // Verdicts are vant's truth; the arm reports neutral facts and never
    // loanpre-digested answers.
    const WIRING_MODULES = {
        'node-registry': {
            file: 'state/node-registry.json',
            prefix: '/node-registry/',
            load: (lib) => lib,
            act: {
                register: async (m, o) => { const r = m.register({ id: String(o.id), host: String(o.host || 'localhost'), port: Number(o.port || 3457) }); if (o.settleMs) await new Promise((rz) => setTimeout(rz, Number(o.settleMs))); return r; },
                heartbeat: async (m, o) => { const r = m.heartbeat(String(o.id)); if (o.settleMs) await new Promise((rz) => setTimeout(rz, Number(o.settleMs))); return r; },
            },
            contains: (mirrored, o) => Array.isArray(mirrored.nodes) && mirrored.nodes.some((n) => n && n[String(o.key || 'id')] === o.value),
        },
        'consensus': {
            file: 'state/consensus.json',
            prefix: '/consensus/',
            load: (lib) => lib,
            act: {
                create: async (m, o) => { const r = m.create(String(o.topic), { ballot: Array.isArray(o.ballot) ? o.ballot : ['y', 'n'] }); if (o.settleMs) await new Promise((rz) => setTimeout(rz, Number(o.settleMs))); return r; },
            },
            contains: (mirrored, o) => Array.isArray(mirrored.ledgers) && mirrored.ledgers.some((l) => l && l.topic === o.value),
        },
        'market': {
            file: 'state/market.json',
            prefix: '/market/',
            load: (lib) => lib,
            act: {
                // the caller context: a deployment-consented list (the pin
                // grades the MIRROR, not the consent gate)
                list: async (m, o) => { const r = m.list(String(o.kind || 'knowledge'), {
                    title: String(o.title || 'wiring pack pin'),
                    description: String(o.description || 'tree-tier mirror pin'),
                    seller: String(o.seller || 'wiring-pack-seller'),
                    price: Number(o.price == null ? 5 : o.price),
                    supply: Number(o.supply == null ? 1 : o.supply),
                }, { agentId: 'wiring-pack-agent', requiresConsent: false }); if (o.settleMs) await new Promise((rz) => setTimeout(rz, Number(o.settleMs))); return r; },
            },
            contains: (mirrored, o) => Array.isArray(mirrored.listings) && mirrored.listings.length >= Number(o.min == null ? 1 : o.min),
        },
    };
    harness.registerRoute('wiring-module', async (ctx) => {
        let j = null;
        try { j = await ctx.request.json(); } catch { j = null; }
        const specModule = j && WIRING_MODULES[String(j.module || '')];
        const ops = (j && Array.isArray(j.ops) && j.ops.length) ? j.ops.slice(0, 40) : null;
        if (!specModule || !ops) return jsonRes({ error: 'module + ops array required (module keys: node-registry|consensus|market)' }, 400);
        const mod = specModule.load(sandboxLib(String(j.module)));
        const stateStore = sandboxLib('state-store');
        const bus = sandboxLib('event');
        const out = [];
        let watched = null;
        const armedWatchers = [];
        for (const op of ops) {
            const o = op || {};
            try {
                if (o.op === 'clear') { out.push({ op: 'clear', ok: mod.clearState() === true }); continue; }
                if (o.op === 'act') {
                    const verb = specModule.act[String(o.name || '')];
                    if (!verb) { out.push({ op: 'act', error: 'unknown act: ' + String(o.name) }); continue; }
                    const res = await verb(mod, o);
                    const verdictRefusal = (res && res.error) ? String(res.error).slice(0, 140) : null;
                    out.push({ op: 'act', name: String(o.name || ''), ok: !verdictRefusal, answer: verdictRefusal, rootHash: mod._treeRoot() });
                    continue;
                }
                if (o.op === 'tree') {
                    const tree = mod._stateTree();
                    const mirrored = stateStore.fromTree(String(j.module), tree);
                    out.push({
                        op: 'tree', ok: true,
                        rootHash: mod._treeRoot(),
                        pathsUnder: tree.paths().filter((p) => p.startsWith(specModule.prefix)).length > 0,
                        contains: specModule.contains(mirrored, o),
                    });
                    continue;
                }
                if (o.op === 'disk') {
                    const disk = stateStore.treeFor(specModule.file);
                    out.push({ op: 'disk', ok: true, state: disk.state, reason: disk.reason, diskRootHash: disk.rootHash, liveRootHash: mod._treeRoot() });
                    continue;
                }
                if (o.op === 'peek') {
                    out.push({ op: 'peek', ok: true, rootHash: mod._treeRoot() });
                    continue;
                }
                if (o.op === 'settle') {
                    await new Promise((r) => setTimeout(r, Number(o.ms || 20)));
                    out.push({ op: 'settle', ok: true, ms: Number(o.ms || 20) });
                    continue;
                }
                if (o.op === 'watch') {
                    const modName = String(j.module);
                    const fn = (d) => { if (d && d.moduleName === modName && d.rootHash) watched = { rootHash: d.rootHash, liveRootHash: mod._treeRoot() }; };
                    bus.on('state:saved', fn);
                    armedWatchers.push(fn);
                    out.push({ op: 'watch', ok: true, armed: true });
                    continue;
                }
                if (o.op === 'report') {
                    out.push({ op: 'report', ok: true, event: watched });
                    watched = null;
                    continue;
                }
                if (o.op === 'unwatch') {
                    for (const fn of armedWatchers) { try { bus.off('state:saved', fn); } catch (eu) {} }
                    armedWatchers.length = 0;
                    out.push({ op: 'unwatch', ok: true });
                    continue;
                }
                out.push({ op: String(o.op), error: 'unknown op' });
            } catch (e) {
                out.push({ op: String((o && o.op) || '?'), ok: false, fault: String(e && e.name || 'Error') + ': ' + String(e && e.message || e).slice(0, 140) });
            }
        }
        return jsonRes({ results: out }, 200);
    });

    // wiring-mesh: POST { ops: [{ op, ... }] } — the SCOPED MESH arm
    // (drill-down slice 3, #249): drives the REAL lib/state/mesh MeshTree
    // with per-ride instances over throwaway WAL dirs and FIXED step/fixed
    // clocks (no wall clock in any verdict), plus shared-bus watchers for
    // the mesh:* event family. Every ride sweeps its dirs.
    harness.registerRoute('wiring-mesh', async (ctx) => {
        const MeshTree = require(path.join(sb, 'lib', 'state', 'mesh')).MeshTree;
        const bus = sandboxLib('event');
        let j = null;
        try { j = await ctx.request.json(); } catch { j = null; }
        const ops = (j && Array.isArray(j.ops) && j.ops.length) ? j.ops.slice(0, 60) : null;
        if (!ops) return jsonRes({ error: 'ops array required' }, 400);
        const instances = new Map(); // id -> { mt, dir, step | fixedT }
        let current = null; // most recently opened instance (ops without id ride it)
        const rideDirs = new Set();
        const watched = [];
        const armedWatchers = [];
        const jsonResInner = jsonRes;
        const out = [];
        try {
            for (const op of ops) {
                const o = op || {};
                try {
                    if (o.op === 'open') {
                        const dir = o.dirToken ? path.join(os.tmpdir(), 'vant-ct-mesh-dir-' + String(o.dirToken).slice(0, 40))
                            : fs.mkdtempSync(path.join(os.tmpdir(), 'vant-ct-mesh-'));
                        rideDirs.add(dir);
                        const stepMode = o.nowMode === 'step';
                        const inst = { mt: null, dir, step: stepMode ? { t: Number(o.t), step: Number(o.step || 10), n: 0 } : null, fixedT: Number(o.t) };
                        const now = stepMode ? () => inst.step.t + (inst.step.n++) * inst.step.step : () => inst.fixedT;
                        inst.mt = new MeshTree({ universe: String(o.universe || 'wiring-universe'), dir: o.wal === false ? undefined : dir, now, everyN: Number(o.everyN || 16), keepK: Number(o.keepK || 2), silent: o.silent === true });
                        instances.set(String(o.id), inst);
                        current = inst;
                        out.push({ op: 'open', ok: true, id: String(o.id), dir: 'set', info: inst.mt.persistenceInfo ? inst.mt.persistenceInfo() : null });
                        continue;
                    }
                    const inst = (o.id !== undefined && String(o.id) !== '' ? instances.get(String(o.id)) : current) || null;
                    if (!inst && o.op !== 'watch' && o.op !== 'report' && o.op !== 'unwatch') { out.push({ op: String(o.op), fault: 'no instance: ' + String(o.id) }); continue; }
                    if (o.op === 'register') { inst.mt.register(String(o.r), String(o.n), Object.assign({}, o.meta || {})); out.push({ op: 'register', ok: true }); continue; }
                    if (o.op === 'heartbeat') { inst.mt.heartbeat(String(o.r), String(o.n)); out.push({ op: 'heartbeat', ok: true }); continue; }
                    if (o.op === 'subscribe') { const res = inst.mt.subscribe(String(o.r), String(o.n), String(o.scope || '/mesh/' + o.r + '/' + o.n)); out.push({ op: 'subscribe', ok: true, ack: res }); continue; }
                    if (o.op === 'write') { const res = inst.mt.write(String(o.r), String(o.n), String(o.path), o.value == null ? {} : o.value); out.push({ op: 'write', ok: true, accepted: !!(res && res.accepted) }); continue; }
                    if (o.op === 'root') { out.push({ op: 'root', ok: true, rootHash: inst.mt.tree.rootHash() }); continue; }
                    if (o.op === 'alive') { const res = inst.mt.isAlive(String(o.r), String(o.n), Number(o.at)); out.push({ op: 'alive', ok: true, alive: res }); continue; }
                    if (o.op === 'get') { const res = inst.mt.tree.get(String(o.path)); out.push({ op: 'get', ok: true, state: res && res.state, value: res && res.value ? res.value.value : null, raw: res && res.value || null, meta: res && res.value || null }); continue; }
                    if (o.op === 'treeGet') { const res = inst.mt.tree.get('/mesh/' + String(o.r) + '/' + String(o.n) + String(o.path)); out.push({ op: 'treeGet', ok: true, state: res && res.state, value: res && res.value ? res.value.value : null, raw: res && res.value || null, meta: res && res.value || null }); continue; }
                    if (o.op === 'clock') { if (inst.step) inst.step.t = Number(o.now); else inst.fixedT = Number(o.now); out.push({ op: 'clock', ok: true, t: inst.step ? inst.step.t : inst.fixedT }); continue; }
                    if (o.op === 'rejected') { const rej = inst.mt.rejectedWrites().map((e) => ({ winner: !!e.winner, path: !!e.path })); out.push({ op: 'rejected', ok: true, count: rej.length, shapes: rej }); continue; }
                    if (o.op === 'ledger') { const l = inst.mt.deltaLedger(); out.push({ op: 'ledger', ok: true, sequenceLength: l.sequenceLength, ledgerHash: l.ledgerHash(), since: l.since(Number(o.since || 0)).map((rec) => ({ actor: rec.actor, epoch: typeof rec.epoch === 'number' })) }); continue; }
                    if (o.op === 'wal') {
                        const exists = fs.existsSync(path.join(inst.dir, 'wal.log'));
                        const snaps = fs.existsSync(path.join(inst.dir, 'snapshots')) && fs.readdirSync(path.join(inst.dir, 'snapshots')).filter((f) => f.endsWith('.snap')).length;
                        out.push({ op: 'wal', ok: true, walLog: exists, snapshotCount: snaps });
                        continue;
                    }
                    if (o.op === 'recovery-info') { const info = inst.mt.persistenceInfo(); out.push({ op: 'recovery-info', ok: true, info }); continue; }
                    if (o.op === 'watch') {
                        for (const name of (Array.isArray(o.names) ? o.names : ['mesh:register'])) {
                            const fn = (d) => { watched.push({ name, actor: d && d.actor, epoch: d && Number.isFinite(d.epoch) ? true : false, rootHash: d && d.rootHash, replayed: d && d.replayed }); };
                            bus.on(name, fn);
                            armedWatchers.push([name, fn]);
                        }
                        out.push({ op: 'watch', ok: true, armed: (Array.isArray(o.names) ? o.names : ['mesh:register']).length });
                        continue;
                    }
                    if (o.op === 'report') { out.push({ op: 'report', ok: true, fired: watched.slice(), names: watched.map((w) => w.name) }); watched.length = 0; continue; }
                    if (o.op === 'unwatch') {
                        for (const [name, fn] of armedWatchers) { try { bus.off(name, fn); } catch (eu) {} }
                        armedWatchers.length = 0;
                        out.push({ op: 'unwatch', ok: true });
                        continue;
                    }
                    out.push({ op: String(o.op), fault: 'unknown op' });
                } catch (e2) {
                    out.push({ op: String((o && o.op) || '?'), ok: false, fault: String(e2 && e2.name || 'Error') + ': ' + String(e2 && e2.message || e2).slice(0, 140) });
                }
            }
        } finally {
            for (const [name, fn] of armedWatchers) { try { bus.off(name, fn); } catch (eu) {} }
            for (const d of rideDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (er) {} }
        }
        void jsonResInner;
        return jsonRes({ results: out }, 200);
    });

    // wiring-surfaces: POST { ops: [{op,...}] } — the SCOPED SURFACES arm
    // (drill-down slice 3, #249): geometry's canonical barcodes, the
    // brain-verify surfaces (bin/health's section + bin/horcrux's exit
    // contract over a THROWAWAY brain dir), and mesh-status's report
    // (pure seed derivation, env flow, JSON roundtrip, degraded render).
    // Neutral facts + full env/console restore per op.
    harness.registerRoute('wiring-surfaces', async (ctx) => {
        let j = null;
        try { j = await ctx.request.json(); } catch { j = null; }
        const ops = (j && Array.isArray(j.ops) && j.ops.length) ? j.ops.slice(0, 40) : null;
        if (!ops) return jsonRes({ error: 'ops array required' }, 400);
        const canonical = require(path.join(sb, 'lib', 'state', 'canonical'));
        const meshStatus = sandboxLib('mesh-status');
        const out = [];
        for (const op of ops) {
            const o = op || {};
            try {
                if (o.op === 'barcode') {
                    const qc = require(path.join(sb, 'lib', 'geometry', 'quasicrystal'));
                    const a = qc.generateBarcodeFromContent({ beta: 2, alpha: 1 });
                    const b = qc.generateBarcodeFromContent({ alpha: 1, beta: 2 });
                    const again = qc.generateBarcodeFromContent({ alpha: 1, beta: 2 });
                    const h = canonical.hash({ alpha: 1, beta: 2 });
                    const expected = '9-' + String(10000 + (parseInt(h.slice(0, 5), 16) % 90000)).padStart(5, '0')
                        + '-' + String(parseInt(h.slice(5, 10), 16) % 100000).padStart(5, '0')
                        + '-' + (parseInt(h.slice(-1), 16) % 10);
                    const other = qc.generateBarcodeFromContent({ alpha: 1, beta: 3 });
                    out.push({ op: 'barcode', ok: true, orderIndependent: a === b, deterministic: a === again, formatOk: /^9-\d{5}-\d{5}-\d$/.test(a), matchesCanonical: a === expected, distinct: a !== other, samplePrefix: String(a).slice(0, 7) });
                    continue;
                }
                if (o.op === 'barcode-roundtrip') {
                    const qc = require(path.join(sb, 'lib', 'geometry', 'quasicrystal'));
                    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-ct-qc-'));
                    try {
                        const barcode = qc.generateBarcodeFromContent({ note: 'wiring pack' });
                        const stored = await qc.store(barcode, { note: 'wiring pack' }, dir);
                        const back = await qc.retrieve(barcode, dir);
                        const rederived = qc.generateBarcodeFromContent({ note: 'wiring pack' });
                        const has = await qc.has(rederived, dir);
                        out.push({ op: 'barcode-roundtrip', ok: true, stored: stored.stored === true, retrieved: !!(back && back.data && back.data.note === 'wiring pack'), rederivedSame: rederived === barcode, hasAgain: has === true });
                    } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (er) {} }
                    continue;
                }
                if (o.op === 'brainverify-health') {
                    const brainDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-ct-bv-'));
                    try {
                        fs.writeFileSync(path.join(brainDir, 'identity.md'), '# Me\nMODEL: pin');
                        const { checkBrainIntegrity } = require(path.join(ROOT, 'bin', 'health.js'));
                        const prevEnv = process.env.MODEL_PATH;
                        const origLog = console.log;
                        const logs = [];
                        try {
                            process.env.MODEL_PATH = brainDir;
                            console.log = (...a) => logs.push(a.join(' '));
                            checkBrainIntegrity();
                            logs.push('<SECOND-RUN>'); // SAME content: a clean brain verifies
                            checkBrainIntegrity();
                            fs.writeFileSync(path.join(brainDir, 'identity.md'), '# Me\nMODEL: TAMPERED');
                            logs.push('<TAMPERED-RUN>');
                            checkBrainIntegrity();
                        } finally {
                            console.log = origLog;
                            if (prevEnv === undefined) delete process.env.MODEL_PATH;
                            else process.env.MODEL_PATH = prevEnv;
                        }
                        const text = logs.join('|');
                        out.push({ op: 'brainverify-health', ok: true, baselineAnchored: /baseline anchored/.test(text), cleanVerified: /verified against last anchor/.test(text), diverged: /DIVERGED/.test(text), pipelineOrdered: text.indexOf('baseline anchored') < text.indexOf('<SECOND-RUN>') && text.indexOf('<SECOND-RUN>') < text.indexOf('<TAMPERED-RUN>') });
                    } finally { try { fs.rmSync(brainDir, { recursive: true, force: true }); } catch (er) {} }
                    continue;
                }
                if (o.op === 'brainverify-horcrux') {
                    const brainDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-ct-hx-'));
                    try {
                        fs.writeFileSync(path.join(brainDir, 'identity.md'), 'MODEL: pin');
                        const { spawnSync } = require('child_process');
                        const run = (args) => {
                            const r = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'horcrux.js'), ...args], { env: { ...process.env, MODEL_PATH: brainDir }, encoding: 'utf8' });
                            return { code: r.status, text: ((r.stdout || '') + (r.stderr || '')).slice(0, 400) };
                        };
                        const noAnchor = run(['verify']);
                        const anchored = run(['anchor', 'wiring pack baseline']);
                        const clean = run(['verify']);
                        fs.writeFileSync(path.join(brainDir, 'identity.md'), 'MODEL: TAMPERED');
                        const diverged = run(['verify']);
                        const reanchor = run(['anchor', 'intentional change']);
                        const reclean = run(['verify']);
                        out.push({
                            op: 'brainverify-horcrux', ok: true,
                            noAnchorCode: noAnchor.code,
                            anchoredCode: anchored.code, anchoredText: anchored.text.includes('Anchored'),
                            cleanCode: clean.code,
                            divergedCode: diverged.code, divergedText: diverged.text.includes('DIVERGED'),
                            reanchorCode: reanchor.code, recleanCode: reclean.code,
                        });
                    } finally { try { fs.rmSync(brainDir, { recursive: true, force: true }); } catch (er) {} }
                    continue;
                }
                if (o.op === 'meshstatus-report') {
                    const report = meshStatus.status().report;
                    const m = report && report.mesh;
                    const round = m ? JSON.parse(JSON.stringify(m)) : null;
                    out.push({
                        op: 'meshstatus-report', ok: true,
                        present: !!m && !m.error,
                        seedHex64: !!(m && m.seedScope && typeof m.seedScope.seedHex === 'string' && m.seedScope.seedHex.length === 64),
                        scopePath: m && m.seedScope ? m.seedScope.scopePath : null,
                        ttlPositive: !!(m && Number(m.presenceTtlMs) > 0),
                        peersArray: !!(m && Array.isArray(m.peers)),
                        jsonCountStable: !!(round && m && round.count === m.count),
                    });
                    continue;
                }
                if (o.op === 'meshstatus-envflow') {
                    const prev = process.env.VANT_UNIVERSE_SEED;
                    try {
                        const base = meshStatus.status().report.mesh.seedScope.seedHex;
                        const pure = meshStatus.status().report.mesh.seedScope.seedHex; // unseed: same answer twice
                        process.env.VANT_UNIVERSE_SEED = 'wiring-pack-universe';
                        const envd = meshStatus.status().report.mesh.seedScope.seedHex;
                        out.push({ op: 'meshstatus-envflow', ok: true, pureTwice: base === pure, envMoved: base !== envd });
                    } finally {
                        if (prev === undefined) delete process.env.VANT_UNIVERSE_SEED;
                        else process.env.VANT_UNIVERSE_SEED = prev;
                    }
                    continue;
                }
                if (o.op === 'meshstatus-render') {
                    const text = meshStatus.renderReport({ ...meshStatus.status().report, mesh: { error: 'wiring-pack poisoned leg' } });
                    const line = text.split('\n').find((l) => l.startsWith('mesh')) || '';
                    out.push({ op: 'meshstatus-render', ok: true, errorRendered: /\(error: wiring-pack poisoned leg\)/.test(line), labelKept: /mesh\s+\(unavailable\)/.test(line) });
                    continue;
                }
                out.push({ op: String(o.op), fault: 'unknown op' });
            } catch (e) {
                out.push({ op: String((o && o.op) || '?'), ok: false, fault: String(e && e.name || 'Error') + ': ' + String(e && e.message || e).slice(0, 140) });
            }
        }
        return jsonRes({ results: out }, 200);
    });

    return harness;
}

