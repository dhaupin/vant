#!/usr/bin/env node
/**
 * Cross-process state-store persistence tests (pass 98)
 *
 * The agents/teams/habitat whole-snapshot race, generalized: lib/state-store's
 * consensus / market / node-registry / settlement all hydrate once with
 * "in-memory wins" and write their WHOLE snapshot on every mutation — so two
 * processes that hydrated before either wrote clobbered each other. Fixed by
 * stateStore.persistMerged(): lock (lib/lock), re-read the on-disk snapshot,
 * adopt unseen rows, write the union. Delete-capable modules (node-registry
 * unregister, consensus reap) track a seen-set so a local delete is NOT
 * resurrected by a peer's stale snapshot.
 *
 * Gated here:
 *   A. 4 barrier-synced concurrent node-registry.register → 4 peers persist
 *   B. node-registry tombstone: hydrate→unregister→stale snapshot does NOT
 *      resurrect the removed node, while an unseen newcomer IS adopted
 *   C. 4 barrier-synced concurrent consensus.create → 4 topics persist
 *
 * Run: node test/state-store-crossprocess.test.js
 * (scratch brain qc-state-store-gate wiped before and after)
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BRAIN = 'qc-state-store-gate';
const DIR = path.join(ROOT, 'models', 'private', BRAIN);
const NODE_STATE = path.join(DIR, 'state', 'node-registry.json');
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
        r.stdout.on('data', d => { out += d; });
        r.stderr.on('data', d => { err += d; });
        const killer = setTimeout(() => { r.kill('SIGKILL'); }, 30000);
        r.on('close', code => {
            clearTimeout(killer);
            if (code === 0) resolve(out);
            else reject(new Error('child exit ' + code + ': ' + (err || out || 'no output')));
        });
    });
}

const PRELUDE = `
const boot = require("./lib/boot");
boot.init({ taskId: "ss-gate", scopes: ["read", "write", "spawn", "execute"], debug: false });
const fs = require("fs");
const path = require("path");
`;

(async () => {
    console.log('\n🗄  CROSS-PROCESS STATE-STORE TESTS\n');
    wipe();

    // ============================================
    // GATE A — concurrent node-registry.register
    // ============================================
    try {
        const START = Date.now() + 1400;
        const script = PRELUDE + `
const registry = require("./lib/node-registry");
const S = ${START};
(async () => {
    while (Date.now() < S) {}
    registry.register({ id: "gate-a-" + process.pid, host: "localhost", port: 3000 + (process.pid % 500) });
    console.log("OK");
    process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
`;
        const outs = await Promise.all([runChild(script), runChild(script), runChild(script), runChild(script)]);
        const okCount = outs.filter(o => /OK/.test(o)).length;
        const nodes = readJson(NODE_STATE).nodes || [];
        report('4 barrier-synced concurrent register → 4 peers (was 1 pre-fix)',
            okCount === 4 && nodes.length === 4,
            `registered=${okCount} persisted=${nodes.length} [${nodes.map(n => n.id).join(',')}]`);
    } catch (e) {
        report('gate A (concurrent register)', false, e.message);
    }

    // ============================================
    // GATE B — node-registry tombstone + adoption
    // ============================================
    try {
        wipe();
        await runChild(PRELUDE + `
const registry = require("./lib/node-registry");
registry.register({ id: "gate-b-victim", host: "localhost", port: 3999 });
process.exit(0);
`);

        await runChild(PRELUDE + `
const registry = require("./lib/node-registry");
const NODE_STATE = ${JSON.stringify(NODE_STATE)};
// Hydrate (victim enters _seenNodes), then unregister it (tombstone).
const listed = registry.list().map(n => n.id);
if (!listed.includes("gate-b-victim")) throw new Error("victim not hydrated: " + JSON.stringify(listed));
registry.unregister("gate-b-victim");
// A crashed peer's STALE snapshot: removed victim resurrected + newcomer Y.
fs.mkdirSync(path.dirname(NODE_STATE), { recursive: true });
fs.writeFileSync(NODE_STATE, JSON.stringify({
    kind: "vant-protocol-state", module: "node-registry",
    nodes: [
        { id: "gate-b-victim", host: "localhost", port: 3999, name: "gate-b-victim", status: "alive", lastSeen: Date.now() },
        { id: "gate-b-phantom", host: "localhost", port: 3998, name: "gate-b-phantom", status: "alive", lastSeen: Date.now() }
    ],
    savedAt: Date.now()
}));
// A mutation triggers persistMerged → adopt Y, tombstone-skip victim, keep Z.
registry.register({ id: "gate-b-keeper", host: "localhost", port: 3997 });
process.exit(0);
`);
        const ids = (readJson(NODE_STATE).nodes || []).map(n => n.id);
        report('unregistered node NOT resurrected by stale peer snapshot', !ids.includes('gate-b-victim'), `ids=${ids}`);
        report('unseen newcomer (Y) adopted on save', ids.includes('gate-b-phantom'), `ids=${ids}`);
        report('own node persisted', ids.includes('gate-b-keeper'), `ids=${ids}`);
    } catch (e) {
        report('gate B (tombstone + adoption)', false, e.message);
    }

    // ============================================
    // GATE C — concurrent consensus.create
    // ============================================
    try {
        wipe();
        const START = Date.now() + 1400;
        const script = PRELUDE + `
const consensus = require("./lib/consensus");
const S = ${START};
(async () => {
    while (Date.now() < S) {}
    const r = await consensus.create("gate-c-" + process.pid, { options: ["yes", "no"], minQuorum: 1 });
    if (!r || !r.topic) throw new Error("create failed: " + JSON.stringify(r));
    console.log("OK");
    process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
`;
        const outs = await Promise.all([runChild(script), runChild(script), runChild(script), runChild(script)]);
        const okCount = outs.filter(o => /OK/.test(o)).length;
        const ledgers = readJson(CONSENSUS_STATE).ledgers || [];
        report('4 barrier-synced concurrent consensus.create → 4 topics (was 1 pre-fix)',
            okCount === 4 && ledgers.length === 4,
            `created=${okCount} persisted=${ledgers.length} [${ledgers.map(l => l.topic).join(',')}]`);
    } catch (e) {
        report('gate C (concurrent consensus.create)', false, e.message);
    }

    console.log(`\n${results.passed} passed, ${results.failed} failed`);
    wipe();
    process.exit(results.failed > 0 ? 1 : 0);
})().catch(e => {
    console.error('fatal:', e.message);
    wipe();
    process.exit(1);
});
