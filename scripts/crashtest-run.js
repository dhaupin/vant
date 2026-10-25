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
        'home-summary', 'home-admin', 'memory-note-write', 'memory-note-read',
        'gov-grant', 'gov-resolve', 'gov-locks'];
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
            // deleteRoute is deliberately UNDECLARED: vant's state K/V has
            // no per-note delete yet, and staleToken is undeclared (vant's
            // fence tokens are pid-borne) — both families rows that need
            // them honest-skip naming the knob, per the arm contract.
            memory: { writeRoute: 'memory-note-write', readRoute: 'memory-note-read', readStyle: 'body' },
            governance: { grantsRoute: 'gov-grant', resolveRoute: 'gov-resolve', locksRoute: 'gov-locks', ttlMode: 'free' },
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
    // true) — the fresh path bypasses BOTH caches so two writers in one
    // run see each other's last landing (the drift rows depend on it).
    harness.registerRoute('memory-note-read', async (ctx) => {
        let j = null;
        try { j = await ctx.request.json(); } catch { j = null; }
        if (!j || typeof j.id !== 'string' || !j.id) return jsonRes({ error: 'note id required' }, 400);
        try {
            const value = await memory.recall(`note:${j.id}`, { fresh: true });
            if (value === undefined) return jsonRes({ error: 'no such note', id: j.id }, 404);
            const note = { id: j.id, ...(value && typeof value === 'object' ? value : { body: value }) };
            return jsonRes(note, 200);
        } catch (e) {
            return jsonRes({ error: String(e && e.message || e).slice(0, 140) }, 403);
        }
    });

    // gov-grant (rules IS vant's grant ledger): POST { principal,
    // capability, scope?, permit, precedence?, revoke? } -> setRule /
    // deleteRule with the permit fused into validate(). Precedence rides
    // the rule record for read-back; resolution ORDER is vant's actual
    // rules order (the precedence rows honestly surface that).
    harness.registerRoute('gov-grant', async (ctx) => {
        let j = null;
        try { j = await ctx.request.json(); } catch { j = null; }
        if (!j || typeof j.principal !== 'string' || !j.principal) return jsonRes({ error: 'principal required' }, 400);
        if (typeof j.capability !== 'string' || !j.capability) return jsonRes({ error: 'capability required' }, 400);
        if (j.permit !== 'allow' && j.permit !== 'deny' && j.revoke !== true) return jsonRes({ error: 'permit must be allow or deny (or revoke)' }, 400);
        const ruleName = `grant:${j.principal}:${j.capability}`;
        try {
            if (j.revoke === true) {
                rules.deleteRule(ruleName);
                return jsonRes({ ok: true, revoked: ruleName }, 200);
            }
            if (j.permit === 'deny') {
                rules.setRule(ruleName, {
                    appliesTo: (op) => op === j.capability,
                    validate: () => false,
                    reason: `denied by grant: ${String(j.principal)}`,
                    precedence: Number(j.precedence) || 0,
                    scope: j.scope ? String(j.scope).slice(0, 120) : null,
                });
            } else {
                rules.setRule(ruleName, {
                    appliesTo: (op) => op === j.capability,
                    validate: () => true,
                    reason: `allowed by grant: ${String(j.principal)}`,
                    precedence: Number(j.precedence) || 0,
                    scope: j.scope ? String(j.scope).slice(0, 120) : null,
                });
            }
            return jsonRes({ ok: true, rule: ruleName, permit: j.permit }, 200);
        } catch (e) {
            return jsonRes({ error: String(e && e.message || e).slice(0, 140) }, 403);
        }
    });

    // gov-resolve: POST { principal, capability, scope? } -> rules.check(
    // capability) — vant's real decision: default-deny dangerous names,
    // custom-rule verdicts, allowlist fallthrough. ALWAYS 200 (the
    // decision IS the answer: { permit, rule?, reason? }), 4xx only on a
    // malformed ask.
    harness.registerRoute('gov-resolve', async (ctx) => {
        let j = null;
        try { j = await ctx.request.json(); } catch { j = null; }
        if (!j || typeof j.capability !== 'string' || !j.capability) return jsonRes({ error: 'capability required' }, 400);
        try {
            const verdict = rules.check(j.capability, { principal: String(j.principal || ''), scope: j.scope ? String(j.scope) : null });
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

    return harness;
}
