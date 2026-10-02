#!/usr/bin/env node
/**
 * Cross-process org-model persistence tests (pass 96)
 *
 * Same class pass 95 fixed for agents.json, still live in teams.json:
 * _saveTeams() writes the WHOLE in-memory snapshot while the adopt-on-hydrate
 * merge only runs at module load — so two CLI processes that both hydrated
 * before either wrote clobber each other. Proven live: 4 concurrent
 * `createOrg` processes persisted only 1 org.
 *
 * The fix (teams.js): every save takes a short-lived lockfile in the orgchart
 * dir, re-reads the disk roster, and ADOPTS ids this process has never seen
 * (tracked in _seenKeys). Deletes stay authoritative — a deleted id is never
 * re-adopted (tombstone).
 *
 * Gated here:
 *   A. 4 barrier-synchronized concurrent createOrg → all 4 land, lock released
 *   B. Tombstone: hydrate→delete→stale-snapshot write does NOT resurrect the
 *      deleted org, while an unseen newcomer IS adopted and the own org kept
 *
 * Run: node test/teams-crossprocess.test.js
 * (scratch brain qc-teams-gate wiped before and after)
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BRAIN = 'qc-teams-gate';
const STORE = path.join(ROOT, 'models', 'private', BRAIN, 'orgchart', 'teams.json');

const results = { passed: 0, failed: 0 };

function report(name, ok, err) {
    if (ok) { results.passed++; console.log(`  ✓ ${name}`); }
    else { results.failed++; console.log(`  ✗ ${name}: ${err || 'assertion failed'}`); }
}

function readStore() {
    try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); }
    catch (e) { return { orgs: [] }; }
}

function wipe() {
    fs.rmSync(path.join(ROOT, 'models', 'private', BRAIN), { recursive: true, force: true });
}

// Spawn a child CLI-style process inside the scratch brain. Children INHERIT
// this process's env (so VANT_BRAIN travels without an explicit spread).
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
boot.init({ taskId: "teams-gate", scopes: ["read", "write", "spawn", "execute"], debug: false });
const teams = require("./lib/teams");
const fs = require("fs");
const path = require("path");
`;

const STORE_EXPR = `path.join("models", "private", ${JSON.stringify(BRAIN)}, "orgchart", "teams.json")`;

(async () => {
    console.log('\n🏛  CROSS-PROCESS ORG MODEL TESTS\n');
    wipe();

    // ============================================
    // GATE A — concurrent createOrg all persist
    // ============================================
    try {
        // Barrier: every child hydrates on require (empty), then waits until a
        // shared wall-clock instant to mutate+save. Without the barrier the
        // spawns stagger enough to serialize by luck (the bug is timing-hidden).
        const START = Date.now() + 1400;
        const spawnScript = PRELUDE + `
const S = ${START};
(async () => {
    while (Date.now() < S) {}
    const o = teams.createOrg("gate-a-" + process.pid + "-" + Math.random().toString(36).slice(2, 6));
    await teams.flush();
    console.log("OK " + (o && o.id));
    process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
`;
        const pending = [runChild(spawnScript), runChild(spawnScript), runChild(spawnScript), runChild(spawnScript)];
        const outs = await Promise.all(pending);
        const okCount = outs.filter(o => /OK org_/.test(o)).length;
        const orgs = readStore().orgs || [];
        report('4 barrier-synced concurrent createOrg → 4 orgs (was 1 pre-fix)',
            okCount === 4 && orgs.length === 4,
            `spawned=${okCount} persisted=${orgs.length}`);
        report('lock file released after saves', !fs.existsSync(STORE + '.lock'));
    } catch (e) {
        report('gate A (concurrent createOrg)', false, e.message);
    }

    // ============================================
    // GATE B — tombstone + adoption semantics
    // ============================================
    try {
        wipe();
        await runChild(PRELUDE + `
(async () => {
    const o = teams.createOrg("gate-b-victim");
    await teams.flush();
    console.log(o && o.id);
    process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
`);

        await runChild(PRELUDE + `
const STORE = ${STORE_EXPR};
(async () => {
    // Hydrate (victim enters _seenKeys), then delete it (tombstone).
    const listed = teams.listOrgs();
    const victim = listed.find(o => o.name === "gate-b-victim");
    if (!victim) throw new Error("victim not found after hydrate");
    teams.deleteOrg(victim.id);
    await teams.flush();
    // A crashed peer's STALE snapshot: the deleted victim resurrected + an
    // unknown newcomer Z.
    const stale = {
        orgs: [
            { id: victim.id, name: "gate-b-victim", desc: "", metadata: {}, created: Date.now() },
            { id: "org_gatebphantom0000000000000000000", name: "gate-b-phantom", desc: "", metadata: {}, created: Date.now() }
        ],
        depts: [], teams: [], roles: [], assignments: []
    };
    fs.writeFileSync(STORE, JSON.stringify(stale));
    // Any mutation triggers _saveTeams → merge reads the planted disk:
    // adopt Z, tombstone-skip victim, keep our own.
    teams.createOrg("gate-b-keeper");
    await teams.flush();
    process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
`);
        const names = (readStore().orgs || []).map(o => o.name);
        report('deleted org NOT resurrected by stale peer snapshot', !names.includes('gate-b-victim'), `names=${names}`);
        report('unseen newcomer (Z) adopted on save', names.includes('gate-b-phantom'), `names=${names}`);
        report('own org persisted', names.includes('gate-b-keeper'), `names=${names}`);
    } catch (e) {
        report('gate B (tombstone + adoption)', false, e.message);
    }

    // ============================================
    // Summary
    // ============================================
    console.log(`\n${results.passed} passed, ${results.failed} failed`);
    wipe();
    process.exit(results.failed > 0 ? 1 : 0);
})().catch(e => {
    console.error('fatal:', e.message);
    wipe();
    process.exit(1);
});
