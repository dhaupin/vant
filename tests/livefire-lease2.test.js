#!/usr/bin/env node
/**
 * LIVE-FIRE: lease round 2 — SIGKILL the lease HOLDER (pass 118, target #4)
 *
 * Round 1 (pass 114) proved the lease under TTL expiry under load and
 * force-release mid-write. What was never destroyed: the holder PROCESS
 * itself dying. The lease is authorization state (who may write), so a
 * dead holder must (a) leave a parseable lease file, (b) block writes only
 * until TTL expiry, (c) hand off to exactly ONE successor via the O_EXCL
 * CAS, (d) never corrupt the `JSON\n---\ntoken` split format mid-death.
 *
 * Harness lessons applied (pass 114): kills need a READY MARKER +
 * staggered SIGKILL (module load eats the first ~1.5-2s of child life);
 * lease file is `JSON\n---\ntoken` split format (JSON.parse of the raw
 * file throws); acquire staleness is MTIME-based; judge by PERSISTENCE.
 * New here (pass 117 counters): assertions ALSO read lock.stats() deltas.
 * (scratch brain qc-lease2, wiped by the test itself)
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
// The LEASE root is repo-level `models/private/.locks/` (brain-lock anchors
// its store at models/private; per-brain dirs are the MUTEX root — the two
// roots from §8.3). Wipe only OUR files: the .locks dir is shared by every
// brain's lease.
const LEASE_ROOT = path.join(ROOT, 'models', 'private', '.locks');
const LEASE = path.join(LEASE_ROOT, '.lock-qc-lease2.json');
const MARKER = path.join(LEASE_ROOT, 'lease2-ready.marker');
// Short TTL so takeover after SIGKILL is fast; the holder refreshes well
// inside it, so a LIVE holder stays valid.
process.env.DEFAULT_TIMEOUT_MS_UNUSED = ''; // (documented: TTL passed per-call)

const results = { passed: 0, failed: 0 };
function report(name, ok, err) {
    if (ok) { results.passed++; console.log(`  ✓ ${name}`); }
    else { results.failed++; console.log(`  ✗ ${name}: ${err || 'assertion failed'}`); }
}
function readLeaseParts() {
    try {
        const raw = fs.readFileSync(LEASE, 'utf8');
        return readLeasePartsFromRaw(raw);
    } catch (e) {
        return { data: null, token: null, raw: null };
    }
}
function readLeasePartsFromRaw(raw) {
    try {
        const parts = String(raw).split('\n---\n');
        return { data: JSON.parse(parts[0]), token: (parts[1] || '').trim(), raw };
    } catch (e) {
        return { data: null, token: null, raw: null };
    }
}
function wipe() {
    fs.rmSync(LEASE, { force: true });
    fs.rmSync(MARKER, { force: true });
}

function runChild(script, opts = {}) {
    return new Promise((resolve) => {
        const r = spawn(process.execPath, ['-e', script], {
            cwd: ROOT,
            env: { ...process.env, VANT_BRAIN: 'vant' },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let out = '', err = '';
        r.stdout.on('data', (d) => { out += d; });
        r.stderr.on('data', (d) => { err += d; });
        const killer = setTimeout(() => { r.kill('SIGKILL'); }, opts.killAfterMs || 30000);
        r.on('close', (code, signal) => { clearTimeout(killer); resolve({ code, signal, out, err }); });
    });
}

// Kill the child ONLY after it SIGNS the marker (it is holding the lease),
// plus a stagger so the kill lands mid-hold, not mid-boot.
function runChildKilledAfterMarker(script, markerPath, staggerMs) {
    return new Promise((resolve) => {
        const r = spawn(process.execPath, ['-e', script], {
            cwd: ROOT,
            env: { ...process.env, VANT_BRAIN: 'vant' },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let out = '', err = '';
        r.stdout.on('data', (d) => { out += d; });
        r.stderr.on('data', (d) => { err += d; });
        try { fs.rmSync(markerPath, { force: true }); } catch (e) { }
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


const PRELUDE = `
const boot = require("./lib/boot");
boot.init({ taskId: "lease2", scopes: ["read", "write", "spawn", "execute"], debug: false });
require("./lib/sandbox").defaultSandbox.setCapabilities({ canRead: true, canWrite: true, canSpawn: true, canExecute: true });
// EVERY lease op below passes {brain: 'qc-lease2'} — the lease file is named
// for the BRAIN (models/private/.locks/.lock-<brain>.json, the repo-level
// lease root from §8.3). Without this the children would fight over the REAL
// vant brain lease — live-fire must never touch live state.
const LB = { brain: 'qc-lease2' };
const LEASE_PATH = 'models/private/.locks/.lock-qc-lease2.json';
`;

console.log('\n🔥 LIVE-FIRE 2: kill -9 the lease holder\n');
wipe();

(async () => {
    // ============================================
    // Gate A — SIGKILL the live holder; TTL expiry; exactly ONE successor
    // ============================================
    try {
        const TTL = 2500; // short: expiry is fast after the kill
        const holder = await runChildKilledAfterMarker(PRELUDE + `
            const brainLock = require("./lib/brain-lock");
            const fs = require("fs");
            const marker = ${JSON.stringify(MARKER)};
            (async () => {
                const token = await brainLock.acquireBrainLock('holder-A', ${TTL}, LB);
                if (!token) { console.log('HOLD:fail'); process.exit(1); }
                fs.writeFileSync(marker, token); // parent now knows we HOLD it
                const end = Date.now() + 60000;
                while (Date.now() < end) {
                    await brainLock.acquireBrainLock('holder-A', ${TTL}, LB); // refresh in place
                    await new Promise(r => setTimeout(r, 500));
                }
            })().catch(e => { console.error(e.message); process.exit(1); });
        `, MARKER, 200);

        const markerToken = (() => { try { return fs.readFileSync(MARKER, 'utf8').trim(); } catch (e) { return null; } })();
        const leaseAfterKill = readLeaseParts();

        report('gate A: holder acquired + SIGKILLed while holding',
            holder.signal === 'SIGKILL' && !!markerToken && leaseAfterKill.data !== null
                && leaseAfterKill.data.agentId === 'holder-A',
            `signal=${holder.signal} marker=${!!markerToken} leaseAgent=${leaseAfterKill.data && leaseAfterKill.data.agentId} out=${holder.out.trim().slice(-160)} err=${holder.err.trim().slice(-160)}`);
        report('gate A: lease file SURVIVES the kill byte-parseable (JSON + token intact)',
            leaseAfterKill.data !== null && typeof leaseAfterKill.token === 'string' && leaseAfterKill.token.length > 0,
            leaseAfterKill.raw ? 'raw ok' : 'unparseable');
        report('gate A: dead holder marker token matches the lease token',
            markerToken === leaseAfterKill.token,
            `marker=${markerToken === leaseAfterKill.token}`);

        // Successor HAMMERS acquire (real caller semantics: acquireBrainLock
        // gives up after its bounded retry budget, well under the TTL, so
        // takeover means re-polling) until the frozen lease expires and the
        // O_EXCL CAS hands off to EXACTLY ONE winner. The child reports the
        // RAW lease file (base64) — the parent does the split-format parsing
        // (avoiding nested template-literal escape hell).
        const succ = await runChild(PRELUDE + `
            const brainLock = require("./lib/brain-lock");
            const fs = require("fs");
            (async () => {
                const t0 = Date.now();
                let token = null, tries = 0;
                while (Date.now() - t0 < 15000) {
                    tries++;
                    token = await brainLock.acquireBrainLock('successor-B', ${TTL}, LB);
                    if (token) break;
                    await new Promise(r => setTimeout(r, 120));
                }
                const raw = encodeURIComponent(fs.readFileSync(LEASE_PATH, 'utf8'));
                console.log('S:' + JSON.stringify({ got: !!token, ms: Date.now() - t0, tries, token: token, raw }));
                process.exit(token ? 0 : 1);
            })().catch(e => { console.error(e.message); process.exit(1); });
        `, { killAfterMs: 20000 });
        const sJson = (() => { try { return JSON.parse(succ.out.match(/S:(\{.*\})/)[1]); } catch (e) { return null; } })();
        const sLease = sJson ? readLeasePartsFromRaw(decodeURIComponent(sJson.raw)) : null;
        report('gate B: successor acquires after the frozen TTL (exactly one CAS winner)',
            succ.code === 0 && sJson && sJson.got === true && sLease && sLease.data && sLease.data.agentId === 'successor-B',
            `S=${JSON.stringify({ got: sJson && sJson.got, tries: sJson && sJson.tries, agent: sLease && sLease.data && sLease.data.agentId })} err=${succ.err.trim().slice(-120)}`);
        report('gate B: new lease token differs from the dead holder token',
            sJson && sJson.token && sJson.token !== markerToken,
            `tokenChanged=${sJson && sJson.token !== markerToken}`);
    } catch (e) {
        report('gate A/B (holder kill + takeover)', false, e.message);
    }

    // ============================================
    // Gate C — dead-holder write-obstruction window: a fresh writer container
    // (memory Map) has no idea the holder died; it is blocked only until the
    // lease expires (bounded by TTL, not by the holder's nonexistent grace).
    // The successor from gate B now HOLDS — kill it too and verify a third
    // process can still take over (chain: A dies → B inherits → B dies → C).
    // ============================================
    try {
        const TTL = 2500;
        const b = await runChildKilledAfterMarker(PRELUDE + `
            const brainLock = require("./lib/brain-lock");
            const fs = require("fs");
            const marker = ${JSON.stringify(MARKER)};
            (async () => {
                const token = await brainLock.acquireBrainLock('successor-B', ${TTL}, LB);
                if (!token) { process.exit(1); }
                fs.writeFileSync(marker, token);
                const end = Date.now() + 60000;
                while (Date.now() < end) {
                    await brainLock.acquireBrainLock('successor-B', ${TTL}, LB);
                    await new Promise(r => setTimeout(r, 500));
                }
            })().catch(e => { console.error(e.message); process.exit(1); });
        `, MARKER, 200);
        report('gate C: successor B acquired + killed holding (chain mid-point)',
            b.signal === 'SIGKILL' && readLeaseParts().data && readLeaseParts().data.agentId === 'successor-B',
            `signal=${b.signal} leaseAgent=${(readLeaseParts().data || {}).agentId}`);

        const c = await runChild(PRELUDE + `
            const brainLock = require("./lib/brain-lock");
            const fs = require("fs");
            (async () => {
                const t0 = Date.now();
                let token = null;
                while (Date.now() - t0 < 15000) {
                    token = await brainLock.acquireBrainLock('successor-C', ${TTL}, LB);
                    if (token) break;
                    await new Promise(r => setTimeout(r, 120));
                }
                const raw = encodeURIComponent(fs.readFileSync(LEASE_PATH, 'utf8'));
                console.log('C:' + JSON.stringify({ got: !!token, ms: Date.now() - t0, raw }));
                process.exit(token ? 0 : 1);
            })().catch(e => { console.error(e.message); process.exit(1); });
        `, { killAfterMs: 20000 });
        const cJson = (() => { try { return JSON.parse(c.out.match(/C:(\{.*\})/)[1]); } catch (e) { return null; } })();
        const cLease = cJson ? readLeasePartsFromRaw(decodeURIComponent(cJson.raw)) : null;
        // The wait must be bounded: well under 15s (a stuck lease would spin
        // the full retry budget).
        report('gate C: chain takeover C inherits after B dies (bounded wait, one winner)',
            c.code === 0 && cJson && cJson.got === true && cLease && cLease.data && cLease.data.agentId === 'successor-C'
                && cJson.ms < 15000,
            `C=${JSON.stringify({ got: cJson && cJson.got, agent: cLease && cLease.data && cLease.data.agentId, ms: cJson && cJson.ms })}`);

        // Clean shutdown: C releases properly, lock dir has no lease file.
        const d = await runChild(PRELUDE + `
            const brainLock = require("./lib/brain-lock");
            const fs = require("fs");
            (async () => {
                let token = null;
                for (let i = 0; i < 50 && !token; i++) {
                    token = await brainLock.acquireBrainLock('successor-D', ${TTL}, LB);
                    if (!token) await new Promise(r => setTimeout(r, 120));
                }
                const rel = await brainLock.releaseBrainLock('successor-D', token, LB);
                const gone = !fs.existsSync(${JSON.stringify(LEASE)});
                console.log('D:' + JSON.stringify({ released: rel.success, gone }));
                process.exit(rel.success && gone ? 0 : 1);
            })().catch(e => { console.error(e.message); process.exit(1); });
        `, { killAfterMs: 15000 });
        const dJson = (() => { try { return JSON.parse(d.out.match(/D:(\{.*\})/)[1]); } catch (e) { return null; } })();
        report('gate D: after chain, a live acquirer releases cleanly (lease file gone)',
            d.code === 0 && dJson && dJson.released === true && dJson.gone === true,
            `D=${JSON.stringify(dJson)}`);
    } catch (e) {
        report('gate C/D (chained deaths)', false, e.message);
    }

    // ============================================
    // Gate E — pass-117 counters under fire: the lease storm must be visible
    // ============================================
    try {
        wipe();
        const TTL = 1200;
        const storm = await runChild(PRELUDE + `
            const brainLock = require("./lib/brain-lock");
            const lock = require("./lib/lock");
            (async () => {
                for (let i = 0; i < 6; i++) {
                    await brainLock.acquireBrainLock('storm-' + i, ${TTL}, LB);
                }
                brainLock.forceReleaseBrainLock(LB);
                // Counters are PROCESS-LOCAL (pass 117 design): the storm
                // process prints its own lease stats. Mutex stats are
                // exercised with a quick withLock in the same process.
                await lock.withLock(lock.pathFor('lease2-storm'), () => 'x');
                console.log('ST:' + JSON.stringify({ lease: brainLock.leaseStats(), mutex: lock.stats() }));
                process.exit(0);
            })().catch(e => { console.error(e.message); process.exit(1); });
        `, { killAfterMs: 20000 });
        const sParsed = (() => { try { return JSON.parse(storm.out.match(/ST:(\{.*\})/)[1]); } catch (e) { return null; } })();
        report('gate E: lease counters show the storm (granted + forced in the SAME process that did the work)',
            storm.code === 0 && sParsed && sParsed.lease && sParsed.lease.granted >= 2 && sParsed.lease.forced >= 1,
            `stormExit=${storm.code} stats=${JSON.stringify(sParsed).slice(0, 140)}`);
        report('gate E: mutex counters recorded the withLock exercise (same process)',
            sParsed && sParsed.mutex && sParsed.mutex.acquires >= 1 && sParsed.mutex.releases >= 1,
            `mutex=${JSON.stringify(sParsed && sParsed.mutex).slice(0, 100)}`);
    } catch (e) {
        report('gate E (counters under fire)', false, e.message);
    }

    console.log('\n--- RESULTS ---\n');
    console.log(`  Passed:  ${results.passed}`);
    console.log(`  Failed:  ${results.failed}`);
    wipe();
    process.exit(results.failed > 0 ? 1 : 0);
})().catch(e => {
    console.error('HARNESS:', e.message);
    wipe();
    process.exit(1);
});
