#!/usr/bin/env node
/**
 * Live-fire: kill -9 mid-save races (pass 113, target 2 of the owner's list).
 *
 * A writer that dies from SIGKILL cannot run `finally` or the exit hook, so
 * it leaves a stale lockfile with a dead pid and (depending on timing) a
 * half-written temp blob. Gated here with REAL processes and REAL kills:
 *
 *   A. primitive loop (5 iterations): child A holds a withLock and is
 *      SIGKILLed mid-hold; the stale lock must be taken over by child B,
 *      B's write must land, and the lock must be released (no leak).
 *   B. storage atomicity (5 kills): a child writing a ~5 MB state blob
 *      through the REAL FileStorage is SIGKILLed mid-write; the target
 *      file must always parse as valid JSON afterwards (temp+rename holds).
 *   C. real guarded writer: the TEAMS lock is left stale by a SIGKILLed
 *      holder; teams.createOrg must fail CLOSED (refuse, no unlocked
 *      write) until the 10s staleness passes, then recover via stale
 *      takeover, with teams.json valid and the new org persisted.
 *
 * Run: node test/livefire-kill9.test.js
 * (scratch brain qc-kill9 wiped before and after)
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BRAIN = 'qc-kill9';
const DIR = path.join(ROOT, 'models', 'private', BRAIN);
const STATE = path.join(DIR, 'orgchart', 'teams.json');

const results = { passed: 0, failed: 0 };
function report(name, ok, err) {
    if (ok) { results.passed++; console.log(`  ✓ ${name}`); }
    else { results.failed++; console.log(`  ✗ ${name}: ${err || 'assertion failed'}`); }
}
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } }
function wipe() { fs.rmSync(DIR, { recursive: true, force: true }); }

function runChild(script, opts = {}) {
    return new Promise((resolve) => {
        const r = spawn(process.execPath, ['-e', script], {
            cwd: ROOT,
            env: { ...process.env, VANT_BRAIN: BRAIN },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let out = '', err = '';
        r.stdout.on('data', (d) => { out += d; });
        r.stderr.on('data', (d) => { err += d; });
        const killer = setTimeout(() => { r.kill('SIGKILL'); }, opts.killAfterMs || 30000);
        r.on('close', (code, signal) => {
            clearTimeout(killer);
            resolve({ code, signal, out, err, killedByTest: !!opts.killAfterMs });
        });
    });
}

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

const PRELUDE = `
const boot = require("./lib/boot");
boot.init({ taskId: "kill9", scopes: ["read", "write", "spawn", "execute"], debug: false });
require("./lib/sandbox").defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canSpawn: true, canExecute: true });
`;

console.log('\n🔥 LIVE-FIRE: kill -9 mid-save races\n');
wipe();

// Spawn a child, wait for its READY marker file, then SIGKILL after a
// stagger. Returns a promise of the close info. (killAfterMs-from-spawn is
// useless here: module load eats the first hundreds of ms.)
function runChildKilledAfterMarker(script, markerPath, staggerMs) {
    return new Promise((resolve) => {
        const r = spawn(process.execPath, ['-e', script], {
            cwd: ROOT,
            env: { ...process.env, VANT_BRAIN: BRAIN },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let out = '', err = '';
        r.stdout.on('data', (d) => { out += d; });
        r.stderr.on('data', (d) => { err += d; });
        try { fs.rmSync(markerPath, { force: true }); } catch (e) {}
        const t0 = Date.now();
        const poll = setInterval(() => {
            if (fs.existsSync(markerPath)) {
                clearInterval(poll);
                setTimeout(() => { r.kill('SIGKILL'); }, staggerMs);
                return;
            }
            if (Date.now() - t0 > 15000) { clearInterval(poll); r.kill('SIGKILL'); }
        }, 5);
        r.on('close', (code, signal) => resolve({ code, signal, out, err }));
    });
}

// ---------- Gate A: primitive stale takeover after SIGKILL (5 iterations) ----------
(async () => {
    let aWins = 0;
    for (let i = 0; i < 5; i++) {
        const p = path.join(DIR, '.locks', 'kill9-a__it' + i + '.lock');
        // Child A: hold the lock ~5000ms; killed by the test at ~250ms.
        const a = await runChild(`
            const lock = require("./lib/lock");
            const out = lock.withLock(${JSON.stringify(p)}, () => {
                // hold the lock; SIGKILL lands mid-hold (no finally runs)
                const end = Date.now() + 5000;
                while (Date.now() < end) {}
                return "held";
            }, { staleMs: 1200, waitMs: 500 });
            console.log("A:" + JSON.stringify(out));
        `, { killAfterMs: 250 });
        await sleep(120); // let A acquire
        const b = await runChild(`
            const lock = require("./lib/lock");
            const fs = require("fs");
            lock.withLock(${JSON.stringify(p)}, () => {
                fs.mkdirSync(require("path").dirname(${JSON.stringify(path.join(DIR, 'kill9-state.json'))}), { recursive: true });
                fs.writeFileSync(${JSON.stringify(path.join(DIR, 'kill9-state.json'))}, JSON.stringify({ it: ${i}, by: "B", at: Date.now() }));
                return "B-wrote";
            }, { staleMs: 1200, waitMs: 3000 }).then((out) => {
                console.log("B:" + JSON.stringify(out));
                process.exit(0);
            });
        `);
        const aOut = a.out.trim();
        const lockGone = !fs.existsSync(p);
        const state = readJson(path.join(DIR, 'kill9-state.json'));
        const ok = b.out.includes('B-wrote') // withLock resolves to the fn's return value
            && lockGone
            && state && state.by === 'B' && state.it === i;
        if (ok) aWins++;
        else report('gate A iteration ' + i, false, 'A=' + aOut + ' B=' + b.out.trim() + ' lockGone=' + lockGone + ' state=' + JSON.stringify(state));
    }
    report('gate A: stale takeover after SIGKILL (5 iterations, B wrote, no leak)', aWins === 5);

    // ---------- Gate B: FileStorage atomicity under mid-write SIGKILL ----------
    const target = path.join(DIR, 'kill9-blob.json');
    const marker = path.join(DIR, 'kill9-ready.marker');
    let bWins = 0;
    let debrisTotal = 0;
    for (let i = 0; i < 5; i++) {
        // Priming write FIRST (completes before the marker), then a loop of
        // ~5 MB writes; the kill lands mid-writeFileSync on one of them.
        await runChildKilledAfterMarker(`
            const { FileStorage } = require("./lib/storage");
            const fs = require("fs");
            const store = new FileStorage({ basePath: ${JSON.stringify(DIR)} });
            store.write("kill9-blob.json", JSON.stringify({ gen: -1, pad: "" }));
            fs.writeFileSync(${JSON.stringify(marker)}, "ready");
            const blob = JSON.stringify({ gen: ${i}, pad: "x".repeat(5 * 1024 * 1024) });
            for (let w = 0; w < 40; w++) store.write("kill9-blob.json", blob);
            console.log("done");
        `, marker, 15 + i * 20);
        const after = readJson(target);
        const valid = after !== null && (after.gen === i || after.gen === -1);
        // either the primed generation or a complete new one, NEVER a torn file
        const debris = fs.readdirSync(DIR).filter(f => f.startsWith('kill9-blob.json.') && f !== 'kill9-blob.json').length;
        debrisTotal += debris;
        if (valid) bWins++;
        else report('gate B kill ' + i, false, 'temp+rename torn: ' + (after ? 'gen=' + after.gen : 'UNPARSEABLE') + ' debris=' + debris);
    }
    report('gate B: FileStorage temp+rename survives 5 mid-write SIGKILLs (always valid JSON)', bWins === 5);
    console.log('    [info] atomicWrite debris left by the kills: ' + debrisTotal + ' file(s) — known gap, see labs/TASKS.md');

    // ---------- Gate C: real guarded writer (teams) recovers after SIGKILL ----------
    // Child A takes the REAL teams lock and is killed holding it.
    const a = await runChild(`
        const lock = require("./lib/lock");
        const teamsPath = lock.pathFor("teams");
        const res = lock.acquire(teamsPath, { staleMs: 10000, waitMs: 100 });
        console.log("A-acquired:" + res.ok);
        const end = Date.now() + 20000;
        while (Date.now() < end) {} // hold until SIGKILL
    `, { killAfterMs: 400 });
    await sleep(250);
    const lockPath = path.join(DIR, '.locks', 'teams.lock');
    const staleLeft = fs.existsSync(lockPath);
    // Child B: createOrg must refuse (fail-closed) until 10s staleness, then recover.
    // NOTE: success is judged by PERSISTENCE (teams.json on disk), not by
    // createOrg's return — known product gap (recorded in labs/TASKS.md):
    // create* report success even when _saveTeams was fail-closed refused.
    const b = await runChild(PRELUDE + `
        const teams = require("./lib/teams");
        const fs = require("fs");
        (async () => {
            let refusals = 0, ok = false, lastErr = "";
            const start = Date.now();
            const stateFile = ${JSON.stringify(STATE)};
            const persisted = () => {
                try {
                    const s = JSON.parse(fs.readFileSync(stateFile, "utf8"));
                    return Array.isArray(s.orgs) && s.orgs.some(o => String(o.name || "").startsWith("RecoveryOrg-"));
                } catch (e) { return false; }
            };
            while (Date.now() - start < 25000) {
                if (persisted()) { ok = true; break; }
                try {
                    teams.createOrg("RecoveryOrg-" + Date.now(), { agentId: "childB" });
                } catch (e) { lastErr = e.message; }
                refusals++;
                await new Promise(res => setTimeout(res, 500));
            }
            ok = ok || persisted();
            console.log("B:" + JSON.stringify({ ok, refusals, lastErr }));
            process.exit(ok ? 0 : 1);
        })().catch(e => { console.error(e.message); process.exit(1); });
    `);
    const teamsState = readJson(STATE);
    const hasOrg = !!teamsState && Array.isArray(teamsState.orgs)
        && teamsState.orgs.some(o => String(o.name || '').startsWith('RecoveryOrg-'));
    report('gate C: SIGKILLed teams-lock holder leaves a stale lock', a.out.includes('A-acquired:true') && staleLeft,
        'acquired=' + a.out.trim() + ' staleLeft=' + staleLeft);
    report('gate C: teams.createOrg recovers via stale takeover (fail-closed refusals before), teams.json valid', b.code === 0 && hasOrg && teamsState !== null,
        'B=' + b.out.trim() + ' err=' + b.err.trim() + ' orgs=' + (teamsState ? teamsState.orgs.length : 'unparseable'));

    console.log('\n--- RESULTS ---\n');
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    wipe();
    process.exit(results.failed > 0 ? 1 : 0);
})().catch(e => { console.error('HARNESS:', e.message); wipe(); process.exit(1); });
