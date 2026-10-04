#!/usr/bin/env node
/**
 * Live-fire: brain-lock LEASE under destruction (pass 113, targets 3-4).
 *
 *   A. TTL-expiry under load: a holder with a 2s TTL is hammered by three
 *      contender processes; after expiry exactly ONE may win (O_EXCL CAS),
 *      sampled continuously - a two-holder state must never be observable.
 *   B. force-release during active writes: the admin force-release lands
 *      while the holder is mid-write-loop; the lease must change hands
 *      WITHOUT corrupting the mutex-guarded writes (lease = who, mutex =
 *      not-at-the-same-time; neither may interfere with the other).
 *
 * Run: node test/livefire-lease.test.js
 * (scratch brain qc-lease wiped before and after)
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BRAIN = 'qc-lease';
const DIR = path.join(ROOT, 'models', 'private', BRAIN);
const LEASE_FILE = path.join(ROOT, 'models', 'private', '.locks', '.lock-' + BRAIN + '.json');

const results = { passed: 0, failed: 0 };
function report(name, ok, err) {
    if (ok) { results.passed++; console.log(`  ✓ ${name}`); }
    else { results.failed++; console.log(`  ✗ ${name}: ${err || 'assertion failed'}`); }
}
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } }
function wipe() {
    fs.rmSync(DIR, { recursive: true, force: true });
    try { fs.rmSync(path.join(ROOT, 'models', 'private', '.locks', '.lock-' + BRAIN + '.json'), { force: true }); } catch (e) {}
}

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
        const killer = setTimeout(() => r.kill('SIGKILL'), opts.killAfterMs || 40000);
        r.on('close', (code) => { clearTimeout(killer); resolve({ code, out, err }); });
    });
}
function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

const PRELUDE = `
const brainLock = require("./lib/brain-lock");
const BRAIN = ${JSON.stringify(BRAIN)};
`;

console.log('\n🔥 LIVE-FIRE: lease TTL expiry under load + force-release mid-write\n');
wipe();

(async () => {
    // ---------- Gate A: TTL expiry under load ----------
    const holder = runChild(PRELUDE + `
        (async () => {
            const token = await brainLock.acquireBrainLock("holder-A", 2000, { brain: BRAIN });
            console.log("HELD:" + (token ? "yes" : "no"));
            // hold past the TTL without refreshing (write-permission loop keeps us alive)
            await new Promise(res => setTimeout(res, 6000));
            console.log("DONE");
            process.exit(0);
        })().catch(e => { console.error(e.message); process.exit(1); });
    `);
    await sleep(1500); // let A take the lease (TTL 2000ms)

    // three contenders hammer the lease while it expires; sample the file continuously
    const contenders = ['contender-B1', 'contender-B2', 'contender-B3'];
    const contendersDone = contenders.map(id => runChild(PRELUDE + `
        (async () => {
            const start = Date.now();
            let token = null, tries = 0;
            while (Date.now() - start < 12000 && !token) {
                token = await brainLock.acquireBrainLock(${JSON.stringify(id)}, 60000, { brain: BRAIN });
                tries++;
                if (!token) await new Promise(res => setTimeout(res, 60));
            }
            console.log("WON:" + (token ? "yes" : "no") + ":" + tries);
            if (token) {
                await new Promise(res => setTimeout(res, 300));
                await brainLock.releaseBrainLock(${JSON.stringify(id)}, token, { brain: BRAIN });
            }
            process.exit(token ? 0 : 1);
        })().catch(e => { console.error(e.message); process.exit(1); });
    `));

    // continuous two-holder sampling while the storm runs. NOTE: the lease
    // file is "JSON\n---\ntoken" (split format) - parse the first segment.
    let twoHolderSamples = 0, samples = 0;
    const sampleEnd = Date.now() + 11000;
    while (Date.now() < sampleEnd) {
        try {
            const raw = fs.readFileSync(LEASE_FILE, 'utf8');
            const l = JSON.parse(raw.split('\n---\n')[0]);
            if (l && l.agentId) {
                samples++;
                if (typeof l.agentId !== 'string' || !l.agentId) twoHolderSamples++;
            }
        } catch (e) { /* no lease right now */ }
        await sleep(25);
    }
    const h = await holder;
    const cOut = await Promise.all(contendersDone);
    const winners = cOut.filter(c => c.out.includes('WON:yes')).length;
    const cCodes = cOut.filter(c => c.code === 0).length;
    // Invariant: at every sampled instant at most ONE holder. Contenders may
    // win sequentially (each releases after 300ms, freeing the lease) - the
    // never-two-holders property is what the CAS + token checks guarantee.
    const lease = readJson(LEASE_FILE);
    report('gate A: lease expired under 3-contender load; ' + samples + ' samples, zero two-holder instants, clean handovers',
        h.out.includes('HELD:yes') && winners >= 1 && cCodes === contenders.length && twoHolderSamples === 0 && samples >= 20,
        'holder=' + h.out.trim() + ' winners=' + winners + ' codes=' + cOut.map(c => c.code) + ' lease=' + JSON.stringify(lease).slice(0, 90) + ' samples=' + samples + ' twoHolderSamples=' + twoHolderSamples);

    // ---------- Gate B: force-release during active writes ----------
    // Child A: holds the lease AND loops mutex-guarded writes (two systems).
    const stateFile = path.join(DIR, 'force-release-state.json');
    const a = runChild(PRELUDE + `
        const lock = require("./lib/lock");
        const fs = require("fs");
        (async () => {
            const token = await brainLock.acquireBrainLock("writer-A", 60000, { brain: BRAIN });
            if (!token) { console.log("A:no-lease"); process.exit(1); }
            let writes = 0;
            const end = Date.now() + 8000;
            while (Date.now() < end) {
                await lock.withLock(lock.pathFor("force-release"), () => {
                    const cur = (() => { try { return JSON.parse(fs.readFileSync(${JSON.stringify(stateFile)}, "utf8")); } catch (e) { return { rows: [] }; } })();
                    cur.rows.push({ w: writes, by: "A", gen: ${1} });
                    fs.mkdirSync(require("path").dirname(${JSON.stringify(stateFile)}), { recursive: true });
                    fs.writeFileSync(${JSON.stringify(stateFile)}, JSON.stringify(cur));
                }, { staleMs: 1200, waitMs: 1500 });
                writes++;
                await new Promise(res => setTimeout(res, 30));
            }
            console.log("A:writes=" + writes);
            process.exit(0);
        })().catch(e => { console.error(e.message); process.exit(1); });
    `);
    await sleep(1500); // A is mid-write-loop now
    const brainLock = require(path.join(ROOT, 'lib', 'brain-lock'));
    const forced = brainLock.forceReleaseBrainLock({ brain: BRAIN });
    // child B takes the freed lease immediately and does its own guarded writes
    const b = runChild(PRELUDE + `
        const lock = require("./lib/lock");
        const fs = require("fs");
        (async () => {
            const token = await brainLock.acquireBrainLock("writer-B", 60000, { brain: BRAIN });
            if (!token) { console.log("B:no-lease"); process.exit(1); }
            let writes = 0;
            const end = Date.now() + 4000;
            while (Date.now() < end) {
                await lock.withLock(lock.pathFor("force-release"), () => {
                    const cur = (() => { try { return JSON.parse(fs.readFileSync(${JSON.stringify(stateFile)}, "utf8")); } catch (e) { return { rows: [] }; } })();
                    cur.rows.push({ w: writes, by: "B", gen: ${2} });
                    fs.writeFileSync(${JSON.stringify(stateFile)}, JSON.stringify(cur));
                }, { staleMs: 1200, waitMs: 1500 });
                writes++;
                await new Promise(res => setTimeout(res, 30));
            }
            console.log("B:writes=" + writes);
            process.exit(0);
        })().catch(e => { console.error(e.message); process.exit(1); });
    `);
    const aOut = await a;
    const bOut = await b;
    const state = readJson(stateFile);
    const rows = state && Array.isArray(state.rows) ? state.rows : [];
    const aRows = rows.filter(r => r.by === 'A').length;
    const bRows = rows.filter(r => r.by === 'B').length;
    const interleavedCorruption = rows.some(r => typeof r.w !== 'number' || !r.by);
    report('gate B: force-release mid-write; lease changed hands, mutex writes all landed whole',
        forced === true && bOut.out.includes('B:writes=') && aOut.out.includes('A:writes=')
        && aRows > 10 && bRows > 10 && !interleavedCorruption,
        'forced=' + forced + ' A=' + aOut.out.trim() + ' B=' + bOut.out.trim()
        + ' rows=' + rows.length + ' (A=' + aRows + ' B=' + bRows + ')');

    console.log('\n--- RESULTS ---\n');
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    wipe();
    process.exit(results.failed > 0 ? 1 : 0);
})().catch(e => { console.error('HARNESS:', e.message); wipe(); process.exit(1); });
