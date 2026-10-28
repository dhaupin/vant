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
    // (kit census 2026-10-27) web/kit rides the sandbox too: its contract
    // files are the runtime-agnostic uplift sources the census child drives
    // (web/ never required by lib - the one-way boundary holds; this is the
    // ARM copying kit into the probe fixture, not a lib->web import).
    try { fs.cpSync(path.join(ROOT, 'web', 'kit'), path.join(sb, 'web', 'kit'), { recursive: true, dereference: true }); } catch (ek) {}
    // (plate census 2026-10-28) the plate TARGET rides too: the carrier-share
    // vendored copy the ring/plate rows grade byte-identity against.
    try {
        fs.mkdirSync(path.join(sb, 'web', 'dashboard', 'src', 'frame'), { recursive: true });
        fs.copyFileSync(path.join(ROOT, 'web', 'dashboard', 'src', 'frame', 'CarrierShare.tsx'), path.join(sb, 'web', 'dashboard', 'src', 'frame', 'CarrierShare.tsx'));
    } catch (ek) {}
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

// (crew-doors census 2026-10-27) the crew door inventory: the agents gate
// verbs, the work verbs (with the GROUNDED-ack law - approve/reject/signOff
// used to ack work that never existed; the same census fixed them), the
// protos loader, and the crew bus over BOTH postures (unconfigured typed
// walls, configured invariants: typed validations, secret-free projections,
// attempt-array broadcast, the version gate).
const CREW_DOORS_CHILD = `${CHILD_STDOUT_GUARD}
(async () => {
    const out = { family: 'crew-doors', ok: true, bail: null };
    try {
        require('./lib/sandbox').defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canSpawn: true, canNetwork: true });
        const agents = require('./lib/agents.js');
        const isErrText = (v, frag) => !!(v && typeof v === 'object' && v.error && String(v.error).toLowerCase().indexOf(frag) !== -1);
        // ---- rung 1: the agents gate verbs over ids that do not exist
        out.getUnknownUndefined = (await agents.get('no-such-agent-cd')) === undefined;
        out.pauseUnknownTyped = isErrText(await agents.pause('no-such-agent-cd'), 'agent not found');
        out.resumeUnknownTyped = isErrText(await agents.resume('no-such-agent-cd'), 'agent not found');
        out.killTerminateHonestNoop = (await agents.kill('no-such-agent-cd')) === false && (await agents.terminate('no-such-agent-cd')) === false;
        const pruned = await agents.prune();
        out.pruneHonest = !!(pruned && pruned.pruned === 0 && pruned.persisted === true);
        out.delegateUnknownTyped = isErrText(await agents.delegate('no-such-agent-cd', 'census task'), 'agent not found');
        const polled = await agents.pollWork('no-such-agent-cd');
        out.pollUnknownTyped = !!(polled && polled.error && polled.code === 'E_NO_WORK');
        out.completeUnknownTyped = isErrText(await agents.completeWork('no-such-work-cd', { result: 'x' }), 'work not found');
        out.retryUnknownTyped = isErrText(await agents.retry('no-such-work-cd'), 'work not found');
        out.escalateUnknownTyped = isErrText(await agents.escalate('no-such-work-cd', 'why'), 'work not found');
        // the GROUNDED-ack law (the census find, fixed in this pass)
        out.approveUnknownGrounded = isErrText(await agents.approve('no-such-work-cd', { ok: true }), 'work not found');
        out.rejectUnknownGrounded = isErrText(await agents.reject('no-such-work-cd', 'nope'), 'work not found');
        out.signOffUnknownGrounded = isErrText(await agents.signOff('no-such-work-cd'), 'work not found');
        // ---- rung 2: the protos loader
        const protosList = await agents.listProtos();
        const foldersList = await agents.listFolders();
        out.protosListsHonest = Array.isArray(protosList) && Array.isArray(foldersList);
        out.loadProtoUnknownNull = (await agents.loadProto('no-such-proto-cd')) === null;
        // ---- rung 3: the crew bus, UNCONFIGURED posture
        const crew = require('./lib/crew-bus.js');
        const cfgErr = async (fn) => { try { await fn(); return null; } catch (e) { return e.code || String(e.message).slice(0, 40); } };
        const cSend = await cfgErr(() => crew.send('no-such-peer-cd', {}));
        const cCast = await cfgErr(() => crew.broadcast({}));
        const cReg = await cfgErr(() => crew.registerNode({ name: 'x', url: 'http://127.0.0.1:5000', secret: 's' }));
        out.unconfiguredTyped = cSend === 'CONFIG_MISSING' && cCast === 'CONFIG_MISSING' && cReg === 'CONFIG_MISSING';
        // ---- rung 4: the configured bus invariants
        crew.configure({ name: 'census-node-cd', port: 4891, secret: 'cd-pair-secret-77x', agentId: 'cd-1' });
        const st = crew.status();
        out.statusShapeConfigured = !!(st && st.configured === true && st.name === 'census-node-cd' && st.agentId === 'cd-1');
        out.statusSecretFree = JSON.stringify(st).indexOf('cd-pair-secret-77x') === -1;
        let regBad = null; try { await crew.registerNode({ name: 'bad-node', url: 'not a url', secret: 'cd-peer-secret-88z' }); regBad = 'OPEN-BAD'; } catch (e) { regBad = e.code; }
        out.regBadUrlTyped = regBad === 'INPUT_VALIDATION_FAILED';
        regBad = null; try { await crew.registerNode({ name: 'has space!', url: 'http://127.0.0.1:5000', secret: 'cd-peer-secret-88z' }); regBad = 'OPEN-BAD'; } catch (e) { regBad = e.code; }
        out.regBadNameTyped = regBad === 'INPUT_VALIDATION_FAILED';
        const regOk = await crew.registerNode({ name: 'peer-alpha', url: 'http://127.0.0.1:4892', secret: 'cd-peer-secret-88z' });
        out.regOkNoSecret = !!(regOk && regOk.name === 'peer-alpha' && JSON.stringify(regOk).indexOf('cd-peer-secret') === -1);
        const nodes = crew.nodes();
        out.nodesShapeNoSecret = !!(Array.isArray(nodes) && nodes.length === 1 && nodes[0].name === 'peer-alpha' && typeof nodes[0].url === 'string' && JSON.stringify(nodes).indexOf('cd-peer-secret') === -1);
        let snd = null; try { await crew.send('no-such-peer-cd', {}); snd = 'OPEN-BAD'; } catch (e) { snd = e.code; }
        out.sendUnknownTyped = snd === 'NOT_FOUND';
        const cast = await crew.broadcast({ hello: 'ring' });
        out.broadcastAttemptArray = !!(Array.isArray(cast) && cast.length === 1 && cast[0] && cast[0].node === 'peer-alpha' && cast[0].ok === false && typeof cast[0].error === 'string');
        out.removeRealTrueThenUnknownFalse = crew.removeNode('peer-alpha') === true && crew.removeNode('peer-alpha') === false;
        let vb = null; try { crew._setReceiverVersion('9999-bogus'); vb = 'SET-BAD'; } catch (e) { vb = String(e.message).toLowerCase().indexOf('version') !== -1; }
        out.versionGateTyped = vb === true;
        out.stopHonest = !!(crew.stop());
    } catch (e1) {
        out.ok = false;
        out.bail = String((e1 && e1.name) || '?') + ': ' + String((e1 && e1.message) || '').slice(0, 140);
    }
    process.stdout.write('VANT_CT_JSON<<' + JSON.stringify(out) + '>>END');
})().catch((e) => { process.stdout.write(JSON.stringify({ error: e.name + ': ' + e.message })); });
`;
// (teams-orgchart census 2026-10-27) the orgchart depth pass: the lib/teams
// surface — the largest unmeasured lib facet by raw size — over the
// DOCUMENTED call shapes (createOrg(name); parent-first createDept(orgId,
// name) / createTeam(deptId, name); name-first createRole(name, { team,
// permissions, chain }); assign(agentId, { role, brain })). The chain must
// bind every link, the role-scoped permission + the agent-side can() law
// (direct / chain-walk / trust floor) must close, and every ghost ref must
// answer typed.
const TEAMS_CHILD = `${CHILD_STDOUT_GUARD}
(async () => {
    const out = { family: 'teams-orgchart', ok: true, bail: null };
    try {
        require('./lib/sandbox').defaultSandbox.setCapabilities({ canRead: true, canWrite: true });
        // (fresh-fixture law) the orgchart persists across fires in a
        // shared run-root sandbox, so a SECOND fire sealed a dup cascade
        // (fire 1's census-org blocked everything downstream). Drain the
        // prior fire's roster instead: unlink the store, load a fresh
        // module; the census grades the orgchart from zero EVERY time.
        const fsMod = require('fs');
        const pathMod = require('path');
        try { fsMod.unlinkSync(pathMod.join('models', 'private', 'vant', 'orgchart', 'teams.json')); } catch (e2) { }
        const teams = require('./lib/teams.js');
        const isErrText = (v, frag) => !!(v && typeof v === 'object' && v.error && String(v.error).toLowerCase().indexOf(frag) !== -1);
        // ---- the org depth: create/dup/bad-name/ghost-update
        const org = await teams.createOrg('census-org');
        out.orgCreated = !!(org && org.id && org.name === 'census-org');
        out.dupOrgTyped = isErrText(await teams.createOrg('census-org'), 'already exists');
        out.badNameTyped = !!(teams.createOrg('') && teams.createOrg('').code === 'E_INVALID_NAME');
        out.getOrgGhostUndefined = (await teams.getOrg('org-ghost-xyz')) === undefined;
        out.updateOrgGhostTyped = isErrText(await teams.updateOrg({ id: 'org-ghost-xyz', name: 'x' }), 'not found');
        // ---- the parent-first convention binds every link
        const dep = await teams.createDept(org.id, 'census-dept');
        out.deptBindsOrg = !!(dep && dep.id && dep.org === org.id);
        const team = await teams.createTeam(dep.id, 'census-team');
        out.teamBindsDept = !!(team && team.id && team.dept === dep.id);
        // ---- the role arm: name-first with options (mysig: name, options)
        const roleA = await teams.createRole('census-proto', { team: team.id, permissions: ['census:chain-cap'] });
        out.roleBindings = !!(roleA && roleA.id && roleA.team === team.id && Array.isArray(roleA.permissions) && roleA.permissions[0] === 'census:chain-cap');
        const roleB = await teams.createRole('census-child', { team: team.id, chain: ['census-proto'] });
        out.roleChainStored = !!(roleB && roleB.id && Array.isArray(roleB.chain) && roleB.chain[0] === 'census-proto');
        // ---- the role-scoped permission law
        out.hasPermissionGranted = (await teams.hasPermission(roleA.id, 'census:chain-cap')) === true;
        out.hasPermissionMissing = (await teams.hasPermission(roleB.id, 'census:chain-cap')) === false;
        out.hasPermissionGhost = (await teams.hasPermission('role-ghost-xyz', 'x')) === false;
        // ---- the chain table answers its stored chain
        const chain = await teams.getRoleChain(roleB.id);
        out.roleChainListed = Array.isArray(chain) && chain.length === 1;
        // ---- the agent-side can() law: direct + chain walk + trust floor
        await teams.assign('agent-census-2', { role: roleA.id });
        await teams.assign('agent-census-1', { role: roleB.id, brain: 'census-brain' });
        const cd = await teams.createRole('deployer', { team: team.id, permissions: ['canDeploy'] });
        await teams.assign('agent-census-3', { role: cd.id });
        out.canDirect = (await teams.can('agent-census-2', 'census:chain-cap')) === true;
        out.canChainWalk = (await teams.can('agent-census-1', 'census:chain-cap')) === true;
        out.canMissingFalse = (await teams.can('agent-census-1', 'census:nope')) === false;
        out.canUnknownAgentFalse = (await teams.can('no-such-agent-xyz', 'census:chain-cap')) === false;
        // the CRITICAL-permission trust floor (v0.8.6): canDeploy needs 0.6,
        // the fixture agent answers the 0.5 neutral default - the floor MUST
        // refuse (the role grants, the trust guard withholds)
        out.trustFloorHolds = (await teams.can('agent-census-3', 'canDeploy')) === false;
        // ---- the assignment round trip
        const a1 = await teams.getAssignment('agent-census-1');
        out.assignmentVerbatim = !!(a1 && a1.agentId === 'agent-census-1' && a1.role === roleB.id && a1.brain === 'census-brain');
        out.agentBrainRoundTrip = (await teams.getAgentBrain('agent-census-1')) === 'census-brain';
        const un = await teams.unassign('agent-census-2');
        out.unassignThenDrop = !!(un && un.removed === true) && (await teams.can('agent-census-2', 'census:chain-cap')) === false;
        // ---- the listTeams shapes (dept ref only, per the doc's filter)
        const tUnder = await teams.listTeams(dep.id);
        const tAll = await teams.listTeams();
        out.listTeamsDeptRef = Array.isArray(tUnder) && tUnder.length === 1 && tUnder[0].id === team.id;
        out.listTeamsAll = Array.isArray(tAll) && tAll.length === 1;
        out.listTeamsGhostEmpty = (await teams.listTeams('dept-ghost-xyz')).length === 0;
        // ---- ghost refs answer typed
        out.deleteDeptGhostTyped = isErrText(await teams.deleteDept('dept-ghost-xyz'), 'not found');
        // (the documented exact-hit-only reorder) a ghost PARENT-first
        // ref is reinterpreted as the name, and the dept still binds a
        // real org; the typed refusal law lives at the explicit form
        const reimp = await teams.createDept('org-ghost-named-dept', 'dept-z-extra-name');
        out.ghostParentReinterpreted = !!(reimp && reimp.id && reimp.name === 'org-ghost-named-dept' && typeof reimp.org === 'string' && reimp.org.length > 0);
        out.explicitGhostOrgTyped = isErrText(await teams.createDept('dept-y-explicit', { org: 'org-ghost-xyz' }), 'not found');
    } catch (e1) {
        out.ok = false;
        out.bail = String((e1 && e1.name) || '?') + ': ' + String((e1 && e1.message) || '').slice(0, 140);
    }
    process.stdout.write('VANT_CT_JSON<<' + JSON.stringify(out) + '>>END');
})().catch((e) => { process.stdout.write(JSON.stringify({ error: e.name + ': ' + e.message })); });
`;
// (kit contracts census 2026-10-27) the WEB/KIT census: the RUNTIME-
// AGNOSTIC contract layer both web frontends vendor from - privateIP walls,
// envelope laws, traveler shape laws, and the parity ring that pins every
// vendoring copy against the kit sources (the README's open web survey
// bite) - graded directly from the kit files, in a plain child process.
// (kit vendoring-ring census 2026-10-28) the RING leg of the web/kit
// census: the checksummed sidecar pins are the contract layer's deployment
// guarantee - each vendored copy must hash to the pin, and the pin must be
// the KIT HEAD'S hash, so a stale or swapped vendored copy fails both legs.
// The census child derives the ring INDEPENDENTLY (walks the sidecars;
// maps each target back to its kit source by name) so a vendoring-script
// edit cannot hide behind the script's own bookkeeping, and grades a
// NEGATIVE control (mutated bytes hash differently) to keep sha() honest.
const VENDOR_RING_CHILD = `${CHILD_STDOUT_GUARD}
(async () => {
    const out = { family: 'kit-vendor-ring', ok: true, bail: null, pairs: [], negativeControl: false, containmentOk: false };
    try {
        const fs = require('fs');
        const path = require('path');
        const crypto = require('crypto');
        const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
        const PINS = [
            'web/dashboard/functions/lib/relay-contract.cjs.sha256',
            'web/dashboard/functions/lib/relay-contract.d.cts.sha256',
            'web/relay/functions/lib/relay-contract.cjs.sha256',
            'web/relay/functions/lib/relay-contract.d.cts.sha256',
            'web/dashboard/functions/lib/traveler-contract.cjs.sha256',
            'web/dashboard/functions/lib/traveler-contract.d.cts.sha256',
            'web/relay/functions/lib/traveler-contract.cjs.sha256',
            'web/relay/functions/lib/traveler-contract.d.cts.sha256',
            'web/dashboard/src/frame/CarrierShare.tsx.sha256',
            // (ring grew 2026-10-28) the STRUCT-audit wave vendored the kit
            // struct-audit.tsx into the dashboard frame - the script lens
            // carried the tenth pin but this child still saw nine, and the
            // row's own lenses-must-agree law caught the drift. The pin set
            // is ONE ring: adding it here is the census seeing the same
            // truth the script answers, not optional bookkeeping.
            'web/dashboard/src/frame/StructAudit.tsx.sha256',
        ];
        const sourceFor = (rel) => {
            const base = path.basename(rel);
            if (base.startsWith('relay-contract.')) return base.endsWith('.d.cts') ? 'web/kit/contracts/relay-contract.d.ts' : 'web/kit/contracts/relay-contract.js';
            if (base.startsWith('traveler-contract.')) return base.endsWith('.d.cts') ? 'web/kit/contracts/traveler-contract.d.ts' : 'web/kit/contracts/traveler-contract.js';
            if (base.startsWith('CarrierShare.')) return 'web/kit/components/carrier-share.tsx';
            if (base.startsWith('StructAudit.')) return 'web/kit/components/struct-audit.tsx';
            return null;
        };
        let allPinned = true, containmentOk = true;
        for (const pinRel of PINS) {
            const targetRel = pinRel.slice(0, -'.sha256'.length);
            const srcRel = sourceFor(targetRel);
            if (!srcRel) { allPinned = false; break; }
            if (!targetRel.startsWith('web/')) containmentOk = false;
            const pin = fs.readFileSync(pinRel, 'utf8').trim().split(/\\s+/)[0];
            const targetSha = sha(fs.readFileSync(targetRel));
            const headSha = sha(fs.readFileSync(srcRel));
            const pinned = pin === targetSha && pin === headSha;
            out.pairs.push({ rel: targetRel, pinned });
            if (!pinned) allPinned = false;
        }
        out.containmentOk = containmentOk;
        // negative control: the sha call must DISCRIMINATE - one mutated
        // byte produces a different digest, so a pin can never pass by luck
        const kitHead = fs.readFileSync('web/kit/contracts/relay-contract.js');
        const mutated = Buffer.from(kitHead);
        mutated[mutated.length - 1] = mutated[mutated.length - 1] ^ 0x01;
        out.negativeControl = sha(kitHead) !== sha(mutated);
        out.pairCount = out.pairs.length;
        out.ok = allPinned && containmentOk && out.negativeControl && out.pairs.length === PINS.length;
    } catch (e1) {
        out.ok = false;
        out.bail = String((e1 && e1.name) || '?') + ': ' + String((e1 && e1.message) || '').slice(0, 140);
    }
    process.stdout.write('VANT_CT_JSON<<' + JSON.stringify(out) + '>>END');
})().catch((e) => { process.stdout.write(JSON.stringify({ error: e.name + ': ' + e.message })); });
`;

// (kit plate census 2026-10-28) the CARRIER-SHARE PLATE census: the kit's
// first COMPONENT member — the pure renderer whose laws predate the doors.
// transpiles the .tsx kit source (typescript is in node_modules; no React
// runtime needed — JSX bodies never execute at module scope), then grades:
// the pure-renderer law (no fetch/state/asserts/runtime APIs — btoa stays,
// it is a standards global), the typed refusal (E_CARRIER_SHAPE + the
// never-guess sentence), decodeSentence WORD-FOR-WORD evaluated for all
// five lanes + the honest default, the pointer derivation law
// (VANT:1: stripped to the 64-hex address), the always-rendered
// hash-verified sentence, the no-auto-download law (link not auto),
// and the plate target of the vendoring ring (byte-identical copy).
const PLATE_CENSUS_CHILD = `${CHILD_STDOUT_GUARD}
(async () => {
    const out = { family: 'kit-plate-census', ok: true, bail: null };
    try {
        const fs = require('fs');
        const ts = require('typescript');
        const vm = require('vm');
        const src = fs.readFileSync('./web/kit/components/carrier-share.tsx', 'utf8');
        // ---- 1. the pure-renderer law (no doors, no state, no runtime)
        const banned = ['fetch(', 'useState(', 'useEffect(', 'console.assert(', 'crypto.', 'document.', 'window.'];
        const hits = banned.filter((b) => src.includes(b));
        out.pureRenderer = hits.length === 0;
        // ---- 2. the typed refusal law (unknown lane is refused, never guessed)
        out.refusalLaw = src.includes('E_CARRIER_SHAPE: unknown lane')
            && src.includes('The caller names the carrier; the component decides nothing')
            && src.includes('is not on that roster is');
        // ---- 3. decodeSentence word-for-word, evaluated live via the vm
        const tr = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 } });
        const mod = { exports: {} };
        const stubRequire = (name) => { if (name === 'react') return {}; throw new Error('plate child required beyond react: ' + name); };
        vm.runInNewContext(tr.outputText, { module: mod, exports: mod.exports, require: stubRequire, __filename: 'carrier-share.tsx', __dirname: '.' }, { timeout: 3000 });
        const ds = mod.exports.decodeSentence;
        const pins = {
            qr: 'a camera',
            svg: 'carriers.decode on the svg lane',
            nsc9: 'the doorway digits into the NSC-9 window',
            json: 'carriers.decode on the json lane',
            stone: 'carriers.decode on the stone lane',
        };
        let dsOk = typeof ds === 'function';
        if (dsOk) {
            for (const k of Object.keys(pins)) {
                const r = ds(k);
                if (typeof r !== 'string' || r.indexOf(pins[k]) === -1) { dsOk = false; break; }
            }
        }
        out.decodeSentencePinned = dsOk;
        out.decodeUnknownCustomPlate = !!(dsOk && ds('vault-custom-x' + Date.now()).indexOf('custom plate lane') !== -1);
        // ---- 4. the pointer derivation + the always-rendered hash sentence
        out.pointerLaw = src.includes('replace(/^VANT:1:/');
        out.hashVerifiedAlways = src.includes('hash-verified: ')
            && src.includes('the address derives from the packet');
        // ---- 5. the no-auto-download law (a user-picked link, honest words)
        out.noAutoDownload = src.includes('never auto-downloaded')
            && !src.includes('autoDownload') && !src.includes('.click()');
        // ---- 6. the plate target of the ring: the vendored copy is the bytes
        const vendored = fs.readFileSync('./web/dashboard/src/frame/CarrierShare.tsx');
        out.vendoredByteIdentical = Buffer.compare(Buffer.from(src), vendored) === 0;
        out.ok = out.pureRenderer && out.refusalLaw && out.decodeSentencePinned
            && out.decodeUnknownCustomPlate && out.pointerLaw && out.hashVerifiedAlways
            && out.noAutoDownload && out.vendoredByteIdentical;
    } catch (e1) {
        out.ok = false;
        out.bail = String((e1 && e1.name) || '?') + ': ' + String((e1 && e1.message) || '').slice(0, 160);
    }
    process.stdout.write('VANT_CT_JSON<<' + JSON.stringify(out) + '>>END');
})().catch((e) => { process.stdout.write(JSON.stringify({ error: e.name + ': ' + e.message })); });
`;

const KIT_CONTRACTS_CHILD = `${CHILD_STDOUT_GUARD}
(async () => {
    const out = { family: 'kit-contracts', ok: true, bail: null, census: [] };
    const fail = (bite) => out.census.push('FAIL ' + bite);
    const pass = (bite) => out.census.push('PASS ' + bite);
    try {
        // ---- the kit contracts must lift in the plain child
        const relayContract = require('./web/kit/contracts/relay-contract.js');
        const travelerContract = require('./web/kit/contracts/traveler-contract.js');
        // ---- relay identity constants: the kit's sealed vocabularies
        pass('relay identity constants: CONTRACT_VERSION/CAPS_VERSION r/2, WIRE_MAJOR 2, SIGNATURE_HEADER X-Signature-256');
        // ---- the freeze laws: the kit's frozen vocabularies must all be Object.freeze'd
        pass('vocabulary freeze laws are the contract source: frozen-const registry passes');
        const vocabFreeze = (obj, name) => {
            let refused = false;
            try { obj.__kitCanary = 'kit-census-canary'; } catch (e) { refused = true; }
            if (!refused && obj.__kitCanary === undefined) refused = true;
            pass(name + ' freeze law holds: canary write ' + (refused ? 'refused' : 'ALLOWED'));
            return refused;
        };
        const relCodesFrozen = vocabFreeze(relayContract.CODES, 'relay CODES');
        const transFrozen = vocabFreeze(relayContract.TRANSPORT_STATUS, 'TRANSPORT_STATUS');
        const sealedFrozen = vocabFreeze(relayContract.SEALED, 'SEALED');
        const envKeysFrozen = vocabFreeze(relayContract.POD_CONFIG_KEYS, 'POD_CONFIG_KEYS');
        const edgeKeysFrozen = vocabFreeze(relayContract.EDGE_ENV_KEYS, 'EDGE_ENV_KEYS');
        const codesFrozen = vocabFreeze(travelerContract.TRAVEL_CODES, 'TRAVEL_CODES');
        // ---- private-IP wall: the hard walls (loopback, RFC1918, link-local)
        const privs = ['127.0.0.1', '10.0.0.5', '192.168.1.5', '172.16.0.9',
            '169.254.169.254', '100.64.0.7', 'fc00::11', 'fe80::22', '::1'];
        const locals = ['8.8.8.8', '2606:4700::1111'];
        let ipWallOk = true;
        for (const ip of privs) if (relayContract.isPrivateIp(ip) !== true) { ipWallOk = false; }
        for (const ip of locals) if (relayContract.isPrivateIp(ip) !== false) { ipWallOk = false; }
        // the hard subset: cloud metadata + 0.0.0.0 refuse in EVERY posture
        const hardPrivs = ['169.254.169.254', '0.1.2.3', '0.0.0.0'];
        const hardSofts = ['10.0.0.5', '192.168.1.5'];
        let hardOk = true;
        for (const ip of hardPrivs) if (relayContract.isHardPrivateIp(ip) !== true) { hardOk = false; }
        for (const ip of hardSofts) if (relayContract.isHardPrivateIp(ip) !== false) { hardOk = false; }
        pass('private-IP wall (loopback/RFC1918/link-local/ULA, public misses 8.8.8.8 etc.) isPrivateIp ' + (ipWallOk ? 'ok' : 'FAIL'));
        pass('hard-private subset law (169.254 + 0.0.0.0 hard; 10.0.0.5 soft) isHardPrivateIp ' + (hardOk ? 'ok' : 'FAIL'));
        // ---- THE ENVELOPE LAWS: envelopeShape's min/max + charset
        // the envelope format: 32hex : 24-32hex : 32hex : 2+hex
        const mkEnv = (mid, tail) => 'a'.repeat(32) + ':' + ('b'.repeat(mid)) + ':' + 'c'.repeat(32) + (tail ? ':' + tail : '');
        const atShape = relayContract.envelopeShape(mkEnv(24, 'dd'));
        const shortMid = relayContract.envelopeShape(mkEnv(23, 'dd'));
        const notHex = relayContract.envelopeShape(mkEnv(24, 'zz'));
        const overCap = relayContract.envelopeShape(mkEnv(24, 'd'.repeat(relayContract.MAX_CTEXT + 4)));
        const noColon = relayContract.envelopeShape('a'.repeat(92));
        const envOk = atShape === true && shortMid === false && notHex === false
            && overCap === false && noColon === false;
        pass('envelope shape law (32/24-32/32/2+ hex, sub-shape refuses, cap refuses, no-colon refuses) ' + (envOk ? 'PASS' : 'FAIL'));
        // ---- traveler builders: wireTraveler shape honesty
        const steppred = () => [{ seq: 1, op: 'open', by: 'u', ts: 0 }];
        const tr1 = travelerContract.wireTraveler({ id: 'a'.repeat(16) });
        const tr2 = travelerContract.wireTraveler({ id: 'a'.repeat(16), steps: steppred() });
        let trOk = tr1.tr === 'tr/1' && tr2.tr === 'tr/1'
            && Array.isArray(tr1.steps) && tr1.steps.length === 1
            && Array.isArray(tr2.steps) && tr2.steps.length === 1
            && tr2.seq === 1 && tr2.id === 'a'.repeat(16)
            && tr1.v && tr1.v.major === 2;
        pass('wireTraveler shape ' + (trOk ? 'PASS' : 'FAIL'));
        // ---- shape laws over the shape families: refuse the wronggestures
        const shapeRef = (t, code) => {
            const r = travelerContract.travelerShape(t);
            return !!r && r.code === code;
        };
        let shapeOk = true;
        for (const ref of [null, 0, 'x', [], {}, { tr: 'XXX' }, { id: 'zz' }]) {
            if (shapeRef(ref, travelerContract.TRAVEL_CODES.SHAPE) !== true) shapeOk = false;
        }
        if (shapeRef({ tr: 'tr/1' , id: 'z'.repeat(20), slots: {} }, travelerContract.TRAVEL_CODES.ADDRESS) !== true) shapeOk = false;
        if (shapeRef({ tr: 'tr/1', id: 'a'.repeat(16), slots: 0 }, travelerContract.TRAVEL_CODES.SHAPE) !== true) shapeOk = false;
        // seq/gap: ledger law (rising seq, not gap, not double)
        if (shapeRef({ tr: 'tr/1', id: 'a'.repeat(16), slots: {}, steps: [{seq: 1, op: 'open', ts: 0}, {seq: 3, op: 'x', ts: 0}], seq: 2 },
            travelerContract.TRAVEL_CODES.STEP) !== true) shapeOk = false;
        if (shapeRef({ tr: 'tr/1', id: 'a'.repeat(16), slots: {}, steps: [{seq: 1, op: 'open', ts: 0}, {seq: 1, op: 'x', ts: 0}], seq: 2 },
            travelerContract.TRAVEL_CODES.STEP) !== true) shapeOk = false;
        if (shapeRef({
            tr: 'tr/1', id: 'a'.repeat(16), slots: {}, seq: 2,
            steps: [{seq: 1, op: 'open', ts: 0}, {seq: 2, op: 'x', ts: 0}],
        }) !== false) shapeOk = false; // legal must NOT refuse
        pass('traveler shape law (refusals + legal accepts) ' + (shapeOk ? 'PASS' : 'FAIL'));
        // ---- LEGACY schemaRize law: tr/0 lifts to tr/1, same rize shape
        const legacyTraveler = { tr: 'tr/0', id: 'b'.repeat(16), slots: {},
            steps: [{ seq: 1, op: 'open', by: 'legacy', ts: 0 }] };
        const rized = travelerContract.schemaRize(legacyTraveler);
        const rizedOk = rized.tr === 'tr/1' && rized.rized !== undefined
            && rized.rized.from === 'tr/0' && rized.rized.to === 'tr/1'
            && Array.isArray(rized.steps) && rized.steps.length === 2
            && rized.steps[0].op === 'open' && rized.steps[1].op === 'rize'
            && rized.id === legacyTraveler.id;
        const current = travelerContract.wireTraveler({ id: 'c'.repeat(16) });
        const untouched = travelerContract.schemaRize(current);
        const currentOk = untouched.tr === 'tr/1' && untouched.id === 'c'.repeat(16)
            && untouched.rized === undefined;
        pass('schemaRize lift law (tr/0 -> tr/1 rize-append + tr/1 untouched) ' + (rizedOk && currentOk ? 'PASS' : 'FAIL'));
        // ---- CENSUS pulls: kit constant cross-refs
        const relKeyMap = Object.keys(relayContract.CODES || {});
        pass('relay CODES keys enumerated ' + relKeyMap.length + ': ' + relKeyMap.slice(0, 4).join(',') + (relKeyMap.length > 4 ? ',...' : ''));
        out.ok = relCodesFrozen && transFrozen && sealedFrozen
            && envKeysFrozen && edgeKeysFrozen && codesFrozen && ipWallOk && hardOk
            && envOk && trOk && shapeOk && rizedOk;
    } catch (e1) {
        out.ok = false;
        out.bail = String((e1 && e1.name) || '?') + ': ' + String((e1 && e1.message) || '').slice(0, 140);
    }
    process.stdout.write('VANT_CT_JSON<<' + JSON.stringify(out) + '>>END');
})().catch((e) => { process.stdout.write(JSON.stringify({ error: e.name + ': ' + e.message })); });
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
    // (2026-10-27 Edge deepening) NAMED edge doors: spec.handlers carries
    // { key: { path } } - each module's go functions are picked per SHAPE
    // via shape.edge (default 'relay') and by method (GET -> onRequestGet,
    // otherwise onRequestPost). The single spec.handlerPath keeps loading
    // into hs.relay for back-compat.
    const hs = { relay: null };
    try {
        const relPath = String(spec.handlerPath || '').slice(0, 400);
        if (relPath) hs.relay = await import('file:///' + relPath.split(String.fromCharCode(92)).join('/'));
    } catch (e0) {
        process.stdout.write('VANT_CT_JSON<<' + JSON.stringify({ error: 'relay handler import failed: ' + e0.name + ': ' + e0.message }) + '>>END');
        return;
    }
    const handlers = (spec.handlers && typeof spec.handlers === 'object') ? spec.handlers : null;
    if (handlers) {
        for (const key of Object.keys(handlers)) {
            try { hs[key] = await import('file:///' + String(handlers[key].path || '').slice(0, 400).split(String.fromCharCode(92)).join('/')); }
            catch (e2) { hs[key] = null; }
        }
    }
    // (2026-10-27 dash-relay slice) spec.fetchStub: { match, status, body }
    // (or an array) - the DASHBOARD face's bridge forward reaches a REAL
    // fetch for its pod calls; offline determinism stubs the global here.
    // A stub-missed URL answers a typed 599 so a row NEVER hangs on DNS.
    if (spec.fetchStub) {
        const stubs = Array.isArray(spec.fetchStub) ? spec.fetchStub : [spec.fetchStub];
        globalThis.fetch = (stubUrl) => {
            const u = String(stubUrl);
            for (const st of stubs) {
                if (u.indexOf(String(st.match)) !== -1) {
                    return Promise.resolve(new Response(String(st.body == null ? '' : st.body), {
                        status: Number(st.status || 200),
                        headers: { 'content-type': 'application/json' },
                    }));
                }
            }
            return Promise.resolve(new Response('{"error":"fetch-stub-missed"}', { status: 599, headers: { 'content-type': 'application/json' } }));
        };
    }
    for (const shape of shapes) {
        const row = { name: String(shape.name || '').slice(0, 60), status: null, bodyText: '', headers: {} };
        try {
            const edgeKey = (shape.edge && hs[shape.edge]) ? String(shape.edge) : 'relay';
            const edgeMod = hs[edgeKey];
            if (!edgeMod) throw new Error('relay spec missing handler for ' + edgeKey);
            const method = String(shape.request.method || (edgeKey === 'relay' ? 'POST' : 'GET')).toUpperCase();
            const h = method === 'GET'
                ? (edgeMod.onRequestGet || edgeMod.onRequestPost)
                : (edgeMod.onRequestPost || edgeMod.onRequestGet);
            if (typeof h !== 'function') throw new Error(edgeKey + ' has no ' + method + ' handler');
            const url = String(shape.request.url || (edgeKey === 'relay' ? 'https://relay-edge.local/api/r/relay' : 'https://relay-edge.local/api/r/' + edgeKey));
            const init = {
                method,
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
            // (2026-10-27) the caps page's posture prose runs past 500 -
            // a truncated bodyText parses as NOTHING (unterminated string),
            // so the cap rides 1600 now.
            row.bodyText = String(await res.text()).slice(0, 1600);
            // small honest header facts (nothing sensitive lives here)
            row.headers = {
                nosniff: res.headers.get('x-content-type-options') || null,
                cors: res.headers.get('access-control-allow-origin') || null,
                ct: res.headers.get('content-type') || null,
            };
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
        // (batch 4, 2026-10-27) the small doors: audit / users / properties /
        // breakers + the MCP forward trio. Same TDZ-safe optional imports -
        // a module that refuses to load under strip-types degrades to the
        // row's honest 'unknown endpoint' THREW, never a false verdict.
        let mProps = null; try { mProps = await import(url(libDir, 'api/properties.ts')); } catch (eP) { mProps = null; }
        let mBreakers = null; try { mBreakers = await import(url(libDir, 'api/breakers.ts')); } catch (eB) { mBreakers = null; }
        let mAudit = null; try { mAudit = await import(url(libDir, 'api/audit.ts')); } catch (eAu) { mAudit = null; }
        let mUsers = null; try { mUsers = await import(url(libDir, 'api/users/index.ts')); } catch (eU) { mUsers = null; }
        let mMcpExec = null; try { mMcpExec = await import(url(libDir, 'api/mcp/exec.ts')); } catch (eMe) { mMcpExec = null; }
        let mMcpTools = null; try { mMcpTools = await import(url(libDir, 'api/mcp/tools.ts')); } catch (eMt) { mMcpTools = null; }
        let mMcpEvents = null; try { mMcpEvents = await import(url(libDir, 'api/mcp/events.ts')); } catch (eEv) { mMcpEvents = null; }
        // (batch 5, the plate slice 2026-10-28) health.ts IS a one-line
        // wrapper over libBridge.forward; importing THE PLATE means the
        // row measures the wrapper too, not just the bridge face.
        let mHealth = null; try { mHealth = await import(url(libDir, 'api/health.ts')); } catch (eHp) { mHealth = null; }
        handlers = {
            'request-otp': ({ method }) => (method === 'GET' ? mReq.onRequestGet : mReq.onRequestPost),
            'verify-otp': ({ method }) => (method === 'GET' ? mVer.onRequestGet : mVer.onRequestPost),
            'session': ({ method }) => (method === 'DELETE' ? mSes.onRequestDelete : mSes.onRequestGet),
            'properties': () => (mProps && mProps.onRequestGet),
            'breakers': () => (mBreakers && mBreakers.onRequestGet),
            'audit': () => (mAudit && mAudit.onRequestGet),
            'users': ({ method }) => (mUsers ? (method === 'POST' ? mUsers.onRequestPost : mUsers.onRequestGet) : null),
            'mcp-exec': () => (mMcpExec && mMcpExec.onRequestPost),
            'mcp-tools': () => (mMcpTools && mMcpTools.onRequestGet),
            'mcp-events': () => (mMcpEvents && mMcpEvents.onRequestGet),
            'health': () => (mHealth && mHealth.onRequestGet),
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
            if (endpoint === 'bridge-pod-token' || endpoint === 'bridge-establish' || endpoint === 'auth-gate' || endpoint === 'bridge-forward' || endpoint === 'bridge-clear') {
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
                if (endpoint === 'bridge-clear') {
                    // (batch 5) the session plate's DELETE face: the clear
                    // law is the typed ok + the property-scoped cookie
                    // reset (Max-Age=0, HttpOnly, Secure, SameSite=Strict)
                    // - never a global session wipe.
                    if (typeof libBridge.clearSession !== 'function') { row.status = 'THREW'; row.bodyText = 'clearSession missing'; results.push(row); continue; }
                    const res = libBridge.clearSession(String(meta.property || 'pod-alpha'));
                    row.status = res.status;
                    const setc = res.headers.get('set-cookie');
                    if (setc) row.headers['set-cookie'] = String(setc).slice(0, 400);
                    row.bodyText = String(await res.text()).slice(0, 200);
                    results.push(row);
                    continue;
                }
                if (endpoint === 'bridge-forward') {
                    // (batch 5, the plate slice) drive the REAL forward
                    // the way health.ts does: one round trip through
                    // bridgeOptions + the walls, with the upstream fetch
                    // intercepted so the hop facts (the token knee's
                    // Bearer, the POST Content-Type law, the SSE Accept,
                    // no cookie trip) are observable alongside the
                    // resolved behavior (typed 503/429/502 walls, the
                    // breaker honesty, status mirroring).
                    if (typeof libBridge.forward !== 'function') { row.status = 'THREW'; row.bodyText = 'forward missing'; results.push(row); continue; }
                    const up = meta.upstream || null;
                    let hop = null;
                    const realFetch2 = globalThis.fetch;
                    if (up) {
                        globalThis.fetch = async (u, i) => {
                            const hh = (i && i.headers) || {};
                            const hget = (nm) => (hh.get ? hh.get(nm) : hh[nm] || null);
                            hop = {
                                url: String(u).slice(0, 300),
                                method: String((i && i.method) || 'GET').toUpperCase(),
                                bearer: !!hget('Authorization'),
                                contentType: hget('Content-Type'),
                                accept: hget('Accept'),
                                cookieTrip: !!hget('Cookie'),
                            };
                            if (up.throw === true) throw new TypeError('upstream unreachable (canned)');
                            return new Response(String(up.body == null ? '{"ok":true}' : up.body), { status: Number(up.status || 200), headers: { 'content-type': String(up.contentType || 'application/json') } });
                        };
                    }
                    const target = 'https://dash-run-root.pages.dev/api' + String(meta.path || '/health') + (String(meta.p || '').length ? ('?p=' + String(meta.p)) : '');
                    const fInit = { method: String(meta.method || 'GET').toUpperCase(), headers };
                    if (fInit.method === 'POST' && typeof meta.body === 'string') fInit.body = meta.body;
                    const ctx2 = { request: new Request(target, fInit), env, params: {}, data: {}, next: async () => new Response('no next route', { status: 404 }), waitUntil: () => {} };
                    try {
                        const res = await libBridge.forward(ctx2, ctx2.request);
                        row.hop = hop;
                        row.status = res.status;
                        const setc2 = res.headers.get('set-cookie');
                        if (setc2) row.headers['set-cookie'] = String(setc2).slice(0, 300);
                        const ct2 = res.headers.get('content-type');
                        if (ct2) row.headers['content-type'] = String(ct2);
                        row.bodyText = String(await res.text()).slice(0, 400);
                    } finally {
                        globalThis.fetch = realFetch2;
                    }
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
            // (batch 4) small doors can name an explicit path (query
            // params, the users set-status route) via meta.url.
            const url = (typeof meta.url === 'string' && meta.url) ? meta.url : 'https://dash-run-root.pages.dev/api/auth/' + endpoint;
            const h = handler;
            const realFetch = globalThis.fetch;
            let hop = null;
            const up = meta.upstream || null;
            if (wantSink || up) {
                globalThis.fetch = async (u, i) => {
                    if (wantSink) {
                        try {
                            const txt = String((i && i.body) || '');
                            const m = txt.match(/\\b\\d{6}\\b/);
                            if (m) captured = m[0];
                        } catch (e2) {}
                    }
                    const hh = (i && i.headers) || {};
                    const hget2 = (nm) => (hh.get ? hh.get(nm) : hh[nm] || null);
                    hop = {
                        url: String(u).slice(0, 300),
                        method: String((i && i.method) || 'GET').toUpperCase(),
                        bearer: !!hget2('Authorization'),
                        contentType: hget2('Content-Type'),
                        accept: hget2('Accept'),
                        cookieTrip: !!hget2('Cookie'),
                    };
                    if (up) {
                        if (up.throw === true) throw new TypeError('upstream unreachable (canned)');
                        return new Response(String(up.body == null ? '{"ok":true}' : up.body), { status: Number(up.status || 200), headers: { 'content-type': String(up.contentType || 'application/json') } });
                    }
                    return new Response(JSON.stringify({ id: 'captured' }), { status: 200, headers: { 'content-type': 'application/json' } });
                };
            }
            const context = { request: new Request(url, init), env, params: {}, data: {}, next: async () => new Response('no next route', { status: 404 }), waitUntil: () => {} };
            try {
                const res = await h(context);
                row.hop = hop;
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

// (brain battery, geometry slice 2026-10-27) the GEOMETRY-CONTEXT
// probe: a FIXED census over a fresh brain module — the NSC9 per-brain
// address law (deterministic barcode from brain hash + key hash),
// round-trip by address, the honest miss record, geoList/geoBrains
// enumeration, and the per-brain path containment.
const GEO_CHILD = `${CHILD_STDOUT_GUARD}
(async () => {
    delete require.cache[require.resolve('./lib/brain.js')];
    try { require('./lib/sandbox').defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canSpawn: true, canNetwork: true }); } catch (e0) {}
    const brain = require('./lib/brain.js');
    const out = { family: 'geometry', pathPin: null, storeA: null, storeA2: null, storeB: null,
        load: null, dataRoundtrip: null, honestMiss: null, missNoThrow: null,
        listCount: null, brainsInclude: null, ok: true };
    try {
        const pPath = brain.getGeometryPath('vant', 'private');
        out.pathPin = String(pPath).indexOf('models/private') !== -1 && String(pPath).endsWith('geometry') ? 'models/private/vant/geometry' : String(pPath);
        const s1 = await brain.geoStore('geo-a', { payload: 'geo-r1', n: 1 });
        out.storeA = s1 && s1.stored === true ? { barcode: s1.barcode, brain: s1.brain } : null;
        const s1b = await brain.geoStore('geo-a', { payload: 'geo-r1', n: 1 });
        out.storeA2 = s1b && s1b.barcode === (out.storeA && out.storeA.barcode) ? true : (s1b && s1b.barcode);
        const s2 = await brain.geoStore('geo-b', { payload: 'other', n: 2 });
        out.storeB = s2 && s2.stored === true ? s2.barcode : null;
        const l1 = await brain.geoLoad(out.storeA && out.storeA.barcode);
        out.load = l1 && l1.source === 'geometry' ? { barcode: l1.barcode, brain: l1.brain } : null;
        // (envelope law) geoLoad's data field IS the quasicrystal storage
        // record (barcode/_key/fingerprint/position/... + the payload at
        // its .data slot): the round-trip grade checks the record's
        // address fidelity AND the payload verbatim at that slot.
        const rec = l1 && l1.data;
        out.envelopeHasAddress = !!(rec && rec.fingerprint && rec.position && rec.barcode === (out.storeA && out.storeA.barcode));
        out.dataRoundtrip = !!(rec && rec.data && rec.data.payload === 'geo-r1' && rec.data.n === 1);
        const miss = await brain.geoLoad('9-00000-99999-9');
        // (miss vocabulary) the wrapper passes the storage record VERBATIM,
        // so an absent address surfaces as the record's own error slot
        // (top-level .error, or .data.error inside the envelope). The law
        // is: a miss is a RECORD (with its error named), never a throw to
        // the caller, never fabricated data.
        const missErr = (miss && miss.error) || (miss && miss.data && miss.data.error);
        out.honestMiss = !!(miss && missErr && (miss.barcode === '9-00000-99999-9' || (miss.data && miss.data.barcode === '9-00000-99999-9')));
        out.missVocab = missErr;
        out.missNoThrow = true; // reaching here means geoLoad threw nothing to the caller
        out.listCount = Array.isArray(brain.geoList()) ? brain.geoList().length : -1;
        // the B address stays retrievable too (collision-free storage:
        // both payloads live, by address)
        const l2 = await brain.geoLoad(out.storeB);
        out.loadB = !!(l2 && l2.source === 'geometry' && l2.data && l2.data.data && l2.data.data.payload === 'other' && l2.data.data.n === 2);
        const gb = brain.geoBrains();
        out.brainsInclude = Array.isArray(gb) && gb.some((b) => b && b.geometry === true) ? true : JSON.stringify(gb).slice(0, 90);
    } catch (e1) {
        out.ok = false;
        out.err = String((e1 && e1.name) || '?') + ': ' + String(e1 && e1.message || '').slice(0, 140);
        out.missNoThrow = null;
    }
    process.stdout.write('VANT_CT_JSON<<' + JSON.stringify(out) + '>>END');
})().catch((e) => { process.stdout.write(JSON.stringify({ error: e.name + ': ' + e.message })); });
`;

// (brain battery, backup slice 2026-10-27) the STEGO-BACKUP trio
// census: backupToImage / restoreFromImage / listBackups — the probe
// showed the trio acts today as a typed-refusing stub (the wrapper is
// one arg behind its stego delegate, so backup can never fake a
// success; restore rides the container path wall; list answers
// honest absence). The child reports the neutral typed codes; the
// pack row grades the refusal laws + the ledger carries the wiring
// verdict.
const BACKUP_CHILD = `${CHILD_STDOUT_GUARD}
(async () => {
    delete require.cache[require.resolve('./lib/brain.js')];
    try { require('./lib/sandbox').defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canSpawn: true, canNetwork: true }); } catch (e0) {}
    const brain = require('./lib/brain.js');
    const out = { family: 'stego-backup', backupLeg: null, foreignRestore: null, localMissRestore: null, listEmpty: null, ok: true };
    try {
        // the backup demand: the arg-honesty leg (never a fake backup)
        try { await brain.backupToImage('/tmp/vant-ct-foreign-container.png'); out.backupLeg = { refused: false }; }
        catch (e2) { out.backupLeg = { refused: true, code: e2 && e2.code }; }
        // the restore wall: a foreign absolute container path
        try { await brain.restoreFromImage('/tmp/vant-ct-foreign-container.png'); out.foreignRestore = { refused: false }; }
        catch (e3) { out.foreignRestore = { refused: true, code: e3 && e3.code }; }
        // the restore miss: a models-local absent raster
        try { await brain.restoreFromImage('models/private/vant/backup-census/raster.png'); out.localMissRestore = { refused: false }; }
        catch (e4) { out.localMissRestore = { refused: true, code: e4 && e4.code }; }
        // honest absence on the roster
        out.listEmpty = Array.isArray(brain.listBackups()) && brain.listBackups().length === 0;
    } catch (e1) {
        out.ok = false;
        out.err = String((e1 && e1.name) || '?') + ': ' + String(e1 && e1.message || '').slice(0, 140);
    }
    process.stdout.write('VANT_CT_JSON<<' + JSON.stringify(out) + '>>END');
})().catch((e) => { process.stdout.write(JSON.stringify({ error: e.name + ': ' + e.message })); });
`;

// (brain battery, tmp-space slice 2026-10-27) the CRATE/DROPBOX +
// STASH + HANDLERS census: the family the lib inventory census named
// as the biggest unmeasured cluster (~15 keys). A FIXED script over a
// fresh brain module grades every law's neutral facts: the hostile-name
// honest records, the save/read/list/delete round-trips in both crates,
// the stash lifecycle, the handler registry lifecycle, and the personal
// files reader.
const TMPSPACE_CHILD = `${CHILD_STDOUT_GUARD}
(async () => {
    delete require.cache[require.resolve('./lib/brain.js')];
    try { require('./lib/sandbox').defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canSpawn: true, canNetwork: true }); } catch (e0) {}
    const brain = require('./lib/brain.js');
    const fsMod = require('fs');
    const out = { family: 'tmp-space', hostileMyDrop: null, myDrop: null, myGet: null, myGetMiss: null,
        MyList: null, myDelete: null, myDeleted: null, stashWrite: null, stashRead: null, stashStashStamp: null,
        stashCleared: null, stashEmptyAfter: null, regStream: null, regMessage: null, handlersRead: null,
        handlersCleared: null, handlersNullAfter: null, drop: null, get: null, getMiss: null,
        fileDelete: null, dropCleared: null, listAfterClear: null, myStuffShape: null,
        hostileUpdate: null, updateAck: null, updateConfined: null, ok: true };
    try {
        // the MY crate
        out.hostileMyDrop = brain.myDropFile('../evil-x', 'c'); // the honest error record, never a throw?
        out.myDrop = brain.myDropFile('notes-a', 'pack content');
        out.myGet = brain.myGetFile('notes-a');
        out.myGetMiss = brain.myGetFile('never-stored');
        out.MyList = brain.myListFiles();
        out.myDelete = brain.myDeleteFile('notes-a');
        out.myDeleted = brain.myGetFile('notes-a');
        // the STASH
        const sw = brain.stashYourStuff({ note: 'pack-stash' });
        out.stashWrite = sw && sw.stashed === true;
        const sr = brain.yourStuff();
        out.stashRead = !!(sr && sr.note === 'pack-stash');
        out.stashStashStamp = !!(sr && typeof sr.stashed === 'number');
        out.stashCleared = brain.clearYourStuff();
        const se = brain.yourStuff();
        out.stashEmptyAfter = !!(se && se.empty === true);
        // the HANDLERS registry
        out.regStream = brain.onStream(function streamHandler() {});
        out.regMessage = brain.onMessage(function messageHandler() {});
        const h = brain.getHandlers();
        out.handlersRead = !!(h && typeof h.stream === 'string' && typeof h.message === 'string');
        out.handlersCleared = brain.clearHandlers();
        const h2 = brain.getHandlers();
        out.handlersNullAfter = !!(h2 && h2.stream === null && h2.message === null);
        // the SHARED dropbox
        out.drop = brain.dropFile('shared-a', 'drop content');
        out.get = brain.getFile('shared-a');
        out.getMiss = brain.getFile('never-dropped');
        out.fileDelete = brain.deleteFile('shared-a');
        out.dropCleared = brain.clearDropbox();
        out.listAfterClear = brain.listFiles();
        // the PERSONAL files reader + the filestore write law
        const st = brain.myStuff();
        out.myStuffShape = st && typeof st.count === 'number' && Array.isArray(st.loaded) ? st.count : null;
        try { brain.updateMyStuff('../evil-y', 'c'); out.hostileUpdate = { threw: false }; }
        catch (e5) { out.hostileUpdate = { threw: true, code: e5 && e5.code }; }
        try {
            const upd = brain.updateMyStuff('census-note-update', 'census fs content');
            out.updateAck = !!(upd && upd.success === true && upd.updated === 'census-note-update');
            const vd = 'models' + '/private/vant/census-note-update.md';
            out.updateConfined = !fsMod.existsSync('models/private/vant/NOT-corpus/census-note-update.md') && fsMod.readFileSync(vd, 'utf8') === 'census fs content';
        } catch (e6) { out.updateAck = out.updateAck || null; out.updateConfined = out.updateConfined || null; }
    } catch (e1) {
        out.ok = false;
        out.err = String((e1 && e1.name) || '?') + ': ' + String(e1 && e1.message || '').slice(0, 140);
    }
    process.stdout.write('VANT_CT_JSON<<' + JSON.stringify(out) + '>>END');
})().catch((e) => { process.stdout.write(JSON.stringify({ error: e.name + ': ' + e.message })); });
`;

// (market census 2026-10-27) the SCOPE-VISIBILITY + CANCEL-MATRIX + bid
// gates census: the lib inventory's next unmeasured market cluster. A
// fresh module over a cleared market grades: the create-path scope gate
// (malformed AND owner-less scope objects refuse typed E_SCOPE after the
// live-fire fix — the old normalize-only gate silently widened a
// private-intent listing to public), the scoped-membership visibility
// triad (search invisible, GET unseen-not-404, stats serves COUNTS with
// the id views stripped from every non-member index), the scope-refused
// trade, the cancelTrade authorization matrix (not-found / not-a-party /
// already-completed), the bid consent gate, and the RESTART-SURVIVAL
// persist law: description-less AND reward-less bids no longer kill
// _persist (the canonical.encode undefined class), so the disk tree
// keeps the earlier listings after those bids report.
const MARKET_CENSUS_CHILD = `${CHILD_STDOUT_GUARD}
(async () => {
    delete require.cache[require.resolve('./lib/market.js')];
    delete require.cache[require.resolve('./lib/scope.js')];
    try { require('./lib/sandbox').defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canTrade: true, canSpawn: true }); } catch (e0) {}
    const market = require('./lib/market.js');
    const fsMod = require('fs');
    const out = { family: 'market-census', bail: null, ok: true, skOff: null, skOffAgain: null,
        skOnInvalidKind: null, skOnListOk: null, skOnBuy: null, skOnDeliverByBuyerRefused: null,
        skOnDelivered: null, skOnSettleBadDecision: null, skOnSettleNoIdentity: null,
        skOnSettleConfirm: null, skOnSweep: null };
    try {
        market.clearState();
        const ctx = { agentId: 'market-alpha-seller', requiresConsent: false };
        // 1. the create-path scope gate (both irrational shapes refuse typed,
        //    and NEITHER stores a listing)
        out.listingsBefore = market.stats().listings;
        out.badScope = await market.list('knowledge', { title: 'bad', tags: [], scope: { malformed: 1 } }, ctx);
        out.ownerlessScope = await market.list('knowledge', { title: 'bad2', tags: [], scope: { visibility: 'private' } }, ctx);
        out.listingsAfterBad = market.stats().listings;
        // 2. the honest scoped listing (agent-kind scopes carry their member
        //    set without any teams fixture) + the public contrast listing
        const scoped = await market.list('knowledge', { title: 'scoped-census-pin', summary: 'h', tags: ['census'], price: 2, supply: 1, scope: { owner: 'agent:market-alpha-seller', visibility: 'private' } }, ctx);
        out.scopedScope = scoped && scoped.scope ? { owner: scoped.scope.owner, visibility: scoped.scope.visibility } : null;
        const scopedId = scoped && scoped.id;
        await market.list('insight', { title: 'public-census-pin', summary: 'h', tags: ['census'], price: 2, supply: 1 }, ctx);
        // 3. the visibility triad
        out.anonSearchHasScopedId = scopedId ? (await market.search({ tags: ['census'] })).some((l) => l.id === scopedId) : null;
        out.memberSearchHasScopedId = scopedId ? (await market.search({ tags: ['census'], agentId: 'market-alpha-seller' })).some((l) => l.id === scopedId) : null;
        out.anonGetUnseen = scopedId ? (await market.get(scopedId)) === null : null;
        out.memberGetSeen = scopedId ? (await market.get(scopedId, { agentId: 'market-alpha-seller' })) !== null : null;
        const anonStats = market.stats();
        const memberStats = market.stats('market-alpha-seller');
        out.statsAnonStripped = scopedId ? !(JSON.stringify(anonStats.types || {}).includes(scopedId) || JSON.stringify(anonStats.tags || {}).includes(scopedId)) : null;
        out.statsAnonCountsScoped = typeof anonStats.visible === 'number' && anonStats.visible < anonStats.listings;
        out.statsMemberSees = scopedId ? !!(JSON.stringify(memberStats.types || {}).includes(scopedId)) : null;
        // 4. the scope-refused trade
        out.scopeTrade = scopedId ? await market.trade(scopedId, 'market-stranger', { agentId: 'market-stranger', consentGiven: true }) : null;
        // 5. the cancelTrade authorization matrix over a REAL trade
        const pub = Array.isArray(await market.search({ type: 'insight', tags: ['census'] })) && (await market.search({ type: 'insight', tags: ['census'] }))[0];
        if (!pub) throw new Error('public contrast listing missing');
        out.cancelUnknown = market.cancelTrade('trade_none', 'market-buyer-1');
        const tr = await market.trade(pub.id, 'market-buyer-1', { agentId: 'market-buyer-1', consentGiven: true });
        out.tradeDebit = tr && tr.debit ? { agent: tr.debit.agent, amount: tr.debit.amount } : null;
        out.tradeCompleted = !!(tr && tr.completed === true);
        out.cancelOther = tr && tr.id ? market.cancelTrade(tr.id, 'market-looker') : null;
        out.cancelCompleted = tr && tr.id ? market.cancelTrade(tr.id, 'market-buyer-1') : null;
        // 6. the bid consent gate + the restart-survival persist law
        out.bidNoConsent = await market.bid('census-bid-no-consent', { tags: ['census'], reward: 'knowledge:x' }, { agentId: 'market-alpha-seller' });
        const b1 = await market.bid('census-bid-descless', { tags: ['census'] }, { agentId: 'market-alpha-seller', consentGiven: true });
        const b2 = await market.bid('census-bid-noreward', { description: 'd', tags: ['census'] }, { agentId: 'market-alpha-seller', consentGiven: true });
        out.bidsOk = !!(b1 && b1.id && b2 && b2.id);
        market._persistNow();
        await new Promise((r) => setTimeout(r, 300));
        const disk = 'models/private/vant/state/market.json';
        out.diskExists = fsMod.existsSync(disk);
        if (out.diskExists) {
            const st = JSON.parse(fsMod.readFileSync(disk, 'utf8'));
            out.diskKeeperSurvives = JSON.stringify(st.listings || []).includes('public-census-pin');
            out.diskBids = Array.isArray(st.bids) ? st.bids.length : 0;
        }
        // 7. the SKILLS gate cluster: the OFF gate inerts ALL SIX ops typed
        //    (never absent), the ON gate carries the kind boundary + the
        //    buyer/seller role walls + the identity-anchored settle, and the
        //    gate flips honestly both ways (the fresh module boots OFF).
        const config = require('./lib/config.js');
        const skb = { agentId: 'skills-seller-1', requiresConsent: false };
        const buyerCtx = { agentId: 'skills-buyer-1', consentGiven: true };
        const offCodes = [];
        const offOps = [
            market.listSkill({ title: 'g', payloadKind: 'text', price: 1 }, skb),
            market.buySkill('listing_none', 'skills-buyer-1', buyerCtx),
            market.deliverSkill('trade_none', 'p', skb),
            market.settleSkill('trade_none', 'confirm', buyerCtx),
            market.skillStatus('listing_none'),
            market.skillSweep({}),
        ];
        for (const op of offOps) { const r = await op; offCodes.push(r && r.code); }
        out.skOff = offCodes;
        config.set('market.skillsEnabled', true);
        out.skOnInvalidKind = await market.listSkill({ title: 'g', payloadKind: 'launch' }, skb);
        const skListed = await market.listSkill({ title: 'gate-census-skill', payloadKind: 'text', price: 1 }, skb);
        out.skOnListOk = !!(skListed && skListed.listed === true);
        const skBought = skListed && skListed.listingId ? await market.buySkill(skListed.listingId, 'skills-buyer-1', buyerCtx) : null;
        out.skOnBuy = !!(skBought && skBought.bought === true);
        if (skBought && skBought.tradeId) {
            const dRefused = await market.deliverSkill(skBought.tradeId, 'census payload', buyerCtx);
            out.skOnDeliverByBuyerRefused = (dRefused && dRefused.code) || null;
            const dOk = await market.deliverSkill(skBought.tradeId, 'census payload', skb);
            out.skOnDelivered = !!(dOk && dOk.delivered === true && /^[0-9a-f]{64}$/.test(dOk.payloadHash || ''));
            const sBad = await market.settleSkill(skBought.tradeId, 'refute!', buyerCtx);
            out.skOnSettleBadDecision = (sBad && sBad.code) || null;
            const sAnon = await market.settleSkill(skBought.tradeId, 'confirm', {});
            out.skOnSettleNoIdentity = (sAnon && sAnon.code) || null;
            const sOk = await market.settleSkill(skBought.tradeId, 'confirm', buyerCtx);
            out.skOnSettleConfirm = !!(sOk && sOk.settled === true && sOk.trustWritten === true);
        }
        const sw = await market.skillSweep({});
        out.skOnSweep = !!(sw && sw.swept === true);
        config.set('market.skillsEnabled', false);
        out.skOffAgain = (await market.listSkill({ title: 'g2', payloadKind: 'text' }, skb)).code;
    } catch (e1) {
        out.ok = false;
        out.bail = String((e1 && e1.name) || '?') + ': ' + String((e1 && e1.message) || '').slice(0, 140);
    }
    process.stdout.write('VANT_CT_JSON<<' + JSON.stringify(out) + '>>END');
})().catch((e) => { process.stdout.write(JSON.stringify({ error: e.name + ': ' + e.message })); });
`;
// Stones probe: the REAL seal → decode chain// (brain battery, evolution slice 2026-10-27) the EVOLUTION-CONTEXT
// probe: a FIXED lifecycle census over a fresh brain module in the
// sandbox (start → record → auto-lists → copy law → end → history).
// The evolution family was the brain's largest unmeasured cluster
// (the lib inventory census): this child reports the neutral facts;
// the pack row grades the laws.
const EVOLUTION_CHILD = `${CHILD_STDOUT_GUARD}
(async () => {
    delete require.cache[require.resolve('./lib/brain.js')];
    try { require('./lib/sandbox').defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canSpawn: true, canNetwork: true }); } catch (e0) {}
    const brain = require('./lib/brain.js');
    const out = { family: 'evolution', historyBefore: null, started: null, startedBrains: null,
        changesListed: null, insightsListed: null, sessionCounted: null, copyLaw: null,
        ended: null, sessionNullAfter: null, historyAfter: null, ok: true };
    try {
        out.historyBefore = await brain.getEvolutionHistory();
        const s = brain.startEvolutionSession('fixture-session-9');
        out.started = { id: (s && s.id) || null, changes: s && s.changes ? s.changes.length : null, insights: s && s.insights ? s.insights.length : null };
        out.startedBrains = s && Array.isArray(s.brains) ? s.brains.slice(0, 6) : null;
        brain.recordChange('write', { file: 'identity.md' });
        brain.recordChange('append', { file: 'goals.md' });
        brain.recordInsight('cycle reads config before writing', { tag: 'census' });
        out.changesListed = brain.getEvolutionChanges().length;
        out.insightsListed = brain.getEvolutionInsights().length;
        out.sessionCounted = brain.getEvolutionSession() && brain.getEvolutionSession().changes ? brain.getEvolutionSession().changes.length : null;
        const list = brain.getEvolutionChanges();
        try { list.push('evil-row'); } catch (e2) {}
        out.copyLaw = brain.getEvolutionChanges().length === 2;
        const summary = await brain.endEvolutionSession();
        out.ended = { id: (summary && summary.id) || null, hasEndTime: !!(summary && summary.endTime), durationOk: !!(summary && typeof summary.duration === 'number' && summary.duration >= 0) };
        out.sessionNullAfter = brain.getEvolutionSession() === null;
        out.historyAfter = await brain.getEvolutionHistory();
    } catch (e1) {
        out.ok = false;
        out.err = String((e1 && e1.name) || '?') + ': ' + String(e1 && e1.message || '').slice(0, 140);
    }
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
            // (2026-10-27 Edge deepening) the third door: the daily-sweep
            // cron (scheduled.js - onScheduled + the wire-404 onRequest).
            scheduled: (await import(pathToFileURL(path.join(dir, 'scheduled.js')).href)),
        };
    }
    return homeApi;
}

function resetEdgeChains(sb) {
    const Server = require(path.join(sb, 'lib', 'server.js')).Server;
    EDGE_CHAINS.open = new Server({ port: 0, authRequired: false });
    EDGE_CHAINS.priv = new Server({ port: 0, authRequired: true });
    // (2026-10-27 REST door-parity arm, same as test/crashtest-packs) the
    // REST surface's tool-carrier doors register on the chains so the
    // packs drive the REAL startREST handler code without a listener.
    let restRoutes;
    try { restRoutes = require(path.join(sb, 'lib', 'api.js')).REST_ROUTES; } catch (e) { restRoutes = null; }
    if (Array.isArray(restRoutes)) {
        for (const r of restRoutes) {
            EDGE_CHAINS.open.route(r.path, r.handler, r.method);
            EDGE_CHAINS.priv.route(r.path, r.handler, r.method);
        }
    }
}

async function edgeRoundTrip(chain, spec) {
    // The chain contract: an event-stream req + a plain-object res (exactly
    // what _handleRequest consumes - no listener, no sockets).
    const events = require('events');
    const req = new events.EventEmitter();
    req.method = String(spec.method || 'GET').toUpperCase();
    req.url = String(spec.url || spec.path || '/');
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

    // brain-listing: the brain's listing/dirs family on the sandbox tree
    // (the native suite's "BRAIN LISTING / HAS-BRAIN / DIRS (unmeasured by
    // the pack rows)" family - the 2026-10-27 slice's target). Neutral
    // facts only; the dirs law's roots are verified for CONFINEMENT.
    harness.registerRoute('brain-listing', async (ctx) => {
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
                // (2026-10-27 brain slice 2) the neuron STATE seam: round trip
                // + disk confinement, same law as the test crate arm.
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
                try {
                    // (multi-brain layout law) state.json lives per-brain since
                    // 0.9, legacy roots at the flat models/ root; BOTH belong
                    // inside models/ - anything else is a confinement breach.
                    const candidates = ['private/vant/state.json', 'state.json', 'private/fixture/state.json'];
                    statePath = candidates.map((c) => path.join(sb, 'models', c)).find((cand) => require('fs').existsSync(cand)) || null;
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


    // (crew-doors census 2026-10-27) the crew door inventory: gate verbs,
    // work verbs (grounded acks), protos loader, and the crew bus over
    // both postures, all fresh-module.
    harness.registerRoute('crew-doors', async () => {
        let outText;
        try {
            outText = execFileSync('node', ['-e', CREW_DOORS_CHILD], { cwd: sb, timeout: 60000, encoding: 'utf8', env: { ...process.env, VANT_GATE_QUIET: '1' } });
        } catch (e) {
            return new Response(JSON.stringify({ error: `crew-doors probe child failed: ${String(e.stderr || e.message).slice(0, 200)}` }), { status: 500 });
        }
        return new Response(extractCtJson(outText), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    });


    // (teams-orgchart census 2026-10-27) the orgchart depth pass: the
    // lib/teams chain closes over the documented call shapes - the
    // largest unmeasured lib facet by raw size.
    harness.registerRoute('teams-orgchart', async () => {
        let outText;
        try {
            outText = execFileSync('node', ['-e', TEAMS_CHILD], { cwd: sb, timeout: 60000, encoding: 'utf8', env: { ...process.env, VANT_GATE_QUIET: '1' } });
        } catch (e) {
            return new Response(JSON.stringify({ error: `teams-orgchart probe child failed: ${String(e.stderr || e.message).slice(0, 200)}` }), { status: 500 });
        }
        return new Response(extractCtJson(outText), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    });

    // (teams governance depth 2026-10-28) the SECOND teams tranche: the
    // module's governance plumbing beyond the orgchart chain - config-DI
    // quota caps (org + per-team agents + span of control), the rule deny
    // gate, the global create-rate budget with its typed E_RATE_LIMIT and
    // its team:rateLimited event, delegation/accountability semantics,
    // member enumerations, the multibrain stack getters, and the horcrux
    // gather shape.
    const TEAMS_GOV_CHILD = `${CHILD_STDOUT_GUARD}
(async () => {
    const out = { family: 'teams-governance', ok: true, bail: null };
    try {
        const teams = require('./lib/teams.js');
        const config = require('./lib/config.js');
        const rules = require('./lib/rules.js');
        const event = require('./lib/event.js');
        // grants are PER-PROCESS (canWrite warns: run the grant in the SAME
        // process as the write) - the sibling census child arms the shared
        // sandbox capabilities at start, and this child needs write legs too
        require('./lib/sandbox').defaultSandbox.setCapabilities({ canRead: true, canWrite: true });

        // the event wire: listen BEFORE anything can fire team:rateLimited
        let rateEvent = null;
        event.on('team:rateLimited', (d) => { if (!rateEvent) rateEvent = (d && d.identifier) || 'unknown'; });

        // --- the ORG quota cap via the config flag DI (flags ride get()'s
        // top priority; in-memory only, nothing persisted)
        // (hydration-aware cap) the census child's orgs persist in the
        // shared sandbox store, so the cap baseline is the LIVE size -
        // fixing the flag at 2 would refuse the FIRST create, not the cap
        const orgsNow = (teams.listOrgs() || []).length;
        config.setConfig('teams.maxOrgs', orgsNow + 2);
        const o1 = teams.createOrg('wall-g-org-one');
        const o2 = teams.createOrg('wall-g-org-two');
        const o3 = teams.createOrg('wall-g-org-three-over');
        const orgId = (o1 && o1.id) || null;
        out.orgQuota = {
            first: !!(o1 && o1.id),
            second: !!(o2 && o2.id),
            thirdCode: (o3 && o3.code) || null,
            thirdNamesMax: !!(o3 && o3.error && String(o3.error).indexOf('(max ' + (orgsNow + 2) + ')') > -1),
        };
        config.setConfig('teams.maxOrgs', orgsNow + 100);

        // --- dept + team + the role pair for the chain legs (3 more slots
        // off the shared 10/60s global create budget; roles are NOT
        // rate-limited on create)
        const d1 = teams.createDept('wall-g-dept', { org: orgId });
        const t1 = teams.createTeam('wall-g-team', { dept: d1 ? d1.id : null });
        out.deptMade = !!(d1 && d1.id);
        out.teamMade = !!(t1 && t1.id);
        const teamId = (t1 && t1.id) || null;
        const leadRole = teams.createRole('wall-g-lead', { team: teamId, chain: [], permissions: [] });
        const memberRole = teams.createRole('wall-g-member', { team: teamId, chain: ['wall-g-lead'], permissions: [] });
        out.rolesMade = !!((leadRole && leadRole.id) && (memberRole && memberRole.id));

        // --- the hierarchical TEAM agent cap via flag: 2 seats, the third
        // assign refuses typed
        config.setConfig('teams.maxAgentsPerTeam', 2);
        const aA = teams.assign('wall-g-agent-A', { org: orgId, dept: d1 ? d1.id : null, team: teamId, role: memberRole && leadRole ? leadRole.id : null, brain: 'vant' });
        const aB = teams.assign('wall-g-agent-B', { org: orgId, dept: d1 ? d1.id : null, team: teamId, role: memberRole ? memberRole.id : null, brain: 'vant' });
        const aC = teams.assign('wall-g-agent-C', { org: orgId, dept: d1 ? d1.id : null, team: teamId, role: memberRole ? memberRole.id : null, brain: 'vant' });
        out.teamCap = {
            aAssigned: !!(aA && !aA.error),
            bAssigned: !!(aB && !aB.error),
            cCode: (aC && aC.code) || null,
            cNamesTeam: !!(aC && aC.error && String(aC.error).indexOf('Team agent quota') > -1),
        };

        // restore the team cap; grade the SPAN-OF-CONTROL cap (1 report)
        config.setConfig('teams.maxAgentsPerTeam', 50);
        config.setConfig('teams.maxReportsPerAgent', 1);
        const aCagain = teams.assign('wall-g-agent-C', { org: orgId, dept: d1 ? d1.id : null, team: teamId, role: memberRole ? memberRole.id : null, brain: 'vant' });
        const aD = teams.assign('wall-g-agent-D', { org: orgId, dept: d1 ? d1.id : null, team: teamId, role: memberRole ? memberRole.id : null, brain: 'vant', reportsTo: 'wall-g-agent-A' });
        const aE = teams.assign('wall-g-agent-E', { org: orgId, dept: d1 ? d1.id : null, team: teamId, role: memberRole ? memberRole.id : null, brain: 'vant', reportsTo: 'wall-g-agent-A' });
        out.spanCap = {
            cAfterRaise: !!(aCagain && !aCagain.error),
            dAssigned: !!(aD && !aD.error),
            eCode: (aE && aE.code) || null,
            eNamesSpan: !!(aE && aE.error && String(aE.error).indexOf('Span of control') > -1),
        };

        // restore the span cap; F rides D for the members/hierarchy legs
        config.setConfig('teams.maxReportsPerAgent', 5);
        const aF = teams.assign('wall-g-agent-F', { org: orgId, dept: d1 ? d1.id : null, team: teamId, role: memberRole ? memberRole.id : null, brain: 'vant', reportsTo: 'wall-g-agent-D' });
        out.fAssigned = !!(aF && !aF.error);

        // --- the CROSS-TEAM delegation pair (before the rate hammer):
        // same-team delegation answers same_team first BY CONTRACT, so the
        // role_hierarchy edge needs two DIFFERENT teams - team two carries
        // a role whose chain names team two's lead
        const t2 = teams.createTeam('wall-g-team-two', { dept: d1 ? d1.id : null });
        const lead2Role = teams.createRole('wall-g-lead2', { team: t2 ? t2.id : null, chain: [], permissions: [] });
        const member2Role = teams.createRole('wall-g-member2', { team: t2 ? t2.id : null, chain: ['wall-g-lead2'], permissions: [] });
        // X sits on TEAM ONE (carrying team two's lead role) so the delegation
        // direction crosses a team boundary - same-team calls answer
        // same_team first BY CONTRACT, which is its own graded law
        const aX = teams.assign('wall-g-agent-X', { org: orgId, dept: d1 ? d1.id : null, team: teamId, role: lead2Role ? lead2Role.id : null, brain: 'vant' });
        const aY = teams.assign('wall-g-agent-Y', { org: orgId, dept: d1 ? d1.id : null, team: t2 ? t2.id : null, role: member2Role ? member2Role.id : null, brain: 'vant' });
        out.crossTeam = {
            teamMade: !!(t2 && t2.id),
            xAssigned: !!(aX && !aX.error),
            yAssigned: !!(aY && !aY.error),
        };

        // --- the RULE gate: a deny rule on team:create refuses typed
        // (E_RULE); removing the rule restores the create
        rules.setRule('wall-g-deny-org-create', {
            description: 'wall row deny',
            appliesTo: (op) => op === 'team:create',
            validate: () => false,
            reason: 'wall-row denial',
        });
        const ruleDenied = teams.createOrg('wall-g-org-ruled');
        rules.deleteRule('wall-g-deny-org-create');
        const afterRule = teams.createOrg('wall-g-org-after-rule');
        out.ruleGate = {
            deniedCode: (ruleDenied && ruleDenied.code) || null,
            afterCreated: !!(afterRule && afterRule.id),
        };

        // --- the global create-RATE budget: calls 8..10 ride, the 11th
        // (here tries === 4 of the hammer) refuses E_RATE_LIMIT and the
        // rateLimited event lands with its identifier
        let tries = 0;
        let rateCode = null;
        for (let i = 0; i < 12; i++) {
            const r = teams.createOrg('wall-g-rate-org-' + i);
            tries++;
            if (r && r.code === 'E_RATE_LIMIT') { rateCode = r.code; break; }
        }
        out.rateLaw = { tries, refused: rateCode, eventIdentifier: rateEvent };

        // --- delegation + accountability semantics over the built chain
        out.delegation = {
            crossLeadOverMember: JSON.stringify(teams.getDelegationPath('wall-g-agent-X', 'wall-g-agent-Y')),
            crossMemberToLead: JSON.stringify(teams.getDelegationPath('wall-g-agent-Y', 'wall-g-agent-X')),
            leadOverMember: JSON.stringify(teams.getDelegationPath('wall-g-agent-A', 'wall-g-agent-B')),
            memberToLead: JSON.stringify(teams.getDelegationPath('wall-g-agent-B', 'wall-g-agent-A')),
            sameAgent: JSON.stringify(teams.getDelegationPath('wall-g-agent-A', 'wall-g-agent-A')),
            unknownPair: JSON.stringify(teams.getDelegationPath('wall-g-agent-A', 'wall-g-agent-ghost')),
            acctLead: JSON.stringify(teams.getAccountabilityChain('wall-g-agent-A')),
            acctMember: JSON.stringify(teams.getAccountabilityChain('wall-g-agent-B')),
        };

        // --- members + stack getters + the horcrux gather shape
        const membersTeam = (teams.getTeamMembers(teamId) || []).map((m) => m.agentId).sort();
        const stackOrg = teams.getStackOrg(orgId);
        const stackH = teams.getStackHierarchy();
        const gather = teams.gatherState();
        out.shapes = {
            teamMembersCount: membersTeam.length,
            teamMembersIncludeB: membersTeam.indexOf('wall-g-agent-B') > -1,
            orgMembersCount: (teams.getOrgMembers(orgId) || []).length,
            stackOrgBrainTagged: !!(stackOrg && typeof stackOrg.brain === 'string'),
            hierarchyBrains: (stackH && Array.isArray(stackH.brains)) ? stackH.brains.length : -1,
            gatherHasOrg: !!(gather && Array.isArray(gather.orgs) && gather.orgs.some((e2) => e2[0] === orgId)),
        };
        out.ok = true;
    } catch (e1) {
        out.ok = false;
        out.bail = String((e1 && e1.name) || '?') + ': ' + String((e1 && e1.message) || '').slice(0, 160);
    }
    process.stdout.write('VANT_CT_JSON<<' + JSON.stringify(out) + '>>END');
})().catch((e2) => { process.stdout.write(JSON.stringify({ error: e2.name + ': ' + e2.message })); });
`;

    harness.registerRoute('teams-governance', async () => {
        let outText;
        try {
            outText = execFileSync('node', ['-e', TEAMS_GOV_CHILD], { cwd: sb, timeout: 60000, encoding: 'utf8', env: { ...process.env, VANT_GATE_QUIET: '1' } });
        } catch (e) {
            return new Response(JSON.stringify({ error: `teams-governance probe child failed: ${String(e.stderr || e.message).slice(0, 200)}` }), { status: 500 });
        }
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

    // (brain battery, evolution slice 2026-10-27) the evolution-context
    // census child: the family the lib inventory census flagged as the
    // brain's largest unmeasured cluster.
    // (brain battery, breaker slice 2026-10-27) the LOAD-CIRCUIT breaker
// census: the P3 #34 family (getLoadCircuitStatus / resetLoadCircuit /
// the _set* DI pair + load()'s short-circuit). A REAL wedge fixture
// (a poisoned CRITICAL pipeline handler — the documented failure path
// #1) feeds consecutive thrown loads; the child grades the breaker's
// laws over the fresh module: status shape, graceful-null misses never
// feed, the OPEN transition (event + metrics + lastError), the typed
// retryable short-circuit BRAIN_CIRCUIT_OPEN, the half-open probe that
// lets ONE real load through the healed machinery and closes on its
// success, and resetLoadCircuit's honest restore.
// (tools-registry census 2026-10-27) the MCP registry census: roster laws
// (listTools deterministic + every entry shaped) and the vant_call by-name
// door (unknown tool refuses WITH the roster named, a non-registry module
// identifier refuses, the schema gate rides the handoff after the
// live-fire fix, and an honest full-params call runs the REAL tool).
const MCP_CENSUS_CHILD = `${CHILD_STDOUT_GUARD}
(async () => {
    delete require.cache[require.resolve('./lib/mcp.js')];
    try { require('./lib/sandbox').defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canTrade: true }); } catch (e0) {}
    const mcp = require('./lib/mcp.js');
    const fsMod = require('fs');
    const pathMod = require('path');
    const out = { family: 'mcp-tools', ok: true, bail: null };
    try {
        const l1 = mcp.listTools();
        const l2 = mcp.listTools();
        out.rosterSize = l1.length;
        out.rosterDeterministic = JSON.stringify(l1) === JSON.stringify(l2);
        out.rosterShapeBad = l1.filter((t) => !t || typeof t.name !== 'string' || !t.description || !t.inputSchema || typeof t.inputSchema !== 'object').length;
        const unknown = await mcp.execute('vant_call', { name: 'definitely_not_a_tool_xyz', args: {} });
        out.vantCallUnknown = !!(unknown && /Tool not found/i.test(String(unknown.error || '')));
        out.vantCallNamesRoster = !!(unknown && Array.isArray(unknown.available) && unknown.available.length > 0);
        const sneaky = await mcp.execute('vant_call', { name: 'fs.readFileSync', args: {} });
        out.vantCallSneaky = !!(sneaky && /Tool not found/i.test(String(sneaky.error || '')));
        // the schema gate rides the handoff (the live-fire fix): a
        // brain_write WITHOUT content must answer the typed gate and land
        // NOTHING; a full call runs the real tool verbatim.
        let bypass = null;
        try { bypass = await mcp.execute('vant_call', { name: 'brain_write', args: { name: 'census-b' } }); }
        catch (e) { bypass = { threw: e.name + ': ' + String(e.message || '').slice(0, 90) }; }
        out.handoffSchemaGate = !!(bypass && bypass.error === 'MCP_INPUT_INVALID' && Array.isArray(bypass.problems) && bypass.problems.some((pg) => String(pg).includes('content')));
        out.handoffNoCanary = !fsMod.existsSync(pathMod.join('models', 'private', 'vant', 'census-b.md'));
        const okWrite = await mcp.execute('vant_call', { name: 'brain_write', args: { name: 'census-okcensus', content: 'full content' } });
        out.handoffRealTool = !!(okWrite && okWrite.saved === true);
        out.diskFull = fsMod.existsSync(pathMod.join('models', 'private', 'vant', 'census-okcensus.md')) && fsMod.readFileSync(pathMod.join('models', 'private', 'vant', 'census-okcensus.md'), 'utf8') === 'full content';

        // (api-object seam pass 2026-10-27) the brain_load pair: the
        // string form rides the loader verbatim; the array form fans out
        // per-name (misses answer null IN their own slot, never a silent
        // whole-roster bail - the schema's second arm was honest-dead).
        await mcp.execute('brain_write', { name: 'census-bl-a', content: 'alpha content' });
        await mcp.execute('brain_write', { name: 'census-bl-b', content: 'beta content' });
        const sLoad = await mcp.execute('brain_load', { brains: 'census-bl-a' });
        out.brainLoadStringLoad = !!(sLoad && sLoad.name === 'census-bl-a' && sLoad.content === 'alpha content');
        const arrLoad = await mcp.execute('brain_load', { brains: ['census-bl-a', 'census-bl-b', 'census-bl-miss'] });
        out.brainLoadArrayFanout = !!(arrLoad && Array.isArray(arrLoad.brains) && arrLoad.brains.length === 3 && Array.isArray(arrLoad.items) && arrLoad.items.length === 3 && arrLoad.items[0] && arrLoad.items[0].content === 'alpha content' && arrLoad.items[1] && arrLoad.items[1].content === 'beta content' && arrLoad.items[2] === null);
    } catch (e1) {
        out.ok = false;
        out.bail = String((e1 && e1.name) || '?') + ': ' + String((e1 && e1.message) || '').slice(0, 140);
    }
    process.stdout.write('VANT_CT_JSON<<' + JSON.stringify(out) + '>>END');
})().catch((e) => { process.stdout.write(JSON.stringify({ error: e.name + ': ' + e.message })); });
`;
// (api-object census 2026-10-27) the API object's OWN census: the doors
// live behind NO port (execute/read/write + the memory and dropbox
// families are in-process), so the child re-arms the whole ladder over
// fresh modules: the auth LADDER (unconfigured = fail closed, the
// configured ladder answers through the ONE validated executor,
// getAuthStatus behind the same wall, the failure counter now faithful),
// the generic execute door (function ops direct, tool ops through
// lib/mcp with the schema gate), and the memory + dropbox families.
const API_CENSUS_CHILD = `${CHILD_STDOUT_GUARD}
(async () => {
    const fsMod = require('fs');
    const pathMod = require('path');
    const out = { family: 'api-object', ok: true, bail: null };
    try {
        try { require('./lib/sandbox').defaultSandbox.setCapabilities({ canRead: true, canWrite: true }); } catch (e0) {}
        const freshApi = () => {
            delete require.cache[require.resolve('./lib/api.js')];
            return require('./lib/api.js');
        };
        // ---- rung 1: the UNCONFIGURED, auth-REQUIRED door fails CLOSED
        delete process.env.VANT_AUTH_KEY;
        delete process.env.VANT_API_KEY;
        delete process.env.VANT_MCP_API_KEY;
        const a1 = freshApi();
        let bareNo = null;
        try { await a1.read('brain_load', { name: 'identity' }); bareNo = 'OPEN-BAD'; }
        catch (e) { bareNo = e.code === 'AUTH_DENIED'; }
        out.noKeyBareRefused = bareNo === true;
        // the not-required rung keeps its honesty: the dev door OPENS and
        // still answers typed through the ONE validated executor
        const dev = a1.create({ requireAuth: false });
        let fnOp = null;
        try { fnOp = await dev.execute('read', () => 'op-ok', {}); } catch (e) { fnOp = 'THREW ' + e.code; }
        out.devFunctionOpDirect = fnOp === 'op-ok';
        let devGate = null;
        try { devGate = await dev.read('brain_load', {}); } catch (e) { devGate = { threw: String(e.code || e.message).slice(0, 40) }; }
        out.devToolGateTyped = !!(devGate && devGate.error === 'MCP_INPUT_INVALID');
        // ---- rung 2: the CONFIGURED ladder
        process.env.VANT_AUTH_KEY = 'census-api-key-42';
        const a2 = freshApi();
        const KEY = { secret: 'census-api-key-42' };
        let bare2 = null;
        try { await a2.read('brain_load', {}); bare2 = 'OPEN-BAD'; }
        catch (e) { bare2 = e.code === 'AUTH_DENIED'; }
        out.bareRefusedAfterConfig = bare2 === true;
        let wrong2 = null;
        try { await a2.read('brain_load', { secret: 'guessed-key' }); wrong2 = 'OPEN-BAD'; }
        catch (e) { wrong2 = e.code === 'AUTH_DENIED'; }
        out.wrongKeyRefusedTyped = wrong2 === true;
        // the authed rung ANSWERS: write lands through the object-op door
        // and reads back through the same door (one round trip, no drift)
        let w2 = null;
        try { w2 = await a2.write({ name: 'brain_write', params: { name: 'census-api-layer', content: 'layer canary' } }, KEY); } catch (e) { w2 = { threw: String(e.code || e.message).slice(0, 40) }; }
        out.authedWriteLands = !!(w2 && w2.saved === true) && fsMod.existsSync(pathMod.join('models', 'private', 'vant', 'census-api-layer.md')) && fsMod.readFileSync(pathMod.join('models', 'private', 'vant', 'census-api-layer.md'), 'utf8') === 'layer canary';
        // (the live brain_load registration accepts the brains key as
        // string OR array; the string form loads one brain - array answers
        // null, the live-fire finding the README census paragraph files)
        let r2 = null;
        try { r2 = await a2.read({ name: 'brain_load', params: { brains: 'census-api-layer' } }, KEY); } catch (e) { r2 = { threw: String(e.code || e.message).slice(0, 40) }; }
        out.authedObjectRoundTrip = !!(r2 && r2.name === 'census-api-layer' && (r2.content === 'layer canary' || r2.contents === 'layer canary') && !r2.error);
        let sGate = null;
        try { sGate = await a2.read('brain_load', KEY); } catch (e) { sGate = { threw: String(e.code || e.message).slice(0, 40) }; }
        out.arglessStringOpGateTyped = !!(sGate && sGate.error === 'MCP_INPUT_INVALID');
        let unk2 = null;
        try { unk2 = await a2.read('definitely_not_a_tool_xyz', KEY); } catch (e) { unk2 = { threw: String(e.code || e.message).slice(0, 40) }; }
        // (template-literal escape law) the child body is a cooked template
        // string, so backslash regexes do not survive the ride reliably -
        // a normalized plain-string law is deterministic regardless of how
        // the text reaches the executor.
        const unkText = String((unk2 && unk2.error) || '').toLowerCase().replace(/[^a-z]/g, '');
        out.unknownToolRefusedTyped = !!(unk2 && unk2.error && unkText.indexOf('notfound') !== -1);
        out.unknownToolDump = JSON.stringify(unk2).slice(0, 140);
        // getAuthStatus rides the same wall: secretless = typed refusal,
        // authed = the honest shape with the FAITHFUL failure counter
        let st1 = null;
        try { a2.getAuthStatus(); st1 = 'OPEN-BAD'; } catch (e) { st1 = e.code === 'AUTH_DENIED'; }
        out.statusWallSecretless = st1 === true;
        let st2 = null;
        try { st2 = a2.getAuthStatus(KEY); } catch (e) { st2 = { threw: String(e.code || e.message).slice(0, 40) }; }
        out.statusShapeAuthed = !!(st2 && !st2.threw && st2.requireAuth === true && typeof st2.authFailures === 'number' && st2.authFailures >= 1);
        // ---- rung 3: the memory + dropbox families (bare doors)
        try { await a2.memoryState('census-api-mem', 'v2'); out.memStateRecall = (await a2.memoryRecall('census-api-mem')) === 'v2'; } catch (e) { out.memStateRecall = false; }
        try { await a2.memoryLearn('census-api-learn', 'content api'); out.memLearnQuery = (await a2.memoryQuery('census-api-learn')) === 'content api'; } catch (e) { out.memLearnQuery = false; }
        try { out.memQueryMiss = (await a2.memoryQuery('census-api-learn-miss')) === null; } catch (e) { out.memQueryMiss = false; }
        try {
            await a2.brainDropFile('census-api-drop', 'dropped payload');
            const got = await a2.brainGetFile('census-api-drop');
            const listed = await a2.brainListFiles();
            await a2.brainDeleteFile('census-api-drop');
            const gone = await a2.brainGetFile('census-api-drop');
            out.dropSharedRoundTrip = !!(got && got.content === 'dropped payload' && Array.isArray(listed.files) && listed.files.some((f) => (typeof f === 'string' ? f.indexOf('census-api-drop') !== -1 : (f && f.name === 'census-api-drop'))) && gone && gone.error === 'not found');
        } catch (e) { out.dropSharedRoundTrip = false; }
        try {
            await a2.brainMyDropFile('census-api-my', 'my payload');
            const got = await a2.brainMyGetFile('census-api-my');
            out.dropPrivateRoundTrip = !!(got && got.content === 'my payload' && got.type === 'myStuff');
        } catch (e) { out.dropPrivateRoundTrip = false; }
    } catch (e1) {
        out.ok = false;
        out.bail = String((e1 && e1.name) || '?') + ': ' + String((e1 && e1.message) || '').slice(0, 140);
    }
    process.stdout.write('VANT_CT_JSON<<' + JSON.stringify(out) + '>>END');
})().catch((e) => { process.stdout.write(JSON.stringify({ error: e.name + ': ' + e.message })); });
`;
const CIRCUIT_CHILD = `${CHILD_STDOUT_GUARD}
(async () => {
    delete require.cache[require.resolve('./lib/brain.js')];
    try { require('./lib/sandbox').defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canSpawn: true, canNetwork: true }); } catch (e0) {}
    const brain = require('./lib/brain.js');
    let opens = 0, halves = 0;
    try { const ev = require('./lib/event'); ev.on('brain:load:circuit:open', () => opens++); ev.on('brain:load:circuit:halfOpen', () => halves++); } catch (eEv) {}
    const out = { family: 'load-circuit', statusOk: null, nullFeedImmune: null, w1Fed: null,
        opened: null, openEvent: null, metricsErr: null, short: null, windowStillGate: null,
        resetRt: null, halfEvent: null, probeClosed: null, probeContentOk: null,
        probeReopen: null, reopenShorted: null, thrBack: null, ok: true };
    try {
        // 0. the status shape over a fresh module
        const st0 = brain.getLoadCircuitStatus();
        out.statusOk = !!(st0 && st0.state === 'CLOSED' && st0.failures === 0 && st0.openedAt === null && st0.threshold >= 1 && st0.resetMs >= 0);
        // 1. graceful null misses NEVER feed the breaker (the dominant normal case)
        await brain.load('circuit-census-absent-' + Date.now());
        await brain.load('circuit-census-absent-' + Date.now());
        await brain.load('circuit-census-absent-' + Date.now());
        out.nullFeedImmune = brain.getLoadCircuitStatus().failures === 0;
        // 2. the seed (for the half-open probe's SUCCESS leg: null returns
        // never record success, so the probe must answer real content)
        brain.updateMyStuff('circuit-seed', 'seed content');
        // 3. the REAL wedge: a poisoned CRITICAL pipeline handler (vaf) —
        // the documented failure path #1. DI threshold 2 makes the OPEN
        // transition reachable in-test.
        const thrower = () => { throw new Error('census wedge: poisoned critical handler'); };
        brain.register('vaf', thrower);
        brain._setLoadCircuitThreshold(2);
        try { await brain.load('circuit-census-w-1'); } catch (e1) {
            out.w1Fed = brain.getLoadCircuitStatus().failures === 1;
        }
        try { await brain.load('circuit-census-w-2'); } catch (e2) {}
        const st1 = brain.getLoadCircuitStatus();
        out.opened = st1.state === 'OPEN' && st1.failures >= 2 && st1.openedAt !== null && !!st1.lastError;
        out.openEvent = opens >= 1;
        out.metricsErr = (brain.getMetrics ? brain.getMetrics().errors : 0) > 0;
        // 4. the typed retryable short-circuit — ANY load now fast-fails
        // without touching the wedged machinery
        try { const benign = await brain.load('totally-innocent-census'); out.short = { fired: false, got: benign === null ? 'null' : 'result' }; }
        catch (e3) { out.short = { fired: e3.code === 'BRAIN_CIRCUIT_OPEN', retryable: e3.retryable === true, detF: e3.details && e3.details.failures }; }
        // 5. the reset window: a default 30s window means the probe does
        // NOT fire within it (out.windowStillGate grades the same
        // short-circuit code again with the window un-elapsed)
        // 6. restore + reset: the machinery heals, the breaker answers
        brain._clearHandlerOverride('vaf');
        out.resetRt = brain.resetLoadCircuit() === true && brain.getLoadCircuitStatus().state === 'CLOSED' && brain.getLoadCircuitStatus().failures === 0;
        // 7. half-open: wedged again, OPEN, wait past the DI reset window,
        // heal machinery, ONE probe ride → real content → the breaker CLOSES
        brain.register('vaf', thrower);
        try { await brain.load('circuit-census-w-3'); } catch (e4) {}
        try { await brain.load('circuit-census-w-4'); } catch (e5) {}
        const st2 = brain.getLoadCircuitStatus();
        if (st2.state !== 'OPEN') throw new Error('re-wedge did not re-open: ' + st2.state);
        brain._setLoadCircuitResetMs(40);
        await new Promise((r) => setTimeout(r, 90));
        brain._clearHandlerOverride('vaf');
        const probe = await brain.load('circuit-seed');
        const st3 = brain.getLoadCircuitStatus();
        out.probeContentOk = !!(probe && probe.content === 'seed content');
        out.probeClosed = st3.state === 'CLOSED' && st3.failures === 0;
        out.halfEvent = halves >= 1;
        // 7b. (retirement audit 2026-10-27) the half-open FAILURE reopen:
        // wedged again at threshold 1, tiny reset window; the probe EXECUTES
        // the poisoned machinery and its real failure re-OPENS the breaker
        // (failures >= threshold while not OPEN); the probing flag is
        // consumed, so the next call short-circuits again (window frozen
        // at 0 so CI jitter cannot burn the fresh window mid-leg).
        brain.resetLoadCircuit();
        brain._setLoadCircuitThreshold(1);
        brain.register('vaf', thrower);
        try { await brain.load('circuit-census-w-5'); } catch (e6a) {}
        if (brain.getLoadCircuitStatus().state !== 'OPEN') throw new Error('reopen wedgeload did not open');
        brain._setLoadCircuitResetMs(40);
        await new Promise((r) => setTimeout(r, 90));
        let probeErr = null;
        // a UNIQUE name: 'circuit-seed' was cached by leg 7's success probe,
        // so a seeded name would "succeed" from the cache without touching
        // the machinery (and the close-on-success would lie through it). The
        // poisoned pipeline runs BEFORE any load result, so the throw here
        // is real machinery work, never a cache serve.
        try { await brain.load('circuit-census-poison-probe-' + Date.now()); } catch (e6b) { probeErr = e6b; }
        const st4 = brain.getLoadCircuitStatus();
        out.probeReopen = st4.state === 'OPEN' && probeErr !== null && probeErr.code !== 'BRAIN_CIRCUIT_OPEN';
        brain._setLoadCircuitResetMs(0);
        let shortErr = null;
        try { await brain.load('circuit-census-poison-probe-B'); } catch (e6c) { shortErr = e6c; }
        out.reopenShorted = !!(shortErr && shortErr.code === 'BRAIN_CIRCUIT_OPEN');
        brain._clearHandlerOverride('vaf');
        brain.resetLoadCircuit();
        // 8. the DI return law
        brain._setLoadCircuitThreshold(null);
        brain._setLoadCircuitResetMs(null);
        out.thrBack = brain.getLoadCircuitStatus().threshold === 5;
        if (opens < 1 || halves < 1) throw new Error('events never fired: opens=' + opens + ' halves=' + halves);
        brain.resetLoadCircuit();
    } catch (e1) {
        out.ok = false;
        out.err = String((e1 && e1.name) || '?') + ': ' + String(e1 && e1.message || '').slice(0, 140);
    }
    out.opens = opens; out.halves = halves;
    process.stdout.write('VANT_CT_JSON<<' + JSON.stringify(out) + '>>END');
})().catch((e) => { process.stdout.write(JSON.stringify({ error: e.name + ': ' + e.message })); });
`;

// (brain battery, remote/watch/cache slice 2026-10-27) the REMOTE +
// WATCH + CACHE census: the 9-key cluster (setRemoteURL/getRemoteURL,
// setCache/getCacheStats, invalidateCache/invalidateCorpusCache,
// setWatch/isWatching, and _fetchRemote graded through a REAL remote-
// mode load). Remote rides a localhost http server (no network); the
// cache laws grade prime/serve/hit/age/invalidate against disk truth;
// the watcher toggles grade the public surface only.
const REMOTE_CHILD = `${CHILD_STDOUT_GUARD}
(async () => {
    delete require.cache[require.resolve('./lib/brain.js')];
    try { require('./lib/sandbox').defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canSpawn: true, canNetwork: true }); } catch (e0) {}
    const brain = require('./lib/brain.js');
    const fsMod = require('fs');
    const http = require('http');
    const out = { family: 'remote-watch-cache', urlRt: null, urlRestore: null, remoteModeLoad: null,
        remoteSource: null, remoteRestore: null, cacheStatsShape: null, cacheHitLaw: null,
        cacheStale: null, cacheInvalidated: null, cacheDisabled: null, corpusInvalidate: null,
        watchOn: null, watchOff: null, ok: true };
    try {
        // 1. the remote URL pair
        brain.setRemoteURL('http://127.0.0.1:PORT-BRAIN-CENSUS/');
        out.urlRt = brain.getRemoteURL() === 'http://127.0.0.1:PORT-BRAIN-CENSUS/';
        // 2. the REAL remote load: localhost server answers brain/<name>.json
        const srv = http.createServer((req, res) => {
            if (req.url && req.url.indexOf('brain/remote-seed.json') !== -1) {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify({ name: 'remote-seed', content: 'REMOTE-CENSUS-PAYLOAD' }));
            } else { res.writeHead(404); res.end(); }
        });
        let port = null;
        await new Promise((res0) => { srv.listen(0, '127.0.0.1', () => { port = srv.address().port; res0(); }); });
        brain.setRemoteURL('http://127.0.0.1:' + port + '/');
        const modeBefore = brain.setMode ? null : null;
        let remoteRes = null, remoteErr = null;
        try { await brain.setMode('remote'); } catch (eM) { remoteErr = eM; }
        try { remoteRes = await brain.load('remote-seed'); } catch (eL) { remoteErr = eL; }
        srv.close();
        out.remoteModeLoad = !!(remoteRes && remoteRes.content === 'REMOTE-CENSUS-PAYLOAD');
        out.remoteSource = remoteRes && remoteRes.source === 'remote';
        // restore the honest defaults
        try { await brain.setMode('dual'); } catch (eM) {}
        brain.setRemoteURL('');
        out.urlRestore = brain.getRemoteURL() !== undefined;
        // 3. the cache laws over a REAL seed
        brain.updateMyStuff('cache-census', 'V1');
        const a = await brain.load('cache-census');
        const b = await brain.load('cache-census');
        out.cacheHitLaw = !!(a && a.content === 'V1' && b && b.content === 'V1' && brain.getMetrics().cacheHits > 0);
        // disk truth changed under the cache: the read still serves the
        // cached V1 inside the TTL window (the cached read is the law)
        fsMod.writeFileSync(brain.getBrainPath() + '/cache-census.md', 'V2');
        const c = await brain.load('cache-census');
        out.cacheStale = !!(c && c.content === 'V1');
        out.cacheInvalidated = null;
        brain.invalidateCache('cache-census');
        const d = await brain.load('cache-census');
        out.cacheInvalidated = !!(d && d.content === 'V2');
        const stc = brain.getCacheStats();
        out.cacheStatsShape = !!(stc && typeof stc.size === 'number' && typeof stc.enabled === 'boolean' && typeof stc.ttl === 'number' && Array.isArray(stc.entries));
        brain.setCache(false);
        out.cacheDisabled = brain.getCacheStats().enabled === false;
        brain.setCache(true);
        // 4. the corpus invalidate call answers without faulting
        try { brain.invalidateCorpusCache(); out.corpusInvalidate = true; } catch (eI) { out.corpusInvalidate = false; }
        // 5. the watcher public toggles
        brain.setWatch(true);
        out.watchOn = brain.isWatching() === true;
        brain.setWatch(false);
        out.watchOff = brain.isWatching() === false;
        await new Promise((r) => setTimeout(r, 120));
        // drain the loop honestly: the watcher handle opened by setWatch
        // is closed by the REAL shutdown path (its fs.watch keeps the
        // child alive otherwise)
        await brain.shutdown();
        // the load-time metrics ticker: loads happened
        if (brain.getMetrics().loads < 4) throw new Error('loads never ticked: ' + brain.getMetrics().loads);
    } catch (e1) {
        out.ok = false;
        out.err = String((e1 && e1.name) || '?') + ': ' + String(e1 && e1.message || '').slice(0, 140);
    }
    process.stdout.write('VANT_CT_JSON<<' + JSON.stringify(out) + '>>END');
})().catch((e) => { process.stdout.write(JSON.stringify({ error: e.name + ': ' + e.message })); });
`;

// (brain battery, lifecycle slice 2026-10-27) the BOOTSTRAP/SHUTDOWN +
// FRAMEWORK-CONFIG census: the 7-key cluster (onBootstrap/bootstrap,
// onShutdown/shutdown, and the framework-config trio). The child grades
// the REAL lifecycle: a hook registered through onBootstrap RUNS during
// bootstrap, the metabolism tick is registered with boot's timer
// lifecycle (and stopped again), a shutdown hook runs during shutdown,
// and the framework config trio answers default/set/current/stack laws.
const LIFECYCLE_CHILD = `${CHILD_STDOUT_GUARD}
(async () => {
    delete require.cache[require.resolve('./lib/brain.js')];
    try { require('./lib/sandbox').defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canSpawn: true, canNetwork: true }); } catch (e0) {}
    const brain = require('./lib/brain.js');
    const out = { family: 'lifecycle-framework', bootHookRan: null, metabolizeTimerOn: null,
        metabolizeTimerOff: null, shutdownHookRan: null, fwDefault: null, fwSet: null,
        fwStackDefault: null, ok: true };
    try {
        // 1. the bootstrap law: a NEW hook registered through onBootstrap
        // runs once during bootstrap (the module-load hooks ride along)
        let ran = false;
        brain.onBootstrap(() => { ran = true; });
        await brain.bootstrap();
        out.bootHookRan = ran === true;
        // the metabolism tick law: boot's timer lifecycle holds it
        const bootMod = require('./lib/boot.js');
        out.metabolizeTimerOn = bootMod.unregisterTimer('brain.metabolize') === true;
        out.metabolizeTimerOff = bootMod.unregisterTimer('brain.metabolize') === false;
        // 2. the framework-config trio over a fresh module
        const fresh = brain.getBrainFrameworkConfig();
        out.fwDefault = !!(fresh && fresh.mode === 'dual');
        out.fwSet = brain.setBrainFrameworkConfig({ mode: 'private', census: 1 }) === true &&
            brain.getBrainFrameworkConfig().mode === 'private' &&
            brain.getBrainFrameworkConfig().census === 1;
        // the stack law: the stack roster maps brain-by-brain, a brain
        // without its own config answering the honest {mode:'dual'} default
        const stackCfg = brain.getStackFrameworkConfigs();
        const stackBrain = brain.currentBrain();
        const mine = stackCfg && stackCfg.byBrain && stackCfg.byBrain[stackBrain];
        out.fwStackDefault = !!(stackCfg && stackCfg.source === 'stack' &&
            Array.isArray(stackCfg.brains) && stackCfg.brains.length >= 1 &&
            stackCfg.brains.indexOf(stackBrain) !== -1 &&
            mine && (mine.mode === 'dual' || mine.mode === 'private'));
        // 3. the shutdown law: a NEW hook registered through onShutdown
        // runs during the REAL shutdown (watcher close + hook loop)
        let shutRan = false;
        brain.onShutdown(() => { shutRan = true; });
        await brain.shutdown();
        out.shutdownHookRan = shutRan === true;
    } catch (e1) {
        out.ok = false;
        out.err = String((e1 && e1.name) || '?') + ': ' + String(e1 && e1.message || '').slice(0, 140);
    }
    process.stdout.write('VANT_CT_JSON<<' + JSON.stringify(out) + '>>END');
})().catch((e) => { process.stdout.write(JSON.stringify({ error: e.name + ': ' + e.message })); });
`;

// (brain battery, geometry slice 2026-10-27) the geometry census
    // child: the NSC9 per-brain address family over a fresh module.
    harness.registerRoute('brain-geometry', async () => {
        let outText;
        try {
            outText = execFileSync('node', ['-e', GEO_CHILD], { cwd: sb, timeout: 60000, encoding: 'utf8', env: { ...process.env, VANT_GATE_QUIET: '1' } });
        } catch (e) {
            return new Response(JSON.stringify({ error: `geometry probe child failed: ${String(e.stderr || e.message).slice(0, 200)}` }), { status: 500 });
        }
        return new Response(extractCtJson(outText), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    });

    // (brain battery, backup slice 2026-10-27) the stego-backup trio
    // census child: the honest-refusal laws over a fresh module.
    // (brain battery, lifecycle slice 2026-10-27) the bootstrap/shutdown
    // + framework-config census child: the REAL lifecycle laws.
    harness.registerRoute('brain-lifecycle', async () => {
        let outText;
        try {
            outText = execFileSync('node', ['-e', LIFECYCLE_CHILD], { cwd: sb, timeout: 60000, encoding: 'utf8', env: { ...process.env, VANT_GATE_QUIET: '1' } });
        } catch (e) {
            return new Response(JSON.stringify({ error: `lifecycle probe child failed: ${String(e.stderr || e.message).slice(0, 200)}` }), { status: 500 });
        }
        return new Response(extractCtJson(outText), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    });

    // (brain battery, remote/watch/cache slice 2026-10-27) the 9-key
    // cluster census child: remote-mode load over a localhost server +
    // the cache/invalidate/watch laws.
    harness.registerRoute('brain-remote-cache', async () => {
        let outText;
        try {
            outText = execFileSync('node', ['-e', REMOTE_CHILD], { cwd: sb, timeout: 60000, encoding: 'utf8', env: { ...process.env, VANT_GATE_QUIET: '1' } });
        } catch (e) {
            return new Response(JSON.stringify({ error: `remote-cache probe child failed: ${String(e.stderr || e.message).slice(0, 200)}` }), { status: 500 });
        }
        return new Response(extractCtJson(outText), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    });

    // (brain battery, breaker slice 2026-10-27) the load-circuit
    // breaker census child: P3 #34's laws over a real poisoned-critical
    // wedge fixture.
    harness.registerRoute('brain-circuit', async () => {
        let outText;
        try {
            outText = execFileSync('node', ['-e', CIRCUIT_CHILD], { cwd: sb, timeout: 60000, encoding: 'utf8', env: { ...process.env, VANT_GATE_QUIET: '1' } });
        } catch (e) {
            return new Response(JSON.stringify({ error: `circuit probe child failed: ${String(e.stderr || e.message).slice(0, 200)}` }), { status: 500 });
        }
        return new Response(extractCtJson(outText), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    });

    // (brain battery, tmp-space slice 2026-10-27) the crate/dropbox +
    // stash + handlers census child over a fresh module.
    harness.registerRoute('brain-tmpspace', async () => {
        let outText;
        try {
            outText = execFileSync('node', ['-e', TMPSPACE_CHILD], { cwd: sb, timeout: 60000, encoding: 'utf8', env: { ...process.env, VANT_GATE_QUIET: '1' } });
        } catch (e) {
            return new Response(JSON.stringify({ error: `tmpspace probe child failed: ${String(e.stderr || e.message).slice(0, 200)}` }), { status: 500 });
        }
        return new Response(extractCtJson(outText), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    });

    harness.registerRoute('brain-backup-image', async () => {
        let outText;
        try {
            outText = execFileSync('node', ['-e', BACKUP_CHILD], { cwd: sb, timeout: 60000, encoding: 'utf8', env: { ...process.env, VANT_GATE_QUIET: '1' } });
        } catch (e) {
            return new Response(JSON.stringify({ error: `backup probe child failed: ${String(e.stderr || e.message).slice(0, 200)}` }), { status: 500 });
        }
        return new Response(extractCtJson(outText), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    });

    // (market census 2026-10-27) the scope-visibility + cancel-matrix +
    // bid gates census child over a fresh market module.
    harness.registerRoute('wiring-market-census', async () => {
        let outText;
        try {
            outText = execFileSync('node', ['-e', MARKET_CENSUS_CHILD], { cwd: sb, timeout: 60000, encoding: 'utf8', env: { ...process.env, VANT_GATE_QUIET: '1' } });
        } catch (e) {
            return new Response(JSON.stringify({ error: `market-census probe child failed: ${String(e.stderr || e.message).slice(0, 200)}` }), { status: 500 });
        }
        return new Response(extractCtJson(outText), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    });

    // (tools-registry census 2026-10-27) the MCP registry census child.
    harness.registerRoute('mcp-tools-census', async () => {
        let outText;
        try {
            outText = execFileSync('node', ['-e', MCP_CENSUS_CHILD], { cwd: sb, timeout: 60000, encoding: 'utf8', env: { ...process.env, VANT_GATE_QUIET: '1' } });
        } catch (e) {
            return new Response(JSON.stringify({ error: `mcp-tools-census probe child failed: ${String(e.stderr || e.message).slice(0, 200)}` }), { status: 500 });
        }
        return new Response(extractCtJson(outText), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    });


    // (api-object census 2026-10-27) the API object's in-process census:
    // execute/read/write + memory/dropbox answers, fresh-module ladder.
    harness.registerRoute('api-layer', async () => {
        let outText;
        try {
            outText = execFileSync('node', ['-e', API_CENSUS_CHILD], { cwd: sb, timeout: 60000, encoding: 'utf8', env: { ...process.env, VANT_GATE_QUIET: '1' } });
        } catch (e) {
            return new Response(JSON.stringify({ error: `api-layer probe child failed: ${String(e.stderr || e.message).slice(0, 200)}` }), { status: 500 });
        }
        return new Response(extractCtJson(outText), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    });

    harness.registerRoute('brain-evolution', async () => {
        let outText;
        try {
            outText = execFileSync('node', ['-e', EVOLUTION_CHILD], { cwd: sb, timeout: 60000, encoding: 'utf8', env: { ...process.env, VANT_GATE_QUIET: '1' } });
        } catch (e) {
            return new Response(JSON.stringify({ error: `evolution probe child failed: ${String(e.stderr || e.message).slice(0, 200)}` }), { status: 500 });
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

    // (determinism law, 2026-10-28) the FRESHNESS legs of the wire rows
    // need a real current ts: the run root grades its OWN wall clock
    // through this route - the pack sources never read one (the
    // determinism lint keeps the pack sources flat; the run-root file is
    // outside the lint's declared surfaces). The VERDICTS never carry
    // the stamp: receivers grade freshness against their own clock.
    harness.registerRoute('vant-now', async () => {
        return new Response(JSON.stringify({ now: Date.now() }), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    });

    // (kit contracts census 2026-10-27) drive the web/kit contract census
    // (isPrivateIp walls, envelope/shape laws, vocabularies + parity pins)
    // in a fresh child process against the run root's copied web/kit.
    // (kit vendoring-ring census 2026-10-28) the ring leg: the vendor
    // script's --check (exit 0 + one [ok] per pin) AND the independent
    // census child (pin === vendored bytes === kit head, negative control)
    // must AGREE - two lenses on the same ring, one vivo answer.
    harness.registerRoute('kit-vendor-ring', async () => {
        let checkOut, censusOut;
        try {
            checkOut = execFileSync('node', ['scripts/vendor-relay-kit.js', '--check'], { cwd: ROOT, timeout: 60000, encoding: 'utf8' });
        } catch (e) {
            return new Response(JSON.stringify({ error: `vendor-ring --check failed: ${String(e.stdout || e.stderr || e.message).slice(0, 200)}` }), { status: 500 });
        }
        try {
            censusOut = execFileSync('node', ['-e', VENDOR_RING_CHILD], { cwd: ROOT, timeout: 60000, encoding: 'utf8', env: { ...process.env, VANT_GATE_QUIET: '1' } });
        } catch (e) {
            return new Response(JSON.stringify({ error: `vendor-ring census child failed: ${String(e.stderr || e.message).slice(0, 200)}` }), { status: 500 });
        }
        const okLines = String(checkOut).split('\n').filter((l) => l.startsWith('[ok]')).length;
        return new Response(JSON.stringify({ script: { exit: 0, okLines }, census: JSON.parse(extractCtJson(censusOut)) }), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    });

    // (kit plate census 2026-10-28) the carrier-share plate's own first
    // laws, graded from the kit source in a fresh child (typescript
    // transpile + vm decodeSentence evaluation - no React runtime needed).
    harness.registerRoute('kit-plate-census', async () => {
        let outText;
        try {
            outText = execFileSync('node', ['-e', PLATE_CENSUS_CHILD], { cwd: sb, timeout: 60000, encoding: 'utf8', env: { ...process.env, VANT_GATE_QUIET: '1' } });
        } catch (e) {
            return new Response(JSON.stringify({ error: `plate census child failed: ${String(e.stderr || e.message).slice(0, 200)}` }), { status: 500 });
        }
        return new Response(extractCtJson(outText), { status: 200, headers: { 'Cache-Control': 'no-store' } });
    });

    harness.registerRoute('kit-contracts', async () => {
        let outText;
        try {
            outText = execFileSync('node', ['-e', KIT_CONTRACTS_CHILD], { cwd: sb, timeout: 60000, encoding: 'utf8', env: { ...process.env, VANT_GATE_QUIET: '1' } });
        } catch (e) {
            return new Response(JSON.stringify({ error: `kit-contracts probe child failed: ${String(e.stderr || e.message).slice(0, 200)}` }), { status: 500 });
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

    // (2026-10-27 Edge deepening) home-scheduled: the daily sweep's cron
    // door (web/home/functions/api/status/scheduled.js). The envelope lets
    // the row pick the posture: no DB binding = a SILENT no-op (undefined,
    // no throw, no invented alert), the direct wire stays cron-only (the
    // module's own onRequest answers 404 typed "scheduled only" with
    // no-sniff), and over the fake D1 the sweep runs through the SAME
    // engine the GET visitors ride (defaults seeded; per-endpoint probes
    // never ride the verdict - their outcomes are the board's own input).
    harness.registerRoute('home-scheduled', async () => {
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
        return jsonRes(facts, 200);
    });

    // (2026-10-28 first-doors census) home-status-math: the status board's
    // own pure math plate (_lib/status-math.js - endpoint defaults, day
    // bucketing, uptime math, the worst-wins aggregation, the admin spec
    // gates, and the timing-safe key compare). Every law is graded under a
    // FIXED date pin so answers are deterministic (lint stays flat); the
    // wire carries neutral booleans; the arm imports the web source into
    // the probe (no lib->web import - the one-way boundary holds).
    harness.registerRoute('home-status-math', async () => {
        const mod = (await import(pathToFileURL(path.join(ROOT, 'web', 'home', 'functions', '_lib', 'status-math.js')).href));
        const fact = {};
        const TODAY = '2026-01-15';
        const t = (k, fn) => { try { fact[k] = fn() === true; } catch (e) { fact[k] = null; fact.faults = String(fact.faults || '') + k + ':' + (e && e.name || 'Error') + ';'; } };
        // dayBuckets: the honest hollow day - pct null, never a fabricated outage
        t('slotLen', () => { const m = mod.dayBuckets([{ endpoint_id: 'a', day: '2026-01-13', up_count: 2, check_count: 2 }], 5, TODAY); const arr = m.get('a'); return Array.isArray(arr) && arr.length === 5 && arr[4].day === TODAY && arr[2].pct === 100 && arr[4].pct === null && arr[0].pct === null && arr[0].up === 0 && arr[0].total === 0; });
        t('mergedPct', () => { const m = mod.dayBuckets([{ endpoint_id: 'b', day: TODAY, up_count: 3, check_count: 4 }, { endpoint_id: 'b', day: TODAY, up_count: 1, check_count: 1 }], 2, TODAY); const arr = m.get('b'); return arr.length === 2 && arr[1].up === 4 && arr[1].total === 5 && arr[1].pct === 80; });
        t('idlessIgnored', () => mod.dayBuckets([{ day: TODAY, up_count: 5, check_count: 5 }], 1, TODAY).size === 0);
        t('outsideDropped', () => { const m = mod.dayBuckets([{ endpoint_id: 'c', day: '2020-01-01', up_count: 9, check_count: 9 }], 1, TODAY); const arr = m.get('c'); return arr.length === 1 && arr[0].pct === null; });
        t('nanTrailing', () => mod.trailingDays(3, 'not-a-date').length === 0);
        // uptimePct: null with no data, integer round, slice to the last-N window
        t('uptimeNull', () => mod.uptimePct([]) === null && mod.uptimePct([{ up: 0, total: 0 }]) === null);
        t('uptime70', () => mod.uptimePct([{ up: 3, total: 4 }, { up: 4, total: 6 }]) === 70);
        t('windowSlice', () => { const many = [{ up: 0, total: 1 }]; for (let i = 1; i <= 34; i++) many.push({ up: 1, total: 1 }); return mod.uptimePct(many, 30) === 100 && mod.uptimePct(many, 35) === 97 && mod.uptimePct(many, 100) === 97; });
        // overallStatus: worst wins, unknown never drags, nothing known = honest unknown
        t('worstWins', () => mod.overallStatus([{ state: 'up' }, { state: 'degraded' }, { state: 'down' }]) === 'down');
        t('unknownNeverDrags', () => mod.overallStatus([{ state: 'up' }, { state: 'unknown' }]) === 'up');
        t('allUnknown', () => mod.overallStatus([]) === 'unknown' && mod.overallStatus([{ state: 'unknown' }]) === 'unknown');
        // pickAlert: active rows only, worst level, then newest id
        t('alertWorst', () => { const a = mod.pickAlert([{ id: 1, level: 'warn', active: 1 }, { id: 7, level: 'critical', active: 1 }]); return !!a && a.level === 'critical' && a.id === 7; });
        t('alertTieNewest', () => { const a = mod.pickAlert([{ id: 3, level: 'warn', active: 1 }, { id: 9, level: 'warn', active: 1 }]); return !!a && a.id === 9; });
        t('alertInactive', () => { const a = mod.pickAlert([{ id: 7, level: 'critical', active: 0 }, { id: 2, level: 'warn', active: 1 }]); return !!a && a.level === 'warn'; });
        t('alertGarbage', () => mod.pickAlert([null, undefined, {}]) === null);
        // validEndpointSpec: the admin gate refuses typed
        t('specHttpsGate', () => mod.validEndpointSpec({ name: 'x', url: 'http://a.b/c' }).ok === false);
        t('specNameGate', () => mod.validEndpointSpec({ name: 'x'.repeat(81), url: 'https://a.b' }).ok === false);
        t('specKindGate', () => mod.validEndpointSpec({ name: 'x', url: 'https://a.b', kind: 'ping' }).ok === false);
        t('specOptionsGate', () => mod.validEndpointSpec({ name: 'x', url: 'https://a.b', options: [] }).ok === false);
        t('specGood', () => { const r = mod.validEndpointSpec({ name: '  x  ', url: 'https://a.b/c', kind: 'json-ok', options: { q: 1 } }); return r.ok === true && r.name === 'x'; });
        // adminKeyMatch: no early exit - a last-char difference still walks the full compare
        t('keyEqual', () => mod.adminKeyMatch('k'.repeat(24), 'k'.repeat(24)) === true);
        t('keyFullCompare', () => mod.adminKeyMatch('k'.repeat(23) + 'j', 'k'.repeat(23) + 'k') === false);
        t('keyLength', () => mod.adminKeyMatch('abc', 'abcd') === false);
        t('keyEmpty', () => mod.adminKeyMatch('', 'x') === false);
        t('keyNonString', () => mod.adminKeyMatch(null, 'x') === false && mod.adminKeyMatch(42, 'x') === false);
        const keys = Object.keys(fact).filter((k) => k !== 'faults');
        fact.checked = keys.length;
        fact.allHeld = keys.every((k) => fact[k] === true);
        return jsonRes(fact, 200);
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
            // (2026-10-27 Edge deepening) the arm now carries NAMED edge
            // handlers: the original r/2 POST face plus the caps page and
            // the SSE stream-through (both GET-only). Shapes pick their
            // door via shape.edge ('relay' default) so one ride can walk
            // multiple doors.
            // (2026-10-27 dash-relay slice) the DASHBOARD doors ride the
            // same child: their lib graph imports EXTENSIONLESS (.ts
            // sources - fine for Pages' bundler, unresolvable for plain
            // Node ESM), so the dash arm's resolve hook rides here too.
            // It is inert for the solo face (its vendored contracts carry
            // their .cjs extensions).
            const out = execFileSync(process.execPath, ['--experimental-strip-types', '--import', pathToFileURL(DASH_REGISTER_FILE).href, RELAY_EDGE_CHILD_FILE], {
                input: JSON.stringify({
                    shapes,
                    handlerPath: path.join(ROOT, 'web', 'relay', 'functions', 'api', 'r', 'relay.ts'),
                    handlers: {
                        relay: { path: path.join(ROOT, 'web', 'relay', 'functions', 'api', 'r', 'relay.ts') },
                        capabilities: { path: path.join(ROOT, 'web', 'relay', 'functions', 'api', 'r', 'capabilities.ts') },
                        events: { path: path.join(ROOT, 'web', 'relay', 'functions', 'api', 'r', 'events.ts') },
                        // (2026-10-27 dash-relay slice) the DASHBOARD-relay
                        // flavor rides the same child: web/dashboard's own
                        // r/2 face + caps page (bridge-lane semantics differ
                        // from the solo face, so a separate door).
                        dashrelay: { path: path.join(ROOT, 'web', 'dashboard', 'functions', 'api', 'r', 'relay.ts') },
                        dashcaps: { path: path.join(ROOT, 'web', 'dashboard', 'functions', 'api', 'r', 'capabilities.ts') },
                    },
                    fetchStub: (j && j.fetchStub !== undefined) ? j.fetchStub : null,
                }),
                encoding: 'utf8', timeout: 120000,
            });
            const m = out.match(/VANT_CT_JSON<<([\s\S]*?)>>END/);
            if (process.env.CRASHTEST_B0_DEBUG) {
                process.stderr.write('[b0-relay] child out len=' + out.length + ' marker=' + !!m + '\n');
                if (m) { try { process.stderr.write('[b0-relay] rows=' + JSON.stringify(JSON.parse(m[1]).results).slice(0, 600) + '\n'); } catch (e3) { process.stderr.write('[b0-relay] marker parse failed: ' + e3.message + '\n'); } }
            }
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
                    // (2026-10-28 wave-2) the seeds/authority/in-memory ops run
                    // instance-less (fresh trees per op) — same exemption lane
                    // as the bus watchers below.
                    const sendless = ['watch', 'report', 'unwatch', 'seed', 'envseed', 'celladdr', 'authpair', 'inmemdefault'];
                    if (!inst && !sendless.includes(o.op)) { out.push({ op: String(o.op), fault: 'no instance: ' + String(o.id) }); continue; }
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
                    if (o.op === 'seed') {
                        // (2026-10-28 wave-2 conversion) the SEEDS family off
                        // the retiring test/state-wiring.test.js: seedScope
                        // over a throwaway in-memory MeshTree (no dir, no
                        // side effects) — scopePath + 64-hex seed; invalid
                        // regions answer the boundary's real typed refusal.
                        const reqs = Array.isArray(o.regions) ? o.regions.map(String)
                            : [(o.region == null ? 'r1' : String(o.region))];
                        const uniA = o.universe == null ? 'wiring-seed-u' : String(o.universe);
                        const uniB = o.universe2 == null ? uniA : String(o.universe2);
                        const scopes = reqs.map((region) => {
                            try {
                                const s = new MeshTree({ universe: uniA }).seedScope(region);
                                return { region, ok: true, scopePath: String(s.scopePath), seedHex: String(s.seedHex) };
                            } catch (er) {
                                return { region, ok: false, fault: 'refused: ' + String(er && er.message || er).slice(0, 100) };
                            }
                        });
                        let sharded = null;
                        try {
                            const sa = new MeshTree({ universe: uniA }).seedScope('r1').seedHex;
                            const sb2 = new MeshTree({ universe: uniB }).seedScope('r1').seedHex;
                            sharded = String(sa) !== String(sb2);
                        } catch (er2) { sharded = null; }
                        out.push({ op: 'seed', ok: true, scopes, sharded });
                        continue;
                    }
                    if (o.op === 'envseed') {
                        // the env law: VANT_UNIVERSE_SEED moves the derived
                        // seed through the DEFAULT constructor (env override
                        // must change the seed; env always restored)
                        const prev = process.env.VANT_UNIVERSE_SEED;
                        try {
                            const base = new MeshTree().seedScope('r1').seedHex;
                            process.env.VANT_UNIVERSE_SEED = String(o.env || 'wiring-pack-env-shard');
                            const envd = new MeshTree().seedScope('r1').seedHex;
                            out.push({ op: 'envseed', ok: true, envMoved: String(base) !== String(envd) });
                        } finally {
                            if (prev === undefined) delete process.env.VANT_UNIVERSE_SEED;
                            else process.env.VANT_UNIVERSE_SEED = prev;
                        }
                        continue;
                    }
                    if (o.op === 'celladdr') {
                        // the ONE-PRF law: MeshTree.cellAddress === the spine's
                        // PRF for the same region+space (no adapters), stable
                        // across repeat calls, moving across spaces.
                        const AddressingSpine = require(path.join(sb, 'lib', 'state', 'spine')).AddressingSpine;
                        const uniC = o.universe == null ? 'parity-universe' : String(o.universe);
                        const region = String(o.region == null ? 'r1' : o.region);
                        const space = Number(o.space == null ? 7 : o.space);
                        const other = Number(o.other == null ? 8 : o.other);
                        const mt3 = new MeshTree({ universe: uniC });
                        const sp2 = new AddressingSpine({ universe: uniC });
                        const viaMesh = mt3.cellAddress(region, space);
                        const viaSpine = sp2.cellAddress('/mesh/' + region, space);
                        out.push({
                            op: 'celladdr', ok: true, viaMesh: String(viaMesh), viaSpine: String(viaSpine),
                            equal: String(viaMesh) === String(viaSpine),
                            stable: String(viaMesh) === String(mt3.cellAddress(region, space)),
                            moved: String(mt3.cellAddress(region, space)) !== String(mt3.cellAddress(region, other)),
                        });
                        continue;
                    }
                    if (o.op === 'authpair') {
                        // the CANONICAL AUTHORITY family: the same payload in
                        // DIFFERENT key order under one fixed clock → one root
                        // hash; the deterministic-winner law stays a same-tree
                        // regression (loser recorded, winner kept, <=1 loser).
                        const uniD = o.universe == null ? 'auth-universe' : String(o.universe);
                        const t1 = new MeshTree({ universe: uniD, now: () => 1000 });
                        const t2 = new MeshTree({ universe: uniD, now: () => 1000 });
                        t1.write('r', 'n', '/mesh/r/n/state', o.valueB || { beta: 2, alpha: 1 });
                        t2.write('r', 'n', '/mesh/r/n/state', o.valueA || { alpha: 1, beta: 2 });
                        const w3 = new MeshTree({ universe: uniD, now: () => 1000 });
                        w3.write('r', 'a', '/mesh/r/n/x', { v: 1 });
                        const wres = w3.write('r', 'b', '/mesh/r/n/x', { v: 2 });
                        const rej = w3.rejectedWrites();
                        out.push({
                            op: 'authpair', ok: true,
                            rootA: String(t1.tree.rootHash()), rootB: String(t2.tree.rootHash()),
                            keyOrderEqual: String(t1.tree.rootHash()) === String(t2.tree.rootHash()),
                            either: !!(wres.accepted) || rej.length === 1,
                            loserSmall: rej.length <= 1,
                        });
                        continue;
                    }
                    if (o.op === 'inmemdefault') {
                        // the battery-off law: no dir → persistenceInfo says
                        // so honestly (enabled false, dir null, no recovery
                        // state) and the behavior contract still answers.
                        const mt4 = new MeshTree({ universe: String(o.universe || 'mem-default-u') });
                        const info = mt4.persistenceInfo();
                        mt4.register('r', 'n', { a: 1 });
                        const alive = mt4.isAlive('r', 'n', mt4._now() + 1);
                        out.push({
                            op: 'inmemdefault', ok: true,
                            disabled: (info && info.enabled) === false,
                            dirNull: !!(info && info.dir === null),
                            recoveryNull: !!(info && info.recovery === null),
                            stillAlive: !!(alive && alive.alive),
                        });
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
    // wiring-store: POST { ops: [{ op, ... }] } — the BARE-STORE arm
    // (2026-10-28 wave-2 conversion, #249): the tree-tier + StateAnchor
    // ledger laws off test/state-wiring.test.js's state-store families,
    // driven on the REAL lib/state-store seams in-process (deterministic
    // roots, treeFor typed presence, the hydrate law, and the append-only
    // anchor chain ride the actual store instance — no fixtures, no
    // answer sheets). Ride-local state files under state/pin-ct-*; cleared
    // at ride end; the anchor LEDGER itself is append-only by design, so
    // rows count DELTAS, never absolutes.
    harness.registerRoute('wiring-store', async (ctx) => {
        const stateStore = sandboxLib('state-store');
        const bus = sandboxLib('event');
        const { StateAnchor } = require(path.join(sb, 'lib', 'state', 'anchor.js'));
        let j = null;
        try { j = await ctx.request.json(); } catch { j = null; }
        const ops = (j && Array.isArray(j.ops) && j.ops.length) ? j.ops.slice(0, 40) : null;
        if (!ops) return jsonRes({ error: 'ops array required' }, 400);
        const ledgerPath = path.join('models', 'private', String(stateStore.currentBrain()), '.state-anchor.jsonl');
        // (ride-local reader) a fresh read-only StateAnchor over the SAME
        // ledger path — chain() re-reads the file per call, so counts are
        // honest mid-ride facts, never a stale cache.
        const countFor = (file) => {
            try { return new StateAnchor(ledgerPath).chain().filter((e) => e.carrier === file).length; }
            catch { return -1; }
        };
        const out = [];
        const touched = new Set();
        const saved = [], anchored = [];
        const onSaved = (d) => { saved.push({ stateFile: d && d.stateFile != null ? String(d.stateFile) : null, rootHash: d && d.rootHash != null ? String(d.rootHash) : null }); };
        const onAnchored = (d) => { anchored.push({ stateFile: d && d.stateFile != null ? String(d.stateFile) : null, rootHash: d && d.rootHash != null ? String(d.rootHash) : null }); };
        bus.on('state:saved', onSaved);
        bus.on('state:anchored', onAnchored);
        try {
            for (const op of ops) {
                const o = op || {};
                try {
                    if (o.op === 'roundtrip') {
                        // the TREE TIER laws: toTree/fromTree roundtrip with
                        // metadata excluded, paths under /<module>/, and the
                        // key-order-independence of the root hash
                        const mod = String(o.module || 'pin-ct');
                        const data = o.data == null ? { peers: { a: 1 }, config: { x: 'y' }, kind: 'vant-protocol-state', module: mod, savedAt: 42 } : o.data;
                        const tree = stateStore.toTree(mod, data);
                        const back = stateStore.fromTree(mod, tree);
                        const shuffled = stateStore.toTree(mod, o.shuffled == null ? { config: { x: 'y' }, savedAt: 42, module: mod, peers: { a: 1 }, kind: 'vant-protocol-state' } : o.shuffled);
                        out.push({ op: 'roundtrip', ok: true, paths: tree.paths().map(String), back: back || null, backOnlyStateKeys: back && !('savedAt' in back) && !('kind' in back) && !('module' in back), rootHash: String(tree.rootHash()), rootSame: String(tree.rootHash()) === String(shuffled.rootHash()) });
                        continue;
                    }
                    if (o.op === 'persisttree') {
                        // persist({tree}) mirrors state into the CALLER tree
                        const f = String(o.file);
                        const tree = new stateStore.StateTree();
                        const res = stateStore.persist({ moduleName: String(o.module || 'pin-ct'), stateFile: f, data: o.data == null ? { hits: 3 } : o.data, tree });
                        touched.add(f);
                        out.push({ op: 'persisttree', ok: true, accepted: res === true, rootHash: String(tree.rootHash()), treePaths: tree.paths().map(String) });
                        continue;
                    }
                    if (o.op === 'drypersist') { stateStore.persist({ moduleName: String(o.module || 'pin-ct'), stateFile: String(o.file), data: o.data == null ? { n: 11 } : o.data }); touched.add(String(o.file)); out.push({ op: 'drypersist', ok: true }); continue; }
                    if (o.op === 'diskfor') {
                        const d = stateStore.treeFor(String(o.file));
                        out.push({ op: 'diskfor', ok: true, state: d.state, rootHash: d.rootHash != null ? String(d.rootHash) : null, treePaths: d.tree ? d.tree.paths().map(String) : null });
                        continue;
                    }
                    if (o.op === 'hydratetree') {
                        // hydrate populates the CALLER tree and returns the
                        // root hash (native law: res.applied + res.rootHash)
                        const f = String(o.file);
                        const tree = new stateStore.StateTree();
                        const res = await stateStore.hydrate({ moduleName: String(o.module || 'pin-ct'), stateFile: f, apply: () => {}, tree });
                        const back = stateStore.fromTree(String(o.module || 'pin-ct'), tree);
                        out.push({ op: 'hydratetree', ok: true, applied: !!(res && res.applied), rootHash: res && res.rootHash != null ? String(res.rootHash) : null, treePaths: tree.paths().map(String), back: back || null });
                        continue;
                    }
                    if (o.op === 'anchorlast') {
                        const last = stateStore.lastAnchorFor(String(o.file));
                        out.push({ op: 'anchorlast', ok: true, state: last.state, entry: last.entry ? { rootHash: String(last.entry.root_hash), carrier: String(last.entry.carrier), cause: String(last.entry.cause || '') } : null });
                        continue;
                    }
                    if (o.op === 'anchorcount') { out.push({ op: 'anchorcount', ok: true, file: String(o.file), count: countFor(String(o.file)) }); continue; }
                    if (o.op === 'persistplain') {
                        // no tree → no anchor; and verifyStateRoot answers a
                        // typed not-yet-anchored verdict (native law)
                        const f = String(o.file);
                        const res = stateStore.persist({ moduleName: String(o.module || 'pin-ct'), stateFile: f, data: o.data == null ? { n: 5 } : o.data });
                        touched.add(f);
                        const last = stateStore.lastAnchorFor(f);
                        const v = stateStore.verifyStateRoot(f);
                        out.push({ op: 'persistplain', ok: true, accepted: res === true, anchorState: last.state, noAnchorTyped: v.anchored === false, verifyOk: !!v.ok });
                        continue;
                    }
                    if (o.op === 'persistmerged') {
                        const f = String(o.file);
                        const tree = new stateStore.StateTree();
                        const res = await stateStore.persistMerged({ moduleName: String(o.module || 'pin-ct'), stateFile: f, merge: () => {}, serialize: () => (o.data == null ? { n: 6 } : o.data), tree });
                        touched.add(f);
                        const last = stateStore.lastAnchorFor(f);
                        out.push({ op: 'persistmerged', ok: true, accepted: res === true, anchorState: last.entry ? 'PRESENT' : 'ABSENT', rootHash: last.entry ? String(last.entry.root_hash) : null, cause: last.entry ? String(last.entry.cause || '') : null, treeRoot: String(tree.rootHash()) });
                        continue;
                    }
                    if (o.op === 'hydratekill') {
                        // (the never-bless law) hydrate must NOT append to the
                        // anchor ledger, even with a tree in hand — a restart
                        // must not re-bless whatever happens to be on disk
                        const f = String(o.file);
                        const before = countFor(f);
                        const tree = new stateStore.StateTree();
                        await stateStore.hydrate({ moduleName: String(o.module || 'pin-ct'), stateFile: f, apply: () => {}, tree });
                        const after = countFor(f);
                        out.push({ op: 'hydratekill', ok: true, before, after, neverAnchored: before === after });
                        continue;
                    }
                    if (o.op === 'tamper') {
                        // the OUTSIDE-the-store write (the exact threat the
                        // anchor exists to catch) — raw disk mutation
                        const f = String(o.file);
                        const disk = path.join(process.cwd(), 'models', 'private', String(stateStore.currentBrain()), f);
                        try {
                            const raw = JSON.parse(fs.readFileSync(disk, 'utf8'));
                            // (2026-10-28 wave-2 fix) the state file lays the
                            // payload keys at the TOP LEVEL next to the metadata
                            // (kind/module/savedAt) — the honest out-of-band write
                            // must hit a PAYLOAD key, never the loader's identity
                            // fields: corrupting 'kind' stops treeFor from even
                            // answering PRESENT and the divergence detector (the
                            // seam under test) never runs.
                            const META = ['kind', 'module', 'savedAt', 'name', 'version', 'createdAt'];
                            const keys = Object.keys(raw);
                            const target = keys.find((k) => !META.includes(k)) || keys[0];
                            raw[target] = 'TAMPERED';
                            fs.writeFileSync(disk, JSON.stringify(raw, null, 2));
                            // (2026-10-28 wave-2 fix 2) the pass-184 _treeDiskHot
                            // cache legitimately serves repeat reads inside one
                            // process — but the tamper leg simulates the FRESH
                            // reader a restart produces, so the ride-local cache
                            // must be dropped before the detector's verify round
                            try { stateStore.treeHot.clear(); } catch (eh) { /* best effort */ }
                            out.push({ op: 'tamper', ok: true, wrote: true });
                        } catch (er) { out.push({ op: 'tamper', ok: false, fault: String(er && er.message || er).slice(0, 100) }); }
                        continue;
                    }
                    if (o.op === 'verifyroot') {
                        const v = stateStore.verifyStateRoot(String(o.file));
                        out.push({ op: 'verifyroot', ok: true, verifyOk: !!v.ok, anchored: v.anchored !== false, state: v.state || null, current: v.current != null ? String(v.current) : null, lastAnchored: v.lastAnchored && v.lastAnchored.root_hash != null ? String(v.lastAnchored.root_hash) : null, firstDivergence: v.firstDivergence != null ? String(v.firstDivergence) : null });
                        continue;
                    }
                    out.push({ op: String(o.op), fault: 'unknown op' });
                } catch (e2) {
                    out.push({ op: String((o && o.op) || '?'), ok: false, fault: String(e2 && e2.name || 'Error') + ': ' + String(e2 && e2.message || e2).slice(0, 140) });
                }
            }
        } finally {
            for (const f of touched) { try { stateStore.clear(f); } catch (er3) {} }
            bus.off('state:saved', onSaved);
            bus.off('state:anchored', onAnchored);
        }
        return jsonRes({ results: out, saved: saved.slice(-6), anchored: anchored.slice(-6), anchoredCount: anchored.length, savedCount: saved.length }, 200);
    });

    // migration-fixture: POST { ops: [{ op }] } — the MIGRATION arm
    // (migrations battery slice 1, per-bucket conversion): seeds a
    // throwaway fixture install (throwaway tmpdir: lib copy + package.json
    // + bin/migrate.js + the axolotl-era legacy artifacts) and drives the
    // migrations' own subprocess probes against it (spawnSync node -e,
    // 30s bound, fixture swept on ride end) — detection, dryRun
    // no-mutation, apply through the security chain, dropfile no-clobber,
    // registry shape + idempotence. The wire carries the flags as neutral
    // booleans; the fixture lives and dies in one ride.
    harness.registerRoute('migration-fixture', async (ctx) => {
        const { spawnSync } = require('child_process');
        let j = null;
        try { j = await ctx.request.json(); } catch { j = null; }
        const ops = (j && Array.isArray(j.ops) && j.ops.length) ? j.ops.slice(0, 20) : null;
        if (!ops) return jsonRes({ error: 'ops array required' }, 400);
        const cleanups = [];
        const out = [];
        try {
            for (const op of ops) {
                const o = op || {};
                try {
                    if (o.op === 'nd') { out.push({ op: 'nd', fault: 'unknown op' }); continue; }
                    const dir = '/tmp/vant-ct-mig-' + require('crypto').randomBytes(4).toString('hex');
                    out && 0;
                    // seed the fixture install (makeFixture body, tmpdir-rooted)
                    fs.mkdirSync(path.join(dir, 'lib'), { recursive: true });
                    fs.mkdirSync(path.join(dir, 'bin'), { recursive: true });
                    fs.mkdirSync(path.join(dir, 'models', 'private'), { recursive: true });
                    fs.mkdirSync(path.join(dir, 'models', 'public'), { recursive: true });
                    fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(dir, 'package.json'));
                    fs.cpSync(path.join(ROOT, 'lib'), path.join(dir, 'lib'), { recursive: true });
                    fs.copyFileSync(path.join(ROOT, 'bin', 'migrate.js'), path.join(dir, 'bin', 'migrate.js'));
                    // legacy artifacts (the axolotl-era layout). The two
                    // sabotage-shape probes (failed-verify withhold + CLI
                    // exit truth) need the NATIVE fixture shape — models/
                    // private ABSENT: a private-vant dropfile keeps the
                    // loader non-empty after the public wipe, so the
                    // corrupted verify would read TRUE and the withheld
                    // contract would look satisfied-by-lie.
                    // (2026-10-27 conversions) the both-scope import + naming-law tasks need
                    // the PURE main-style shape (makeLegacyMainFixture): a
                    // private-vant dropfile or the axolotl-era artifacts would
                    // add pending steps (and a stacked state.json would stop
                    // legacy.multibrain-import from firing at all).
                    if (o.legacy !== 'clean' && !(o.task === 'clifail') && !(o.task === 'apply' && o.variant === 'sabotage') && !(o.task === 'bothscope' || o.task === 'naming')) {
                        fs.mkdirSync(path.join(dir, '.agent_tmp'), { recursive: true });
                        fs.writeFileSync(path.join(dir, '.agent_tmp', 'escrow.json'), JSON.stringify({ budgets: { fixture: 5 } }));
                        fs.mkdirSync(path.join(dir, 'storage', 'myStuff'), { recursive: true });
                        fs.writeFileSync(path.join(dir, 'storage', 'myStuff', 'legacy-drop.md'), 'legacy drop content');
                        fs.mkdirSync(path.join(dir, 'models', 'private', 'vant', 'state'), { recursive: true });
                        fs.writeFileSync(path.join(dir, 'models', 'private', 'vant', 'state', 'old-drop.md'), 'old drop content');
                        fs.writeFileSync(path.join(dir, 'models', 'state.json'), JSON.stringify({ stack: ['vant'], mode: 'dual', currentBrain: 'vant' }));
                        if (o.op === 'noClobber') {
                            fs.mkdirSync(path.join(dir, 'models', 'tmp-space', 'myStuff'), { recursive: true });
                            fs.writeFileSync(path.join(dir, 'models', 'tmp-space', 'myStuff', 'old-drop.md'), 'CURRENT WINS');
                        }
                    } else {
                        fs.writeFileSync(path.join(dir, 'models', 'state.json'), JSON.stringify({ stack: ['vant'], mode: 'dual', currentBrain: 'vant' }));
                    }
                    cleanups.push(dir);
                    const probeBody = (body) => `process.chdir(${JSON.stringify(dir)});\n(async () => {\n${body}\n})().catch(e => { console.error('PROBE-ERR:', e.message); process.exit(1); });`;
                    const probe = (body, cwd) => spawnSync(process.execPath, ['-e', probeBody(body)], { encoding: 'utf8', timeout: 30000, cwd: cwd || dir });
                    const MIG = `${JSON.stringify(path.join(dir, 'lib', 'migrations'))}`;
                    if (o.op === 'detect') {
                        const p = probe(`
                            const m = require(${MIG});
                            const status = m.status();
                            const dry = await m.migrate({ dryRun: true });
                            const afterStatus = m.status();
                            console.log('PENDING:' + status.pending.map(p2 => p2.id).join(','));
                            console.log('DRYPLAN:' + dry.applied.map(a => a.id).join(','));
                            console.log('STILL-PENDING:' + (afterStatus.pending.length > 0));
                            console.log('ARTIFACTS-INTACT:' + (require('fs').existsSync('.agent_tmp/escrow.json') &&
                                require('fs').existsSync('storage/myStuff/legacy-drop.md') &&
                                require('fs').existsSync('models/private/vant/state/old-drop.md')));
                        `);
                        const o2 = p.stdout || '';
                        const m2 = (rx) => (o2.match(rx) || [])[1] || '';
                        out.push({
                            op: 'detect', ok: !p.error,
                            pendingOrgchart: /orgchart\.brain-scope/.test(m2(/PENDING:(.*)/)),
                            pendingTmpspace: /tmpspace\.models-anchor/.test(m2(/PENDING:(.*)/)),
                            pendingDropfiles: /dropfiles\.tmp-space/.test(m2(/PENDING:(.*)/)),
                            dryPlanned: o2.includes('DRYPLAN:') && /orgchart\.brain-scope/.test(m2(/DRYPLAN:(.*)/)),
                            stillPending: o2.includes('STILL-PENDING:true'),
                            artifactsIntact: o2.includes('ARTIFACTS-INTACT:true'),
                        });
                        continue;
                    }
                    if (o.op === 'apply') {
                        const p = probe(`
                            const m = require(${MIG});
                            const r = await m.migrate();
                            console.log('APPLIED:' + r.applied.map(a => a.id).join(','));
                            const fsmod = require('fs');
                            const pathmod = require('path');
                            console.log('OLD-GONE:' + !fsmod.existsSync('.agent_tmp/escrow.json'));
                            const brains = fsmod.readdirSync('models/private').filter(f => !f.startsWith('.'));
                            let escrowOk = false, dropOk = false;
                            for (const b of brains) {
                                if (fsmod.existsSync(pathmod.join('models', 'private', b, 'orgchart', 'escrow.json'))) escrowOk = true;
                                const st = pathmod.join('models', 'private', b, 'state');
                                if (!fsmod.existsSync(st) || fsmod.readdirSync(st).length === 0) dropOk = true;
                            }
                            const ms = pathmod.join('models', 'tmp-space', 'myStuff');
                            let myStuffOk = false;
                            if (fsmod.existsSync(ms)) {
                                const files = fsmod.readdirSync(ms);
                                myStuffOk = files.includes('old-drop.md') && files.includes('legacy-drop.md') &&
                                    fsmod.readFileSync(pathmod.join(ms, 'old-drop.md'), 'utf8') === 'old drop content' &&
                                    fsmod.readFileSync(pathmod.join(ms, 'legacy-drop.md'), 'utf8') === 'legacy drop content';
                            }
                            console.log('ESCROW-MOVED:' + escrowOk);
                            console.log('DROP-MOVED:' + dropOk);
                            console.log('MYSTUFF-MOVED:' + myStuffOk);
                            console.log('MARKER:' + !!(m._readMarker() && m._readMarker().version >= 2));
                            const r2 = await m.migrate();
                            console.log('IDEMPOTENT:' + (r2.applied.length === 0));
                        `);
                        const o2 = p.stdout || '';
                        out.push({
                            op: 'apply', ok: !p.error,
                            appliedOrgchart: /APPLIED:[^\n]*orgchart\.brain-scope/.test(o2),
                            oldGone: o2.includes('OLD-GONE:true'),
                            escrowMoved: o2.includes('ESCROW-MOVED:true'),
                            dropMoved: o2.includes('DROP-MOVED:true'),
                            myStuffMoved: o2.includes('MYSTUFF-MOVED:true'),
                            marker: o2.includes('MARKER:true'),
                            idempotent: o2.includes('IDEMPOTENT:true'),
                        });
                        continue;
                    }
                    if (o.op === 'dryrunclean') {
                        // (2026-10-27 conversion of the trim-survivor CLI pin)
                        // the clean-layout CLI law: an UP-TO-DATE install
                        // answers "nothing pending" at exit 0. The clean
                        // fixture branch (o.legacy === 'clean') seeds the
                        // modern single-stack layout; the shipped CLI against
                        // it must report exactly that, exit 0, convert nothing.
                        const p2 = spawnSync(process.execPath, [path.join(dir, 'bin', 'migrate.js'), '--dry-run'], { encoding: 'utf8', timeout: 30000, cwd: dir });
                        out.push({ op: 'dryrunclean', ok: p2.status === 0,
                            exitZero: p2.status === 0,
                            nothingPending: /Nothing to migrate|No changes made/.test((p2.stdout || '') + (p2.stderr || '')) });
                        continue;
                    }
                    if (o.op === 'legacy') {
                        // --- seed the pre-multibrain (main-style) layout ---
                        const legacyMain = () => {
                            fs.mkdirSync(path.join(dir, 'models', 'public'), { recursive: true });
                            fs.writeFileSync(path.join(dir, 'models', 'public', 'identity.md'), '# identity — legacy user');
                            fs.writeFileSync(path.join(dir, 'models', 'public', 'lessons.md'), '# lessons — legacy user');
                            fs.writeFileSync(path.join(dir, 'models', 'public', 'goals.md'), '# goals — legacy user');
                            fs.writeFileSync(path.join(dir, 'models', 'public', '_succession.json'), '{"trust":"high"}');
                            fs.mkdirSync(path.join(dir, 'models', 'public', 'boot'), { recursive: true });
                            fs.writeFileSync(path.join(dir, 'models', 'public', 'boot', 'start.md'), '# start');
                            fs.mkdirSync(path.join(dir, 'models', 'public', 'agents'), { recursive: true });
                            fs.writeFileSync(path.join(dir, 'models', 'public', 'agents', 'claude.json'), '{"name":"claude"}');
                            fs.writeFileSync(path.join(dir, 'models', 'state.json'), JSON.stringify({ neurons: { attention: { identity: 0.2 } } }));
                        };
                        if (o.task !== 'nofalse') legacyMain();
                        if (o.task === 'detect' || o.task === 'dryrun') {
                            const p = probe(`
                                const m = require(${MIG});
                                ${o.task === 'detect' ? "console.log('PENDING:' + m.status().pending.map(x => x.id).join(','));" : `
                                const dry = await m.migrate({ dryRun: true });
                                const step = dry.applied.find(a => a.id === 'legacy.multibrain-import');
                                console.log('PLAN-FILES:' + (step ? step.plan.filter(p2 => p2.to.includes('/vant/')).length : 0));
                                console.log('STILL-FLAT:' + require('fs').existsSync('models/public/identity.md'));`}
                            `);
                            const o2 = p.stdout || '';
                            out.push(o.task === 'detect'
                                ? { op: 'legacy', task: 'detect', ok: !p.error, fires: /PENDING:[^\n]*legacy\.multibrain-import/.test(o2) }
                                : { op: 'legacy', task: 'dryrun', ok: !p.error,
                                    planFiles: parseInt((o2.match(/PLAN-FILES:(\d+)/) || [])[1] || '0', 10),
                                    stillFlat: o2.includes('STILL-FLAT:true') });
                            continue;
                        }
                        // ---- slice 3 tasks (CLI banners, MCP door, adversarial edges) ----
                        if (o.task === 'banner' || o.task === 'banner2' || o.task === 'bannernomove') {
                            fs.copyFileSync(path.join(ROOT, 'bin', 'start.js'), path.join(dir, 'bin', 'start.js'));
                            fs.copyFileSync(path.join(ROOT, 'bin', 'health.js'), path.join(dir, 'bin', 'health.js'));
                            fs.writeFileSync(path.join(dir, 'models', 'public', 'lessons2.md'), 'x');
                            fs.writeFileSync(path.join(dir, 'models', 'public', 'goals2.md'), 'x');
                            if (o.task === 'bannernomove') {
                                // legacy evidence fires, but EVERY flat file already
                                // exists inside models/public/vant/ -> import moves 0 files
                                fs.mkdirSync(path.join(dir, 'models', 'public', 'vant'), { recursive: true });
                                for (const f of ['identity.md', 'lessons.md', 'goals.md']) {
                                    fs.writeFileSync(path.join(dir, 'models', 'public', 'vant', f), 'LIVE');
                                }
                            }
                            const p = probe(
`(async () => {
    const { spawn } = require('child_process');
    const run = () => new Promise((resolve) => {
        const pr = spawn(process.execPath, ['bin/start.js'], { stdio: ['ignore', 'pipe', 'ignore'] });
        let buf = '';
        pr.stdout.on('data', (d) => { buf += d; });
        pr.on('close', () => resolve(buf));
    });
    const out1 = await run();
    console.log('BANNER:' + /BRAIN MIGRATED/.test(out1));
${o.task === 'banner' ? '' : `    const out2 = await run();
    console.log('BANNER2:' + /BRAIN MIGRATED/.test(out2));
    console.log('OK2:' + /Brain layout OK/.test(out2));`}
})()`);
                            const o2 = p.stdout || '';
                            out.push(o.task === 'banner'
                                ? { op: 'legacy', task: 'banner', ok: !p.error, banner: o2.includes('BANNER:true') }
                                : { op: 'legacy', task: o.task, ok: !p.error,
                                    banner2: o2.includes('BANNER2:'), // task banner2/bannernomove
                                    quietSecond: o2.includes('BANNER2:false'),
                                    layoutOk: o2.includes('OK2:true') });
                            continue;
                        }
                        if (o.task === 'mcplegacy' || o.task === 'mcuptodate') {
                            const pre = o.task === 'mcuptodate' ? `await m.migrate();\n` : '';
                            const p = probe(`
                                const m = require(${MIG});
                                const mcp = require(${JSON.stringify(path.join(dir, 'lib', 'mcp.js'))});
                                ${pre}const r = await mcp.execute('brain_migration_status', {});
                                console.log('LEGACY:' + r.legacy);
                                ${o.task === 'mcplegacy' ? `console.log('HAS-MIGRATE:' + /vant migrate/.test(r.guidance || ''));
                                console.log('HAS-NAME:' + /--brain-name/.test(r.guidance || ''));` : "console.log('UPTODATE:' + r.upToDate);"}
                            `);
                            const o2 = p.stdout || '';
                            out.push({ op: 'legacy', task: o.task, ok: !p.error,
                                legacy: o2.includes('LEGACY:true'), notLegacy: o2.includes('LEGACY:false'),
                                guidanceMigrate: o2.includes('HAS-MIGRATE:true'), guidanceName: o2.includes('HAS-NAME:true'),
                                uptodate: o2.includes('UPTODATE:true') });
                            continue;
                        }
                        if (o.task === 'readfallback') {
                            const p = probe(`
                                const m = require(${MIG});
                                await m.migrate();
                                const brain = require(${JSON.stringify(path.join(dir, 'lib', 'brain.js'))});
                                brain.setMode('dual');
                                const id = await brain.read('identity');
                                console.log('FALLBACK:' + (id && /legacy user/.test(id.content || '')));
                                const pub = await brain.read('identity', { type: 'public' });
                                console.log('EXPLICIT-PUBLIC:' + (pub && /legacy user/.test(pub.content || '')));
                            `);
                            const o2 = p.stdout || '';
                            out.push({ op: 'legacy', task: 'readfallback', ok: !p.error,
                                fallback: o2.includes('FALLBACK:true'), explicitPublic: o2.includes('EXPLICIT-PUBLIC:true') });
                            continue;
                        }
                        if (o.task === 'bothscope') {
                            // (2026-10-27 conversion of the trim-survivor pin)
                            // one user, TWO scopes: private brain flat + a
                            // private state/ subdir; public brain flat. Both
                            // must land under the SAME chosen name, the
                            // state store NOT hijacked by the dropfiles step
                            // (which is why the import runs LAST), and a
                            // FRESH process reads BOTH scopes after import.
                            fs.mkdirSync(path.join(dir, 'models', 'private'), { recursive: true });
                            fs.writeFileSync(path.join(dir, 'models', 'private', 'journal.md'), '# private journal');
                            fs.mkdirSync(path.join(dir, 'models', 'private', 'state'), { recursive: true });
                            fs.writeFileSync(path.join(dir, 'models', 'private', 'state', 'session.json'), '{"k":1}');
                            fs.writeFileSync(path.join(dir, 'models', 'public', 'lessons2.md'), 'x');
                            fs.writeFileSync(path.join(dir, 'models', 'public', 'goals2.md'), 'x');
                            const p = probe(`
                                const m = require(${MIG});
                                await m.migrate({ brainName: 'mybrain' });
                                const f = require('fs');
                                console.log('PRIV-JOURNAL:' + f.readFileSync('models/private/mybrain/journal.md', 'utf8').includes('private journal'));
                                console.log('PRIV-STATE:' + f.readFileSync('models/private/mybrain/state/session.json', 'utf8'));
                                console.log('PUB-ID:' + f.readFileSync('models/public/mybrain/identity.md', 'utf8').includes('legacy user'));
                                const st = JSON.parse(f.readFileSync('models/state.json', 'utf8'));
                                console.log('STACK:' + JSON.stringify(st.stack));
                            `);
                            let fresh = '';
                            if ((p.stdout || '').includes('PRIV-JOURNAL:true')) {
                                const p2 = probe(`
                                    const brain = require(${JSON.stringify(path.join(dir, 'lib', 'brain.js'))});
                                    brain.setMode('dual');
                                    const j = await brain.read('journal');
                                    console.log('READ-PRIV:' + (j && /private journal/.test(j.content || '')));
                                    const id = await brain.read('identity');
                                    console.log('READ-PUB:' + (id && /legacy user/.test(id.content || '')));
                                `);
                                fresh = p2.stdout || '';
                            }
                            const o2 = (p.stdout || '') + fresh;
                            out.push({ op: 'legacy', task: 'bothscope', ok: !p.error && !/PROBE-ERR/.test(o2),
                                privJournal: o2.includes('PRIV-JOURNAL:true'),
                                privState: o2.includes('PRIV-STATE:{"k":1}'),
                                pubId: o2.includes('PUB-ID:true'),
                                stackRight: o2.includes('STACK:["mybrain"]'),
                                freshPriv: o2.includes('READ-PRIV:true'),
                                freshPub: o2.includes('READ-PUB:true') });
                            continue;
                        }
                        if (o.task === 'naming') {
                            // (2026-10-27 conversion) the --brain-name law: the
                            // IMPORTER honors the naming parameter - the imported
                            // content nests under the CHOSEN name and the
                            // synthesized stack points at it (never a default dir).
                            fs.writeFileSync(path.join(dir, 'models', 'public', 'lessons2.md'), 'x');
                            fs.writeFileSync(path.join(dir, 'models', 'public', 'goals2.md'), 'x');
                            const p = probe(`
                                const m = require(${MIG});
                                await m.migrate({ brainName: 'nova' });
                                const fsmod = require('fs');
                                console.log('NOVA-NESTED:' + fsmod.existsSync('models/public/nova/identity.md'));
                                console.log('NOVA-STACK:' + JSON.stringify(JSON.parse(fsmod.readFileSync('models/state.json', 'utf8')).stack));
                            `);
                            const o2 = p.stdout || '';
                            out.push({ op: 'legacy', task: 'naming', ok: !p.error && !/PROBE-ERR/.test(o2),
                                novaNested: o2.includes('NOVA-NESTED:true'),
                                stackRight: o2.includes('NOVA-STACK:["nova"]') });
                            continue;
                        }
                        if (o.task === 'apply' && o.variant && o.variant !== 'plain') {
                            if (o.variant === 'selfnest') {
                                fs.mkdirSync(path.join(dir, 'models', 'public', 'vant'), { recursive: true });
                                fs.writeFileSync(path.join(dir, 'models', 'public', 'vant', 'runtime-note.md'), 'boot artifact');
                                fs.writeFileSync(path.join(dir, 'models', 'public', 'lessons2.md'), 'x');
                                fs.writeFileSync(path.join(dir, 'models', 'public', 'goals2.md'), 'x');
                            } else if (o.variant === 'stackrewrite') {
                                fs.writeFileSync(path.join(dir, 'models', 'state.json'), JSON.stringify({ stack: ['vant'], currentBrain: 'vant', mode: 'dual', neurons: { attention: { identity: 0.2 } } }));
                            } else if (o.variant === 'mbwin') {
                                fs.mkdirSync(path.join(dir, 'models', 'public', 'vant'), { recursive: true });
                                fs.writeFileSync(path.join(dir, 'models', 'public', 'vant', 'identity.md'), '# LIVE MULTIBRAIN IDENTITY');
                                fs.writeFileSync(path.join(dir, 'models', 'public', 'lessons2.md'), 'x');
                                fs.writeFileSync(path.join(dir, 'models', 'public', 'goals2.md'), 'x');
                            } else if (o.variant === 'symlink') {
                                fs.writeFileSync(path.join(dir, 'models', 'public', 'lessons2.md'), 'x');
                                fs.writeFileSync(path.join(dir, 'models', 'public', 'goals2.md'), 'x');
                                const outside = path.join(dir, 'outside-canary');
                                fs.mkdirSync(outside, { recursive: true });
                                fs.writeFileSync(path.join(outside, 'canary.md'), 'DO NOT TOUCH');
                                fs.symlinkSync(outside, path.join(dir, 'models', 'public', 'linked-dir'), 'dir');
                                fs.symlinkSync(path.join(outside, 'canary.md'), path.join(dir, 'models', 'public', 'linked-file.md'), 'file');
                            }
                        }

                        if (o.task === 'apply' && o.probe === 'variant') {
                            let body2 = '';
                            if (o.variant === 'selfnest') {
                                body2 = `
                                const m = require(${MIG});
                                const r = await m.migrate();
                                const f = require('fs');
                                console.log('NO-SELF-NEST:' + !f.existsSync('models/public/vant/vant'));
                                console.log('ARTIFACT-OK:' + f.readFileSync('models/public/vant/runtime-note.md', 'utf8'));
                                console.log('IMPORT-OK:' + f.readFileSync('models/public/vant/identity.md', 'utf8').includes('legacy user'));
                                const step = r.applied.find(a => a.id === 'legacy.multibrain-import');
                                console.log('VERIFIED:' + (step && step.result && step.result.verified === true));`;
                            } else if (o.variant === 'stackrewrite') {
                                body2 = `
                                const m = require(${MIG});
                                const r = await m.migrate({ brainName: 'mybrain' });
                                const st = JSON.parse(require('fs').readFileSync('models/state.json', 'utf8'));
                                console.log('STACK:' + JSON.stringify(st.stack));
                                console.log('NEURONS:' + !!(st.neurons && st.neurons.attention));
                                const step = r.applied.find(a => a.id === 'legacy.multibrain-import');
                                console.log('REPORTED:' + JSON.stringify(step.result.stack));`;
                            } else if (o.variant === 'mbwin') {
                                body2 = `
                                const m = require(${MIG});
                                const r = await m.migrate();
                                const f = require('fs');
                                console.log('NO-CLOBBER:' + f.readFileSync('models/public/vant/identity.md', 'utf8').includes('LIVE MULTIBRAIN'));
                                const step = r.applied.find(a => a.id === 'legacy.multibrain-import');
                                console.log('SKIPPED-N:' + (step && step.result ? String(step.result.skippedExisting).length >= 0 : 'no-step'));
                                console.log('SKIPPED-VAL:' + (step && step.result ? step.result.skippedExisting : 'no-step'));`;
                            } else if (o.variant === 'symlink') {
                                body2 = `
                                const m = require(${MIG});
                                const r = await m.migrate();
                                const f = require('fs');
                                console.log('CANARY-INTACT:' + f.readFileSync('outside-canary/canary.md', 'utf8'));
                                console.log('IMPORT-OK:' + f.readFileSync('models/public/vant/identity.md', 'utf8').includes('legacy user'));
                                const step = r.applied.find(a => a.id === 'legacy.multibrain-import');
                                console.log('VERIFIED:' + (step && step.result && step.result.verified === true));`;
                            } else if (o.variant === 'sabotage') {
                                body2 = `
                                const m = require(${MIG});
                                const Module = require('module');
                                const origLoad = Module._load;
                                let sabotaged = false;
                                Module._load = function (request, parent, isMain) {
                                    const mod = origLoad.apply(this, arguments);
                                    if (!sabotaged && request.endsWith('brain') && mod && mod.loadCorpus) {
                                        sabotaged = true;
                                        const orig = mod.loadCorpus.bind(mod);
                                        mod.loadCorpus = function (opts) {
                                            require('fs').rmSync('models/public/vant', { recursive: true, force: true });
                                            return orig(opts);
                                        };
                                    }
                                    return mod;
                                };
                                const r = await m.migrate();
                                console.log('OK:' + r.ok);
                                console.log('FAILED-VERIFY:' + (r.failedVerify === true));
                                console.log('MARKER:' + JSON.stringify(m._readMarker()));`;
                            }
                            const p = probe(body2);
                            const o2 = p.stdout || '';
                            const flags = {
                                selfnest: ['NO-SELF-NEST:true', 'ARTIFACT-OK:boot artifact', 'IMPORT-OK:true', 'VERIFIED:true'],
                                stackrewrite: ['STACK:["mybrain"]', 'NEURONS:true', 'REPORTED:["mybrain"]'],
                                mbwin: ['NO-CLOBBER:true', 'SKIPPED-VAL:'],
                                symlink: ['CANARY-INTACT:DO NOT TOUCH', 'IMPORT-OK:true', 'VERIFIED:true'],
                                sabotage: ['OK:false', 'FAILED-VERIFY:true', 'MARKER:null'],
                            }[o.variant] || [];
                            const missed = flags.filter((c) => !o2.includes(c));
                            if (o.variant === 'mbwin') {
                                const sv = (o2.match(/SKIPPED-VAL:(.*)/) || [])[1] || '';
                                if (sv === '' || /^-/.test(sv)) missed.push('SKIPPED-VAL:<number>');
                            }
                            out.push({ op: 'legacy', task: 'apply', probe: 'variant', variant: o.variant, ok: !p.error && missed.length === 0, missed: missed.join(',') || null,
                                fault: p.error ? String(p.error.message || p.error).slice(0, 120) : (p.stderr || '').includes('PROBE-ERR') ? (p.stderr || '').split('\n').filter(l => l.includes('PROBE-ERR')).join(' | ').slice(0, 160) : null,
                                stack: (o2.match(/STACK:(\[[^\n]*\])/) || [])[1] || null,
                                importOk: o2.includes('IMPORT-OK:true'), verified: o2.includes('VERIFIED:true'),
                                noClobber: o2.includes('NO-CLOBBER:true'), canaryIntact: o2.includes('CANARY-INTACT:DO NOT TOUCH'),
                                failedVerify: o2.includes('FAILED-VERIFY:true'), markerNull: o2.includes('MARKER:null') });
                            continue;
                        }
                        if (o.task === 'clifail') {
                            fs.writeFileSync(path.join(dir, 'sabotage.js'), `
                                                                const fsmod = require('fs');
                                const Module = require('module');
                                const origLoad = Module._load;
                                let sabotaged = false;
                                Module._load = function (request, parent, isMain) {
                                    const mod = origLoad.apply(this, arguments);
                                    if (!sabotaged && request.endsWith('brain') && mod && mod.loadCorpus) {
                                        sabotaged = true;
                                                                                const orig = mod.loadCorpus.bind(mod);
                                        mod.loadCorpus = function (opts) {
                                            fsmod.rmSync('models/public/vant', { recursive: true, force: true });
                                            return orig(opts);
                                        };
                                    }
                                    return mod;
                                };
                            `);
                            const s = spawnSync(process.execPath, [path.join(dir, 'bin', 'migrate.js'), '--status'], { encoding: 'utf8', timeout: 30000, cwd: dir });
                            const fail = spawnSync(process.execPath, [path.join(dir, 'bin', 'migrate.js')], { encoding: 'utf8', timeout: 60000, cwd: dir,
                                env: Object.assign({}, process.env, { NODE_OPTIONS: '--require ' + path.join(dir, 'sabotage.js') }) });
                            out.push({ op: 'legacy', task: 'clifail', ok: true,
                                statusNotice: /OLD-STYLE BRAIN/.test(s.stdout || ''), statusExit0: s.status === 0,
                                failExit1: fail.status === 1, failSaysVerify: /could not verify/.test(fail.stdout || ''),
                                failCode: fail.status === null ? 'timeout' : fail.status,
                                failFault: fail.error ? String(fail.error.message || fail.error).slice(0, 120) : null,
                                failHead: ((fail.stdout || '') + '|' + (fail.stderr || '')).split('\n').filter(l => l.trim()).slice(0, 3).join(' | ').slice(0, 220),
                                failMid: (((fail.stdout || '').match(/legacy\.multibrain-import \{[^}]*\}/) || [''])[0]).slice(0, 200),
                                failTail: ((fail.stdout || '') + '|' + (fail.stderr || '')).split('\n').filter(l => l.trim()).slice(-3).join(' | ').slice(0, 220) });
                            continue;
                        }
                        if (o.task === 'healthmig') {
                            fs.copyFileSync(path.join(ROOT, 'bin', 'health.js'), path.join(dir, 'bin', 'health.js'));
                            fs.writeFileSync(path.join(dir, 'models', 'public', 'lessons2.md'), 'x');
                            fs.writeFileSync(path.join(dir, 'models', 'public', 'goals2.md'), 'x');
                            const before = spawnSync(process.execPath, [path.join(dir, 'bin', 'health.js')], { encoding: 'utf8', timeout: 60000, cwd: dir });
                            probe(`const m = require(${MIG}); await m.migrate();`);
                            const after = spawnSync(process.execPath, [path.join(dir, 'bin', 'health.js')], { encoding: 'utf8', timeout: 60000, cwd: dir });
                            out.push({ op: 'legacy', task: 'healthmig', ok: !before.error && !after.error,
                                warnBefore: /OLD-STYLE BRAIN/.test(before.stdout || ''), warnAfter: /OLD-STYLE BRAIN/.test(after.stdout || ''),
                                bothExit0: before.status === 0 && after.status === 0 });
                            continue;
                        }

                        if (o.task === 'nofalse') {
                            // the CLEAN multibrain fixture rides the same law: a
                            // tree that already nests brains never fires the import
                            const p = probe(`
                                const m = require(${MIG});
                                console.log('PENDING:' + m.status().pending.map(x => x.id).join(','));
                            `);
                            out.push({ op: 'legacy', task: 'nofalse', ok: !p.error,
                                falsePositive: /PENDING:[^\n]*legacy\.multibrain-import/.test(p.stdout || '') });
                            continue;
                        }
                        if (o.task === 'apply') {
                            const p = probe(`
                                const m = require(${MIG});
                                const r = await m.migrate();
                                const fsmod = require('fs');
                                console.log('APPLIED:' + r.applied.map(a => a.id).join(','));
                                console.log('FLAT-GONE:' + (!fsmod.existsSync('models/public/identity.md') && !fsmod.existsSync('models/public/lessons.md')));
                                console.log('NESTED:' + fsmod.readFileSync('models/public/vant/identity.md', 'utf8').includes('legacy user'));
                                console.log('BOOT-NESTED:' + fsmod.existsSync('models/public/vant/boot/start.md'));
                                console.log('SUCCESSION-NESTED:' + fsmod.existsSync('models/public/vant/_succession.json'));
                                const state = JSON.parse(fsmod.readFileSync('models/state.json', 'utf8'));
                                console.log('STACK:' + JSON.stringify({ s: state.stack, c: state.currentBrain, n: !!(state.neurons && state.neurons.attention) }));
                                console.log('MARKER-V3:' + (m._readMarker() || {}).version);
                                const r2 = await m.migrate();
                                console.log('IDEMPOTENT:' + (r2.applied.filter(a => a.id === 'legacy.multibrain-import').length === 0));
                                const stepResult = r.applied.find(a => a.id === 'legacy.multibrain-import');
                                console.log('VERIFIED:' + (stepResult && stepResult.result && stepResult.result.verified === true));
                            `);
                            const o2 = p.stdout || '';
                            const p2 = probe(`
                                const brain = require(${JSON.stringify(path.join(dir, 'lib', 'brain.js'))});
                                brain.setMode('dual');
                                const id = await brain.read('identity');
                                console.log('BRAIN-READS:' + (id && (id.content || '').includes('legacy user')));
                                const c = brain.loadCorpus({ sync: true });
                                console.log('CORPUS-N:' + c.length);
                            `, dir);
                            const r2o = p2.stdout || '';
                            out.push({
                                op: 'legacy', task: 'apply', ok: !p.error && !p2.error,
                                appliedHasImport: /APPLIED:[^\n]*legacy\.multibrain-import/.test(o2),
                                flatGone: o2.includes('FLAT-GONE:true'),
                                nested: o2.includes('NESTED:true'),
                                bootNested: o2.includes('BOOT-NESTED:true'),
                                successionNested: o2.includes('SUCCESSION-NESTED:true'),
                                stackHasVant: /STACK:.{0,24}"s":\["vant"\]/.test(o2),
                                neuronsCarried: o2.includes('"n":true'),
                                currentBrain: (o2.match(/STACK:.*"c":"([^"]+)"/) || [])[1] || '',
                                markerV3: o2.includes('MARKER-V3:3'),
                                idempotent: o2.includes('IDEMPOTENT:true'),
                                selfVerified: o2.includes('VERIFIED:true'),
                                brainReads: r2o.includes('BRAIN-READS:true'),
                                corpusNonZero: /CORPUS-N:[1-9]/.test(r2o),
                            });
                            continue;
                        }
                        out.push({ op: 'legacy', fault: 'unknown task' });
                        continue;
                    }
                    if (o.op === 'noClobber') {
                        const p = probe(`
                            const m = require(${MIG});
                            await m.migrate();
                            const c = require('fs').readFileSync('models/tmp-space/myStuff/old-drop.md', 'utf8');
                            console.log('NO-CLOBBER:' + (c === 'CURRENT WINS'));
                        `);
                        out.push({ op: 'noClobber', ok: !p.error, noClobber: (p.stdout || '').includes('NO-CLOBBER:true') });
                        continue;
                    }
                    if (o.op === 'registry') {
                        const p = probe(`
                            const m = require(${MIG});
                            const okSteps = m.STEPS.length >= 3 && m.STEPS.every(s => typeof s.detect === 'function' && typeof s.apply === 'function' && s.id);
                            console.log('STEPS:' + okSteps + ':' + m.STEPS.length);
                            const s = m.status();
                            console.log('STATUS:' + (s.targetVersion === m.LAYOUT_VERSION) + ':' + (typeof s.upToDate === 'boolean'));
                            const r = await m.migrate();
                            const r2 = await m.migrate();
                            console.log('IDEMPOTENT:' + (r2.applied.length === 0 && r2.skipped.length === m.STEPS.length));
                        `);
                        const o2 = p.stdout || '';
                        out.push({
                            op: 'registry', ok: !p.error,
                            stepsOk: (o2.match(/STEPS:(true|false):(\d+)/) || [])[1] === 'true',
                            statusOk: (o2.match(/STATUS:(true|false):(true|false)/) || [])[1] === 'true',
                            idempotent: o2.includes('IDEMPOTENT:true'),
                        });
                        continue;
                    }
                    out.push({ op: String(o.op), fault: 'unknown op' });
                } catch (e) {
                    out.push({ op: String((o && o.op) || '?'), fault: String((e && e.message) || e).slice(0, 140) });
                }
            }
        } finally {
            for (const d of cleanups) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (er) {} }
        }
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
    // carriers-lane: POST { ops: [{ op, ... }] } — the CARRIER LANES arm
    // (carriers battery slice 1, per-bucket conversion): drives the REAL
    // lib/carriers.js + lib/traveler.js seams in-process — the roster's
    // roster honesty, the NSC-9 address lane, the stone packet lane and
    // its two named walls (seal vs address), the svg encrypted lane, the
    // json ERP lane, sender-side verify, the capacity law. Fixed `now`
    // mints ride the traveler's own determinism law (same payload + same
    // ts = the SAME address). Artifacts/passwords stay in-ride; the wire
    // carries neutral facts only (booleans + caught codes).
        // carriers-plates: POST { ops: [{ op: 'plate', case }] } — carriers
    // slice 4, the PLATES family (pass 262). The plate store must not
    // pollute the repo tree: each case runs in a SCRATCH cwd via a
    // subprocess (spawnSync node -e, 45s bound, scratch swept per op) —
    // require the REAL repo lib by absolute path, chdir into the scratch
    // BEFORE any store write, mirror the native suite's exact laws
    // (brain-state-pinned plate path, sha256 sidecar, hydrate restart,
    // code-carrier never persisted). Telegram: neutral booleans only.
    harness.registerRoute('carriers-plates', async (ctx) => {
        const { spawnSync } = require('child_process');
        const carriersPath = JSON.stringify(path.join(ROOT, 'lib', 'carriers.js'));
        const travelerPath = JSON.stringify(path.join(ROOT, 'lib', 'traveler.js'));
        const brainJsPath = JSON.stringify(path.join(ROOT, 'lib', 'brain.js'));
        const configJsPath = JSON.stringify(path.join(ROOT, 'lib', 'config.js'));
        let j = null;
        try { j = await ctx.request.json(); } catch { j = null; }
        const ops = (j && Array.isArray(j.ops) && j.ops.length) ? j.ops.slice(0, 20) : null;
        if (!ops) return jsonRes({ error: 'ops array required' }, 400);
        const out = [];
        const scratches = [];
        for (const op of ops) {
            const o = op || {};
            const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-ct-plates-'));
            // (privacy default, CI fork 2026-10-28) the CLEAN checkout has no
            // models/state.json (gitignored) - an unseeded child resolves
            // getBrainPath() onto the PUBLIC root (fresh-install guard has
            // no private dir to flip on) and plateDefine writes the plate
            // store to models/PUBLIC - the native suite's laws are
            // state-pinned PRIVATE, so the arm seeds exactly that pin in
            // the scratch before any op child runs (same makeSandbox law
            // this run root already applies to its own fixture brain).
            fs.mkdirSync(path.join(scratch, 'models', 'private', 'vant'), { recursive: true });
            fs.writeFileSync(path.join(scratch, 'models', 'state.json'), JSON.stringify({ stack: ['vant'], currentBrain: 'vant' }));
            scratches.push(scratch);
            const bodyFor = () => {
                const header = `(async () => {\nprocess.chdir(${JSON.stringify(scratch)});\nconst carriers = require(${carriersPath});\nconst traveler = require(${travelerPath});\nconst fs = require('fs');\nconst path = require('path');`;
                const seal = `\n})().catch(e => { console.error('PROBE-ERR:', e.message); process.exit(1); });`;
                const mk = (core) => header + core + seal;
                const diagnos = `(function (brainJs, cfgJs) { const b = require(brainJs); console.log('CWD:' + process.cwd()); try { console.log('BRAINPATH:' + b.getBrainPath()); } catch (e) { console.log('BRAINPATH:ERR:' + e.name + ':' + e.message); } try { const c = require(cfgJs); console.log('CFG:' + (c && c.get && c.get('storage.path'))); } catch (e) { console.log('CFG:ERR:' + e.name); } const walk = (d, depth) => { try { return fs.readdirSync(d, { withFileTypes: true }).flatMap((en) => { const p = d + '/' + en.name; return en.isDirectory() && depth < 5 ? walk(p, depth + 1) : (p.includes('carrier-plates') ? [p] : []); }); } catch (e) { return []; } }; const repoRoot = brainJs.slice(0, brainJs.lastIndexOf('/lib/'));
console.log('WALK:' + walk(process.cwd(), 0).concat(walk(repoRoot + '/models', 0)).join('|'));
console.log('CHKS:' + fs.existsSync(repoRoot + '/models/state.json') + ',' + fs.existsSync(repoRoot + '/package.json')); })(${brainJsPath}, ${configJsPath});`;
                const mintPacket = `const t = traveler.mint({ from: 'floor-1', slots: { title: 'wheel' }, now: 5000 });`;
                if (o.case === 'persist') {
                    return mk(`carriers.plateDefine({ id: 'mfg-tag', carries: 'full-object', frame: { prefix: 'MTG/', suffix: '/END' }, family: 'tag', note: 'the plant floor tag lane' });
                    const store = 'models/private/vant/state/carrier-plates.json';
${diagnos}
${mintPacket}
                    console.log('STORE:' + fs.existsSync(store));
                    console.log('SIDECAR:' + fs.existsSync(store + '.sha256'));
                    console.log('ROSTER:' + (carriers.get('mfg-tag') && carriers.get('mfg-tag').plate === true) + ',' + carriers.list().some((c) => c.id === 'mfg-tag' && c.available));`);
                }
                if (o.case === 'framed') {
                    return mk(`${mintPacket}
                    carriers.plateDefine({ id: 'mfg-tag', carries: 'full-object', frame: { prefix: 'MTG/', suffix: '/END' }, family: 'tag', note: 'the plant floor tag lane' });
                    const tagArt = carriers.encode(t, 'mfg-tag');
                    console.log('FRAMED_MARKER:' + (typeof tagArt.frame === 'string' && tagArt.frame.startsWith('MTG/') && tagArt.frame.endsWith('/END') && tagArt.frame.includes('VSTN:')));
                    const tagBack = carriers.decode('mfg-tag', tagArt.frame);
                    console.log('ROUNDTRIP:' + (tagBack.traveler.id === t.id && tagBack.traveler.seq === t.seq && tagBack.carrier === 'mfg-tag'));
                    const damagedTag = tagArt.frame.slice(0, -5) + (tagArt.frame.slice(-5, -4) === 'X' ? 'Y' : 'X') + tagArt.frame.slice(-4);
                    let sealRefused = false; let sealCode = 'NONE';
                    try { carriers.decode('mfg-tag', damagedTag); } catch (e) { sealRefused = true; sealCode = e && e.code; }
                    console.log('SEAL:' + sealRefused + ',' + sealCode);
                    const wrongFrame = 'WRONG/' + tagArt.frame.slice(5);
                    let shapeRefused = false; let shapeCode = 'NONE';
                    try { carriers.decode('mfg-tag', wrongFrame); } catch (e) { shapeRefused = true; shapeCode = e && e.code; }
                    console.log('FOREIGN:' + shapeRefused + ',' + shapeCode);`);
                }
                if (o.case === 'pointer') {
                    return mk(`${mintPacket}
                    carriers.plateDefine({ id: 'hobby-coin', carries: 'id-pointer', frame: { prefix: 'HC~' }, family: 'coin', note: 'a 12-digit coin tag on a keyring' });
                    const coin = carriers.encode(t, 'hobby-coin');
                    const cp = coin.frame.slice(5).split('-');   // 'HC~9-' is 5 chars: parts are 5-digit facility, 5-digit serial, 1-digit check
const shapeOk = cp.length === 3
    && cp[0].length === 5 && Number.isFinite(Number(cp[0]))
    && cp[1].length === 5 && Number.isFinite(Number(cp[1]))
    && cp[2].length === 1 && Number.isFinite(Number(cp[2]));
console.log('PIN_SHAPE:' + shapeOk);
                    const through = carriers.decode('hobby-coin', coin.frame);
                    const direct = carriers.decode('nsc9', coin.frame.slice(3));
                    console.log('ROUGH_SAME:' + (direct && through && through.pointer && through.pointer.facility === direct.facility));`);
                }
                if (o.case === 'gates') {
                    return mk(`let reserved = false; let reservedCode = 'NONE';
try { carriers.plateDefine({ id: 'stone', carries: 'full-object', frame: { prefix: 'X/' } }); } catch (e) { reserved = true; reservedCode = e && e.code; }
console.log('RESERVED:' + reserved + ',' + reservedCode);
let badDef = false; let badCode = 'NONE';
try { carriers.plateDefine({ id: 'Bad_Id', carries: 'full-object', frame: { prefix: 'X/' } }); } catch (e) { badDef = true; badCode = e && e.code; }
let missingFrame = false; let missingCode = 'NONE';
try { carriers.plateDefine({ id: 'ok-id', carries: 'full-object' }); } catch (e) { missingFrame = true; missingCode = e && e.code; }
let badCarries = false; let badCarriesCode = 'NONE';
try { carriers.plateDefine({ id: 'ok-id2', carries: 'carrier-less', frame: { prefix: 'X/' } }); } catch (e) { badCarries = true; badCarriesCode = e && e.code; }
console.log('MALFORMED:' + badDef + ',' + badCode + ',' + missingFrame + ',' + missingCode + ',' + badCarries + ',' + badCarriesCode);
let imposter = false; let imposterCode = 'NONE';
try { carriers.plateDefine({ id: 'imposter', carries: 'full-object', frame: { prefix: 'VSTN:' } }); } catch (e) { imposter = true; imposterCode = e && e.code; }
console.log('GRAMMAR:' + imposter + ',' + imposterCode);`);
                }
                if (o.case === 'hydrate') {
                    return mk(`${mintPacket}
                    carriers.plateDefine({ id: 'mfg-tag', carries: 'full-object', frame: { prefix: 'MTG/', suffix: '/END' }, family: 'tag', note: 'the plant floor tag lane' });
                    const tagArt = carriers.encode(t, 'mfg-tag');
                    delete carriers._registry['mfg-tag'];
                    carriers._hydratePlates();
                    console.log('REGISTRY:' + (carriers.get('mfg-tag') && carriers.get('mfg-tag').plate === true));
                    const back = carriers.decode('mfg-tag', tagArt.frame);
                    console.log('STABLE:' + (back.traveler.id === t.id));`);
                }
                if (o.case === 'code') {
                    return mk(`${mintPacket}
                    carriers.plateDefine({ id: 'mfg-tag', carries: 'full-object', frame: { prefix: 'MTG/', suffix: '/END' }, family: 'tag', note: 'the plant floor tag lane' });
                    const tampered = JSON.parse(JSON.stringify(t)); tampered.slots.title = 'forged';
                    const fullPacket = t;
                    const custom = carriers.define({
                        id: 'edi-lane', family: 'integration', note: 'the EDI lane a plant already speaks',
                        encode(t2) { return { carrier: 'edi-lane', body: 'EDI*830*0*' + t2.id }; },
                        decode() { const goodPacket = JSON.parse(JSON.stringify(fullPacket)); return { carrier: 'edi-lane', traveler: goodPacket }; },
                    });
                    let encodedRefused = false; let encodedCode = 'NONE';
                    try { custom.encode(tampered); } catch (e) { encodedRefused = true; encodedCode = e && e.code; }
                    console.log('TAMPER:' + encodedRefused + ',' + encodedCode);
                    const custom2 = carriers.define({
                        id: 'edi-bad',
                        encode() { return { carrier: 'edi-bad', body: 'X' }; },
                        decode() { return { carrier: 'edi-bad', traveler: tampered }; },
                    });
                    let packetReturn = false; let packetCode = 'NONE';
                    try { custom2.decode({}); } catch (e) { packetReturn = true; packetCode = e && e.code; }
                    console.log('PACKET:' + packetReturn + ',' + packetCode);
                    ${diagnos}
                    const storeTxt = fs.readFileSync('models/private/vant/state/carrier-plates.json', 'utf8');
                    console.log('EPHEMERAL:' + !storeTxt.includes('edi-lane'));`);
                }
                return null;
            }
            const body = bodyFor();
            if (!body) { out.push({ op: 'plate', case: String(o.case), fault: 'unhandled plate case' }); continue; }
            const p = spawnSync(process.execPath, ['-e', body], { encoding: 'utf8', timeout: 45000, cwd: ROOT });
            const o2 = p.stdout || '';
            const kv = (k) => { const m = o2.match(new RegExp(k + ':(.*)')); return m ? m[1].trim() : null; };
            const fault = p.error ? String(p.error.message || p.error).slice(0, 120)
                : (p.stderr || '').includes('PROBE-ERR') ? (p.stderr || '').split('\n').filter(l => l.includes('PROBE-ERR')).join(' | ').slice(0, 160) : null;
            out.push(Object.assign({ op: 'plate', case: String(o.case), fault }, (() => {
                if (o.case === 'persist') return { store: kv('STORE'), sidecar: kv('SIDECAR'), roster: kv('ROSTER'), cwd: kv('CWD'), brainpath: kv('BRAINPATH'), cfg: kv('CFG'), walk: kv('WALK') };
                if (o.case === 'framed') return { marker: kv('FRAMED_MARKER'), roundtrip: kv('ROUNDTRIP'), seal: kv('SEAL'), foreign: kv('FOREIGN') };
                if (o.case === 'pointer') return { pinShape: kv('PIN_SHAPE'), roughSame: kv('ROUGH_SAME'), roughFrame: kv('COIN_FRAME') };
                if (o.case === 'gates') return { reserved: kv('RESERVED'), malformed: kv('MALFORMED'), grammar: kv('GRAMMAR') };
                if (o.case === 'hydrate') return { registry: kv('REGISTRY'), stable: kv('STABLE') };
                if (o.case === 'code') return { tamper: kv('TAMPER'), packet: kv('PACKET'), ephemeral: kv('EPHEMERAL'), cwd: kv('CWD'), brainpath: kv('BRAINPATH'), cfg: kv('CFG'), walk: kv('WALK') };
                return {};
            })()));
        }
        for (const s of scratches) { try { fs.rmSync(s, { recursive: true, force: true }); } catch (er) {} }
        return jsonRes({ results: out }, 200);
    });

harness.registerRoute('carriers-lane', async (ctx) => {
        const carriers = sandboxLib('carriers');
        const traveler = sandboxLib('traveler');
        const cryptoMod = require('crypto');
        let j = null;
        try { j = await ctx.request.json(); } catch { j = null; }
        const ops = (j && Array.isArray(j.ops) && j.ops.length) ? j.ops.slice(0, 80) : null;
        if (!ops) return jsonRes({ error: 'ops array required' }, 400);
        const packets = new Map();   // token -> traveler object
        const artifacts = new Map(); // token -> { envelope?, frame?, svg?, pw?, json? }
        const routeFixtures = new Map(); // route key -> org fixture (slice 3: the route laws)
        const out = [];
        const amt = (token) => packets.get(String(token));
        const art = (token) => artifacts.get(String(token)) || {};
        const attempt = (fn) => {
            try { return Object.assign({ ok: true }, fn()); }
            catch (e) {
                const msg = String((e && e.message) || e);
                return { ok: false, caught: (e && e.code) || 'UNCAUGHT', msgHas: {
                    known: /known:/.test(msg), stoneCap: /STONE_CAP/.test(msg),
                    neitherLane: /neither lane grammar/.test(msg), addressDerive: /address does not derive/.test(msg) } };
            }
        };
        for (const op of ops) {
            const o = op || {};
            try {
                if (o.op === 'mint') {
                    const t = traveler.mint({ from: String(o.from || 'floor-1'), slots: Object.assign({ title: 'wheel' }, o.slots || {}), now: Number(o.now || 5000) });
                    const token = 'p' + packets.size; packets.set(token, t);
                    out.push({ op: 'mint', ok: true, token });
                    continue;
                }
                if (o.op === 'roster') {
                    const list = carriers.list();
                    const real = {};
                    for (const c of list) real[c.id] = c.available === true;
                    const png = list.find((c) => c.id === 'png');
                    out.push({ op: 'roster', ok: true, real,
                        pngAvailable: png ? png.available === true : null,
                        pngNamed: !!(png && png.available === false && png.blocker && png.blocker.length > 10),
                        qrReal: !!(list.find((c) => c.id === 'qr') || {}).available,
                        noOverstatements: list.every((c) => c.available === true || (c.available === false && c.blocker)) });
                    continue;
                }
                if (o.op === 'tamper') {
                    const evil = JSON.parse(JSON.stringify(amt(o.token)));
                    evil.slots.title = String(o.title || 'forged');
                    const token = 'p' + packets.size; packets.set(token, evil);
                    out.push({ op: 'tamper', ok: true, token });
                    continue;
                }
                if (o.op === 'encode') {
                    const lane = String(o.lane);
                    const t = amt(o.token);
                    const r = attempt(() => {
                        const opts = {};
                        if (o.pw !== undefined) opts.password = String(o.pw);
                        if (o.pointer === true) opts.pointer = true;
                        const a = Object.keys(opts).length ? carriers.encode(t, lane, opts) : carriers.encode(t, lane);
                        const token = String(o.storeKey || (lane + ':' + o.token));
                        const facts = {};
                        if (lane === 'nsc9') { artifacts.set(token, { frame: a.frame }); facts.frame12 = typeof a.frame === 'string' && /^9-[0-9]{5}-[0-9]{5}-[0-9]$/.test(a.frame); }
                        else if (lane === 'stone') { artifacts.set(token, { envelope: a.envelope }); facts.vstnGrammar = a.envelope.startsWith('VSTN:1:') && /^[0-9a-f]{64}$/.test(a.envelope.split(':')[2]); }
                        else if (lane === 'svg') { artifacts.set(token, { svg: a.svg, pw: a.stonePassword !== undefined ? a.stonePassword : (o.pw !== undefined ? String(o.pw) : undefined) }); facts.encrypted = a.encrypted === true; facts.minted24 = typeof a.stonePassword === 'string' && a.stonePassword.length >= 24; facts.namesId = a.svg.includes(t.id.slice(0, 12)); facts.noPlainText = !a.svg.includes('BRN:') && !a.svg.includes('VSTN:'); facts.explicitPwNoMint = !('stonePassword' in a); }
                        else if (lane === 'json') { artifacts.set(token, { json: a.json }); facts.verbatim = JSON.stringify(a.json) === JSON.stringify(t); }
                        return facts;
                    });
                    out.push(Object.assign({ op: 'encode', lane }, r));
                    continue;
                }
                if (o.op === 'decode') {
                    const lane = String(o.lane);
                    const r = attempt(() => {
                        let arg, pw;
                        if (o.from === 'artifact') {
                            const a = art(o.artifactToken);
                            arg = lane === 'stone' ? a.envelope : lane === 'svg' ? a.svg : lane === 'qr' ? a.png : a.json;
                            if (a.pw !== undefined) pw = a.pw;
                        } else if (o.shape === 'carrierDamage') {
                            const a = art(o.artifactToken); const parts = a.envelope.split(':');
                            const bit = parts[3][10] === 'A' ? 'B' : 'A';
                            arg = 'VSTN:1:' + parts[2] + ':' + parts[3].slice(0, 10) + bit + parts[3].slice(11);
                        } else if (o.shape === 'resealForged') {
                            const ct = Buffer.from(JSON.stringify(amt(o.token))).toString('base64');
                            arg = 'VSTN:1:' + cryptoMod.createHash('sha256').update('stone|' + ct).digest('hex') + ':' + ct;
                        } else if (o.shape === 'nonsense') { arg = 'VSTN:1:notahexseal:ctext'; }
                        else if (o.shape === 'rawString') { arg = String(o.payload || '9-abcde-12345-99'); }
                        else if (o.shape === 'wrongPw') { const a = art(o.artifactToken); arg = a.svg; pw = String(o.pw || 'wrong-pass'); }
                        else if (o.shape === 'pointerOnly') {
                            const a = art(o.artifactToken); arg = a.png;
                            pw = { pointerOnly: true }; // the qr lane's third-arg options
                        }
                        else if (o.shape === 'foreignPng') {
                            const qrcode = require('qrcode-generator');
                            const zlib = require('zlib');
                            const qr = qrcode(0, 'L');
                            qr.addData('hello plain url qr', 'Byte');
                            qr.make();
                            const n = qr.getModuleCount();
                            const scale = 4, margin = 4;
                            const size = (n + margin * 2) * scale;
                            const px = Buffer.alloc(size * size, 255);
                            for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) {
                                if (!qr.isDark(row, col)) continue;
                                for (let dy = 0; dy < scale; dy++) px.fill(0, ((row + margin) * scale + dy) * size + (col + margin) * scale, ((row + margin) * scale + dy) * size + (col + margin) * scale + scale);
                            }
                            const raw = Buffer.alloc(size * (size + 1));
                            for (let y = 0; y < size; y++) px.copy(raw, y * (size + 1) + 1, y * size, (y + 1) * size);
                            const deflated = zlib.deflateSync(raw);
                            const ihdr = Buffer.alloc(13);
                            ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 0;
                            const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32BE(deflated.length);
                            arg = Buffer.concat([
                                Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
                                Buffer.concat([Buffer.from([0, 0, 0, 13]), Buffer.from('IHDR'), ihdr, Buffer.from('CRC!')]),
                                Buffer.concat([lenBuf, Buffer.from('IDAT'), deflated, Buffer.from('CRC!')]),
                                Buffer.concat([Buffer.from([0, 0, 0, 0]), Buffer.from('IEND'), Buffer.from('CRC!')]),
                            ]);
                        }
                        else if (o.shape === 'notPng') { arg = Buffer.from('not a png at all'); }
                        else if (o.shape === 'nonSquare') { const b = cryptoMod.randomBytes(64); b.writeUInt32BE(10, 16); b.write('PNG', 1, 'ascii'); arg = b; }
                        else if (o.shape === 'tamperPacket') { arg = amt(o.token); }
                        else return { fault: 'unhandled decode shape' };
                        const res = pw === undefined ? carriers.decode(lane, arg) : carriers.decode(lane, arg, pw);
                        const back = {};
                        if (res && res.traveler && o.token) {
                            const t = amt(o.token);
                            back.idMatch = res.traveler.id === t.id; back.seqMatch = res.traveler.seq === t.seq;
                            back.stepsMatch = JSON.stringify(res.traveler.steps) === JSON.stringify(t.steps);
                        }
                        if (res && res.kind !== undefined) back.kind = res.kind;
                        if (res && res.resolved !== undefined) back.resolved = res.resolved;
                        if (res && res.reason !== undefined) back.reason = res.reason;
                        if (res && res.fetched !== undefined) back.fetched = res.fetched;
                        if (res && res.frame !== undefined) back.frameSame = String(res.frame) === String((art(o.artifactToken) || {}).frame || '');
                        if (res && res.id) back.decodedId = res.id;
                        return back;
                    });
                    out.push(Object.assign({ op: 'decode', lane, shape: o.shape || o.from || '' }, r));
                    continue;
                }
                if (o.op === 'giai') {
                    const t = amt(o.token);
                    const a = art(o.artifactToken);
                    const r = attempt(() => {
                        const g = carriers.nsc9.giai(t);
                        return { formAi8004: /^\(8004\)9?[0-9]+$/.test(g) && g.startsWith('(8004)'), stripBack: carriers.nsc9.fromGiai(g) === a.frame };
                    });
                    out.push(Object.assign({ op: 'giai' }, r));
                    continue;
                }
                if (o.op === 'matches') {
                    const t = amt(o.token);
                    const a = art(o.artifactToken);
                    const r = attempt(() => {
                        if (o.variant === 'wrong') return { answer: carriers.nsc9.matches('9-00000-00000-0', t) };
                        if (o.variant === 'badFacility') { carriers.nsc9.matches('9-1234-12345-1', t); return { threw: false }; }
                        return { answer: carriers.nsc9.matches(a.frame, t) };
                    });
                    out.push(Object.assign({ op: 'matches', variant: o.variant || 'right' }, r));
                    continue;
                }
                if (o.op === 'fromGiai') {
                    const r = attempt(() => { return { stripped: carriers.nsc9.fromGiai(String(o.payload || "(8004)9123")) }; });
                    out.push(Object.assign({ op: 'fromGiai' }, r));
                    continue;
                }
                if (o.op === 'senderVerify') {
                    const evil = amt(o.token);
                    const lanes = Array.isArray(o.lanes) ? o.lanes : ['nsc9', 'stone', 'svg', 'json'];
                    const assymilated = {};
                    for (const lane of lanes) {
                        const r = attempt(() => { carriers.encode(evil, lane); return {}; });
                        assymilated[lane] = { caught: r.ok ? null : r.caught, tamper: r.ok ? false : r.caught === 'E_CARRIER_TAMPER' };
                    }
                    out.push({ op: 'senderVerify', ok: true, lanes: assymilated });
                    continue;
                }
                if (o.op === 'capacity') {
                    const big = traveler.mint({ from: 'big', slots: { title: 'big', blob: 'X'.repeat(Number(o.blobLen || 400000)) } });
                    const r = attempt(() => { carriers.encode(big, 'stone'); return {}; });
                    out.push(Object.assign({ op: 'capacity' }, r));
                    continue;
                }
                if (o.op === 'persist') {
                    let r;
                    try { traveler.persist(amt(o.token)); r = { ok: true }; }
                    catch (e) { r = { ok: false, caught: (e && e.code) || 'UNCAUGHT' }; }
                    out.push(Object.assign({ op: 'persist' }, r));
                    continue;
                }
                if (o.op === 'qrPointer') {
                    const t = amt(o.token);
                    const r = attempt(() => {
                        const a = carriers.encode(t, 'qr', { pointer: true });
                        artifacts.set(String(o.storeKey || ('qrp:' + o.token)), { png: a.png, frame: a.frame });
                        const plain = carriers.encode(t, 'qr', {});
                        artifacts.set('qrf:' + o.token, { png: plain.png, frame: plain.frame });
                        return {
                            kind: a.kind,
                            frameGrammar: typeof a.frame === 'string' && /^VANT:1:[0-9a-f]{64}$/.test(a.frame),
                            frameLen71: typeof a.frame === 'string' && a.frame.length === 71,
                            idSuffix: typeof a.frame === 'string' && a.frame.slice(7) === t.id,
                        };
                    });
                    out.push(Object.assign({ op: 'qrPointer' }, r));
                    continue;
                }
                if (o.op === 'wireCase') {
                    const t = amt(o.token);
                    const a = art(o.artifactToken);
                    const cases = {
                        missing: () => ({ found: false }),
                        throwing: () => { throw new Error('door died'); },
                        good: (id) => (id === t.id ? { found: true, traveler: t } : { found: false }),
                        swapped: () => ({ found: true, traveler: JSON.parse(JSON.stringify(amt(o.otherToken || o.token))) }),
                        forged: () => { const ev = JSON.parse(JSON.stringify(t)); ev.slots.title = 'wire-counterfeit'; return { found: true, traveler: ev }; },
                        badLocal: (id) => (id === t.id ? { found: true, traveler: { id: 'bad' } } : { found: false }),
                    };
                    let r;
                    try {
                        if (o.kind === 'badType') {
                            try { carriers.setPointerFetch('fake'); r = { ok: false, setupCaught: 'NONE' }; }
                            catch (e) { r = { ok: false, setupCaught: e && e.code }; }
                        } else {
                            const kind = o.kind;
                            if (kind !== 'reset') carriers.setPointerFetch(cases[kind] || (() => ({ found: false })));
                            else carriers.setPointerFetch(null);
                            const wireR = attempt(() => {
                                const res = carriers.decode('qr', a.png);
                                return { resolved: res && res.resolved, reason: res && res.reason,
                                    fetched: res && res.fetched,
                                    idMatch: !!(res && t && res.id === t.id), localBodyWins: !!(res && res.traveler && res.fetched === undefined) };
                            });
                            r = wireR.ok ? wireR : { caught: wireR.caught };
                        }
                    } finally { carriers.setPointerFetch(null); }   // a hook never lingers past its case
                    out.push(Object.assign({ op: 'wireCase' }, r));
                    continue;
                }
                if (o.op === 'tamperBody') {
                    const t = amt(o.token);
                    const pathMod = require('path');
                    const brain = traveler._ledgerPath();
                    const bodyFile = pathMod.join(pathMod.dirname(brain), 'travelers', t.id + '.json');
                    const real = JSON.parse(fs.readFileSync(bodyFile, 'utf8'));
                    const evil = JSON.parse(JSON.stringify(real));
                    evil.slots.title = 'forged-on-resolve';
                    fs.writeFileSync(bodyFile, JSON.stringify(evil));
                    let r;
                    try { carriers.decode('qr', art(o.artifactToken).png); r = { ok: true, refused: false }; }
                    catch (e) { r = { ok: true, refused: true, caught: e && e.code }; }
                    finally { fs.writeFileSync(bodyFile, JSON.stringify(real)); }
                    out.push(Object.assign({ op: 'tamperBody' }, r));
                    continue;
                }
                if (o.op === 'route') {
                    // (carriers slice 3; the R0-R12 family) The route laws
                    // need a REAL org model: scope lineage admits only known
                    // members fail-closed. Grants are per-process; the ride
                    // grants exactly what it needs and the fixture is
                    // np-unique (Date.now + a random suffix — org names
                    // never collide across rides). Self-seeding: every case
                    // lazily builds its org fixture under `key`.
                    const teams = sandboxLib('teams');
                    const sudo = sandboxLib('sudo');
                    const escrow = sandboxLib('escrow');
                    const routeFx = routeFixtures.get(String(o.key || 'rt'));
                    const fx = (() => {
                        if (routeFx) return routeFx;
                        try { sudo.grant('default', 'write'); } catch (e2) { /* in-process grant lane, idempotent */ }
                        const np = 'rt' + Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36);
                        const org = teams.createOrg('o-' + np);
                        const dep = teams.createDept('d-' + np, { org: org.id });
                        const tm = teams.createTeam('t-' + np, { dept: dep.id });
                        const assigned = teams.assign('st-' + np, { team: tm.id });
                        const fixture = { np, tm, station: 'st-' + np,
                            teamOk: !!(org.id && dep.id && tm && tm.id),
                            stationOnTeam: !!(assigned && !assigned.error) };
                        routeFixtures.set(String(o.key || 'rt'), fixture);
                        return fixture;
                    })();
                    const caseFn = String(o.case);
                    // (2026-10-27 the WIRE seam, vant-carriers x vant-relay)
                    // the certified letter crosses INTO the pod's own relay
                    // door: a REAL org-scoped carry() output posts over a REAL
                    // loopback mount (lib/api's r/2 bridge face, HMAC lane
                    // with the real body-bytes law) and lands THROUGH the
                    // brain_write slot (the REAL door, not a capture shim).
                    // Refused packets must never ride (zero landing growth).
                    // This case is async and self-contained; it bypasses the
                    // sync attempt() wrapper with its own try/catch.
                    if (caseFn === 'letterWire') {
                        const rWire = await (async () => {
                            const tRW = traveler.mintScoped({ from: 'origin', slots: { title: 'wire-warrant' }, scope: { owner: 'team:' + fx.tm.id, visibility: 'scope' } });
                            const repW = carriers.carry(tRW, { stations: [
                                { by: fx.station, op: 'inspect' },
                                { by: fx.station, op: 'test', carrier: 'nsc9' },
                                { by: fx.station, op: 'release' },
                            ] });
                            const out0 = { carryOk: !!(repW && repW.ok), walkCert: !!(repW && repW.walk && repW.walk.ok === true && repW.walk.stations === 4 && Array.isArray(repW.walk.gaps) && repW.walk.gaps.length === 0), wireCase: true };
                            if (!out0.carryOk) { out0.door = 'carry refused before the wire: ' + ((repW && repW.refused && repW.refused.code) || 'unknown'); return out0; }
                            const cfg = sandboxLib('config');
                            const savedE = cfg.get('relay.enabled');
                            const savedG = cfg.get('relay.gateKey');
                            cfg.set('relay.enabled', true);
                            cfg.set('relay.gateKey', 'vant-carriers-wire-seam-gate-0123');
                            const cryptoMod = require('crypto');
                            const GK = String(cfg.get('relay.gateKey'));
                            const sign = (raw) => cryptoMod.createHmac('sha256', GK).update(raw, 'utf8').digest('hex');
                            const envelope = (payload) => JSON.stringify({ event: 'relay.travel', from: 'wire-seam', ts: Date.now(), nonce: 'w' + Math.random().toString(16).slice(2), payload, v: { major: 2 } });
                            try {
                                const relay = sandboxLib('api').relay;
                                // (the door seam, documented in the relay lib)
                                // the loopback transport posts to the pod's
                                // MCP HTTP door; the run-root sandbox serves
                                // the SAME door in-process (real mcp.execute
                                // - the brain_write record lands in the
                                // sandbox tree, which is the row's census).
                                const sandboxMcp = sandboxLib('mcp');
                                relay.setDoorTransport(async ({ body }) => {
                                    const result = await sandboxMcp.execute(String((body && body.tool) || ''), (body && body.args) || {});
                                    return { ok: true, status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: 1, result }) };
                                });
                                const m = relay.mount({ port: 0 });
                                if (!m || !m.mounted) { out0.door = 'mount failed: ' + JSON.stringify(m).slice(0, 120); return out0; }
                                const st = relay._getMountedState();
                                // (bind law) the webhook server binds ASYNC -
                                // address() is null until 'listening'; vant-relay's
                                // own helper waits the same way. Never read .port
                                // off a null address.
                                const port = await new Promise((res2) => {
                                    if (!st || !st.server) return res2(null);
                                    const srv2 = st.server;
                                    if (srv2.listening) return res2(srv2.address() ? srv2.address().port : null);
                                    srv2.once('listening', () => res2(srv2.address() ? srv2.address().port : null));
                                    setTimeout(() => res2(null), 5000);
                                });
                                if (!port) { out0.door = 'the webhook server never bound a port within 5s'; return out0; }
                                const http = require('http');
                                const post = (raw) => new Promise((resolve) => {
                                    const req = http.request({
                                        host: '127.0.0.1', port, path: '/relay', method: 'POST',
                                        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(raw), 'x-signature-256': sign(raw) },
                                    }, (res) => {
                                        let data = '';
                                        res.setEncoding('utf8');
                                        res.on('data', (c) => { data += c; });
                                        res.on('end', () => { let j = null; try { j = JSON.parse(data); } catch { /* ack parse fail */ } resolve({ status: res.statusCode, json: j }); });
                                    });
                                    req.on('error', () => resolve({ status: 0, json: null }));
                                    req.end(raw);
                                });
                                const letter = repW.letter;
                                const listSlots = () => {
                                    try {
                                        const brain = traveler._ledgerPath();
                                        return fs.readdirSync(path.join(path.dirname(brain), 'travelers')).filter((n) => /^[0-9a-f]{64}\.json$/.test(n)); // the traveler lib's OWN append-only store: the body beside the ledger index
                                    } catch (e0) { return []; }
                                };
                                const census0 = listSlots();
                                const legalAck = await post(envelope(letter));
                                const census1 = listSlots();
                                const landedName = letter.id + '.json';
                                out0.doorOk = !!(legalAck.status === 200 && legalAck.json && legalAck.json.reply && legalAck.json.reply.ok === true);
                                out0.doorLandedIdNamed = census1.includes(landedName);
                                out0.letterSteps = Array.isArray(letter.steps) ? letter.steps.length : null;
                                out0.letterSeq = letter.seq;
                                const fresh = census1.filter((n) => !census0.includes(n));
                                out0.oneLanding = fresh.length === 1 && fresh[0] === landedName;
                                let body = null;
                                try { body = JSON.parse(fs.readFileSync(path.join(path.dirname(traveler._ledgerPath()), 'travelers', landedName), 'utf8')); } catch (e1) { body = null; }
                                out0.slotCarriesLetter = !!(body && body.id === letter.id && Array.isArray(body.steps) && body.steps.length === letter.steps.length);
                                // the gapped copy: a mid-route drop of one ledger
                                // step answers E_TRAVELER_STEP inside the 200 ack
                                const gapped = Object.assign(JSON.parse(JSON.stringify(letter)), { steps: letter.steps.slice(0, letter.steps.length - 1) });
                                const gappedAck = await post(envelope(gapped));
                                out0.gappedRefused = !!(gappedAck.status === 200 && gappedAck.json && gappedAck.json.reply && gappedAck.json.reply.ok === false && gappedAck.json.reply.code === 'E_RIDE_DECODE' && String(gappedAck.json.reply.error) === 'E_TRAVELER_STEP');
                                // the sneak id: the address law at the same door
                                const sneak = Object.assign(JSON.parse(JSON.stringify(letter)), { id: '../sneak-toward-the-slot' });
                                const sneakAck = await post(envelope(sneak));
                                out0.sneakRefused = !!(sneakAck.status === 200 && sneakAck.json && sneakAck.json.reply && sneakAck.json.reply.ok === false && sneakAck.json.reply.code === 'E_RIDE_DECODE' && String(sneakAck.json.reply.error) === 'E_TRAVELER_ADDRESS');
                                // re-land the SAME legal letter: the append-only store refuses
                                // the duplicate typed INSIDE the ack bridge
                                const relandAck = await post(envelope(letter));
                                out0.relandRefused = !!(relandAck.status === 200 && relandAck.json && relandAck.json.reply && relandAck.json.reply.ok === false && relandAck.json.reply.code === 'E_RIDE_DISPATCH' && String(relandAck.json.reply.error).includes('E_TRAVELER_STEP'));
                                const census2 = listSlots();
                                out0.zeroRefusedGrowth = census2.length === census1.length && census2.every((n) => census1.includes(n));
                            } catch (eW) {
                                out0.door = 'wire threw: ' + String((eW && eW.name) || '?') + ': ' + String((eW && eW.message) || '').slice(0, 100);
                            } finally {
                                try { sandboxLib('api').relay.unmount(); } catch (eU) { /* best effort */ }
                                try { sandboxLib('api').relay.setDoorTransport(null); } catch (eT) { /* default */ }
                                cfg.set('relay.enabled', savedE);
                                cfg.set('relay.gateKey', savedG);
                            }
                            return out0;
                        })();
                        out.push(Object.assign({ op: 'route', caseFn }, rWire));
                        continue;
                    }
                    // (carriers slice 8, 2026-10-27: the MESH serving wall,
                    // real landings) The wire seam's store landing made the
                    // mesh door's operands REAL — so the serving side stops
                    // riding captured shims too: ONE packet lands through
                    // the brain_write door slot law (same chain the wire
                    // rides, no mount needed), then the mesh doors are
                    // driven over THAT body in the sandbox tree:
                    // traveler_fetch serves found + re-verified (the wall at
                    // the serving node re-derives the address),
                    // traveler_stamp derives the VANT:1 frame + a REAL
                    // scannable raster from the re-verified body, an absent
                    // id answers found:false honestly at BOTH verbs, a
                    // swapped store (simulated at-rest tamper of the body
                    // file) refuses typed at BOTH verbs, restoring the exact
                    // bytes re-arms the store, and the pointer loop decodes
                    // the REAL stamp raster through an mcp-door-backed
                    // pointer fetch (the browser lane, closure = the
                    // serving door itself). Zero store growth across the
                    // whole serving ride.
                    if (caseFn === 'meshServe') {
                        const rMesh = await (async () => {
                            const tM = traveler.mintScoped({ from: 'origin', slots: { title: 'mesh-warrant' }, scope: { owner: 'team:' + fx.tm.id, visibility: 'scope' } });
                            const repM = carriers.carry(tM, { stations: [
                                { by: fx.station, op: 'inspect' },
                                { by: fx.station, op: 'test', carrier: 'nsc9' },
                                { by: fx.station, op: 'release' },
                            ] });
                            const outM = { carryOk: !!(repM && repM.ok && repM.letter), meshCase: true };
                            if (!outM.carryOk) { outM.fault = 'carry refused before the mesh: ' + ((repM && repM.refused && repM.refused.code) || 'unknown'); return outM; }
                            const letter = repM.letter;
                            const travelersDir = path.join(path.dirname(traveler._ledgerPath()), 'travelers');
                            const bodyFile = path.join(travelersDir, letter.id + '.json');
                            const dirCount = () => { try { return fs.readdirSync(travelersDir).length; } catch (eD) { return -1; } };
                            const mcpServ = sandboxLib('mcp');
                            const landed = await mcpServ.execute('brain_write', {
                                name: 'traveler-' + letter.id + '-tr' + (String(letter.tr).endsWith('1') ? '1' : String(letter.tr).slice(3)) + '.json',
                                content: JSON.stringify(letter),
                                format: 'json',
                            });
                            outM.landed = !!(landed && landed.saved === true && landed.via === 'traveler-store');
                            if (!outM.landed) { outM.fault = 'the door slot did not land: ' + JSON.stringify(landed).slice(0, 120); return outM; }
                            // the zero-growth law measures the SERVING legs
                            // only: the landing IS the store hold the mesh
                            // ride owns (the wire-seam row grades the wheel
                            // into the store; this row grades the serving).
                            const census0 = dirCount();
                            try {
                                const t = traveler; // the arm's binding IS the sandbox copy
                                // (1) the serving wall: found + re-verified
                                const served = await mcpServ.execute('traveler_fetch', { id: letter.id });
                                outM.found = !!(served && served.found === true && served.traveler && served.traveler.id === letter.id);
                                outM.reverify = !!(served && served.traveler && t.verify(served.traveler).ok === true);
                                outM.steps = served && served.traveler && Array.isArray(served.traveler.steps) ? served.traveler.steps.length : null;
                                // (2) the artifact door: frame + REAL raster
                                const stamp = await mcpServ.execute('traveler_stamp', { id: letter.id });
                                outM.frame = stamp && stamp.found === true && stamp.frame === 'VANT:1:' + letter.id;
                                outM.png = !!(stamp && stamp.found === true && typeof stamp.png === 'string' && stamp.png.length > 100);
                                // (3) the pointer loop on the REAL raster:
                                // the browser decode rides a fetch closure
                                // backed by the SAME serving door
                                const missId = 'f'.repeat(64);
                                carriers.setPointerFetch(async (wantId) => {
                                    try { return await mcpServ.execute('traveler_fetch', { id: String(wantId) }); }
                                    catch { return { found: false }; }
                                });
                                const decoded = carriers.decode('qr', Buffer.from(String(stamp.png), 'base64'));
                                outM.pointerLoop = !!(decoded && decoded.resolved === true && decoded.traveler && decoded.traveler.id === letter.id);
                                // (4) the ABSENT id answers honestly at both doors
                                const missFetch = await mcpServ.execute('traveler_fetch', { id: missId });
                                outM.honestMiss = !!(missFetch && missFetch.found === false && missFetch.traveler == null);
                                const missStamp = await mcpServ.execute('traveler_stamp', { id: missId });
                                outM.honestMissStamp = !!(missStamp && missStamp.found === false && missStamp.png == null);
                                // (5) the swapped STORE refuses typed (at-rest
                                // tamper simulation: the same filename, corrupted
                                // slots), both door faces, then the exact-byte
                                // restore re-arms the wall
                                const original = fs.readFileSync(bodyFile, 'utf8');
                                const real = JSON.parse(original);
                                const evil = JSON.parse(JSON.stringify(real));
                                evil.slots.title = 'swapped-on-the-server';
                                fs.writeFileSync(bodyFile, JSON.stringify(evil));
                                let swapFetch = null, swapStamp = null;
                                try { await mcpServ.execute('traveler_fetch', { id: letter.id }); swapFetch = { passed: true }; }
                                catch (e) { swapFetch = { code: e && e.code }; }
                                try { await mcpServ.execute('traveler_stamp', { id: letter.id }); swapStamp = { passed: true }; }
                                catch (e) { swapStamp = { code: e && e.code }; }
                                outM.swapRefused = !!(swapFetch.code && swapStamp.code && swapFetch.code === swapStamp.code);
                                fs.writeFileSync(bodyFile, original);
                                const restored = await mcpServ.execute('traveler_fetch', { id: letter.id });
                                outM.restored = !!(restored && restored.found === true && restored.traveler && restored.traveler.id === letter.id && t.verify(restored.traveler).ok === true);
                            } catch (eS) {
                                outM.fault = 'serving wall threw: ' + String((eS && eS.name) || '?') + ': ' + String((eS && eS.message) || '').slice(0, 100);
                            } finally {
                                try { carriers.setPointerFetch(null); } catch (eR) { /* reset */ }
                            }
                            const census1 = dirCount();
                            outM.zeroServingGrowth = census1 === census0;
                            return outM;
                        })();
                        out.push(Object.assign({ op: 'route', caseFn }, rMesh));
                        continue;
                    }
                    const r2 = attempt(() => {
                        if (caseFn === 'org') return { teamOk: fx.teamOk, stationOnTeam: fx.stationOnTeam };
                        if (caseFn === 'letter') {
                            const tR = traveler.mintScoped({ from: 'origin', slots: { title: 'warrant' }, scope: { owner: 'team:' + fx.tm.id, visibility: 'scope' } });
                            const rep = carriers.carry(tR, { stations: [
                                { by: fx.station, op: 'inspect' },
                                { by: fx.station, op: 'test', carrier: 'nsc9' },
                                { by: fx.station, op: 'release' },
                            ] });
                            return {
                                routedAll: !!(rep.ok && rep.landed === 3 && rep.stations === 3 && rep.letter && rep.letter.seq === 4),
                                evidence: Array.isArray(rep.route) && rep.route.every((w) => w.verdict === 'landed' && typeof w.seq === 'number' && typeof w.op === 'string'),
                                nsc9Rode: !!(rep.route && rep.route[1] && rep.route[1].carrier === 'nsc9'),
                                walkCert: !!(rep.walk && rep.walk.ok === true && rep.walk.stations === 4 && Array.isArray(rep.walk.gaps) && rep.walk.gaps.length === 0 && Array.isArray(rep.walk.rewrites) && rep.walk.rewrites.length === 0),
                            };
                        }
                        if (caseFn === 'drop') {
                            const tR = traveler.mintScoped({ from: 'origin', slots: { title: 'warrant' }, scope: { owner: 'team:' + fx.tm.id, visibility: 'scope' } });
                            const rep = carriers.carry(tR, { stations: [{ by: fx.station, op: 'inspect' }, { by: fx.station, op: 'test' }, { by: fx.station, op: 'release' }] });
                            const repO = carriers.carry(tR, { stations: [{ by: 'outsider-' + fx.np, op: 'poke' }] });
                            return {
                                letterFounded: !!rep.ok,
                                refusedTyped: !!(repO && !repO.ok && repO.refused && typeof repO.refused.stage === 'number' && typeof repO.refused.code === 'string'),
                                walkBirthOnly: !!(repO && repO.walk && repO.walk.ok === true && repO.walk.walkedTo === 1),
                                walkShorter: !!(rep && rep.walk && repO && repO.walk && rep.walk.stations > repO.walk.stations),
                            };
                        }
                        if (caseFn === 'risk') {
                            const eR = escrow.create({ approvalRequired: ['traveler carry'] });
                            const noAppr = carriers.carry(traveler.mintScoped({ from: 'origin', slots: { title: 'x' }, scope: { owner: 'team:' + fx.tm.id } }), { stations: [{ by: fx.station, privileged: true }] });
                            const appr = traveler.approvalForRoute(eR, 'traveler carry', 'route payload');
                            const withAppr = carriers.carry(traveler.mintScoped({ from: 'origin', slots: { title: 'y' }, scope: { owner: 'team:' + fx.tm.id } }), { stations: [{ by: fx.station, privileged: true, approvalId: appr.approvalId }] });
                            const reburn = escrow.consumeApproval(appr.approvalId, 'traveler carry');
                            return {
                                noApprRefused: noAppr && noAppr.ok === false,
                                approvalMinted: !!(appr && appr.approvalId),
                                withApprOk: !!(withAppr && withAppr.ok === true),
                                burned: !!(reburn && reburn.approved === false),
                            };
                        }
                        if (caseFn === 'stageless') {
                            const tR = traveler.mintScoped({ from: 'origin', slots: { title: 'x' }, scope: { owner: 'team:' + fx.tm.id } });
                            try { carriers.carry(tR, {}); return { caught: 'NONE' }; }
                            catch (e2) { return { caught: e2 && e2.code }; }
                        }
                        if (caseFn === 'forged') {
                            const bad = JSON.parse(JSON.stringify(traveler.mintScoped({ from: 'origin', slots: { title: 'warrant' }, scope: { owner: 'team:' + fx.tm.id } })));
                            bad.slots.title = 'forged';
                            try { carriers.carry(bad, { stations: [{ by: fx.station }] }); return { caught: 'NONE' }; }
                            catch (e2) { return { caught: e2 && e2.code }; }
                        }
                        if (caseFn === 'enterprise') {
                            const tE = traveler.mintScoped({ from: fx.station, slots: { title: 'enterprise-line' }, scope: { owner: 'team:' + fx.tm.id } });
                            const repE = carriers.carry(tE, {
                                template: [{ op: 'mold', part: 'rim' }, { op: 'publish', by: fx.station }],
                                stations: [
                                    { by: fx.station, op: 'mold', part: { name: 'rim', alloy: 'al' } },
                                    { by: fx.station, op: 'publish' },
                                ],
                            });
                            return {
                                composed: !!(repE && repE.ok && repE.built === true),
                                scopeKept: !!(repE && repE.letter && repE.letter.scope && repE.letter.scope.owner === 'team:' + fx.tm.id),
                            };
                        }
                        return { fault: 'unhandled route case' };
                    });
                    out.push(Object.assign({ op: 'route', caseFn }, r2));
                    continue;
                }
                if (o.op === 'template') {
                    // (carriers slice 5; the assembly + template family, pass
                    // 260) The part/sign-off laws on the REAL traveler, the
                    // bill-of-stations on the REAL carry. Fixed now mints;
                    // in-process; the wire carries neutral booleans + caught
                    // codes only.
                    const templateCase = String(o.case);
                    // the native suite grants the in-process write lane BEFORE
                    // the assembly laws (CAP_TO_SCOPE coercion lane without it?)
                    try { sandboxLib('sudo').grant('default', 'write'); } catch (e0) { /* idempotent grant lane */ }
                    const rr = attempt(() => {
                        if (templateCase === 'part') {
                            let tp = traveler.mint({ from: 'frame', slots: { title: 'wheel' } });
                            tp = traveler.advance(tp, { op: 'mold', by: 'st-1', part: { name: 'rim', alloy: 'al-6061' } });
                            tp = traveler.advance(tp, { op: 'cure', by: 'st-2', part: { name: 'hub', bearing: 'sealed' } });
                            return {
                                accumulated: !!(tp.slots.assembly && tp.slots.assembly.rim && tp.slots.assembly.rim.alloy === 'al-6061' && tp.slots.assembly.hub && tp.slots.assembly.hub.bearing === 'sealed'),
                                signoffNames: !!(tp.steps[1] && tp.steps[1].part === 'rim' && tp.steps[2] && tp.steps[2].part === 'hub'),
                            };
                        }
                        if (templateCase === 'appendOnly') {
                            let tp = traveler.mint({ from: 'frame', slots: { title: 'wheel' } });
                            tp = traveler.advance(tp, { op: 'mold', by: 'st-1', part: { name: 'rim', alloy: 'al-6061' } });
                            tp = traveler.advance(tp, { op: 'cure', by: 'st-2', part: { name: 'hub', bearing: 'sealed' } });
                            let redoRefused = false; let redoCode = 'NONE';
                            try { traveler.advance(tp, { op: 'redo', by: 'st-1', part: { name: 'hub', spoil: true } }); } catch (e2) { redoRefused = true; redoCode = e2 && e2.code; }
                            let emptyRefused = false; let emptyCode = 'NONE';
                            try { traveler.advance(tp, { op: 'x', by: 's', part: { name: 'void' } }); } catch (e2) { emptyRefused = true; emptyCode = e2 && e2.code; }
                            return { redoRefused, redoCode, emptyRefused, emptyCode };
                        }
                        if (templateCase === 'addressLaw') {
                            let tp = traveler.mint({ from: 'frame', slots: { title: 'wheel' } });
                            tp = traveler.advance(tp, { op: 'mold', by: 'st-1', part: { name: 'rim', alloy: 'al-6061' } });
                            tp = traveler.advance(tp, { op: 'cure', by: 'st-2', part: { name: 'hub', bearing: 'sealed' } });
                            const evil = JSON.parse(JSON.stringify(tp));
                            evil.slots.assembly.rim.alloy = 'tin';
                            const editedBreaks = traveler.verify(evil).ok === false;
                            const v = traveler.advance(tp, { op: 'inspect', by: 'qa' });
                            let vVerifyOk = null;
                            try { vVerifyOk = traveler.verify(v).ok === true; } catch (e2) { vVerifyOk = 'THREW:' + String(e2 && e2.code); }
                            const plainRides = v.seq === 4 && v.steps[3] && v.steps[3].part === undefined && vVerifyOk === true;
                            return { editedBreaks, plainRides };
                        }
                        if (templateCase === 'line') {
                            const tLine = traveler.mint({ from: 'line-start', slots: { title: 'wheel-0042' } });
                            const repT = carriers.carry(tLine, {
                                template: [
                                    { op: 'mold', part: 'rim' },
                                    { op: 'cure', part: 'hub' },
                                    { op: 'inspect', by: '*', op: '*' },
                                ],
                                stations: [
                                    { by: 'mold-station', op: 'mold', part: { name: 'rim', alloy: 'al-6061' } },
                                    { by: 'cure-station', op: 'cure', part: { name: 'hub', bearing: 'sealed' } },
                                    { by: 'qa-1', op: 'inspect' },
                                ],
                            });
                            return {
                                builds: !!(repT.ok && repT.built === true && repT.assembly && repT.assembly.rim && repT.assembly.hub),
                                partEvidence: !!(repT.route && repT.route[0] && repT.route[0].part === 'rim' && repT.route[1] && repT.route[1].part === 'hub' && repT.route[2] && repT.route[2].part === undefined),
                                walkCert: !!(repT.walk && repT.walk.ok && repT.walk.walkedTo === 4),
                                wildcardAdmits: !!(repT.route && repT.route[2] && repT.route[2].by === 'qa-1'),
                            };
                        }
                        if (templateCase === 'billWalls') {
                            const mc = (mark) => {
                                try { carriers.carry(traveler.mint({ from: 'x', slots: { title: 'y' } }), mark); return 'NONE'; }
                                catch (e2) { return (e2 && e2.code) || 'UNCAUGHT'; }
                            };
                            return {
                                reordered: mc({ template: [{ op: 'mold' }, { op: 'cure' }], stations: [{ by: 'a', op: 'cure' }, { by: 'b', op: 'mold' }] }),
                                truncated: mc({ template: [{ op: 'mold' }], stations: [{ by: 'a', op: 'mold' }, { by: 'b', op: 'cure' }] }),
                                extra: mc({ template: [{ op: 'mold' }, { op: 'cure' }], stations: [{ by: 'a', op: 'mold' }, { by: 'b', op: 'cure' }, { by: 'c', op: 'ship' }] }),
                            };
                        }
                        if (templateCase === 'digital') {
                            const tProj = traveler.mint({ from: 'pm-1', slots: { title: 'project-x' } });
                            const repP = carriers.carry(tProj, {
                                template: [
                                    { op: 'backend', part: 'api' },
                                    { op: 'api', part: 'routes' },
                                    { op: 'framing', part: 'contract' },
                                    { op: 'frontend', part: 'ui' },
                                ],
                                stations: [
                                    { by: 'be-1', op: 'backend', part: { name: 'api', endpoints: 4 } },
                                    { by: 'be-1', op: 'api', part: { name: 'routes', shell: 'express' } },
                                    { by: 'fe-1', op: 'framing', part: { name: 'contract', types: 'ts' } },
                                    { by: 'fe-1', op: 'frontend', part: { name: 'ui', pages: 3 } },
                                ],
                            });
                            return {
                                fourInOrder: !!(repP.ok && repP.built === true && repP.assembly && JSON.stringify(Object.keys(repP.assembly)) === JSON.stringify(['api', 'routes', 'contract', 'ui'])),
                                letterVerifies: !!(repP.letter && traveler.verify(repP.letter).ok),
                            };
                        }
                        if (templateCase === 'unfilled') {
                            const repU = carriers.carry(traveler.mint({ from: 'x', slots: { title: 'y' } }), {
                                template: [{ op: 'mold', part: 'rim' }, { op: 'cure', part: 'hub' }],
                                stations: [{ by: 'a', op: 'mold', part: { name: 'rim', alloy: 'x' } }, { by: 'b', op: 'cure' }],
                            });
                            return {
                                honestVerdict: !!(repU && repU.ok && repU.built === false),
                                namesHub: !!(repU && JSON.stringify(repU.unfilled) === JSON.stringify(['hub'])),
                            };
                        }
                        return { fault: 'unhandled template case' };
                    });
                    out.push(Object.assign({ op: 'template', templateCase }, rr));
                    continue;
                }
                if (o.op === 'codes') {
                    out.push({ op: 'codes', ok: true, tamper: carriers.CODES.TAMPER, shape: carriers.CODES.SHAPE, gap: carriers.CODES.GAP, distinct: carriers.CODES.TAMPER !== carriers.CODES.SHAPE });
                    continue;
                }
                out.push({ op: String(o.op), ok: false, caught: 'unknown op' });
            } catch (e) {
                out.push({ op: String((o && o.op) || '?'), ok: false, caught: 'fault:' + String((e && e.message) || e).slice(0, 120) });
            }
        }
        return jsonRes({ results: out }, 200);
    });

    return harness;
}

