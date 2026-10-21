#!/usr/bin/env node
/**
 * crashtest-run.js - run THIS REPO'S attack packs against VANT ITSELF.
 *
 * A real crashtest run root, zero install steps:
 *
 *   - packs load through crashtest v1.0.0's REAL pack loader + Harness
 *     (not the micro-harness in test/crashtest-packs.test.js);
 *   - the target is vant's own lib graph, exercised in a throwaway sandbox
 *     (same fixture shape as the contract suite - the workspace never
 *     touches its own models/ tree);
 *   - every attack verdict prints to the HONEST LEDGER: verdict, detail,
 *     and explicit skips for routes the run root does not arm.
 *
 * The one law holds all the way down: routes are in-process handler calls;
 * the three probe-child surfaces (brain-state tamper probes, crew registry
 * probes, mcp dispatcher probes) are forked node processes against the
 * copied sandbox lib - forks, never sockets.
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

// --- locate the crashtest clone (GitHub HEAD is the source of truth;
// --- npm still publishes 0.1.0 - see packs/README.md).

function findCrashtestDir() {
    if (process.env.CRASHTEST_DIR && fs.existsSync(path.join(process.env.CRASHTEST_DIR, 'src', 'packs', 'loader.js'))) {
        return process.env.CRASHTEST_DIR;
    }
    for (const candidate of [
        path.resolve(ROOT, '..', 'crashtest'),
        path.resolve(ROOT, '.agent_tmp', 'crashtest'),   // the working clone this workspace keeps
        path.resolve(os.homedir(), 'crashtest'),
    ]) {
        if (fs.existsSync(path.join(candidate, 'src', 'packs', 'loader.js'))) return candidate;
    }
    console.error('No crashtest clone found. Clone github.com/dhaupin/crashtest next to this repo, or set CRASHTEST_DIR=/path/to/crashtest');
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
        const loaded = await packsMod.loadPacks([path.join(ROOT, 'packs')], seen);
        const onlyPack = (process.argv.find((a) => a.startsWith('--pack=')) || '').replace('--pack=', '') || null;
        const packs = onlyPack ? loaded.filter((p) => p.manifest.name === onlyPack) : loaded;
        if (!packs.length) {
            console.error(onlyPack ? `pack "${onlyPack}" not found in ${path.join(ROOT, 'packs')}` : 'no packs found');
            process.exit(1);
        }
        const harness = buildRoutes(sb, harnessMod.Harness);
        const ctx = { config: {} };

        console.log(`=== crashtest run-root: ${packs.length} pack(s) against vant (harness clone: ${CT_DIR} @ checkout HEAD) ===`);
        const summaries = [];
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
                if (isFinding) exploitedDetails.push(`${a.name}: ${rec.detail}`);
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
            const armedRoutes = ['brain-read', 'brain-state', 'brain-migrate', 'guest-cap', 'crew-run', 'mcp-exec'];
            const entries = fs.readdirSync(libDir).filter((f) => f.endsWith('.js')).sort();
            console.log(`\n=== crashtest scenario library rows against the armed routes (${armedRoutes.length} routes) ===`);
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
                        rec = await a.run(harness, { config: {}, route });
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

// (sentinel law) even with console redirected, vant's async library logs
// can land on stdout AFTER the child's JSON row; the route extracts ONLY the
// sentinel-delimited record so the pack sees pure JSON.
function extractCtJson(text) {
    const hit = String(text || '').match(/VANT_CT_JSON<<([\s\S]*?)>>END/);
    return hit ? hit[1] : String(text || '');
}

function buildRoutes(sb, Harness) {
    const harness = new Harness({ baseUrl: 'https://vant-run-root' });

    harness.registerRoute('brain-read', async (ctx) => {
        const j = await ctx.request.json().catch(() => ({}));
        let brain, r;
        try {
            brain = require(path.join(sb, 'lib', 'brain.js'));
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

    // Pending oracles stay UNREGISTERED: the packs degrade via route-absence
    // (skipped-REFUSED), crashtest's library rows skip undeclared routes
    // politely - and, as the request-shape-flood row just proved, a 501
    // shim IS a 5xx to the fuzz floor. Absence is the honest shape.
    return harness;
}
