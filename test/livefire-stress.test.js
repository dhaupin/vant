#!/usr/bin/env node
/**
 * Live-fire: CAS two-holder stress at scale + symlink replant attacks
 * (pass 113, targets 5-6 of the owner's list).
 *
 *   A. CAS at scale (12 iterations): a STALE mutex lock (backdated mtime)
 *      is raced by two real children; both must write their row under the
 *      lock (serialized: re-read + append), the state must never tear, and
 *      no iteration may end with the lock still held (leak).
 *   B. Lease CAS at scale (8 iterations): a stale lease is raced by three
 *      real children that HOLD what they win; exactly one may end up the
 *      holder (O_EXCL create-or-fail is the arbiter).
 *   C. Symlink replant (mutex): an attacker repeatedly swaps the lock path
 *      for a symlink to a victim file while a writer loops 30 guarded ops;
 *      the sweep must unlink the LINK (never the target), the victim must
 *      survive byte-for-byte, and the writer must complete.
 *   D. Symlink replant (lease): same attack at the lease path during
 *      acquire storms; the takeover sweep must remove the link and the
 *      victim must survive.
 *
 * Run: node test/livefire-stress.test.js
 * (scratch brain qc-stress wiped before and after)
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BRAIN = 'qc-stress';
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
    try { fs.unlinkSync(LEASE_FILE); } catch (e) {}
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

/** Plant a lock file with a genuinely backdated mtime (real stale state). */
function plantStale(p, pid, ageMs) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({ pid: pid || 999999, at: Date.now() - ageMs }));
    const old = new Date(Date.now() - ageMs);
    fs.utimesSync(p, old, old);
}

const PRELUDE = `
const lock = require("./lib/lock");
const brainLock = require("./lib/brain-lock");
const fs = require("fs");
const BRAIN = ${JSON.stringify(BRAIN)};
`;

console.log('\n🔥 LIVE-FIRE: CAS stress at scale + symlink replant\n');
wipe();

(async () => {
    // ---------- Gate A: mutex CAS stress, 12 iterations x 2 racers ----------
    const stateFile = path.join(DIR, 'stress-state.json');
    let aFails = 0;
    for (let i = 0; i < 12; i++) {
        plantStale(path.join(DIR, '.locks', 'stress__it.lock'), 888888 + i, 4000);
        const racers = await Promise.all(['R1', 'R2'].map(tag => runChild(PRELUDE + `
            lock.withLock(lock.pathFor("stress", "it"), () => {
                const cur = (() => { try { return JSON.parse(fs.readFileSync(${JSON.stringify(stateFile)}, "utf8")); } catch (e) { return { rows: [] }; } })();
                cur.rows.push({ it: ${i}, by: ${JSON.stringify(tag)} });
                fs.writeFileSync(${JSON.stringify(stateFile)}, JSON.stringify(cur));
                return "wrote";
            }, { staleMs: 300, waitMs: 2500 }).then((out) => {
                console.log(${JSON.stringify(tag)} + ":" + JSON.stringify(out));
            });
        `)));
        const bothWrote = racers.every(r => r.out.includes('wrote'));
        const state = readJson(stateFile);
        const itRows = state && state.rows ? state.rows.filter(r => r.it === i) : [];
        const bothRows = itRows.length === 2 && itRows.some(r => r.by === 'R1') && itRows.some(r => r.by === 'R2');
        const lockGone = !fs.existsSync(path.join(DIR, '.locks', 'stress__it.lock'));
        if (!(bothWrote && bothRows && lockGone)) {
            aFails++;
            report('gate A iteration ' + i, false, 'bothWrote=' + bothWrote + ' itRows=' + JSON.stringify(itRows) + ' lockGone=' + lockGone);
        }
    }
    report('gate A: 12x two-racer stale-takeover CAS — all rows serialized, zero leaks, zero lost updates', aFails === 0);

    // ---------- Gate B: lease CAS at scale, 8 iterations x 3 racers ----------
    let bFails = 0;
    for (let i = 0; i < 8; i++) {
        plantStale(LEASE_FILE, 777777 + i, 6000);
        const ids = ['L1-' + i, 'L2-' + i, 'L3-' + i];
        const racers = await Promise.all(ids.map(id => runChild(PRELUDE + `
            (async () => {
                const token = await brainLock.acquireBrainLock(${JSON.stringify(id)}, 30000, { brain: BRAIN });
                console.log(${JSON.stringify(id)} + ":" + (token ? "won" : "lost"));
                // hold what we win for the whole iteration (no release):
                // a second winner would prove the CAS broke.
                await new Promise(res => setTimeout(res, 2500));
                process.exit(token ? 0 : 1);
            })().catch(e => { console.error(e.message); process.exit(1); });
        `)));
        const wins = racers.filter(r => r.out.includes(':won')).length;
        const lease = (() => { try { return JSON.parse(fs.readFileSync(LEASE_FILE, 'utf8').split('\n---\n')[0]); } catch (e) { return null; } })();
        const holderMatches = lease && ids.includes(lease.agentId);
        if (wins !== 1 || !holderMatches) {
            bFails++;
            report('gate B iteration ' + i, false, 'wins=' + wins + ' lease=' + JSON.stringify(lease).slice(0, 90));
        }
    }
    report('gate B: 8x three-racer lease CAS — exactly one holder per iteration', bFails === 0);

    // ---------- Gate C: symlink replant attack (mutex) ----------
    const victim = path.join(DIR, 'victim-mutex.txt');
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(victim, 'VICTIM-MUTEX-CONTENT-DO-NOT-DELETE');
    const mutexPath = path.join(DIR, '.locks', 'replant.lock');
    const c = await runChild(PRELUDE + `
        const path = require("path");
        // attacker: keep the lock path a symlink to the victim at every instant
        const iv = setInterval(() => {
            try {
                try { fs.unlinkSync(${JSON.stringify(mutexPath)}); } catch (e) {}
                fs.symlinkSync(${JSON.stringify(victim)}, ${JSON.stringify(mutexPath)});
            } catch (e) {}
        }, 5);
        // writer: 30 guarded ops
        (async () => {
            let ops = 0;
            for (let k = 0; k < 30; k++) {
                await lock.withLock(${JSON.stringify(mutexPath)}, () => {
                    ops++;
                }, { staleMs: 200, waitMs: 800 });
                await new Promise(res => setTimeout(res, 10));
            }
            clearInterval(iv);
            console.log("OPS:" + ops);
            process.exit(0);
        })().catch(e => { console.error(e.message); process.exit(1); });
    `);
    const victimSurvived = fs.existsSync(victim) && fs.readFileSync(victim, 'utf8') === 'VICTIM-MUTEX-CONTENT-DO-NOT-DELETE';
    const cOps = (c.out.match(/OPS:(\d+)/) || [])[1];
    report('gate C: mutex symlink replant — victim intact, writer completed (sweep unlinks the link, not the target)',
        c.code === 0 && victimSurvived && Number(cOps) >= 30,
        'code=' + c.code + ' ops=' + cOps + ' victimSurvived=' + victimSurvived + ' err=' + c.err.slice(0, 120));

    // ---------- Gate D: symlink replant attack (lease) ----------
    const victim2 = path.join(ROOT, 'models', 'private', 'victim-lease.txt');
    fs.writeFileSync(victim2, 'VICTIM-LEASE-CONTENT-DO-NOT-DELETE');
    const d = await runChild(PRELUDE + `
        const iv = setInterval(() => {
            try {
                try { fs.unlinkSync(${JSON.stringify(LEASE_FILE)}); } catch (e) {}
                fs.symlinkSync(${JSON.stringify(victim2)}, ${JSON.stringify(LEASE_FILE)});
            } catch (e) {}
        }, 5);
        (async () => {
            let won = false, tries = 0;
            const start = Date.now();
            while (Date.now() - start < 8000 && !won) {
                const token = await brainLock.acquireBrainLock("replanter", 30000, { brain: BRAIN });
                tries++;
                if (token) won = true;
                else await new Promise(res => setTimeout(res, 50));
            }
            clearInterval(iv);
            console.log("LEASE-WON:" + won + ":" + tries);
            process.exit(0);
        })().catch(e => { console.error(e.message); process.exit(1); });
    `);
    const victim2Survived = fs.existsSync(victim2) && fs.readFileSync(victim2, 'utf8') === 'VICTIM-LEASE-CONTENT-DO-NOT-DELETE';
    report('gate D: lease symlink replant — sweep removes the link, victim intact, acquire still succeeds',
        d.out.includes('LEASE-WON:true') && victim2Survived,
        'out=' + d.out.trim() + ' victimSurvived=' + victim2Survived);
    try { fs.unlinkSync(victim2); } catch (e) {}

    console.log('\n--- RESULTS ---\n');
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    wipe();
    process.exit(results.failed > 0 ? 1 : 0);
})().catch(e => { console.error('HARNESS:', e.message); wipe(); process.exit(1); });
