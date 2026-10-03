#!/usr/bin/env node
/**
 * Cross-process habitat persistence tests (pass 97)
 *
 * Same class pass 95 fixed for agents.json and pass 96 for teams.json, still
 * live in habitat: save() writes the WHOLE in-memory snapshot (workspaces +
 * roles + boundaries + tokens) while the adopt-on-load only runs once at
 * instance restore — so two CLI processes that both hydrated before either
 * wrote clobber each other. Proven live pre-fix: 4 barrier-synced concurrent
 * createWorkspace processes persisted only 2 workspaces (default + 1).
 *
 * The fix (habitat.js): every save takes a short-lived lockfile beside the
 * persisted _habitat row, re-reads the row FRESH (bypassing the in-process
 * cache), and ADOPTS unseen newcomers. Ids this process has seen but no
 * longer holds are local deletes (tombstone) and are never resurrected.
 *
 * Gated here:
 *   A. 4 barrier-synced concurrent createWorkspace → all 4 land; lock released
 *   B. Tombstone: hydrate→removeRole→stale-snapshot write does NOT resurrect
 *      the removed member, while an unseen newcomer IS adopted and the local
 *      workspace is kept
 *
 * Run: node test/habitat-crossprocess.test.js
 * (scratch brain qc-habitat-gate wiped before and after)
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BRAIN = 'qc-habitat-gate';
const STATE_DIR = path.join(ROOT, 'models', 'private', BRAIN, 'state');
const STATE_FILE = path.join(STATE_DIR, '_habitat.json.md');
const LOCK_FILE = path.join(ROOT, 'models', 'private', BRAIN, '.habitat.lock');

const results = { passed: 0, failed: 0 };

function report(name, ok, err) {
    if (ok) { results.passed++; console.log(`  ✓ ${name}`); }
    else { results.failed++; console.log(`  ✗ ${name}: ${err || 'assertion failed'}`); }
}

// memory.state wraps the value: { value, expiresAt, storedAt }. recall()
// returns parsed.value, so unwrap to reach the habitat snapshot.
function readHabitat() {
    try {
        const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        return parsed && parsed.value ? parsed.value : parsed;
    } catch (e) { return { workspaces: {} }; }
}

function wipe() {
    fs.rmSync(path.join(ROOT, 'models', 'private', BRAIN), { recursive: true, force: true });
}

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
boot.init({ taskId: "habitat-gate", scopes: ["read", "write", "spawn", "execute"], debug: false });
const habitat = require("./lib/habitat");
const fs = require("fs");
const path = require("path");
const STATE_FILE = ${JSON.stringify(STATE_FILE)};
`;

(async () => {
    console.log('\n🏛  CROSS-PROCESS HABITAT TESTS\n');
    wipe();

    // ============================================
    // GATE A — concurrent createWorkspace all persist
    // ============================================
    try {
        // Barrier: every child hydrates (getSharedReady awaits restore), then
        // waits until a shared wall-clock instant to mutate+save. Without it
        // the spawns stagger enough to serialize by luck (bug timing-hidden).
        const START = Date.now() + 1400;
        const spawnScript = PRELUDE + `
const S = ${START};
(async () => {
    const h = await habitat.getSharedReady();
    while (Date.now() < S) {}
    const id = "gate-a-" + process.pid + "-" + Math.random().toString(36).slice(2, 6);
    h.createWorkspace(id);
    await h.flush();
    console.log("OK " + id);
    process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
`;
        const pending = [runChild(spawnScript), runChild(spawnScript), runChild(spawnScript), runChild(spawnScript)];
        const outs = await Promise.all(pending);
        const okCount = outs.filter(o => /OK gate-a-/.test(o)).length;
        const ws = Object.keys(readHabitat().workspaces || {});
        report('4 barrier-synced concurrent createWorkspace → 5 workspaces (default + 4; was 2 pre-fix)',
            okCount === 4 && ws.length === 5,
            `spawned=${okCount} persisted=${ws.length} [${ws.join(',')}]`);
        report('lock file released after saves', !fs.existsSync(LOCK_FILE));
    } catch (e) {
        report('gate A (concurrent createWorkspace)', false, e.message);
    }

    // ============================================
    // GATE B — tombstone + adoption semantics
    // ============================================
    try {
        wipe();
        await runChild(PRELUDE + `
(async () => {
    const h = await habitat.getSharedReady();
    h.createWorkspace("gate-b-ws");
    h.addRole("gate-b-ws", "viewer", "alice");
    await h.flush();
    process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
`);

        await runChild(PRELUDE + `
(async () => {
    const h = await habitat.getSharedReady();
    // Hydrate (alice enters _seenRoles), then remove her (tombstone).
    const before = h.roles["gate-b-ws"] && h.roles["gate-b-ws"].viewer;
    if (!before || !before.includes("alice")) throw new Error("alice not hydrated: " + JSON.stringify(before));
    h.removeRole("gate-b-ws", "viewer", "alice");
    // A crashed peer's STALE snapshot: removed alice resurrected + newcomer bob.
    const stale = {
        value: {
            workspaces: { "gate-b-ws": { id: "gate-b-ws", name: "gate-b-ws" } },
            roles: { "gate-b-ws": { admin: [], editor: [], viewer: ["alice", "bob"] } },
            boundaries: {}, tokens: {}, defaultWorkspace: "default", savedAt: Date.now()
        },
        expiresAt: Date.now() + 1e12, storedAt: Date.now()
    };
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(stale));
    // Any mutation triggers save → merge reads the planted disk:
    // adopt bob, tombstone-skip alice, keep our keeper.
    h.createWorkspace("gate-b-keeper");
    await h.flush();
    process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
`);
        const snap = readHabitat();
        const viewer = (snap.roles && snap.roles['gate-b-ws'] && snap.roles['gate-b-ws'].viewer) || [];
        const ws = Object.keys(snap.workspaces || {});
        report('removed role member NOT resurrected by stale peer snapshot', !viewer.includes('alice'), `viewer=${viewer}`);
        report('unseen newcomer (bob) adopted on save', viewer.includes('bob'), `viewer=${viewer}`);
        report('own workspace kept', ws.includes('gate-b-keeper'), `ws=${ws}`);
    } catch (e) {
        report('gate B (tombstone + adoption)', false, e.message);
    }

    console.log(`\n${results.passed} passed, ${results.failed} failed`);
    wipe();
    process.exit(results.failed > 0 ? 1 : 0);
})().catch(e => {
    console.error('fatal:', e.message);
    wipe();
    process.exit(1);
});
