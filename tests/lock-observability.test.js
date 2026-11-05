#!/usr/bin/env node
/**
 * Lock observability + debris janitor gates (pass 117)
 *
 * Post-PRD targets #2 and #3.
 *
 * #2 — Lock observability: pass-116 proved the cost of an invisible
 * fail-closed refusal (it existed only as a stderr line until a live probe
 * tripped over it). lib/lock.stats() and lib/brain-lock.leaseStats() make
 * contention, takeovers, refusals and hold times queryable facts, surfaced
 * through health.getStackHealthStatus() and MCP vant_lock stats. Gated here
 * with DELTAS: counters are process-global by design and have NO reset API
 * (a resettable counter can lie about the past).
 *
 * #3 — Debris janitor: the passive atomicWrite sweep (pass 115) reclaims a
 * target's temps only when that target is written again; a file never
 * written again keeps its SIGKILL debris forever. storage.sweepTemps() walks
 * a root recursively for `<name>.<ext>.<uuid>` files older than the age
 * guard. Health reports (dryRun); `vant health --sweep` removes (operator
 * intent). Gated here: dryRun finds aged debris (incl. nested), never fresh
 * temps or bystanders, never follows symlinks; the real run removes exactly
 * the aged ones.
 *
 * (scratch brain qc-lockobs, wiped before and after)
 */

process.env.VANT_BRAIN = 'qc-lockobs';
const os = require('os');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BRAIN = path.join(ROOT, 'models', 'private', 'qc-lockobs');
fs.rmSync(BRAIN, { recursive: true, force: true });

require(path.join(ROOT, 'lib', 'sandbox')).defaultSandbox.setCapabilities({
    canRead: true, canWrite: true, canNetwork: true, canTrade: true, canSpawn: true
});

const lock = require(path.join(ROOT, 'lib', 'lock'));
const results = { passed: 0, failed: 0 };
function report(name, ok, err) {
    if (ok) { results.passed++; console.log(`  ✓ ${name}`); }
    else { results.failed++; console.log(`  ✗ ${name}: ${err || 'assertion failed'}`); }
}
function delta(before, after, field) { return after[field] - before[field]; }

console.log('\n📊 LOCK OBSERVABILITY + DEBRIS JANITOR (pass 117)\n');

(async () => {
    // ============================================
    // GATE A — mutex counters (lib/lock.stats)
    // ============================================
    try {
        const pA = lock.pathFor('obs-a');
        let s0 = lock.stats();
        const r = await lock.withLock(pA, () => 'ran');
        let s1 = lock.stats();
        report('gate A: clean withLock → acquires/bodiesRun/releases counted, result passed through',
            r === 'ran'
            && delta(s0, s1, 'acquires') === 1
            && delta(s0, s1, 'bodiesRun') === 1
            && delta(s0, s1, 'releases') === 1
            && delta(s0, s1, 'aborted') === 0
            && s1.holdMsTotal >= s0.holdMsTotal,
            `r=${r} d(acquires)=${delta(s0, s1, 'acquires')} d(bodies)=${delta(s0, s1, 'bodiesRun')} d(releases)=${delta(s0, s1, 'releases')}`);

        // Held: a live peer (this process) holds the lock → fail-closed abort
        const held = lock.acquire(lock.pathFor('obs-b'), { staleMs: 60000, waitMs: 50 });
        s0 = lock.stats();
        const refused = await lock.withLock(lock.pathFor('obs-b'), () => 'never', { waitMs: 50 });
        s1 = lock.stats();
        report('gate A: contended withLock → refused (held) + aborted counted, body never ran',
            held.ok && refused && refused.aborted === true
            && delta(s0, s1, 'held') === 1
            && delta(s0, s1, 'aborted') === 1
            && delta(s0, s1, 'bodiesRun') === 0,
            `refused=${JSON.stringify(refused)} d(held)=${delta(s0, s1, 'held')} d(aborted)=${delta(s0, s1, 'aborted')}`);

        // Body error: counted AND rethrown after release (existing contract)
        s0 = lock.stats();
        let caught = null;
        try { await lock.withLock(pA, () => { throw new Error('boom'); }); } catch (e) { caught = e; }
        s1 = lock.stats();
        report('gate A: body error → bodyErrors counted, error rethrown, lock released',
            caught && caught.message === 'boom'
            && delta(s0, s1, 'bodyErrors') === 1
            && delta(s0, s1, 'bodiesRun') === 1
            && delta(s0, s1, 'releases') === 1,
            `caught=${caught && caught.message} d(bodyErrors)=${delta(s0, s1, 'bodyErrors')}`);

        // Stale takeover: plant an aged lockfile, acquire takes it over
        const pStale = lock.pathFor('obs-stale');
        fs.mkdirSync(path.dirname(pStale), { recursive: true });
        fs.writeFileSync(pStale, JSON.stringify({ pid: 999999, at: 0 }));
        const old = new Date(Date.now() - 60000);
        fs.utimesSync(pStale, old, old);
        s0 = lock.stats();
        const took = lock.acquire(pStale, { staleMs: 5000, waitMs: 50 });
        s1 = lock.stats();
        report('gate A: stale takeover → takeovers counted, acquire succeeds',
            took.ok && delta(s0, s1, 'takeovers') === 1 && delta(s0, s1, 'acquires') === 1,
            `took=${JSON.stringify(took)} d(takeovers)=${delta(s0, s1, 'takeovers')}`);
        lock.release(pStale);

        // Unavailable: a FILE at the lock root makes acquire refuse instantly
        const brainRoot = path.join(BRAIN, '.locks');
        fs.rmSync(brainRoot, { recursive: true, force: true });
        fs.writeFileSync(brainRoot, 'not a dir');
        s0 = lock.stats();
        const un = lock.acquire(lock.pathFor('obs-un'), { waitMs: 10 });
        s1 = lock.stats();
        fs.rmSync(brainRoot, { recursive: true, force: true });
        report('gate A: broken root → unavailable counted',
            !un.ok && un.reason === 'unavailable' && delta(s0, s1, 'unavailable') === 1,
            `un=${JSON.stringify(un)} d(unavailable)=${delta(s0, s1, 'unavailable')}`);

        // withLockSync participates in the same counters (pass-115 twin)
        s0 = lock.stats();
        const syncOut = lock.withLockSync(pA, () => 'sync-ran');
        s1 = lock.stats();
        report('gate A: withLockSync counted (bodiesRun/releases, sync body)',
            syncOut === 'sync-ran' && delta(s0, s1, 'bodiesRun') === 1 && delta(s0, s1, 'releases') === 1,
            `out=${syncOut}`);

        // heldNow reflects reality
        const h = lock.acquire(lock.pathFor('obs-now'), { waitMs: 10 });
        const nowHeld = lock.stats().heldNow;
        lock.release(lock.pathFor('obs-now'));
        const afterHeld = lock.stats().heldNow;
        report('gate A: heldNow tracks live holds (up while held, down after release)',
            h.ok && nowHeld >= 1 && afterHeld === nowHeld - 1,
            `nowHeld=${nowHeld} afterHeld=${afterHeld}`);

        // (pass 118, target #5) Spin hygiene: a contended wait must SLEEP,
        // not burn a core. The old 25ms busy-wait bursts cost ~wallMs of CPU
        // (teams' waitMs=8000 → 8s of full burn); the sleep-poll costs almost
        // nothing. Measure CPU across a 400ms contended wait.
        const heldCpu = lock.acquire(lock.pathFor('obs-cpu'), { waitMs: 10 });
        const t0 = Date.now();
        const c0 = process.cpuUsage();
        const refusedCpu = lock.acquire(lock.pathFor('obs-cpu'), { staleMs: 60000, waitMs: 400 });
        const c1 = process.cpuUsage();
        const wall = Date.now() - t0;
        lock.release(lock.pathFor('obs-cpu'));
        const cpuMs = (c1.user - c0.user + c1.system - c0.system) / 1000;
        report('gate E: 400ms contended wait sleeps (CPU << wall) and still waits the full window',
            heldCpu.ok && refusedCpu.reason === 'held' && wall >= 350 && cpuMs < 200,
            `wall=${wall}ms cpu=${cpuMs.toFixed(1)}ms refused=${refusedCpu.reason}`);
    } catch (e) {
        report('gate A (mutex counters)', false, e.message);
    }

    // ============================================
    // GATE B — lease counters (lib/brain-lock.leaseStats)
    // ============================================
    try {
        const brainLock = require(path.join(ROOT, 'lib', 'brain-lock'));
        let l0 = brainLock.leaseStats();
        const token = await brainLock.acquireBrainLock('obs-agent');
        let l1 = brainLock.leaseStats();
        report('gate B: fresh grant counted',
            typeof token === 'string' && token.length > 0 && delta(l0, l1, 'granted') === 1,
            `token=${!!token} d(granted)=${delta(l0, l1, 'granted')}`);

        l0 = brainLock.leaseStats();
        const token2 = await brainLock.acquireBrainLock('obs-agent'); // same agent → refresh
        l1 = brainLock.leaseStats();
        report('gate B: same-agent re-acquire counted as refresh (stable token)',
            token2 === token && delta(l0, l1, 'refreshed') === 1 && delta(l0, l1, 'granted') === 0,
            `stable=${token2 === token} d(refreshed)=${delta(l0, l1, 'refreshed')}`);

        l0 = brainLock.leaseStats();
        const rel = await brainLock.releaseBrainLock('obs-agent', token);
        l1 = brainLock.leaseStats();
        report('gate B: owner release counted',
            rel.success === true && delta(l0, l1, 'released') === 1,
            `rel=${JSON.stringify(rel)}`);

        l0 = brainLock.leaseStats();
        const bad = await brainLock.releaseBrainLock('obs-agent', 'wrong-token');
        l1 = brainLock.leaseStats();
        report('gate B: denied release counted (no lock to release)',
            bad.success === false && delta(l0, l1, 'releaseDenied') === 1,
            `bad=${JSON.stringify(bad)}`);

        const token3 = await brainLock.acquireBrainLock('obs-agent2');
        l0 = brainLock.leaseStats();
        const forced = brainLock.forceReleaseBrainLock();
        l1 = brainLock.leaseStats();
        report('gate B: force release counted',
            typeof token3 === 'string' && forced === true && delta(l0, l1, 'forced') === 1,
            `forced=${forced} d(forced)=${delta(l0, l1, 'forced')}`);

        const s = brainLock.leaseStats();
        report('gate B: every counter is a number (denied is wired; exercised under sustained contention)',
            ['granted', 'refreshed', 'denied', 'released', 'releaseDenied', 'forced']
                .every(k => typeof s[k] === 'number'),
            JSON.stringify(s));
    } catch (e) {
        report('gate B (lease counters)', false, e.message);
    }

    // ============================================
    // GATE C — debris janitor (storage.sweepTemps)
    // ============================================
    try {
        const storage = require(path.join(ROOT, 'lib', 'storage'));
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-janitor-'));
        const aged = path.join(tmp, 'teams.json.11111111-2222-3333-4444-555555555555');
        const fresh = path.join(tmp, 'teams.json.aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
        const nested = path.join(tmp, 'orgchart', 'state.json.99999999-8888-7777-6666-555555555555');
        const bystander = path.join(tmp, 'notes.md');
        fs.writeFileSync(aged, '{"gen":1}');
        fs.writeFileSync(fresh, '{"gen":2}');
        fs.mkdirSync(path.dirname(nested), { recursive: true });
        fs.writeFileSync(nested, '{"gen":3}');
        fs.writeFileSync(bystander, 'keep me');
        const oldT = new Date(Date.now() - 90000);
        fs.utimesSync(aged, oldT, oldT);
        fs.utimesSync(nested, oldT, oldT);

        // A symlink planted as debris must NEVER be followed for removal.
        const symlinkTarget = path.join(tmp, 'victim.txt');
        fs.writeFileSync(symlinkTarget, 'precious');
        const sym = path.join(tmp, 'teams.json.77777777-7777-7777-7777-777777777777');
        fs.symlinkSync(symlinkTarget, sym);
        fs.utimesSync(sym, oldT, oldT);

        const dry = storage.sweepTemps({ root: tmp, dryRun: true });
        const foundNames = dry.found.map(f => path.basename(f.file));
        report('gate C: dryRun finds aged debris (incl. nested), removes nothing',
            dry.dryRun === true && dry.removed === 0
            && foundNames.includes(path.basename(aged)) && foundNames.includes(path.basename(nested))
            && fs.existsSync(aged) && fs.existsSync(nested),
            `found=${JSON.stringify(foundNames)} removed=${dry.removed}`);
        report('gate C: fresh in-flight temp and bystander are never reported',
            !foundNames.includes(path.basename(fresh)) && !foundNames.includes('notes.md')
            && fs.existsSync(fresh) && fs.readFileSync(bystander, 'utf8') === 'keep me',
            `found=${JSON.stringify(foundNames)}`);
        report('gate C: symlink "debris" is skipped, victim untouched',
            fs.existsSync(sym) && fs.existsSync(symlinkTarget)
                && fs.readFileSync(symlinkTarget, 'utf8') === 'precious'
                && !foundNames.includes(path.basename(sym)),
            `symlink survived=${fs.existsSync(sym)}`);

        const real = storage.sweepTemps({ root: tmp, dryRun: false });
        report('gate C: real sweep removes exactly the aged debris (incl. nested)',
            real.removed === 2 && !fs.existsSync(aged) && !fs.existsSync(nested),
            `removed=${real.removed}`);
        report('gate C: fresh temp, bystander and symlink survive the sweep',
            fs.existsSync(fresh) && fs.existsSync(bystander) && fs.existsSync(sym)
                && fs.readFileSync(symlinkTarget, 'utf8') === 'precious',
            `fresh=${fs.existsSync(fresh)} bystander=${fs.existsSync(bystander)} sym=${fs.existsSync(sym)}`);
        fs.rmSync(tmp, { recursive: true, force: true });
    } catch (e) {
        report('gate C (debris janitor)', false, e.message);
    }

    // ============================================
    // GATE D — surfacing: health + MCP vant_lock stats
    // ============================================
    try {
        const health = require(path.join(ROOT, 'lib', 'health'));
        const h = health.getStackHealthStatus();
        report('gate D: health.lock.mutex exposes numeric counters',
            h.lock && h.lock.mutex && typeof h.lock.mutex.acquires === 'number'
                && typeof h.lock.mutex.aborted === 'number' && typeof h.lock.mutex.holdMsMax === 'number',
            JSON.stringify(h.lock && h.lock.mutex).slice(0, 100));
        report('gate D: health.lock.lease exposes numeric counters',
            h.lock && h.lock.lease && typeof h.lock.lease.granted === 'number',
            JSON.stringify(h.lock && h.lock.lease).slice(0, 100));
        report('gate D: health.debris is a report (scanned + found, no removal on a read path)',
            h.debris && typeof h.debris.scanned === 'number' && typeof h.debris.found === 'number',
            JSON.stringify(h.debris).slice(0, 100));

        const mcp = require(path.join(ROOT, 'lib', 'mcp'));
        const st = await mcp.execute('vant_lock', { action: 'stats' });
        report('gate D: MCP vant_lock stats → mutex + lease counters',
            st && st.action === 'stats' && st.mutex && typeof st.mutex.acquires === 'number'
                && st.lease && typeof st.lease.granted === 'number',
            JSON.stringify(st).slice(0, 120));
    } catch (e) {
        report('gate D (surfacing)', false, e.message);
    }

    // ============================================
    // Summary
    // ============================================
    fs.rmSync(BRAIN, { recursive: true, force: true });

    console.log(`\n--- RESULTS ---\n`);
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    console.log(`  Total:   ${results.passed + results.failed}`);
    process.exit(results.failed > 0 ? 1 : 0);
})().catch(e => {
    console.error('fatal:', e.message);
    fs.rmSync(BRAIN, { recursive: true, force: true });
    process.exit(1);
});
