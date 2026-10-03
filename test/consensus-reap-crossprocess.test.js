#!/usr/bin/env node
/**
 * Cross-process reap-tombstone tests for consensus (pass 99)
 *
 * A `reap` is a DELETE. Under the in-memory-wins merge, a peer process that
 * still holds the reaped topic would resurrect it on its next write (it
 * re-reads the disk, sees the topic gone, then re-serializes its own copy) —
 * exactly the "giant mess in a mesh" case. pass 99 persists the reap list
 * (`reaped: [{topic, at}]` in the consensus snapshot) and consults it in
 * `_mergeLedgers`/`_applyLedgers`, so a reap is CONVERGENT across processes:
 * any peer that persists after the reap adopts it and drops its held copy.
 *
 * Gated here:
 *   D. reap tombstone converges cross-process: a holder that persists AFTER
 *      a peer reaps does NOT resurrect the topic, the tombstone is persisted,
 *      and it survives a cold rehydrate (a fresh process).
 *   E. re-pull (mergeTopic) is the recovery path: it clears the persisted
 *      tombstone and re-adopts the topic.
 *
 * Run: node test/consensus-reap-crossprocess.test.js
 * (scratch brain qc-consensus-reap wiped before and after)
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BRAIN = 'qc-consensus-reap';
const DIR = path.join(ROOT, 'models', 'private', BRAIN);
const GATE = path.join(DIR, '.gate');
const CONSENSUS_STATE = path.join(DIR, 'state', 'consensus.json');

const results = { passed: 0, failed: 0 };

function report(name, ok, err) {
    if (ok) { results.passed++; console.log(`  ✓ ${name}`); }
    else { results.failed++; console.log(`  ✗ ${name}: ${err || 'assertion failed'}`); }
}
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return {}; } }
function wipe() { fs.rmSync(DIR, { recursive: true, force: true }); }

function runChild(script) {
    return new Promise((resolve, reject) => {
        const r = spawn(process.execPath, ['-e', script], {
            cwd: ROOT,
            env: { ...process.env, VANT_BRAIN: BRAIN },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let out = '', err = '';
        r.stdout.on('data', (d) => { out += d; });
        r.stderr.on('data', (d) => { err += d; });
        const killer = setTimeout(() => { r.kill('SIGKILL'); }, 30000);
        r.on('close', (code) => {
            clearTimeout(killer);
            if (code === 0) resolve(out);
            else reject(new Error('child exit ' + code + ': ' + (err || out || 'no output')));
        });
    });
}

const PRELUDE = `
const boot = require("./lib/boot");
boot.init({ taskId: "reap-gate", scopes: ["read", "write", "spawn", "execute"], debug: false });
const fs = require("fs");
const path = require("path");
const GATE = ${JSON.stringify(GATE)};
`;

const TOPIC = 'gate-d-topic';
// Wire-shaped seed snapshot (marks the ledger wire-born so the reaper may take it).
const WIRE = `{ topic: ${JSON.stringify(TOPIC)}, votes: { p1: { outcome: "x", signature: "s", ts: Date.now() } }, minQuorum: 2, from: "wire-peer" }`;

(async () => {
    console.log('\n🪦 CROSS-PROCESS CONSENSUS REAP-TOMBSTONE TESTS (pass 99)\n');
    wipe();
    fs.mkdirSync(GATE, { recursive: true });

    // ============================================
    // GATE D — reap tombstone converges; no resurrection across processes
    // ============================================
    try {
        // Seed a wire-born topic on disk.
        await runChild(PRELUDE + `
const consensus = require("./lib/consensus");
const r = consensus.mergeTopic(${WIRE});
if (!r || !r.merged) throw new Error("seed merge failed: " + JSON.stringify(r));
process.exit(0);
`);
        const seeded = (readJson(CONSENSUS_STATE).ledgers || []).map((l) => l.topic);
        report('seed: wire-born topic persists', seeded.includes(TOPIC), `ledgers=${seeded}`);

        const ready = path.join(GATE, 'ready');
        const reapDone = path.join(GATE, 'reap-done');

        // Holder: hydrates (holds the topic), signals ready, waits for the
        // peer's reap, THEN persists a fresh snapshot — the resurrection path.
        const holder = PRELUDE + `
const consensus = require("./lib/consensus");
const ready = ${JSON.stringify(ready)};
const reapDone = ${JSON.stringify(reapDone)};
if (!consensus.get(${JSON.stringify(TOPIC)})) throw new Error("holder did not hydrate the topic");
fs.writeFileSync(ready, "1");
const t0 = Date.now();
while (!fs.existsSync(reapDone)) { if (Date.now() - t0 > 15000) throw new Error("timeout waiting for reap"); }
consensus._persistNow(); // merge the peer's snapshot; must adopt the reap and drop our copy
console.log("HOLDER_HAS_T=" + (!!consensus.get(${JSON.stringify(TOPIC)})));
process.exit(0);
`;

        // Reaper: waits until the holder is holding, reaps, persists.
        const reaper = PRELUDE + `
const consensus = require("./lib/consensus");
const ready = ${JSON.stringify(ready)};
const reapDone = ${JSON.stringify(reapDone)};
const t0 = Date.now();
while (!fs.existsSync(ready)) { if (Date.now() - t0 > 15000) throw new Error("timeout waiting for holder"); }
const r = consensus.reapSynced(() => true);
if (!r.includes(${JSON.stringify(TOPIC)})) throw new Error("reaper did not take the topic: " + JSON.stringify(r));
fs.writeFileSync(reapDone, "1");
console.log("REAPED=" + JSON.stringify(r));
process.exit(0);
`;

        const outputs = await Promise.all([runChild(holder), runChild(reaper)]);
        const holderOut = outputs[0] || '';
        report('holder process dropped the reaped topic (no resurrection)',
            /HOLDER_HAS_T=false/.test(holderOut),
            `holder output: ${holderOut.trim()}`);

        const disk = readJson(CONSENSUS_STATE);
        const topics = (disk.ledgers || []).map((l) => l.topic);
        const reaped = (disk.reaped || []).map((r) => r && r.topic);
        report('reaped topic is gone from the persisted ledger set', !topics.includes(TOPIC), `ledgers=${topics}`);
        report('reap tombstone is persisted to disk', reaped.includes(TOPIC), `reaped=${reaped}`);

        // Cold rehydrate: a FRESH process must not adopt the reaped topic.
        const cold = await runChild(PRELUDE + `
const consensus = require("./lib/consensus");
console.log("COLD_HAS_T=" + (!!consensus.get(${JSON.stringify(TOPIC)})));
process.exit(0);
`);
        report('tombstone survives a cold rehydrate (fresh process)', /COLD_HAS_T=false/.test(cold), `cold output: ${cold.trim()}`);
    } catch (e) {
        report('gate D (cross-process reap tombstone)', false, e.message);
    }

    // ============================================
    // GATE E — re-pull clears the persisted tombstone (recovery path)
    // ============================================
    try {
        wipe();
        const out = await runChild(PRELUDE + `
const consensus = require("./lib/consensus");
consensus.mergeTopic(${WIRE});
const reaped = consensus.reapSynced(() => true);
if (!reaped.includes(${JSON.stringify(TOPIC)})) throw new Error("did not reap: " + JSON.stringify(reaped));
const back = consensus.mergeTopic(${WIRE});
if (!back || !back.merged || !consensus.get(${JSON.stringify(TOPIC)})) throw new Error("re-pull failed: " + JSON.stringify(back));
console.log("OK");
process.exit(0);
`);
        const disk = readJson(CONSENSUS_STATE);
        const reaped = (disk.reaped || []).map((r) => r && r.topic);
        const topics = (disk.ledgers || []).map((l) => l.topic);
        report('re-pull re-adopts the topic and clears the tombstone',
            /OK/.test(out) && topics.includes(TOPIC) && !reaped.includes(TOPIC),
            `ledgers=${topics} reaped=${reaped}`);
    } catch (e) {
        report('gate E (re-pull recovery)', false, e.message);
    }

    console.log(`\n${results.passed} passed, ${results.failed} failed`);
    wipe();
    process.exit(results.failed > 0 ? 1 : 0);
})().catch((e) => {
    console.error('fatal:', e.message);
    wipe();
    process.exit(1);
});
